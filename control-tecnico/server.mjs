import http from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { categorias, cotizar, entero, resumenMensual, servicios } from './lib.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const dbPath = resolve(process.env.CONTROL_DB || join(root, 'data', 'control.db'));
mkdirSync(resolve(dbPath, '..'), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS ordenes (
 id INTEGER PRIMARY KEY, creada TEXT NOT NULL, agenda_id INTEGER UNIQUE,
 cliente TEXT NOT NULL, correo TEXT NOT NULL DEFAULT '', telefono TEXT NOT NULL DEFAULT '',
 equipo TEXT NOT NULL, falla TEXT NOT NULL DEFAULT '', servicio TEXT NOT NULL,
 categoria TEXT NOT NULL, proveedor TEXT NOT NULL DEFAULT '', enlace TEXT NOT NULL DEFAULT '',
 plazo TEXT NOT NULL DEFAULT '', vigencia TEXT NOT NULL DEFAULT '', presupuesto TEXT NOT NULL,
 cotizacion TEXT NOT NULL, estado TEXT NOT NULL DEFAULT 'cotizando',
 folio TEXT NOT NULL DEFAULT '', fecha_documento TEXT NOT NULL DEFAULT '', total_documento INTEGER,
 servicio_documento INTEGER, pieza_documento INTEGER,
 notas TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS movimientos (
 id INTEGER PRIMARY KEY, orden_id INTEGER REFERENCES ordenes(id), fecha TEXT NOT NULL,
 tipo TEXT NOT NULL, monto INTEGER NOT NULL, medio TEXT NOT NULL DEFAULT '',
 rubro TEXT NOT NULL DEFAULT 'otro', detalle TEXT NOT NULL DEFAULT '', documento TEXT NOT NULL DEFAULT '',
 iva_credito INTEGER NOT NULL DEFAULT 0, credito_validado INTEGER NOT NULL DEFAULT 0,
 anulado_at TEXT NOT NULL DEFAULT '', motivo_anulacion TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_movimientos_fecha ON movimientos(fecha);
CREATE INDEX IF NOT EXISTS idx_movimientos_orden ON movimientos(orden_id);`);

const estados = new Set(['cotizando', 'esperando_anticipo', 'pieza_pedida', 'pieza_recibida', 'reparando', 'listo', 'entregado', 'cancelado']);
const tipos = new Set(['anticipo', 'saldo', 'compra', 'gasto']);
const rubros = new Set(['pieza', 'flete', 'arancel', 'iva_importacion', 'gestion', 'otro']);
const json = (res, status, body) => {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(data);
};
const texto = (x, max = 250) => String(x ?? '').trim().slice(0, max);
const fecha = x => {
  const value = texto(x, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value) throw new Error('Fecha inválida');
  return value;
};
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const ordenes = () => db.prepare('SELECT * FROM ordenes ORDER BY id DESC').all().map(o => {
  const costos = db.prepare(`SELECT COUNT(*) cantidad, COALESCE(SUM(monto),0) pagado,
    COALESCE(SUM(CASE WHEN credito_validado=1 AND documento<>'' THEN iva_credito ELSE 0 END),0) credito
    FROM movimientos WHERE orden_id=? AND tipo IN ('compra','gasto') AND anulado_at=''`).get(o.id);
  return { ...o, presupuesto: JSON.parse(o.presupuesto), cotizacion: JSON.parse(o.cotizacion),
    costoRealProvisional: costos.cantidad ? costos.pagado - costos.credito : null,
    costosSinRegistrar: !costos.cantidad };
});
const movimientos = () => db.prepare('SELECT * FROM movimientos ORDER BY fecha DESC, id DESC').all().map(m => ({ ...m, creditoValidado: Boolean(m.credito_validado), ivaCredito: m.iva_credito }));
const paraResumen = o => ({ ...o, fechaDocumento: o.fecha_documento, totalDocumento: o.total_documento,
  servicioDocumento: o.servicio_documento, piezaDocumento: o.pieza_documento });
const paraMovimiento = m => ({ ...m, ivaCredito: m.iva_credito, creditoValidado: Boolean(m.credito_validado) });

async function body(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 50_000) throw new Error('Solicitud demasiado grande');
  }
  try { return JSON.parse(data || '{}'); } catch { throw new Error('JSON inválido'); }
}
function validarOrden(data) {
  const cliente = texto(data.cliente, 120), equipo = texto(data.equipo, 200);
  if (!cliente || !equipo) throw new Error('Faltan cliente o equipo');
  const agendaId = data.agendaId === '' || data.agendaId == null ? null : entero(data.agendaId, 'ID de agenda');
  if (agendaId === 0) throw new Error('ID de agenda inválido');
  const presupuesto = {
    servicio: texto(data.servicio, 40), categoria: texto(data.categoria, 40),
    compraBruta: entero(data.compraBruta ?? 0), ivaRecuperableEstimado: entero(data.ivaRecuperableEstimado ?? 0),
    flete: entero(data.flete ?? 0), arancel: entero(data.arancel ?? 0),
    gestion: entero(data.gestion ?? 0), contingencia: entero(data.contingencia ?? 0),
    recargo: data.recargo === '' || data.recargo == null ? '' : Number(data.recargo),
  };
  const calculo = cotizar(presupuesto);
  return { agendaId, cliente, equipo, correo: texto(data.correo, 190), telefono: texto(data.telefono, 40),
    falla: texto(data.falla, 1000), proveedor: texto(data.proveedor, 200), enlace: texto(data.enlace, 1000),
    plazo: texto(data.plazo, 150), vigencia: data.vigencia ? fecha(data.vigencia) : '',
    notas: texto(data.notas, 2000), presupuesto, calculo };
}
function csv(rows) {
  const escape = x => `"${String(x ?? '').replaceAll('"', '""')}"`;
  return '\ufeff' + rows.map(row => row.map(escape).join(';')).join('\r\n') + '\r\n';
}
function exportar(res, nombre, rows) {
  res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${nombre}"`, 'cache-control': 'no-store' });
  res.end(csv(rows));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const fuentes = new Set([
      'Montserrat-Regular.woff2', 'Montserrat-Medium.woff2',
      'Montserrat-SemiBold.woff2', 'Montserrat-Bold.woff2',
      'JetBrainsMono-Regular.woff2', 'JetBrainsMono-Medium.woff2', 'JetBrainsMono-SemiBold.woff2',
    ]);
    if (req.method === 'GET' && url.pathname.startsWith('/fonts/') && fuentes.has(url.pathname.slice('/fonts/'.length))) {
      res.writeHead(200, { 'content-type': 'font/woff2', 'cache-control': 'public, max-age=604800' });
      return res.end(readFileSync(join(root, 'public', 'fonts', url.pathname.slice('/fonts/'.length))));
    }
    if (req.method === 'GET' && url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
    if (req.method === 'GET' && url.pathname === '/isotipo.png') {
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' });
      return res.end(readFileSync(join(root, 'public', 'isotipo.png')));
    }
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'", 'cache-control': 'no-store' });
      return res.end(readFileSync(join(root, 'public', 'index.html')));
    }
    if (req.method === 'GET' && url.pathname === '/app.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(readFileSync(join(root, 'public', 'app.js')));
    }
    if (req.method === 'GET' && url.pathname === '/style.css') {
      res.writeHead(200, { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(readFileSync(join(root, 'public', 'style.css')));
    }
    if (req.method === 'GET' && url.pathname === '/api/datos') return json(res, 200, { servicios, categorias, ordenes: ordenes(), movimientos: movimientos() });
    if (req.method === 'POST' && url.pathname === '/api/cotizar') return json(res, 200, cotizar(await body(req)));
    if (req.method === 'POST' && url.pathname === '/api/ordenes') {
      const o = validarOrden(await body(req));
      const result = db.prepare(`INSERT INTO ordenes
        (creada, agenda_id, cliente, correo, telefono, equipo, falla, servicio, categoria, proveedor, enlace, plazo, vigencia, presupuesto, cotizacion, notas)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        hoy(), o.agendaId, o.cliente, o.correo, o.telefono, o.equipo, o.falla, o.presupuesto.servicio, o.presupuesto.categoria,
        o.proveedor, o.enlace, o.plazo, o.vigencia, JSON.stringify(o.presupuesto), JSON.stringify(o.calculo), o.notas);
      return json(res, 201, { id: Number(result.lastInsertRowid) });
    }
    const match = url.pathname.match(/^\/api\/ordenes\/(\d+)$/);
    if (req.method === 'PATCH' && match) {
      const id = Number(match[1]), data = await body(req);
      const old = db.prepare('SELECT * FROM ordenes WHERE id=?').get(id);
      if (!old) return json(res, 404, { error: 'Orden no encontrada' });
      const estado = texto(data.estado || old.estado, 40);
      if (!estados.has(estado)) throw new Error('Estado inválido');
      const folio = texto(data.folio ?? old.folio, 80);
      const fechaDocumento = data.fechaDocumento ? fecha(data.fechaDocumento) : old.fecha_documento;
      const servicioDocumento = data.servicioDocumento === '' || data.servicioDocumento == null ? old.servicio_documento : entero(data.servicioDocumento, 'Servicio del documento');
      const piezaDocumento = data.piezaDocumento === '' || data.piezaDocumento == null ? old.pieza_documento : entero(data.piezaDocumento, 'Pieza del documento');
      const totalDocumento = servicioDocumento == null || piezaDocumento == null ? null : servicioDocumento + piezaDocumento;
      if (folio && (!fechaDocumento || totalDocumento == null)) throw new Error('Para registrar un folio faltan fecha o desglose del documento');
      db.prepare('UPDATE ordenes SET estado=?, folio=?, fecha_documento=?, total_documento=?, servicio_documento=?, pieza_documento=?, notas=? WHERE id=?')
        .run(estado, folio, fechaDocumento, totalDocumento, servicioDocumento, piezaDocumento, texto(data.notas ?? old.notas, 2000), id);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/movimientos') {
      const data = await body(req), tipo = texto(data.tipo, 20);
      if (!tipos.has(tipo)) throw new Error('Tipo de movimiento inválido');
      const ordenId = data.ordenId ? entero(data.ordenId, 'Orden') : null;
      if (ordenId && !db.prepare('SELECT id FROM ordenes WHERE id=?').get(ordenId)) throw new Error('Orden no encontrada');
      const monto = entero(data.monto), credito = entero(data.ivaCredito ?? 0, 'IVA crédito');
      if (!monto || credito > monto || (tipo !== 'compra' && credito)) throw new Error('Monto o IVA crédito inválido');
      const rubro = texto(data.rubro || 'otro', 40);
      if (!rubros.has(rubro)) throw new Error('Rubro inválido');
      const documento = texto(data.documento, 150), validado = Boolean(data.creditoValidado);
      if (validado && (!documento || tipo !== 'compra')) throw new Error('El crédito validado exige compra y documento');
      const result = db.prepare(`INSERT INTO movimientos (orden_id, fecha, tipo, monto, medio, rubro, detalle, documento, iva_credito, credito_validado)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(ordenId, fecha(data.fecha), tipo, monto,
          texto(data.medio, 80), rubro, texto(data.detalle, 500), documento, credito, Number(validado));
      return json(res, 201, { id: Number(result.lastInsertRowid) });
    }
    const movimientoMatch = url.pathname.match(/^\/api\/movimientos\/(\d+)\/anular$/);
    if (req.method === 'POST' && movimientoMatch) {
      const id = Number(movimientoMatch[1]), data = await body(req);
      const motivo = texto(data.motivo, 300);
      if (motivo.length < 5) throw new Error('Explica brevemente por qué se anula el movimiento');
      const result = db.prepare("UPDATE movimientos SET anulado_at=?, motivo_anulacion=? WHERE id=? AND anulado_at=''").run(new Date().toISOString(), motivo, id);
      if (!result.changes) return json(res, 404, { error: 'Movimiento inexistente o ya anulado' });
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/api/resumen') {
      const mes = url.searchParams.get('mes') || hoy().slice(0, 7);
      return json(res, 200, resumenMensual(ordenes().map(paraResumen), movimientos().map(paraMovimiento), mes));
    }
    if (req.method === 'GET' && url.pathname === '/exportar/resumen.csv') {
      const mes = url.searchParams.get('mes') || hoy().slice(0, 7);
      const r = resumenMensual(ordenes().map(paraResumen), movimientos().map(paraMovimiento), mes);
      return exportar(res, `octavobit-resumen-${mes}.csv`, [
        ['Concepto', 'Monto CLP'], ['Ventas documentadas brutas', r.ventaBruta], ['Venta neta estimada', r.ventaNetaEstimada],
        ['IVA débito estimado', r.ivaDebitoEstimado], ['IVA crédito documentado y marcado para revisión', r.ivaCreditoDocumentado],
        ['Diferencia IVA estimada, no F29', r.diferenciaIvaEstimada], ['Anticipos recibidos', r.anticipos],
        ['Servicios documentados brutos', r.servicioBruto], ['Piezas documentadas brutas', r.piezaBruta],
        ['Saldos recibidos', r.saldos], ['Compras pagadas', r.compras], ['Otros gastos pagados', r.gastos],
        ['Aranceles pagados', r.aranceles], ['IVA de importación pagado', r.ivaImportacionPagado],
        ['IVA crédito importación revisado', r.ivaCreditoImportaciones],
        ['Órdenes entregadas sin folio', r.ordenesSinDocumento.join(', ')], ['Compras por revisar', r.comprasPorRevisar.join(', ')],
      ]);
    }
    if (req.method === 'GET' && url.pathname === '/exportar/movimientos.csv') {
      const mes = url.searchParams.get('mes') || hoy().slice(0, 7);
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new Error('Mes inválido');
      const rows = movimientos().filter(m => m.fecha.startsWith(mes)).map(m => [m.id, m.fecha, m.orden_id, m.tipo, m.rubro, m.monto, m.medio, m.detalle, m.documento, m.iva_credito, m.credito_validado, m.anulado_at, m.motivo_anulacion]);
      return exportar(res, `octavobit-movimientos-${mes}.csv`, [['ID', 'Fecha', 'Orden', 'Tipo', 'Rubro', 'Monto CLP', 'Medio', 'Detalle', 'Documento', 'IVA crédito CLP', 'Crédito revisado manualmente', 'Anulado en', 'Motivo de anulación'], ...rows]);
    }
    json(res, 404, { error: 'Ruta no encontrada' });
  } catch (error) {
    const status = error.code === 'SQLITE_CONSTRAINT_UNIQUE' ? 409 : error instanceof RangeError || error instanceof TypeError ? 400 : 400;
    json(res, status, { error: status === 409 ? 'Esa cita de agenda ya está vinculada' : error.message });
  }
});

const host = process.env.CONTROL_HOST || '127.0.0.1';
const port = Number(process.env.CONTROL_PORT || 8110);
server.listen(port, host, () => console.log(`Control Técnico: http://${host}:${port}`));
