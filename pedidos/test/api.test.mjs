// Pruebas de punta a punta contra el servidor real (sin dependencias).
// Cada corrida usa una base temporal y una carta abierta las 24 horas, para que
// el resultado no dependa de la hora en que se ejecute.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
let srv, B, dir, cookie = '';

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pedidos-test-'));
  const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed/gassuso.json'), 'utf8'));
  for (const d of '0123456') seed.local.horario[d] = ['00:00', '00:00'];
  seed.local.despacho = { activo: true, costo: 0, minimo: 0, zona: '', horario: Object.fromEntries([...'0123456'].map((d) => [d, ['00:00', '00:00']])) };
  fs.writeFileSync(path.join(dir, 'seed.json'), JSON.stringify(seed));
  srv = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], {
    cwd: ROOT,
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', DATA_DIR: path.join(dir, 'data'), SEED_FILE: path.join(dir, 'seed.json'), PANEL_PASSWORD: 'clave-de-prueba', ADMIN_PASSWORD: 'admin-de-prueba', SESSION_SECRET: 'x'.repeat(64) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  B = await new Promise((ok, fail) => {
    srv.stdout.on('data', (d) => { const m = /http:\/\/([\d.]+:\d+)/.exec(String(d)); if (m) ok(`http://${m[1]}`); });
    srv.on('exit', (c) => fail(new Error(`el servidor terminó con código ${c}`)));
  });
});
after(() => { srv?.kill(); fs.rmSync(dir, { recursive: true, force: true }); });

