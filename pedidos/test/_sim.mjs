// Ayudas de las pruebas de pagos: pasarela simulada (Flow y Mercado Pago, con el formato real de sus
// respuestas) y arranque del servidor real apuntando a ella por HTTP. No es una prueba (no termina en .test.mjs).
import { spawn } from 'node:child_process';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { firmar } from '../lib/pagos-flow.mjs';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const FLOW = { api_key: 'flow-api-key-prueba-1234', secret: 'flow-secret-prueba-5678' };
export const MP_TOKEN = 'TEST-1234567890-abcdefghijklmnopqrstuvwxyz-ABCD';
export const MP_SECRETO = 'secreto-webhooks-mp-prueba';

// Flow: exige la firma HMAC en cada llamada y responde 400 { code, message } ante un error.
// Mercado Pago: exige el Bearer del local; crear preferencia y devolución responden 201.
export function crearSim() {
  const pas = { flow: new Map(), flowDev: new Map(), mp: new Map(), mpPagos: new Map(), mpDev: [], mpClaves: new Map(), llamadas: [], mpIdempotencia: [] };
  const cuenta = (m, r) => pas.llamadas.filter((x) => x.metodo === m && x.ruta === r).length;
  function servidor(req, res) {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const u = new URL(req.url, 'http://x'), json = (code, b) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(b)); };
      pas.llamadas.push({ metodo: req.method, ruta: u.pathname });
      if (u.pathname.startsWith('/flow/')) {
        const p = Object.fromEntries(req.method === 'GET' ? u.searchParams : new URLSearchParams(raw));
        const { s, ...resto } = p;
        if (p.apiKey !== FLOW.api_key || s !== firmar(resto, FLOW.secret)) return json(401, { code: 108, message: 'Invalid signature' });
        const ficha = (x, token) => ({ flowOrder: x.flowOrder, commerceOrder: x.commerceOrder, requestDate: '2026-11-13 10:00:00', status: x.status, subject: 'Pedido', currency: x.currency,
          amount: String(x.amount), payer: x.email, token });
        if (u.pathname === '/flow/payment/create') {
          const token = crypto.randomBytes(12).toString('hex');
          pas.flow.set(token, { flowOrder: 1000 + pas.flow.size, commerceOrder: p.commerceOrder, amount: Number(p.amount), currency: p.currency, status: 1, email: p.email, urlConfirmation: p.urlConfirmation, urlReturn: p.urlReturn });
          return json(200, { url: 'https://sandbox.flow.cl/app/web/pay.php', token, flowOrder: pas.flow.get(token).flowOrder });
        }
        if (u.pathname === '/flow/payment/getStatus') {
          const x = pas.flow.get(p.token);
          return x ? json(200, ficha(x, p.token)) : json(400, { code: 105, message: 'Token not found' });
        }
        if (u.pathname === '/flow/payment/getStatusByCommerceId') {
          // Fallas de la pasarela para probar el barrido: JSON roto o error 500.
          if (pas.flowModo === 'basura') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('esto no es json'); }
          if (pas.flowModo === '500') return json(500, { message: 'boom' });
          const e = [...pas.flow].find(([, x]) => x.commerceOrder === p.commerceId);
          return e ? json(200, ficha(e[1], e[0])) : json(400, { code: 105, message: 'Order not found' });
        }
        if (u.pathname === '/flow/refund/create') {
          const e = [...pas.flow].find(([, x]) => x.commerceOrder === p.commerceTrxId);
          if (!e || e[1].status !== 2 || Number(p.amount) !== e[1].amount || !p.receiverEmail || !p.urlCallBack) return json(400, { code: 111, message: 'Invalid refund' });
          if ([...pas.flowDev.values()].some((d) => d.refundCommerceOrder === p.refundCommerceOrder)) return json(400, { code: 112, message: 'Duplicated refund order' });
          const token = crypto.randomBytes(12).toString('hex');
          pas.flowDev.set(token, { refundCommerceOrder: p.refundCommerceOrder, commerceOrder: p.commerceTrxId, amount: Number(p.amount), receiverEmail: p.receiverEmail, urlCallBack: p.urlCallBack, status: 'created' });
          if (pas.flowFalla500) { pas.flowFalla500 = false; return json(500, { message: 'se creó pero la respuesta se perdió' }); }
          return json(200, { token, flowRefundOrder: 9000 + pas.flowDev.size, date: '2026-11-13 10:05:00', status: 'created', amount: p.amount, fee: 0 });
        }
        if (u.pathname === '/flow/refund/getStatus') {
          const d = p.token ? pas.flowDev.get(p.token) : [...pas.flowDev.values()].find((x) => x.refundCommerceOrder === p.refundCommerceOrder);
          return d ? json(200, { flowRefundOrder: 9001, date: '2026-11-13 10:05:00', status: d.status, amount: String(d.amount), fee: 0 }) : json(400, { code: 105, message: 'Token not found' });
        }
      }
      if (u.pathname.startsWith('/mp/')) {
        if (req.headers.authorization !== `Bearer ${MP_TOKEN}`) return json(401, { message: 'invalid_token' });
        if (req.method === 'POST' && u.pathname === '/mp/checkout/preferences') {
          const b = JSON.parse(raw), id = `pref-${pas.mp.size + 1}`;
          pas.mp.set(id, b);
          return json(201, { id, init_point: `https://www.mercadopago.cl/checkout/v1/redirect?pref_id=${id}`, sandbox_init_point: `https://sandbox.mercadopago.cl/checkout/v1/redirect?pref_id=${id}` });
        }
        if (req.method === 'GET' && u.pathname === '/mp/v1/payments/search') {
          const results = [...pas.mpPagos].filter(([, x]) => x.external_reference === u.searchParams.get('external_reference')).map(([id, x]) => ({ id: Number(id), ...x }));
          return json(200, { paging: { total: results.length, limit: 30, offset: 0 }, results });
        }
        const m = /^\/mp\/v1\/payments\/(\d+)(\/refunds)?$/.exec(u.pathname);
        if (m && !m[2] && req.method === 'GET') { const x = pas.mpPagos.get(m[1]); return x ? json(200, { id: Number(m[1]), refunds: [], ...x }) : json(404, { message: 'Payment not found' }); }
        if (m && m[2] && req.method === 'GET') return json(200, pas.mpDev.filter((d) => String(d.payment_id) === m[1]));
        if (m && m[2] && req.method === 'POST') {
          const x = pas.mpPagos.get(m[1]), clave = req.headers['x-idempotency-key'];
          if (!clave) return json(400, { message: 'x-idempotency-key header is required' });
          pas.mpIdempotencia.push(clave);
          if (pas.mpClaves.has(clave)) return json(201, pas.mpClaves.get(clave));
          if (pas.mpRechaza400) return json(400, { message: 'a refund is already in progress' });
          if (!x || x.status !== 'approved') return json(400, { message: 'Payment cannot be refunded' });
          const d = { id: 7000 + pas.mpDev.length, payment_id: Number(m[1]), amount: x.transaction_amount, status: pas.mpDevEstado || 'approved' };
          if (d.status === 'approved') x.status = 'refunded';
          pas.mpDev.push(d); pas.mpClaves.set(clave, d);
          if (pas.mpFalla500) { pas.mpFalla500 = false; return json(500, { message: 'se creó pero la respuesta se perdió' }); }
          return json(201, d);
        }
      }
      json(404, { message: 'no' });
    });
  }
  return { pas, servidor, cuenta };
}

