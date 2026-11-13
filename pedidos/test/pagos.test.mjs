// Pago con tarjeta en línea (Flow y Mercado Pago) de punta a punta, contra una pasarela simulada
// en este mismo proceso: el servidor real le habla por HTTP igual que a Flow o Mercado Pago.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { firmar } from '../lib/pagos-flow.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const FLOW = { api_key: 'flow-api-key-prueba-1234', secret: 'flow-secret-prueba-5678' };
const MP_TOKEN = 'TEST-1234567890-abcdefghijklmnopqrstuvwxyz-ABCD';
const MP_SECRETO = 'secreto-webhooks-mp-prueba';
let srv, gw, B, G, dir;

// ---------- pasarela simulada ----------
// Flow: exige la firma HMAC en cada llamada. Mercado Pago: exige el Bearer del local.
const pas = { flow: new Map(), mp: new Map(), mpPagos: new Map(), llamadas: [] };
function pasarela(req, res) {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const u = new URL(req.url, 'http://x'), json = (code, b) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(b)); };
    pas.llamadas.push({ metodo: req.method, ruta: u.pathname });
    if (u.pathname.startsWith('/flow/')) {
      const p = Object.fromEntries(req.method === 'GET' ? u.searchParams : new URLSearchParams(raw));
      const { s, ...resto } = p;
      if (p.apiKey !== FLOW.api_key || s !== firmar(resto, FLOW.secret)) return json(401, { code: 108, message: 'Invalid signature' });
      if (u.pathname === '/flow/payment/create') {
        const token = crypto.randomBytes(12).toString('hex');
        pas.flow.set(token, { commerceOrder: p.commerceOrder, amount: Number(p.amount), currency: p.currency, status: 1, email: p.email, urlConfirmation: p.urlConfirmation, urlReturn: p.urlReturn });
        return json(200, { url: 'https://sandbox.flow.cl/app/web/pay.php', token, flowOrder: 1000 + pas.flow.size });
      }
      if (u.pathname === '/flow/payment/getStatus') {
        const x = pas.flow.get(p.token);
        return x ? json(200, { flowOrder: 1, commerceOrder: x.commerceOrder, status: x.status, amount: x.amount, currency: x.currency }) : json(400, { code: 105, message: 'Token not found' });
      }
    }
    if (u.pathname.startsWith('/mp/')) {
      if (req.headers.authorization !== `Bearer ${MP_TOKEN}`) return json(401, { message: 'invalid_token' });
      if (req.method === 'POST' && u.pathname === '/mp/checkout/preferences') {
        const b = JSON.parse(raw), id = `pref-${pas.mp.size + 1}`;
        pas.mp.set(id, b);
        return json(201, { id, init_point: `https://www.mercadopago.cl/checkout/v1/redirect?pref_id=${id}`, sandbox_init_point: `https://sandbox.mercadopago.cl/checkout/v1/redirect?pref_id=${id}` });
      }
      const m = /^\/mp\/v1\/payments\/(\d+)$/.exec(u.pathname);
      if (m) { const x = pas.mpPagos.get(m[1]); return x ? json(200, { id: Number(m[1]), ...x }) : json(404, { message: 'Payment not found' }); }
    }
    json(404, { message: 'no' });
  });
}