async function req(method, p, body, headers = {}) {
  const raw = body instanceof Uint8Array;
  const r = await fetch(B + p, {
    method, redirect: 'manual',
    // IP distinta por solicitud para no gatillar los límites de uso, salvo en sus propias pruebas.
    headers: { 'cf-connecting-ip': `10.0.${Math.random() * 255 | 0}.${Math.random() * 255 | 0}`, ...(body && !raw ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, body: json, headers: r.headers };
}
const menu = async () => (await req('GET', '/api/locales/gassuso')).body;
const prod = async (nombre) => (await menu()).categorias.flatMap((c) => c.productos).find((p) => p.nombre === nombre);
const pedir = (items, extra = {}) => req('POST', '/api/locales/gassuso/pedidos', { cliente: 'Ana', telefono: '+56 9 1111 2222', franja: 'Lo antes posible', items, ...extra });
const login = async () => { cookie = ''; return req('POST', '/api/panel/login', { slug: 'gassuso', password: 'clave-de-prueba' }); };

// ---------- carta ----------
test('la carta trae categorías, productos con foto y "los más pedidos"', async () => {
  const m = await menu();
  assert.equal(m.local.nombre, 'Gassuso');
  assert.ok(m.categorias.length >= 4);
  const barros = m.categorias.flatMap((c) => c.productos).find((p) => p.nombre === 'Barros Luco');
  assert.equal(barros.precio, 5790);
  assert.match(barros.imagen, /^\/img\/[\w-]+\.webp$/);
  assert.ok(m.mas_pedidos.length > 0);
  const img = await fetch(B + barros.imagen);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/webp');
});

test('rutas de páginas y archivos', async () => {
  assert.equal((await req('GET', '/gassuso')).status, 200);
  assert.equal((await req('GET', '/panel')).status, 200);
  assert.equal((await req('GET', '/no-existe')).status, 404);
  assert.equal((await req('GET', '/')).status, 302);
  assert.equal((await req('GET', '/salud')).body, 'ok');
});

test('no se puede salir de la carpeta pública ni de la de fotos', async () => {
  for (const p of ['/../server.mjs', '/%2e%2e/server.mjs', '/img/../pedidos.db', '/img/..%2Fpedidos.db', '/api/../server.mjs']) {
    const r = await fetch(B + p);
    assert.notEqual(r.status, 200, p);
  }
});

// ---------- pedidos ----------
test('pedido válido: calcula el total en el servidor y numera por día', async () => {
  const italiano = await prod('Italiano');
  const r1 = await pedir([{ producto_id: italiano.id, cantidad: 2, precio: 1 }]); // el precio del cliente se ignora
  assert.equal(r1.status, 201);
  assert.equal(r1.body.total, italiano.precio * 2);
  const r2 = await pedir([{ producto_id: italiano.id, cantidad: 1 }]);
  assert.equal(r2.body.numero, r1.body.numero + 1);
});

test('rechaza datos de contacto faltantes y despacho sin dirección', async () => {
  const id = (await prod('Italiano')).id;
  assert.equal((await pedir([{ producto_id: id }], { cliente: '' })).status, 400);
  assert.equal((await pedir([{ producto_id: id }], { telefono: '123' })).status, 400);
  assert.equal((await pedir([{ producto_id: id }], { modalidad: 'despacho' })).status, 400);
  assert.equal((await pedir([{ producto_id: id }], { modalidad: 'despacho', direccion: 'Freire 145' })).status, 201);
});

test('exige la cantidad exacta de ingredientes en productos "+N ingr."', async () => {
  const p = await prod('Carne mechada + 2 ingr.');
  const ags = (await menu()).agregados;
  assert.equal((await pedir([{ producto_id: p.id, agregados: [ags[0].id] }])).status, 400);
  assert.equal((await pedir([{ producto_id: p.id, agregados: [ags[0].id, ags[1].id, ags[2].id] }])).status, 400);
  assert.equal((await pedir([{ producto_id: p.id, agregados: [ags[0].id, 99999] }])).status, 400);
  const ok = await pedir([{ producto_id: p.id, agregados: [ags[0].id, ags[1].id] }]);
  assert.equal(ok.status, 201);
});

test('no vende productos sin precio, inexistentes ni carros vacíos', async () => {
  assert.equal((await pedir([{ producto_id: (await prod('Vegetariano')).id }])).status, 400);
  assert.equal((await pedir([{ producto_id: 999999 }])).status, 400);
  assert.equal((await pedir([])).status, 400);
});

test('limita la cantidad por línea y rechaza franjas inventadas', async () => {
  const p = await prod('Italiano');
  const r = await pedir([{ producto_id: p.id, cantidad: 500 }]);
  assert.equal(r.body.total, p.precio * 20);
  // Una franja imposible a cualquier hora y en cualquier zona horaria.
  assert.equal((await pedir([{ producto_id: p.id }], { franja: '25:00–25:30' })).status, 400);
  assert.equal((await pedir([{ producto_id: p.id }], { franja: 'mañana' })).status, 400);
});

test('JSON inválido da 400 y un cuerpo enorme da 413', async () => {
  const bad = await fetch(B + '/api/locales/gassuso/pedidos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{nope' });
  assert.equal(bad.status, 400);
  const big = await fetch(B + '/api/locales/gassuso/pedidos', { method: 'POST', body: 'x'.repeat(100e3) });
  assert.equal(big.status, 413);
});

// ---------- panel ----------
test('el panel exige sesión y rechaza claves incorrectas', async () => {
  cookie = '';
  assert.equal((await req('GET', '/api/panel/pedidos')).status, 401);
  assert.equal((await req('POST', '/api/panel/login', { password: 'mala' })).status, 401);
  assert.equal((await req('POST', '/api/panel/login', { password: 'ñandú con tildes' })).status, 401);
  cookie = 'panel=1.9999999999999.firmafalsa';
  assert.equal((await req('GET', '/api/panel/pedidos')).status, 401);
  const r = await login();
  assert.equal(r.status, 200);
  assert.match(r.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
});

test('flujo de un pedido: aceptar, listo, cobrar en efectivo con vuelto', async () => {
  const p = await prod('Barros Luco');
  const { body: { id } } = await pedir([{ producto_id: p.id }]);
  await login();
  assert.equal((await req('PATCH', `/api/panel/pedidos/${id}`, { estado: 'preparacion' })).body.estado, 'preparacion');
  assert.equal((await req('PATCH', `/api/panel/pedidos/${id}`, { estado: 'listo' })).body.estado, 'listo');
  const falta = await req('PATCH', `/api/panel/pedidos/${id}`, { medio_pago: 'efectivo', recibido: 1000, estado: 'entregado' });
  assert.equal(falta.status, 400);
  const ok = await req('PATCH', `/api/panel/pedidos/${id}`, { medio_pago: 'efectivo', recibido: 10000, estado: 'entregado', folio_boleta: 'F-123' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.pagado, 1);
  assert.equal(ok.body.recibido, 10000);
  assert.equal(ok.body.folio_boleta, '123');
  assert.equal(ok.body.estado, 'entregado');
});

test('un pedido anulado no se puede cobrar y no ocupa cupo', async () => {
  const p = await prod('Italiano');
  const { body: { id } } = await pedir([{ producto_id: p.id }]);
  await login();
  await req('PATCH', `/api/panel/pedidos/${id}`, { estado: 'anulado' });
  assert.equal((await req('PATCH', `/api/panel/pedidos/${id}`, { medio_pago: 'tarjeta' })).status, 409);
  assert.equal((await req('PATCH', `/api/panel/pedidos/${id}`, { medio_pago: 'cheque' })).status, 409);
});

test('cambiar un precio queda en el historial y se ve en la carta', async () => {
  await login();
  const p = await prod('Alemán');
  assert.equal((await req('PATCH', `/api/panel/productos/${p.id}`, { precio: 2790 })).status, 200);
  assert.equal((await prod('Alemán')).precio, 2790);
  const h = (await req('GET', '/api/panel/historial')).body;
  assert.deepEqual([h[0].nombre, h[0].anterior, h[0].nuevo], ['Alemán', p.precio, 2790]);
  assert.equal((await req('PATCH', `/api/panel/productos/${p.id}`, { precio: -5 })).status, 400);
});

test('agotar un ingrediente lo saca de los pedidos', async () => {
  await login();
  const [a, b, c] = (await menu()).agregados;
  await req('PATCH', `/api/panel/agregados/${a.id}`, { disponible: false });
  const p = await prod('Carne mechada + 2 ingr.');
  assert.equal((await pedir([{ producto_id: p.id, agregados: [a.id, b.id] }])).status, 400);
  assert.equal((await pedir([{ producto_id: p.id, agregados: [b.id, c.id] }])).status, 201);
  await req('PATCH', `/api/panel/agregados/${a.id}`, { disponible: true });
});

test('fotos: acepta WebP, rechaza otros formatos, tamaño excesivo y sin sesión', async () => {
  const p = await prod('Cerdo a la plancha');
  const webp = new Uint8Array([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBPVP8 '), 0, 0, 0, 0]);
  cookie = '';
  assert.equal((await req('PUT', `/api/panel/productos/${p.id}/imagen`, webp)).status, 401);
  await login();
  assert.equal((await req('PUT', `/api/panel/productos/${p.id}/imagen`, new Uint8Array(Buffer.from('<svg/>')))).status, 415);
  assert.equal((await req('PUT', `/api/panel/productos/${p.id}/imagen`, new Uint8Array(700e3))).status, 413);
  const ok = await req('PUT', `/api/panel/productos/${p.id}/imagen`, webp);
  assert.equal(ok.status, 200);
  assert.equal((await fetch(B + ok.body.imagen)).status, 200);
  assert.equal((await prod('Cerdo a la plancha')).imagen, ok.body.imagen);
  assert.equal((await req('DELETE', `/api/panel/productos/${p.id}/imagen`)).body.imagen, null);
  assert.equal((await fetch(B + ok.body.imagen)).status, 404);
});

test('la caja del día suma solo lo cobrado y separa por medio de pago', async () => {
  await login();
  const d = (await req('GET', '/api/panel/pedidos')).body;
  const cobrados = d.pedidos.filter((p) => p.pagado && p.estado !== 'anulado');
  assert.ok(cobrados.length >= 1);
  assert.ok(cobrados.every((p) => ['efectivo', 'transferencia', 'tarjeta', 'otro'].includes(p.medio_pago)));
});

// ---------- endurecimiento ----------
test('cabeceras de seguridad y CSP con hash del script de la página', async () => {
  const r = await fetch(B + '/gassuso');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  const c = r.headers.get('content-security-policy');
  assert.match(c, /script-src 'self' 'sha256-[A-Za-z0-9+/=]+'/);
  assert.doesNotMatch(c, /script-src[^;]*unsafe-inline/);
  assert.match(c, /frame-ancestors 'none'/);
  assert.equal((await fetch(B + '/api/locales/gassuso')).headers.get('x-content-type-options'), 'nosniff');
});

test('frena fuerza bruta sobre la clave del panel', async () => {
  const ip = { 'cf-connecting-ip': '203.0.113.7' };
  const codigos = [];
  for (let i = 0; i < 10; i++) codigos.push((await req('POST', '/api/panel/login', { password: 'mala' }, ip)).status);
  assert.deepEqual(codigos.slice(0, 8), Array(8).fill(401));
  assert.equal(codigos[9], 429);
  // incluso la clave correcta espera: si no, el límite no protege nada
  assert.equal((await req('POST', '/api/panel/login', { password: 'clave-de-prueba' }, ip)).status, 429);
  assert.equal((await login()).status, 200); // otra IP no se ve afectada
});

test('frena pedidos en masa desde una misma IP', async () => {
  const id = (await prod('Italiano')).id, ip = { 'cf-connecting-ip': '203.0.113.9' };
  const codigos = [];
  for (let i = 0; i < 17; i++) codigos.push((await req('POST', '/api/locales/gassuso/pedidos', { cliente: 'Bot', telefono: '+56911112222', franja: 'Lo antes posible', items: [{ producto_id: id }] }, ip)).status);
  assert.equal(codigos.filter((c) => c === 201).length, 15);
  assert.equal(codigos.at(-1), 429);
});

test('hace un respaldo de la base al iniciar', () => {
  const dirB = path.join(dir, 'data', 'backups');
  const files = fs.readdirSync(dirB);
  assert.equal(files.length, 1);
  assert.match(files[0], /^pedidos-\d{4}-\d{2}-\d{2}\.db$/);
  assert.ok(fs.statSync(path.join(dirB, files[0])).size > 10e3);
});

// ---------- seguimiento ----------
test('seguimiento: el cliente ve el estado con su token, sin datos privados', async () => {
  const p = await prod('Chacarero');
  const r = await pedir([{ producto_id: p.id, cantidad: 2 }], { cliente: 'Ana María Pérez', modalidad: 'despacho', direccion: 'Freire 145' });
  assert.match(r.body.token, /^[\w-]{22}$/);
  const s1 = await req('GET', `/api/seguimiento/${r.body.token}`);
  assert.equal(s1.status, 200);
  assert.equal(s1.body.estado, 'nuevo');
  assert.equal(s1.body.cliente, 'Ana');
  assert.equal(s1.body.total, p.precio * 2);
  for (const k of ['telefono', 'direccion', 'id', 'token', 'medio_pago', 'notas']) assert.ok(!(k in s1.body), k);
  await login();
  await req('PATCH', `/api/panel/pedidos/${r.body.id}`, { estado: 'listo' });
  assert.equal((await req('GET', `/api/seguimiento/${r.body.token}`)).body.estado, 'listo');
  assert.equal((await req('GET', '/seguimiento')).status, 200);
});

test('seguimiento: tokens inválidos o inventados no revelan nada', async () => {
  assert.equal((await req('GET', '/api/seguimiento/abc')).status, 404);
  assert.equal((await req('GET', `/api/seguimiento/${'A'.repeat(22)}`)).status, 404);
  assert.equal((await req('GET', "/api/seguimiento/x' OR 1=1 --")).status, 404);
});

// ---------- venta de mostrador ----------
test('mostrador: venta cobrada al momento, con vuelto, entra a la caja como canal mostrador', async () => {
  await login();
  const a = await prod('Italiano'), b = await prod('Barros Luco');
  const total = a.precio * 2 + b.precio;
  const r = await req('POST', '/api/panel/venta', { items: [{ producto_id: a.id, cantidad: 2 }, { producto_id: b.id }], medio_pago: 'efectivo', recibido: 20000 });
  assert.equal(r.status, 201);
  assert.equal(r.body.total, total);
  assert.equal(r.body.vuelto, 20000 - total);
  const d = (await req('GET', '/api/panel/pedidos')).body;
  const v = d.pedidos.find((p) => p.id === r.body.id);
  assert.deepEqual([v.canal, v.estado, v.pagado, v.medio_pago, v.cliente], ['mostrador', 'entregado', 1, 'efectivo', 'Mostrador']);
});

test('mostrador: puede pasar a cocina, valida medio de pago, monto e ingredientes', async () => {
  await login();
  const a = await prod('Italiano'), m = await prod('Carne mechada + 2 ingr.');
  const r = await req('POST', '/api/panel/venta', { items: [{ producto_id: a.id }], medio_pago: 'tarjeta', cocina: true, cliente: 'Juan' });
  assert.equal(r.status, 201);
  const v = (await req('GET', '/api/panel/pedidos')).body.pedidos.find((p) => p.id === r.body.id);
  assert.deepEqual([v.estado, v.pagado, v.cliente], ['preparacion', 1, 'Juan']);
  assert.equal((await req('POST', '/api/panel/venta', { items: [{ producto_id: a.id }] })).status, 400);
  assert.equal((await req('POST', '/api/panel/venta', { items: [{ producto_id: a.id }], medio_pago: 'efectivo', recibido: 100 })).status, 400);
  assert.equal((await req('POST', '/api/panel/venta', { items: [{ producto_id: m.id }], medio_pago: 'tarjeta' })).status, 400);
  assert.equal((await req('POST', '/api/panel/venta', { items: [], medio_pago: 'tarjeta' })).status, 400);
  cookie = '';
  assert.equal((await req('POST', '/api/panel/venta', { items: [{ producto_id: a.id }], medio_pago: 'tarjeta' })).status, 401);
});

test('mostrador: ventas seguidas no chocan con el límite de pedidos web', async () => {
  await login();
  const a = await prod('Italiano');
  for (let i = 0; i < 3; i++) assert.equal((await req('POST', '/api/panel/venta', { items: [{ producto_id: a.id }], medio_pago: 'transferencia' })).status, 201);
});

test('CSP: el hash de cada script coincide con lo que calcula el navegador (aunque el HTML tenga CRLF)', async () => {
  const crypto = await import('node:crypto');
  for (const pagina of ['/gassuso', '/panel', '/seguimiento', '/comanda', '/carta-imprimible']) {
    const r = await fetch(B + pagina);
    const csp = r.headers.get('content-security-policy');
    // El navegador normaliza CRLF a LF antes de hashear el contenido del <script>.
    const html = (await r.text()).replace(/\r\n?/g, '\n');
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).filter((x) => x.trim());
    assert.ok(scripts.length, pagina);
    for (const sc of scripts) {
      const h = `'sha256-${crypto.createHash('sha256').update(sc).digest('base64')}'`;
      assert.ok(csp.includes(h), `${pagina}: falta ${h} en la CSP`);
    }
  }
});

// ---------- datos del local ----------
test('datos del local: se editan desde el panel, se validan y se ven en la carta', async () => {
  cookie = '';
  assert.equal((await req('PATCH', '/api/panel/local', { nombre: 'X' })).status, 401);
  await login();
  const r = await req('PATCH', '/api/panel/local', {
    whatsapp: '9 8765 4321', instagram: '@gassuso', direccion: 'Freire 145, Concepción', cupo_franja: 12,
    transferencia: { titular: 'Gassuso SpA', rut: '76.123.456-0', banco: 'Banco Estado', tipo: 'Cuenta vista', numero: '123-456-78', email: 'pagos@gassuso.cl' },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.whatsapp, '56987654321'); // celular chileno sin código → con 56
  const t = await req('PATCH', '/api/panel/local', { telefono: '+56 9 8450 6842' });
  assert.equal(t.status, 200);
  assert.equal(t.body.telefono, '56984506842');
  assert.equal((await req('PATCH', '/api/panel/local', { telefono: '12' })).status, 400);
  const m = await menu();
  assert.equal(m.local.instagram, 'gassuso');
  assert.equal(m.local.telefono, '56984506842');
  assert.equal(m.local.direccion, 'Freire 145, Concepción');
  assert.equal(m.local.transferencia.numero, '123-456-78');
  assert.equal((await req('PATCH', '/api/panel/local', { whatsapp: '123' })).status, 400);
  assert.equal((await req('PATCH', '/api/panel/local', { nombre: '   ' })).status, 400);
  assert.equal((await req('PATCH', '/api/panel/local', { cupo_franja: 0 })).status, 400);
  assert.equal((await req('PATCH', '/api/panel/local', { horario: { 1: ['25:00', '10:00'] } })).status, 400);
  assert.equal((await req('PATCH', '/api/panel/local', { horario: { 1: ['10:00', 'diez'] } })).status, 400);
  // apertura = cierre es abierto 24 h (así viene un local 24 h): debe poder guardarse
  assert.equal((await req('PATCH', '/api/panel/local', { horario: Object.fromEntries([...'0123456'].map((d) => [d, ['00:00', '00:00']])) })).status, 200);
  assert.equal((await req('GET', '/api/locales/gassuso/franjas')).body.abierto, true);
  // un intento de inyectar columnas no tiene efecto
  assert.equal((await req('PATCH', '/api/panel/local', { slug: 'otro', 'id=1; --': 1 })).status, 200);
  assert.equal((await req('GET', '/api/locales/gassuso')).status, 200);
});

test('datos del local: día cerrado sin horario y vuelta al horario de 24 h', async () => {
  await login();
  const todos = Object.fromEntries([...'0123456'].map((d) => [d, null]));
  await req('PATCH', '/api/panel/local', { horario: todos });
  const f = (await req('GET', '/api/locales/gassuso/franjas')).body;
  assert.equal(f.abierto, false);
  assert.equal(f.slots.length, 0);
  assert.equal((await pedir([{ producto_id: (await prod('Italiano')).id }])).status, 400);
  await req('PATCH', '/api/panel/local', { horario: Object.fromEntries([...'0123456'].map((d) => [d, ['00:00', '23:59']])) });
  assert.equal((await pedir([{ producto_id: (await prod('Italiano')).id }])).status, 201);
});

test('pausa: el local deja de recibir pedidos web, pero el mostrador sigue', async () => {
  await login();
  const id = (await prod('Italiano')).id;
  await req('PATCH', '/api/panel/local', { pausa: true });
  assert.equal((await menu()).local.pausa, true);
  const r = await pedir([{ producto_id: id }]);
  assert.equal(r.status, 400);
  assert.match(r.body.error, /paus/i);
  assert.equal((await req('POST', '/api/panel/venta', { items: [{ producto_id: id }], medio_pago: 'tarjeta' })).status, 201);
  await req('PATCH', '/api/panel/local', { pausa: false });
  assert.equal((await pedir([{ producto_id: id }])).status, 201);
});

test('seguimiento muestra los datos para transferir del local', async () => {
  const r = await pedir([{ producto_id: (await prod('Italiano')).id }]);
  const s = (await req('GET', `/api/seguimiento/${r.body.token}`)).body;
  assert.equal(s.local.transferencia.banco, 'Banco Estado');
});

// ---------- observaciones ----------
test('observación por producto y comentario general: se guardan limpios y acotados', async () => {
  const p = await prod('Italiano');
  const r = await pedir([
    { producto_id: p.id, cantidad: 1, nota: '  sin   tomate\n\u0000<b>ojo</b>  ' },
    { producto_id: p.id, cantidad: 1, nota: 'x'.repeat(500) },
    { producto_id: p.id, cantidad: 1 },
  ], { notas: 'Tocar el timbre dos veces' });
  assert.equal(r.status, 201);
  await login();
  const d = (await req('GET', `/api/panel/pedidos/${r.body.id}`)).body;
  assert.equal(d.items[0].nota, 'sin tomate <b>ojo</b>'); // se guarda como texto; el panel lo escapa al mostrar
  assert.equal(d.items[1].nota.length, 140);
  assert.equal(d.items[2].nota, null);
  assert.equal(d.notas, 'Tocar el timbre dos veces');
  const s = (await req('GET', `/api/seguimiento/${r.body.token}`)).body;
  assert.equal(s.items[0].nota, 'sin tomate <b>ojo</b>');
  const v = await req('POST', '/api/panel/venta', { items: [{ producto_id: p.id, nota: 'bien tostado' }], medio_pago: 'efectivo', recibido: 5000 });
  assert.equal((await req('GET', `/api/panel/pedidos/${v.body.id}`)).body.items[0].nota, 'bien tostado');
});

test('salsas: opcionales y gratis, no cuentan como ingrediente ni se ofrecen con bebidas', async () => {
  const m = await menu();
  const salsas = m.agregados.filter((a) => a.tipo === 'salsa');
  assert.deepEqual(salsas.map((a) => a.nombre), ['Mostaza', 'Ketchup', 'Ají receta Gassuso']);
  const it = await prod('Italiano'), lata = await prod('Bebida en lata 350 cc'), mech = await prod('Carne mechada + 2 ingr.');
  const ing = m.agregados.filter((a) => a.tipo !== 'salsa');
  const r = await pedir([
    { producto_id: it.id, cantidad: 2, salsas: [salsas[0].id, salsas[2].id, salsas[0].id] },
    { producto_id: mech.id, cantidad: 1, agregados: [ing[0].id, ing[1].id], salsas: [salsas[1].id] },
  ]);
  assert.equal(r.status, 201);
  assert.equal(r.body.total, it.precio * 2 + mech.precio); // las salsas no cobran
  // una salsa no reemplaza un ingrediente obligatorio
  assert.equal((await pedir([{ producto_id: mech.id, agregados: [ing[0].id, salsas[0].id] }])).status, 400);
  assert.equal((await pedir([{ producto_id: lata.id, salsas: [salsas[1].id] }])).status, 400);
  assert.equal((await pedir([{ producto_id: it.id, salsas: [ing[0].id] }])).status, 400);
  await login();
  const d = (await req('GET', `/api/panel/pedidos/${r.body.id}`)).body;
  assert.deepEqual(d.items[0].salsas, ['Mostaza', 'Ají receta Gassuso']);
  assert.deepEqual(d.items[1].salsas, ['Ketchup']);
  assert.deepEqual((await req('GET', `/api/seguimiento/${r.body.token}`)).body.items[0].salsas, ['Mostaza', 'Ají receta Gassuso']);
  // agotada desde el panel, deja de aceptarse
  await req('PATCH', `/api/panel/agregados/${salsas[2].id}`, { disponible: false });
  assert.equal((await pedir([{ producto_id: it.id, salsas: [salsas[2].id] }])).status, 400);
  await req('PATCH', `/api/panel/agregados/${salsas[2].id}`, { disponible: true });
  const v = await req('POST', '/api/panel/venta', { items: [{ producto_id: it.id, salsas: [salsas[1].id] }], medio_pago: 'efectivo', recibido: 10000 });
  assert.deepEqual((await req('GET', `/api/panel/pedidos/${v.body.id}`)).body.items[0].salsas, ['Ketchup']);
});

test('venta sugerida: productos marcados, editables y medidos en el resumen', async () => {
  const m = await menu();
  const sug = m.categorias.flatMap((c) => c.productos).filter((p) => p.sugerir).map((p) => p.nombre);
  assert.deepEqual(sug, ['Papas', 'Bebida en lata 350 cc', 'Jugo natural 500 ml', 'Batido de frutilla 500 ml']);
  await login();
  const antes = (await req('GET', '/api/panel/resumen')).body.sugeridos;
  const it = await prod('Italiano'), papas = await prod('Papas'), lata = await prod('Bebida en lata 350 cc');
  const r = await pedir([{ producto_id: it.id }, { producto_id: papas.id, sugerido: true }, { producto_id: lata.id, cantidad: 2, sugerido: 1 }]);
  assert.equal(r.status, 201);
  const despues = (await req('GET', '/api/panel/resumen')).body.sugeridos;
  assert.equal(despues.unidades - antes.unidades, 3);
  assert.equal(despues.ventas - antes.ventas, papas.precio + lata.precio * 2);
  // el local decide qué sugerir
  assert.equal((await req('PATCH', `/api/panel/productos/${lata.id}`, { sugerir: false })).status, 200);
  assert.equal((await prod('Bebida en lata 350 cc')).sugerir, 0);
  assert.equal((await prod('Bebida en lata 350 cc')).precio, lata.precio); // no toca el precio
  await req('PATCH', `/api/panel/productos/${lata.id}`, { sugerir: true });
});

test('despacho: solo en los días y horarios configurados, con costo y pedido mínimo', async () => {
  await login();
  const dias = (v) => Object.fromEntries([...'0123456'].map((d) => [d, v]));
  const conf = (d) => req('PATCH', '/api/panel/local', { despacho: { activo: true, costo: 1500, minimo: 5000, zona: 'Concepción centro', horario: dias(['00:00', '00:00']), ...d } });
  const it = await prod('Italiano'), ch = await prod('Chacarero');
  const despacho = (items, franja = 'Lo antes posible') => pedir(items, { modalidad: 'despacho', direccion: 'Freire 145', franja });
  // activo todo el día: cobra el despacho y exige el mínimo
  assert.equal((await conf()).status, 200);
  assert.equal((await menu()).local.despacho.costo, 1500);
  let f = (await req('GET', '/api/locales/gassuso/franjas')).body;
  assert.ok(f.despacho_ya && f.slots.every((x) => x.despacho));
  const r = await despacho([{ producto_id: ch.id }]);
  assert.equal(r.status, 201);
  assert.equal(r.body.total, ch.precio + 1500);
  await login();
  assert.equal((await req('GET', `/api/panel/pedidos/${r.body.id}`)).body.costo_despacho, 1500);
  assert.equal((await req('GET', `/api/seguimiento/${r.body.token}`)).body.costo_despacho, 1500);
  const chico = await despacho([{ producto_id: it.id }]);
  assert.equal(chico.status, 400);
  assert.match(chico.body.error, /mínimo/);
  // el retiro no paga despacho ni tiene mínimo
  assert.equal((await pedir([{ producto_id: it.id }])).body.total, it.precio);
  // solo una franja específica de hoy
  const s0 = f.slots[0].franja, [a, b] = s0.split('–');
  assert.equal((await conf({ horario: { ...dias(null), [new Date().getDay()]: [a, b] } })).status, 200);
  f = (await req('GET', '/api/locales/gassuso/franjas')).body;
  assert.equal(f.slots.find((x) => x.franja === s0).despacho, true);
  assert.ok(f.slots.filter((x) => x.franja !== s0).every((x) => !x.despacho));
  assert.equal((await despacho([{ producto_id: ch.id }], s0)).status, 201);
  if (f.slots[1]) assert.equal((await despacho([{ producto_id: ch.id }], f.slots[1].franja)).status, 400);
  // día sin despacho y despacho apagado
  await conf({ horario: dias(null) });
  assert.equal((await despacho([{ producto_id: ch.id }])).status, 400);
  await conf({ activo: false });
  f = (await req('GET', '/api/locales/gassuso/franjas')).body;
  assert.ok(!f.despacho_ya && f.slots.every((x) => !x.despacho));
  assert.equal((await despacho([{ producto_id: ch.id }])).status, 400);
  // validaciones
  assert.equal((await conf({ costo: -1 })).status, 400);
  assert.equal((await conf({ horario: { 1: ['25:00', '10:00'] } })).status, 400);
  // deja el despacho como venía (24 h, gratis) para el resto de las pruebas
  await req('PATCH', '/api/panel/local', { despacho: { activo: true, costo: 0, minimo: 0, horario: dias(['00:00', '00:00']) } });
});

test('antes del lanzamiento no se indexa nada', async () => {
  const r = await fetch(B + '/gassuso');
  assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(await (await fetch(B + '/robots.txt')).text(), 'User-agent: *\nDisallow: /\n');
});

test('material del local: cartel con QR y panel instalable en la tablet', async () => {
  for (const [ruta, tipo] of [['/cartel', 'text/html'], ['/qrcode.js', 'text/javascript'], ['/panel.webmanifest', 'application/manifest+json'], ['/icono-512.png', 'image/png']]) {
    const r = await fetch(B + ruta);
    assert.equal(r.status, 200, ruta);
    assert.ok(r.headers.get('content-type').startsWith(tipo), ruta);
  }
  assert.match(await (await fetch(B + '/panel')).text(), /rel="manifest"/);
});

test('editar la carta: categorías, productos nuevos, edición, orden y quitar', async () => {
  cookie = '';
  assert.equal((await req('POST', '/api/panel/productos', { nombre: 'X' })).status, 401);
  await login();
  const c = await req('POST', '/api/panel/categorias', { nombre: '  Promociones  ' });
  assert.equal(c.status, 201);
  assert.equal((await req('POST', '/api/panel/categorias', { nombre: '' })).status, 400);
  // producto nuevo: sin precio queda "sin precio"; con precio se puede vender al tiro
  assert.equal((await req('POST', '/api/panel/productos', { nombre: 'Sin cat' })).status, 400);
  const p1 = await req('POST', '/api/panel/productos', { categoria_id: c.body.id, nombre: 'Promo dúo', precio: 6990, descripcion: '2 italianos' });
  assert.equal(p1.status, 201);
  const p2 = (await req('POST', '/api/panel/productos', { categoria_id: c.body.id, nombre: 'Promo familiar' })).body;
  let cat = (await menu()).categorias.find((x) => x.id === c.body.id);
  assert.equal(cat.nombre, 'Promociones');
  assert.deepEqual(cat.productos.map((p) => [p.nombre, p.precio, p.precio_pendiente]), [['Promo dúo', 6990, 0], ['Promo familiar', 0, 1]]);
  assert.equal((await pedir([{ producto_id: p1.body.id }])).status, 201);
  assert.equal((await pedir([{ producto_id: p2.id }])).status, 400);
  // escribir el precio lo deja vendible; editar nombre, ingredientes e incluir en otra categoría
  assert.equal((await req('PATCH', `/api/panel/productos/${p2.id}`, { precio: 12990 })).status, 200);
  assert.equal((await pedir([{ producto_id: p2.id }])).status, 201);
  assert.equal((await req('PATCH', `/api/panel/productos/${p2.id}`, { nombre: '', })).status, 400);
  assert.equal((await req('PATCH', `/api/panel/productos/${p2.id}`, { incluye: 9 })).status, 400);
  assert.equal((await req('PATCH', `/api/panel/productos/${p2.id}`, { nombre: 'Promo familia', incluye: 2, destacado: true })).status, 200);
  // ordenar: sube el segundo
  assert.equal((await req('PATCH', `/api/panel/productos/${p2.id}`, { mover: -1 })).status, 200);
  cat = (await menu()).categorias.find((x) => x.id === c.body.id);
  assert.deepEqual(cat.productos.map((p) => [p.nombre, p.incluye, p.destacado]), [['Promo familia', 2, 1], ['Promo dúo', 0, 0]]);
  // renombrar categoría y apagar salsas
  assert.equal((await req('PATCH', `/api/panel/categorias/${c.body.id}`, { nombre: 'Promos', salsas: false })).status, 200);
  cat = (await menu()).categorias.find((x) => x.id === c.body.id);
  assert.equal(cat.nombre, 'Promos'); assert.equal(cat.salsas, 0);
  // quitar de la carta: desaparece y ya no se vende, pero los pedidos anteriores siguen
  assert.equal((await req('PATCH', `/api/panel/productos/${p1.body.id}`, { archivado: true })).status, 200);
  assert.ok(!(await menu()).categorias.flatMap((x) => x.productos).some((p) => p.id === p1.body.id));
  assert.equal((await pedir([{ producto_id: p1.body.id }])).status, 400);
  // otra cuenta no puede tocar productos ajenos (id inexistente)
  assert.equal((await req('PATCH', '/api/panel/productos/999999', { precio: 1 })).status, 404);
});

test('ingredientes y salsas: agregar, renombrar y quitar de la lista', async () => {
  await login();
  const r = await req('POST', '/api/panel/agregados', { nombre: 'Pimentón', tipo: 'ingrediente' });
  assert.equal(r.status, 201);
  assert.equal((await req('POST', '/api/panel/agregados', { nombre: 'pimentón' })).status, 400); // repetido
  assert.equal((await req('POST', '/api/panel/agregados', { nombre: 'Mayonesa', tipo: 'salsa' })).status, 201);
  let ag = (await menu()).agregados;
  assert.equal(ag.find((a) => a.id === r.body.id).tipo, 'ingrediente');
  assert.equal(ag.find((a) => a.nombre === 'Mayonesa').tipo, 'salsa');
  assert.equal((await req('PATCH', `/api/panel/agregados/${r.body.id}`, { nombre: 'Pimentón asado' })).status, 200);
  const mech = await prod('Carne mechada + 2 ingr.');
  const okp = await pedir([{ producto_id: mech.id, agregados: [r.body.id, ag.find((a) => a.nombre === 'Palta').id] }]);
  assert.equal(okp.status, 201);
  await req('PATCH', `/api/panel/agregados/${r.body.id}`, { archivado: true });
  ag = (await menu()).agregados;
  assert.ok(!ag.some((a) => a.id === r.body.id));
  assert.equal((await pedir([{ producto_id: mech.id, agregados: [r.body.id, ag.find((a) => a.nombre === 'Palta').id] }])).status, 400);
  await login();
  assert.deepEqual((await req('GET', `/api/panel/pedidos/${okp.body.id}`)).body.items[0].agregados, ['Pimentón asado', 'Palta']);
});

test('despacho por zonas: hexágonos con precio por distancia, ajustes y bloqueos', async () => {
  await login();
  const H = await import('../public/hex.js');
  const m0 = await menu(), o = m0.local.ubicacion;
  assert.ok(o && Math.abs(o.lat + 36.82) < 0.01);
  const dias = Object.fromEntries([...'0123456'].map((d) => [d, ['00:00', '00:00']]));
  const tam = 400, tramos = [{ hasta: 1500, costo: 1500 }, { hasta: 3000, costo: 2200 }];
  const lejos = H.centro(o, tam, 3, 0), bloq = H.centro(o, tam, 0, 1), fuera = H.centro(o, tam, 12, 0);
  const conf = { activo: true, costo: 999, minimo: 0, horario: dias, modo: 'zonas', tam, tramos, ajustes: { '0,1': null, '-1,0': 900 } };
  assert.equal((await req('PATCH', '/api/panel/local', { despacho: conf })).status, 200);
  const cot = async (p) => (await req('POST', '/api/locales/gassuso/cotizar', p)).body;
  assert.equal((await cot(o)).costo, 1500);
  assert.equal((await cot(lejos)).costo, 2200);
  assert.equal((await cot(bloq)).motivo, 'bloqueado');
  assert.equal((await cot(fuera)).motivo, 'lejos');
  assert.equal((await cot(H.centro(o, tam, -1, 0))).costo, 900);
  assert.equal((await cot({ lat: 'x' })).motivo, 'sin_ubicacion');
  // el pedido cobra lo que dice la zona, no lo que mande el navegador
  const ch = await prod('Chacarero');
  const pd = (u, extra = {}) => pedir([{ producto_id: ch.id }], { modalidad: 'despacho', direccion: 'Freire 145', ubicacion: u, costo_despacho: 0, ...extra });
  const r = await pd(lejos);
  assert.equal(r.status, 201);
  assert.equal(r.body.total, ch.precio + 2200);
  const det = (await req('GET', `/api/panel/pedidos/${r.body.id}`)).body;
  assert.equal(det.costo_despacho, 2200); assert.ok(Math.abs(det.lat - lejos.lat) < 1e-9 && det.distancia_m > 1500);
  assert.match((await pd(undefined)).body.error, /mapa/);
  assert.match((await pd(bloq)).body.error, /fuera de la zona/);
  assert.equal((await pd(fuera)).status, 400);
  // validaciones de la configuración y ubicación del local
  for (const malo of [{ ...conf, tramos: [] }, { ...conf, tramos: [{ hasta: 50, costo: 1 }] }, { ...conf, tam: 50 }, { ...conf, ajustes: { 'x': 1 } }, { ...conf, tramos: [{ hasta: 900, costo: 1 }, { hasta: 900, costo: 2 }] }])
    assert.equal((await req('PATCH', '/api/panel/local', { despacho: malo })).status, 400);
  assert.equal((await req('PATCH', '/api/panel/local', { ubicacion: { lat: 40, lng: -3 } })).status, 400);
  // la búsqueda de direcciones exige algo que buscar
  assert.equal((await req('GET', '/api/locales/gassuso/geo?q=ab')).status, 400);
  // vuelve al despacho fijo para el resto de las pruebas
  await req('PATCH', '/api/panel/local', { despacho: { activo: true, costo: 0, minimo: 0, horario: dias } });
});

test('vehículos: costo del viaje por pedido y resultado del despacho en el resumen', async () => {
  await login();
  const H = await import('../public/hex.js');
  const o = (await menu()).local.ubicacion;
  const dias = Object.fromEntries([...'0123456'].map((d) => [d, ['00:00', '00:00']]));
  const moto = { id: 'moto1', nombre: 'Moto', tipo: 'moto', rendimiento: 35, precioLitro: 1300, mantencionKm: 15, velocidad: 25, pagoHora: 4500, pagoViaje: 0, minEntrega: 5 };
  const calculo = { vehiculo: 'moto1', factor: 1.35, idaVuelta: true, margen: 15, redondeo: 100 };
  const conf = { activo: true, minimo: 0, horario: dias, modo: 'zonas', tam: 450, tramos: [{ hasta: 3000, costo: 2000 }], ajustes: {}, vehiculos: [moto], calculo };
  assert.equal((await req('PATCH', '/api/panel/local', { despacho: conf })).status, 200);
  const d = (await menu()).local.despacho;
  assert.equal(d.vehiculos[0].nombre, 'Moto'); assert.equal(d.calculo.vehiculo, 'moto1');
  // valores fuera de rango se rechazan
  assert.equal((await req('PATCH', '/api/panel/local', { despacho: { ...conf, vehiculos: [{ ...moto, velocidad: 0 }] } })).status, 400);
  assert.equal((await req('PATCH', '/api/panel/local', { despacho: { ...conf, calculo: { ...calculo, factor: 9 } } })).status, 400);
  // el costo estimado del viaje queda en el pedido y el resumen lo compara con lo cobrado
  const antes = (await req('GET', '/api/panel/resumen')).body.despachos;
  const dest = H.centro(o, 450, 2, 0), ch = await prod('Chacarero');
  const r = await pedir([{ producto_id: ch.id }], { modalidad: 'despacho', direccion: 'X 1', ubicacion: dest });
  assert.equal(r.status, 201);
  const det = (await req('GET', `/api/panel/pedidos/${r.body.id}`)).body;
  const esperado = Math.round(H.costoViaje(moto, calculo, H.distancia(o, dest)).total);
  assert.equal(det.costo_viaje, esperado);
  const desp = (await req('GET', '/api/panel/resumen')).body.despachos;
  assert.equal(desp.pedidos - antes.pedidos, 1);
  assert.equal(desp.costo - antes.costo, esperado);
  assert.equal(desp.cobrado - antes.cobrado, 2000);
  // el cálculo compartido: más lejos cuesta más y el sugerido cubre costo + margen
  const c1 = H.costoViaje(moto, calculo, 1000).total, c3 = H.costoViaje(moto, calculo, 3000).total;
  assert.ok(c3 > c1 && H.precioSugerido(c3, calculo) >= c3 * 1.15 && H.precioSugerido(c3, calculo) % 100 === 0);
  await req('PATCH', '/api/panel/local', { despacho: { activo: true, costo: 0, minimo: 0, horario: dias } });
});

test('equipo: sueldo del repartidor según la ley, privado, ligado al vehículo y a sus entregas', async () => {
  await login();
  const LB = await import('../public/laboral.js'), H = await import('../public/hex.js');
  // los números del análisis: opción B (sáb y dom 12:30–21:30, 1 h de colación) ≈ $331.000 de costo mensual
  const B = { nombre: 'Juan Pérez', rut: '11.111.111-1', rol: 'repartidor', contrato: 'plazo_fijo', turno: LB.TURNOS_TIPO[1].turno, recargoDomingo: true, gratificacion: true, bonoEntrega: 0 };
  const l = LB.liquidacion(B);
  assert.equal(l.horasSemana, 16); assert.equal(Math.round(l.base), 210877);
  assert.ok(Math.abs(l.costoEmpresa - 331000) < 1500, String(l.costoEmpresa));
  // validaciones legales
  const eq = (trabajadores) => req('PATCH', '/api/panel/local', { equipo: { trabajadores } });
  assert.match((await eq([{ ...B, turno: { 6: ['10:00', '22:00', 30] } }])).body.error, /10 horas/);
  assert.match((await eq([{ ...B, sueldoBase: 100000 }])).body.error, /mínimo/);
  assert.match((await eq([{ ...B, nombre: '' }])).body.error, /nombre/);
  assert.equal((await eq([{ ...B, id: 'juan', bonoEntrega: 500 }])).status, 200);
  // privado: ni sueldos ni RUT en la carta pública; sí en el panel
  const pub = JSON.stringify(await menu());
  assert.ok(!pub.includes('11.111.111-1') && !pub.includes('Juan Pérez'));
  assert.equal((await req('GET', '/api/panel/carta')).body.equipo.trabajadores[0].nombre, 'Juan Pérez');
  // el vehículo con repartidor costea el viaje con su costo por hora + bono, y el pedido queda asignado a él
  const o = (await menu()).local.ubicacion, dias = Object.fromEntries([...'0123456'].map((d) => [d, ['00:00', '00:00']]));
  const moto = { id: 'm1', nombre: 'Moto', tipo: 'moto', rendimiento: 35, precioLitro: 1300, mantencionKm: 15, velocidad: 25, pagoHora: 0, pagoViaje: 0, minEntrega: 5, repartidorId: 'juan' };
  const calculo = { vehiculo: 'm1', factor: 1.35, idaVuelta: true, margen: 15, redondeo: 100 };
  assert.equal((await req('PATCH', '/api/panel/local', { despacho: { activo: true, minimo: 0, horario: dias, modo: 'zonas', tam: 450, tramos: [{ hasta: 3000, costo: 2500 }], ajustes: {}, vehiculos: [moto], calculo } })).status, 200);
  const dest = H.centro(o, 450, 1, 0), ch = await prod('Chacarero');
  const r = await pedir([{ producto_id: ch.id }], { modalidad: 'despacho', direccion: 'X 1', ubicacion: dest });
  const det = (await req('GET', `/api/panel/pedidos/${r.body.id}`)).body;
  const eqv = (await req('GET', '/api/panel/carta')).body.equipo;
  const v = LB.vehiculoConRepartidor(moto, eqv.trabajadores, eqv.laboral);
  assert.equal(det.repartidor_id, 'juan');
  assert.equal(det.costo_viaje, Math.round(H.costoViaje(v, calculo, Math.round(H.distancia(o, dest))).total));
  assert.ok(v.pagoHora > 4000 && v.pagoViaje > 500);
  assert.equal((await req('PATCH', `/api/panel/pedidos/${r.body.id}`, { repartidor_id: 'nadie' })).status, 400);
  // el mes del equipo cuenta su entrega y el bono
  const mes = (await req('GET', '/api/panel/equipo')).body;
  const j = mes.trabajadores.find((t) => t.id === 'juan');
  assert.equal(j.entregas, 1); assert.equal(Math.round(j.liquidacion.bonos), 500);
  assert.ok(mes.despacho.costo_equipo > 330000 && mes.despacho.pedidos >= 1);
  // vehículo y bono son solo para repartidores: en cocina se descartan y no costean viajes
  const cocina = { ...B, id: 'ana', nombre: 'Ana Cocina', rol: 'cocina', vehiculoPropio: true, bonoEntrega: 900 };
  assert.equal((await eq([{ ...B, id: 'juan', bonoEntrega: 500 }, cocina])).status, 200);
  const ana = (await req('GET', '/api/panel/carta')).body.equipo.trabajadores.find((t) => t.id === 'ana');
  assert.equal(ana.vehiculoPropio, false); assert.equal(ana.bonoEntrega, 0);
  const eq2 = (await req('GET', '/api/panel/carta')).body.equipo;
  assert.equal(LB.vehiculoConRepartidor({ ...moto, repartidorId: 'ana' }, eq2.trabajadores, eq2.laboral).repartidor, undefined);
  // una sola persona en cocina y caja (lo común en locales chicos)
  assert.equal((await eq([{ ...B, id: 'juan' }, { ...cocina, rol: 'cocina_caja' }])).status, 200);
  const mesCC = (await req('GET', '/api/panel/equipo')).body.personal;
  assert.equal(mesCC.porRol.cocina_caja.personas, 1); assert.equal(mesCC.personas, 2);
  await req('PATCH', '/api/panel/local', { despacho: { activo: true, costo: 0, minimo: 0, horario: dias } });
});

test('costo de productos: privado, se congela en cada venta y da el margen de la comida', async () => {
  await login();
  const it = await prod('Italiano');
  assert.equal((await req('PATCH', `/api/panel/productos/${it.id}`, { costo: 1100 })).status, 200);
  assert.equal((await req('PATCH', `/api/panel/productos/${it.id}`, { costo: -5 })).status, 400);
  // privado: el costo está en el panel, nunca en la carta pública
  assert.equal((await req('GET', '/api/panel/carta')).body.categorias.flatMap((c) => c.productos).find((p) => p.id === it.id).costo, 1100);
  assert.equal((await prod('Italiano')).costo, undefined);
  const antes = (await req('GET', '/api/panel/resumen')).body.margen;
  const r = await pedir([{ producto_id: it.id, cantidad: 2 }]);
  assert.equal(r.status, 201);
  // cambiar el costo después no altera la venta ya hecha
  await req('PATCH', `/api/panel/productos/${it.id}`, { costo: 2000 });
  const m = (await req('GET', '/api/panel/resumen')).body.margen;
  assert.equal(m.ventas - antes.ventas, it.precio * 2);
  assert.equal(m.costo - antes.costo, 2200);
  // sin costo cargado se estima con el % del local
  assert.equal((await req('PATCH', '/api/panel/local', { costo_pct: 95 })).status, 400);
  assert.equal((await req('PATCH', '/api/panel/local', { costo_pct: 40 })).status, 200);
  const ch = await prod('Chacarero');
  await pedir([{ producto_id: ch.id }]);
  const m2 = (await req('GET', '/api/panel/resumen')).body.margen;
  assert.equal(m2.costo - m.costo, Math.round(ch.precio * 0.4));
  await req('PATCH', `/api/panel/productos/${it.id}`, { costo: null });
  await req('PATCH', '/api/panel/local', { costo_pct: 35 });
});

// ---------- términos y privacidad ----------
test('legal: páginas públicas, datos legales validados y borrado de datos de un cliente', async () => {
  for (const r of ['/terminos', '/privacidad']) {
    const p = await req('GET', `${r}?l=gassuso`);
    assert.equal(p.status, 200);
    assert.match(p.body, /legal|Términos/);
  }
  await login();
  assert.equal((await req('PATCH', '/api/panel/local', { legal: { rut: '76.123.456-1' } })).status, 400);
  assert.equal((await req('PATCH', '/api/panel/local', { legal: { correo: 'no-es-correo' } })).status, 400);
  assert.equal((await req('PATCH', '/api/panel/local', { legal: { razon_social: 'Gassuso SpA', rut: '76.086.428-5', correo: 'hola@gassuso.cl' } })).status, 200);
  assert.deepEqual((await menu()).local.legal, { razon_social: 'Gassuso SpA', rut: '76.086.428-5', correo: 'hola@gassuso.cl' });
  const it = await prod('Italiano');
  const r = await pedir([{ producto_id: it.id }], { cliente: 'Borra Me', telefono: '+56 9 7777 8888' });
  assert.equal(r.status, 201);
  assert.equal((await req('POST', '/api/panel/privacidad/borrar', { telefono: '123' })).status, 400);
  const b = await req('POST', '/api/panel/privacidad/borrar', { telefono: '977778888' });
  assert.equal(b.body.pedidos, 1);
  const lista = (await req('GET', '/api/panel/pedidos')).body;
  const p = (lista.pedidos || lista).find((x) => x.numero === r.body.numero);
  assert.equal(p.cliente, '(datos borrados)');
  assert.equal(p.telefono, '');
  assert.equal(p.total, it.precio);
  await req('PATCH', '/api/panel/local', { legal: null });
});

// ---------- resumen semanal ----------
test('resumen semanal: los 6 números cuadran entre sí', async () => {
  await login();
  const r = await req('GET', '/api/panel/resumen');
  assert.equal(r.status, 200);
  const s = r.body;
  const lun = new Date(`${s.semana.desde}T12:00:00`), dom = new Date(`${s.semana.hasta}T12:00:00`);
  assert.equal(lun.getDay(), 1); assert.equal(dom.getDay(), 0);
  assert.ok(s.pedidos > 0);
  assert.equal(s.por_dia.reduce((a, d) => a + d.pedidos, 0), s.pedidos);
  assert.equal(s.canal.web.pedidos + s.canal.mostrador.pedidos, s.pedidos);
  assert.equal(s.canal.web.ventas + s.canal.mostrador.ventas, s.ventas);
  assert.equal(s.ticket, Math.round(s.ventas / s.pedidos));
  assert.equal(s.comision_ahorrada, Math.round(s.canal.web.ventas * s.comision_app / 100));
  assert.ok(s.mas_vendido.n >= s.menos_vendido.n);
  assert.ok(s.peak && s.peak.pedidos >= 1);
  assert.ok(s.repiten >= 1, 'Ana pidió varias veces con el mismo teléfono');
  assert.ok(s.repiten <= s.clientes_web);
  assert.equal(s.por_hora.reduce((a, h) => a + h.pedidos, 0) <= s.pedidos, true);
  // horas en orden del día operativo: nunca una hora de madrugada antes de una de la mañana
  const orden = s.por_hora.map((h) => (h.hora + 18) % 24);
  assert.deepEqual(orden, [...orden].sort((a, b) => a - b));
});

test('resumen semanal: semana anterior vacía, fecha inválida y comisión configurable', async () => {
  await login();
  const hoy = (await req('GET', '/api/panel/resumen')).body;
  const d = new Date(`${hoy.semana.desde}T12:00:00`); d.setDate(d.getDate() - 7);
  const ant = (await req('GET', `/api/panel/resumen?semana=${d.toISOString().slice(0, 10)}`)).body;
  assert.equal(ant.pedidos, 0);
  assert.equal(ant.peak, null);
  assert.equal((await req('GET', '/api/panel/resumen?semana=ayer')).status, 400);
  assert.equal((await req('PATCH', '/api/panel/local', { comision_app: 90 })).status, 400);
  await req('PATCH', '/api/panel/local', { comision_app: 30 });
  const r = (await req('GET', '/api/panel/resumen')).body;
  assert.equal(r.comision_ahorrada, Math.round(r.canal.web.ventas * 0.3));
  await req('PATCH', '/api/panel/local', { comision_app: 25 });
  cookie = '';
  assert.equal((await req('GET', '/api/panel/resumen')).status, 401);
});

test('caché: las páginas referencian .js/.css versionados y esos se cachean un año', async () => {
  const html = await (await fetch(B + '/gassuso')).text();
  const css = /href="carta\.css\?v=([0-9a-f]{10})"/.exec(html);
  const js = /from '\.\/comun\.js\?v=([0-9a-f]{10})'/.exec(html);
  assert.ok(css && js, 'carta.css y comun.js deben ir con ?v=');
  const r1 = await fetch(`${B}/comun.js?v=${js[1]}`);
  assert.equal(r1.status, 200);
  assert.match(r1.headers.get('cache-control'), /immutable/);
  // una versión que no corresponde (página vieja en caché) no se cachea como inmutable
  assert.equal((await fetch(`${B}/comun.js?v=0000000000`)).headers.get('cache-control'), 'no-cache');
  assert.equal((await fetch(`${B}/comun.js`)).headers.get('cache-control'), 'no-cache');
  // el panel también
  assert.match(await (await fetch(B + '/panel')).text(), /from '\.\/comun\.js\?v=[0-9a-f]{10}'/);
});

// ---------- logo ----------
test('logo: viene del seed, se reemplaza desde el panel y se puede quitar', async () => {
  const m = await menu();
  assert.match(m.local.logo, /^\/img\/[\w-]+\.webp$/);
  assert.equal((await fetch(B + m.local.logo)).status, 200);
  const webp = new Uint8Array([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBPVP8L'), 0, 0, 0, 0]);
  cookie = '';
  assert.equal((await req('PUT', '/api/panel/local/logo', webp)).status, 401);
  await login();
  assert.equal((await req('PUT', '/api/panel/local/logo', new Uint8Array(Buffer.from('<svg onload=alert(1)>')))).status, 415);
  const r = await req('PUT', '/api/panel/local/logo', webp);
  assert.equal(r.status, 200);
  assert.equal((await menu()).local.logo, r.body.logo);
  assert.equal((await fetch(B + m.local.logo)).status, 404, 'el logo anterior se borra');
  assert.equal((await req('DELETE', '/api/panel/local/logo')).body.logo, null);
  assert.equal((await menu()).local.logo, null);
});

// ---------- caja: movimientos, gastos y arqueo ----------
test('caja: el efectivo esperado suma fondo, ventas e ingresos y resta retiros y gastos en efectivo', async () => {
  cookie = '';
  assert.equal((await req('GET', '/api/panel/caja')).status, 401);
  await login();
  const a = await prod('Barros Luco');
  await req('POST', '/api/panel/venta', { items: [{ producto_id: a.id }], medio_pago: 'efectivo', recibido: 10000 });
  let c = (await req('GET', '/api/panel/caja')).body;
  const hoy = c.hoy;
  const ayer = new Date(`${hoy}T12:00:00`); ayer.setDate(ayer.getDate() - 1);
  const diaAyer = ayer.toISOString().slice(0, 10);
  // Las ventas en efectivo del día cuadran con los pedidos.
  const peds = (await req('GET', '/api/panel/pedidos')).body.pedidos.filter((p) => p.estado !== 'anulado' && p.medio_pago === 'efectivo');
  assert.equal(c.esperado.ventas, peds.reduce((s, p) => s + p.total, 0));
  assert.ok(c.esperado.ventas >= a.precio);

  // Cierre de ayer: su conteo es el fondo sugerido para hoy.
  assert.equal((await req('POST', '/api/panel/caja/cierre', { dia: diaAyer, contado: 12345 })).status, 200);
  c = (await req('GET', '/api/panel/caja')).body;
  assert.deepEqual(c.fondo_sugerido, { dia: diaAyer, monto: 12345 });

  const mov = (b) => req('POST', '/api/panel/caja/movimientos', b);
  assert.equal((await mov({ tipo: 'fondo', monto: 15000 })).status, 201);
  assert.equal((await mov({ tipo: 'fondo', monto: 20000 })).status, 201); // reemplaza al anterior
  assert.equal((await mov({ tipo: 'ingreso', monto: 5000, descripcion: 'Sencillo' })).status, 201);
  assert.equal((await mov({ tipo: 'retiro', monto: 10000, descripcion: 'Retiro del dueño' })).status, 201);
  const gEf = (await mov({ tipo: 'gasto', monto: 3000, categoria: 'insumos', descripcion: 'Palta', medio: 'efectivo' })).body.id;
  assert.equal((await mov({ tipo: 'gasto', monto: 50000, categoria: 'servicios', descripcion: 'Luz', medio: 'transferencia', documento: 'F-123' })).status, 201);
  c = (await req('GET', '/api/panel/caja')).body;
  assert.equal(c.esperado.fondo, 20000);
  assert.equal(c.esperado.gastos, 3000); // la luz se pagó por transferencia: no sale de la caja
  assert.equal(c.esperado.total, 20000 + c.esperado.ventas + 5000 - 10000 - 3000);
  assert.equal(c.movimientos.filter((x) => x.tipo === 'fondo' && !x.anulado).length, 1);

  // Anular un gasto lo saca de la cuenta, pero queda registrado.
  assert.equal((await req('DELETE', `/api/panel/caja/movimientos/${gEf}`)).status, 200);
  c = (await req('GET', '/api/panel/caja')).body;
  assert.equal(c.esperado.gastos, 0);
  assert.ok(c.movimientos.find((x) => x.id === gEf).anulado);

  // Arqueo: faltan $500.
  const esp = c.esperado.total;
  const k = await req('POST', '/api/panel/caja/cierre', { contado: esp - 500, nota: 'Faltó sencillo' });
  assert.equal(k.status, 200);
  assert.equal(k.body.cierre.esperado, esp);
  assert.equal(k.body.cierre.diferencia, -500);
  assert.equal(k.body.cierre.nota, 'Faltó sencillo');
  assert.equal((await req('POST', '/api/panel/caja/cierre', { contado: esp })).status, 409);

  // Caja cerrada: no se mueve el efectivo, pero sí se anotan gastos por transferencia.
  assert.equal((await mov({ tipo: 'retiro', monto: 1000, descripcion: 'x' })).status, 409);
  assert.equal((await mov({ tipo: 'gasto', monto: 2000, categoria: 'envases', medio: 'tarjeta' })).status, 201);
  const ing = c.movimientos.find((x) => x.tipo === 'ingreso').id;
  assert.equal((await req('DELETE', `/api/panel/caja/movimientos/${ing}`)).status, 409);

  // Reabrir y volver a cerrar: el cierre anterior queda anulado y el nuevo cuadra.
  assert.equal((await req('DELETE', '/api/panel/caja/cierre')).status, 200);
  assert.equal((await req('DELETE', '/api/panel/caja/cierre')).status, 409);
  const k2 = await req('POST', '/api/panel/caja/cierre', { contado: esp });
  assert.equal(k2.body.cierre.diferencia, 0);
});

test('caja: validaciones de movimientos y cierre', async () => {
  await login();
  const hoy = (await req('GET', '/api/panel/caja')).body.hoy;
  const mov = (b) => req('POST', '/api/panel/caja/movimientos', b);
  for (const b of [
    { tipo: 'robo', monto: 100 },
    { tipo: 'gasto', monto: -5, categoria: 'insumos' },
    { tipo: 'gasto', monto: 10.5, categoria: 'insumos' },
    { tipo: 'gasto', monto: 1000, categoria: 'caprichos' },
    { tipo: 'gasto', monto: 1000, categoria: 'insumos', medio: 'cheque' },
    { tipo: 'retiro', monto: 1000 }, // sin motivo
    { tipo: 'gasto', monto: 1000, categoria: 'insumos', dia: '2999-01-01' },
    { tipo: 'gasto', monto: 1000, categoria: 'insumos', dia: 'ayer' },
    { tipo: 'ingreso', monto: 1000, descripcion: 'x', dia: '2020-01-01' }, // la caja solo se corrige 7 días atrás
  ]) assert.equal((await mov(b)).status, 400, JSON.stringify(b));
  assert.equal((await req('POST', '/api/panel/caja/cierre', { dia: hoy, contado: -1 })).status, 400);
  assert.equal((await req('GET', '/api/panel/caja?dia=hoy')).status, 400);
  assert.equal((await req('DELETE', '/api/panel/caja/movimientos/999999')).status, 404);
  // Un gasto antiguo (la factura que llegó tarde) sí se puede anotar.
  const viejo = new Date(`${hoy}T12:00:00`); viejo.setDate(viejo.getDate() - 40);
  assert.equal((await mov({ tipo: 'gasto', monto: 1000, categoria: 'contador', dia: viejo.toISOString().slice(0, 10) })).status, 201);
  // El texto se limpia.
  const id = (await mov({ tipo: 'gasto', monto: 700, categoria: 'otros', descripcion: '  Hielo\n\n para   bebidas ', medio: 'transferencia' })).body.id;
  const g = (await req('GET', '/api/panel/caja')).body.movimientos.find((x) => x.id === id);
  assert.equal(g.descripcion, 'Hielo para bebidas');
});

test('gastos del mes: por categoría y comparados con el mes anterior', async () => {
  await login();
  const hoy = (await req('GET', '/api/panel/caja')).body.hoy;
  const mes = hoy.slice(0, 7);
  const r = (await req('GET', `/api/panel/gastos?mes=${mes}`)).body;
  assert.equal(r.mes, mes);
  assert.equal(r.total, r.gastos.reduce((s, g) => s + g.monto, 0));
  assert.equal(r.total, Object.values(r.por_categoria).reduce((s, v) => s + v, 0));
  assert.ok(r.por_categoria.servicios >= 50000);
  assert.ok(!r.gastos.some((g) => g.monto === 3000 && g.descripcion === 'Palta')); // el anulado no cuenta
  assert.match(r.anterior.mes, /^\d{4}-\d{2}$/);
  assert.equal((await req('GET', '/api/panel/gastos?mes=2026-13')).status, 400);
  // Datos de otro local o sin sesión: nada.
  cookie = '';
  assert.equal((await req('GET', `/api/panel/gastos?mes=${mes}`)).status, 401);
});

// ---------- exportar para el contador ----------
test('exportar: CSV de ventas, productos, caja y gastos, sin datos de contacto y a prueba de fórmulas', async () => {
  await login();
  const hoy = (await req('GET', '/api/panel/caja')).body.hoy;
  const a = await prod('Barros Luco');
  await pedir([{ producto_id: a.id }], { cliente: '=HYPERLINK("x")', telefono: '+56 9 7777 8888' });
  await req('POST', '/api/panel/caja/movimientos', { tipo: 'gasto', monto: 1234, categoria: 'publicidad', descripcion: 'Volantes; "ofertas"', medio: 'transferencia' });
  const bajar = (tipo, desde = hoy, hasta = hoy) => fetch(`${B}/api/panel/exportar?tipo=${tipo}&desde=${desde}&hasta=${hasta}`, { headers: { Cookie: cookie } });

  const r = await bajar('ventas');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /^text\/csv/);
  assert.match(r.headers.get('content-disposition'), new RegExp(`attachment; filename="gassuso-ventas-${hoy}_${hoy}\.csv"`));
  const buf = new Uint8Array(await r.arrayBuffer());
  assert.deepEqual([...buf.slice(0, 3)], [0xef, 0xbb, 0xbf]); // BOM: Excel abre bien las tildes
  const ventas = new TextDecoder().decode(buf);
  const lineas = ventas.trim().split('\r\n');
  assert.equal(lineas[0].replace('﻿', '').split(';')[0], 'Fecha');
  assert.ok(lineas.length > 2);
  assert.ok(!ventas.includes('7777'), 'sin teléfonos');
  assert.ok(ventas.includes(`'=HYPERLINK(""x"")`), 'el nombre no queda como fórmula');

  const productos = await (await bajar('productos')).text();
  assert.match(productos, /Barros Luco;\d+;5790;/);

  const gastos = await (await bajar('gastos')).text();
  assert.ok(gastos.includes('Publicidad;"Volantes; ""ofertas""";Transferencia;;1234'));

  const caja = await (await bajar('caja')).text();
  const fila = caja.trim().split('\r\n').find((l) => l.startsWith(hoy)).split(';');
  const c = (await req('GET', '/api/panel/caja')).body;
  assert.equal(Number(fila[7]), c.esperado.total);

  for (const [t, d, h] of [['clientes', hoy, hoy], ['ventas', 'hoy', hoy], ['ventas', hoy, '2020-01-01'], ['ventas', '2024-01-01', '2025-06-01']])
    assert.equal((await bajar(t, d, h)).status, 400, `${t} ${d} ${h}`);
  cookie = '';
  assert.equal((await bajar('ventas')).status, 401);
});

// ---------- monitoreo y respaldos ----------
test('salud completa: base, respaldo del día y disco', async () => {
  const r = await req('GET', '/salud/completo');
  assert.equal(r.status, 200);
  assert.equal(r.body, 'ok');
});

test('el respaldo diario se puede restaurar (probar-respaldo.mjs)', async () => {
  const bk = path.join(dir, 'data', 'backups');
  const f = fs.readdirSync(bk).find((n) => /^pedidos-\d{4}-\d{2}-\d{2}\.db$/.test(n));
  assert.ok(f, 'existe el respaldo del día');
  const correr = (archivo) => new Promise((ok) => {
    const p = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'deploy/probar-respaldo.mjs', archivo], { cwd: ROOT });
    let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
    p.on('exit', (code) => ok({ code, out }));
  });
  const bien = await correr(path.join(bk, f));
  assert.equal(bien.code, 0, bien.out);
  assert.match(bien.out, /Respaldo restaurable/);
  const malo = path.join(dir, 'malo.db');
  fs.writeFileSync(malo, 'esto no es una base');
  const mal = await correr(malo);
  assert.notEqual(mal.code, 0);
  assert.match(mal.out, /dañada/);
});

// ---------- varios locales, usuarios con PIN, licencias y administración ----------
// Cliente con su propio frasco de cookies (dueño, tablet, administración).
function cliente() {
  const jar = new Map();
  return async (method, p, body) => {
    const r = await fetch(B + p, {
      method, redirect: 'manual',
      headers: { 'cf-connecting-ip': `10.9.${Math.random() * 255 | 0}.${Math.random() * 255 | 0}`, ...(body ? { 'Content-Type': 'application/json' } : {}), Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); }
    const text = await r.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: r.status, body: json };
  };
}
const sumarDias = (d, n) => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const picada = {};

test('admin: sin sesión no entra, crea un local con clave propia y lo administra', async () => {
  const ad = cliente();
  assert.equal((await ad('GET', '/api/admin/resumen')).status, 401);
  assert.equal((await ad('POST', '/api/admin/login', { password: 'mala' })).status, 401);
  assert.equal((await ad('POST', '/api/admin/login', { password: 'admin-de-prueba' })).status, 200);
  const r0 = (await ad('GET', '/api/admin/resumen')).body;
  const gas = r0.locales.find((l) => l.slug === 'gassuso');
  assert.equal(gas.plan, 'gestion');
  assert.equal(gas.estado, 'prueba'); // cliente fundador: piloto de 90 días desde el seed
  assert.ok(gas.dias > 80);

  for (const b of [{ slug: 'Mal Slug', nombre: 'X' }, { slug: 'panel', nombre: 'X' }, { slug: 'gassuso', nombre: 'X' }, { slug: 'nuevo-local', nombre: '' }, { slug: 'nuevo-local', nombre: 'X', plan: 'oro' }, { slug: 'nuevo-local', nombre: 'X', carta: '{malo' }])
    assert.equal((await ad('POST', '/api/admin/locales', b)).status, 400, JSON.stringify(b));
  const carta = { categorias: [{ nombre: 'Sándwiches', productos: [{ nombre: 'Lomito', precio: 6000 }, { nombre: 'Especial' }] }], agregados: ['Palta'] };
  const nuevo = await ad('POST', '/api/admin/locales', { slug: 'la-picada', nombre: 'La Picada', plan: 'canal', prueba_dias: 14, whatsapp: '+56 9 1234 5678', carta });
  assert.equal(nuevo.status, 201);
  assert.match(nuevo.body.clave, /^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  // La carta del nuevo local es pública y separada de Gassuso.
  const m = (await req('GET', '/api/locales/la-picada')).body;
  assert.equal(m.local.nombre, 'La Picada');
  assert.deepEqual(m.categorias[0].productos.map((p) => p.nombre), ['Lomito', 'Especial']);
  assert.equal((await req('GET', '/la-picada')).status, 200);
  const det = (await ad('GET', `/api/admin/locales/${nuevo.body.id}`)).body;
  assert.equal(det.estado.estado, 'prueba');
  assert.equal(det.precios.gestion.anual, 355980);
  assert.equal(det.precios.canal.semestral, 107460);
  Object.assign(picada, nuevo.body);
});

test('multi-local: cada dueño entra con su clave y no ve datos del otro', async () => {
  const { slug, clave } = picada;
  const pic = cliente();
  assert.equal((await pic('POST', '/api/panel/login', { password: clave })).status, 401); // hay 2 locales: falta el código
  assert.equal((await pic('POST', '/api/panel/login', { slug, password: 'clave-de-prueba' })).status, 401); // la clave general no vale para un local con clave propia
  assert.equal((await pic('POST', '/api/panel/login', { slug, password: clave })).status, 200);
  const ped = (await pic('GET', '/api/panel/pedidos')).body;
  assert.equal(ped.local, 'La Picada');
  assert.equal(ped.pedidos.length, 0);
  // Gassuso sigue entrando con la clave general (no tiene clave propia), indicando su código.
  cookie = '';
  assert.equal((await req('POST', '/api/panel/login', { slug: 'gassuso', password: 'clave-de-prueba' })).status, 200);
  const gp = (await req('GET', '/api/panel/pedidos')).body.pedidos[0];
  // Un pedido o producto de Gassuso no se puede leer ni tocar desde La Picada.
  assert.equal((await pic('GET', `/api/panel/pedidos/${gp.id}`)).status, 404);
  assert.equal((await pic('PATCH', `/api/panel/pedidos/${gp.id}`, { estado: 'anulado' })).status, 404);
  const gm = (await req('GET', '/api/panel/carta')).body.categorias[0].productos[0];
  assert.equal((await pic('PATCH', `/api/panel/productos/${gm.id}`, { precio: 1 })).status, 404);
  assert.equal((await pic('GET', '/api/panel/caja')).body.movimientos.length, 0);
  // Plan Canal: sin exportar ni equipo; dos usuarios con PIN como máximo.
  const yo = (await pic('GET', '/api/panel/yo')).body;
  assert.equal(yo.rol, 'dueno');
  assert.equal(yo.licencia.plan, 'canal');
  assert.equal((await pic('GET', '/api/panel/equipo')).status, 402);
  const ex = await pic('GET', '/api/panel/exportar?tipo=ventas&desde=2026-01-01&hasta=2026-01-31');
  assert.equal(ex.status, 402);
  assert.match(ex.body.error, /Gestión/);
  assert.equal((await pic('POST', '/api/panel/usuarios', { nombre: 'Ana', rol: 'caja', pin: '4826' })).status, 201);
  assert.equal((await pic('POST', '/api/panel/usuarios', { nombre: 'Beto', rol: 'cocina', pin: '4826' })).status, 400); // PIN repetido
  assert.equal((await pic('POST', '/api/panel/usuarios', { nombre: 'Beto', rol: 'cocina', pin: '1234' })).status, 400); // PIN débil
  assert.equal((await pic('POST', '/api/panel/usuarios', { nombre: 'Beto', rol: 'cocina', pin: '7391' })).status, 201);
  assert.equal((await pic('POST', '/api/panel/usuarios', { nombre: 'Caro', rol: 'cocina', pin: '5172' })).status, 402); // límite del plan
  assert.equal((await pic('POST', '/api/panel/usuarios', { nombre: 'Dueño 2', rol: 'dueno', pin: '6618' })).status, 400);
  picada.tablet = pic;
});

test('PIN y roles: la tablet del local, permisos por rol y turnos', async () => {
  const pic = picada.tablet;
  // Sin tablet asociada no se puede entrar con PIN.
  assert.equal((await cliente()('POST', '/api/panel/pin', { pin: '4826' })).status, 401);
  // La tablet del dueño quedó asociada: aparece el teclado de PIN.
  const acc = (await pic('GET', '/api/panel/acceso')).body;
  assert.equal(acc.dispositivo.slug, 'la-picada');
  assert.ok(acc.dispositivo.con_pin);
  assert.equal((await pic('POST', '/api/panel/pin', { pin: '0000' })).status, 401);
  // Cocina: ve pedidos y marca agotados; no cobra, no vende, no ve caja ni costos.
  const coc = await pic('POST', '/api/panel/pin', { pin: '7391' });
  assert.equal(coc.status, 200);
  assert.equal(coc.body.rol, 'cocina');
  assert.equal((await pic('GET', '/api/panel/yo')).body.nombre, 'Beto');
  assert.equal((await pic('GET', '/api/panel/pedidos')).status, 200);
  assert.equal((await pic('GET', '/api/panel/caja')).status, 403);
  assert.equal((await pic('POST', '/api/panel/venta', { items: [], medio_pago: 'efectivo' })).status, 403);
  assert.equal((await pic('PATCH', '/api/panel/local', { nombre: 'Hackeado' })).status, 403);
  assert.equal((await pic('GET', '/api/panel/usuarios')).status, 403);
  assert.equal((await pic('GET', '/api/panel/licencia')).status, 403);
  const carta = (await pic('GET', '/api/panel/carta')).body;
  assert.ok(carta.categorias.flatMap((c) => c.productos).every((p) => p.costo === null));
  assert.ok(carta.equipo.trabajadores.every((t) => t.sueldoBase === undefined));
  const ag = carta.agregados[0];
  assert.equal((await pic('PATCH', `/api/panel/agregados/${ag.id}`, { disponible: false })).status, 200);
  assert.equal((await pic('PATCH', `/api/panel/agregados/${ag.id}`, { nombre: 'Otro' })).status, 403);
  // Caja: vende, cobra, anota gastos y pausa; no reabre la caja ni ve el resumen.
  assert.equal((await pic('POST', '/api/panel/pin', { pin: '4826' })).body.rol, 'caja');
  const lom = carta.categorias[0].productos.find((p) => p.nombre === 'Lomito');
  const v = await pic('POST', '/api/panel/venta', { items: [{ producto_id: lom.id }], medio_pago: 'efectivo', recibido: 10000 });
  assert.equal(v.status, 201);
  assert.equal((await pic('POST', '/api/panel/caja/movimientos', { tipo: 'gasto', monto: 500, categoria: 'otros', medio: 'transferencia' })).status, 201);
  assert.equal((await pic('PATCH', '/api/panel/local', { pausa: true })).status, 200);
  assert.equal((await pic('PATCH', '/api/panel/local', { pausa: false })).status, 200);
  assert.equal((await pic('GET', '/api/panel/resumen')).status, 403);
  const c = (await pic('GET', '/api/panel/caja')).body;
  assert.equal(c.movimientos[0].usuario, 'Ana');
  const ped = (await pic('GET', '/api/panel/pedidos')).body.pedidos.find((p) => p.id === v.body.id);
  assert.equal(ped.cobrado_por, 'Ana');
  assert.equal((await pic('POST', '/api/panel/caja/cierre', { contado: c.esperado.total })).status, 200);
  assert.equal((await pic('DELETE', '/api/panel/caja/cierre')).status, 403);
  // Turnos: entrada y salida con PIN, sin abrir el panel.
  assert.equal((await pic('POST', '/api/panel/turno', { pin: '4826', tipo: 'entrada' })).status, 200);
  assert.equal((await pic('POST', '/api/panel/turno', { pin: '4826', tipo: 'entrada' })).status, 409);
  assert.equal((await pic('POST', '/api/panel/turno', { pin: '4826', tipo: 'salida' })).status, 200);
  // Un usuario desactivado pierde la sesión al instante.
  const duen = cliente();
  await duen('POST', '/api/panel/login', { slug: picada.slug, password: picada.clave });
  const ana = (await duen('GET', '/api/panel/usuarios')).body.usuarios.find((u) => u.nombre === 'Ana');
  assert.equal((await duen('PATCH', `/api/panel/usuarios/${ana.id}`, { activo: false })).status, 200);
  assert.equal((await pic('GET', '/api/panel/pedidos')).status, 401);
});

test('licencia: los pagos extienden el plazo; vencida pasa a gracia y luego a solo lectura', async () => {
  const ad = cliente();
  await ad('POST', '/api/admin/login', { password: 'admin-de-prueba' });
  const { id, slug, clave } = picada;
  const hoy = (await ad('GET', '/api/admin/resumen')).body.hoy;
  // Pago semestral durante la prueba: el período parte cuando termina la prueba.
  const pago = await ad('POST', `/api/admin/locales/${id}/pagos`, { ciclo: 'semestral', medio: 'transferencia', factura: '101' });
  assert.equal(pago.status, 201);
  assert.equal(pago.body.monto, 107460);
  assert.equal(pago.body.desde, sumarDias(hoy, 14));
  let det = (await ad('GET', `/api/admin/locales/${id}`)).body;
  assert.equal(det.estado.estado, 'activa');
  assert.equal(det.licencia.vence, pago.body.hasta);
  assert.equal((await ad('POST', `/api/admin/locales/${id}/pagos`, { medio: 'cheque' })).status, 400);
  // Venció ayer: gracia (todo funciona, con aviso).
  await ad('PATCH', `/api/admin/locales/${id}/licencia`, { vence: sumarDias(hoy, -1), prueba_hasta: sumarDias(hoy, -30) });
  det = (await ad('GET', `/api/admin/locales/${id}`)).body;
  assert.equal(det.estado.estado, 'gracia');
  const d = cliente();
  await d('POST', '/api/panel/login', { slug, password: clave });
  assert.equal((await d('PATCH', '/api/panel/local', { pausa: false })).status, 200);
  // 10 días vencida: suspendida → panel en solo lectura, carta sin pedidos, exportar sí.
  await ad('PATCH', `/api/admin/locales/${id}/licencia`, { vence: sumarDias(hoy, -10) });
  const yo = (await d('GET', '/api/panel/yo')).body;
  assert.equal(yo.licencia.estado, 'suspendida');
  assert.equal((await d('PATCH', '/api/panel/local', { pausa: false })).status, 402);
  assert.equal((await d('GET', '/api/panel/pedidos')).status, 200);
  assert.equal((await d('GET', `/api/panel/exportar?tipo=ventas&desde=${hoy}&hasta=${hoy}`)).status, 200);
  const carta = (await req('GET', `/api/locales/${slug}`)).body;
  assert.equal(carta.local.pausa, true);
  const lom = carta.categorias[0].productos[0];
  const p = await req('POST', `/api/locales/${slug}/pedidos`, { cliente: 'Eva', telefono: '+56 9 3333 4444', franja: 'Lo antes posible', items: [{ producto_id: lom.id }] });
  assert.equal(p.status, 400);
  // Un pago la reactiva desde hoy.
  const p2 = await ad('POST', `/api/admin/locales/${id}/pagos`, { ciclo: 'mensual', medio: 'transferencia', monto: 19900 });
  assert.equal(p2.body.desde, hoy);
  assert.equal((await d('GET', '/api/panel/yo')).body.licencia.estado, 'activa');
  det = (await ad('GET', `/api/admin/locales/${id}`)).body;
  assert.ok(det.eventos.some((e) => e.tipo === 'pago'));
  const r = (await ad('GET', '/api/admin/resumen')).body;
  assert.equal(r.locales.find((l) => l.slug === slug).mrr, 19900);
  // Nueva clave: la anterior deja de valer.
  const nc = (await ad('POST', `/api/admin/locales/${id}/clave`)).body.clave;
  assert.equal((await cliente()('POST', '/api/panel/login', { slug, password: clave })).status, 401);
  assert.equal((await cliente()('POST', '/api/panel/login', { slug, password: nc })).status, 200);
});

test('tarifa por pedido: 1 % sin tope, solo web y respetando la exención', async () => {
  const { tarifaPedido } = await import('../lib/licencias.mjs');
  assert.equal(tarifaPedido(12000), 120);
  assert.equal(tarifaPedido(20000), 200);
  assert.equal(tarifaPedido(45000), 450);
  assert.equal(tarifaPedido(990), 10);
  cookie = '';
  await req('POST', '/api/panel/login', { slug: 'gassuso', password: 'clave-de-prueba' });
  const l = (await req('GET', '/api/panel/licencia')).body;
  // Gassuso está exento el primer año: tiene pedidos web este mes, pero la tarifa es 0.
  assert.ok(l.tarifa_mes.pedidos > 0);
  assert.equal(l.tarifa_mes.monto, 0);
  assert.equal(l.tarifa_mes.exentos, l.tarifa_mes.pedidos);
  assert.equal(l.descuento.pct, 50);
});

// ---------- estado de resultados ----------
test('resultados: ventas − comida − personal − gastos, sin contar dos veces insumos ni sueldos', async () => {
  cookie = '';
  await req('POST', '/api/panel/login', { slug: 'gassuso', password: 'clave-de-prueba' });
  const mes = (await req('GET', '/api/panel/caja')).body.hoy.slice(0, 7);
  const r0 = (await req('GET', `/api/panel/resultados?mes=${mes}`)).body;
  assert.equal(r0.mes, mes);
  // Las cuentas cuadran.
  assert.equal(r0.margen_bruto, r0.ventas - r0.costo_comida);
  assert.equal(r0.resultado, r0.margen_bruto - r0.personal.monto - r0.total_operacion);
  assert.equal(r0.total_operacion, r0.operacion.reduce((s, g) => s + g.monto, 0));
  // Insumos: aparte, como referencia (ya están en el costo de la comida).
  const antes = r0.compras_insumos;
  await req('POST', '/api/panel/caja/movimientos', { tipo: 'gasto', monto: 7000, categoria: 'insumos', medio: 'transferencia' });
  await req('POST', '/api/panel/caja/movimientos', { tipo: 'gasto', monto: 300000, categoria: 'arriendo', medio: 'transferencia' });
  let r = (await req('GET', `/api/panel/resultados?mes=${mes}`)).body;
  assert.equal(r.compras_insumos, antes + 7000);
  assert.equal(r.total_operacion, r0.total_operacion + 300000);
  assert.ok(!r.operacion.some((g) => g.categoria === 'insumos'));
  // Sueldos anotados reemplazan la estimación de Equipo.
  await req('POST', '/api/panel/caja/movimientos', { tipo: 'gasto', monto: 550000, categoria: 'sueldos', medio: 'transferencia' });
  r = (await req('GET', `/api/panel/resultados?mes=${mes}`)).body;
  assert.equal(r.personal.fuente, 'gastos');
  assert.ok(r.personal.monto >= 550000);
  assert.equal(r.resultado, r.margen_bruto - r.personal.monto - r.total_operacion);
  assert.match(r.anterior.mes, /^\d{4}-\d{2}$/);
  assert.equal((await req('GET', '/api/panel/resultados?mes=2026-13')).status, 400);
});

// ---------- autoservicio: primeros pasos e importar la carta ----------
test('planilla: separadores, comillas, títulos y precios a la chilena', async () => {
  const { leerPlanilla, leerPrecio, filasDeTexto } = await import('../lib/autoservicio.mjs');
  assert.deepEqual(leerPlanilla('a\tb\tc\n\nd\te\tf').map((f) => f.celdas), [['a', 'b', 'c'], ['d', 'e', 'f']]);
  assert.deepEqual(leerPlanilla('﻿a;"b; con ""comillas""";c\r\nx;y;z').map((f) => f.celdas), [['a', 'b; con "comillas"', 'c'], ['x', 'y', 'z']]);
  assert.deepEqual(leerPlanilla('a,"dos\nlíneas",c\nd,e,f').map((f) => [f.linea, f.celdas[1]]), [[1, 'dos\nlíneas'], [3, 'e']]);
  for (const [v, n] of [['$4.500', 4500], ['4500', 4500], ['4.500', 4500], ['4500,00', 4500], ['$ 12.990', 12990], ['1.234.567', 1234567], ['', null]]) assert.equal(leerPrecio(v), n, v);
  assert.ok(Number.isNaN(leerPrecio('cuatro mil')));
  const t = filasDeTexto('Nombre;Precio;Categoría\nLomito;6000;Sándwiches');
  assert.ok(t.con_titulos);
  assert.deepEqual(t.filas[0], { linea: 2, categoria: 'Sándwiches', nombre: 'Lomito', precio: '6000', descripcion: '' });
  assert.match(filasDeTexto('').error, /Pega/);
  assert.match(filasDeTexto('C\tP\t1\n'.repeat(501)).error, /máximo/);
});

const rincon = {};
test('primeros pasos: un local nuevo ve su avance hasta completarlo; Gassuso no', async () => {
  const ad = cliente();
  await ad('POST', '/api/admin/login', { password: 'admin-de-prueba' });
  const n = await ad('POST', '/api/admin/locales', { slug: 'el-rincon', nombre: 'El Rincón', plan: 'gestion' });
  assert.equal(n.status, 201);
  const dueno = cliente();
  assert.equal((await dueno('POST', '/api/panel/login', { slug: 'el-rincon', password: n.body.clave })).status, 200);
  const e0 = (await dueno('GET', '/api/panel/inicio')).body;
  assert.equal(e0.cerrado, false);
  assert.equal(e0.listos, 0);
  assert.deepEqual(e0.pasos.map((p) => p.id), ['contacto', 'horario', 'logo', 'transferencias', 'producto']);
  // La consola muestra el avance de cada local.
  assert.deepEqual((await ad('GET', '/api/admin/resumen')).body.locales.find((l) => l.slug === 'el-rincon').inicio, { listos: 0, total: 5, cerrado: false });
  // Gassuso se armó antes del asistente: no lo ve.
  await login();
  assert.equal((await req('GET', '/api/panel/inicio')).body.cerrado, true);

  // Contacto: con WhatsApp y dirección queda listo.
  assert.equal((await dueno('PATCH', '/api/panel/local', { whatsapp: '912345678' })).status, 200);
  assert.equal((await dueno('GET', '/api/panel/inicio')).body.pasos[0].hecho, false); // falta la dirección
  await dueno('PATCH', '/api/panel/local', { direccion: 'Janequeo 123, Concepción' });
  // Horario: listo al guardarlo (aunque sea el mismo que venía).
  const hor = Object.fromEntries([...'0123456'].map((d) => [d, d === '0' ? null : ['12:00', '23:00']]));
  assert.equal((await dueno('PATCH', '/api/panel/local', { horario: hor })).status, 200);
  // Transferencias: el servidor revisa el RUT y el correo.
  assert.equal((await dueno('PATCH', '/api/panel/local', { transferencia: { titular: 'Ana', rut: '76.123.456-7', banco: 'BCI', numero: '123' } })).status, 400);
  assert.equal((await dueno('PATCH', '/api/panel/local', { transferencia: { titular: 'Ana', banco: 'BCI', numero: '123', email: 'malo' } })).status, 400);
  assert.equal((await dueno('PATCH', '/api/panel/local', { transferencia: { titular: 'Ana Pérez', rut: '76.123.456-0', banco: 'BCI', tipo: 'Cuenta vista', numero: '123-45' } })).status, 200);
  // Logo: se puede omitir; un paso obligatorio no.
  assert.equal((await dueno('PATCH', '/api/panel/inicio', { omitir: 'contacto' })).status, 400);
  let e = (await dueno('PATCH', '/api/panel/inicio', { omitir: 'logo' })).body;
  assert.deepEqual(e.pasos.map((p) => [p.id, p.hecho || p.omitido]), [['contacto', true], ['horario', true], ['logo', true], ['transferencias', true], ['producto', false]]);
  assert.equal(e.listos, 4);
  assert.equal(e.completo, false);
  // Primer producto (desde el asistente): un producto "sin precio" no cuenta.
  const uno = (precio) => dueno('POST', '/api/panel/importar', { modo: 'agregar', confirmar: true, filas: [{ categoria: 'Sándwiches', nombre: 'Lomito', precio }] });
  assert.equal((await uno('')).status, 201);
  assert.equal((await dueno('GET', '/api/panel/inicio')).body.completo, false);
  assert.equal((await uno('$6.500')).status, 201); // misma categoría y nombre: actualiza el precio
  e = (await dueno('GET', '/api/panel/inicio')).body;
  assert.equal(e.completo, true);
  const m = (await req('GET', '/api/locales/el-rincon')).body;
  assert.deepEqual(m.categorias.filter((c) => c.productos.length).map((c) => [c.nombre, c.productos.map((p) => [p.nombre, p.precio, p.precio_pendiente])]), [['Sándwiches', [['Lomito', 6500, 0]]]]);
  // Cerrar el asistente; se puede volver a abrir.
  assert.equal((await dueno('PATCH', '/api/panel/inicio', { cerrado: true })).body.cerrado, true);
  assert.equal((await dueno('PATCH', '/api/panel/inicio', { cerrado: false })).body.cerrado, false);
  Object.assign(rincon, { dueno, ad });
});

test('importar carta: vista previa, errores por fila, agregar y reemplazar sin perder pedidos', async () => {
  const { dueno } = rincon;
  const imp = (texto, extra = {}) => dueno('POST', '/api/panel/importar', { texto, ...extra });
  // Vista previa con errores: no guarda nada.
  const mala = [
    'Categoría\tProducto\tPrecio\tDescripción',
    'Sándwiches\tLomito\t$7.000\tCon palta',
    '\tChacarero\t6.900\t', // categoría vacía = la de arriba
    'Bebidas\t\t1500\t', // sin nombre
    'Bebidas\tJugo\tcuatro mil\t', // precio raro
    'Bebidas\tBebida lata\t\t', // sin precio: aviso, no error
    'Sándwiches\tchacarero\t1\t', // repetido (sin importar mayúsculas)
  ].join('\n');
  const p = await imp(mala);
  assert.equal(p.status, 200);
  assert.equal(p.body.errores, 3);
  assert.ok(p.body.con_titulos);
  assert.deepEqual(p.body.filas.map((f) => [f.linea, f.categoria, f.accion ?? null, !!f.error]), [
    [2, 'Sándwiches', 'actualiza', false], [3, 'Sándwiches', 'nuevo', false], [4, 'Bebidas', null, true], [5, 'Bebidas', null, true], [6, 'Bebidas', 'nuevo', false], [7, 'Sándwiches', null, true]]);
  assert.match(p.body.filas[3].error, /cuatro mil/);
  assert.match(p.body.filas[4].avisos[0], /Sin precio/);
  assert.deepEqual(p.body.categorias_nuevas, ['Bebidas']);
  const conf = await imp(mala, { confirmar: true });
  assert.equal(conf.status, 400);
  assert.match(conf.body.error, /3 filas con problemas/);
  assert.equal((await req('GET', '/api/locales/el-rincon')).body.categorias.flatMap((c) => c.productos).length, 1);

  // Agregar (CSV con ";" como lo guarda Excel en español): crea, actualiza y deja historial.
  const ok = await imp('Sándwiches;Lomito;$7.000;Con palta\n;Chacarero;6.900;\nBebidas;Bebida lata;;\nBebidas;"Jugo; natural";2.500;"De la ""casa"""', { confirmar: true });
  assert.equal(ok.status, 201);
  assert.deepEqual([ok.body.nuevos, ok.body.actualizados, ok.body.categorias_nuevas], [3, 1, ['Bebidas']]);
  const c = (await dueno('GET', '/api/panel/carta')).body;
  const ps = c.categorias.flatMap((x) => x.productos);
  assert.deepEqual(ps.map((x) => [x.nombre, x.precio, x.precio_pendiente]), [['Lomito', 7000, 0], ['Chacarero', 6900, 0], ['Bebida lata', 0, 1], ['Jugo; natural', 2500, 0]]);
  assert.equal(ps.find((x) => x.nombre === 'Jugo; natural').descripcion, 'De la "casa"');
  assert.ok((await dueno('GET', '/api/panel/historial')).body.some((h) => h.nombre === 'Lomito' && h.anterior === 6500 && h.nuevo === 7000));

  // Un pedido con el Chacarero; luego se reemplaza la carta sin él.
  const chac = ps.find((x) => x.nombre === 'Chacarero');
  assert.equal((await req('POST', '/api/locales/el-rincon/pedidos', { cliente: 'Ana', telefono: '+56 9 1111 2222', franja: 'Lo antes posible', items: [{ producto_id: chac.id }] })).status, 201);
  const prev = await imp('Sándwiches\tLomito\t7200\nPostres\tKuchen\t2500', { modo: 'reemplazar' });
  assert.deepEqual(prev.body.archivados.sort(), ['Bebida lata', 'Chacarero', 'Jugo; natural']);
  const rep = await imp('Sándwiches\tLomito\t7200\nPostres\tKuchen\t2500', { modo: 'reemplazar', confirmar: true });
  assert.equal(rep.status, 201);
  assert.equal(rep.body.archivados, 3);
  const c2 = (await dueno('GET', '/api/panel/carta')).body;
  // Se borran las categorías sin ningún producto ("Carta", vacía desde el alta); "Bebidas" queda porque guarda los archivados.
  assert.deepEqual(c2.categorias.map((x) => [x.nombre, x.productos.map((q) => q.nombre)]), [['Sándwiches', ['Lomito']], ['Bebidas', []], ['Postres', ['Kuchen']]]);
  assert.equal(c2.categorias[0].productos[0].id, ps[0].id); // el Lomito es el mismo: conserva foto y costo
  // El pedido antiguo sigue nombrando al Chacarero.
  const ped = (await dueno('GET', '/api/panel/pedidos')).body.pedidos;
  assert.equal(ped[0].items[0].nombre, 'Chacarero');
});

test('importar carta y primeros pasos: permisos y límites', async () => {
  const { dueno } = rincon;
  assert.equal((await dueno('POST', '/api/panel/usuarios', { nombre: 'Eli', rol: 'encargado', pin: '5827' })).status, 201);
  assert.equal((await dueno('POST', '/api/panel/usuarios', { nombre: 'Fran', rol: 'cocina', pin: '6938' })).status, 201);
  assert.equal((await dueno('POST', '/api/panel/pin', { pin: '6938' })).status, 200);
  assert.equal((await dueno('POST', '/api/panel/importar', { texto: 'A\tB\t1' })).status, 403); // cocina no toca la carta
  assert.equal((await dueno('GET', '/api/panel/inicio')).status, 403);
  assert.equal((await dueno('POST', '/api/panel/pin', { pin: '5827' })).status, 200);
  assert.equal((await dueno('POST', '/api/panel/importar', { texto: 'Postres\tKuchen\t2600' })).status, 200); // encargado sí
  assert.equal((await dueno('PATCH', '/api/panel/inicio', { cerrado: true })).status, 403); // pero los primeros pasos son del dueño
  // Planilla gigante: 413 con un mensaje claro.
  const r = await dueno('POST', '/api/panel/importar', { texto: 'x'.repeat(310e3) });
  assert.equal(r.status, 413);
  assert.match(r.body.error, /demasiado grande/);
  assert.equal((await dueno('POST', '/api/panel/importar', { filas: Array.from({ length: 501 }, (_, i) => ({ categoria: 'A', nombre: `P${i}`, precio: 1 })) })).status, 400);
  // Sin sesión no hay nada.
  assert.equal((await cliente()('POST', '/api/panel/importar', { texto: 'A\tB\t1' })).status, 401);
});
