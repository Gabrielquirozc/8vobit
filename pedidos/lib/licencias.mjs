// Gestor de licencias: plan de cada local, su estado (prueba, activa, gracia, suspendida, cancelada),
// pagos, descuentos y la tarifa por pedido web. Todo corre en nuestro servidor: la licencia es un
// registro en la base que se revisa en cada petición (ver ESTRATEGIA.md §5).

// Precios mensuales sin IVA. Semestral −10 %, anual −15 %. Las funciones definen qué abre cada plan.
export const PLANES = {
  canal: { nombre: 'Canal', mes: 19900, funciones: [], usuarios: 2 },
  gestion: { nombre: 'Gestión', mes: 34900, funciones: ['costos', 'equipo', 'exportar', 'resultados'], usuarios: Infinity },
  pro: { nombre: 'Pro', mes: 54900, funciones: ['costos', 'equipo', 'exportar', 'resultados', 'inventario', 'combos', 'multilocal'], usuarios: Infinity },
};
export const CICLOS = { mensual: { meses: 1, desc: 0 }, semestral: { meses: 6, desc: 10 }, anual: { meses: 12, desc: 15 } };
// Plan mínimo que abre cada función (para el mensaje "Disponible en el plan …").
export const PLAN_DE = { costos: 'gestion', equipo: 'gestion', exportar: 'gestion', resultados: 'gestion', inventario: 'pro', combos: 'pro', multilocal: 'pro' };
export const TARIFA = { pct: 1, tope: 200 };
const GRACIA_DIAS = 7, CANCELA_DIAS = 90;
const MEDIOS = ['transferencia', 'efectivo', 'tarjeta', 'flow', 'mercadopago', 'otro'];

const esDia = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(`${v}T12:00:00`));
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const sumarDias = (dia, n) => { const d = new Date(`${dia}T12:00:00`); d.setDate(d.getDate() + n); return iso(d); };
export const sumarMeses = (dia, n) => {
  const d = new Date(`${dia}T12:00:00`), dd = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(dd, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return iso(d);
};
const diasEntre = (a, b) => Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / 864e5);
const texto = (v, max) => String(v ?? '').replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max) || null;

// Precio de un período: plan × meses del ciclo, con el descuento del ciclo y, si corresponde, el del local.
export function precioPeriodo(plan, ciclo, descuentoPct = 0) {
  const c = CICLOS[ciclo] || CICLOS.mensual;
  return Math.round(PLANES[plan].mes * c.meses * (1 - c.desc / 100) * (1 - descuentoPct / 100));
}
export const tarifaPedido = (total) => Math.min(Math.round((total * TARIFA.pct) / 100), TARIFA.tope);

