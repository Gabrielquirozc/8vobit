const $ = selector => document.querySelector(selector);
const dinero = n => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(n) || 0);
const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
let datos = { servicios: {}, categorias: {}, ordenes: [], movimientos: [] };

async function api(path, options) {
  const response = await fetch(path, options);
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'No se pudo completar la operación');
  return value;
}
const aviso = text => { $('#mensaje').textContent = text; if (text) setTimeout(() => { if ($('#mensaje').textContent === text) $('#mensaje').textContent = ''; }, 7000); };
const enviar = value => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
const valores = form => Object.fromEntries(new FormData(form).entries());

function abrirTab(tab) {
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab').forEach(s => s.classList.toggle('active', s.id === tab));
  if (tab === 'mes') cargarMes();
}

function camposCotizacion() {
  const v = valores($('#form-orden'));
  for (const key of ['compraBruta', 'ivaRecuperableEstimado', 'flete', 'arancel', 'gestion', 'contingencia']) v[key] = Number(v[key] || 0);
  return v;
}

async function previsualizar() {
  try {
    const q = await api('/api/cotizar', enviar(camposCotizacion()));
    $('#q-costo').textContent = dinero(q.costoComercial);
    $('#q-pieza').textContent = dinero(q.piezaNeta);
    $('#q-servicio').textContent = dinero(q.servicioBruto);
    $('#q-iva').textContent = dinero(q.ivaVentaEstimado);
    $('#q-total').textContent = dinero(q.bruto);
  } catch {
    for (const id of ['q-costo', 'q-pieza', 'q-servicio', 'q-iva', 'q-total']) $(`#${id}`).textContent = '—';
  }
}

