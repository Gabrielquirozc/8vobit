// Combos y promociones (plan Pro) y cupones de vuelta (fidelización, plan Gestión).
// Una promoción descuenta un % o un monto fijo del subtotal (o de una categoría). Puede ser
// automática (por día y horario) o pedir un código. Un cupón de vuelta es una promoción de un
// solo uso atada al celular del cliente. Cada pedido lleva a lo más una promoción: la que más
// descuenta. El descuento nunca toca el despacho y siempre se calcula en el servidor.
// Un combo es un producto normal de la carta con sus componentes (para mostrarlos y para el inventario).
import crypto from 'node:crypto';

const texto = (v, max) => String(v ?? '').replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max) || null;
const esDia = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(`${v}T12:00:00`));
const esHora = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const tel9 = (t) => String(t || '').replace(/\D/g, '').slice(-9);
const sumarDias = (dia, n) => { const d = new Date(`${dia}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
// Código legible (sin 0/O ni 1/I/L).
const codigoAzar = () => Array.from(crypto.randomBytes(6), (b) => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[b % 31]).join('');
const FIDELIZACION = { activo: false, pct: 10, minimo: 0, dias: 30 };

export function crearPromos(db) {
  db.exec(`
CREATE TABLE IF NOT EXISTS promociones (
  id INTEGER PRIMARY KEY, local_id INTEGER NOT NULL REFERENCES locales(id), nombre TEXT NOT NULL,
  tipo TEXT NOT NULL, valor INTEGER NOT NULL, codigo TEXT, dias TEXT NOT NULL DEFAULT '[]', desde TEXT, hasta TEXT,
  minimo INTEGER NOT NULL DEFAULT 0, categoria_id INTEGER, vence TEXT, usos_max INTEGER, usos INTEGER NOT NULL DEFAULT 0,
  telefono TEXT, activa INTEGER NOT NULL DEFAULT 1, creado TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE INDEX IF NOT EXISTS promo_local ON promociones(local_id, activa);
CREATE UNIQUE INDEX IF NOT EXISTS promo_codigo ON promociones(local_id, codigo) WHERE codigo IS NOT NULL;
CREATE TABLE IF NOT EXISTS combo_items (
  producto_id INTEGER NOT NULL REFERENCES productos(id), componente_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad INTEGER NOT NULL, PRIMARY KEY (producto_id, componente_id));
`);
  const pcols = new Set(db.prepare('PRAGMA table_info(pedidos)').all().map((c) => c.name));
  if (!pcols.has('descuento')) for (const c of ['descuento INTEGER NOT NULL DEFAULT 0', 'promo_id INTEGER', 'promo_nombre TEXT']) db.exec(`ALTER TABLE pedidos ADD COLUMN ${c}`);
  const lcols = new Set(db.prepare('PRAGMA table_info(locales)').all().map((c) => c.name));
  if (!lcols.has('fidelizacion')) db.exec('ALTER TABLE locales ADD COLUMN fidelizacion TEXT');

  const publica = (p) => ({ id: p.id, nombre: p.nombre, tipo: p.tipo, valor: p.valor, codigo: p.codigo, dias: JSON.parse(p.dias), desde: p.desde, hasta: p.hasta,
    minimo: p.minimo, categoria_id: p.categoria_id, vence: p.vence, usos_max: p.usos_max, usos: p.usos, activa: !!p.activa });

  // Promociones del panel (sin los cupones de vuelta, que se ven en Clientes).
  const lista = (lid) => db.prepare('SELECT * FROM promociones WHERE local_id=? AND telefono IS NULL ORDER BY activa DESC, id DESC').all(lid).map(publica);

  function guardar(lid, b, id = null) {
    const p = id ? db.prepare('SELECT * FROM promociones WHERE id=? AND local_id=? AND telefono IS NULL').get(id, lid) : null;
    if (id && !p) return { error: 'No existe', status: 404 };
    const base = p ? publica(p) : { nombre: '', tipo: 'pct', valor: 0, codigo: null, dias: [], desde: null, hasta: null, minimo: 0, categoria_id: null, vence: null, usos_max: null, activa: true };
    const v = { ...base };
    for (const k of Object.keys(base)) if (b[k] !== undefined) v[k] = b[k];
    v.nombre = texto(v.nombre, 60);
    if (!v.nombre) return { error: 'Ponle un nombre a la promoción.' };
    if (!['pct', 'monto'].includes(v.tipo)) return { error: 'Tipo de descuento inválido' };
    v.valor = Math.round(Number(v.valor));
    if (v.tipo === 'pct' ? !(v.valor >= 1 && v.valor <= 90) : !(v.valor >= 100 && v.valor <= 1e6)) return { error: v.tipo === 'pct' ? 'El descuento va de 1 % a 90 %.' : 'Monto de descuento inválido.' };
    v.codigo = v.codigo ? String(v.codigo).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16) || null : null;
    if (v.codigo && v.codigo.length < 3) return { error: 'El código debe tener al menos 3 letras o números.' };
    if (v.codigo && db.prepare('SELECT 1 FROM promociones WHERE local_id=? AND codigo=? AND id!=?').get(lid, v.codigo, id || 0)) return { error: 'Ya hay una promoción con ese código.' };
    v.dias = Array.isArray(v.dias) ? [...new Set(v.dias.map(Number).filter((d) => d >= 0 && d <= 6))].sort() : [];
    v.desde = v.desde || null; v.hasta = v.hasta || null;
    if ((v.desde && !esHora(v.desde)) || (v.hasta && !esHora(v.hasta)) || (!!v.desde !== !!v.hasta)) return { error: 'Horario inválido: indica desde y hasta (HH:MM).' };
    v.minimo = Math.max(0, Math.round(Number(v.minimo) || 0));
    v.categoria_id = v.categoria_id ? Number(v.categoria_id) : null;
    if (v.categoria_id && !db.prepare('SELECT 1 FROM categorias WHERE id=? AND local_id=?').get(v.categoria_id, lid)) return { error: 'Esa categoría no existe.' };
    v.vence = v.vence || null;
    if (v.vence && !esDia(v.vence)) return { error: 'Fecha de término inválida.' };
    v.usos_max = v.usos_max ? Math.max(1, Math.round(Number(v.usos_max))) : null;
    const fila = [v.nombre, v.tipo, v.valor, v.codigo, JSON.stringify(v.dias), v.desde, v.hasta, v.minimo, v.categoria_id, v.vence, v.usos_max, v.activa ? 1 : 0];
    if (p) db.prepare('UPDATE promociones SET nombre=?, tipo=?, valor=?, codigo=?, dias=?, desde=?, hasta=?, minimo=?, categoria_id=?, vence=?, usos_max=?, activa=? WHERE id=?').run(...fila, id);
    else id = Number(db.prepare('INSERT INTO promociones (nombre,tipo,valor,codigo,dias,desde,hasta,minimo,categoria_id,vence,usos_max,activa,local_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...fila, lid).lastInsertRowid);
    return publica(db.prepare('SELECT * FROM promociones WHERE id=?').get(id));
  }

  // ¿Vale ahora? `ahora` = { dia: 'AAAA-MM-DD', hora: 'HH:MM' }.
  function vigente(p, ahora) {
    if (!p.activa || (p.vence && ahora.dia > p.vence) || (p.usos_max && p.usos >= p.usos_max)) return false;
    const dias = JSON.parse(p.dias), dow = new Date(`${ahora.dia}T12:00:00`).getDay();
    if (dias.length && !dias.includes(dow)) return false;
    if (p.desde && p.hasta) return p.desde <= p.hasta ? ahora.hora >= p.desde && ahora.hora < p.hasta : ahora.hora >= p.desde || ahora.hora < p.hasta;
    return true;
  }
  function descuentoDe(p, items, subtotal) {
    if (subtotal < p.minimo) return 0;
    const base = p.categoria_id ? items.filter((i) => i.p.categoria_id === p.categoria_id).reduce((s, i) => s + i.p.precio * i.cant, 0) : subtotal;
    return Math.min(base, p.tipo === 'pct' ? Math.round((base * p.valor) / 100) : p.valor);
  }
  // Mejor promoción para el pedido. Con código: la del código (y si no sirve, se dice por qué).
  function aplicar(lid, { items, subtotal, codigo, telefono, ahora }) {
    const cod = codigo ? String(codigo).toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
    let candidatas = db.prepare('SELECT * FROM promociones WHERE local_id=? AND activa=1 AND codigo IS NULL AND telefono IS NULL').all(lid).filter((p) => vigente(p, ahora));
    if (cod) {
      const p = db.prepare('SELECT * FROM promociones WHERE local_id=? AND codigo=?').get(lid, cod);
      if (!p || !vigente(p, ahora)) return { error: 'Ese código no existe o ya no está vigente.' };
      if (p.telefono && p.telefono !== tel9(telefono)) return { error: 'Ese cupón es para el celular al que se le entregó.' };
      if (subtotal < p.minimo) return { error: `Ese código vale desde ${'$' + p.minimo.toLocaleString('es-CL')}.` };
      candidatas = [p, ...candidatas];
    }
    let mejor = null, desc = 0;
    for (const p of candidatas) { const d = descuentoDe(p, items, subtotal); if (d > desc) { mejor = p; desc = d; } }
    if (cod && mejor?.codigo !== cod) return { error: 'Ese código no mejora el descuento que ya tiene tu pedido.', promo: mejor, descuento: desc };
    return { promo: mejor, descuento: desc };
  }
  // Se cuenta el uso al guardar el pedido (dentro de su transacción).
  const usar = (id) => db.prepare('UPDATE promociones SET usos=usos+1 WHERE id=?').run(id);
  const devolver = (id) => db.prepare('UPDATE promociones SET usos=MAX(0,usos-1) WHERE id=?').run(id);

  // Lo que la carta muestra: promociones automáticas que valen hoy (sin las de código).
  const enCarta = (lid, ahora) => db.prepare('SELECT * FROM promociones WHERE local_id=? AND activa=1 AND codigo IS NULL AND telefono IS NULL').all(lid)
    .filter((p) => vigente(p, { ...ahora, hora: p.desde || ahora.hora })).map(({ id, nombre, tipo, valor, minimo, categoria_id, desde, hasta }) => ({ id, nombre, tipo, valor, minimo, categoria_id, desde, hasta }));

  // ---------- combos ----------
  const combo = (pid) => db.prepare('SELECT c.componente_id producto_id, c.cantidad, p.nombre FROM combo_items c JOIN productos p ON p.id=c.componente_id WHERE c.producto_id=? ORDER BY p.nombre').all(pid);
  const combos = (lid) => {
    const m = new Map();
    for (const r of db.prepare('SELECT c.producto_id, c.componente_id, c.cantidad, p.nombre FROM combo_items c JOIN productos p ON p.id=c.componente_id WHERE p.local_id=?').all(lid)) {
      if (!m.has(r.producto_id)) m.set(r.producto_id, []);
      m.get(r.producto_id).push({ producto_id: r.componente_id, cantidad: r.cantidad, nombre: r.nombre });
    }
    return m;
  };
  function guardarCombo(lid, pid, lista) {
    if (!db.prepare('SELECT 1 FROM productos WHERE id=? AND local_id=?').get(pid, lid)) return { error: 'No existe', status: 404 };
    if (!Array.isArray(lista) || lista.length > 10) return { error: 'Un combo lleva hasta 10 productos.' };
    const items = [];
    for (const x of lista) {
      const id = Number(x.producto_id), cant = Math.round(Number(x.cantidad) || 1);
      if (id === pid || !db.prepare('SELECT 1 FROM productos WHERE id=? AND local_id=?').get(id, lid)) return { error: 'Un producto del combo no existe.' };
      if (db.prepare('SELECT 1 FROM combo_items WHERE producto_id=?').get(id)) return { error: 'Un combo no puede llevar otro combo.' };
      if (!(cant >= 1 && cant <= 20)) return { error: 'Cantidad inválida en el combo.' };
      items.push([pid, id, cant]);
    }
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM combo_items WHERE producto_id=?').run(pid);
      for (const f of items) db.prepare('INSERT OR REPLACE INTO combo_items (producto_id,componente_id,cantidad) VALUES (?,?,?)').run(...f);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return { producto_id: pid, items: combo(pid) };
  }

  // ---------- fidelización: cupón de vuelta ----------
  const fidelizacion = (local) => ({ ...FIDELIZACION, ...(local.fidelizacion ? JSON.parse(local.fidelizacion) : {}) });
  function guardarFidelizacion(local, b) {
    const f = { ...fidelizacion(local) };
    if (b.activo !== undefined) f.activo = !!b.activo;
    if (b.pct !== undefined) f.pct = Math.round(Number(b.pct));
    if (b.minimo !== undefined) f.minimo = Math.max(0, Math.round(Number(b.minimo) || 0));
    if (b.dias !== undefined) f.dias = Math.round(Number(b.dias));
    if (!(f.pct >= 1 && f.pct <= 50)) return { error: 'El cupón de vuelta va de 1 % a 50 %.' };
    if (!(f.dias >= 3 && f.dias <= 365)) return { error: 'La vigencia va de 3 a 365 días.' };
    db.prepare('UPDATE locales SET fidelizacion=? WHERE id=?').run(JSON.stringify(f), local.id);
    return f;
  }
  // Tras un pedido web: si el cliente no tiene ya un cupón vigente, se le da uno para la próxima vez.
  function cuponVuelta(local, telefono, dia) {
    const f = fidelizacion(local), t = tel9(telefono);
    if (!f.activo || t.length < 8) return null;
    const ya = db.prepare('SELECT * FROM promociones WHERE local_id=? AND telefono=? AND activa=1 AND usos<COALESCE(usos_max,1) AND (vence IS NULL OR vence>=?)').get(local.id, t, dia);
    if (ya) return null;
    let codigo;
    do codigo = codigoAzar(); while (db.prepare('SELECT 1 FROM promociones WHERE local_id=? AND codigo=?').get(local.id, codigo));
    db.prepare("INSERT INTO promociones (local_id,nombre,tipo,valor,codigo,minimo,vence,usos_max,telefono) VALUES (?,?,'pct',?,?,?,?,1,?)")
      .run(local.id, `Cupón de vuelta ${f.pct} %`, f.pct, codigo, f.minimo, sumarDias(dia, f.dias), t);
    return codigo;
  }
  // Cupón vigente del cliente (para mostrarlo en el seguimiento).
  const cuponDe = (lid, telefono, dia) => {
    const p = db.prepare('SELECT codigo, valor, minimo, vence FROM promociones WHERE local_id=? AND telefono=? AND activa=1 AND usos<COALESCE(usos_max,1) AND (vence IS NULL OR vence>=?) ORDER BY id DESC').get(lid, tel9(telefono), dia);
    return p || null;
  };
  const cupones = (lid) => db.prepare('SELECT codigo, valor, vence, usos, telefono, creado FROM promociones WHERE local_id=? AND telefono IS NOT NULL ORDER BY id DESC LIMIT 200').all(lid);
  // Derecho a borrar los datos del cliente: sus cupones se van con él.
  const borrarTelefono = (lid, telefono) => db.prepare('DELETE FROM promociones WHERE local_id=? AND telefono=?').run(lid, tel9(telefono));

  return { lista, guardar, aplicar, usar, devolver, enCarta, combo, combos, guardarCombo, fidelizacion, guardarFidelizacion, cuponVuelta, cuponDe, cupones, borrarTelefono, tel9 };
}
