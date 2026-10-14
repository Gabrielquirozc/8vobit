// Cálculo laboral del repartidor (Chile), compartido por el servidor y el panel.
// Es una ESTIMACIÓN para presupuestar y fijar precios de despacho, no una liquidación
// oficial: los parámetros (ingreso mínimo, jornada, tasas) se editan en el panel cuando cambian.
//
// Fuentes del análisis del dueño: Ley 21.830 (IMM $553.553 desde el 1-5-2026), jornada máxima
// de 42 h desde abril de 2026, Código del Trabajo arts. 38, 40 bis, 41 y 50, Ley 21.735.

export const LABORAL_BASE = {
  vigencia: '2026-05-01',
  imm: 553553,          // ingreso mínimo mensual
  jornadaMax: 42,       // horas semanales
  semanasMes: 52 / 12,  // ≈ 4,33
  topeGratifImm: 4.75,  // art. 50: tope anual de 4,75 IMM
  recargoDomingo: 30,   // % (art. 38: comercio que atiende público; por confirmar N°7 o N°2)
  empleador: { sis: 1.5, mutual: 0.93, aporte: 3.5, cesIndef: 2.4, cesPlazo: 3.0 }, // %; aporte Ley 21.735 por verificar
  trabajador: { afp: 11.27, salud: 7, cesIndef: 0.6 },                            // %, descuentos del trabajador
};
export const DIAS_SEM = [['1', 'Lunes'], ['2', 'Martes'], ['3', 'Miércoles'], ['4', 'Jueves'], ['5', 'Viernes'], ['6', 'Sábado'], ['0', 'Domingo']];
const aMin = (h) => { const [a, b] = String(h).split(':').map(Number); return a * 60 + b; };

// Horas de un día de turno: [desde, hasta, minutos de colación]. Puede cruzar medianoche.
export function horasDia(t) {
  if (!t) return 0;
  let m = aMin(t[1]) - aMin(t[0]); if (m <= 0) m += 1440;
  return Math.max(0, m - (Number(t[2]) || 0)) / 60;
}
export const horasSemana = (turno) => DIAS_SEM.reduce((s, [d]) => s + horasDia(turno?.[d]), 0);

// Avisos legales del turno y del sueldo (no bloquean, salvo `grave`).
export function avisosTurno(trab, p = LABORAL_BASE) {
  const out = [], h = horasSemana(trab.turno);
  if (h > p.jornadaMax) out.push({ grave: true, txt: `Pasa la jornada máxima de ${p.jornadaMax} h semanales.` });
  else if (h > (p.jornadaMax * 2) / 3) out.push({ txt: `Más de ${Math.round((p.jornadaMax * 2) / 3)} h: ya no es jornada parcial (art. 40 bis), aplican las reglas de jornada completa.` });
  for (const [d, n] of DIAS_SEM) {
    const t = trab.turno?.[d]; if (!t) continue;
    const bruto = horasDia([t[0], t[1], 0]), col = Number(t[2]) || 0;
    if (horasDia(t) > 10) out.push({ grave: true, txt: `${n}: más de 10 horas de trabajo en el día.` });
    if (col && (col < 30 || col > 60)) out.push({ txt: `${n}: la colación debe durar entre 30 y 60 minutos.` });
    if (bruto > 6 && !col) out.push({ txt: `${n}: con más de 6 horas corresponde dar colación (30 a 60 min).` });
  }
  return out;
}

// Liquidación mensual estimada. `entregas` = despachos del mes (para el bono por entrega) y
// `asignacion` = reembolso de bencina/desgaste si usa su propio vehículo (art. 41, no imponible).
export function liquidacion(trab, { entregas = 0, asignacion = 0 } = {}, p = LABORAL_BASE) {
  const hs = horasSemana(trab.turno), hDom = horasDia(trab.turno?.['0']);
  const minimo = (p.imm * hs) / p.jornadaMax;
  const base = Math.max(minimo, Number(trab.sueldoBase) || 0);
  // Valor hora ordinaria: (sueldo / 30 × 28) / (horas semanales × 4).
  const valorHora = hs ? (base / 30) * 28 / (hs * 4) : 0;
  const recargo = trab.recargoDomingo ? valorHora * (p.recargoDomingo / 100) * hDom * p.semanasMes : 0;
  const bonos = (Number(trab.bonoEntrega) || 0) * entregas;
  const imponibleSinGratif = base + recargo + bonos;
  const gratificacion = trab.gratificacion ? Math.min(imponibleSinGratif * 0.25, (p.topeGratifImm * p.imm) / 12) : 0;
  const imponible = imponibleSinGratif + gratificacion;
  const e = p.empleador, indef = trab.contrato === 'indefinido';
  const tasaEmp = e.sis + e.mutual + e.aporte + (indef ? e.cesIndef : e.cesPlazo);
  const cargas = imponible * tasaEmp / 100;
  const t = p.trabajador, tasaTrab = t.afp + t.salud + (indef ? t.cesIndef : 0);
  const descuentos = imponible * tasaTrab / 100;
  const costoEmpresa = imponible + cargas + asignacion;
  const horasMes = hs * p.semanasMes;
  return {
    horasSemana: hs, horasMes, minimo, base, bajoMinimo: (Number(trab.sueldoBase) || 0) > 0 && Number(trab.sueldoBase) < minimo - 1,
    valorHora, recargo, bonos, gratificacion, imponible, tasaEmp, cargas, asignacion, costoEmpresa,
    tasaTrab, descuentos, liquido: imponible - descuentos + asignacion,
    costoHora: horasMes ? (costoEmpresa - bonos * (1 + tasaEmp / 100) - asignacion) / horasMes : 0, // costo fijo por hora de turno
  };
}

// Cuántos despachos al mes cubren el costo fijo del repartidor, si cada despacho deja `margenViaje`
// (precio cobrado − bencina − bono). null si cada viaje no deja nada.
export const despachosParaCubrir = (costoFijo, margenViaje) => (margenViaje > 0 ? Math.ceil(costoFijo / margenViaje) : null);

// Turnos tipo del análisis (sábado y domingo, viernes noche…).
export const TURNOS_TIPO = [
  { id: 'A', nombre: 'Solo cena sáb y dom', turno: { 6: ['19:00', '23:00', 0], 0: ['19:00', '23:00', 0] } },
  { id: 'B', nombre: 'Fin de semana completo', turno: { 6: ['12:30', '21:30', 60], 0: ['12:30', '21:30', 60] } },
  { id: 'C', nombre: 'Vie noche + fin de semana', turno: { 5: ['19:00', '23:00', 0], 6: ['13:00', '21:30', 30], 0: ['13:00', '21:30', 30] } },
  { id: 'D', nombre: 'Viernes a domingo', turno: { 5: ['13:00', '22:00', 60], 6: ['13:00', '22:00', 60], 0: ['13:00', '22:00', 60] } },
];

// Vehículo con su repartidor: si tiene uno contratado, el tiempo del viaje se valora al costo por
// hora del repartidor y el bono por entrega (más cargas) va como pago por viaje.
export function vehiculoConRepartidor(v, trabajadores = [], p = LABORAL_BASE) {
  const t = v && trabajadores.find((x) => x.id === v.repartidorId && x.activo !== false && x.rol === 'repartidor');
  if (!t) return v;
  const l = liquidacion(t, {}, p);
  return { ...v, pagoHora: Math.round(l.costoHora), pagoViaje: Math.round((Number(t.bonoEntrega) || 0) * (1 + l.tasaEmp / 100)), repartidor: t };
}
