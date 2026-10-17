// Pruebas de promociones y combos, inventario y recetas, y clientes con cupón de vuelta.
// Servidor real con base temporal, igual que api.test.mjs.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
let srv, B, dir;

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pedidos-pro-'));
  const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed/gassuso.json'), 'utf8'));
  for (const d of '0123456') seed.local.horario[d] = ['00:00', '00:00'];
  seed.local.despacho = { activo: true, costo: 0, minimo: 0, zona: '', horario: Object.fromEntries([...'0123456'].map((d) => [d, ['00:00', '00:00']])) };
  fs.writeFileSync(path.join(dir, 'seed.json'), JSON.stringify(seed));
  srv = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], {
    cwd: ROOT,
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', DATA_DIR: path.join(dir, 'data'), SEED_FILE: path.join(dir, 'seed.json'), PANEL_PASSWORD: 'clave-de-prueba', ADMIN_PASSWORD: 'admin-de-prueba', SESSION_SECRET: 'y'.repeat(64) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  B = await new Promise((ok, fail) => {
    srv.stdout.on('data', (d) => { const m = /http:\/\/([\d.]+:\d+)/.exec(String(d)); if (m) ok(`http://${m[1]}`); });
    srv.on('exit', (c) => fail(new Error(`el servidor terminó con código ${c}`)));
  });
});
after(() => { srv?.kill(); fs.rmSync(dir, { recursive: true, force: true }); });

// Cliente con su propio frasco de cookies.
function cliente() {
  const jar = new Map();
  return async (method, p, body) => {
    const r = await fetch(B + p, {
      method, redirect: 'manual',
      headers: { 'cf-connecting-ip': `10.7.${Math.random() * 255 | 0}.${Math.random() * 255 | 0}`, ...(body ? { 'Content-Type': 'application/json' } : {}), Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); }
    const text = await r.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: r.status, body: json };
  };
}
const pub = cliente(), panel = cliente(), ad = cliente();
const menu = async () => (await pub('GET', '/api/locales/gassuso')).body;
const prod = async (nombre) => (await menu()).categorias.flatMap((c) => c.productos).find((p) => p.nombre === nombre);
const pedir = (items, extra = {}) => pub('POST', '/api/locales/gassuso/pedidos', { cliente: 'Ana Pérez', telefono: '+56 9 1111 2222', franja: 'Lo antes posible', items, ...extra });
const vendibles = async () => (await menu()).categorias.flatMap((c) => c.productos).filter((p) => p.activo && !p.precio_pendiente && p.precio > 0 && !p.incluye);
let gasId;
async function plan(p) {
  await ad('POST', '/api/admin/login', { password: 'admin-de-prueba' });
  gasId ||= (await ad('GET', '/api/admin/resumen')).body.locales.find((l) => l.slug === 'gassuso').id;
  assert.equal((await ad('PATCH', `/api/admin/locales/${gasId}/licencia`, { plan: p })).status, 200);
}

test('plan Gestión: clientes sí; promociones e inventario piden el plan Pro', async () => {
  assert.equal((await panel('GET', '/api/panel/promos')).status, 401);
  assert.equal((await panel('POST', '/api/panel/login', { slug: 'gassuso', password: 'clave-de-prueba' })).status, 200);
  assert.equal((await panel('GET', '/api/panel/clientes')).status, 200);
  const r = await panel('GET', '/api/panel/promos');
  assert.equal(r.status, 402);
  assert.equal(r.body.plan_requerido, 'pro');
  assert.equal((await panel('GET', '/api/panel/inventario')).status, 402);
  assert.deepEqual((await menu()).promociones, []);
  // sin plan Pro, un código no aplica
  const [a] = await vendibles();
  assert.match((await pedir([{ producto_id: a.id }], { codigo: 'NOEXISTE' })).body.error, /código/);
});

