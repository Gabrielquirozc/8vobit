// Estado de resultados del mes: cuánto gana el local.
//   ventas cobradas − costo de la comida = margen bruto
//   − personal (sueldos anotados como gasto; si no hay, la estimación de Equipo)
//   − gastos de operación (todo lo anotado, salvo insumos: ya están en el costo de la comida)
//   = resultado
// Las compras de insumos anotadas se muestran aparte, para comparar con el costo estimado.
import { CATEGORIAS } from './caja.mjs';

const mesDe = (mes, n) => { const [y, m] = mes.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

export function crearResultados(db, { equipoMes }) {
  function calcular(local, mes) {
    const lid = local.id, pct = local.costo_pct ?? 35;
    const peds = db.prepare("SELECT id, total, canal, costo_despacho FROM pedidos WHERE local_id=? AND substr(dia,1,7)=? AND estado!='anulado' AND pagado=1").all(lid, mes);
    const ventas = peds.reduce((s, p) => s + p.total, 0);
    const web = peds.filter((p) => p.canal !== 'mostrador').reduce((s, p) => s + p.total, 0);
    const despacho = peds.reduce((s, p) => s + (p.costo_despacho || 0), 0);
    const items = db.prepare(`SELECT i.cantidad, i.precio_unitario, i.costo_unitario FROM pedido_items i JOIN pedidos p ON p.id=i.pedido_id
      WHERE p.local_id=? AND substr(p.dia,1,7)=? AND p.estado!='anulado' AND p.pagado=1`).all(lid, mes);
    const costoComida = Math.round(items.reduce((s, i) => s + i.cantidad * (i.costo_unitario ?? (i.precio_unitario * pct) / 100), 0));
    const estimadas = items.filter((i) => i.costo_unitario == null).length;

    const gastos = Object.fromEntries(Object.keys(CATEGORIAS).map((k) => [k, 0]));
    for (const g of db.prepare("SELECT categoria, SUM(monto) s FROM caja_movimientos WHERE local_id=? AND tipo='gasto' AND anulado=0 AND substr(dia,1,7)=? GROUP BY categoria").all(lid, mes))
      gastos[g.categoria] = g.s;
    const eq = equipoMes(local, mes);
    const personal = gastos.sueldos
      ? { monto: gastos.sueldos, fuente: 'gastos' }
      : { monto: eq.personal.costo, fuente: eq.personal.personas ? 'equipo' : 'sin_datos', personas: eq.personal.personas };
    const operacion = Object.entries(gastos).filter(([k, v]) => v && !['insumos', 'sueldos'].includes(k)).map(([k, v]) => ({ categoria: k, nombre: CATEGORIAS[k], monto: v }))
      .sort((a, b) => b.monto - a.monto);
    const totalOperacion = operacion.reduce((s, g) => s + g.monto, 0);
    const margen = ventas - costoComida;
    const resultado = margen - personal.monto - totalOperacion;
    return {
      mes, pedidos: peds.length, ventas, ventas_web: web, despacho_cobrado: despacho,
      costo_comida: costoComida, lineas_estimadas: estimadas, lineas_total: items.length, costo_pct: pct, margen_bruto: margen,
      personal, operacion, total_operacion: totalOperacion, resultado,
      margen_pct: ventas ? Math.round((resultado / ventas) * 1000) / 10 : null,
      compras_insumos: gastos.insumos,
      comision_app: Math.round((web * (local.comision_app ?? 25)) / 100), comision_app_pct: local.comision_app ?? 25,
    };
  }
  return function resultados(local, mes) {
    const r = calcular(local, mes), a = calcular(local, mesDe(mes, -1));
    return { ...r, anterior: { mes: a.mes, ventas: a.ventas, margen_bruto: a.margen_bruto, personal: a.personal.monto, total_operacion: a.total_operacion, resultado: a.resultado } };
  };
}
