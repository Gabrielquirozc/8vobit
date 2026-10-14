// Demo de pedidos propios para locales delivery (piloto Gassuso).
// Sin dependencias: http nativo + node:sqlite. Pensado para correr con muy poca
// RAM en lenovo-edge, que ya tiene a Immich ocupando la mayor parte.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import * as H from './public/hex.js';
import * as LB from './public/laboral.js';

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
CREATE TABLE IF NOT EXISTS geocache (q TEXT PRIMARY KEY, res TEXT NOT NULL, t INTEGER NOT NULL);
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

let ubicacionSeed = false, contactoSeed = false, salsasSeed = false, sugerirSeed = false;
// Columnas de cobro agregadas después de la primera versión: migración idempotente.
{
  const cols = new Set(db.prepare('PRAGMA table_info(pedidos)').all().map((c) => c.name));
  if (!cols.has('medio_pago')) db.exec('ALTER TABLE pedidos ADD COLUMN medio_pago TEXT');
  if (!cols.has('recibido')) db.exec('ALTER TABLE pedidos ADD COLUMN recibido INTEGER');
  if (!cols.has('cobrado_en')) db.exec('ALTER TABLE pedidos ADD COLUMN cobrado_en TEXT');
  // Dónde se entrega un despacho por zonas (para el repartidor y para recalcular el costo).
  if (!cols.has('lat')) { for (const c of ['lat REAL', 'lng REAL', 'distancia_m INTEGER']) db.exec(`ALTER TABLE pedidos ADD COLUMN ${c}`); }
  // Costo estimado del viaje (vehículo + repartidor) para ver si el despacho sale a cuenta.
  // Quién entregó el despacho (id del trabajador): para el bono por entrega y sus kilómetros.
  if (!cols.has('repartidor_id')) db.exec('ALTER TABLE pedidos ADD COLUMN repartidor_id TEXT');
  if (!cols.has('costo_viaje')) db.exec('ALTER TABLE pedidos ADD COLUMN costo_viaje INTEGER');
  if (!cols.has('costo_despacho')) db.exec('ALTER TABLE pedidos ADD COLUMN costo_despacho INTEGER NOT NULL DEFAULT 0');
  // Datos del local editables desde el panel.
  const lcols = new Set(db.prepare('PRAGMA table_info(locales)').all().map((c) => c.name));
  if (!lcols.has('direccion')) db.exec('ALTER TABLE locales ADD COLUMN direccion TEXT');
  if (!lcols.has('transferencia')) db.exec('ALTER TABLE locales ADD COLUMN transferencia TEXT');
  if (!lcols.has('pausa')) db.exec('ALTER TABLE locales ADD COLUMN pausa INTEGER NOT NULL DEFAULT 0');
  // Comisión que cobraría la app de delivery (%): base del "comisión ahorrada" del resumen.
  if (!lcols.has('logo')) db.exec('ALTER TABLE locales ADD COLUMN logo TEXT');
  // Teléfono para llamadas, aparte del WhatsApp. Al crear la columna se completan una sola vez los
  // datos de contacto vacíos con los del seed; después mandan los que se editen en el panel.
  if (!lcols.has('telefono')) { db.exec('ALTER TABLE locales ADD COLUMN telefono TEXT'); contactoSeed = true; }
  // Despacho: { activo, costo, minimo, zona, horario: { día: [desde, hasta] | null } }.
  if (!lcols.has('despacho')) db.exec('ALTER TABLE locales ADD COLUMN despacho TEXT');
  // Equipo (trabajadores y parámetros laborales) para costear el despacho y el sueldo del repartidor.
  if (!lcols.has('costo_pct')) db.exec('ALTER TABLE locales ADD COLUMN costo_pct INTEGER NOT NULL DEFAULT 35');
  if (!lcols.has('equipo')) db.exec('ALTER TABLE locales ADD COLUMN equipo TEXT');
  // Ubicación del local: centro de las zonas de despacho (se ajusta en el panel).
  if (!lcols.has('lat')) { db.exec('ALTER TABLE locales ADD COLUMN lat REAL'); db.exec('ALTER TABLE locales ADD COLUMN lng REAL'); ubicacionSeed = true; }
  if (!lcols.has('comision_app')) db.exec('ALTER TABLE locales ADD COLUMN comision_app INTEGER NOT NULL DEFAULT 25');
  const pcols = new Set(db.prepare('PRAGMA table_info(productos)').all().map((c) => c.name));
  if (!pcols.has('destacado')) db.exec('ALTER TABLE productos ADD COLUMN destacado INTEGER NOT NULL DEFAULT 0');
  if (!pcols.has('imagen')) db.exec('ALTER TABLE productos ADD COLUMN imagen TEXT');
  // Venta sugerida: productos que la carta ofrece como acompañamiento (papas, bebidas…).
  // Productos y agregados que el local quitó de la carta: se archivan (los pedidos viejos los nombran).
  // Costo de insumos por unidad (null = sin dato: se estima con locales.costo_pct).
  if (!pcols.has('costo')) db.exec('ALTER TABLE productos ADD COLUMN costo INTEGER');
  if (!pcols.has('archivado')) db.exec('ALTER TABLE productos ADD COLUMN archivado INTEGER NOT NULL DEFAULT 0');
  if (!pcols.has('sugerir')) { db.exec('ALTER TABLE productos ADD COLUMN sugerir INTEGER NOT NULL DEFAULT 0'); sugerirSeed = true; }
  // Observación por producto ("sin cebolla"), aparte del comentario general del pedido.
  const icols = new Set(db.prepare('PRAGMA table_info(pedido_items)').all().map((c) => c.name));
  if (!icols.has('nota')) db.exec('ALTER TABLE pedido_items ADD COLUMN nota TEXT');
  // Salsas (mostaza, ketchup…): opcionales y sin costo, aparte de los ingredientes que se eligen.
  // Línea agregada desde una sugerencia: mide cuánto vende la venta sugerida.
  if (!icols.has('sugerido')) db.exec('ALTER TABLE pedido_items ADD COLUMN sugerido INTEGER NOT NULL DEFAULT 0');
  // Costo de insumos al momento de la venta (si cambia después, los pedidos viejos no se alteran).
  if (!icols.has('costo_unitario')) db.exec('ALTER TABLE pedido_items ADD COLUMN costo_unitario INTEGER');
  if (!icols.has('salsas')) db.exec("ALTER TABLE pedido_items ADD COLUMN salsas TEXT NOT NULL DEFAULT '[]'");
  const acols = new Set(db.prepare('PRAGMA table_info(agregados)').all().map((c) => c.name));
  if (!acols.has('archivado')) db.exec('ALTER TABLE agregados ADD COLUMN archivado INTEGER NOT NULL DEFAULT 0');
  if (!acols.has('tipo')) { db.exec("ALTER TABLE agregados ADD COLUMN tipo TEXT NOT NULL DEFAULT 'ingrediente'"); salsasSeed = true; }
  // Si la categoría ofrece salsas (no tiene sentido ofrecer ketchup con una bebida).
  const ccols = new Set(db.prepare('PRAGMA table_info(categorias)').all().map((c) => c.name));
  if (!ccols.has('salsas')) {
    db.exec('ALTER TABLE categorias ADD COLUMN salsas INTEGER NOT NULL DEFAULT 1');
    db.exec("UPDATE categorias SET salsas=0 WHERE nombre LIKE 'Bebida%' OR nombre LIKE 'Jugo%'");
  }
  // Token de seguimiento: el cliente ve el estado de su pedido sin cuenta ni clave.
  if (!cols.has('token')) db.exec('ALTER TABLE pedidos ADD COLUMN token TEXT');
  // Canal de venta: 'web' (carta pública) o 'mostrador' (venta rápida en el panel).
  if (!cols.has('canal')) db.exec("ALTER TABLE pedidos ADD COLUMN canal TEXT NOT NULL DEFAULT 'web'");
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS pedidos_token ON pedidos(token)');
  for (const { id } of db.prepare('SELECT id FROM pedidos WHERE token IS NULL').all())
    db.prepare('UPDATE pedidos SET token=? WHERE id=?').run(crypto.randomBytes(16).toString('base64url'), id);
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
    'INSERT INTO locales (slug,nombre,instagram,whatsapp,telefono,direccion,horario,cupo_franja,modo_boleta) VALUES (?,?,?,?,?,?,?,?,?)'
  ).run(L.slug, L.nombre, L.instagram, L.whatsapp, L.telefono || null, L.direccion || null, JSON.stringify(L.horario), L.cupo_franja, L.modo_boleta);
  if (L.logo) db.prepare('UPDATE locales SET logo=? WHERE id=?').run(seedImg(lid, L.logo), lid);
  if (L.despacho) db.prepare('UPDATE locales SET despacho=? WHERE id=?').run(JSON.stringify(L.despacho), lid);
  if (L.lat) db.prepare('UPDATE locales SET lat=?, lng=? WHERE id=?').run(L.lat, L.lng, lid);
  for (const a of s.agregados) db.prepare('INSERT INTO agregados (local_id,nombre) VALUES (?,?)').run(lid, a);
  for (const a of s.salsas || []) db.prepare("INSERT INTO agregados (local_id,nombre,tipo) VALUES (?,?,'salsa')").run(lid, a);
  s.categorias.forEach((c, ci) => {
    const { lastInsertRowid: cid } = db.prepare('INSERT INTO categorias (local_id,nombre,orden,salsas) VALUES (?,?,?,?)').run(lid, c.nombre, ci, c.salsas === false ? 0 : 1);
    c.productos.forEach((p, pi) => db.prepare(
      'INSERT INTO productos (local_id,categoria_id,nombre,descripcion,precio,precio_pendiente,incluye,orden,destacado,imagen,sugerir) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
    ).run(lid, cid, p.nombre, p.desc || null, p.precio, p.pendiente ? 1 : 0, p.incluye || 0, pi, p.destacado ? 1 : 0, seedImg(lid, p.imagen), p.sugerir ? 1 : 0));
  });
}
seed();