test('promociones: automática, por código, por categoría, mínimo y la mejor gana', async () => {
  await plan('pro');
  const [a, b] = await vendibles();
  for (const x of [{ nombre: '', tipo: 'pct', valor: 10 }, { nombre: 'X', tipo: 'pct', valor: 95 }, { nombre: 'X', tipo: 'otro', valor: 5 }, { nombre: 'X', tipo: 'pct', valor: 10, desde: '10:00' }, { nombre: 'X', tipo: 'pct', valor: 10, codigo: 'AB' }])
    assert.equal((await panel('POST', '/api/panel/promos', x)).status, 400, JSON.stringify(x));
  const auto = await panel('POST', '/api/panel/promos', { nombre: 'Semana de lanzamiento', tipo: 'pct', valor: 10 });
  assert.equal(auto.status, 201);
  assert.equal((await menu()).promociones[0].nombre, 'Semana de lanzamiento');
  // vista previa y pedido con la automática
  const items = [{ producto_id: a.id, cantidad: 2 }];
  const prev = await pub('POST', '/api/locales/gassuso/promo', { items });
  assert.equal(prev.body.descuento, Math.round(a.precio * 2 * 0.1));
  const r = await pedir(items);
  assert.equal(r.status, 201);
  assert.equal(r.body.total, a.precio * 2 - Math.round(a.precio * 2 * 0.1));
  assert.equal(r.body.promo, 'Semana de lanzamiento');
  // código que descuenta más
  const cod = await panel('POST', '/api/panel/promos', { nombre: 'Instagram', tipo: 'monto', valor: 3000, codigo: 'insta-3000', minimo: a.precio, usos_max: 1 });
  assert.equal(cod.body.codigo, 'INSTA3000');
  assert.equal((await panel('POST', '/api/panel/promos', { nombre: 'Otra', tipo: 'pct', valor: 5, codigo: 'INSTA3000' })).status, 400); // código repetido
  assert.match((await pedir([{ producto_id: b.id }], { codigo: 'NADA' })).body.error, /no existe/);
  const conCod = await pedir(items, { codigo: 'insta3000' });
  assert.equal(conCod.body.total, a.precio * 2 - Math.min(3000, a.precio * 2));
  // se usó una vez: ya no vale
  assert.match((await pedir(items, { codigo: 'INSTA3000' })).body.error, /vigente/);
  // anular el pedido devuelve el uso
  assert.equal((await panel('PATCH', `/api/panel/pedidos/${conCod.body.id}`, { estado: 'anulado' })).status, 200);
  assert.equal((await panel('GET', '/api/panel/promos')).body.promociones.find((p) => p.codigo === 'INSTA3000').usos, 0);
  // el panel y el seguimiento muestran el descuento
  const p = (await panel('GET', `/api/panel/pedidos/${r.body.id}`)).body;
  assert.equal(p.descuento, Math.round(a.precio * 2 * 0.1));
  assert.equal((await pub('GET', `/api/seguimiento/${r.body.token}`)).body.promo, 'Semana de lanzamiento');
  // una promoción de otro día no aplica; pausada tampoco
  const otroDia = (new Date().getDay() + 3) % 7;
  await panel('PATCH', `/api/panel/promos/${auto.body.id}`, { dias: [otroDia] });
  assert.equal((await pub('POST', '/api/locales/gassuso/promo', { items })).body.descuento, 0);
  await panel('PATCH', `/api/panel/promos/${auto.body.id}`, { dias: [], activa: false });
  assert.equal((await pub('POST', '/api/locales/gassuso/promo', { items })).body.descuento, 0);
  assert.deepEqual((await menu()).promociones, []);
});

