// Gastos, movimientos de caja y arqueo (cuadre del efectivo al cierre del día).
// Nada se borra: un movimiento o un cierre equivocado se anula y queda en el registro.
// El efectivo esperado se calcula siempre en el servidor:
//   fondo + ventas en efectivo + ingresos − retiros − gastos pagados en efectivo.

export const CATEGORIAS = {
  insumos: 'Insumos y mercadería',
  envases: 'Envases y desechables',
  sueldos: 'Sueldos y honorarios',
  arriendo: 'Arriendo',
  servicios: 'Luz, agua, gas e internet',
  despacho: 'Bencina y despacho',
  mantencion: 'Mantención y reparaciones',
  contador: 'Contador y trámites',
  publicidad: 'Publicidad',
  impuestos: 'Impuestos, patentes y permisos',
  otros: 'Otros',
};
const TIPOS = ['fondo', 'ingreso', 'retiro', 'gasto'];
const MONTO_MAX = 50_000_000;
export const PROPINA_MAX = 200_000;
// Diferencia (en pesos, sobra o falta) desde la cual cerrar la caja exige explicar qué pasó en la nota.
// Pendiente: hacerlo ajustable por local.
export const UMBRAL_NOTA = 5000;
const esDia = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(`${v}T12:00:00`));
const texto = (v, max) => String(v ?? '').replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max) || null;
const diasEntre = (a, b) => Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / 864e5);

// Con una diferencia grande, la nota (mínimo 3 letras o números) es obligatoria.
function notaFaltante(dif, nota, verbo) {
  if (Math.abs(dif) > UMBRAL_NOTA && (nota ?? '').replace(/[^\p{L}\p{N}]/gu, '').length < 3)
    return { error: `${dif < 0 ? 'Faltan' : 'Sobran'} $${Math.abs(dif).toLocaleString('es-CL')}. Escribe qué pasó en la nota antes de ${verbo}.` };
  return null;
}