// Servidor real en un puerto libre, con una carpeta de datos propia y la pasarela simulada de `sim`.
export async function levantar(sim, extra = {}) {
  const gw = http.createServer(sim.servidor);
  await new Promise((ok) => gw.listen(0, '127.0.0.1', ok));
  const G = `http://127.0.0.1:${gw.address().port}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pedidos-pagos-'));
  const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed/gassuso.json'), 'utf8'));
  for (const d of '0123456') seed.local.horario[d] = ['00:00', '00:00'];
  fs.writeFileSync(path.join(dir, 'seed.json'), JSON.stringify(seed));
  const srv = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], {
    cwd: ROOT,
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', DATA_DIR: path.join(dir, 'data'), SEED_FILE: path.join(dir, 'seed.json'), PANEL_PASSWORD: 'clave-de-prueba',
      ADMIN_PASSWORD: 'admin-de-prueba', SESSION_SECRET: 'x'.repeat(64), PAGOS_CLAVE: 'p'.repeat(64), PAGOS_URL_BASE: 'https://pedidos.test',
      FLOW_API_URL_SANDBOX: `${G}/flow`, MP_API_URL: `${G}/mp`, PAGOS_PRODUCCION: '', PAGOS_CONCILIAR_MS: '0', ...extra },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const B = await new Promise((ok, fail) => {
    srv.stdout.on('data', (d) => { const m = /http:\/\/([\d.]+:\d+)/.exec(String(d)); if (m) ok(`http://${m[1]}`); });
    srv.on('exit', (c) => fail(new Error(`el servidor terminó con código ${c}`)));
  });
  const cerrar = async () => {
    if (srv.exitCode === null) await new Promise((ok) => { const t = setTimeout(ok, 3000); srv.once('exit', () => { clearTimeout(t); ok(); }); srv.kill(); });
    gw.close();
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  };
  const leerDb = (sql, ...a) => { const db = new DatabaseSync(path.join(dir, 'data', 'pedidos.db'), { readOnly: true }); try { return db.prepare(sql).all(...a); } finally { db.close(); } };
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
  // Escritura directa en la base (solo para armar un caso, p. ej. cambiar el total de un pedido ya iniciado).
  const escribirDb = (sql, ...a) => { const db = new DatabaseSync(path.join(dir, 'data', 'pedidos.db')); try { db.exec('PRAGMA busy_timeout=5000'); db.prepare(sql).run(...a); } finally { db.close(); } };
  return { B, G, dir, cerrar, leerDb, escribirDb, cliente, pas: sim.pas, sim };
}

// Un pedido web de la carta (2 unidades del primer producto con precio) y el helper de espera.
export async function nuevoPedido(pub, slug = 'gassuso') {
  const carta = (await pub('GET', `/api/locales/${slug}`)).body.categorias.flatMap((c) => c.productos).filter((p) => p.activo && !p.precio_pendiente && p.precio > 0 && !p.incluye);
  const r = await pub('POST', `/api/locales/${slug}/pedidos`, { cliente: 'Ana', telefono: '+56 9 1111 2222', franja: 'Lo antes posible', items: [{ producto_id: carta[0].id, cantidad: 2, agregados: [] }] });
  if (r.status !== 201) throw new Error(`no se pudo crear el pedido: ${JSON.stringify(r.body)}`);
  return { ...r.body, precio: carta[0].precio };
}
export const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
export async function hasta(fn, ms = 8000) { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('tiempo agotado esperando la condición'); await esperar(150); } }
