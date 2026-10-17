// Usuarios del panel por local. El dueño entra con la clave del local; el resto del equipo con un PIN
// en la tablet del local (que queda asociada al local cuando el dueño entra en ella).
// Claves y PIN se guardan con scrypt + sal: nunca en texto plano.
import crypto from 'node:crypto';

export const ROLES = {
  dueno: { nombre: 'Dueño', nivel: 4 },
  encargado: { nombre: 'Encargado', nivel: 3 },
  caja: { nombre: 'Caja', nivel: 2 },
  cocina: { nombre: 'Cocina', nivel: 1 },
};
// Qué puede hacer cada rol (nivel mínimo). El dueño puede todo.
export const PERMISOS = {
  ver_pedidos: 1, mover_pedidos: 1, agotar: 1,
  cobrar: 2, anular: 2, venta: 2, caja: 2, gastos: 2, pausa: 2,
  reabrir_caja: 3, resumen: 3, carta: 3, despacho: 3,
  inventario: 3, clientes: 3,
  costos: 4, equipo: 4, local: 4, usuarios: 4, exportar: 4, resultados: 4, licencia: 4,
};
export const puedeRol = (rol, permiso) => (ROLES[rol]?.nivel || 0) >= (PERMISOS[permiso] ?? 99);

const texto = (v, max) => String(v ?? '').replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max) || null;
export function hash(secreto) {
  const sal = crypto.randomBytes(16);
  return `${sal.toString('base64url')}.${crypto.scryptSync(String(secreto), sal, 32).toString('base64url')}`;
}
export function verificar(secreto, guardado) {
  if (!guardado) return false;
  const [sal, h] = guardado.split('.');
  const calc = crypto.scryptSync(String(secreto), Buffer.from(sal, 'base64url'), 32);
  const esp = Buffer.from(h, 'base64url');
  return esp.length === calc.length && crypto.timingSafeEqual(esp, calc);
}
// Clave legible para entregar al local (sin 0/O ni 1/l): 12 caracteres, ~60 bits.
export function claveNueva() {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(12), (b) => abc[b % abc.length]).join('').replace(/(.{4})(?=.)/g, '$1-');
}
const PIN_OK = (p) => /^\d{4,6}$/.test(String(p ?? ''));
const DEBILES = new Set(['0000', '1111', '1234', '4321', '2222', '9999', '000000', '123456', '111111']);