// Logo del seed para locales ya creados (la base de producción se sembró antes de que
// existiera el logo): solo si el local aún no tiene uno, nunca pisa uno subido desde el panel.
{
  const s = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  const l = s.local.logo && db.prepare('SELECT id, logo FROM locales WHERE slug=?').get(s.local.slug);
  if (l && !l.logo && fs.existsSync(path.resolve(import.meta.dirname, 'seed/img', path.basename(s.local.logo))))
    db.prepare('UPDATE locales SET logo=? WHERE id=?').run(seedImg(l.id, s.local.logo), l.id);
  if (ubicacionSeed && s.local.lat) db.prepare('UPDATE locales SET lat=?, lng=? WHERE slug=? AND lat IS NULL').run(s.local.lat, s.local.lng, s.local.slug);
  if (contactoSeed) for (const k of ['whatsapp', 'telefono', 'direccion'])
    if (s.local[k]) db.prepare(`UPDATE locales SET ${k}=? WHERE slug=? AND COALESCE(${k},'')=''`).run(s.local[k], s.local.slug);
  // Salsas del seed para la base ya creada: una sola vez, al crear la columna tipo.
  const lid = salsasSeed && db.prepare('SELECT id FROM locales WHERE slug=?').get(s.local.slug)?.id;
  // Sugeridos del seed para la base ya creada: una sola vez, al crear la columna.
  if (sugerirSeed) for (const n of s.categorias.flatMap((c) => c.productos).filter((p) => p.sugerir).map((p) => p.nombre))
    db.prepare('UPDATE productos SET sugerir=1 WHERE nombre=? AND local_id=(SELECT id FROM locales WHERE slug=?)').run(n, s.local.slug);
  if (lid && !db.prepare("SELECT 1 FROM agregados WHERE local_id=? AND tipo='salsa'").get(lid)) for (const a of s.salsas || []) db.prepare("INSERT INTO agregados (local_id,nombre,tipo) VALUES (?,?,'salsa')").run(lid, a);
}

// ---------- franjas horarias ----------
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const fmt = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// Día "operativo": si es antes del cierre de madrugada del día anterior, sigue contando como ese día.
// Configuración de despacho con valores por defecto (sin configurar = sin despacho).
// modo 'fijo': un solo costo. modo 'zonas': hexágonos de `tam` metros con precio por tramos
// de distancia desde el local (`tramos` [{hasta (m), costo}]) y ajustes a mano por hexágono
// (`ajustes` { "q,r": costo | null = bloqueado }).
function despachoDe(local) {
  const d = local.despacho ? JSON.parse(local.despacho) : {};
  return { activo: !!d.activo, costo: d.costo || 0, minimo: d.minimo || 0, zona: d.zona || '', horario: d.horario || {},
    modo: d.modo === 'zonas' && local.lat != null ? 'zonas' : 'fijo', tam: d.tam || 450, tramos: d.tramos || [], ajustes: d.ajustes || {},
    vehiculos: d.vehiculos || [], calculo: { ...H.CALCULO_BASE, ...(d.calculo || {}) } };
}
function equipoDe(local) {
  const e = local.equipo ? JSON.parse(local.equipo) : {};
  const lab = e.laboral || {};
  return { trabajadores: e.trabajadores || [], laboral: { ...LB.LABORAL_BASE, ...lab,
    empleador: { ...LB.LABORAL_BASE.empleador, ...(lab.empleador || {}) }, trabajador: { ...LB.LABORAL_BASE.trabajador, ...(lab.trabajador || {}) } } };
}
const ubicacionDe = (local) => (local.lat == null ? null : { lat: local.lat, lng: local.lng });
// Búsqueda de direcciones con Nominatim (OpenStreetMap), pasando por el servidor: se cachea,
// se limita a la zona del local y respeta su regla de 1 consulta por segundo.
let colaGeo = Promise.resolve(), ultimaGeo = 0;
async function geocodificar(local, q) {
  const clave = `${local.id}|${q.toLowerCase()}`;
  const c = db.prepare('SELECT res FROM geocache WHERE q=? AND t>?').get(clave, Date.now() - 30 * 864e5);
  if (c) return JSON.parse(c.res);
  const o = ubicacionDe(local) || { lat: -36.8270, lng: -73.0503 };
  // Comuna por defecto: la del local ("Janequeo 507, Concepción" → Concepción).
  const ciudad = (local.direccion || '').split(',').map((x) => x.trim()).filter(Boolean).slice(1).pop() || 'Concepción';
  const pedir = (params) => {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    Object.entries({ format: 'jsonv2', limit: 6, countrycodes: 'cl', 'accept-language': 'es', ...params }).forEach(([k, v]) => url.searchParams.set(k, v));
    return (colaGeo = colaGeo.then(async () => {
      const espera = ultimaGeo + 1100 - Date.now(); if (espera > 0) await new Promise((r) => setTimeout(r, espera));
      ultimaGeo = Date.now();
      const r = await fetch(url, { headers: { 'User-Agent': `pedidos-8vobit/1.0 (${process.env.GEO_CONTACTO || 'https://pedidos.8vobit.xyz'})` }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error('geo ' + r.status);
      return r.json();
    }).catch((e) => { console.error('geocodificar:', e.message); return null; }));
  };
  // "Freire 145" o "Freire 145, Talcahuano": búsqueda estructurada (calle + número + comuna),
  // que encuentra la cuadra; si no, búsqueda libre acotada a la zona del local.
  const m = q.match(/^\s*(.+?)\s+#?(\d{1,5})\s*(?:,\s*(.+))?$/);
  const caja = { viewbox: `${o.lng - 0.18},${o.lat + 0.14},${o.lng + 0.18},${o.lat - 0.14}`, bounded: 1 };
  let res = m ? await pedir({ street: `${m[2]} ${m[1]}`, city: m[3] || ciudad, ...caja }) : null;
  if (!res?.length) res = await pedir({ q: q.includes(',') ? q : `${q}, ${ciudad}`, ...caja });
  if (!res) return null;
  const comuna = (m?.[3] || (q.includes(',') ? q.split(',').pop() : ciudad)).trim().toLowerCase();
  const vistos = new Set();
  const out = res.map((x) => ({ nombre: x.display_name.replace(/, (Provincia de|Región del|Región de) [^,]+/g, '').replace(/, Chile$/, '').replace(/, \d{7}/, ''),
    lat: Number(x.lat), lng: Number(x.lon) }))
    .map((x) => ({ ...x, d: H.distancia(o, x), en: x.nombre.toLowerCase().includes(comuna) }))
    .sort((a, b) => (b.en - a.en) || (a.d - b.d))
    .filter((x) => !vistos.has(x.nombre) && vistos.add(x.nombre)).slice(0, 5)
    .map(({ nombre, lat, lng }) => ({ nombre, lat, lng }));
  db.prepare('INSERT OR REPLACE INTO geocache (q,res,t) VALUES (?,?,?)').run(clave, JSON.stringify(out), Date.now());
  return out;
}
function cotizarDespacho(local, lat, lng) {
  const desp = despachoDe(local), o = ubicacionDe(local);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return { ok: false, motivo: 'sin_ubicacion' };
  if (desp.modo !== 'zonas') return { ok: true, costo: desp.costo, distancia: o ? Math.round(H.distancia(o, { lat, lng })) : null };
  return H.cotizar(desp, o, lat, lng);
}
// ¿Se despacha en [desde, hasta) minutos del día operativo `fecha`? El horario de despacho
// es por día de la semana y, como el del local, puede cruzar la medianoche.
function enDespacho(desp, fecha, desde, hasta) {
  if (!desp.activo) return false;
  const h = desp.horario[fecha.getDay()];
  if (!h || !h[0] || !h[1]) return false;
  const a = toMin(h[0]); let b = toMin(h[1]); if (b <= a) b += 24 * 60;
  return desde >= a && hasta <= b;
}
function franjas(local) {
  const horario = JSON.parse(local.horario), desp = despachoDe(local);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const candidates = [];
  for (const offset of [-1, 0]) {
    const d = new Date(now); d.setDate(d.getDate() + offset);
    const h = horario[d.getDay()];
    if (!h || !h[0] || !h[1]) continue;
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
      slots.push({ franja: label, disponible: (usados[label] || 0) < local.cupo_franja, despacho: enDespacho(desp, d, m, m + SLOT_MIN) });
    }
    // "Lo antes posible" con despacho: si ahora (más la preparación) cae dentro del horario de despacho.
    const ya = Math.max(open, nowRel) + LEAD_MIN;
    candidates.push({ dia, abierto: nowRel >= open, slots, despacho_ya: nowRel >= open && enDespacho(desp, d, ya, Math.min(ya + SLOT_MIN, close)) });
  }
  const c = candidates.find((x) => x.abierto) || candidates[candidates.length - 1];
  const r = c || { dia: today(), abierto: false, slots: [] };
  // Pausa: el local deja de recibir pedidos web (colapsado o cerrado de improviso).
  return local.pausa ? { ...r, abierto: false, pausa: true, slots: [], despacho_ya: false } : r;
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
// Versiones de los .js/.css: hash del contenido. Cloudflare impone su propio caché de
// navegador (4 h) a estos archivos, así que tras un despliegue una página nueva podía
// cargar un comun.js viejo y quedarse en "Cargando…". Con ?v=<hash> en cada referencia,
// cada cambio es una URL nueva y lo que no cambió puede cachearse un año.
const version = new Map();
function ver(file) {
  if (!version.has(file)) {
    const p = path.join(PUBLIC, file);
    version.set(file, fs.existsSync(p) ? crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 10) : '0');
  }
  return version.get(file);
}
// Página lista para servir: saltos de línea normalizados (el navegador hashea con LF;
// un checkout en Windows trae CRLF), referencias versionadas y la CSP calculada sobre
// el HTML final, con el hash de cada <script> en línea.
const paginas = new Map();
function pagina(file) {
  if (!paginas.has(file)) {
    const html = fs.readFileSync(path.join(PUBLIC, file), 'utf8').replace(/\r\n?/g, '\n')
      .replace(/(href|src)="(\.\/)?([\w-]+\.(?:css|js))"/g, (m, attr, pre, f) => `${attr}="${pre || ''}${f}?v=${ver(f)}"`)
      .replace(/from '\.\/([\w-]+\.js)'/g, (m, f) => `from './${f}?v=${ver(f)}'`);
    const hashes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].filter((m) => m[1].trim())
      .map((m) => `'sha256-${crypto.createHash('sha256').update(m[1]).digest('base64')}'`);
    paginas.set(file, { html, csp: [
      // static.cloudflareinsights.com: Cloudflare Web Analytics, que la zona inyecta sola.
      "default-src 'self'", `script-src 'self' ${hashes.join(' ')} https://static.cloudflareinsights.com`, "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src https://fonts.gstatic.com", "img-src 'self' data: blob: https://tile.openstreetmap.org", "connect-src 'self' https://cloudflareinsights.com", "frame-ancestors 'none'",
      "base-uri 'none'", "form-action 'self'", "object-src 'none'",
    ].join('; ') });
  }
  return paginas.get(file);
}
const SEGURIDAD = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)' };
// Antes del lanzamiento nada se indexa (ni la carta): INDEXAR=1 en .env cuando el local lo publique.
const INDEXAR = process.env.INDEXAR === '1';
if (!INDEXAR) SEGURIDAD['X-Robots-Tag'] = 'noindex, nofollow';

