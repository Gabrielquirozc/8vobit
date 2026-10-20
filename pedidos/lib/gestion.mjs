// Tablero del gestor (/admin): metas por escalón, ritmo de altas, cobranza y riesgo de baja.
// Los números de bolsillo siguen la fórmula de VIABILIDAD.md:
//   (locales × ingreso por local − costos fijos) × (1 − reserva de impuestos).
import { sumarDias } from './licencias.mjs';

export const ESCALONES = [5, 10, 20, 42, 50];
export const COSTOS_FIJOS = 115000;
export const INGRESO_REF = 58000; // ingreso neto por local mientras no haya datos reales
const RESERVA = 0.12;
// Hitos de VIABILIDAD.md §7, en meses desde el primer local.
const HITOS = [{ mes: 6, locales: 4, texto: '3 locales pagando además de Gassuso' }, { mes: 12, locales: 10, texto: '10 locales pagando' }, { mes: 24, locales: 25, texto: '25 locales: contratar soporte por horas' }];

const bolsillo = (n, porLocal) => Math.max(0, Math.round((n * porLocal - COSTOS_FIJOS) * (1 - RESERVA)));
const mesesEntre = (a, b) => { const [y1, m1] = a.split('-').map(Number), [y2, m2] = b.split('-').map(Number); return (y2 - y1) * 12 + m2 - m1; };

// locales: filas de resumen(); primeros: [{ local_id, mes }] mes del primer pago de cada local; inicio: día del primer local.
export function gestion(locales, { hoy, primeros, inicio }) {
  const pagando = locales.filter((l) => l.mrr > 0);
  const mrr = pagando.reduce((s, l) => s + l.mrr, 0);
  const porLocal = pagando.length ? Math.round(mrr / pagando.length) : INGRESO_REF;
  const mes = hoy.slice(0, 7);

  // Altas pagadas por mes (últimos 6) y ritmo = promedio de los últimos 3 meses cerrados + el actual.
  const meses = [...Array(6)].map((_, i) => { const d = new Date(`${mes}-15T12:00:00`); d.setMonth(d.getMonth() - 5 + i); return d.toISOString().slice(0, 7); });
  const altas = meses.map((m) => ({ mes: m, n: primeros.filter((p) => p.mes === m).length }));
  const bajas = locales.filter((l) => l.estado === 'cancelada' && l.vence).length;
  const ritmo = Math.round((altas.slice(-3).reduce((s, a) => s + a.n, 0) / 3) * 10) / 10;

  const escalones = ESCALONES.map((n) => ({ locales: n, bolsillo: bolsillo(n, porLocal), mrr: n * porLocal,
    faltan: Math.max(0, n - pagando.length), meses: pagando.length >= n ? 0 : ritmo > 0 ? Math.ceil((n - pagando.length) / ritmo) : null }));

  const mesNegocio = inicio ? mesesEntre(inicio.slice(0, 7), mes) + 1 : 1;
  const hitos = HITOS.map((h) => ({ ...h, estado: pagando.length >= h.locales ? 'ok' : mesNegocio > h.mes ? 'atrasado' : mesNegocio >= h.mes - 2 ? 'cerca' : 'pendiente' }));

  // Cobranza: lo que hay que hacer esta semana.
  const vivo = (l) => !['cancelada'].includes(l.estado);
  const item = (l, motivo) => ({ id: l.id, nombre: l.nombre, estado: l.estado, dias: l.dias, motivo });
  const cobranza = [
    ...locales.filter((l) => l.estado === 'suspendida').map((l) => item(l, 'Suspendida: cobrar o dar de baja')),
    ...locales.filter((l) => l.estado === 'gracia').map((l) => item(l, 'Pago pendiente')),
    ...locales.filter((l) => l.estado === 'activa' && l.dias != null && l.dias <= 7).map((l) => item(l, `Vence en ${l.dias} días`)),
    ...locales.filter((l) => l.estado === 'prueba' && l.dias != null && l.dias <= 7).map((l) => item(l, `Prueba termina en ${l.dias} días: convertir`)),
    ...locales.filter((l) => vivo(l) && l.tarifa_mes_anterior > 0).map((l) => item(l, 'Cobrar tarifa por pedido del mes anterior')),
  ];

  // Riesgo de baja: sin pedidos recientes o sin terminar los primeros pasos.
  const hace7 = sumarDias(hoy, -7);
  const riesgo = locales.filter(vivo).flatMap((l) => {
    const m = [];
    if (!l.ultimo_pedido || l.ultimo_pedido < hace7) m.push(l.ultimo_pedido ? 'Sin pedidos hace más de 7 días' : 'Nunca ha recibido pedidos');
    if (l.inicio && !l.inicio.cerrado && l.inicio.listos < l.inicio.total) m.push(`Primeros pasos: ${l.inicio.listos} de ${l.inicio.total}`);
    return m.length ? [{ id: l.id, nombre: l.nombre, estado: l.estado, motivos: m }] : [];
  });

  const vivos = locales.filter(vivo).length;
  return { pagando: pagando.length, por_local: porLocal, bolsillo: bolsillo(pagando.length, porLocal), ritmo, altas, bajas,
    tasa_bajas: vivos + bajas ? Math.round((bajas / (vivos + bajas)) * 1000) / 10 : 0,
    escalones, mes_negocio: mesNegocio, hitos, cobranza, riesgo };
}