export function crearUsuarios(db) {
  db.exec(`
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY, local_id INTEGER NOT NULL REFERENCES locales(id), nombre TEXT NOT NULL,
  rol TEXT NOT NULL, pin_hash TEXT NOT NULL, trabajador_id TEXT, activo INTEGER NOT NULL DEFAULT 1,
  creado TEXT NOT NULL DEFAULT (datetime('now','localtime')), ultimo_acceso TEXT);
CREATE TABLE IF NOT EXISTS turnos (
  id INTEGER PRIMARY KEY, local_id INTEGER NOT NULL, usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  entrada TEXT NOT NULL, salida TEXT);
CREATE INDEX IF NOT EXISTS turnos_usuario ON turnos(usuario_id, entrada);
`);
  const cols = new Set(db.prepare('PRAGMA table_info(locales)').all().map((c) => c.name));
  if (!cols.has('clave_hash')) db.exec('ALTER TABLE locales ADD COLUMN clave_hash TEXT');

  const lista = (lid) => db.prepare('SELECT id, nombre, rol, trabajador_id, activo, creado, ultimo_acceso FROM usuarios WHERE local_id=? ORDER BY activo DESC, id').all(lid)
    .map((u) => ({ ...u, abierto: !!db.prepare('SELECT 1 FROM turnos WHERE usuario_id=? AND salida IS NULL').get(u.id) }));
  const activos = (lid) => db.prepare('SELECT COUNT(*) n FROM usuarios WHERE local_id=? AND activo=1').get(lid).n;

  // El PIN no se puede repetir dentro del local: es lo único que distingue a cada persona al entrar.
  function pinOcupado(lid, pin, exceptoId) {
    return db.prepare('SELECT id, pin_hash FROM usuarios WHERE local_id=? AND activo=1').all(lid).some((u) => u.id !== exceptoId && verificar(pin, u.pin_hash));
  }
  function guardar(lid, b, id, { maxUsuarios } = {}) {
    const u = id ? db.prepare('SELECT * FROM usuarios WHERE id=? AND local_id=?').get(id, lid) : null;
    if (id && !u) return { error: 'No existe', status: 404 };
    const nombre = b.nombre === undefined ? u?.nombre : texto(b.nombre, 60);
    if (!nombre) return { error: 'Escribe el nombre' };
    const rol = b.rol === undefined ? u?.rol : b.rol;
    if (!ROLES[rol] || rol === 'dueno') return { error: 'Elige el rol: encargado, caja o cocina' };
    const activo = b.activo === undefined ? (u ? u.activo : 1) : (b.activo ? 1 : 0);
    let pinHash = u?.pin_hash;
    if (b.pin !== undefined || !u) {
      if (!PIN_OK(b.pin)) return { error: 'El PIN debe tener de 4 a 6 números' };
      if (DEBILES.has(String(b.pin))) return { error: 'Ese PIN es muy fácil de adivinar' };
      if (pinOcupado(lid, b.pin, u?.id)) return { error: 'Otra persona ya usa ese PIN' };
      pinHash = hash(b.pin);
    }
    if (activo && (!u || !u.activo) && maxUsuarios != null && activos(lid) >= maxUsuarios)
      return { error: `Tu plan permite ${maxUsuarios} usuarios con PIN. Desactiva uno o cambia de plan.`, status: 402 };
    const trabajador = b.trabajador_id === undefined ? u?.trabajador_id ?? null : (texto(b.trabajador_id, 40));
    if (u) {
      db.prepare('UPDATE usuarios SET nombre=?, rol=?, pin_hash=?, trabajador_id=?, activo=? WHERE id=?').run(nombre, rol, pinHash, trabajador, activo, u.id);
      if (!activo) db.prepare("UPDATE turnos SET salida=datetime('now','localtime') WHERE usuario_id=? AND salida IS NULL").run(u.id);
      return { id: u.id };
    }
    const r = db.prepare('INSERT INTO usuarios (local_id,nombre,rol,pin_hash,trabajador_id) VALUES (?,?,?,?,?)').run(lid, nombre, rol, pinHash, trabajador);
    return { id: Number(r.lastInsertRowid) };
  }
  function porPin(lid, pin) {
    if (!PIN_OK(pin)) return null;
    const u = db.prepare('SELECT * FROM usuarios WHERE local_id=? AND activo=1').all(lid).find((x) => verificar(pin, x.pin_hash));
    if (u) db.prepare("UPDATE usuarios SET ultimo_acceso=datetime('now','localtime') WHERE id=?").run(u.id);
    return u || null;
  }
  const porId = (lid, id) => db.prepare('SELECT id, nombre, rol, activo, trabajador_id FROM usuarios WHERE id=? AND local_id=?').get(id, lid);

  // Marcar entrada y salida: turnos reales para el sueldo (los usa Equipo).
  function marcar(lid, uid, tipo) {
    const abierto = db.prepare('SELECT * FROM turnos WHERE usuario_id=? AND salida IS NULL').get(uid);
    if (tipo === 'entrada') {
      if (abierto) return { error: 'Ya marcaste la entrada', desde: abierto.entrada };
      db.prepare("INSERT INTO turnos (local_id,usuario_id,entrada) VALUES (?,?,datetime('now','localtime'))").run(lid, uid);
      return { ok: true };
    }
    if (!abierto) return { error: 'No hay una entrada marcada' };
    db.prepare("UPDATE turnos SET salida=datetime('now','localtime') WHERE id=?").run(abierto.id);
    return { ok: true, desde: abierto.entrada };
  }
  // Horas trabajadas del mes por usuario (turnos cerrados; los de más de 16 h se marcan para revisar).
  function horasMes(lid, mes) {
    const t = db.prepare(`SELECT t.usuario_id, u.nombre, u.trabajador_id, t.entrada, t.salida FROM turnos t JOIN usuarios u ON u.id=t.usuario_id
      WHERE t.local_id=? AND substr(t.entrada,1,7)=? ORDER BY t.entrada`).all(lid, mes);
    const por = new Map();
    for (const x of t) {
      const r = por.get(x.usuario_id) || { usuario_id: x.usuario_id, nombre: x.nombre, trabajador_id: x.trabajador_id, horas: 0, turnos: 0, abiertos: 0, revisar: 0 };
      if (!x.salida) r.abiertos++;
      else {
        const h = (new Date(x.salida.replace(' ', 'T')) - new Date(x.entrada.replace(' ', 'T'))) / 3600e3;
        if (h > 16) r.revisar++; else { r.horas += h; r.turnos++; }
      }
      por.set(x.usuario_id, r);
    }
    return [...por.values()].map((r) => ({ ...r, horas: Math.round(r.horas * 10) / 10 }));
  }

  const ponerClave = (lid, clave) => db.prepare('UPDATE locales SET clave_hash=? WHERE id=?').run(hash(clave), lid);
  return { lista, guardar, porPin, porId, marcar, horasMes, ponerClave, activos };
}