before(async () => {
  gw = http.createServer(pasarela);
  await new Promise((ok) => gw.listen(0, '127.0.0.1', ok));
  G = `http://127.0.0.1:${gw.address().port}`;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pedidos-pagos-'));
  const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed/gassuso.json'), 'utf8'));
  for (const d of '0123456') seed.local.horario[d] = ['00:00', '00:00'];
  fs.writeFileSync(path.join(dir, 'seed.json'), JSON.stringify(seed));
  srv = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], {
    cwd: ROOT,
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', DATA_DIR: path.join(dir, 'data'), SEED_FILE: path.join(dir, 'seed.json'), PANEL_PASSWORD: 'clave-de-prueba',
      ADMIN_PASSWORD: 'admin-de-prueba', SESSION_SECRET: 'x'.repeat(64), PAGOS_CLAVE: 'p'.repeat(64), PAGOS_URL_BASE: 'https://pedidos.test',
      FLOW_API_URL_SANDBOX: `${G}/flow`, MP_API_URL: `${G}/mp`, PAGOS_PRODUCCION: '' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  B = await new Promise((ok, fail) => {
    srv.stdout.on('data', (d) => { const m = /http:\/\/([\d.]+:\d+)/.exec(String(d)); if (m) ok(`http://${m[1]}`); });
    srv.on('exit', (c) => fail(new Error(`el servidor terminó con código ${c}`)));
  });
});
after(async () => {
  if (srv && srv.exitCode === null) await new Promise((ok) => { const t = setTimeout(ok, 3000); srv.once('exit', () => { clearTimeout(t); ok(); }); srv.kill(); });
  gw?.close();
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

// Cliente con su propia cookie (dueño de un local, otro local, cliente de la carta…).
function cliente() {
  const jar = new Map();
  let cookie = '';
  return async (method, p, body, headers = {}) => {
    const form = typeof body === 'string';
    const r = await fetch(B + p, { method, redirect: 'manual',
      headers: { 'cf-connecting-ip': `10.1.${Math.random() * 255 | 0}.${Math.random() * 255 | 0}`, ...(body !== undefined ? { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body === undefined ? undefined : form ? body : JSON.stringify(body) });
    for (const sc of r.headers.getSetCookie()) { const [k, v] = sc.split(';')[0].split('='); jar.set(k, v); }
    cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const text = await r.text(); let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: r.status, body: json, headers: r.headers };
  };
}
const pub = cliente();
let dueno;
const productos = async (slug = 'gassuso') => (await pub('GET', `/api/locales/${slug}`)).body.categorias.flatMap((c) => c.productos).filter((p) => p.activo && !p.precio_pendiente && p.precio > 0 && !p.incluye);
async function pedido(slug = 'gassuso') {
  const [p] = await productos(slug);
  const r = await pub('POST', `/api/locales/${slug}/pedidos`, { cliente: 'Ana', telefono: '+56 9 1111 2222', franja: 'Lo antes posible', items: [{ producto_id: p.id, cantidad: 2, agregados: [] }] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { ...r.body, precio: p.precio };
}
const webhookFlow = (ref, token) => pub('POST', `/api/pagos/webhook/flow?ref=${ref}`, `token=${token}`);
const tokenFlowDe = (ref) => [...pas.flow].find(([, x]) => x.commerceOrder === ref)?.[0];
const leerDb = (sql, ...a) => { const db = new DatabaseSync(path.join(dir, 'data', 'pedidos.db'), { readOnly: true }); try { return db.prepare(sql).all(...a); } finally { db.close(); } };

test('sin configurar, la carta no ofrece tarjeta en línea y pagar responde 409', async () => {
  dueno = cliente();
  assert.equal((await dueno('POST', '/api/panel/login', { slug: 'gassuso', password: 'clave-de-prueba' })).status, 200);
  const c = (await dueno('GET', '/api/panel/pagos')).body;
  assert.equal(c.pasarela, null);
  assert.deepEqual(c.servidor, { cifrado: true, url_base: true, produccion: false });
  assert.equal((await pub('GET', '/api/locales/gassuso')).body.local.pago_online, null);
  const p = await pedido();
  assert.equal((await pub('POST', `/api/locales/gassuso/pedido/${p.id}/pagar`, { token: p.token, email: 'ana@correo.cl' })).status, 409);
});

test('panel: credenciales cifradas, nunca devueltas; producción bloqueada en el servidor', async () => {
  assert.equal((await dueno('PUT', '/api/panel/pagos', { pasarela: 'flow', activo: true })).status, 400); // sin credenciales no activa
  assert.equal((await dueno('PUT', '/api/panel/pagos', { pasarela: 'flow', credenciales: { api_key: 'x', secret: 'y' } })).status, 400);
  assert.equal((await dueno('PUT', '/api/panel/pagos', { pasarela: 'flow', modo: 'produccion' })).status, 400);
  const r = await dueno('PUT', '/api/panel/pagos', { pasarela: 'flow', modo: 'sandbox', activo: true, credenciales: FLOW });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.funcionando, true);
  assert.equal(r.body.credenciales.flow.api_key, '••••1234');
  assert.ok(!JSON.stringify(r.body).includes(FLOW.secret) && !JSON.stringify(r.body).includes(FLOW.api_key));
  const [fila] = leerDb('SELECT credenciales FROM local_pagos_config');
  assert.match(fila.credenciales, /^v1\./);
  assert.ok(!fila.credenciales.includes(FLOW.secret) && !fila.credenciales.includes(FLOW.api_key));
  assert.deepEqual((await pub('GET', '/api/locales/gassuso')).body.local.pago_online, { pasarela: 'flow', nombre: 'Flow', pide_email: true, prueba: true });
});

test('Flow sandbox de punta a punta: monto del servidor, pagado solo por el webhook', async () => {
  const p = await pedido();
  const url = `/api/locales/gassuso/pedido/${p.id}/pagar`;
  assert.equal((await pub('POST', url, { token: 'x'.repeat(22), email: 'ana@correo.cl' })).status, 404); // sin el token del pedido
  assert.equal((await pub('POST', url, { token: p.token })).status, 400); // Flow pide correo
  // Un monto mandado por el navegador se ignora: se cobra el total guardado.
  const r = await pub('POST', url, { token: p.token, email: 'ana@correo.cl', monto: 1, total: 1, amount: 1 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(r.body.url, /^https:\/\/sandbox\.flow\.cl\/app\/web\/pay\.php\?token=/);
  const tok = new URL(r.body.url).searchParams.get('token'), x = pas.flow.get(tok);
  assert.equal(x.amount, p.total);
  assert.equal(x.amount, p.precio * 2);
  assert.equal(x.currency, 'CLP');
  assert.equal(x.urlConfirmation, `https://pedidos.test/api/pagos/webhook/flow?ref=${r.body.referencia}`);
  assert.equal(x.urlReturn, `https://pedidos.test/pago/retorno?ref=${r.body.referencia}`);
  // El retorno del navegador (Flow vuelve con POST) no marca nada.
  const ret = await pub('POST', `/pago/retorno?ref=${r.body.referencia}`, `token=${tok}`);
  assert.equal(ret.status, 200);
  assert.match(ret.headers.get('content-security-policy'), /script-src 'self' 'sha256-[\w+/=]+'/);
  assert.equal((await pub('GET', `/api/pagos/estado/${r.body.referencia}`)).body.estado, 'creado');
  assert.equal((await pub('GET', `/api/seguimiento/${p.token}`)).body.pagado, false);
  // Webhook mientras Flow dice "pendiente": sigue sin pagar.
  assert.equal((await webhookFlow(r.body.referencia, tok)).status, 200);
  assert.equal((await pub('GET', `/api/seguimiento/${p.token}`)).body.pagado, false);
  // Flow confirma: el webhook lo marca pagado con tarjeta.
  x.status = 2;
  assert.equal((await webhookFlow(r.body.referencia, tok)).status, 200);
  const seg = (await pub('GET', `/api/seguimiento/${p.token}`)).body;
  assert.equal(seg.pagado, true);
  assert.equal(seg.pago_online, null); // ya pagado: no se ofrece de nuevo
  const ped = (await dueno('GET', `/api/panel/pedidos/${p.id}`)).body;
  assert.equal(ped.medio_pago, 'tarjeta');
  assert.equal(ped.cobrado_por, 'Pago en línea (Flow)');
  assert.equal(ped.pago_online.estado, 'pagado');
  const est = (await pub('GET', `/api/pagos/estado/${r.body.referencia}`)).body;
  assert.equal(est.estado, 'pagado');
  assert.equal(est.seguimiento, p.token);
  // Webhook repetido: no duplica nada.
  const rep = await webhookFlow(r.body.referencia, tok);
  assert.equal(rep.status, 200);
  assert.equal(rep.body.repetido, true);
  assert.equal(leerDb("SELECT COUNT(*) n FROM pago_eventos WHERE referencia=? AND tipo='confirmado'", r.body.referencia)[0].n, 1);
  // Ya pagado: no se puede iniciar otro pago.
  assert.equal((await pub('POST', url, { token: p.token, email: 'ana@correo.cl' })).status, 409);
  // La caja lo cuenta como tarjeta, no como efectivo.
  const caja = (await dueno('GET', '/api/panel/caja')).body;
  assert.ok(JSON.stringify(caja).includes('tarjeta'));
});

test('Flow: webhook con token falso, referencia cruzada o monto distinto se rechaza y queda registrado', async () => {
  const p = await pedido();
  const r = (await pub('POST', `/api/seguimiento/${p.token}/pagar`, { email: 'ana@correo.cl' })).body;
  const tok = tokenFlowDe(r.referencia);
  assert.ok(tok);
  assert.equal((await webhookFlow(r.referencia, 'token-que-no-existe-en-flow')).status, 400);
  assert.equal((await webhookFlow(r.referencia, '')).status, 400);
  assert.equal((await webhookFlow('referencia-que-no-existe-aqui', tok)).status, 404);
  // Token real de OTRO pago usado con esta referencia: Flow informa otra orden.
  const otro = await pedido();
  const r2 = (await pub('POST', `/api/seguimiento/${otro.token}/pagar`, { email: 'ana@correo.cl' })).body;
  const tok2 = tokenFlowDe(r2.referencia);
  pas.flow.get(tok2).status = 2;
  assert.equal((await webhookFlow(r.referencia, tok2)).status, 400);
  assert.equal((await pub('GET', `/api/seguimiento/${p.token}`)).body.pagado, false);
  // Flow informa pagado por otro monto: no se marca.
  Object.assign(pas.flow.get(tok), { status: 2, amount: 1 });
  assert.equal((await webhookFlow(r.referencia, tok)).status, 400);
  assert.equal((await pub('GET', `/api/seguimiento/${p.token}`)).body.pagado, false);
  const tipos = (await dueno('GET', '/api/panel/pagos')).body.eventos.map((e) => e.tipo);
  for (const t of ['firma_invalida', 'error_verificar', 'referencia_distinta', 'monto_distinto']) assert.ok(tipos.includes(t), `${t} en ${tipos}`);
  // Pago rechazado: queda rechazado y el pedido sigue sin pagar (se puede reintentar).
  Object.assign(pas.flow.get(tok), { status: 3, amount: p.total });
  assert.equal((await webhookFlow(r.referencia, tok)).status, 200);
  assert.equal((await pub('GET', `/api/pagos/estado/${r.referencia}`)).body.estado, 'rechazado');
  assert.ok((await pub('GET', `/api/seguimiento/${p.token}`)).body.pago_online);
});

test('Mercado Pago sandbox de punta a punta, con firma de webhook', async () => {
  const c = await dueno('PUT', '/api/panel/pagos', { pasarela: 'mercadopago', credenciales: { access_token: MP_TOKEN, webhook_secret: MP_SECRETO } });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  assert.equal(c.body.credenciales.mercadopago.access_token, 'TEST-••••ABCD');
  assert.equal(c.body.credenciales.flow.api_key, '••••1234'); // las de Flow siguen guardadas
  assert.equal((await pub('GET', '/api/locales/gassuso')).body.local.pago_online.pasarela, 'mercadopago');
  const p = await pedido();
  const r = await pub('POST', `/api/locales/gassuso/pedido/${p.id}/pagar`, { token: p.token, monto: 1 }); // MP no exige correo
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(r.body.url, /^https:\/\/sandbox\.mercadopago\.cl\//);
  const pref = [...pas.mp.values()].find((b) => b.external_reference === r.body.referencia);
  assert.equal(pref.items[0].unit_price, p.total);
  assert.equal(pref.items[0].currency_id, 'CLP');
  assert.equal(pref.notification_url, `https://pedidos.test/api/pagos/webhook/mercadopago?ref=${r.body.referencia}`);
  pas.mpPagos.set('555001', { status: 'approved', external_reference: r.body.referencia, transaction_amount: p.total, currency_id: 'CLP' });
  const hook = (h) => pub('POST', `/api/pagos/webhook/mercadopago?ref=${r.body.referencia}&data.id=555001&type=payment`, { type: 'payment', data: { id: '555001' } }, h);
  // Sin firma o con firma mala: rechazado.
  assert.equal((await hook({})).status, 400);
  assert.equal((await hook({ 'x-signature': 'ts=1,v1=abc', 'x-request-id': 'req-1' })).status, 400);
  assert.equal((await pub('GET', `/api/seguimiento/${p.token}`)).body.pagado, false);
  // Firma válida: pagado.
  const ts = String(Date.now()), v1 = crypto.createHmac('sha256', MP_SECRETO).update(`id:555001;request-id:req-1;ts:${ts};`).digest('hex');
  const ok = await hook({ 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': 'req-1' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal((await pub('GET', `/api/seguimiento/${p.token}`)).body.pagado, true);
  assert.equal((await dueno('GET', `/api/panel/pedidos/${p.id}`)).body.cobrado_por, 'Pago en línea (Mercado Pago)');
  assert.equal((await hook({ 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': 'req-1' })).body.repetido, true);
  // Avisos que no son de pagos se aceptan sin hacer nada.
  assert.equal((await pub('POST', `/api/pagos/webhook/mercadopago?ref=${r.body.referencia}`, { type: 'merchant_order', data: { id: '1' } })).status, 200);
});

test('Mercado Pago: un pago aprobado de otro monto no marca el pedido', async () => {
  const p = await pedido();
  const r = (await pub('POST', `/api/seguimiento/${p.token}/pagar`, {})).body;
  pas.mpPagos.set('555002', { status: 'approved', external_reference: r.referencia, transaction_amount: p.total - 100, currency_id: 'CLP' });
  const ts = '1', v1 = crypto.createHmac('sha256', MP_SECRETO).update('id:555002;request-id:r;ts:1;').digest('hex');
  assert.equal((await pub('POST', `/api/pagos/webhook/mercadopago?ref=${r.referencia}`, { type: 'payment', data: { id: '555002' } }, { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': 'r' })).status, 400);
  assert.equal((await pub('GET', `/api/seguimiento/${p.token}`)).body.pagado, false);
});

test('aislamiento por local: otro dueño no ve la config y no se paga un pedido ajeno (403)', async () => {
  const ad = cliente();
  assert.equal((await ad('POST', '/api/admin/login', { password: 'admin-de-prueba' })).status, 200);
  const nuevo = await ad('POST', '/api/admin/locales', { slug: 'la-picada', nombre: 'La Picada', plan: 'canal', whatsapp: '+56 9 1234 5678' });
  assert.equal(nuevo.status, 201, JSON.stringify(nuevo.body));
  const pic = cliente();
  assert.equal((await pic('POST', '/api/panel/login', { slug: 'la-picada', password: nuevo.body.clave })).status, 200);
  const c = (await pic('GET', '/api/panel/pagos')).body;
  assert.equal(c.pasarela, null);
  assert.deepEqual(c.credenciales, { flow: null, mercadopago: null });
  assert.equal(c.intentos.length, 0);
  assert.equal(c.eventos.length, 0);
  // Un pedido de Gassuso pagado "desde" La Picada.
  const p = await pedido();
  assert.equal((await pub('POST', `/api/locales/la-picada/pedido/${p.id}/pagar`, { token: p.token, email: 'ana@correo.cl' })).status, 403);
  assert.equal((await pub('GET', '/api/locales/la-picada')).body.local.pago_online, null);
});

test('solo el dueño configura el pago en línea', async () => {
  assert.equal((await dueno('POST', '/api/panel/usuarios', { nombre: 'Caja', rol: 'caja', pin: '4826' })).status, 201);
  const caja = cliente();
  assert.equal((await caja('POST', '/api/panel/login', { slug: 'gassuso', password: 'clave-de-prueba' })).status, 200); // asocia la tablet
  assert.equal((await caja('POST', '/api/panel/pin', { pin: '4826' })).status, 200);
  assert.equal((await caja('GET', '/api/panel/pagos')).status, 403);
  assert.equal((await caja('PUT', '/api/panel/pagos', { activo: false })).status, 403);
});

test('prueba de conexión del panel: pago de prueba de $1.000 sin pedido, solo en sandbox', async () => {
  const r = await dueno('POST', '/api/panel/pagos/probar', {});
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const pref = [...pas.mp.values()].find((b) => b.external_reference === r.body.referencia);
  assert.equal(pref.items[0].unit_price, 1000);
  const c = (await dueno('GET', '/api/panel/pagos')).body;
  assert.equal(c.intentos[0].numero, null);
  // Desactivar deja de ofrecerlo en la carta.
  assert.equal((await dueno('PUT', '/api/panel/pagos', { activo: false })).status, 200);
  assert.equal((await pub('GET', '/api/locales/gassuso')).body.local.pago_online, null);
});
