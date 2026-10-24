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
  document.querySelectorAll('nav button').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
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

const estadosOrden = { cotizando: 'Cotizando', esperando_anticipo: 'Esperando anticipo', pieza_pedida: 'Pieza pedida', pieza_recibida: 'Pieza recibida', reparando: 'Reparando', listo: 'Listo para entregar', entregado: 'Entregado', cancelado: 'Cancelado' };
const pasosOrden = { cotizando: 'Preparar cotización para el cliente', esperando_anticipo: 'Confirmar anticipo antes de pedir', pieza_pedida: 'Seguir pedido y confirmar recepción', pieza_recibida: 'Preparar equipo para reparación', reparando: 'Completar reparación y pruebas', listo: 'Coordinar entrega con el cliente', entregado: 'Revisar respaldo y cierre', cancelado: 'Conservar antecedentes de la orden' };

function tarjetaOrden(o) {
  return `<article class="job-card status-${escapeHtml(o.estado)}"><div class="job-top"><span class="order-id">OT-${o.id}</span><span class="job-status">${estadosOrden[o.estado] || escapeHtml(o.estado)}</span></div><h3>${escapeHtml(o.equipo)}</h3><p class="job-client">${escapeHtml(o.cliente)}</p><p class="job-service">${escapeHtml(datos.servicios[o.servicio]?.nombre || o.servicio)}</p><div class="job-total"><span>Total cotizado</span><strong>${dinero(o.cotizacion.bruto)}</strong></div><p class="next-step"><span>PRÓXIMO PASO</span>${pasosOrden[o.estado] || 'Revisar orden'}</p><details class="job-details"><summary>Gestionar orden <span aria-hidden="true">＋</span></summary><div class="job-context"><p>${escapeHtml(o.falla) || 'Sin falla registrada'}${o.agenda_id ? ` · Cita #${o.agenda_id}` : ''}</p><p>Pieza neta: ${dinero(o.cotizacion.piezaNeta)}<br>Anticipo sugerido de pieza: ${dinero(Math.round(o.cotizacion.piezaNeta * 1.19))}<br>Costo estimado: ${dinero(o.cotizacion.costoComercial)}<br>Costo registrado provisional: ${o.costoRealProvisional == null ? 'pendiente' : dinero(o.costoRealProvisional)}</p>${o.proveedor ? `<p>Proveedor: ${escapeHtml(o.proveedor)}</p>` : ''}${o.vigencia ? `<p>Vigencia: ${escapeHtml(o.vigencia)}</p>` : ''}</div><form class="actualizar-orden" data-id="${o.id}"><label>Estado<select name="estado">${Object.entries(estadosOrden).map(([e, label]) => `<option value="${e}" ${e === o.estado ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>Folio DTE<input name="folio" value="${escapeHtml(o.folio)}"></label><label>Fecha DTE<input name="fechaDocumento" type="date" value="${escapeHtml(o.fecha_documento)}"></label><label>Servicio en DTE, bruto<input name="servicioDocumento" type="number" min="0" value="${o.servicio_documento ?? o.cotizacion.servicioBruto}"></label><label>Pieza en DTE, bruto<input name="piezaDocumento" type="number" min="0" value="${o.pieza_documento ?? o.cotizacion.bruto - o.cotizacion.servicioBruto}"></label><button class="primary" type="submit">Guardar cambios</button></form></details></article>`;
}

function mostrarTablero() {
  const query = $('#buscar-trabajos').value.trim().toLocaleLowerCase('es');
  const ordenes = datos.ordenes.filter(o => `OT-${o.id} ${o.cliente} ${o.equipo} ${o.falla || ''}`.toLocaleLowerCase('es').includes(query));
  const etapas = [ ['Cotizar', ['cotizando', 'esperando_anticipo'], 'Precio y aprobación'], ['Pieza en camino', ['pieza_pedida'], 'Seguimiento de pedidos'], ['En taller', ['pieza_recibida', 'reparando'], 'Reparación y pruebas'], ['Listo', ['listo'], 'Coordinar la entrega'] ];
  const abiertas = [...document.querySelectorAll('.job-details[open]')].map(d => d.querySelector('form').dataset.id);
  const cerradasAbiertas = $('.closed-orders')?.open;
  $('#lista-trabajos').innerHTML = `<div class="kanban" aria-label="Órdenes por etapa">${etapas.map(([nombre, estados, descripcion], i) => { const items = ordenes.filter(o => estados.includes(o.estado)); return `<section class="lane lane-${i}"><div class="lane-head"><span class="lane-number">0${i + 1}</span><h3>${nombre}</h3><span class="lane-count">${items.length}</span><p>${descripcion}</p></div><div class="lane-body">${items.length ? items.map(tarjetaOrden).join('') : `<div class="lane-empty"><span aria-hidden="true">${['↗','↝','⌘','✓'][i]}</span><p>${query ? 'Sin coincidencias en esta etapa' : ['Aquí comienza el próximo trabajo', 'Sin piezas pendientes de recibir', 'El banco de trabajo está libre', 'Los próximos equipos listos aparecerán aquí'][i]}</p></div>`}</div></section>`; }).join('')}</div><details class="closed-orders" ${cerradasAbiertas ? 'open' : ''}><summary>Archivo del taller <span>${ordenes.filter(o => ['entregado','cancelado'].includes(o.estado)).length} entregadas o canceladas</span></summary><div class="closed-grid">${ordenes.filter(o => ['entregado','cancelado'].includes(o.estado)).map(tarjetaOrden).join('') || '<p class="empty">Todavía no hay órdenes cerradas.</p>'}</div></details>`;
  document.querySelectorAll('.job-details').forEach(d => { d.open = abiertas.includes(d.querySelector('form').dataset.id); });
}

function mostrarTrabajos() {
  const metricas = [
    ['En curso', datos.ordenes.filter(o => !['listo', 'entregado', 'cancelado'].includes(o.estado)).length, 'Órdenes activas, desde cotización'],
    ['Esperando pieza', datos.ordenes.filter(o => o.estado === 'pieza_pedida').length, 'Pedidos pendientes de recibir'],
    ['Listos para entregar', datos.ordenes.filter(o => o.estado === 'listo').length, 'Equipos con trabajo terminado'],
    ['Citas vinculadas', datos.ordenes.filter(o => o.agenda_id).length, 'Órdenes con ID de agenda'],
  ];
  $('#taller-metricas').innerHTML = metricas.map(([nombre, cantidad, detalle], i) => `<article class="taller-metric"><span class="metric-index" aria-hidden="true">0${i + 1} /</span><span>${nombre}</span><strong>${cantidad}</strong><small>${detalle}</small></article>`).join('');
  $('#cuenta-trabajos').textContent = `${datos.ordenes.length} orden${datos.ordenes.length === 1 ? '' : 'es'}`;
  $('#orden-movimiento').innerHTML = '<option value="">Gasto general</option>' + datos.ordenes.map(o => `<option value="${o.id}">OT-${o.id} · ${escapeHtml(o.cliente)} · ${escapeHtml(o.equipo)}</option>`).join('');
  mostrarTablero();
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

$('#buscar-trabajos').addEventListener('input', mostrarTablero);
document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => abrirTab(b.dataset.tab)));
document.querySelectorAll('[data-open-tab]').forEach(b => b.addEventListener('click', () => {
  abrirTab(b.dataset.openTab);
  const titulo = $(`#${b.dataset.openTab} h2`);
  titulo.setAttribute('tabindex', '-1');
  titulo.focus();
}));
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
