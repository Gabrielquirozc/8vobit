// Exportar a CSV para el contador: ventas, productos vendidos, caja diaria y gastos por rango de fechas.
// Formato pensado para Excel en Chile: separador ";", BOM UTF-8 y montos enteros sin puntos.
// Sin teléfonos ni direcciones de clientes: el contador no los necesita.
import { CATEGORIAS } from './caja.mjs';

export const TIPOS_EXPORT = ['ventas', 'productos', 'caja', 'gastos'];
const MAX_DIAS = 366;
const esDia = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(`${v}T12:00:00`));
const MEDIO = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta', otro: 'Otro' };

// Celda de texto: comillas si hace falta, y un apóstrofo delante de =, +, - o @ para que
// Excel no lo interprete como fórmula (inyección de fórmulas en CSV).
function celda(v) {
  if (v == null) return '';
  if (typeof v === 'number') return String(Math.round(v));
  let t = String(v).replace(/[\r\n]+/g, ' ');
  if (/^[=+\-@\t]/.test(t)) t = `'${t}`;
  return /[";]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
const csv = (cab, filas) => '﻿' + [cab, ...filas].map((f) => f.map(celda).join(';')).join('\r\n') + '\r\n';

export function crearExportar(db, { caja }) {
  function ventas(lid, desde, hasta) {
    const filas = db.prepare(`SELECT dia, numero, substr(creado,12,5) hora, canal, modalidad, cliente, estado, medio_pago, cobrado_en,
        total, costo_despacho, folio_boleta FROM pedidos WHERE local_id=? AND dia BETWEEN ? AND ? ORDER BY dia, numero`).all(lid, desde, hasta);
    return csv(['Fecha', 'N° pedido', 'Hora', 'Canal', 'Modalidad', 'Cliente', 'Estado', 'Medio de pago', 'Hora de cobro', 'Total', 'Despacho incluido', 'Folio boleta'],
      filas.map((p) => [p.dia, p.numero, p.hora, p.canal === 'mostrador' ? 'Mostrador' : 'Web', p.modalidad === 'despacho' ? 'Despacho' : 'Retiro',
        p.cliente, p.estado, MEDIO[p.medio_pago] || (p.estado === 'anulado' ? '' : 'Por cobrar'), p.cobrado_en, p.total, p.costo_despacho, p.folio_boleta]));
  }
  function productos(lid, desde, hasta) {
    const filas = db.prepare(`SELECT p.dia, p.numero, i.nombre, i.cantidad, i.precio_unitario, i.costo_unitario FROM pedido_items i
        JOIN pedidos p ON p.id=i.pedido_id WHERE p.local_id=? AND p.dia BETWEEN ? AND ? AND p.estado!='anulado' ORDER BY p.dia, p.numero, i.id`).all(lid, desde, hasta);
    return csv(['Fecha', 'N° pedido', 'Producto', 'Cantidad', 'Precio unitario', 'Subtotal', 'Costo unitario', 'Costo total'],
      filas.map((i) => [i.dia, i.numero, i.nombre, i.cantidad, i.precio_unitario, i.cantidad * i.precio_unitario, i.costo_unitario,
        i.costo_unitario == null ? null : i.cantidad * i.costo_unitario]));
  }
  // Una fila por día con ventas, movimientos o cierre.
  function cajaDiaria(lid, desde, hasta) {
    const dias = db.prepare(`SELECT dia FROM pedidos WHERE local_id=? AND dia BETWEEN ? AND ?
        UNION SELECT dia FROM caja_movimientos WHERE local_id=? AND dia BETWEEN ? AND ? AND anulado=0 AND (tipo!='gasto' OR medio='efectivo')
        UNION SELECT dia FROM caja_cierres WHERE local_id=? AND dia BETWEEN ? AND ? AND anulado=0 ORDER BY dia`).all(lid, desde, hasta, lid, desde, hasta, lid, desde, hasta);
    return csv(['Fecha', 'Vendido (cobrado)', 'Ventas en efectivo', 'Fondo inicial', 'Ingresos', 'Retiros', 'Gastos en efectivo', 'Efectivo esperado', 'Efectivo contado', 'Diferencia', 'Nota del cierre'],
      dias.map(({ dia }) => {
        const e = caja.esperado(lid, dia);
        const vendido = db.prepare("SELECT COALESCE(SUM(total),0) s FROM pedidos WHERE local_id=? AND dia=? AND estado!='anulado' AND pagado=1").get(lid, dia).s;
        const k = db.prepare('SELECT contado, diferencia, nota FROM caja_cierres WHERE local_id=? AND dia=? AND anulado=0').get(lid, dia);
        return [dia, vendido, e.ventas, e.fondo, e.ingresos, e.retiros, e.gastos, e.total, k?.contado, k?.diferencia, k?.nota];
      }));
  }
  function gastos(lid, desde, hasta) {
    const filas = db.prepare(`SELECT dia, categoria, descripcion, medio, documento, monto FROM caja_movimientos
        WHERE local_id=? AND tipo='gasto' AND anulado=0 AND dia BETWEEN ? AND ? ORDER BY dia, id`).all(lid, desde, hasta);
    return csv(['Fecha', 'Categoría', 'Detalle', 'Medio de pago', 'N° documento', 'Monto'],
      filas.map((g) => [g.dia, CATEGORIAS[g.categoria] || g.categoria, g.descripcion, MEDIO[g.medio] || g.medio, g.documento, g.monto]));
  }
  const GEN = { ventas, productos, caja: cajaDiaria, gastos };

  // { error } o { nombre, csv }.
  return function exportar(local, tipo, desde, hasta) {
    if (!TIPOS_EXPORT.includes(tipo)) return { error: 'Tipo de exportación inválido' };
    if (!esDia(desde) || !esDia(hasta)) return { error: 'Fechas inválidas' };
    if (desde > hasta) return { error: 'La fecha de inicio es posterior a la de término' };
    if ((new Date(`${hasta}T12:00:00`) - new Date(`${desde}T12:00:00`)) / 864e5 >= MAX_DIAS) return { error: 'El rango máximo es de un año' };
    return { nombre: `${local.slug}-${tipo}-${desde}_${hasta}.csv`, csv: GEN[tipo](local.id, desde, hasta) };
  };
}
