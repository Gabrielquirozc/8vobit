// Inventario simple (plan Pro): insumos con unidad, costo y stock; receta de cada producto;
// cada venta descuenta lo que lleva (los combos, lo de cada componente) y una anulación lo devuelve.
// Compras suben el stock y actualizan el costo (promedio ponderado); conteos y mermas lo ajustan.
// Nada se borra: todo cambio de stock queda en `inv_movimientos`. El stock puede quedar negativo
// (se vendió algo que no se registró como compra): no se bloquea la venta, se avisa.

const texto = (v, max) => String(v ?? '').replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max) || null;
export const UNIDADES = { un: 'unidad', kg: 'kg', g: 'g', l: 'litro', ml: 'ml' };
const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const r3 = (n) => Math.round(n * 1000) / 1000;

export function crearInventario(db, { combos }) {
  db.exec(`
CREATE TABLE IF NOT EXISTS insumos (
  id INTEGER PRIMARY KEY, local_id INTEGER NOT NULL REFERENCES locales(id), nombre TEXT NOT NULL, unidad TEXT NOT NULL,
  costo REAL NOT NULL DEFAULT 0, stock REAL NOT NULL DEFAULT 0, minimo REAL NOT NULL DEFAULT 0, proveedor TEXT,
  archivado INTEGER NOT NULL DEFAULT 0, creado TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS recetas (
  producto_id INTEGER NOT NULL REFERENCES productos(id), insumo_id INTEGER NOT NULL REFERENCES insumos(id),
  cantidad REAL NOT NULL, PRIMARY KEY (producto_id, insumo_id));
CREATE TABLE IF NOT EXISTS inv_movimientos (
  id INTEGER PRIMARY KEY, local_id INTEGER NOT NULL, insumo_id INTEGER NOT NULL REFERENCES insumos(id),
  tipo TEXT NOT NULL, cantidad REAL NOT NULL, costo INTEGER, pedido_id INTEGER, nota TEXT, usuario TEXT,
  creado TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE INDEX IF NOT EXISTS inv_mov_insumo ON inv_movimientos(insumo_id, id);
CREATE INDEX IF NOT EXISTS inv_mov_pedido ON inv_movimientos(pedido_id);
`);
  const insumo = (lid, id) => db.prepare('SELECT * FROM insumos WHERE id=? AND local_id=?').get(Number(id), lid);
  const mover = (lid, i, tipo, cant, { costo = null, pedido = null, nota = null, usuario = null } = {}) => {
    db.prepare('UPDATE insumos SET stock=? WHERE id=?').run(r3(i.stock + cant), i.id);
    db.prepare('INSERT INTO inv_movimientos (local_id,insumo_id,tipo,cantidad,costo,pedido_id,nota,usuario) VALUES (?,?,?,?,?,?,?,?)').run(lid, i.id, tipo, r3(cant), costo, pedido, nota, usuario);
    i.stock = r3(i.stock + cant);
  };

  function lista(lid) {
    const usos = new Map(db.prepare('SELECT r.insumo_id id, COUNT(*) n FROM recetas r JOIN insumos i ON i.id=r.insumo_id WHERE i.local_id=? GROUP BY r.insumo_id').all(lid).map((r) => [r.id, r.n]));
    const insumos = db.prepare('SELECT id, nombre, unidad, costo, stock, minimo, proveedor FROM insumos WHERE local_id=? AND archivado=0 ORDER BY nombre').all(lid)
      .map((i) => ({ ...i, bajo: i.stock <= i.minimo, productos: usos.get(i.id) || 0, valor: Math.round(Math.max(0, i.stock) * i.costo) }));
    return { unidades: UNIDADES, insumos, bajos: insumos.filter((i) => i.bajo).length, valorizado: insumos.reduce((s, i) => s + i.valor, 0) };
  }

  function guardarInsumo(lid, b, id = null) {
    const p = id ? insumo(lid, id) : null;
    if (id && !p) return { error: 'No existe', status: 404 };
    const v = { nombre: p?.nombre, unidad: p?.unidad || 'un', costo: p?.costo ?? 0, minimo: p?.minimo ?? 0, proveedor: p?.proveedor ?? null, archivado: p?.archivado ?? 0 };
    if (b.nombre !== undefined) v.nombre = texto(b.nombre, 60);
    if (b.unidad !== undefined) v.unidad = b.unidad;
    if (b.costo !== undefined) v.costo = num(b.costo);
    if (b.minimo !== undefined) v.minimo = num(b.minimo);
    if (b.proveedor !== undefined) v.proveedor = texto(b.proveedor, 60);
    if (b.archivado !== undefined) v.archivado = b.archivado ? 1 : 0;
    if (!v.nombre) return { error: 'Escribe el nombre del insumo.' };
    if (!UNIDADES[v.unidad]) return { error: 'Unidad inválida.' };
    if (!(v.costo >= 0 && v.costo <= 1e7)) return { error: 'Costo inválido.' };
    if (!(v.minimo >= 0 && v.minimo <= 1e6)) return { error: 'Mínimo inválido.' };
    if (db.prepare('SELECT 1 FROM insumos WHERE local_id=? AND lower(nombre)=lower(?) AND archivado=0 AND id!=?').get(lid, v.nombre, id || 0)) return { error: 'Ya hay un insumo con ese nombre.' };
    if (p) db.prepare('UPDATE insumos SET nombre=?, unidad=?, costo=?, minimo=?, proveedor=?, archivado=? WHERE id=?').run(v.nombre, v.unidad, v.costo, v.minimo, v.proveedor, v.archivado, id);
    else {
      id = Number(db.prepare('INSERT INTO insumos (local_id,nombre,unidad,costo,minimo,proveedor) VALUES (?,?,?,?,?,?)').run(lid, v.nombre, v.unidad, v.costo, v.minimo, v.proveedor).lastInsertRowid);
      const st = num(b.stock);
      if (st > 0) mover(lid, insumo(lid, id), 'ajuste', st, { nota: 'Stock inicial' });
    }
    return insumo(lid, id);
  }

  // Compra a proveedor: suma stock y deja el costo como promedio ponderado.
  function compra(lid, b, usuario) {
    const i = insumo(lid, b.insumo_id);
    if (!i || i.archivado) return { error: 'Elige el insumo.' };
    const cant = num(b.cantidad), total = Math.round(num(b.total));
    if (!(cant > 0 && cant <= 1e6)) return { error: 'Cantidad inválida.' };
    if (!(total >= 0 && total <= 5e7)) return { error: 'Monto inválido.' };
    const previo = Math.max(0, i.stock);
    const costo = previo + cant > 0 ? (previo * i.costo + total) / (previo + cant) : i.costo;
    db.exec('BEGIN');
    try {
      db.prepare('UPDATE insumos SET costo=?, proveedor=COALESCE(?, proveedor) WHERE id=?').run(Math.round(costo * 100) / 100, texto(b.proveedor, 60), i.id);
      mover(lid, i, 'compra', cant, { costo: total, nota: texto(b.nota, 120), usuario });
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return insumo(lid, i.id);
  }

  // Conteo (deja el stock en lo contado) o merma (resta lo perdido).
  function ajuste(lid, b, usuario) {
    const i = insumo(lid, b.insumo_id);
    if (!i || i.archivado) return { error: 'Elige el insumo.' };
    const c = num(b.cantidad);
    if (b.tipo === 'conteo') {
      if (!(c >= 0 && c <= 1e6)) return { error: 'Cantidad contada inválida.' };
      if (r3(c - i.stock) !== 0) mover(lid, i, 'conteo', c - i.stock, { nota: texto(b.nota, 120), usuario });
    } else if (b.tipo === 'merma') {
      if (!(c > 0 && c <= 1e6)) return { error: 'Cantidad inválida.' };
      mover(lid, i, 'merma', -c, { costo: Math.round(c * i.costo), nota: texto(b.nota, 120), usuario });
    } else return { error: 'Tipo de ajuste inválido.' };
    return insumo(lid, i.id);
  }

  const movimientos = (lid, insumoId) => db.prepare(`SELECT m.id, m.tipo, m.cantidad, m.costo, m.pedido_id, m.nota, m.usuario, m.creado, i.nombre, i.unidad
    FROM inv_movimientos m JOIN insumos i ON i.id=m.insumo_id WHERE m.local_id=? ${insumoId ? 'AND m.insumo_id=?' : ''} ORDER BY m.id DESC LIMIT 150`).all(...(insumoId ? [lid, Number(insumoId)] : [lid]));

  // ---------- recetas ----------
  const receta = (pid) => db.prepare('SELECT r.insumo_id, r.cantidad, i.nombre, i.unidad, i.costo FROM recetas r JOIN insumos i ON i.id=r.insumo_id WHERE r.producto_id=? ORDER BY i.nombre').all(pid);
  function guardarReceta(lid, pid, lista) {
    if (!db.prepare('SELECT 1 FROM productos WHERE id=? AND local_id=?').get(pid, lid)) return { error: 'No existe', status: 404 };
    if (!Array.isArray(lista) || lista.length > 30) return { error: 'La receta lleva hasta 30 insumos.' };
    const filas = [];
    for (const x of lista) {
      const i = insumo(lid, x.insumo_id), c = num(x.cantidad);
      if (!i || i.archivado) return { error: 'Un insumo de la receta no existe.' };
      if (!(c > 0 && c <= 1e4)) return { error: `Cantidad inválida para ${i.nombre}.` };
      filas.push([pid, i.id, r3(c)]);
    }
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM recetas WHERE producto_id=?').run(pid);
      for (const f of filas) db.prepare('INSERT OR REPLACE INTO recetas (producto_id,insumo_id,cantidad) VALUES (?,?,?)').run(...f);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return { producto_id: pid, receta: receta(pid), costo: costo(lid, pid) };
  }
  // Lo que gasta una unidad de producto (un combo suma lo de sus componentes).
  function consumo(pid, mapaCombos) {
    const tot = new Map();
    const sumar = (id, k) => { for (const r of db.prepare('SELECT insumo_id, cantidad FROM recetas WHERE producto_id=?').all(id)) tot.set(r.insumo_id, (tot.get(r.insumo_id) || 0) + r.cantidad * k); };
    sumar(pid, 1);
    for (const c of mapaCombos.get(pid) || []) sumar(c.producto_id, c.cantidad);
    return tot;
  }
  // Costo real de una unidad según su receta; null si no tiene receta.
  function costo(lid, pid) {
    const c = consumo(pid, combos(lid));
    if (!c.size) return null;
    let s = 0;
    for (const [id, cant] of c) s += cant * (db.prepare('SELECT costo FROM insumos WHERE id=?').get(id)?.costo || 0);
    return Math.round(s);
  }
  // Costo de receta de todos los productos del local (y combos) con 3 consultas; mismo cálculo que costo().
  function costos(lid) {
    const ins = new Map(db.prepare('SELECT id, costo FROM insumos WHERE local_id=?').all(lid).map((i) => [i.id, i.costo || 0]));
    const rec = new Map();
    for (const x of db.prepare('SELECT r.producto_id, r.insumo_id, r.cantidad FROM recetas r JOIN productos p ON p.id=r.producto_id WHERE p.local_id=?').all(lid)) {
      if (!rec.has(x.producto_id)) rec.set(x.producto_id, []);
      rec.get(x.producto_id).push(x);
    }
    const cmb = combos(lid), out = new Map();
    for (const pid of new Set([...rec.keys(), ...cmb.keys()])) {
      const tot = new Map(), sumar = (id, k) => { for (const x of rec.get(id) || []) tot.set(x.insumo_id, (tot.get(x.insumo_id) || 0) + x.cantidad * k); };
      sumar(pid, 1);
      for (const c of cmb.get(pid) || []) sumar(c.producto_id, c.cantidad);
      if (tot.size) out.set(pid, Math.round([...tot].reduce((s, [id, cant]) => s + cant * (ins.get(id) || 0), 0)));
    }
    return out;
  }
  const recetas = (lid) => {
    const m = {};
    for (const r of db.prepare('SELECT r.producto_id, r.insumo_id, r.cantidad FROM recetas r JOIN productos p ON p.id=r.producto_id WHERE p.local_id=?').all(lid))
      (m[r.producto_id] ||= []).push({ insumo_id: r.insumo_id, cantidad: r.cantidad });
    return m;
  };

  // ---------- ventas ----------
  // Se llama dentro de la transacción del pedido.
  function descontarPedido(lid, pedidoId, items) {
    const mapa = combos(lid);
    const tot = new Map();
    for (const it of items) for (const [id, c] of consumo(it.producto_id, mapa)) tot.set(id, (tot.get(id) || 0) + c * it.cantidad);
    for (const [id, c] of tot) { const i = insumo(lid, id); if (i) mover(lid, i, 'venta', -c, { pedido: pedidoId }); }
  }
  // Anulación: devuelve exactamente lo que se descontó.
  function revertirPedido(lid, pedidoId, usuario) {
    const ya = db.prepare("SELECT 1 FROM inv_movimientos WHERE pedido_id=? AND tipo='anulacion'").get(pedidoId);
    if (ya) return;
    for (const m of db.prepare("SELECT insumo_id, SUM(cantidad) c FROM inv_movimientos WHERE pedido_id=? AND local_id=? AND tipo='venta' GROUP BY insumo_id").all(pedidoId, lid)) {
      const i = insumo(lid, m.insumo_id); if (i) mover(lid, i, 'anulacion', -m.c, { pedido: pedidoId, usuario, nota: 'Pedido anulado' });
    }
  }

  return { lista, guardarInsumo, compra, ajuste, movimientos, receta, recetas, guardarReceta, costo, costos, descontarPedido, revertirPedido, UNIDADES };
}
