// Demo de pedidos propios para locales delivery (piloto Gassuso).
// Sin dependencias: http nativo + node:sqlite. Pensado para correr con muy poca
// RAM en lenovo-edge, que ya tiene a Immich ocupando la mayor parte.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const PORT = Number(process.env.PORT || 8099);
const HOST = process.env.HOST || '127.0.0.1';
const BASE = (process.env.BASE_PATH || '').replace(/\/$/, '');
const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
const PANEL_PASSWORD = process.env.PANEL_PASSWORD || '';
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const PUBLIC = path.resolve(import.meta.dirname, 'public');
const SEED_FILE = process.env.SEED_FILE || path.resolve(import.meta.dirname, 'seed/gassuso.json');
const TRUST_PROXY = process.env.TRUST_PROXY !== '0'; // detrás de cloudflared: la IP real viene en cf-connecting-ip
const BACKUP_DIAS = Number(process.env.BACKUP_DIAS || 14);
const SLOT_MIN = 30;
const LEAD_MIN = 20; // margen mínimo antes de la primera franja

fs.mkdirSync(DATA_DIR, { recursive: true });
const IMG_DIR = path.join(DATA_DIR, 'img');
fs.mkdirSync(IMG_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'pedidos.db'));
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS locales (
  id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, nombre TEXT NOT NULL,
  instagram TEXT, whatsapp TEXT, horario TEXT NOT NULL, cupo_franja INTEGER NOT NULL DEFAULT 10,
  modo_boleta INTEGER NOT NULL DEFAULT 2);
CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY, local_id INTEGER NOT NULL REFERENCES locales(id),
  nombre TEXT NOT NULL, orden INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS productos (
  id INTEGER PRIMARY KEY, local_id INTEGER NOT NULL REFERENCES locales(id),
  categoria_id INTEGER NOT NULL REFERENCES categorias(id), nombre TEXT NOT NULL,
  descripcion TEXT, precio INTEGER NOT NULL DEFAULT 0, activo INTEGER NOT NULL DEFAULT 1,
  precio_pendiente INTEGER NOT NULL DEFAULT 0, incluye INTEGER NOT NULL DEFAULT 0, orden INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS agregados (
  id INTEGER PRIMARY KEY, local_id INTEGER NOT NULL REFERENCES locales(id),
  nombre TEXT NOT NULL, disponible INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS historial_precio (
  id INTEGER PRIMARY KEY, local_id INTEGER NOT NULL, producto_id INTEGER NOT NULL,
  anterior INTEGER, nuevo INTEGER, fecha TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS pedidos (
  id INTEGER PRIMARY KEY, local_id INTEGER NOT NULL, numero INTEGER NOT NULL,
  cliente TEXT NOT NULL, telefono TEXT NOT NULL, franja TEXT NOT NULL,
  modalidad TEXT NOT NULL, direccion TEXT, notas TEXT,
  estado TEXT NOT NULL DEFAULT 'nuevo', pagado INTEGER NOT NULL DEFAULT 0,
  folio_boleta TEXT, total INTEGER NOT NULL, dia TEXT NOT NULL,
  creado TEXT NOT NULL DEFAULT (datetime('now','localtime')), actualizado INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS pedido_items (
  id INTEGER PRIMARY KEY, pedido_id INTEGER NOT NULL REFERENCES pedidos(id),
  producto_id INTEGER NOT NULL, nombre TEXT NOT NULL, agregados TEXT NOT NULL DEFAULT '[]',
  cantidad INTEGER NOT NULL, precio_unitario INTEGER NOT NULL);
`);

// Columnas de cobro agregadas después de la primera versión: migración idempotente.
{
  const cols = new Set(db.prepare('PRAGMA table_info(pedidos)').all().map((c) => c.name));
  if (!cols.has('medio_pago')) db.exec('ALTER TABLE pedidos ADD COLUMN medio_pago TEXT');
  if (!cols.has('recibido')) db.exec('ALTER TABLE pedidos ADD COLUMN recibido INTEGER');
  if (!cols.has('cobrado_en')) db.exec('ALTER TABLE pedidos ADD COLUMN cobrado_en TEXT');
  const pcols = new Set(db.prepare('PRAGMA table_info(productos)').all().map((c) => c.name));
  if (!pcols.has('destacado')) db.exec('ALTER TABLE productos ADD COLUMN destacado INTEGER NOT NULL DEFAULT 0');
  if (!pcols.has('imagen')) db.exec('ALTER TABLE productos ADD COLUMN imagen TEXT');
}

// Las fotos del seed (entregadas por el local) se copian al volumen de datos para
// que se sirvan y reemplacen igual que las que se suben desde el panel.
function seedImg(lid, file) {
  if (!file) return null;
  const nombre = `${lid}-seed-${path.basename(file)}`;
  fs.copyFileSync(path.resolve(import.meta.dirname, 'seed/img', path.basename(file)), path.join(IMG_DIR, nombre));
  return nombre;
}

function seed() {
  if (db.prepare('SELECT COUNT(*) n FROM locales').get().n) return;
  const s = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  const L = s.local;
  const { lastInsertRowid: lid } = db.prepare(
    'INSERT INTO locales (slug,nombre,instagram,whatsapp,horario,cupo_franja,modo_boleta) VALUES (?,?,?,?,?,?,?)'
  ).run(L.slug, L.nombre, L.instagram, L.whatsapp, JSON.stringify(L.horario), L.cupo_franja, L.modo_boleta);
  for (const a of s.agregados) db.prepare('INSERT INTO agregados (local_id,nombre) VALUES (?,?)').run(lid, a);
  s.categorias.forEach((c, ci) => {
    const { lastInsertRowid: cid } = db.prepare('INSERT INTO categorias (local_id,nombre,orden) VALUES (?,?,?)').run(lid, c.nombre, ci);
    c.productos.forEach((p, pi) => db.prepare(
      'INSERT INTO productos (local_id,categoria_id,nombre,descripcion,precio,precio_pendiente,incluye,orden,destacado,imagen) VALUES (?,?,?,?,?,?,?,?,?,?)'
    ).run(lid, cid, p.nombre, p.desc || null, p.precio, p.pendiente ? 1 : 0, p.incluye || 0, pi, p.destacado ? 1 : 0, seedImg(lid, p.imagen)));
  });
}
seed();

// ---------- franjas horarias ----------
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const fmt = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// Día "operativo": si es antes del cierre de madrugada del día anterior, sigue contando como ese día.
function franjas(local) {
  const horario = JSON.parse(local.horario);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const candidates = [];
  for (const offset of [-1, 0]) {
    const d = new Date(now); d.setDate(d.getDate() + offset);
    const h = horario[d.getDay()];
    if (!h) continue;
    const open = toMin(h[0]);
    let close = toMin(h[1]); if (close <= open) close += 24 * 60;
    const nowRel = nowMin + (offset === -1 ? 24 * 60 : 0);
    if (nowRel >= close) continue;
    const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    let start = Math.max(open, nowRel + LEAD_MIN);
    start = Math.ceil(start / SLOT_MIN) * SLOT_MIN;
    const usados = Object.fromEntries(db.prepare(
      "SELECT franja, COUNT(*) n FROM pedidos WHERE local_id=? AND dia=? AND estado!='anulado' GROUP BY franja"
    ).all(local.id, dia).map((r) => [r.franja, r.n]));
    const slots = [];
    for (let m = start; m + SLOT_MIN <= close + 1; m += SLOT_MIN) {
      const label = `${fmt(m)}–${fmt(m + SLOT_MIN)}`;
      slots.push({ franja: label, disponible: (usados[label] || 0) < local.cupo_franja });
    }
    candidates.push({ dia, abierto: nowRel >= open, slots });
  }
  const c = candidates.find((x) => x.abierto) || candidates[candidates.length - 1];
  return c || { dia: today(), abierto: false, slots: [] };
}

// ---------- sesión del panel ----------
const sign = (v) => crypto.createHmac('sha256', SECRET).update(v).digest('base64url');
function makeSession(localId) {
  const v = `${localId}.${Date.now() + 12 * 3600e3}`;
  return `${v}.${sign(v)}`;
}
function session(req) {
  const m = /(?:^|;\s*)panel=([^;]+)/.exec(req.headers.cookie || '');
  if (!m) return null;
  const [lid, exp, sig] = m[1].split('.');
  const v = `${lid}.${exp}`;
  const good = sign(v);
  if (!sig || sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  if (Number(exp) < Date.now()) return null;
  return Number(lid);
}

// ---------- límites de uso ----------
// Ventana deslizante en memoria: basta para un solo contenedor. Frena fuerza bruta
// sobre la clave del panel y pedidos falsos en masa, sin molestar a un cliente real.
const hits = new Map();
function limitar(clave, max, ventanaMs) {
  const ahora = Date.now();
  const arr = (hits.get(clave) || []).filter((t) => ahora - t < ventanaMs);
  arr.push(ahora); hits.set(clave, arr);
  return arr.length > max;
}
setInterval(() => { const a = Date.now(); for (const [k, v] of hits) if (!v.some((t) => a - t < 3600e3)) hits.delete(k); }, 600e3).unref();
const ipDe = (req) => (TRUST_PROXY && req.headers['cf-connecting-ip']) || req.socket.remoteAddress || '?';

// ---------- respaldos ----------
// Copia consistente de la base con VACUUM INTO, una por día, conservando BACKUP_DIAS.
// Las fotos ya están en el mismo volumen; copiar /data completo fuera del servidor
// sigue siendo necesario para sobrevivir a una falla de disco.
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
function respaldar() {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const f = path.join(BACKUP_DIR, `pedidos-${today()}.db`);
    if (!fs.existsSync(f)) db.exec(`VACUUM INTO '${f.replace(/'/g, "''")}'`);
    const viejos = fs.readdirSync(BACKUP_DIR).filter((n) => /^pedidos-\d{4}-\d{2}-\d{2}\.db$/.test(n)).sort().slice(0, -BACKUP_DIAS);
    for (const n of viejos) fs.rmSync(path.join(BACKUP_DIR, n), { force: true });
  } catch (e) { console.error('respaldo falló:', e.message); }
}
respaldar();
setInterval(respaldar, 3600e3).unref();