export function crearCaja(db, { hoy, MEDIOS }) {
  db.exec(`
CREATE TABLE IF NOT EXISTS caja_movimientos (
  id INTEGER PRIMARY KEY, local_id INTEGER NOT NULL REFERENCES locales(id), dia TEXT NOT NULL,
  tipo TEXT NOT NULL, categoria TEXT, descripcion TEXT, monto INTEGER NOT NULL, medio TEXT NOT NULL DEFAULT 'efectivo',
  documento TEXT, anulado INTEGER NOT NULL DEFAULT 0,
  creado TEXT NOT NULL DEFAULT (datetime('now','localtime')), anulado_en TEXT);
CREATE INDEX IF NOT EXISTS caja_mov_dia ON caja_movimientos(local_id, dia);
CREATE TABLE IF NOT EXISTS pedido_pagos (
  pedido_id INTEGER NOT NULL, medio TEXT NOT NULL, monto INTEGER NOT NULL, PRIMARY KEY (pedido_id, medio));
CREATE TABLE IF NOT EXISTS caja_cortes (
  id INTEGER PRIMARY KEY, local_id INTEGER NOT NULL REFERENCES locales(id), dia TEXT NOT NULL,
  esperado INTEGER NOT NULL, contado INTEGER NOT NULL, diferencia INTEGER NOT NULL, nota TEXT, usuario TEXT,
  creado TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE INDEX IF NOT EXISTS caja_cortes_dia ON caja_cortes(local_id, dia);
CREATE TABLE IF NOT EXISTS caja_cierres (
  id INTEGER PRIMARY KEY, local_id INTEGER NOT NULL REFERENCES locales(id), dia TEXT NOT NULL,
  esperado INTEGER NOT NULL, contado INTEGER NOT NULL, diferencia INTEGER NOT NULL, detalle TEXT NOT NULL,
  nota TEXT, anulado INTEGER NOT NULL DEFAULT 0,
  creado TEXT NOT NULL DEFAULT (datetime('now','localtime')), anulado_en TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS caja_cierre_dia ON caja_cierres(local_id, dia) WHERE anulado=0;
`);
  // Quién registró, anuló o cerró (nombre del usuario del panel).
  for (const t of ['caja_movimientos', 'caja_cierres']) {
    const cols = new Set(db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name));
    if (!cols.has('usuario')) { db.exec(`ALTER TABLE ${t} ADD COLUMN usuario TEXT`); db.exec(`ALTER TABLE ${t} ADD COLUMN anulado_por TEXT`); }
  }

  // Lo que dicen el voucher de la máquina de tarjetas y la cartola (opcionales, solo informativos).
  for (const c of ['contado_tarjeta', 'contado_transferencia']) {
    const cols = new Set(db.prepare('PRAGMA table_info(caja_cierres)').all().map((x) => x.name));
    if (!cols.has(c)) db.exec(`ALTER TABLE caja_cierres ADD COLUMN ${c} INTEGER`);
  }

  // Propina del cobro: NO es venta (no suma al total, a Resumen ni a la boleta). Va a un solo medio.
  const pcols = new Set(db.prepare('PRAGMA table_info(pedidos)').all().map((c) => c.name));
  if (!pcols.has('propina')) { db.exec('ALTER TABLE pedidos ADD COLUMN propina INTEGER NOT NULL DEFAULT 0'); db.exec('ALTER TABLE pedidos ADD COLUMN propina_medio TEXT'); }

  const cierreDe = (lid, dia) => db.prepare('SELECT * FROM caja_cierres WHERE local_id=? AND dia=? AND anulado=0').get(lid, dia);

  // Cobrado en un medio ese día: pedidos de un solo medio (como siempre) más la parte de ese
  // medio en los pedidos con pago mixto. Los pedidos anulados no cuentan, así que anular revierte todo.
  function ventasMedio(lid, dia, medio) {
    const a = db.prepare("SELECT COALESCE(SUM(total),0) s, COUNT(*) n FROM pedidos WHERE local_id=? AND dia=? AND estado!='anulado' AND pagado=1 AND medio_pago=?").get(lid, dia, medio);
    const b = db.prepare("SELECT COALESCE(SUM(pp.monto),0) s, COUNT(*) n FROM pedido_pagos pp JOIN pedidos p ON p.id=pp.pedido_id WHERE p.local_id=? AND p.dia=? AND p.estado!='anulado' AND p.pagado=1 AND p.medio_pago='mixto' AND pp.medio=?").get(lid, dia, medio);
    return { s: a.s + b.s, n: a.n + b.n };
  }

  // Propinas cobradas ese día en un medio (los pedidos anulados no cuentan).
  const propinasMedio = (lid, dia, medio) => db.prepare("SELECT COALESCE(SUM(propina),0) s FROM pedidos WHERE local_id=? AND dia=? AND estado!='anulado' AND pagado=1 AND propina>0 AND propina_medio=?").get(lid, dia, medio).s;
  // { propina, propina_medio } o { error }. Sin propina no hay nada que validar. El medio es el que se elige (por defecto, el del cobro).
  function validarPropina(b, medioDefecto) {
    if (b.propina === undefined || b.propina === null || b.propina === '' || Number(b.propina) === 0) return { propina: 0, propina_medio: null };
    const propina = Number(b.propina);
    if (!Number.isInteger(propina) || propina < 0 || propina > PROPINA_MAX) return { error: `La propina debe ser un monto entero entre $0 y $${PROPINA_MAX.toLocaleString('es-CL')}` };
    const medio = b.propina_medio ?? medioDefecto;
    if (!MEDIOS.includes(medio)) return { error: 'Medio de la propina inválido' };
    return { propina, propina_medio: medio };
  }

  // Pago dividido en varios medios. Devuelve { pagos } (lista unida por medio) si hay más de un medio,
  // { medio } si en realidad es uno solo, o { error }. Sin `lista` no hay nada que validar.
  function validarPagos(lista, total) {
    if (lista === undefined || lista === null) return {};
    if (!Array.isArray(lista) || !lista.length || lista.length > 4) return { error: 'Pago dividido inválido' };
    const por = new Map();
    for (const x of lista) {
      const monto = Number(x?.monto);
      if (!MEDIOS.includes(x?.medio)) return { error: 'Medio de pago inválido' };
      if (!Number.isInteger(monto) || monto <= 0) return { error: 'Cada parte del pago debe ser un monto entero mayor a 0' };
      por.set(x.medio, (por.get(x.medio) || 0) + monto);
    }
    const pagos = [...por].map(([medio, monto]) => ({ medio, monto }));
    if (pagos.reduce((s, x) => s + x.monto, 0) !== total) return { error: `Las partes del pago deben sumar el total ($${total.toLocaleString('es-CL')})` };
    return pagos.length === 1 ? { medio: pagos[0].medio } : { pagos };
  }
  const guardarPagos = (pedidoId, pagos) => {
    db.prepare('DELETE FROM pedido_pagos WHERE pedido_id=?').run(pedidoId);
    for (const x of pagos || []) db.prepare('INSERT INTO pedido_pagos (pedido_id,medio,monto) VALUES (?,?,?)').run(pedidoId, x.medio, x.monto);
  };
  const pagosDe = (pedidoId) => db.prepare('SELECT medio, monto FROM pedido_pagos WHERE pedido_id=? ORDER BY rowid').all(pedidoId);

  // Cuánto efectivo debería haber en la caja ese día, con su desglose.
  function esperado(lid, dia) {
    const movs = db.prepare('SELECT tipo, monto, medio FROM caja_movimientos WHERE local_id=? AND dia=? AND anulado=0').all(lid, dia);
    const suma = (f) => movs.filter(f).reduce((s, m) => s + m.monto, 0);
    const ventas = ventasMedio(lid, dia, 'efectivo');
    const d = {
      propinas: propinasMedio(lid, dia, 'efectivo'),
      fondo: suma((m) => m.tipo === 'fondo'),
      ventas: ventas.s, ventas_n: ventas.n,
      ingresos: suma((m) => m.tipo === 'ingreso'),
      retiros: suma((m) => m.tipo === 'retiro'),
      gastos: suma((m) => m.tipo === 'gasto' && m.medio === 'efectivo'),
    };
    return { ...d, total: d.fondo + d.ventas + d.propinas + d.ingresos - d.retiros - d.gastos };
  }

  function caja(local, dia) {
    const lid = local.id;
    const c = cierreDe(lid, dia);
    // Fondo sugerido: lo que quedó contado en el último cierre anterior a este día.
    const previo = db.prepare('SELECT dia, contado FROM caja_cierres WHERE local_id=? AND dia<? AND anulado=0 ORDER BY dia DESC LIMIT 1').get(lid, dia);
    return {
      dia, hoy: hoy(local), categorias: CATEGORIAS,
      movimientos: db.prepare('SELECT id, tipo, categoria, descripcion, monto, medio, documento, anulado, creado, usuario, anulado_por FROM caja_movimientos WHERE local_id=? AND dia=? ORDER BY id').all(lid, dia),
      esperado: esperado(lid, dia),
      propinas: { ...Object.fromEntries(MEDIOS.map((m) => [m, propinasMedio(lid, dia, m)])),
        retiradas: db.prepare("SELECT COALESCE(SUM(monto),0) s FROM caja_movimientos WHERE local_id=? AND dia=? AND anulado=0 AND tipo='retiro' AND categoria='propinas'").get(lid, dia).s },
      cortes: db.prepare('SELECT id, esperado, contado, diferencia, nota, usuario, creado FROM caja_cortes WHERE local_id=? AND dia=? ORDER BY id').all(lid, dia),
      cierre: c ? { ...c, detalle: JSON.parse(c.detalle) } : null,
      fondo_sugerido: previo ? { dia: previo.dia, monto: previo.contado } : null,
    };
  }

  function nuevoMovimiento(local, b, quien = null) {
    const lid = local.id, h = hoy(local);
    const tipo = TIPOS.includes(b.tipo) ? b.tipo : null;
    if (!tipo) return { error: 'Tipo de movimiento inválido' };
    const dia = b.dia === undefined ? h : b.dia;
    if (!esDia(dia)) return { error: 'Fecha inválida' };
    if (dia > h) return { error: 'No se pueden registrar movimientos en días futuros' };
    // Los gastos se pueden anotar con atraso (la factura del gas llega después); la caja, solo la semana.
    if (diasEntre(dia, h) > (tipo === 'gasto' ? 400 : 7)) return { error: tipo === 'gasto' ? 'La fecha es demasiado antigua' : 'Solo se puede corregir la caja de los últimos 7 días' };
    const monto = Number(b.monto);
    if (!Number.isInteger(monto) || monto <= 0 || monto > MONTO_MAX) return { error: 'Escribe un monto válido, en pesos y sin decimales' };
    const medio = tipo === 'gasto' ? b.medio ?? 'efectivo' : 'efectivo';
    if (!MEDIOS.includes(medio)) return { error: 'Medio de pago inválido' };
    const categoria = tipo === 'gasto' ? b.categoria : tipo === 'retiro' && b.categoria === 'propinas' ? 'propinas' : null;
    if (tipo === 'gasto' && !CATEGORIAS[categoria]) return { error: 'Elige la categoría del gasto' };
    const descripcion = texto(b.descripcion, 120);
    if ((tipo === 'retiro' || tipo === 'ingreso') && !descripcion) return { error: 'Anota el motivo (por ejemplo: "retiro del dueño" o "sencillo")' };
    if (medio === 'efectivo' && cierreDe(lid, dia)) return { error: 'La caja de ese día ya está cerrada. Reábrela para agregar movimientos en efectivo.', cerrado: true };
    if (tipo === 'fondo') {
      // Un solo fondo por día: el nuevo reemplaza al anterior.
      db.prepare("UPDATE caja_movimientos SET anulado=1, anulado_en=datetime('now','localtime'), anulado_por=? WHERE local_id=? AND dia=? AND tipo='fondo' AND anulado=0").run(quien, lid, dia);
    }
    const { lastInsertRowid: id } = db.prepare('INSERT INTO caja_movimientos (local_id,dia,tipo,categoria,descripcion,monto,medio,documento,usuario) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(lid, dia, tipo, categoria, descripcion, monto, medio, tipo === 'gasto' ? texto(b.documento, 40) : null, quien);
    return { id: Number(id) };
  }

  function anularMovimiento(local, id, quien = null) {
    const m = db.prepare('SELECT * FROM caja_movimientos WHERE id=? AND local_id=?').get(id, local.id);
    if (!m) return { error: 'No existe', status: 404 };
    if (m.anulado) return { ok: true };
    if (m.medio === 'efectivo' && cierreDe(local.id, m.dia)) return { error: 'La caja de ese día ya está cerrada. Reábrela para anular movimientos en efectivo.', status: 409 };
    db.prepare("UPDATE caja_movimientos SET anulado=1, anulado_en=datetime('now','localtime'), anulado_por=? WHERE id=?").run(quien, m.id);
    return { ok: true };
  }

  function cerrar(local, b, quien = null) {
    const lid = local.id, h = hoy(local);
    const dia = b.dia === undefined ? h : b.dia;
    if (!esDia(dia) || dia > h) return { error: 'Fecha inválida' };
    if (diasEntre(dia, h) > 7) return { error: 'Solo se puede cerrar la caja de los últimos 7 días' };
    const contado = Number(b.contado);
    if (!Number.isInteger(contado) || contado < 0 || contado > MONTO_MAX) return { error: 'Escribe el efectivo contado, en pesos y sin decimales' };
    if (cierreDe(lid, dia)) return { error: 'La caja de ese día ya está cerrada', status: 409 };
    const opc = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
    const tarjeta = opc(b.contado_tarjeta), transf = opc(b.contado_transferencia);
    for (const v of [tarjeta, transf]) if (v !== null && (!Number.isInteger(v) || v < 0 || v > MONTO_MAX)) return { error: 'Escribe lo de tarjeta y transferencia en pesos, sin decimales (o déjalo vacío)' };
    const e = esperado(lid, dia);
    const vendidoMedio = (m) => ventasMedio(lid, dia, m).s;
    const nota = texto(b.nota, 300), dif = contado - e.total;
    const falta = notaFaltante(dif, nota, 'cerrar');
    if (falta) return falta;
    const porCobrar = db.prepare("SELECT COUNT(*) n FROM pedidos WHERE local_id=? AND dia=? AND estado!='anulado' AND pagado=0").get(lid, dia).n;
    db.prepare('INSERT INTO caja_cierres (local_id,dia,esperado,contado,diferencia,detalle,nota,usuario,contado_tarjeta,contado_transferencia) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(lid, dia, e.total, contado, contado - e.total, JSON.stringify({ ...e, por_cobrar: porCobrar, sistema_tarjeta: vendidoMedio('tarjeta') + propinasMedio(lid, dia, 'tarjeta'), sistema_transferencia: vendidoMedio('transferencia') + propinasMedio(lid, dia, 'transferencia') }), nota, quien, tarjeta, transf);
    return caja(local, dia);
  }

  // Corte de turno: quien entrega la caja anota lo contado. No cierra el día.
  function corte(local, b, quien = null) {
    const lid = local.id, h = hoy(local);
    const dia = b.dia === undefined ? h : b.dia;
    if (!esDia(dia) || dia > h) return { error: 'Fecha inválida' };
    if (diasEntre(dia, h) > 7) return { error: 'Solo se puede hacer el corte de los últimos 7 días' };
    const contado = Number(b.contado);
    if (!Number.isInteger(contado) || contado < 0 || contado > MONTO_MAX) return { error: 'Escribe el efectivo contado, en pesos y sin decimales' };
    if (cierreDe(lid, dia)) return { error: 'La caja de ese día ya está cerrada. Reábrela para hacer un corte.', status: 409 };
    const e = esperado(lid, dia), nota = texto(b.nota, 300), dif = contado - e.total;
    const falta = notaFaltante(dif, nota, 'hacer el corte');
    if (falta) return falta;
    db.prepare('INSERT INTO caja_cortes (local_id,dia,esperado,contado,diferencia,nota,usuario) VALUES (?,?,?,?,?,?,?)').run(lid, dia, e.total, contado, dif, nota, quien);
    return caja(local, dia);
  }

  function reabrir(local, dia, quien = null) {
    if (!esDia(dia)) return { error: 'Fecha inválida' };
    const r = db.prepare("UPDATE caja_cierres SET anulado=1, anulado_en=datetime('now','localtime'), anulado_por=? WHERE local_id=? AND dia=? AND anulado=0").run(quien, local.id, dia);
    if (!r.changes) return { error: 'Esa caja no está cerrada', status: 409 };
    return caja(local, dia);
  }

  // Gastos de un mes, por categoría y comparados con el mes anterior.
  function gastosMes(local, mes) {
    const lid = local.id;
    const ant = (() => { const [y, m] = mes.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; })();
    const lista = db.prepare("SELECT id, dia, categoria, descripcion, monto, medio, documento, creado FROM caja_movimientos WHERE local_id=? AND tipo='gasto' AND anulado=0 AND substr(dia,1,7)=? ORDER BY dia DESC, id DESC").all(lid, mes);
    const total = lista.reduce((s, g) => s + g.monto, 0);
    const porCat = (l) => Object.fromEntries(Object.keys(CATEGORIAS).map((k) => [k, l.filter((g) => g.categoria === k).reduce((s, g) => s + g.monto, 0)]));
    const anterior = db.prepare("SELECT categoria, monto FROM caja_movimientos WHERE local_id=? AND tipo='gasto' AND anulado=0 AND substr(dia,1,7)=?").all(lid, ant);
    return { mes, hoy: hoy(local), categorias: CATEGORIAS, gastos: lista, total, por_categoria: porCat(lista),
      anterior: { mes: ant, total: anterior.reduce((s, g) => s + g.monto, 0), por_categoria: porCat(anterior) } };
  }

  return { propina: { validar: validarPropina }, pagos: { validar: validarPagos, guardar: guardarPagos, de: pagosDe }, caja, corte, esperado, nuevoMovimiento, anularMovimiento, cerrar, reabrir, gastosMes, esDia };
}