export function crearLicencias(db, { hoy }) {
  db.exec(`
CREATE TABLE IF NOT EXISTS licencias (
  id INTEGER PRIMARY KEY, local_id INTEGER UNIQUE NOT NULL REFERENCES locales(id), plan TEXT NOT NULL,
  ciclo TEXT NOT NULL DEFAULT 'mensual', cancelada INTEGER NOT NULL DEFAULT 0,
  inicio TEXT NOT NULL, prueba_hasta TEXT, vence TEXT,
  descuento_pct INTEGER NOT NULL DEFAULT 0, descuento_hasta TEXT, tarifa_exenta_hasta TEXT, notas TEXT,
  creado TEXT NOT NULL DEFAULT (datetime('now','localtime')), actualizado TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS licencia_pagos (
  id INTEGER PRIMARY KEY, local_id INTEGER NOT NULL REFERENCES locales(id), fecha TEXT NOT NULL,
  desde TEXT NOT NULL, hasta TEXT NOT NULL, meses INTEGER NOT NULL, monto INTEGER NOT NULL, tarifa INTEGER NOT NULL DEFAULT 0,
  medio TEXT NOT NULL, referencia TEXT, factura TEXT, anulado INTEGER NOT NULL DEFAULT 0,
  creado TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS licencia_eventos (
  id INTEGER PRIMARY KEY, local_id INTEGER NOT NULL, fecha TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  tipo TEXT NOT NULL, detalle TEXT);
`);
  const evento = (lid, tipo, detalle) => db.prepare('INSERT INTO licencia_eventos (local_id,tipo,detalle) VALUES (?,?,?)').run(lid, tipo, JSON.stringify(detalle ?? {}));
  const filaDe = (lid) => db.prepare('SELECT * FROM licencias WHERE local_id=?').get(lid);

  // Alta: prueba de `pruebaDias` con el plan elegido.
  function crear(lid, { plan = 'gestion', pruebaDias = 14, descuentoPct = 0, descuentoMeses = 0, tarifaExentaMeses = 0, notas = null } = {}) {
    if (filaDe(lid)) return filaDe(lid);
    const h = hoy(), pruebaHasta = sumarDias(h, pruebaDias);
    db.prepare(`INSERT INTO licencias (local_id,plan,inicio,prueba_hasta,descuento_pct,descuento_hasta,tarifa_exenta_hasta,notas) VALUES (?,?,?,?,?,?,?,?)`)
      .run(lid, plan, h, pruebaHasta, descuentoPct, descuentoMeses ? sumarMeses(pruebaHasta, descuentoMeses) : null,
        tarifaExentaMeses ? sumarMeses(pruebaHasta, tarifaExentaMeses) : null, notas);
    evento(lid, 'alta', { plan, prueba_hasta: pruebaHasta });
    return filaDe(lid);
  }

  // Estado efectivo según las fechas: no hay tareas programadas que puedan fallar.
  function estado(lid) {
    const L = filaDe(lid);
    if (!L) return null;
    const h = hoy();
    const finPagado = [L.prueba_hasta, L.vence].filter(Boolean).sort().pop();
    let est, hasta = finPagado;
    if (L.cancelada) est = 'cancelada';
    else if (L.vence && h < L.vence) est = 'activa';
    else if (L.prueba_hasta && h < L.prueba_hasta && !L.vence) est = 'prueba';
    else if (finPagado && diasEntre(finPagado, h) < GRACIA_DIAS) { est = 'gracia'; hasta = sumarDias(finPagado, GRACIA_DIAS); }
    else if (finPagado && diasEntre(finPagado, h) < CANCELA_DIAS) { est = 'suspendida'; hasta = sumarDias(finPagado, CANCELA_DIAS); }
    else est = 'cancelada';
    const p = PLANES[L.plan] || PLANES.canal;
    const descVigente = L.descuento_pct && (!L.descuento_hasta || h < L.descuento_hasta);
    return {
      plan: L.plan, plan_nombre: p.nombre, ciclo: L.ciclo, estado: est, hasta, vence: L.vence, prueba_hasta: L.prueba_hasta, inicio: L.inicio,
      dias: hasta ? diasEntre(h, hasta) : null,
      funciones: ['cancelada'].includes(est) ? [] : p.funciones, usuarios: p.usuarios === Infinity ? null : p.usuarios,
      solo_lectura: ['suspendida', 'cancelada'].includes(est),
      descuento: descVigente ? { pct: L.descuento_pct, hasta: L.descuento_hasta } : null,
      tarifa_exenta_hasta: L.tarifa_exenta_hasta,
      precio: precioPeriodo(L.plan, L.ciclo, descVigente ? L.descuento_pct : 0),
    };
  }
  // ¿El local puede usar esta función? Siempre se puede exportar los propios datos si la cuenta
  // está suspendida o cancelada: el local nunca queda sin acceso a su información.
  function puede(lid, funcion) {
    const e = estado(lid);
    if (!e) return true; // locales anteriores al gestor: sin restricciones hasta que se les cree licencia
    if (funcion === 'exportar' && e.solo_lectura) return true;
    return e.funciones.includes(funcion);
  }

  // Tarifa por pedido web de un mes: 1 % con tope, salvo los días exentos.
  function tarifaMes(lid, mes) {
    const L = filaDe(lid);
    const filas = db.prepare("SELECT dia, total FROM pedidos WHERE local_id=? AND canal='web' AND estado!='anulado' AND substr(dia,1,7)=?").all(lid, mes);
    const cobrables = filas.filter((p) => !L?.tarifa_exenta_hasta || p.dia >= L.tarifa_exenta_hasta);
    return { mes, pedidos: filas.length, cobrables: cobrables.length, exentos: filas.length - cobrables.length,
      monto: cobrables.reduce((s, p) => s + tarifaPedido(p.total), 0), ventas: filas.reduce((s, p) => s + p.total, 0) };
  }

  // Cambios desde la consola de administración.
  function actualizar(lid, b) {
    const L = filaDe(lid);
    if (!L) return { error: 'El local no tiene licencia' };
    const v = { ...L };
    if (b.plan !== undefined) { if (!PLANES[b.plan]) return { error: 'Plan inválido' }; v.plan = b.plan; }
    if (b.ciclo !== undefined) { if (!CICLOS[b.ciclo]) return { error: 'Ciclo inválido' }; v.ciclo = b.ciclo; }
    for (const k of ['prueba_hasta', 'vence', 'descuento_hasta', 'tarifa_exenta_hasta']) {
      if (b[k] === undefined) continue;
      if (b[k] !== null && b[k] !== '' && !esDia(b[k])) return { error: `Fecha inválida: ${k}` };
      v[k] = b[k] || null;
    }
    if (b.descuento_pct !== undefined) {
      const d = Number(b.descuento_pct);
      if (!Number.isInteger(d) || d < 0 || d > 100) return { error: 'Descuento inválido (0 a 100)' };
      v.descuento_pct = d;
    }
    if (b.cancelada !== undefined) v.cancelada = b.cancelada ? 1 : 0;
    if (b.notas !== undefined) v.notas = texto(b.notas, 500);
    db.prepare(`UPDATE licencias SET plan=?, ciclo=?, prueba_hasta=?, vence=?, descuento_pct=?, descuento_hasta=?, tarifa_exenta_hasta=?, cancelada=?, notas=?,
      actualizado=datetime('now','localtime') WHERE local_id=?`)
      .run(v.plan, v.ciclo, v.prueba_hasta, v.vence, v.descuento_pct, v.descuento_hasta, v.tarifa_exenta_hasta, v.cancelada, v.notas, lid);
    const cambios = Object.fromEntries(Object.keys(b).filter((k) => String(L[k] ?? '') !== String(v[k] ?? '')).map((k) => [k, [L[k], v[k]]]));
    if (Object.keys(cambios).length) evento(lid, L.plan !== v.plan ? 'cambio_plan' : 'cambio', cambios);
    return { ok: true };
  }

  // Pago registrado a mano (fase 1): extiende el vencimiento desde el fin de lo ya pagado.
  function registrarPago(lid, b) {
    const L = filaDe(lid);
    if (!L) return { error: 'El local no tiene licencia' };
    const ciclo = CICLOS[b.ciclo] ? b.ciclo : L.ciclo;
    const meses = CICLOS[ciclo].meses;
    const medio = MEDIOS.includes(b.medio) ? b.medio : null;
    if (!medio) return { error: 'Medio de pago inválido' };
    const h = hoy();
    // Si sigue en prueba o al día, el período parte cuando termina lo cubierto; si está atrasado, hoy.
    const fin = [L.prueba_hasta, L.vence].filter(Boolean).sort().pop();
    const desde = fin && fin > h ? fin : h;
    const hasta = sumarMeses(desde, meses);
    const desc = L.descuento_pct && (!L.descuento_hasta || desde < L.descuento_hasta) ? L.descuento_pct : 0;
    const sugerido = precioPeriodo(L.plan, ciclo, desc);
    const monto = b.monto === undefined || b.monto === '' ? sugerido : Number(b.monto);
    if (!Number.isInteger(monto) || monto < 0 || monto > 50_000_000) return { error: 'Monto inválido' };
    const tarifa = b.tarifa === undefined || b.tarifa === '' ? 0 : Number(b.tarifa);
    if (!Number.isInteger(tarifa) || tarifa < 0 || tarifa > 10_000_000) return { error: 'Tarifa inválida' };
    db.prepare('INSERT INTO licencia_pagos (local_id,fecha,desde,hasta,meses,monto,tarifa,medio,referencia,factura) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(lid, h, desde, hasta, meses, monto, tarifa, medio, texto(b.referencia, 80), texto(b.factura, 30));
    db.prepare("UPDATE licencias SET vence=?, ciclo=?, cancelada=0, actualizado=datetime('now','localtime') WHERE local_id=?").run(hasta, ciclo, lid);
    evento(lid, 'pago', { desde, hasta, monto, tarifa, medio, sugerido });
    return { ok: true, desde, hasta, monto, sugerido };
  }

  const pagos = (lid) => db.prepare('SELECT * FROM licencia_pagos WHERE local_id=? AND anulado=0 ORDER BY id DESC').all(lid);
  const eventos = (lid) => db.prepare('SELECT fecha, tipo, detalle FROM licencia_eventos WHERE local_id=? ORDER BY id DESC LIMIT 50').all(lid).map((e) => ({ ...e, detalle: JSON.parse(e.detalle || '{}') }));

  return { crear, estado, puede, tarifaMes, actualizar, registrarPago, pagos, eventos, fila: filaDe };
}