test('combos: muestran lo que incluyen y no se anidan', async () => {
  const [a, b, c] = await vendibles();
  const r = await panel('PUT', `/api/panel/combos/${a.id}`, { items: [{ producto_id: b.id, cantidad: 1 }, { producto_id: c.id, cantidad: 2 }] });
  assert.equal(r.status, 200);
  assert.equal(r.body.items.length, 2);
  const p = await prod(a.nombre);
  assert.deepEqual(p.combo.map((x) => x.producto_id).sort(), [b.id, c.id].sort());
  assert.equal((await panel('PUT', `/api/panel/combos/${b.id}`, { items: [{ producto_id: a.id }] })).status, 400); // combo dentro de combo
  assert.equal((await panel('PUT', `/api/panel/combos/${b.id}`, { items: [{ producto_id: b.id }] })).status, 400); // a sí mismo
  assert.equal((await panel('PUT', '/api/panel/combos/999999', { items: [] })).status, 404);
});

test('inventario: la venta descuenta según la receta (y la de los combos), la anulación devuelve y la compra promedia el costo', async () => {
  const [a, b, c] = await vendibles(); // a es combo de b + 2×c (prueba anterior)
  for (const x of [{ nombre: '' }, { nombre: 'Pan', unidad: 'saco' }, { nombre: 'Pan', costo: -1 }])
    assert.equal((await panel('POST', '/api/panel/inventario/insumos', x)).status, 400, JSON.stringify(x));
  const pan = (await panel('POST', '/api/panel/inventario/insumos', { nombre: 'Pan frica', unidad: 'un', costo: 200, minimo: 5, stock: 20 })).body;
  const carne = (await panel('POST', '/api/panel/inventario/insumos', { nombre: 'Carne', unidad: 'kg', costo: 10000, minimo: 1, stock: 3 })).body;
  assert.equal((await panel('POST', '/api/panel/inventario/insumos', { nombre: 'pan frica' })).status, 400); // repetido
  assert.equal((await panel('PUT', `/api/panel/inventario/recetas/${b.id}`, { items: [{ insumo_id: pan.id, cantidad: 0 }] })).status, 400);
  const rb = await panel('PUT', `/api/panel/inventario/recetas/${b.id}`, { items: [{ insumo_id: pan.id, cantidad: 1 }, { insumo_id: carne.id, cantidad: 0.15 }] });
  assert.equal(rb.body.costo, 200 + 1500);
  await panel('PUT', `/api/panel/inventario/recetas/${c.id}`, { items: [{ insumo_id: pan.id, cantidad: 2 }] });
  // 1×b + 1×a (combo: 1×b + 2×c) → pan 1 + (1 + 2×2) = 6; carne 0,15 × 2 = 0,3
  const r = await pedir([{ producto_id: b.id }, { producto_id: a.id }]);
  assert.equal(r.status, 201);
  let I = (await panel('GET', '/api/panel/inventario')).body;
  assert.equal(I.insumos.find((i) => i.id === pan.id).stock, 14);
  assert.equal(I.insumos.find((i) => i.id === carne.id).stock, 2.7);
  // costo real del producto en el pedido: el de la receta
  const ped = (await panel('GET', `/api/panel/pedidos/${r.body.id}`)).body;
  assert.ok(ped.items.length === 2);
  // anular devuelve todo, una sola vez
  await panel('PATCH', `/api/panel/pedidos/${r.body.id}`, { estado: 'anulado' });
  await panel('PATCH', `/api/panel/pedidos/${r.body.id}`, { estado: 'anulado' });
  I = (await panel('GET', '/api/panel/inventario')).body;
  assert.equal(I.insumos.find((i) => i.id === pan.id).stock, 20);
  // compra: 20 a $200 + 10 por $3.500 → (4.000 + 3.500) / 30 = $250, y queda como gasto de insumos
  const k = await panel('POST', '/api/panel/inventario/compras', { insumo_id: pan.id, cantidad: 10, total: 3500, gasto: true, medio: 'transferencia' });
  assert.equal(k.status, 201);
  assert.equal(k.body.stock, 30);
  assert.equal(k.body.costo, 250);
  const g = (await panel('GET', '/api/panel/gastos')).body;
  assert.ok(g.gastos.some((x) => x.categoria === 'insumos' && x.monto === 3500));
  // conteo y merma; alerta bajo el mínimo
  assert.equal((await panel('POST', '/api/panel/inventario/ajustes', { insumo_id: pan.id, tipo: 'conteo', cantidad: 4 })).body.stock, 4);
  assert.equal((await panel('POST', '/api/panel/inventario/ajustes', { insumo_id: carne.id, tipo: 'merma', cantidad: 0.5 })).body.stock, 2.5);
  assert.equal((await panel('POST', '/api/panel/inventario/ajustes', { insumo_id: pan.id, tipo: 'robo', cantidad: 1 })).status, 400);
  I = (await panel('GET', '/api/panel/inventario')).body;
  assert.equal(I.bajos, 1);
  assert.equal(I.recetas[b.id].length, 2);
  const movs = (await panel('GET', `/api/panel/inventario/movimientos?insumo=${pan.id}`)).body.movimientos;
  assert.deepEqual([...new Set(movs.map((m) => m.tipo))].sort(), ['ajuste', 'anulacion', 'compra', 'conteo', 'venta']);
});

