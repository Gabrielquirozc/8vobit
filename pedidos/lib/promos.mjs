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
  const prcols = new Set(db.prepare('PRAGMA table_info(promociones)').all().map((c) => c.name));
  if (!prcols.has('cupo_unidades')) { db.exec('ALTER TABLE promociones ADD COLUMN cupo_unidades INTEGER'); db.exec('ALTER TABLE promociones ADD COLUMN unidades_usadas INTEGER NOT NULL DEFAULT 0'); }
  if (!prcols.has('archivada')) db.exec('ALTER TABLE promociones ADD COLUMN archivada INTEGER NOT NULL DEFAULT 0');
  const pcols = new Set(db.prepare('PRAGMA table_info(pedidos)').all().map((c) => c.name));
  if (!pcols.has('descuento')) for (const c of ['descuento INTEGER NOT NULL DEFAULT 0', 'promo_id INTEGER', 'promo_nombre TEXT']) db.exec(`ALTER TABLE pedidos ADD COLUMN ${c}`);
  if (!pcols.has('promo_unidades')) db.exec('ALTER TABLE pedidos ADD COLUMN promo_unidades INTEGER NOT NULL DEFAULT 0');
  // Cupo de unidades por día de un combo ("disponibles hoy"): se cuenta con lo vendido ese día, así se reinicia solo y la anulación lo devuelve.
  const procols = new Set(db.prepare('PRAGMA table_info(productos)').all().map((c) => c.name));
  if (!procols.has('cupo_dia')) db.exec('ALTER TABLE productos ADD COLUMN cupo_dia INTEGER');
  const lcols = new Set(db.prepare('PRAGMA table_info(locales)').all().map((c) => c.name));
  if (!lcols.has('fidelizacion')) db.exec('ALTER TABLE locales ADD COLUMN fidelizacion TEXT');

  const publica = (p) => ({ id: p.id, nombre: p.nombre, tipo: p.tipo, valor: p.valor, codigo: p.codigo, dias: JSON.parse(p.dias), desde: p.desde, hasta: p.hasta,
    minimo: p.minimo, categoria_id: p.categoria_id, vence: p.vence, usos_max: p.usos_max, usos: p.usos, cupo_unidades: p.cupo_unidades, unidades_usadas: p.unidades_usadas, activa: !!p.activa });

  // Promociones del panel (sin los cupones de vuelta, que se ven en Clientes).
  const lista = (lid) => db.prepare('SELECT * FROM promociones WHERE local_id=? AND telefono IS NULL AND archivada=0 ORDER BY activa DESC, id DESC').all(lid).map(publica);

  // Quitar una promoción: si nunca se usó se borra; si ya está en pedidos, se archiva (deja de aplicar y de verse, y libera su código).
  function quitar(lid, id) {
    const p = db.prepare('SELECT id, usos FROM promociones WHERE id=? AND local_id=? AND telefono IS NULL AND archivada=0').get(id, lid);
    if (!p) return { error: 'No existe', status: 404 };
    if (p.usos > 0) { db.prepare('UPDATE promociones SET archivada=1, activa=0, codigo=NULL WHERE id=?').run(p.id); return { ok: true, archivada: true }; }
    db.prepare('DELETE FROM promociones WHERE id=?').run(p.id);
    return { ok: true, archivada: false };
  }

  function guardar(lid, b, id = null) {
    const p = id ? db.prepare('SELECT * FROM promociones WHERE id=? AND local_id=? AND telefono IS NULL AND archivada=0').get(id, lid) : null;
    if (id && !p) return { error: 'No existe', status: 404 };
    const base = p ? publica(p) : { nombre: '', tipo: 'pct', valor: 0, codigo: null, dias: [], desde: null, hasta: null, minimo: 0, categoria_id: null, vence: null, usos_max: null, cupo_unidades: null, activa: true };
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
    // Cupo de unidades: total de unidades de producto que la promo puede descontar (vacío = sin límite).
    if (v.cupo_unidades === '' || v.cupo_unidades === undefined) v.cupo_unidades = null;
    if (v.cupo_unidades !== null && !(Number.isInteger(Number(v.cupo_unidades)) && Number(v.cupo_unidades) >= 1 && Number(v.cupo_unidades) <= 1e6)) return { error: 'El cupo de unidades debe ser un entero mayor a 0.' };
    v.cupo_unidades = v.cupo_unidades === null ? null : Number(v.cupo_unidades);
    const fila = [v.nombre, v.tipo, v.valor, v.codigo, JSON.stringify(v.dias), v.desde, v.hasta, v.minimo, v.categoria_id, v.vence, v.usos_max, v.cupo_unidades, v.activa ? 1 : 0];
    if (p) db.prepare('UPDATE promociones SET nombre=?, tipo=?, valor=?, codigo=?, dias=?, desde=?, hasta=?, minimo=?, categoria_id=?, vence=?, usos_max=?, cupo_unidades=?, activa=? WHERE id=?').run(...fila, id);
    else id = Number(db.prepare('INSERT INTO promociones (nombre,tipo,valor,codigo,dias,desde,hasta,minimo,categoria_id,vence,usos_max,cupo_unidades,activa,local_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...fila, lid).lastInsertRowid);
    return publica(db.prepare('SELECT * FROM promociones WHERE id=?').get(id));
  }

  const agotada = (p) => !!p.cupo_unidades && p.unidades_usadas >= p.cupo_unidades;
  // ¿Vale ahora? `ahora` = { dia: 'AAAA-MM-DD', hora: 'HH:MM' }.
  function vigente(p, ahora) {
    if (!p.activa || (p.vence && ahora.dia > p.vence) || (p.usos_max && p.usos >= p.usos_max) || agotada(p)) return false;
    const dias = JSON.parse(p.dias), dow = new Date(`${ahora.dia}T12:00:00`).getDay();
    if (dias.length && !dias.includes(dow)) return false;
    if (p.desde && p.hasta) return p.desde <= p.hasta ? ahora.hora >= p.desde && ahora.hora < p.hasta : ahora.hora >= p.desde || ahora.hora < p.hasta;
    return true;
  }
  // Descuento de la promo sobre el pedido. Alcance = unidades de producto a las que apunta (las de la categoría, o todas las del pedido
  // en las promos de pedido completo y de mínimo de compra). Con cupo de unidades, solo se descuentan las que quedan, las más caras
  // primero; el monto fijo se prorratea por unidades. Devuelve { descuento, unidades, alcance }.
  function descuentoDe(p, items, subtotal) {
    const nada = { descuento: 0, unidades: 0, alcance: 0 };
    if (subtotal < p.minimo) return nada;
    const precios = [];
    for (const i of items) if (!p.categoria_id || i.p.categoria_id === p.categoria_id) for (let k = 0; k < i.cant; k++) precios.push(i.p.precio);
    const alcance = precios.length;
    if (!alcance) return nada;
    const quedan = p.cupo_unidades ? p.cupo_unidades - p.unidades_usadas : Infinity;
    const unidades = Math.min(alcance, quedan);
    if (unidades <= 0) return nada;
    const base = precios.sort((x, y) => y - x).slice(0, unidades).reduce((t, x) => t + x, 0);
    const bruto = p.tipo === 'pct' ? Math.round((base * p.valor) / 100) : Math.round((p.valor * unidades) / alcance);
    return { descuento: Math.min(base, bruto), unidades, alcance };
  }
  // Mejor promoción para el pedido. Con código: la del código (y si no sirve, se dice por qué).
  function aplicar(lid, { items, subtotal, codigo, telefono, ahora }) {
    const cod = codigo ? String(codigo).toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
    let candidatas = db.prepare('SELECT * FROM promociones WHERE local_id=? AND activa=1 AND codigo IS NULL AND telefono IS NULL AND archivada=0').all(lid).filter((p) => vigente(p, ahora));
    if (cod) {
      const p = db.prepare('SELECT * FROM promociones WHERE local_id=? AND codigo=?').get(lid, cod);
      if (p && agotada(p)) return { error: 'Ese código ya se agotó.' };
      if (!p || !vigente(p, ahora)) return { error: 'Ese código no existe o ya no está vigente.' };
      if (p.telefono && p.telefono !== tel9(telefono)) return { error: 'Ese cupón es para el celular al que se le entregó.' };
      if (subtotal < p.minimo) return { error: `Ese código vale desde ${'$' + p.minimo.toLocaleString('es-CL')}.` };
      candidatas = [p, ...candidatas];
    }
    let mejor = null, det = { descuento: 0, unidades: 0, alcance: 0 };
    for (const p of candidatas) { const d = descuentoDe(p, items, subtotal); if (d.descuento > det.descuento) { mejor = p; det = d; } }
    if (cod && mejor?.codigo !== cod) return { error: 'Ese código no mejora el descuento que ya tiene tu pedido.', promo: mejor, descuento: det.descuento };
    return { promo: mejor, descuento: det.descuento, unidades: det.unidades, alcance: det.alcance };
  }
  // Reserva las unidades del cupo. Va dentro de la transacción del pedido y es atómica: nunca pasa del cupo.
  const consumir = (id, unidades) => !unidades || db.prepare('UPDATE promociones SET unidades_usadas=unidades_usadas+? WHERE id=? AND cupo_unidades IS NOT NULL AND unidades_usadas+?<=cupo_unidades').run(unidades, id, unidades).changes === 1;
  // Se cuenta el uso al guardar el pedido (dentro de su transacción).
  const usar = (id) => db.prepare('UPDATE promociones SET usos=usos+1 WHERE id=?').run(id);
  const devolver = (id, unidades = 0) => db.prepare('UPDATE promociones SET usos=MAX(0,usos-1), unidades_usadas=MAX(0,unidades_usadas-?) WHERE id=?').run(unidades, id);

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

  // ---------- combos propios: un producto de la carta (categoría "Combos") con precio propio y sus componentes ----------
  const CAT_COMBOS = 'Combos';
  // Componentes: ids del local (404 si no existen), sin combos dentro de combos, al menos 2 unidades en total y hasta 10 productos distintos.
  function itemsCombo(lid, lista, propio = 0) {
    if (!Array.isArray(lista) || !lista.length || lista.length > 10) return { error: 'Un combo lleva al menos 2 unidades (hasta 10 productos distintos).' };
    const por = new Map();
    for (const x of lista) {
      const id = Number(x?.producto_id), cant = Math.round(Number(x?.cantidad) || 1);
      if (!Number.isInteger(id) || !db.prepare('SELECT 1 FROM productos WHERE id=? AND local_id=? AND archivado=0').get(id, lid)) return { error: 'Un producto del combo no existe.', status: 404 };
      if (id === propio) return { error: 'Un combo no puede llevarse a sí mismo.' };
      if (db.prepare('SELECT 1 FROM combo_items WHERE producto_id=?').get(id)) return { error: 'Un combo no puede llevar otro combo.' };
      por.set(id, (por.get(id) || 0) + cant);
    }
    for (const c of por.values()) if (!(c >= 1 && c <= 20)) return { error: 'Cantidad inválida en el combo.' };
    if ([...por.values()].reduce((s, c) => s + c, 0) < 2) return { error: 'Un combo lleva al menos 2 productos.' };
    return { items: [...por] };
  }
  const precioCombo = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 && n <= 1e6 ? n : null; };
  const comboDe = (lid, pid) => db.prepare('SELECT id, nombre, precio, activo FROM productos WHERE id=? AND local_id=? AND archivado=0 AND EXISTS (SELECT 1 FROM combo_items WHERE producto_id=productos.id)').get(pid, lid);

  // Cupo diario de un combo ("disponibles hoy"): vacío = sin límite.
  const cupoDia = (v) => { if (v === undefined || v === null || v === '') return { v: null }; const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 100000 ? { v: n } : { error: 'El cupo de unidades por día debe ser un entero mayor a 0.' }; };
  function crearCombo(lid, b) {
    const nombre = texto(b.nombre, 80);
    if (!nombre) return { error: 'Ponle un nombre al combo.' };
    const precio = precioCombo(b.precio);
    if (!precio) return { error: 'El precio del combo debe ser un monto entero mayor a 0.' };
    const it = itemsCombo(lid, b.items);
    if (it.error) return it;
    const cupo = cupoDia(b.cupo_dia);
    if (cupo.error) return cupo;
    db.exec('BEGIN');
    try {
      let cat = db.prepare('SELECT id FROM categorias WHERE local_id=? AND lower(nombre)=lower(?)').get(lid, CAT_COMBOS);
      if (!cat) cat = { id: Number(db.prepare('INSERT INTO categorias (local_id,nombre,orden,salsas) VALUES (?,?,(SELECT COALESCE(MAX(orden),-1)+1 FROM categorias WHERE local_id=?),0)').run(lid, CAT_COMBOS, lid).lastInsertRowid) };
      const orden = db.prepare('SELECT COALESCE(MAX(orden),-1)+1 n FROM productos WHERE categoria_id=?').get(cat.id).n;
      const id = Number(db.prepare(`INSERT INTO productos (local_id,categoria_id,nombre,descripcion,precio,activo,precio_pendiente,incluye,orden,destacado,sugerir,costo,cupo_dia)
        VALUES (?,?,?,NULL,?,?,0,0,?,0,0,NULL,?)`).run(lid, cat.id, nombre, precio, b.activo === false ? 0 : 1, orden, cupo.v).lastInsertRowid);
      for (const [cid, cant] of it.items) db.prepare('INSERT INTO combo_items (producto_id,componente_id,cantidad) VALUES (?,?,?)').run(id, cid, cant);
      db.exec('COMMIT');
      return { id, categoria_id: cat.id };
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  function editarCombo(lid, pid, b) {
    const p = comboDe(lid, pid);
    if (!p) return { error: 'No existe', status: 404 };
    const nombre = b.nombre === undefined ? p.nombre : texto(b.nombre, 80);
    if (!nombre) return { error: 'Ponle un nombre al combo.' };
    const precio = b.precio === undefined ? p.precio : precioCombo(b.precio);
    if (!precio) return { error: 'El precio del combo debe ser un monto entero mayor a 0.' };
    const it = b.items === undefined ? null : itemsCombo(lid, b.items, pid);
    if (it?.error) return it;
    const cupo = b.cupo_dia === undefined ? null : cupoDia(b.cupo_dia);
    if (cupo?.error) return cupo;
    db.exec('BEGIN');
    try {
      db.prepare('UPDATE productos SET nombre=?, precio=?, activo=? WHERE id=?').run(nombre, precio, b.activo === undefined ? p.activo : (b.activo ? 1 : 0), pid);
      if (cupo) db.prepare('UPDATE productos SET cupo_dia=? WHERE id=?').run(cupo.v, pid);
      if (precio !== p.precio) db.prepare('INSERT INTO historial_precio (local_id,producto_id,anterior,nuevo) VALUES (?,?,?,?)').run(lid, pid, p.precio, precio);
      if (it) {
        db.prepare('DELETE FROM combo_items WHERE producto_id=?').run(pid);
        for (const [cid, cant] of it.items) db.prepare('INSERT INTO combo_items (producto_id,componente_id,cantidad) VALUES (?,?,?)').run(pid, cid, cant);
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return { id: pid };
  }
  // Quitar un combo lo saca de la carta (el producto queda archivado) y borra su composición.
  function quitarCombo(lid, pid) {
    if (!comboDe(lid, pid)) return { error: 'No existe', status: 404 };
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM combo_items WHERE producto_id=?').run(pid);
      db.prepare('UPDATE productos SET archivado=1, activo=0 WHERE id=?').run(pid);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return { ok: true };
  }

  // ---------- ideas según las ventas de los últimos 60 días ----------
  const DIA_PL = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
  const MIN_PEDIDOS = 30, VENTANA = 60;
  const aMin = (h) => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
  const hh = (h) => `${String(h % 24).padStart(2, '0')}:00`;
  // Franja de 3 horas con menos pedidos dentro del horario de ese día (sin la primera ni la última hora, que siempre son flojas).
  function franjaFlaca(lid, desde, hoyDia, dow, horas) {
    const [a, bruto] = [aMin(horas[0]), aMin(horas[1])], b = bruto <= a ? bruto + 1440 : bruto;
    let h0 = Math.ceil(a / 60), h1 = Math.floor(b / 60);
    if (h1 - h0 >= 5) { h0 += 1; h1 -= 1; }
    if (h1 - h0 < 3) return null;
    const cuenta = new Map(db.prepare("SELECT CAST(substr(creado,12,2) AS INTEGER) h, COUNT(*) n FROM pedidos WHERE local_id=? AND dia>=? AND dia<? AND estado!='anulado' AND CAST(strftime('%w',dia) AS INTEGER)=? GROUP BY h").all(lid, desde, hoyDia, dow).map((r) => [r.h, r.n]));
    let mejor = null;
    for (let h = h0; h + 3 <= h1; h++) {
      const s = [0, 1, 2].reduce((t, k) => t + (cuenta.get((h + k) % 24) || 0), 0);
      const centro = Math.abs(h + 1.5 - (h0 + h1) / 2); // a igual venta, la franja más cercana al centro del horario
      if (!mejor || s < mejor.s || (s === mejor.s && centro < mejor.centro)) mejor = { h, s, centro };
    }
    return mejor && { desde: hh(mejor.h), hasta: hh(mejor.h + 3) };
  }
  // Solo lectura. Con menos de 30 pedidos no sugiere nada.
  function sugerencias(local, hoyDia) {
    const lid = local.id, desde = sumarDias(hoyDia, -(VENTANA - 1));
    const t = db.prepare("SELECT COUNT(*) n, MIN(dia) primero FROM pedidos WHERE local_id=? AND dia>=? AND dia<? AND estado!='anulado'").get(lid, desde, hoyDia);
    if (t.n < MIN_PEDIDOS) return { suficiente: false, pedidos: t.n, minimo: MIN_PEDIDOS, dias: [], combos: [] };
    // Pedidos por día de la semana, comparando cada día con el promedio de los días en que el local abre.
    const ini = t.primero > desde ? t.primero : desde, ocurre = Array(7).fill(0);
    for (let d = ini; d < hoyDia; d = sumarDias(d, 1)) ocurre[new Date(`${d}T12:00:00`).getDay()]++;
    const porDia = new Map(db.prepare("SELECT CAST(strftime('%w',dia) AS INTEGER) d, COUNT(*) n FROM pedidos WHERE local_id=? AND dia>=? AND dia<? AND estado!='anulado' GROUP BY d").all(lid, ini, hoyDia).map((r) => [r.d, r.n]));
    const horario = JSON.parse(local.horario || '{}');
    const dias = [];
    const sem = [0, 1, 2, 3, 4, 5, 6].filter((d) => horario[d] && ocurre[d] >= 3).map((d) => ({ d, prom: (porDia.get(d) || 0) / ocurre[d] }));
    if (sem.length >= 3) {
      const media = sem.reduce((s, x) => s + x.prom, 0) / sem.length;
      for (const x of sem.filter((y) => y.prom <= media * 0.7).sort((a, b) => a.prom - b.prom).slice(0, 2)) {
        const pct = Math.round((1 - x.prom / media) * 100), f = franjaFlaca(lid, ini, hoyDia, x.d, horario[x.d]);
        dias.push({ dia: x.d, nombre: DIA_PL[x.d], pct, promedio: Math.round(media * 10) / 10, este_dia: Math.round(x.prom * 10) / 10, desde: f?.desde || null, hasta: f?.hasta || null, valor: 15,
          evidencia: `Los ${DIA_PL[x.d]} vendes ${pct} % menos que el promedio (${String(Math.round(x.prom * 10) / 10).replace('.', ',')} pedidos contra ${String(Math.round(media * 10) / 10).replace('.', ',')} por día).` });
      }
    }
    // Productos que se piden juntos en el mismo pedido (sin combos ni productos que ya no se venden).
    const combos = [];
    const pares = db.prepare(`SELECT a.producto_id a, b.producto_id b, COUNT(DISTINCT a.pedido_id) n FROM pedido_items a
        JOIN pedido_items b ON b.pedido_id=a.pedido_id AND a.producto_id<b.producto_id JOIN pedidos p ON p.id=a.pedido_id
        WHERE p.local_id=? AND p.dia>=? AND p.dia<? AND p.estado!='anulado' GROUP BY a.producto_id, b.producto_id HAVING n>=5 ORDER BY n DESC LIMIT 20`).all(lid, desde, hoyDia);
    const prod = (id) => db.prepare('SELECT id, nombre, precio FROM productos WHERE id=? AND local_id=? AND archivado=0 AND activo=1 AND precio_pendiente=0 AND precio>0 AND NOT EXISTS (SELECT 1 FROM combo_items WHERE producto_id=productos.id)').get(id, lid);
    const yaCombo = db.prepare('SELECT 1 FROM combo_items x JOIN combo_items y ON y.producto_id=x.producto_id AND y.componente_id=? WHERE x.componente_id=?');
    for (const r of pares) {
      const a = prod(r.a), b = prod(r.b);
      if (!a || !b || yaCombo.get(r.b, r.a)) continue;
      const suma = a.precio + b.precio, precio = Math.max(10, Math.round((suma * 0.9) / 10) * 10);
      combos.push({ nombre: `${a.nombre} + ${b.nombre}`, items: [{ producto_id: a.id, cantidad: 1 }, { producto_id: b.id, cantidad: 1 }], suma, precio, pedidos: r.n,
        evidencia: `Se piden juntos en ${r.n} pedidos de los últimos ${VENTANA} días.` });
      if (combos.length === 3) break;
    }
    return { suficiente: true, pedidos: t.n, minimo: MIN_PEDIDOS, dias, combos };
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

  return { consumir, quitar, crearCombo, editarCombo, quitarCombo, sugerencias, lista, guardar, aplicar, usar, devolver, enCarta, combo, combos, guardarCombo, fidelizacion, guardarFidelizacion, cuponVuelta, cuponDe, cupones, borrarTelefono, tel9 };
}