function mostrarTrabajos() {
  $('#cuenta-trabajos').textContent = `${datos.ordenes.length} orden${datos.ordenes.length === 1 ? '' : 'es'}`;
  $('#orden-movimiento').innerHTML = '<option value="">Gasto general</option>' + datos.ordenes.map(o => `<option value="${o.id}">OT-${o.id} · ${escapeHtml(o.cliente)} · ${escapeHtml(o.equipo)}</option>`).join('');
  $('#lista-trabajos').innerHTML = datos.ordenes.length ? datos.ordenes.map(o => `<article class="card">
    <div class="card-head"><div><h3>OT-${o.id} · ${escapeHtml(o.cliente)}</h3><p>${escapeHtml(o.equipo)}${o.agenda_id ? ` · Cita de agenda #${o.agenda_id}` : ''}</p></div><span class="badge">${escapeHtml(o.estado.replaceAll('_', ' '))}</span></div>
    <div class="facts"><span><b>Servicio:</b> ${escapeHtml(datos.servicios[o.servicio]?.nombre || o.servicio)}</span><span><b>Total cotizado:</b> ${dinero(o.cotizacion.bruto)}</span><span><b>Pieza:</b> ${dinero(o.cotizacion.piezaNeta)}</span><span><b>Anticipo sugerido de pieza:</b> ${dinero(Math.round(o.cotizacion.piezaNeta * 1.19))}</span><span><b>Costo estimado:</b> ${dinero(o.cotizacion.costoComercial)}</span><span><b>Costo registrado provisional:</b> ${o.costoRealProvisional == null ? 'pendiente' : dinero(o.costoRealProvisional)}</span></div>
    <p>${escapeHtml(o.falla)}${o.proveedor ? ` · Proveedor: ${escapeHtml(o.proveedor)}` : ''}${o.vigencia ? ` · Vigencia: ${escapeHtml(o.vigencia)}` : ''}</p>
    <form class="actualizar-orden" data-id="${o.id}"><label>Estado<select name="estado">${['cotizando','esperando_anticipo','pieza_pedida','pieza_recibida','reparando','listo','entregado','cancelado'].map(e => `<option value="${e}" ${e === o.estado ? 'selected' : ''}>${e.replaceAll('_',' ')}</option>`).join('')}</select></label><label>Folio DTE<input name="folio" value="${escapeHtml(o.folio)}"></label><label>Fecha DTE<input name="fechaDocumento" type="date" value="${escapeHtml(o.fecha_documento)}"></label><label>Servicio en DTE, bruto<input name="servicioDocumento" type="number" min="0" value="${o.servicio_documento ?? o.cotizacion.servicioBruto}"></label><label>Pieza en DTE, bruto<input name="piezaDocumento" type="number" min="0" value="${o.pieza_documento ?? o.cotizacion.bruto - o.cotizacion.servicioBruto}"></label><button class="primary" type="submit">Guardar</button></form>
  </article>`).join('') : '<p class="empty">Todavía no hay trabajos. Crea una cotización para comenzar.</p>';
}

function mostrarMovimientos() {
  $('#lista-movimientos').innerHTML = datos.movimientos.length ? `<table><thead><tr><th>Fecha</th><th>Orden</th><th>Tipo</th><th>Rubro</th><th>Monto</th><th>Detalle</th><th>Documento</th><th>IVA crédito revisado</th><th>Corrección</th></tr></thead><tbody>${datos.movimientos.slice(0, 30).map(m => `<tr><td>${escapeHtml(m.fecha)}</td><td>${m.orden_id ? 'OT-' + m.orden_id : 'General'}</td><td>${escapeHtml(m.tipo)}</td><td>${escapeHtml(m.rubro)}</td><td>${dinero(m.monto)}</td><td>${escapeHtml(m.detalle)}</td><td>${escapeHtml(m.documento)}</td><td>${m.credito_validado ? dinero(m.iva_credito) : 'Pendiente'}</td><td>${m.anulado_at ? `Anulado: ${escapeHtml(m.motivo_anulacion)}` : `<form class="anular-movimiento" data-id="${m.id}"><input name="motivo" required minlength="5" placeholder="Motivo"><button type="submit">Anular</button></form>`}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">Aún no hay movimientos de caja.</p>';
}

async function cargar() {
  datos = await api('/api/datos');
  $('#servicio').innerHTML = Object.entries(datos.servicios).map(([key, v]) => `<option value="${key}">${escapeHtml(v.nombre)} · ${dinero(v.bruto)}</option>`).join('');
  $('#categoria').innerHTML = Object.entries(datos.categorias).map(([key, v]) => `<option value="${key}">${escapeHtml(v.nombre)} · recargo ${(v.recargo * 100).toFixed(0)}%</option>`).join('');
  mostrarTrabajos(); mostrarMovimientos(); previsualizar();
}

async function refrescar() {
  datos = await api('/api/datos');
  mostrarTrabajos(); mostrarMovimientos();
}

async function cargarMes() {
  const mes = $('#mes-input').value;
  if (!mes) return;
  try {
    const r = await api(`/api/resumen?mes=${encodeURIComponent(mes)}`);
    const campos = [
      ['Servicios documentados', r.servicioBruto], ['Piezas documentadas', r.piezaBruta],
      ['Ventas documentadas', r.ventaBruta], ['IVA débito estimado', r.ivaDebitoEstimado],
      ['IVA crédito revisado', r.ivaCreditoDocumentado], ['Diferencia IVA estimada', r.diferenciaIvaEstimada],
      ['IVA importación pagado', r.ivaImportacionPagado], ['Aranceles pagados', r.aranceles],
      ['Cobros recibidos', r.cobros], ['Egresos pagados', r.egresos],
    ];
    $('#resumen').innerHTML = campos.map(([nombre, monto]) => `<div class="metric"><span>${nombre}</span><strong>${dinero(monto)}</strong></div>`).join('');
    $('#pendientes').innerHTML = `<h3>Para resolver este mes</h3><p>Órdenes entregadas sin folio: <b>${r.ordenesSinDocumento.length ? r.ordenesSinDocumento.map(id => 'OT-' + id).join(', ') : 'ninguna'}</b></p><p>Compras del mes sin respaldo o revisión de crédito: <b>${r.comprasPorRevisar.length ? r.comprasPorRevisar.join(', ') : 'ninguna'}</b></p><p>Conciliar con el Registro de Compras y Ventas y F29 antes de declarar. El anticipo cobrado y la fecha de emisión del DTE pueden caer en meses distintos; este cálculo no resuelve el devengo tributario.</p>`;
    $('#descargar-resumen').href = `/exportar/resumen.csv?mes=${encodeURIComponent(mes)}`;
    $('#descargar-movimientos').href = `/exportar/movimientos.csv?mes=${encodeURIComponent(mes)}`;
  } catch (e) { aviso(e.message); }
}

document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => abrirTab(b.dataset.tab)));
$('#form-orden').addEventListener('input', previsualizar);
$('#form-orden').addEventListener('change', previsualizar);
$('#form-orden').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const result = await api('/api/ordenes', enviar(camposCotizacion()));
    await refrescar(); $('#form-orden').reset(); previsualizar(); abrirTab('trabajos'); aviso(`Orden OT-${result.id} creada.`);
  } catch (e) { aviso(e.message); }
});
$('#form-movimiento').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const value = valores(event.target);
    value.creditoValidado = event.target.elements.creditoValidado.checked;
    await api('/api/movimientos', enviar(value));
    await refrescar(); event.target.reset(); event.target.elements.fecha.value = hoy; aviso('Movimiento registrado.');
  } catch (e) { aviso(e.message); }
});
$('#lista-trabajos').addEventListener('submit', async event => {
  if (!event.target.matches('.actualizar-orden')) return;
  event.preventDefault();
  try {
    const id = event.target.dataset.id;
    await api(`/api/ordenes/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(valores(event.target)) });
    await refrescar(); aviso(`Orden OT-${id} actualizada.`);
  } catch (e) { aviso(e.message); }
});
$('#lista-movimientos').addEventListener('submit', async event => {
  if (!event.target.matches('.anular-movimiento')) return;
  event.preventDefault();
  try {
    await api(`/api/movimientos/${event.target.dataset.id}/anular`, enviar(valores(event.target)));
    await refrescar(); aviso('Movimiento anulado con registro del motivo.');
  } catch (e) { aviso(e.message); }
});
$('#mes-input').addEventListener('change', cargarMes);
$('#form-movimiento').elements.fecha.value = hoy;
$('#mes-input').value = hoy.slice(0, 7);
cargar().catch(e => aviso(e.message));
