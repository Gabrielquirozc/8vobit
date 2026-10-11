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
    headers: { ...(body && !raw ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
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
  assert.equal((await pedir([{ producto_id: (await prod('Papas')).id }])).status, 400);
  assert.equal((await pedir([{ producto_id: 999999 }])).status, 400);
  assert.equal((await pedir([])).status, 400);
});

test('limita la cantidad por línea y rechaza franjas inventadas', async () => {
  const p = await prod('Italiano');
  const r = await pedir([{ producto_id: p.id, cantidad: 500 }]);
  assert.equal(r.body.total, p.precio * 20);
  assert.equal((await pedir([{ producto_id: p.id }], { franja: '03:00–03:30' })).status, 400);
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
