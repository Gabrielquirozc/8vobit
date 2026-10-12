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
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', DATA_DIR: path.join(dir, 'data'), SEED_FILE: path.join(dir, 'seed.json'), PANEL_PASSWORD: 'clave-de-prueba', SESSION_SECRET: 'x'.repeat(64) },
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
const login = async () => { cookie = ''; return req('POST', '/api/panel/login', { password: 'clave-de-prueba' }); };

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
    transferencia: { titular: 'Gassuso SpA', rut: '76.123.456-7', banco: 'Banco Estado', tipo: 'Cuenta vista', numero: '123-456-78', email: 'pagos@gassuso.cl' },
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