// ---------- utilidades HTTP ----------
function send(res, code, body, headers = {}) {
  const json = typeof body !== 'string';
  res.writeHead(code, { ...SEGURIDAD, 'Content-Type': json ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(json ? JSON.stringify(body) : body);
}
// Fotos de productos: el navegador ya las entrega achicadas en WebP, así que el
// servidor solo valida la firma del archivo y las guarda en el volumen de datos.
const IMG_MAX = 600e3;
// Si el cuerpo excede el límite se descarta el resto (resume) antes de responder:
// cortar la lectura a la mitad hace que el cliente vea un error de red en vez del 413.
const demasiado = (req) => { req.resume(); return Object.assign(new Error('too big'), { tooBig: true }); };
async function readBytes(req, max) {
  if (Number(req.headers['content-length']) > max) throw demasiado(req);
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > max) throw demasiado(req); chunks.push(c); }
  return Buffer.concat(chunks);
}
const esWebp = (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';
function borrarImagen(nombre) { if (nombre) fs.rmSync(path.join(IMG_DIR, path.basename(nombre)), { force: true }); }

async function readJson(req) {
  if (Number(req.headers['content-length']) > 64e3) throw demasiado(req);
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 64e3) throw demasiado(req); }
  return raw ? JSON.parse(raw) : {};
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.webmanifest': 'application/manifest+json' };
function serveFile(res, file, versionado = false) {
  const p = path.join(PUBLIC, file);
  if (!p.startsWith(PUBLIC) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return send(res, 404, 'No encontrado');
  if (path.extname(p) === '.html') {
    const { html, csp } = pagina(path.relative(PUBLIC, p));
    res.writeHead(200, { ...SEGURIDAD, 'Content-Security-Policy': csp, 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
    return res.end(html);
  }
  // Con ?v=<hash> correcto el contenido nunca cambia bajo esa URL: caché de un año.
  const cache = versionado ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, { ...SEGURIDAD, 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': cache });
  fs.createReadStream(p).pipe(res);
}

function menu(local) {
  const cats = db.prepare('SELECT id, nombre, salsas FROM categorias WHERE local_id=? ORDER BY orden').all(local.id);
  const prods = db.prepare('SELECT id, categoria_id, nombre, descripcion, precio, activo, precio_pendiente, incluye, destacado, imagen, sugerir FROM productos WHERE local_id=? AND archivado=0 ORDER BY orden, id').all(local.id)
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
    local: { slug: local.slug, nombre: local.nombre, instagram: local.instagram, whatsapp: local.whatsapp, telefono: local.telefono, modo_boleta: local.modo_boleta,
      horario: JSON.parse(local.horario), direccion: local.direccion, pausa: !!local.pausa, cupo_franja: local.cupo_franja, comision_app: local.comision_app,
      logo: local.logo ? `${BASE}/img/${local.logo}` : null, despacho: despachoDe(local), ubicacion: ubicacionDe(local),
      transferencia: local.transferencia ? JSON.parse(local.transferencia) : null },
    mas_pedidos: mas,
    categorias: cats.map((c) => ({ ...c, productos: prods.filter((p) => p.categoria_id === c.id) })),
    agregados: db.prepare('SELECT id, nombre, disponible, tipo FROM agregados WHERE local_id=? AND archivado=0 ORDER BY id').all(local.id),
  };
}

function pedidoCompleto(id, localId) {
  const p = db.prepare('SELECT * FROM pedidos WHERE id=? AND local_id=?').get(id, localId);
  if (!p) return null;
  p.items = db.prepare('SELECT nombre, agregados, salsas, cantidad, precio_unitario, nota FROM pedido_items WHERE pedido_id=?').all(id)
    .map((i) => ({ ...i, agregados: JSON.parse(i.agregados), salsas: JSON.parse(i.salsas) }));
  return p;
}

// Costo de insumos de una unidad: el cargado, o el % estimado del precio si falta.
const costoDe = (local, p) => (p.costo != null ? p.costo : Math.round((p.precio * (local.costo_pct ?? 35)) / 100));
const clpTxt = (n) => '$' + Math.round(n).toLocaleString('es-CL');
// Valida los datos de un producto (nuevo si `p` es null). Solo cambia lo que viene en `b`.
function datosProducto(lid, b, p) {
  const base = p || { categoria_id: null, nombre: '', descripcion: null, precio: 0, activo: 1, precio_pendiente: 0, incluye: 0, destacado: 0, sugerir: 0, archivado: 0 };
  const flag = (k) => (b[k] === undefined ? base[k] : (b[k] ? 1 : 0));
  const v = {
    categoria_id: b.categoria_id === undefined ? base.categoria_id : Number(b.categoria_id),
    nombre: b.nombre === undefined ? base.nombre : String(b.nombre).trim().slice(0, 80),
    descripcion: b.descripcion === undefined ? base.descripcion : (String(b.descripcion).trim().slice(0, 200) || null),
    precio: b.precio === undefined ? base.precio : Math.round(Number(b.precio)),
    incluye: b.incluye === undefined ? base.incluye : Math.round(Number(b.incluye)),
    costo: b.costo === undefined ? (base.costo ?? null) : b.costo === null || b.costo === '' ? null : Math.round(Number(b.costo)),
    activo: flag('activo'), precio_pendiente: flag('precio_pendiente'), destacado: flag('destacado'), sugerir: flag('sugerir'), archivado: flag('archivado'),
  };
  if (!v.nombre) return { error: 'Escribe el nombre del producto.' };
  if (!db.prepare('SELECT 1 FROM categorias WHERE id=? AND local_id=?').get(v.categoria_id, lid)) return { error: 'Elige una categoría.' };
  if (!Number.isFinite(v.precio) || v.precio < 0 || v.precio > 1e6) return { error: 'Precio inválido' };
  if (!(v.incluye >= 0 && v.incluye <= 6)) return { error: 'Los ingredientes a elegir van de 0 a 6.' };
  if (v.costo != null && !(v.costo >= 0 && v.costo <= 1e6)) return { error: 'Costo de insumos inválido.' };
  // Escribir un precio en un producto "sin precio" lo deja listo para vender.
  if (b.precio !== undefined && b.precio_pendiente === undefined && v.precio > 0) v.precio_pendiente = 0;
  if (!p && b.precio_pendiente === undefined) v.precio_pendiente = v.precio > 0 ? 0 : 1;
  return v;
}
// Sube o baja un producto (dentro de su categoría) o una categoría: intercambia el orden con el vecino.
function mover(tabla, fila, dir, grupo) {
  const lista = db.prepare(`SELECT id, orden FROM ${tabla} WHERE ${grupo}=?${tabla === 'productos' ? ' AND archivado=0' : ''} ORDER BY orden, id`).all(fila[grupo]);
  lista.forEach((r, i) => { r.orden = i; });
  const i = lista.findIndex((r) => r.id === fila.id), j = i + (dir < 0 ? -1 : 1);
  if (j < 0 || j >= lista.length) return;
  [lista[i].orden, lista[j].orden] = [lista[j].orden, lista[i].orden];
  db.exec('BEGIN');
  for (const r of lista) db.prepare(`UPDATE ${tabla} SET orden=? WHERE id=?`).run(r.orden, r.id);
  db.exec('COMMIT');
}
function crearPedido(local, body) {
  const nombre = String(body.cliente || '').trim().slice(0, 80);
  const tel = String(body.telefono || '').replace(/[^\d+]/g, '').slice(0, 16);
  const modalidad = body.modalidad === 'despacho' ? 'despacho' : 'retiro';
  const direccion = modalidad === 'despacho' ? String(body.direccion || '').trim().slice(0, 200) : null;
  if (!nombre || tel.length < 8) return { error: 'Falta nombre o teléfono válido.' };
  if (modalidad === 'despacho' && !direccion) return { error: 'Falta la dirección de despacho.' };
  if (local.pausa) return { error: 'El local pausó los pedidos en línea por ahora. Llámalo o pasa directo.' };
  const f = franjas(local);
  const franja = body.franja === 'Lo antes posible' ? 'Lo antes posible' : String(body.franja || '');
  if (!f.abierto && franja === 'Lo antes posible') return { error: 'El local está cerrado; elige una franja.' };
  const slot = f.slots.find((s) => s.franja === franja);
  if (franja !== 'Lo antes posible' && !slot?.disponible) return { error: 'Esa franja ya no está disponible.' };

  const v = validarItems(local, body.items);
  if (v.error) return v;
  let costo = 0, geo = null;
  if (modalidad === 'despacho') {
    const desp = despachoDe(local);
    if (!desp.activo) return { error: 'El local no está despachando por ahora; elige retiro.' };
    if (!(franja === 'Lo antes posible' ? f.despacho_ya : slot.despacho)) return { error: 'No hay despacho en ese horario; elige otra franja o retiro.' };
    if (v.total < desp.minimo) return { error: `El pedido mínimo para despacho es ${clpTxt(desp.minimo)}.` };
    costo = desp.costo;
    if (desp.modo === 'zonas') {
      const u = body.ubicacion || {}, c = cotizarDespacho(local, Number(u.lat), Number(u.lng));
      if (!c.ok) return { error: c.motivo === 'sin_ubicacion' ? 'Marca en el mapa dónde entregamos el pedido.' : 'Esa ubicación está fuera de la zona de despacho; elige retiro o llama al local.' };
      costo = c.costo; geo = { lat: Number(u.lat), lng: Number(u.lng), distancia_m: c.distancia };
      const eq = equipoDe(local), veh = LB.vehiculoConRepartidor(desp.vehiculos.find((x) => x.id === desp.calculo.vehiculo), eq.trabajadores, eq.laboral);
      if (veh) geo.costo_viaje = Math.round(H.costoViaje(veh, desp.calculo, c.distancia).total);
      if (veh?.repartidor) geo.repartidor_id = veh.repartidor.id; // por defecto, el repartidor del vehículo con que se calcula
    }
  }
  return guardarPedido(local, { cliente: nombre, telefono: tel, franja, modalidad, direccion, notas: limpiarNota(body.notas, 300), dia: f.dia, costo_despacho: costo, geo }, { ...v, total: v.total + costo });
}

// Texto libre del cliente: sin caracteres de control ni saltos raros, largo acotado.
// Se guarda tal cual y siempre se muestra escapado (nunca como HTML).
function limpiarNota(v, max) {
  const t = String(v ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  return t || null;
}

// Valida productos, cantidades y agregados contra la base y calcula el total.
// El precio siempre sale de la base: lo que mande el cliente se ignora.
function validarItems(local, lista) {
  if (!Array.isArray(lista) || !lista.length || lista.length > 50) return { error: 'El carro está vacío.' };
  const disp = (tipo) => new Map(db.prepare('SELECT id, nombre FROM agregados WHERE local_id=? AND disponible=1 AND archivado=0 AND tipo=?').all(local.id, tipo).map((a) => [a.id, a.nombre]));
  const agregadosOk = disp('ingrediente'), salsasOk = disp('salsa');
  const items = [];
  let total = 0;
  for (const it of lista) {
    const p = db.prepare('SELECT * FROM productos WHERE id=? AND local_id=?').get(Number(it.producto_id), local.id);
    if (!p || !p.activo || p.archivado) return { error: 'Un producto ya no está disponible. Recarga la carta.' };
    if (p.precio_pendiente || p.precio <= 0) return { error: `${p.nombre} no tiene precio; consúltalo en el local.` };
    const cant = Math.max(1, Math.min(20, Number(it.cantidad) || 1));
    const ags = Array.isArray(it.agregados) ? it.agregados.map(Number) : [];
    if (ags.length !== p.incluye) return { error: `${p.nombre} lleva exactamente ${p.incluye} agregado(s).` };
    if (!ags.every((a) => agregadosOk.has(a))) return { error: 'Un agregado ya no está disponible.' };
    const sls = [...new Set(Array.isArray(it.salsas) ? it.salsas.map(Number) : [])];
    if (sls.length && !db.prepare('SELECT salsas FROM categorias WHERE id=?').get(p.categoria_id)?.salsas) return { error: `${p.nombre} no lleva salsas.` };
    if (!sls.every((a) => salsasOk.has(a))) return { error: 'Una salsa ya no está disponible.' };
    items.push({ p, cant, agNames: ags.map((a) => agregadosOk.get(a)), salsas: sls.map((a) => salsasOk.get(a)), sugerido: it.sugerido ? 1 : 0, nota: limpiarNota(it.nota, 140) });
    total += p.precio * cant;
  }
  return { items, total };
}

function guardarPedido(local, d, { items, total }) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const numero = db.prepare('SELECT COALESCE(MAX(numero),0)+1 n FROM pedidos WHERE local_id=? AND dia=?').get(local.id, d.dia).n;
    const token = crypto.randomBytes(16).toString('base64url');
    const { lastInsertRowid: pid } = db.prepare(
      `INSERT INTO pedidos (local_id,numero,cliente,telefono,franja,modalidad,direccion,notas,total,dia,actualizado,token,canal,estado,pagado,medio_pago,recibido,cobrado_en,folio_boleta,costo_despacho)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(local.id, numero, d.cliente, d.telefono, d.franja, d.modalidad, d.direccion ?? null, d.notas ?? null, total, d.dia, Date.now(), token,
      d.canal || 'web', d.estado || 'nuevo', d.medio_pago ? 1 : 0, d.medio_pago ?? null, d.recibido ?? null, d.cobrado_en ?? null, d.folio ?? null, d.costo_despacho || 0);
    if (d.geo) db.prepare('UPDATE pedidos SET lat=?, lng=?, distancia_m=?, costo_viaje=?, repartidor_id=? WHERE id=?').run(d.geo.lat, d.geo.lng, d.geo.distancia_m, d.geo.costo_viaje ?? null, d.geo.repartidor_id ?? null, pid);
    for (const i of items) db.prepare(
      'INSERT INTO pedido_items (pedido_id,producto_id,nombre,agregados,salsas,cantidad,precio_unitario,nota,sugerido,costo_unitario) VALUES (?,?,?,?,?,?,?,?,?,?)'
    ).run(pid, i.p.id, i.p.nombre, JSON.stringify(i.agNames), JSON.stringify(i.salsas || []), i.cant, i.p.precio, i.nota, i.sugerido || 0, costoDe(local, i.p));
    db.exec('COMMIT');
    return { id: Number(pid), numero, total, franja: d.franja, token };
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

// Valida y guarda los datos del local. Solo se tocan los campos enviados.
function actualizarLocal(local, b) {
  const txt = (v, max) => String(v ?? '').trim().slice(0, max);
  const c = {};
  if (b.nombre !== undefined) { c.nombre = txt(b.nombre, 60); if (!c.nombre) return { error: 'El nombre no puede quedar vacío.' }; }
  for (const [k, nom] of [['whatsapp', 'WhatsApp'], ['telefono', 'Teléfono']]) {
    if (b[k] === undefined) continue;
    c[k] = String(b[k]).replace(/\D/g, '');
    if (c[k].length === 9 && c[k].startsWith('9')) c[k] = '56' + c[k]; // celular chileno sin código
    if (c[k] && (c[k].length < 10 || c[k].length > 15)) return { error: `${nom} inválido. Ej: +56 9 1234 5678` };
  }
  if (b.instagram !== undefined) c.instagram = txt(b.instagram, 40).replace(/^@/, '').replace(/[^\w.]/g, '');
  if (b.direccion !== undefined) c.direccion = txt(b.direccion, 120) || null;
  if (b.cupo_franja !== undefined) {
    c.cupo_franja = Math.round(Number(b.cupo_franja));
    if (!(c.cupo_franja >= 1 && c.cupo_franja <= 200)) return { error: 'El cupo por franja debe estar entre 1 y 200.' };
  }
  if (b.pausa !== undefined) c.pausa = b.pausa ? 1 : 0;
  if (b.costo_pct !== undefined) {
    c.costo_pct = Math.round(Number(b.costo_pct));
    if (!(c.costo_pct >= 0 && c.costo_pct <= 90)) return { error: 'El costo estimado debe estar entre 0 y 90 %.' };
  }
  if (b.comision_app !== undefined) {
    c.comision_app = Math.round(Number(b.comision_app));
    if (!(c.comision_app >= 0 && c.comision_app <= 50)) return { error: 'La comisión de la app debe estar entre 0 y 50 %.' };
  }
  if (b.horario !== undefined) {
    const hh = /^([01]\d|2[0-3]):[0-5]\d$/, h = {};
    for (const d of '0123456') {
      const v = b.horario?.[d];
      if (v === null || v === undefined) { h[d] = null; continue; }
      // Apertura = cierre significa abierto 24 h (franjas() ya lo interpreta así).
      if (!Array.isArray(v) || !hh.test(v[0]) || !hh.test(v[1])) return { error: 'Horario inválido: usa el formato HH:MM.' };
      h[d] = [v[0], v[1]];
    }
    c.horario = JSON.stringify(h);
  }
  if (b.despacho !== undefined) {
    const d = b.despacho || {}, hh = /^([01]\d|2[0-3]):[0-5]\d$/, h = {};
    const costo = Math.round(Number(d.costo) || 0), minimo = Math.round(Number(d.minimo) || 0);
    if (!(costo >= 0 && costo <= 50000)) return { error: 'El costo de despacho debe estar entre $0 y $50.000.' };
    if (!(minimo >= 0 && minimo <= 200000)) return { error: 'El pedido mínimo para despacho no es válido.' };
    for (const k of '0123456') {
      const v = d.horario?.[k];
      if (v === null || v === undefined) { h[k] = null; continue; }
      if (!Array.isArray(v) || !hh.test(v[0]) || !hh.test(v[1])) return { error: 'Horario de despacho inválido: usa el formato HH:MM.' };
      h[k] = [v[0], v[1]];
    }
    const modo = d.modo === 'zonas' ? 'zonas' : 'fijo', tam = Math.round(Number(d.tam) || 450);
    if (!(tam >= 150 && tam <= 2000)) return { error: 'El tamaño de los sectores debe estar entre 150 y 2000 metros.' };
    const tramos = (Array.isArray(d.tramos) ? d.tramos : []).map((t) => ({ hasta: Math.round(Number(t.hasta)), costo: Math.round(Number(t.costo)) })).sort((a, b) => a.hasta - b.hasta);
    if (tramos.length > 10 || tramos.some((t) => !(t.hasta >= 100 && t.hasta <= 30000) || !(t.costo >= 0 && t.costo <= 50000))) return { error: 'Revisa los tramos: distancia entre 0,1 y 30 km y costo hasta $50.000.' };
    if (new Set(tramos.map((t) => t.hasta)).size !== tramos.length) return { error: 'Hay dos tramos con la misma distancia.' };
    if (modo === 'zonas' && !tramos.length) return { error: 'Agrega al menos un tramo de distancia para despachar por zonas.' };
    const aj = d.ajustes && typeof d.ajustes === 'object' ? Object.entries(d.ajustes) : [];
    if (aj.length > 3000 || aj.some(([k, x]) => !/^-?\d{1,3},-?\d{1,3}$/.test(k) || !(x === null || (Number.isInteger(x) && x >= 0 && x <= 50000)))) return { error: 'Ajustes de zonas inválidos.' };
    // Vehículos con los que se calcula el costo del viaje (ver hex.js: costoViaje).
    const num = (x, min, max) => { const n = Number(x); return Number.isFinite(n) && n >= min && n <= max ? n : NaN; };
    const vehiculos = (Array.isArray(d.vehiculos) ? d.vehiculos : []).slice(0, 10).map((v, i) => ({
      id: String(v.id || `v${i + 1}`).replace(/[^\w-]/g, '').slice(0, 20) || `v${i + 1}`, nombre: txt(v.nombre, 40) || `Vehículo ${i + 1}`,
      tipo: ['moto', 'auto', 'bici', 'otro'].includes(v.tipo) ? v.tipo : 'otro',
      rendimiento: num(v.rendimiento, 0, 200), precioLitro: num(v.precioLitro, 0, 5000), mantencionKm: num(v.mantencionKm, 0, 2000),
      velocidad: num(v.velocidad, 3, 90), pagoHora: num(v.pagoHora, 0, 50000), pagoViaje: num(v.pagoViaje, 0, 20000), minEntrega: num(v.minEntrega, 0, 60),
      repartidorId: v.repartidorId ? String(v.repartidorId).replace(/[^\w-]/g, '').slice(0, 20) : null }));
    if (vehiculos.some((v) => Object.values(v).some((x) => typeof x === 'number' && Number.isNaN(x)))) return { error: 'Revisa los datos de los vehículos: hay un valor fuera de rango.' };
    const k = d.calculo || {}, calculo = { vehiculo: vehiculos.some((v) => v.id === k.vehiculo) ? k.vehiculo : vehiculos[0]?.id || null,
      factor: num(k.factor ?? 1.35, 1, 3), idaVuelta: k.idaVuelta !== false, margen: num(k.margen ?? 15, -50, 300), redondeo: [10, 50, 100, 500].includes(Number(k.redondeo)) ? Number(k.redondeo) : 100 };
    if (Number.isNaN(calculo.factor) || Number.isNaN(calculo.margen)) return { error: 'Revisa el factor de calles (1 a 3) y el margen.' };
    c.despacho = JSON.stringify({ activo: !!d.activo, costo, minimo, zona: txt(d.zona, 160), horario: h, modo, tam, tramos, ajustes: Object.fromEntries(aj), vehiculos, calculo });
  }
  if (b.equipo !== undefined) {
    const e = b.equipo || {}, num = (x, min, max) => { const n = Number(x); return Number.isFinite(n) && n >= min && n <= max ? n : NaN; };
    const hh = /^([01]\d|2[0-3]):[0-5]\d$/;
    const trabajadores = (Array.isArray(e.trabajadores) ? e.trabajadores : []).slice(0, 30).map((t, i) => {
      const turno = {};
      for (const [d] of LB.DIAS_SEM) { const x = t.turno?.[d]; if (Array.isArray(x) && hh.test(x[0]) && hh.test(x[1])) turno[d] = [x[0], x[1], Math.round(num(x[2] || 0, 0, 120))]; }
      return { id: String(t.id || `t${i + 1}`).replace(/[^\w-]/g, '').slice(0, 20) || `t${i + 1}`, nombre: txt(t.nombre, 60), rut: txt(t.rut, 12),
        rol: ['repartidor', 'cocina', 'caja', 'cocina_caja', 'otro'].includes(t.rol) ? t.rol : 'repartidor', contrato: t.contrato === 'indefinido' ? 'indefinido' : 'plazo_fijo',
        turno, sueldoBase: Math.round(num(t.sueldoBase || 0, 0, 10e6)), bonoEntrega: Math.round(num(t.bonoEntrega || 0, 0, 20000)),
        recargoDomingo: t.recargoDomingo !== false, gratificacion: t.gratificacion !== false, vehiculoPropio: !!t.vehiculoPropio, activo: t.activo !== false };
    }).map((t) => (t.rol === 'repartidor' ? t : { ...t, bonoEntrega: 0, vehiculoPropio: false })); // vehículo y bono: solo reparto
    if (trabajadores.some((t) => !t.nombre)) return { error: 'Cada trabajador necesita un nombre.' };
    if (trabajadores.some((t) => [t.sueldoBase, t.bonoEntrega, ...Object.values(t.turno).map((x) => x[2])].some(Number.isNaN))) return { error: 'Revisa los montos y la colación de los trabajadores.' };
    const lab = e.laboral || {}, L0 = LB.LABORAL_BASE;
    const laboral = { imm: Math.round(num(lab.imm ?? L0.imm, 100000, 5e6)), jornadaMax: num(lab.jornadaMax ?? L0.jornadaMax, 30, 48), recargoDomingo: num(lab.recargoDomingo ?? L0.recargoDomingo, 0, 100),
      vigencia: /^\d{4}-\d{2}-\d{2}$/.test(lab.vigencia) ? lab.vigencia : L0.vigencia,
      empleador: Object.fromEntries(Object.keys(L0.empleador).map((k) => [k, num(lab.empleador?.[k] ?? L0.empleador[k], 0, 20)])),
      trabajador: Object.fromEntries(Object.keys(L0.trabajador).map((k) => [k, num(lab.trabajador?.[k] ?? L0.trabajador[k], 0, 30)])) };
    if ([laboral.imm, laboral.jornadaMax, laboral.recargoDomingo, ...Object.values(laboral.empleador), ...Object.values(laboral.trabajador)].some(Number.isNaN)) return { error: 'Revisa los parámetros laborales.' };
    for (const t of trabajadores) {
      const g = LB.avisosTurno(t, { ...L0, ...laboral }).find((a) => a.grave);
      if (g) return { error: `${t.nombre}: ${g.txt}` };
      if (LB.liquidacion(t, {}, { ...L0, ...laboral }).bajoMinimo) return { error: `${t.nombre}: el sueldo base es menor al mínimo proporcional a sus horas.` };
    }
    c.equipo = JSON.stringify({ trabajadores, laboral });
  }
  if (b.ubicacion !== undefined) {
    const lat = Number(b.ubicacion?.lat), lng = Number(b.ubicacion?.lng);
    if (!(lat >= -56 && lat <= -17 && lng >= -110 && lng <= -66)) return { error: 'La ubicación del local debe estar en Chile.' };
    c.lat = lat; c.lng = lng;
  }
  if (b.transferencia !== undefined) {
    const t = b.transferencia || {};
    const v = { titular: txt(t.titular, 80), rut: txt(t.rut, 12), banco: txt(t.banco, 40), tipo: txt(t.tipo, 30), numero: txt(t.numero, 30).replace(/[^\d-]/g, ''), email: txt(t.email, 80) };
    c.transferencia = Object.values(v).some(Boolean) ? JSON.stringify(v) : null;
  }
  const keys = Object.keys(c);
  if (keys.length) db.prepare(`UPDATE locales SET ${keys.map((k) => `${k}=?`).join(', ')} WHERE id=?`).run(...keys.map((k) => c[k]), local.id);
  return { ok: true };
}

// ---------- resumen semanal ----------
// Los 6 números del plan: pedidos (vs. semana anterior), ticket promedio, plato más y
// menos vendido, hora peak y valle, clientes que repiten y comisión ahorrada.
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function lunesDe(fecha) { const d = new Date(`${fecha}T12:00:00`); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; }
function equipoMes(local, mes) {
  const eq = equipoDe(local), desp = despachoDe(local), p = eq.laboral;
  const peds = db.prepare("SELECT * FROM pedidos WHERE local_id=? AND dia LIKE ? AND estado!='anulado' AND modalidad='despacho'").all(local.id, `${mes}-%`);
  const kmDe = (l) => l.reduce((a, x) => a + (x.distancia_m || 0), 0) / 1000 * desp.calculo.factor * (desp.calculo.idaVuelta ? 2 : 1);
  const trabajadores = eq.trabajadores.map((t) => {
    const suyos = peds.filter((x) => x.repartidor_id === t.id), km = kmDe(suyos);
    const veh = t.rol === 'repartidor' ? desp.vehiculos.find((v) => v.repartidorId === t.id) : null;
    const asignacion = t.vehiculoPropio && veh ? Math.round(km * H.costoKmDe(veh)) : 0;
    const liq = LB.liquidacion(t, { entregas: suyos.length, asignacion }, p);
    return { id: t.id, nombre: t.nombre, rol: t.rol, entregas: suyos.length, km: Math.round(km * 10) / 10, vehiculo: veh?.nombre || null,
      cobrado: suyos.reduce((a, x) => a + (x.costo_despacho || 0), 0), liquidacion: liq, avisos: LB.avisosTurno(t, p) };
  });
  const activos = trabajadores.filter((t) => eq.trabajadores.find((x) => x.id === t.id).activo !== false);
  const itD = peds.length ? db.prepare(`SELECT cantidad, precio_unitario, costo_unitario FROM pedido_items WHERE pedido_id IN (${peds.map(() => '?').join(',')})`).all(...peds.map((x) => x.id)) : [];
  const margenComida = itD.reduce((a, x) => a + x.cantidad * (x.precio_unitario - (x.costo_unitario ?? Math.round(x.precio_unitario * (local.costo_pct ?? 35) / 100))), 0);
  // Para la gestión del local: ventas del mes y costo de todo el personal activo (no solo reparto).
  const ventasMes = db.prepare("SELECT COALESCE(SUM(total),0) v, COUNT(*) n FROM pedidos WHERE local_id=? AND dia LIKE ? AND estado!='anulado'").get(local.id, `${mes}-%`);
  const personal = { costo: Math.round(activos.reduce((a, t) => a + t.liquidacion.costoEmpresa, 0)), personas: activos.length,
    horasSemana: activos.reduce((a, t) => a + t.liquidacion.horasSemana, 0),
    porRol: Object.fromEntries(['cocina_caja', 'cocina', 'caja', 'repartidor', 'otro'].map((r) => { const l = activos.filter((t) => t.rol === r); return [r, { personas: l.length, costo: Math.round(l.reduce((a, t) => a + t.liquidacion.costoEmpresa, 0)) }]; })) };
  return { mes, laboral: p, trabajadores, ventas: { total: ventasMes.v, pedidos: ventasMes.n }, personal, despacho: { pedidos: peds.length, margen_comida: margenComida, sin_repartidor: peds.filter((x) => !x.repartidor_id).length,
    cobrado: peds.reduce((a, x) => a + (x.costo_despacho || 0), 0), costo_equipo: Math.round(activos.filter((t) => t.rol === 'repartidor').reduce((a, t) => a + t.liquidacion.costoEmpresa, 0)) } };
}
function resumen(local, fecha) {
  const lun = lunesDe(fecha), dias = [...Array(7)].map((_, i) => { const d = new Date(lun); d.setDate(d.getDate() + i); return iso(d); });
  const prevLun = new Date(lun); prevLun.setDate(prevLun.getDate() - 7);
  const rango = (desde, hasta) => db.prepare("SELECT * FROM pedidos WHERE local_id=? AND dia BETWEEN ? AND ? AND estado!='anulado'").all(local.id, desde, hasta);
  const ps = rango(dias[0], dias[6]);
  const prevDom = new Date(lun); prevDom.setDate(prevDom.getDate() - 1);
  const prev = rango(iso(prevLun), iso(prevDom));
  const suma = (l) => l.reduce((a, p) => a + p.total, 0);
  const ventas = suma(ps), web = ps.filter((p) => p.canal !== 'mostrador');

  const items = ps.length ? db.prepare(`SELECT nombre, SUM(cantidad) n, SUM(cantidad*precio_unitario) monto FROM pedido_items
    WHERE pedido_id IN (${ps.map(() => '?').join(',')}) GROUP BY nombre ORDER BY n DESC, monto DESC`).all(...ps.map((p) => p.id)) : [];
  const vendibles = db.prepare('SELECT nombre FROM productos WHERE local_id=? AND activo=1 AND precio_pendiente=0 AND precio>0').all(local.id).map((r) => r.nombre);
  const vendidos = new Set(items.map((i) => i.nombre));
  const sug = ps.length ? db.prepare(`SELECT COALESCE(SUM(cantidad),0) n, COALESCE(SUM(cantidad*precio_unitario),0) monto FROM pedido_items
    WHERE sugerido=1 AND pedido_id IN (${ps.map(() => '?').join(',')})`).get(...ps.map((p) => p.id)) : { n: 0, monto: 0 };

  // Horas: solo las que el local estuvo abierto, para que la "hora valle" no sea las 4 AM.
  // "Núcleo": sin la primera ni la última hora de cada día, que siempre son flojas y no
  // sirven como "hora valle" para una promo (la del plan es el bache de la tarde).
  // Días de la semana en que cada hora estuvo abierta: el valle se mide por día abierto,
  // para no comparar una hora abierta 2 días con una abierta los 7.
  const horario = JSON.parse(local.horario), abiertas = new Set(), nucleo = new Set(), diasAbierta = {};
  for (const d of '0123456') {
    const h = horario[d]; if (!h) continue;
    let a = toMin(h[0]), b = toMin(h[1]); if (b <= a) b += 1440;
    for (let m = a; m < b; m += 60) { const hr = Math.floor(m / 60) % 24; abiertas.add(hr); diasAbierta[hr] = (diasAbierta[hr] || 0) + 1; }
    for (let m = a + 60; m < b - 60; m += 60) nucleo.add(Math.floor(m / 60) % 24);
  }
  // Orden del día operativo (desde las 06:00), no numérico: así 00 y 01 quedan al final.
  // Arreglo y no objeto: un objeto con claves numéricas las reordena solo.
  const horas = [...abiertas].sort((a, b) => ((a + 18) % 24) - ((b + 18) % 24)).map((h) => ({ hora: h, pedidos: 0 }));
  const idx = new Map(horas.map((x) => [x.hora, x]));
  for (const p of ps) { const x = idx.get(Number(p.creado.slice(11, 13))); if (x) x.pedidos++; }
  const conPedidos = horas.filter((x) => x.pedidos > 0);
  const peak = conPedidos.length ? conPedidos.reduce((a, b) => (b.pedidos > a.pedidos ? b : a)) : null;
  const candidatas = horas.filter((x) => nucleo.has(x.hora) && x.hora !== peak?.hora);
  const tasa = (x) => x.pedidos / (diasAbierta[x.hora] || 1);
  const valle = conPedidos.length > 1 && candidatas.length ? candidatas.reduce((a, b) => (tasa(b) < tasa(a) ? b : a)) : null;

  // Clientes que repiten: teléfonos con pedidos web esta semana que ya habían pedido antes (o 2+ veces en la semana).
  const tels = [...new Set(web.map((p) => p.telefono).filter(Boolean))];
  const repiten = tels.filter((t) => web.filter((p) => p.telefono === t).length > 1 ||
    db.prepare('SELECT 1 FROM pedidos WHERE local_id=? AND telefono=? AND dia<? AND estado!=? LIMIT 1').get(local.id, t, dias[0], 'anulado')).length;

  return {
    semana: { desde: dias[0], hasta: dias[6] },
    pedidos: ps.length, pedidos_prev: prev.length,
    variacion: prev.length ? Math.round(((ps.length - prev.length) / prev.length) * 100) : null,
    ventas, ticket: ps.length ? Math.round(ventas / ps.length) : 0,
    canal: { web: { pedidos: web.length, ventas: suma(web) }, mostrador: { pedidos: ps.length - web.length, ventas: ventas - suma(web) } },
    mas_vendido: items[0] || null,
    menos_vendido: items.length > 1 ? items[items.length - 1] : null,
    sin_ventas: vendibles.filter((n) => !vendidos.has(n)).length,
    peak, valle,
    clientes_web: tels.length, repiten,
    comision_app: local.comision_app, comision_ahorrada: Math.round(suma(web) * local.comision_app / 100),
    por_dia: dias.map((d) => { const l = ps.filter((p) => p.dia === d); return { dia: d, pedidos: l.length, ventas: suma(l) }; }),
    por_hora: horas,
    platos: items,
    sugeridos: { unidades: sug.n, ventas: sug.monto },
    margen: (() => {
      if (!ps.length) return { ventas: 0, costo: 0, margen: 0, estimados: 0 };
      const it = db.prepare(`SELECT cantidad, precio_unitario, costo_unitario FROM pedido_items WHERE pedido_id IN (${ps.map(() => '?').join(',')})`).all(...ps.map((p) => p.id));
      const v = it.reduce((a, x) => a + x.cantidad * x.precio_unitario, 0);
      const c = it.reduce((a, x) => a + x.cantidad * (x.costo_unitario ?? Math.round(x.precio_unitario * (local.costo_pct ?? 35) / 100)), 0);
      return { ventas: v, costo: c, margen: v - c, estimados: it.filter((x) => x.costo_unitario == null).length };
    })(),
    despachos: (() => { const l = ps.filter((p) => p.modalidad === 'despacho'), conCosto = l.filter((p) => p.costo_viaje != null);
      return { pedidos: l.length, cobrado: l.reduce((a, p) => a + (p.costo_despacho || 0), 0), con_costo: conCosto.length,
        costo: conCosto.reduce((a, p) => a + p.costo_viaje, 0), cobrado_con_costo: conCosto.reduce((a, p) => a + (p.costo_despacho || 0), 0),
        km: Math.round(l.reduce((a, p) => a + (p.distancia_m || 0), 0) / 100) / 10 }; })(),
  };
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
    if (m === 'POST' && parts[2] === 'cotizar') {
      const b = await readJson(req);
      return send(res, 200, cotizarDespacho(local, Number(b.lat), Number(b.lng)));
    }
    if (m === 'GET' && parts[2] === 'geo') {
      const q = String(url.searchParams.get('q') || '').trim().slice(0, 120);
      if (q.length < 4) return send(res, 400, { error: 'Escribe calle y número.' });
      if (limitar(`geo:${ipDe(req)}`, 40, 15 * 60e3)) return send(res, 429, { error: 'Demasiadas búsquedas. Marca tu ubicación en el mapa.' });
      const r = await geocodificar(local, q);
      return r ? send(res, 200, r) : send(res, 503, { error: 'El buscador de direcciones no responde. Marca tu ubicación en el mapa.' });
    }
    if (m === 'POST' && parts[2] === 'pedidos') {
      if (limitar(`pedido:${ipDe(req)}`, 15, 15 * 60e3)) return send(res, 429, { error: 'Demasiados pedidos seguidos. Espera unos minutos o llama al local.' });
      const r = crearPedido(local, await readJson(req));
      return send(res, r.error ? 400 : 201, r);
    }
  }

  // --- seguimiento (público, por token) ---
  if (m === 'GET' && parts[0] === 'seguimiento' && /^[\w-]{20,30}$/.test(parts[1] || '')) {
    const p = db.prepare('SELECT * FROM pedidos WHERE token=?').get(parts[1]);
    if (!p) return send(res, 404, { error: 'No encontramos ese pedido' });
    const l = db.prepare('SELECT slug, nombre, whatsapp, telefono, transferencia, logo FROM locales WHERE id=?').get(p.local_id);
    const local = { slug: l.slug, nombre: l.nombre, whatsapp: l.whatsapp, telefono: l.telefono, transferencia: l.transferencia ? JSON.parse(l.transferencia) : null, logo: l.logo ? `${BASE}/img/${l.logo}` : null };
    const items = db.prepare('SELECT nombre, agregados, salsas, cantidad, precio_unitario, nota FROM pedido_items WHERE pedido_id=?').all(p.id)
      .map((i) => ({ ...i, agregados: JSON.parse(i.agregados), salsas: JSON.parse(i.salsas) }));
    // Solo lo que el cliente necesita ver: sin teléfono, dirección ni datos de cobro.
    return send(res, 200, { local, numero: p.numero, cliente: p.cliente.split(' ')[0], estado: p.estado, franja: p.franja,
      modalidad: p.modalidad, total: p.total, costo_despacho: p.costo_despacho, pagado: !!p.pagado, creado: p.creado, items });
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
    if (m === 'GET' && parts[1] === 'carta') {
      // Costos de insumos: solo para el panel (nunca en la carta pública).
      const costos = new Map(db.prepare('SELECT id, costo FROM productos WHERE local_id=?').all(lid).map((r) => [r.id, r.costo]));
      const mm = menu(local);
      mm.categorias = mm.categorias.map((c) => ({ ...c, productos: c.productos.map((p) => ({ ...p, costo: costos.get(p.id) ?? null })) }));
      mm.local = { ...mm.local, costo_pct: local.costo_pct };
      return send(res, 200, { ...mm, equipo: equipoDe(local) });
    }
    // Equipo del mes: entregas, km y liquidación estimada de cada trabajador, con el resultado del despacho.
    if (m === 'GET' && parts[1] === 'equipo') {
      const mes = /^\d{4}-\d{2}$/.test(url.searchParams.get('mes') || '') ? url.searchParams.get('mes') : franjas(local).dia.slice(0, 7);
      return send(res, 200, equipoMes(local, mes));
    }
    if (m === 'GET' && parts[1] === 'pedidos' && !parts[2]) {
      const dia = url.searchParams.get('dia') || franjas(local).dia;
      const ids = db.prepare('SELECT id FROM pedidos WHERE local_id=? AND dia=? ORDER BY id').all(lid, dia);
      const pedidos = ids.map((r) => pedidoCompleto(r.id, lid));
      const vendido = pedidos.filter((p) => p.estado !== 'anulado').reduce((s, p) => s + p.total, 0);
      return send(res, 200, { dia, local: local.nombre, logo: local.logo ? `${BASE}/img/${local.logo}` : null, pausa: !!local.pausa, modo_boleta: local.modo_boleta, vendido, pedidos });
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
      let repartidor = p.repartidor_id;
      if (b.repartidor_id !== undefined) {
        repartidor = b.repartidor_id ? String(b.repartidor_id) : null;
        if (repartidor && !equipoDe(local).trabajadores.some((t) => t.id === repartidor)) return send(res, 400, { error: 'Ese repartidor no existe' });
      }
      db.prepare('UPDATE pedidos SET estado=?, pagado=?, folio_boleta=?, medio_pago=?, recibido=?, cobrado_en=?, repartidor_id=?, actualizado=? WHERE id=?')
        .run(estado, pagadoFinal, folio, medio_pago, recibido, cobrado_en, repartidor, Date.now(), p.id);
      return send(res, 200, pedidoCompleto(p.id, lid));
    }
    if (m === 'GET' && parts[1] === 'resumen') {
      const f = url.searchParams.get('semana') || franjas(local).dia;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || isNaN(new Date(f))) return send(res, 400, { error: 'Fecha inválida' });
      return send(res, 200, resumen(local, f));
    }
    // Logo del local: mismo control que las fotos (WebP, tamaño máximo), con transparencia.
    if (parts[1] === 'local' && parts[2] === 'logo' && (m === 'PUT' || m === 'DELETE')) {
      let nombre = null;
      if (m === 'PUT') {
        let buf;
        try { buf = await readBytes(req, IMG_MAX); } catch (e) { if (e.tooBig) return send(res, 413, { error: 'El logo pesa demasiado' }); throw e; }
        if (!esWebp(buf)) return send(res, 415, { error: 'Formato no válido' });
        nombre = `${lid}-logo-${crypto.createHash('sha1').update(buf).digest('hex').slice(0, 10)}.webp`;
        fs.writeFileSync(path.join(IMG_DIR, nombre), buf);
      }
      db.prepare('UPDATE locales SET logo=? WHERE id=?').run(nombre, lid);
      if (local.logo && local.logo !== nombre) borrarImagen(local.logo);
      return send(res, 200, { logo: nombre ? `${BASE}/img/${nombre}` : null });
    }
    if (m === 'PATCH' && parts[1] === 'local') {
      const r = actualizarLocal(local, await readJson(req));
      return r.error ? send(res, 400, r) : send(res, 200, menu(db.prepare('SELECT * FROM locales WHERE id=?').get(lid)).local);
    }
    // Venta de mostrador: se cobra al momento; opcionalmente pasa a cocina con comanda.
    if (m === 'POST' && parts[1] === 'venta') {
      const b = await readJson(req);
      if (!MEDIOS.includes(b.medio_pago)) return send(res, 400, { error: 'Elige el medio de pago' });
      const v = validarItems(local, b.items);
      if (v.error) return send(res, 400, v);
      const recibido = b.medio_pago === 'efectivo' ? Math.round(Number(b.recibido) || v.total) : v.total;
      if (recibido < v.total) return send(res, 400, { error: 'El monto recibido es menor al total' });
      const r = guardarPedido(local, {
        cliente: String(b.cliente || '').trim().slice(0, 80) || 'Mostrador', telefono: '', franja: 'Mostrador', modalidad: 'retiro',
        notas: limpiarNota(b.notas, 300), dia: franjas(local).dia, canal: 'mostrador',
        estado: b.cocina ? 'preparacion' : 'entregado', medio_pago: b.medio_pago, recibido,
        cobrado_en: new Date().toTimeString().slice(0, 5), folio: String(b.folio_boleta || '').replace(/\D/g, '').slice(0, 12) || null,
      }, v);
      return send(res, 201, { ...r, vuelto: recibido - v.total });
    }
    if (m === 'POST' && parts[1] === 'productos' && !parts[2]) {
      const v = datosProducto(lid, await readJson(req), null);
      if (v.error) return send(res, 400, v);
      const orden = db.prepare('SELECT COALESCE(MAX(orden),-1)+1 n FROM productos WHERE categoria_id=?').get(v.categoria_id).n;
      const { lastInsertRowid: id } = db.prepare(`INSERT INTO productos (local_id,categoria_id,nombre,descripcion,precio,activo,precio_pendiente,incluye,orden,destacado,sugerir,costo)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(lid, v.categoria_id, v.nombre, v.descripcion, v.precio, v.activo, v.precio_pendiente, v.incluye, orden, v.destacado, v.sugerir, v.costo);
      return send(res, 201, { id: Number(id) });
    }
    if (m === 'PATCH' && parts[1] === 'productos' && parts[2]) {
      const b = await readJson(req);
      const p = db.prepare('SELECT * FROM productos WHERE id=? AND local_id=?').get(Number(parts[2]), lid);
      if (!p) return send(res, 404, { error: 'No existe' });
      if (b.mover) { mover('productos', p, Number(b.mover), 'categoria_id'); return send(res, 200, { ok: true }); }
      const v = datosProducto(lid, b, p);
      if (v.error) return send(res, 400, v);
      db.exec('BEGIN');
      db.prepare(`UPDATE productos SET categoria_id=?, nombre=?, descripcion=?, precio=?, activo=?, precio_pendiente=?, incluye=?, destacado=?, sugerir=?, archivado=?, costo=? WHERE id=?`)
        .run(v.categoria_id, v.nombre, v.descripcion, v.precio, v.activo, v.precio_pendiente, v.incluye, v.destacado, v.sugerir, v.archivado, v.costo, p.id);
      if (v.precio !== p.precio) db.prepare('INSERT INTO historial_precio (local_id,producto_id,anterior,nuevo) VALUES (?,?,?,?)').run(lid, p.id, p.precio, v.precio);
      db.exec('COMMIT');
      return send(res, 200, { ok: true });
    }
    if (m === 'POST' && parts[1] === 'categorias' && !parts[2]) {
      const nombre = String((await readJson(req)).nombre || '').trim().slice(0, 40);
      if (!nombre) return send(res, 400, { error: 'Escribe el nombre de la categoría.' });
      const orden = db.prepare('SELECT COALESCE(MAX(orden),-1)+1 n FROM categorias WHERE local_id=?').get(lid).n;
      const { lastInsertRowid: id } = db.prepare('INSERT INTO categorias (local_id,nombre,orden) VALUES (?,?,?)').run(lid, nombre, orden);
      return send(res, 201, { id: Number(id) });
    }
    if (m === 'PATCH' && parts[1] === 'categorias' && parts[2]) {
      const b = await readJson(req);
      const c = db.prepare('SELECT * FROM categorias WHERE id=? AND local_id=?').get(Number(parts[2]), lid);
      if (!c) return send(res, 404, { error: 'No existe' });
      if (b.mover) { mover('categorias', c, Number(b.mover), 'local_id'); return send(res, 200, { ok: true }); }
      const nombre = b.nombre === undefined ? c.nombre : String(b.nombre).trim().slice(0, 40);
      if (!nombre) return send(res, 400, { error: 'El nombre no puede quedar vacío.' });
      db.prepare('UPDATE categorias SET nombre=?, salsas=? WHERE id=?').run(nombre, b.salsas === undefined ? c.salsas : (b.salsas ? 1 : 0), c.id);
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
    if (m === 'POST' && parts[1] === 'agregados' && !parts[2]) {
      const b = await readJson(req);
      const nombre = String(b.nombre || '').trim().slice(0, 40), tipo = b.tipo === 'salsa' ? 'salsa' : 'ingrediente';
      if (!nombre) return send(res, 400, { error: 'Escribe el nombre.' });
      if (db.prepare('SELECT 1 FROM agregados WHERE local_id=? AND tipo=? AND archivado=0 AND lower(nombre)=lower(?)').get(lid, tipo, nombre)) return send(res, 400, { error: `"${nombre}" ya está en la lista.` });
      const { lastInsertRowid: id } = db.prepare('INSERT INTO agregados (local_id,nombre,tipo) VALUES (?,?,?)').run(lid, nombre, tipo);
      return send(res, 201, { id: Number(id) });
    }
    if (m === 'PATCH' && parts[1] === 'agregados' && parts[2]) {
      const b = await readJson(req);
      const a = db.prepare('SELECT * FROM agregados WHERE id=? AND local_id=?').get(Number(parts[2]), lid);
      if (!a) return send(res, 404, { error: 'No existe' });
      const nombre = b.nombre === undefined ? a.nombre : String(b.nombre).trim().slice(0, 40);
      if (!nombre) return send(res, 400, { error: 'El nombre no puede quedar vacío.' });
      db.prepare('UPDATE agregados SET disponible=?, nombre=?, archivado=? WHERE id=?').run(
        b.disponible === undefined ? a.disponible : (b.disponible ? 1 : 0), nombre, b.archivado === undefined ? a.archivado : (b.archivado ? 1 : 0), a.id);
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
    if (p === '/robots.txt') return send(res, 200, INDEXAR ? 'User-agent: *\nDisallow: /panel\nDisallow: /api/\nDisallow: /seguimiento\nDisallow: /comanda\n' : 'User-agent: *\nDisallow: /\n');
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
    if (p === '/cartel') return serveFile(res, 'cartel.html');
    if (p === '/seguimiento') return serveFile(res, 'seguimiento.html');
    if (/^\/[a-z0-9-]+$/.test(p) && db.prepare('SELECT 1 FROM locales WHERE slug=?').get(p.slice(1))) return serveFile(res, 'carta.html');
    const f = p.slice(1);
    return serveFile(res, f, url.searchParams.get('v') === ver(path.basename(f)));
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