// ---------- cabeceras de seguridad ----------
// CSP con el hash de cada <script> en línea de cada página: un script inyectado no corre.
const cspPagina = new Map();
function csp(file) {
  if (!cspPagina.has(file)) {
    const html = fs.readFileSync(path.join(PUBLIC, file), 'utf8');
    const hashes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].filter((m) => m[1].trim())
      .map((m) => `'sha256-${crypto.createHash('sha256').update(m[1]).digest('base64')}'`);
    cspPagina.set(file, [
      "default-src 'self'", `script-src 'self' ${hashes.join(' ')}`, "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src https://fonts.gstatic.com", "img-src 'self' data: blob:", "connect-src 'self'", "frame-ancestors 'none'",
      "base-uri 'none'", "form-action 'self'", "object-src 'none'",
    ].join('; '));
  }
  return cspPagina.get(file);
}
const SEGURIDAD = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' };

// ---------- utilidades HTTP ----------
function send(res, code, body, headers = {}) {
  const json = typeof body !== 'string';
  res.writeHead(code, { ...SEGURIDAD, 'Content-Type': json ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(json ? JSON.stringify(body) : body);
}
// Fotos de productos: el navegador ya las entrega achicadas en WebP, así que el
// servidor solo valida la firma del archivo y las guarda en el volumen de datos.
const IMG_MAX = 600e3;
async function readBytes(req, max) {
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > max) throw Object.assign(new Error('too big'), { tooBig: true }); chunks.push(c); }
  return Buffer.concat(chunks);
}
const esWebp = (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';
function borrarImagen(nombre) { if (nombre) fs.rmSync(path.join(IMG_DIR, path.basename(nombre)), { force: true }); }

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 64e3) throw Object.assign(new Error('too big'), { tooBig: true }); }
  return raw ? JSON.parse(raw) : {};
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.wav': 'audio/wav' };
function serveFile(res, file) {
  const p = path.join(PUBLIC, file);
  if (!p.startsWith(PUBLIC) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return send(res, 404, 'No encontrado');
  const extra = path.extname(p) === '.html' ? { 'Content-Security-Policy': csp(path.relative(PUBLIC, p)) } : {};
  res.writeHead(200, { ...SEGURIDAD, ...extra, 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(p).pipe(res);
}

function menu(local) {
  const cats = db.prepare('SELECT id, nombre FROM categorias WHERE local_id=? ORDER BY orden').all(local.id);
  const prods = db.prepare('SELECT id, categoria_id, nombre, descripcion, precio, activo, precio_pendiente, incluye, destacado, imagen FROM productos WHERE local_id=? ORDER BY orden').all(local.id)
    .map((p) => ({ ...p, imagen: p.imagen ? `${BASE}/img/${p.imagen}` : null }));
  // "Los más pedidos": ventas reales de los últimos 30 días; mientras no haya
  // suficientes, se completa con los destacados elegidos a mano.
  const vendidos = db.prepare(`SELECT i.producto_id id, SUM(i.cantidad) n FROM pedido_items i JOIN pedidos p ON p.id=i.pedido_id
    WHERE p.local_id=? AND p.estado!='anulado' AND p.creado >= datetime('now','localtime','-30 days')
    GROUP BY i.producto_id ORDER BY n DESC LIMIT 6`).all(local.id).map((r) => r.id);
  const vendible = (p) => p.activo && !p.precio_pendiente && p.precio > 0;
  const ok = new Set(prods.filter(vendible).map((p) => p.id));
  const mas = [...new Set([...vendidos, ...prods.filter((p) => p.destacado).map((p) => p.id)])].filter((id) => ok.has(id)).slice(0, 6);
  return {
    local: { slug: local.slug, nombre: local.nombre, instagram: local.instagram, whatsapp: local.whatsapp, modo_boleta: local.modo_boleta, horario: JSON.parse(local.horario) },
    mas_pedidos: mas,
    categorias: cats.map((c) => ({ ...c, productos: prods.filter((p) => p.categoria_id === c.id) })),
    agregados: db.prepare('SELECT id, nombre, disponible FROM agregados WHERE local_id=? ORDER BY id').all(local.id),
  };
}

function pedidoCompleto(id, localId) {
  const p = db.prepare('SELECT * FROM pedidos WHERE id=? AND local_id=?').get(id, localId);
  if (!p) return null;
  p.items = db.prepare('SELECT nombre, agregados, cantidad, precio_unitario FROM pedido_items WHERE pedido_id=?').all(id)
    .map((i) => ({ ...i, agregados: JSON.parse(i.agregados) }));
  return p;
}

function crearPedido(local, body) {
  const nombre = String(body.cliente || '').trim().slice(0, 80);
  const tel = String(body.telefono || '').replace(/[^\d+]/g, '').slice(0, 16);
  const modalidad = body.modalidad === 'despacho' ? 'despacho' : 'retiro';
  const direccion = modalidad === 'despacho' ? String(body.direccion || '').trim().slice(0, 200) : null;
  if (!nombre || tel.length < 8) return { error: 'Falta nombre o teléfono válido.' };
  if (modalidad === 'despacho' && !direccion) return { error: 'Falta la dirección de despacho.' };
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 50) return { error: 'El carro está vacío.' };

  const f = franjas(local);
  const franja = body.franja === 'Lo antes posible' ? 'Lo antes posible' : String(body.franja || '');
  if (!f.abierto && franja === 'Lo antes posible') return { error: 'El local está cerrado; elige una franja.' };
  if (franja !== 'Lo antes posible' && !f.slots.some((s) => s.franja === franja && s.disponible)) return { error: 'Esa franja ya no está disponible.' };

  const agregadosOk = new Map(db.prepare('SELECT id, nombre FROM agregados WHERE local_id=? AND disponible=1').all(local.id).map((a) => [a.id, a.nombre]));
  const items = [];
  let total = 0;
  for (const it of body.items) {
    const p = db.prepare('SELECT * FROM productos WHERE id=? AND local_id=?').get(Number(it.producto_id), local.id);
    if (!p || !p.activo) return { error: 'Un producto ya no está disponible. Recarga la carta.' };
    if (p.precio_pendiente || p.precio <= 0) return { error: `${p.nombre} no tiene precio; consúltalo en el local.` };
    const cant = Math.max(1, Math.min(20, Number(it.cantidad) || 1));
    const ags = Array.isArray(it.agregados) ? it.agregados.map(Number) : [];
    if (ags.length !== p.incluye) return { error: `${p.nombre} lleva exactamente ${p.incluye} agregado(s).` };
    if (!ags.every((a) => agregadosOk.has(a))) return { error: 'Un agregado ya no está disponible.' };
    items.push({ p, cant, agNames: ags.map((a) => agregadosOk.get(a)) });
    total += p.precio * cant;
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    const numero = db.prepare('SELECT COALESCE(MAX(numero),0)+1 n FROM pedidos WHERE local_id=? AND dia=?').get(local.id, f.dia).n;
    const { lastInsertRowid: pid } = db.prepare(
      'INSERT INTO pedidos (local_id,numero,cliente,telefono,franja,modalidad,direccion,notas,total,dia,actualizado) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
    ).run(local.id, numero, nombre, tel, franja, modalidad, direccion, String(body.notas || '').slice(0, 300) || null, total, f.dia, Date.now());
    for (const i of items) db.prepare(
      'INSERT INTO pedido_items (pedido_id,producto_id,nombre,agregados,cantidad,precio_unitario) VALUES (?,?,?,?,?,?)'
    ).run(pid, i.p.id, i.p.nombre, JSON.stringify(i.agNames), i.cant, i.p.precio);
    db.exec('COMMIT');
    return { id: Number(pid), numero, total, franja };
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

const ESTADOS = ['nuevo', 'preparacion', 'listo', 'entregado', 'anulado'];
const MEDIOS = ['efectivo', 'transferencia', 'tarjeta', 'otro'];

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // sin "api"
  const m = req.method;

  // --- público ---
  if (parts[0] === 'locales' && parts[1]) {
    const local = db.prepare('SELECT * FROM locales WHERE slug=?').get(parts[1]);
    if (!local) return send(res, 404, { error: 'Local no encontrado' });
    if (m === 'GET' && parts.length === 2) return send(res, 200, menu(local));
    if (m === 'GET' && parts[2] === 'franjas') return send(res, 200, franjas(local));
    if (m === 'POST' && parts[2] === 'pedidos') {
      if (limitar(`pedido:${ipDe(req)}`, 15, 15 * 60e3)) return send(res, 429, { error: 'Demasiados pedidos seguidos. Espera unos minutos o llama al local.' });
      const r = crearPedido(local, await readJson(req));
      return send(res, r.error ? 400 : 201, r);
    }
  }

  // --- panel ---
  if (parts[0] === 'panel') {
    if (m === 'POST' && parts[1] === 'login') {
      if (limitar(`login:${ipDe(req)}`, 8, 15 * 60e3)) return send(res, 429, { error: 'Demasiados intentos. Espera 15 minutos.' });
      const b = await readJson(req);
      const local = db.prepare('SELECT * FROM locales WHERE slug=?').get(String(b.slug || 'gassuso'));
      // Se comparan los hashes: mismo largo siempre, así timingSafeEqual no falla con tildes o largos distintos.
      const h = (v) => crypto.createHash('sha256').update(String(v)).digest();
      const ok = PANEL_PASSWORD && local && crypto.timingSafeEqual(h(b.password ?? ''), h(PANEL_PASSWORD));
      if (!ok) return send(res, 401, { error: 'Clave incorrecta' });
      const secure = (req.headers['x-forwarded-proto'] || '') === 'https' ? '; Secure' : '';
      return send(res, 200, { ok: true }, { 'Set-Cookie': `panel=${makeSession(local.id)}; HttpOnly; SameSite=Strict; Path=${BASE || '/'}; Max-Age=43200${secure}` });
    }
    const lid = session(req);
    if (!lid) return send(res, 401, { error: 'Sesión expirada' });
    const local = db.prepare('SELECT * FROM locales WHERE id=?').get(lid);

    if (m === 'POST' && parts[1] === 'logout') return send(res, 200, { ok: true }, { 'Set-Cookie': `panel=; Path=${BASE || '/'}; Max-Age=0` });
    if (m === 'GET' && parts[1] === 'carta') return send(res, 200, menu(local));
    if (m === 'GET' && parts[1] === 'pedidos' && !parts[2]) {
      const dia = url.searchParams.get('dia') || franjas(local).dia;
      const ids = db.prepare('SELECT id FROM pedidos WHERE local_id=? AND dia=? ORDER BY id').all(lid, dia);
      const pedidos = ids.map((r) => pedidoCompleto(r.id, lid));
      const vendido = pedidos.filter((p) => p.estado !== 'anulado').reduce((s, p) => s + p.total, 0);
      return send(res, 200, { dia, local: local.nombre, modo_boleta: local.modo_boleta, vendido, pedidos });
    }
    if (m === 'GET' && parts[1] === 'pedidos' && parts[2]) {
      const p = pedidoCompleto(Number(parts[2]), lid);
      return p ? send(res, 200, { ...p, local: local.nombre }) : send(res, 404, { error: 'No existe' });
    }
    if (m === 'PATCH' && parts[1] === 'pedidos' && parts[2]) {
      const b = await readJson(req);
      const p = db.prepare('SELECT * FROM pedidos WHERE id=? AND local_id=?').get(Number(parts[2]), lid);
      if (!p) return send(res, 404, { error: 'No existe' });
      const estado = ESTADOS.includes(b.estado) ? b.estado : p.estado;
      const pagado = b.pagado === undefined ? p.pagado : (b.pagado ? 1 : 0);
      const folio = b.folio_boleta === undefined ? p.folio_boleta : (String(b.folio_boleta).replace(/\D/g, '').slice(0, 12) || null);
      let { medio_pago, recibido, cobrado_en } = p;
      if (b.medio_pago !== undefined) {
        if (p.estado === 'anulado' || estado === 'anulado') return send(res, 409, { error: 'Un pedido anulado no se puede cobrar' });
        if (!MEDIOS.includes(b.medio_pago)) return send(res, 400, { error: 'Medio de pago inválido' });
        medio_pago = b.medio_pago;
        recibido = medio_pago === 'efectivo' ? Math.round(Number(b.recibido) || p.total) : p.total;
        if (recibido < p.total) return send(res, 400, { error: 'El monto recibido es menor al total' });
        cobrado_en = cobrado_en || new Date().toTimeString().slice(0, 5);
      }
      const pagadoFinal = medio_pago ? 1 : pagado;
      db.prepare('UPDATE pedidos SET estado=?, pagado=?, folio_boleta=?, medio_pago=?, recibido=?, cobrado_en=?, actualizado=? WHERE id=?')
        .run(estado, pagadoFinal, folio, medio_pago, recibido, cobrado_en, Date.now(), p.id);
      return send(res, 200, pedidoCompleto(p.id, lid));
    }
    if (m === 'PATCH' && parts[1] === 'productos' && parts[2]) {
      const b = await readJson(req);
      const p = db.prepare('SELECT * FROM productos WHERE id=? AND local_id=?').get(Number(parts[2]), lid);
      if (!p) return send(res, 404, { error: 'No existe' });
      let precio = p.precio;
      if (b.precio !== undefined) {
        precio = Math.round(Number(b.precio));
        if (!Number.isFinite(precio) || precio < 0 || precio > 1e6) return send(res, 400, { error: 'Precio inválido' });
      }
      const activo = b.activo === undefined ? p.activo : (b.activo ? 1 : 0);
      const pend = b.precio_pendiente === undefined ? p.precio_pendiente : (b.precio_pendiente ? 1 : 0);
      db.exec('BEGIN');
      db.prepare('UPDATE productos SET precio=?, activo=?, precio_pendiente=? WHERE id=?').run(precio, activo, pend, p.id);
      if (precio !== p.precio) db.prepare('INSERT INTO historial_precio (local_id,producto_id,anterior,nuevo) VALUES (?,?,?,?)').run(lid, p.id, p.precio, precio);
      db.exec('COMMIT');
      return send(res, 200, { ok: true });
    }
    if (parts[1] === 'productos' && parts[2] && parts[3] === 'imagen' && (m === 'PUT' || m === 'DELETE')) {
      const p = db.prepare('SELECT * FROM productos WHERE id=? AND local_id=?').get(Number(parts[2]), lid);
      if (!p) return send(res, 404, { error: 'No existe' });
      let nombre = null;
      if (m === 'PUT') {
        let buf;
        try { buf = await readBytes(req, IMG_MAX); } catch (e) { if (e.tooBig) return send(res, 413, { error: 'La foto pesa demasiado' }); throw e; }
        if (!esWebp(buf)) return send(res, 415, { error: 'Formato no válido' });
        nombre = `${lid}-${p.id}-${crypto.createHash('sha1').update(buf).digest('hex').slice(0, 10)}.webp`;
        fs.writeFileSync(path.join(IMG_DIR, nombre), buf);
      }
      db.prepare('UPDATE productos SET imagen=? WHERE id=?').run(nombre, p.id);
      if (p.imagen !== nombre) borrarImagen(p.imagen);
      return send(res, 200, { imagen: nombre ? `${BASE}/img/${nombre}` : null });
    }
    if (m === 'PATCH' && parts[1] === 'agregados' && parts[2]) {
      const b = await readJson(req);
      db.prepare('UPDATE agregados SET disponible=? WHERE id=? AND local_id=?').run(b.disponible ? 1 : 0, Number(parts[2]), lid);
      return send(res, 200, { ok: true });
    }
    if (m === 'GET' && parts[1] === 'historial') {
      return send(res, 200, db.prepare(
        'SELECT h.fecha, p.nombre, h.anterior, h.nuevo FROM historial_precio h JOIN productos p ON p.id=h.producto_id WHERE h.local_id=? ORDER BY h.id DESC LIMIT 100'
      ).all(lid));
    }
  }
  return send(res, 404, { error: 'Ruta no encontrada' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    let p = url.pathname;
    if (BASE) {
      if (p !== BASE && !p.startsWith(BASE + '/')) return send(res, 404, 'No encontrado');
      p = p.slice(BASE.length) || '/';
    }
    url.pathname = p;
    if (p === '/salud') return send(res, 200, 'ok');
    if (p.startsWith('/img/')) {
      const f = path.join(IMG_DIR, path.basename(p));
      if (!/^\/img\/[\w-]+\.webp$/.test(p) || !fs.existsSync(f)) return send(res, 404, 'No encontrado');
      // El nombre lleva el hash del contenido: se puede cachear para siempre.
      res.writeHead(200, { ...SEGURIDAD, 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable' });
      return fs.createReadStream(f).pipe(res);
    }
    if (p.startsWith('/api/')) return await api(req, res, url);
    if (p === '/' ) { res.writeHead(302, { Location: `${BASE}/gassuso` }); return res.end(); }
    if (p === '/panel') return serveFile(res, 'panel.html');
    if (p === '/comanda') return serveFile(res, 'comanda.html');
    if (p === '/carta-imprimible') return serveFile(res, 'carta-imprimible.html');
    if (/^\/[a-z0-9-]+$/.test(p) && db.prepare('SELECT 1 FROM locales WHERE slug=?').get(p.slice(1))) return serveFile(res, 'carta.html');
    return serveFile(res, p.slice(1));
  } catch (e) {
    if (!e.tooBig && !(e instanceof SyntaxError)) console.error(e);
    if (!res.headersSent) {
      if (e.tooBig) send(res, 413, { error: 'Solicitud demasiado grande' });
      else if (e instanceof SyntaxError) send(res, 400, { error: 'JSON inválido' });
      else send(res, 500, { error: 'Error del servidor' });
    }
  }
});
server.listen(PORT, HOST, () => console.log(`pedidos escuchando en http://${HOST}:${server.address().port}${BASE}/`));
// docker stop manda SIGTERM: terminar las respuestas en curso y cerrar la base limpio.
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => {
  server.close(() => { db.close(); process.exit(0); });
  setTimeout(() => process.exit(0), 5000).unref();
});
