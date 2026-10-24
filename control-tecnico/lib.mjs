export const IVA = 0.19;

// Precios públicos aprobados el 17-10-2026. La pieza se cotiza por encargo.
export const servicios = Object.freeze({
  diagnostico: { nombre: 'Diagnóstico', bruto: 5000 },
  formateo: { nombre: 'Formateo', bruto: 15000 },
  respaldo: { nombre: 'Respaldo de datos', bruto: 5000 },
  reparar_windows: { nombre: 'Reparar Windows', bruto: 15000 },
  limpieza: { nombre: 'Limpieza interna', bruto: 20000 },
  limpieza_avanzada: { nombre: 'Limpieza gamer o torre', bruto: 25000 },
  combo: { nombre: 'Formateo y limpieza', bruto: 30000 },
  recuperar_datos: { nombre: 'Recuperación de datos', bruto: 20000 },
  armado_pc: { nombre: 'Armado de PC', bruto: 50000 },
  domicilio: { nombre: 'Retiro o entrega a domicilio, por tramo', bruto: 5000 },
  remoto: { nombre: 'Atención remota, hasta una hora', bruto: 10000 },
  instalar_ram: { nombre: 'Instalar RAM', bruto: 10000 },
  instalar_bateria: { nombre: 'Instalar batería', bruto: 10000 },
  instalar_ventilador: { nombre: 'Instalar ventilador', bruto: 15000 },
  instalar_ssd: { nombre: 'Instalar SSD', bruto: 15000 },
  instalar_ssd_so: { nombre: 'Instalar SSD y sistema operativo', bruto: 25000 },
  instalar_tapa: { nombre: 'Instalar tapa trasera', bruto: 25000 },
  instalar_pantalla: { nombre: 'Instalar pantalla', bruto: 25000 },
  reparar_bisagras: { nombre: 'Reparar bisagras', bruto: 25000 },
  reparar_anclajes: { nombre: 'Reconstruir anclajes', bruto: 10000 },
  jack_cable: { nombre: 'Jack de carga en cable', bruto: 15000 },
  jack_soldado: { nombre: 'Jack de carga soldado', bruto: 30000 },
});

export const categorias = Object.freeze({
  ninguna: { nombre: 'Sin pieza', recargo: 0 },
  ram_ssd_cable: { nombre: 'RAM, SSD o cable', recargo: 0.30 },
  bateria_tapa: { nombre: 'Batería o tapa', recargo: 0.40 },
  pantalla_bisagra: { nombre: 'Pantalla o bisagra', recargo: 0.50 },
  especial: { nombre: 'Pieza especial', recargo: 0.50 },
});

export function entero(value, nombre = 'Monto') {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${nombre} debe ser un entero no negativo en pesos`);
  return number;
}

export function cotizar(input) {
  const servicio = servicios[input.servicio];
  const categoria = categorias[input.categoria];
  if (!servicio || !categoria) throw new Error('Servicio o categoría no reconocida');
  const compraBruta = entero(input.compraBruta ?? 0, 'Compra de pieza');
  const ivaRecuperableEstimado = entero(input.ivaRecuperableEstimado ?? 0, 'IVA recuperable estimado');
  const flete = entero(input.flete ?? 0, 'Flete');
  const arancel = entero(input.arancel ?? 0, 'Arancel');
  const gestion = entero(input.gestion ?? 0, 'Gestión');
  const contingencia = entero(input.contingencia ?? 0, 'Contingencia');
  if (ivaRecuperableEstimado > compraBruta) throw new Error('IVA recuperable mayor que compra');
  if (input.categoria === 'ninguna' && (compraBruta || ivaRecuperableEstimado || flete || arancel || gestion || contingencia)) {
    throw new Error('Hay costos de pieza, pero la categoría es Sin pieza');
  }
  const costoComercial = compraBruta - ivaRecuperableEstimado + flete + arancel + gestion + contingencia;
  const recargo = input.recargo === undefined || input.recargo === '' ? categoria.recargo : Number(input.recargo);
  if (!Number.isFinite(recargo) || recargo < 0 || recargo > 5) throw new Error('Recargo inválido');
  const piezaNeta = categoria === categorias.ninguna ? 0 : Math.ceil(costoComercial * (1 + recargo));
  const servicioBruto = servicio.bruto;
  const servicioNeto = Math.round(servicioBruto / (1 + IVA));
  const neto = piezaNeta + servicioNeto;
  const bruto = Math.round(neto * (1 + IVA));
  return { costoComercial, recargo, piezaNeta, servicioBruto, servicioNeto, neto, ivaVentaEstimado: bruto - neto, bruto,
    contribucionAntesDeTrabajo: neto - costoComercial };
}

export function resumenMensual(ordenes, movimientos, mes) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new Error('Mes inválido');
  const delMes = movimientos.filter(m => m.fecha.startsWith(mes) && !m.anulado_at);
  const suma = (tipo, campo = 'monto') => delMes.filter(m => m.tipo === tipo).reduce((total, m) => total + Number(m[campo] || 0), 0);
  const ventasDocumentadas = ordenes.filter(o => o.fechaDocumento?.startsWith(mes) && o.folio && o.totalDocumento !== null);
  const ventaBruta = ventasDocumentadas.reduce((n, o) => n + o.totalDocumento, 0);
  const servicioBruto = ventasDocumentadas.reduce((n, o) => n + Number(o.servicioDocumento || 0), 0);
  const piezaBruta = ventasDocumentadas.reduce((n, o) => n + Number(o.piezaDocumento || 0), 0);
  const ventaNetaEstimada = ventasDocumentadas.reduce((n, o) => n + Math.round(o.totalDocumento / 1.19), 0);
  const ivaDebitoEstimado = ventaBruta - ventaNetaEstimada;
  const ivaCreditoDocumentado = delMes.filter(m => m.tipo === 'compra' && m.documento && m.creditoValidado).reduce((n, m) => n + Number(m.ivaCredito || 0), 0);
  const ivaCreditoImportaciones = delMes.filter(m => m.tipo === 'compra' && m.rubro === 'iva_importacion' && m.documento && m.creditoValidado).reduce((n, m) => n + Number(m.ivaCredito || 0), 0);
  return { mes, ventaBruta, servicioBruto, piezaBruta, ventaNetaEstimada, ivaDebitoEstimado, ivaCreditoDocumentado,
    ivaCreditoImportaciones, aranceles: delMes.filter(m => m.rubro === 'arancel').reduce((n, m) => n + Number(m.monto || 0), 0),
    ivaImportacionPagado: delMes.filter(m => m.rubro === 'iva_importacion').reduce((n, m) => n + Number(m.monto || 0), 0),
    diferenciaIvaEstimada: ivaDebitoEstimado - ivaCreditoDocumentado,
    anticipos: suma('anticipo'), saldos: suma('saldo'), compras: suma('compra'), gastos: suma('gasto'),
    cobros: suma('anticipo') + suma('saldo'), egresos: suma('compra') + suma('gasto'),
    ordenesSinDocumento: ordenes.filter(o => o.estado === 'entregado' && !o.folio).map(o => o.id),
    comprasPorRevisar: delMes.filter(m => m.tipo === 'compra' && (!m.documento || !m.creditoValidado)).map(m => m.id),
    ventasDocumentadas: ventasDocumentadas.length };
}
