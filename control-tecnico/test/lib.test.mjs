import test from 'node:test';
import assert from 'node:assert/strict';
import { cotizar, resumenMensual } from '../lib.mjs';

test('servicio sin pieza conserva el precio público aprobado', () => {
  const q = cotizar({ servicio: 'diagnostico', categoria: 'ninguna' });
  assert.equal(q.bruto, 5000);
  assert.equal(q.ivaVentaEstimado, 798);
});

test('pieza por encargo separa IVA recuperable de arancel y flete', () => {
  const q = cotizar({ servicio: 'instalar_pantalla', categoria: 'pantalla_bisagra',
    compraBruta: 119000, ivaRecuperableEstimado: 19000, flete: 10000, arancel: 6000,
    gestion: 4000, contingencia: 5000 });
  assert.equal(q.costoComercial, 125000);
  assert.equal(q.piezaNeta, 187500);
  assert.equal(q.servicioBruto, 25000);
  assert.ok(q.bruto > 210000);
});

test('informe separa caja y DTE y deja compras sin revisar pendientes', () => {
  const ordenes = [
    { id: 1, estado: 'entregado', folio: 'B-1', fechaDocumento: '2026-11-03', totalDocumento: 119000, servicioDocumento: 25000, piezaDocumento: 94000 },
    { id: 2, estado: 'entregado', folio: '', fechaDocumento: '', totalDocumento: null },
  ];
  const movimientos = [
    { id: 1, fecha: '2026-10-31', tipo: 'anticipo', monto: 50000 },
    { id: 2, fecha: '2026-11-02', tipo: 'compra', rubro: 'iva_importacion', monto: 19000, documento: 'DIN 1', ivaCredito: 19000, creditoValidado: true },
    { id: 3, fecha: '2026-11-02', tipo: 'compra', rubro: 'arancel', monto: 6000, documento: 'DIN 1', ivaCredito: 0, creditoValidado: true },
    { id: 4, fecha: '2026-11-03', tipo: 'compra', rubro: 'pieza', monto: 30000, documento: '', ivaCredito: 0, creditoValidado: false },
    { id: 5, fecha: '2026-11-03', tipo: 'compra', rubro: 'pieza', monto: 99000, documento: '', ivaCredito: 0, creditoValidado: false, anulado_at: '2026-11-04T12:00:00Z' },
  ];
  const r = resumenMensual(ordenes, movimientos, '2026-11');
  assert.equal(r.ventaBruta, 119000);
  assert.equal(r.servicioBruto, 25000);
  assert.equal(r.piezaBruta, 94000);
  assert.equal(r.ivaDebitoEstimado, 19000);
  assert.equal(r.ivaCreditoImportaciones, 19000);
  assert.equal(r.aranceles, 6000);
  assert.equal(r.anticipos, 0);
  assert.deepEqual(r.ordenesSinDocumento, [2]);
  assert.deepEqual(r.comprasPorRevisar, [4]);
  assert.equal(r.compras, 55000);
});