test('clientes y cupón de vuelta: un cupón por cliente, solo con su celular y una vez', async () => {
  const [, , , d] = await vendibles();
  await pedir([{ producto_id: d.id }]);
  const L = (await panel('GET', '/api/panel/clientes')).body;
  const ana = L.clientes.find((c) => c.nombre === 'Ana Pérez');
  assert.ok(ana.pedidos >= 2);
  assert.equal(ana.tipo, 'frecuente');
  assert.equal((await panel('GET', `/api/panel/clientes/${ana.clave}`)).body.pedidos.length >= 2, true);
  assert.equal((await panel('GET', '/api/panel/clientes?q=ana')).body.total, 1);
  assert.equal((await panel('PUT', '/api/panel/clientes/fidelizacion', { activo: true, pct: 80 })).status, 400);
  assert.equal((await panel('PUT', '/api/panel/clientes/fidelizacion', { activo: true, pct: 15, dias: 30 })).status, 200);
  const r = await pedir([{ producto_id: d.id }]);
  assert.equal(r.body.cupon.valor, 15);
  const codigo = r.body.cupon.codigo;
  assert.match(codigo, /^[A-Z2-9]{6}$/);
  assert.equal((await pub('GET', `/api/seguimiento/${r.body.token}`)).body.cupon.codigo, codigo);
  // un segundo pedido no entrega otro cupón mientras el primero siga vigente
  assert.equal((await pedir([{ producto_id: d.id }])).body.cupon, null);
  // otro celular no puede usarlo
  assert.match((await pedir([{ producto_id: d.id }], { telefono: '+56 9 3333 4444', codigo })).body.error, /celular/);
  const usa = await pedir([{ producto_id: d.id, cantidad: 2 }], { codigo });
  assert.equal(usa.body.total, d.precio * 2 - Math.round(d.precio * 2 * 0.15));
  assert.match((await pedir([{ producto_id: d.id }], { codigo })).body.error, /vigente/);
  // borrar los datos del cliente borra también sus cupones
  assert.equal((await panel('POST', '/api/panel/privacidad/borrar', { telefono: '+56 9 1111 2222' })).status, 200);
  assert.equal((await panel('GET', '/api/panel/clientes?q=ana')).body.total, 0);
});

test('sin plan Pro vuelven los candados (los datos quedan)', async () => {
  await plan('canal');
  assert.equal((await panel('GET', '/api/panel/clientes')).status, 402);
  assert.equal((await panel('GET', '/api/panel/inventario')).status, 402);
  assert.deepEqual((await menu()).promociones, []);
  await plan('pro');
  assert.ok((await panel('GET', '/api/panel/inventario')).body.insumos.length >= 2);
});
