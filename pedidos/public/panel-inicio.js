// Panel: autoservicio del local. Primeros pasos en dos niveles (con su avance), importar la carta
// desde una planilla (Excel/CSV) con vista previa, y ayudas cortas en cada pestaña.
// Las utilidades llegan desde el panel (ctx) para no cargar comun.js dos veces.
export function crearInicioUI(ctx) {
  const { $, ico, toast, api, clp, esc, fmtTel, BASE, aWebp, tablaHorario, DIAS, BANCOS, TIPOS, rutFormato, rutValido, carta, alCambiar, puede } = ctx;
  const guardado = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch {} return null; };
  let E = null, pasoActual = null;

  // ---------- ayudas por pestaña ----------
  const AYUDAS = {
    pedidos: ['Los pedidos de la carta web llegan aquí ordenados por hora de retiro. Avánzalos con el botón grande: Nuevo → En preparación → Listo → Entregado.',
      'Activa la campana para oír los pedidos nuevos. Mientras el panel está abierto, la tablet no apaga la pantalla.',
      'Si se llenan, usa "Recibiendo pedidos web" (arriba) para pausar la carta un rato.'],
    venta: ['Para ventas en el mesón: toca los productos, luego Cobrar y elige cómo pagó.',
      'Con "Enviar a cocina" se imprime la comanda y el pedido aparece en Pedidos.'],
    cierre: ['1. Al abrir: cuenta el sencillo de la caja y anótalo en "Fondo inicial" (botón anotar).',
      '2. Durante el turno: una compra o pago con plata de la caja es un Gasto; plata que se lleva el dueño o se deposita es un Retiro; sencillo que se agrega es un Ingreso.',
      '3. Al cerrar: cuenta billetes y monedas, escribe el total en "Efectivo contado" y toca Cerrar caja.',
      '4. La diferencia compara lo contado con lo que "Debería haber en caja". Si falta, salió plata sin anotar o hubo un error de vuelto; si sobra, falta anotar un ingreso o se cobró de más. Deja el motivo en la nota.',
      'Si cambia quien atiende la caja, usa "Entregar la caja": cuenta, anota y el día sigue abierto. Para gastos chicos, usa los botones de Gasto rápido.'],
    gastos: ['Anota cada pago del local (insumos, gas, arriendo, sueldos): elige la categoría y cómo se pagó.',
      'Los pagados en efectivo se descuentan de la caja del día; transferencia o tarjeta solo quedan anotados. Si te equivocas, usa Anular.',
      'Con ellos se arma el estado de resultados del mes.'],
    resumen: ['Los números de la semana: pedidos, ticket promedio, horas peak, clientes que repiten y la comisión que te ahorraste frente a la app.',
      'Al final están los archivos para el contador.'],
    resultados: ['Ventas del mes menos insumos, gastos y sueldos estimados: lo que realmente queda.',
      'Para que sea exacto, carga el costo de cada producto en Carta y precios (filtro "Sin costo").'],
    carta: ['Los cambios se guardan solos y se ven al instante en la carta. Toca un precio para cambiarlo.',
      '"Disponible" apaga un producto agotado sin borrarlo. Para la foto, toca el cuadro de la izquierda.',
      'Para cargar o actualizar muchos precios de una vez, usa "Importar planilla".'],
    despacho: ['Activa el despacho y elige un precio único o por zonas. Toca un hexágono del mapa para cambiarle el precio o bloquearlo.',
      '"¿Sale a cuenta?" calcula lo que te cuesta cada viaje con tu vehículo.'],
    equipo: ['Trabajadores, turnos y sueldo estimado según la ley chilena (la liquidación la hace tu contador).',
      'Para que alguien entre al panel con PIN, créalo en Datos del local → Usuarios y PIN.'],
    local: ['Lo que ve el cliente: contacto, horario, transferencias, datos legales y logo. Guarda con el botón de abajo.',
      'Aquí también están tu plan y los usuarios con PIN del equipo.'],
  };
  function ayuda(vista) {
    const el = $('ayudaTab'), txt = AYUDAS[vista];
    if (!txt) { el.hidden = true; return; }
    // En Caja del día la ayuda empieza plegada (se abre con "¿Cómo funciona?").
    const cerrada = vista === 'cierre' ? guardado(`ayuda-${vista}`) !== '1' : guardado(`ayuda-${vista}`) === '0';
    el.hidden = false;
    el.innerHTML = `<details class="ayudatab" ${cerrada ? '' : 'open'}><summary>${ico('note')}Cómo funciona esta pestaña</summary>
      <ul>${txt.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      ${vista === 'local' && E?.cerrado && puede('local') ? '<p><button type="button" class="ghostb" data-inicio-abrir>Ver los primeros pasos</button></p>' : ''}</details>`;
    el.querySelector('details').ontoggle = (e) => guardado(`ayuda-${vista}`, e.target.open ? '1' : '0');
  }

  // ---------- primeros pasos ----------
  async function cargar() {
    if (!puede('local')) { $('inicio').hidden = true; return; }
    E = await api('panel/inicio');
    pintar();
  }
  // Pasos que se completan en un diálogo propio; el resto lleva a su pestaña (campo `ir`).
  const CON_DIALOGO = new Set(['contacto', 'horario', 'transferencias', 'producto', 'logo']);
  const enPausa = () => $('pausa').getAttribute('aria-pressed') === 'true';
  const listo = (p) => p.hecho || p.omitido;
  // Lleva a la pestaña (y sección) donde se completa algo: "local#s-legal", "despacho"…
  function irA(ir) {
    const [v, sec] = String(ir || '').split('#');
    const tab = document.querySelector(`[data-v="${v}"]`);
    if (!tab || tab.hidden) return;
    if ($('dlgInicio').open) $('dlgInicio').close();
    tab.click();
    if (!sec) { scrollTo({ top: 0, behavior: 'smooth' }); return; }
    let n = 0;
    const buscar = () => { const el = $(sec); if (el?.tagName === 'DETAILS') el.open = true; if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); else if (n++ < 20) setTimeout(buscar, 100); };
    buscar();
  }
  const lista = (ps, sig) => `<ol class="ini-pasos">${ps.map((p) => `<li class="${listo(p) ? (p.hecho ? 'ok' : 'omit') : ''} ${p.id === sig?.id ? 'sig' : ''}">
    <span class="ini-ico" aria-hidden="true">${p.hecho ? ico('check') : p.omitido ? '–' : ''}</span>
    <span class="ini-t"><b>${esc(p.titulo)}</b><small>${p.no_aplica ? 'No aplica: sin despacho' : p.hecho ? 'Listo' : p.omitido ? 'Omitido' : esc(p.detalle)}</small></span>
    <button type="button" class="${p.id === sig?.id ? 'primary chico' : 'ghostb'}" data-paso="${p.id}">${p.hecho ? 'Revisar' : p.omitido ? 'Retomar' : 'Completar'}</button></li>`).join('')}</ol>`;
  function pintar() {
    const el = $('inicio');
    if (!E) { el.hidden = true; return; }
    const R = E.niveles.recibir, C = E.niveles.controlar;
    const falta = E.pasos.filter((p) => p.nivel === 'recibir' && !listo(p));
    // Asistente cerrado (o local armado antes de él): solo el aviso de lo mínimo que falte.
    if (E.cerrado) {
      el.hidden = !falta.length;
      if (falta.length) el.innerHTML = `<p class="nota">⚠️ <span><b>${E.publicado ? 'Tu carta recibe pedidos, pero falta' : 'Para abrir tu carta falta'}:</b>
        ${falta.map((p) => `<button type="button" class="link" data-ir-a="${esc(p.ir)}">${esc(p.titulo)}</button>`).join(' · ')}</span></p>`;
      return;
    }
    el.hidden = false;
    const min = guardado('inicio-min') === '1' && !E.mision_completa, pct = Math.round((E.puntos / E.puntos_total) * 100);
    const barra = `<div class="ini-barra" role="progressbar" aria-valuemin="0" aria-valuemax="${E.puntos_total}" aria-valuenow="${E.puntos}" aria-label="Avance de la misión"><span style="width:${pct}%"></span></div>`;
    if (E.mision_completa) {
      const slug = carta()?.local?.slug || '';
      el.innerHTML = `<section class="cardf ini listo"><header class="sh"><h3>${ico('check')}¡Misión cumplida!</h3><span class="sp"></span><b class="ini-puntos">${E.puntos} puntos</b></header>${barra}
        ${enPausa() ? '<p class="ayuda"><b>Tu carta todavía está en pausa: los clientes la ven pero no pueden pedir.</b> Revísala, haz un pedido de ensayo y ábrela cuando quieras.</p><p><button type="button" class="primary" data-ini-abrir>Abrir mi carta a los clientes</button></p>' : ''}
        <p class="ayuda">Tu configuración y tu primera operación están verificadas. Puedes volver a revisar cualquier dato desde su pestaña.</p>
        <div class="ini-acc"><a class="ghostb fuerte" href="${BASE}/${esc(slug)}" target="_blank">Ver mi carta</a><a class="ghostb" href="cartel" target="_blank">Cartel y tarjetas con QR</a>
        <span class="sp"></span><button type="button" class="primary chico" data-ini-cerrar>Terminar</button></div></section>`;
      return;
    }
    if (min) {
      el.innerHTML = `<section class="cardf ini mini"><b>Misión de lanzamiento</b><span class="num">${E.puntos} pts</span>${barra}<button type="button" class="ghostb fuerte" data-ini-min="0">Continuar</button></section>`;
      return;
    }
    const sig = E.siguiente;
    const abrir = R.completo && enPausa() ? '<p class="ayuda"><b>Ya puedes recibir pedidos.</b> Tu carta sigue en pausa hasta que la abras.</p><p><button type="button" class="primary" data-ini-abrir>Abrir mi carta a los clientes</button></p>' : '';
    const etapa = (id) => {
      const x = E.etapas[id];
      const ps = id === 'probar' ? [E.hito_operativo] : E.pasos.filter((p) => p.etapa === id);
      return `<section class="ini-etapa ${x.completo ? 'completa' : ''}" aria-labelledby="ini-et-${id}"><header><span class="ini-num" aria-hidden="true">${x.orden}</span><span><h4 id="ini-et-${id}">${esc(x.titulo)}</h4><small>${esc(x.detalle)}</small></span><b>${x.hechos}/${x.total}</b></header>${lista(ps, sig)}</section>`;
    };
    el.innerHTML = `<section class="cardf ini ini-mision"><header class="sh"><div><p class="ini-kicker">MISIÓN DE LANZAMIENTO</p><h3>Deja tu primer pedido funcionando</h3></div><span class="sp"></span>
        <b class="ini-puntos">${E.puntos} puntos</b><button type="button" class="link" data-ini-min="1" aria-label="Ocultar misión">Ocultar</button></header>${barra}
      ${sig ? `<aside class="ini-siguiente" aria-label="Siguiente paso"><div><small>SIGUIENTE PASO · +${sig.puntos || 0} PTS</small><b>${esc(sig.titulo)}</b><span>${esc(sig.detalle)}</span></div><button type="button" class="primary" ${sig.id === 'primera_operacion' ? `data-ir-a="${esc(sig.ir)}"` : `data-paso="${esc(sig.id)}"`}>Empezar</button></aside>` : ''}
      <div class="ini-etapas">${['preparar', 'configurar', 'probar', 'operar'].map(etapa).join('')}</div>
      <section class="ini-publicar ${R.completo ? 'ok' : ''}"><b>${R.completo ? '✓ Sin bloqueantes para publicar' : `${E.bloqueantes.length} bloqueante${E.bloqueantes.length === 1 ? '' : 's'} para publicar`}</b>
        <span>${R.completo ? 'Las mejoras restantes no impiden abrir tu carta.' : 'Completa los pasos obligatorios marcados antes de abrir la carta.'}</span></section>
      ${abrir}<p class="ayuda ini-opcional"><b>Mejoras opcionales:</b> ${E.mejoras.length ? `${E.mejoras.length} pendientes. Mejoran costos y control, pero no bloquean la publicación.` : 'listas.'}</p></section>`;
  }
  // La carta no se abrió: el servidor dice qué falta (409). Se muestra con enlaces a cada pestaña.
  function mostrarFaltan(faltan, msg) {
    hoja('Antes de abrir tu carta', `<p class="ayuda top">${esc(msg || 'Para recibir pedidos por la web falta completar:')}</p>
      <ol class="ini-pasos">${faltan.map((f) => `<li><span class="ini-ico" aria-hidden="true"></span><span class="ini-t"><b>${esc(f.titulo)}</b><small>${esc(f.detalle || '')}</small></span>
        <button type="button" class="primary chico" data-ir-a="${esc(f.ir)}">Completar</button></li>`).join('')}</ol>`, {});
  }
  document.addEventListener('click', async (e) => {
    const ir = e.target.closest('[data-ir-a]');
    if (ir) { irA(ir.dataset.irA); return; }
    const ab = e.target.closest('[data-ini-abrir]');
    if (ab) { $('pausa').click(); setTimeout(() => cargar().catch(() => {}), 600); return; }
    const t = e.target.closest('[data-ini-min], [data-ini-cerrar], [data-inicio-abrir], [data-paso]');
    if (!t) return;
    try {
      if (t.dataset.iniMin) { guardado('inicio-min', t.dataset.iniMin); pintar(); }
      else if (t.matches('[data-ini-cerrar]')) { E = await api('panel/inicio', { method: 'PATCH', body: { cerrado: true } }); pintar(); toast('Listo. Las ayudas siguen en cada pestaña.'); }
      else if (t.matches('[data-inicio-abrir]')) { guardado('inicio-min', '0'); E = await api('panel/inicio', { method: 'PATCH', body: { cerrado: false } }); pintar(); scrollTo({ top: 0, behavior: 'smooth' }); }
      else if (t.dataset.paso === 'primera_operacion') irA(E.hito_operativo.ir);
      else if (CON_DIALOGO.has(t.dataset.paso)) abrirPaso(t.dataset.paso);
      else irA(E.pasos.find((p) => p.id === t.dataset.paso)?.ir);
    } catch (err) { alert(err.message); }
  });

  const campo = (id, label, val, extra = '', nota = '') => `<div class="field"><label for="${id}">${label}</label><input id="${id}" value="${esc(val ?? '')}" ${extra}>${nota ? `<p class="ayuda">${nota}</p>` : ''}</div>`;
  const dlg = () => $('dlgInicio');
  // Arma el diálogo de un paso. `ok` guarda y devuelve true si se puede cerrar.
  function hoja(titulo, cuerpo, { ok, okTxt = 'Guardar', omitir } = {}) {
    $('inTitulo').textContent = titulo;
    $('inBody').innerHTML = cuerpo + '<div class="formerr" id="inErr" role="alert"></div>';
    $('inOmitir').hidden = !omitir; $('inOmitir').textContent = omitir || '';
    $('inOk').hidden = !ok; $('inOk').textContent = okTxt;
    const correr = async (fn) => {
      $('inErr').textContent = ''; $('inOk').disabled = true;
      try { if (await fn()) { dlg().close(); await alCambiar(); await cargar(); } } catch (err) { $('inErr').textContent = err.message; }
      $('inOk').disabled = false;
    };
    $('inOk').onclick = () => correr(ok);
    $('inOmitir').onclick = () => correr(async () => { E = await api('panel/inicio', { method: 'PATCH', body: { omitir: pasoActual } }); return true; });
    if (!dlg().open) dlg().showModal();
  }
  const patchLocal = (body) => api('panel/local', { method: 'PATCH', body });
  const v = (id) => $(id).value;

  function abrirPaso(id) {
    const L = carta().local, paso = E.pasos.find((p) => p.id === id);
    pasoActual = id;
    if (paso.omitido) { api('panel/inicio', { method: 'PATCH', body: { retomar: id } }).then((r) => { E = r; pintar(); }).catch((e) => alert(e.message)); }
    if (id === 'contacto') hoja(paso.titulo, `<p class="ayuda top">Lo que el cliente ve en la portada de la carta y en el seguimiento de su pedido. Con un WhatsApp o un teléfono basta.</p>
      ${campo('in-whatsapp', 'WhatsApp para pedidos', fmtTel(L.whatsapp), 'type="tel" inputmode="tel" placeholder="+56 9 1234 5678"')}
      ${campo('in-telefono', 'Teléfono para llamadas (opcional)', fmtTel(L.telefono), 'type="tel" inputmode="tel" placeholder="+56 9 1234 5678"')}
      ${campo('in-direccion', 'Dirección del local', L.direccion, 'maxlength="120" placeholder="Calle 123, Concepción" autocomplete="street-address"', 'Para que el cliente sepa dónde retirar.')}
      ${campo('in-instagram', 'Instagram (opcional)', L.instagram ? '@' + L.instagram : '', 'placeholder="@tulocal" autocapitalize="off"')}`, { ok: async () => {
      if (!v('in-whatsapp').trim() && !v('in-telefono').trim()) throw new Error('Escribe un WhatsApp o un teléfono.');
      if (!v('in-direccion').trim()) throw new Error('Escribe la dirección del local.');
      await patchLocal({ whatsapp: v('in-whatsapp'), telefono: v('in-telefono'), direccion: v('in-direccion'), instagram: v('in-instagram') });
      toast('✓ Contacto guardado'); return true;
    } });
    else if (id === 'horario') {
      hoja(paso.titulo, `<p class="ayuda top">Marca los días que abres y las horas. La carta solo ofrece horas de retiro dentro de este horario.</p>
        <p><button type="button" class="ghostb" id="in-copiar">Copiar el lunes a todos</button></p>${tablaHorario('i', L.horario)}
        <p class="ayuda">Si cierras después de medianoche (ej. 02:00) cuenta como la madrugada siguiente. El despacho tiene su propio horario en la pestaña Despacho.</p>
        ${paso.hecho ? '' : '<label class="ayuda" style="display:flex;gap:8px;align-items:center;min-height:44px"><input type="checkbox" id="in-hrev" style="width:22px;height:22px"> Revisé cada día: el horario viene de ejemplo (12:00 a 22:00).</label>'}`, { ok: async () => {
        const q = (s) => $('inBody').querySelector(s);
        const horario = Object.fromEntries(DIAS.map(([d]) => [d, q(`[data-iabre="${d}"]`).checked ? [q(`[data-idesde="${d}"]`).value, q(`[data-ihasta="${d}"]`).value] : null]));
        if (!Object.values(horario).some(Boolean)) throw new Error('Marca al menos un día de atención.');
        if (!paso.hecho && !q('#in-hrev').checked) throw new Error('Revisa los días y horas y marca la casilla: el horario viene de ejemplo.');
        await patchLocal({ horario }); toast('✓ Horario guardado'); return true;
      } });
      const q = (s) => $('inBody').querySelector(s);
      $('inBody').querySelectorAll('[data-iabre]').forEach((c) => c.onchange = () => { for (const k of ['desde', 'hasta']) q(`[data-i${k}="${c.dataset.iabre}"]`).disabled = !c.checked; });
      $('in-copiar').onclick = () => DIAS.forEach(([d]) => { for (const k of ['abre', 'desde', 'hasta']) { const x = q(`[data-i${k}="${d}"]`), y = q(`[data-i${k}="1"]`); if (k === 'abre') x.checked = y.checked; else { x.value = y.value; x.disabled = !q('[data-iabre="1"]').checked; } } });
    } else if (id === 'logo') {
      hoja(paso.titulo, `<p class="ayuda top">Ideal: PNG con fondo transparente. Si no tienes, la carta muestra la inicial del nombre y puedes subirlo después en Datos del local.</p>
        ${L.logo ? `<div class="logo-prev"><div class="lp claro"><img src="${esc(L.logo)}" alt="Logo actual"></div></div>` : ''}
        <label class="ghostb fuerte" style="margin-top:12px">${L.logo ? 'Cambiar logo' : 'Elegir imagen'}<input type="file" accept="image/*" hidden id="in-logo"></label>`, { omitir: L.logo ? null : 'No tengo logo' });
      $('in-logo').onchange = async (e) => {
        const lbl = e.target.closest('label'); lbl.firstChild.textContent = 'Subiendo…';
        try {
          const r = await fetch(`${BASE}/api/panel/local/logo`, { method: 'PUT', headers: { 'Content-Type': 'image/webp' }, body: await aWebp(e.target.files[0], { contener: true }) });
          if (!r.ok) throw new Error((await r.json()).error);
          toast('✓ Logo guardado'); dlg().close(); await alCambiar(); await cargar();
        } catch (err) { $('inErr').textContent = err.message; lbl.firstChild.textContent = 'Elegir imagen'; }
      };
    } else if (id === 'transferencias') {
      const t = L.transferencia || {};
      hoja(paso.titulo, `<p class="ayuda top">El cliente los ve al pagar y en el seguimiento, con un botón para copiar el número.</p>
        <div class="dos">${campo('in-titular', 'Titular de la cuenta', t.titular, 'maxlength="80" autocomplete="off"')}
        ${campo('in-rut', 'RUT del titular', t.rut, 'maxlength="12" placeholder="12.345.678-9" autocomplete="off"')}
        ${campo('in-banco', 'Banco', t.banco, 'maxlength="40" list="in-bancos" placeholder="Elige o escribe" autocomplete="off"')}
        <div class="field"><label for="in-tipo">Tipo de cuenta</label><select id="in-tipo"><option value="">Elegir…</option>${TIPOS.map((x) => `<option ${t.tipo === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
        ${campo('in-numero', 'Número de cuenta', t.numero, 'maxlength="30" inputmode="numeric" autocomplete="off"')}
        ${campo('in-email', 'Correo para el comprobante', t.email, 'type="email" maxlength="80" autocomplete="off"')}</div>
        <datalist id="in-bancos">${BANCOS.map((b) => `<option value="${b}">`).join('')}</datalist>`, { omitir: 'No recibo transferencias', ok: async () => {
        for (const [k, n] of [['in-titular', 'el titular'], ['in-banco', 'el banco'], ['in-numero', 'el número de cuenta']]) if (!v(k).trim()) throw new Error(`Falta ${n}.`);
        if (v('in-rut') && !rutValido(v('in-rut'))) throw new Error('Revisa el RUT: el dígito verificador no coincide.');
        await patchLocal({ transferencia: { titular: v('in-titular'), rut: v('in-rut') ? rutFormato(v('in-rut')) : '', banco: v('in-banco'), tipo: v('in-tipo'), numero: v('in-numero'), email: v('in-email') } });
        toast('✓ Datos de transferencia guardados'); return true;
      } });
      $('in-rut').onblur = (e) => { e.target.value = rutFormato(e.target.value); };
    } else if (id === 'producto') {
      const cats = carta().categorias;
      hoja(paso.titulo, `<p class="ayuda top">¿Tienes la carta en Excel o Google Sheets? <button type="button" class="ghostb fuerte" id="in-planilla">Importar la carta desde una planilla</button></p>
        <p class="ayuda">O agrega un producto a mano (después puedes sumar más en Carta y precios):</p>
        ${campo('in-cat', 'Categoría', cats.length === 1 && !cats[0].productos.length ? '' : cats[0]?.nombre || '', 'maxlength="40" list="in-cats" placeholder="Ej: Sándwiches"')}
        <datalist id="in-cats">${cats.map((c) => `<option value="${esc(c.nombre)}">`).join('')}</datalist>
        <div class="dos">${campo('in-nombre', 'Producto', '', 'maxlength="80" placeholder="Ej: Churrasco italiano"')}
        ${campo('in-precio', 'Precio', '', 'inputmode="numeric" placeholder="$4.500"')}</div>
        ${campo('in-desc', 'Descripción (opcional)', '', 'maxlength="200" placeholder="Ej: Palta, tomate y mayo casera"')}`, { okTxt: 'Agregar producto', ok: async () => {
        if (!v('in-precio').trim()) throw new Error('Ponle precio: los productos sin precio no se venden.');
        const body = { modo: 'agregar', filas: [{ categoria: v('in-cat'), nombre: v('in-nombre'), precio: v('in-precio'), descripcion: v('in-desc') }] };
        const r = await api('panel/importar', { method: 'POST', body });
        if (r.errores) throw new Error(r.filas[0].error);
        await api('panel/importar', { method: 'POST', body: { ...body, confirmar: true } });
        toast('✓ Producto agregado'); return true;
      } });
      $('in-planilla').onclick = () => { dlg().close(); abrirImportar(); };
    }
  }

  // ---------- importar la carta desde una planilla ----------
  const EJEMPLO = 'Categoría;Producto;Precio;Descripción\nSándwiches;Churrasco italiano;6500;Palta, tomate y mayo casera\nSándwiches;Barros Luco;6200;Carne y queso fundido\nBebidas;Bebida lata 350 cc;1500;\n';
  let previa = null;
  function abrirImportar() {
    const d = $('dlgImportar');
    previa = null;
    $('imBody').innerHTML = `<p class="ayuda top">En Excel o Google Sheets, selecciona las celdas de tu carta, cópialas (Ctrl+C) y pégalas aquí (Ctrl+V). Columnas, en este orden o con títulos:
        <b>Categoría · Producto · Precio · Descripción</b>. Si la categoría se repite, puedes dejarla vacía en las filas siguientes.</p>
      <div class="field"><label for="imTexto">Planilla</label><textarea id="imTexto" rows="7" spellcheck="false" placeholder="Sándwiches&#9;Churrasco italiano&#9;6500&#9;Palta, tomate y mayo"></textarea></div>
      <p class="im-arch"><label class="ghostb">O elige un archivo CSV<input type="file" accept=".csv,.tsv,.txt,text/csv" hidden id="imArchivo"></label>
        <a class="link" download="carta-ejemplo.csv" href="data:text/csv;charset=utf-8,${encodeURIComponent('﻿' + EJEMPLO)}">Descargar planilla de ejemplo</a></p>
      <fieldset class="im-modo"><legend>¿Qué hacer con la carta actual?</legend>
        <label class="ck"><input type="radio" name="imModo" value="agregar" checked> <span><b>Agregar</b> · los productos que ya existen (misma categoría y nombre) solo cambian precio y descripción; se mantienen sus fotos</span></label>
        <label class="ck"><input type="radio" name="imModo" value="reemplazar"> <span><b>Reemplazar</b> · lo que no esté en la planilla sale de la carta (queda archivado, los pedidos antiguos no se tocan)</span></label></fieldset>
      <div id="imPrevia"></div><div class="formerr" id="imErr" role="alert"></div>`;
    const sucio = () => { previa = null; $('imOk').textContent = 'Revisar'; $('imPrevia').innerHTML = ''; };
    $('imTexto').oninput = sucio;
    $('imBody').querySelectorAll('[name=imModo]').forEach((r) => r.onchange = sucio);
    $('imArchivo').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      if (/\.xlsx?$/i.test(f.name)) { $('imErr').textContent = 'Ese es un archivo de Excel: ábrelo, copia las celdas y pégalas arriba, o guárdalo como "CSV UTF-8".'; return; }
      $('imTexto').value = await f.text(); sucio(); revisar();
    };
    $('imOk').textContent = 'Revisar';
    $('imOk').onclick = () => (previa ? confirmar() : revisar());
    if (!d.open) d.showModal();
    $('imTexto').focus();
  }
  const cuerpoIm = (confirmar) => ({ texto: $('imTexto').value, modo: $('dlgImportar').querySelector('[name=imModo]:checked').value, confirmar });
  async function revisar() {
    $('imErr').textContent = ''; $('imOk').disabled = true;
    try {
      const r = await api('panel/importar', { method: 'POST', body: cuerpoIm(false) });
      pintarPrevia(r);
      previa = r.errores || !r.filas.length ? null : r;
      $('imOk').textContent = previa ? `Importar ${r.filas.length} producto${r.filas.length > 1 ? 's' : ''}` : 'Revisar de nuevo';
    } catch (err) { $('imErr').textContent = err.message; $('imPrevia').innerHTML = ''; }
    $('imOk').disabled = false;
  }
  function pintarPrevia(r) {
    const estado = (f) => f.error ? `<span class="im-mal">${esc(f.error)}</span>`
      : (f.accion === 'nuevo' ? '<i class="bd">Nuevo</i>' : `<i class="bd">Actualiza${f.precio != null && f.precio !== f.precio_anterior ? ` ${clp(f.precio_anterior)} → ${clp(f.precio)}` : ''}</i>`)
        + f.avisos.map((a) => `<small class="im-aviso">${esc(a)}</small>`).join('');
    const partes = [r.nuevos && `${r.nuevos} nuevo${r.nuevos > 1 ? 's' : ''}`, r.actualizados && `${r.actualizados} se actualiza${r.actualizados > 1 ? 'n' : ''}`,
      r.categorias_nuevas.length && `categorías nuevas: ${r.categorias_nuevas.map(esc).join(', ')}`, r.archivados.length && `<b>${r.archivados.length} salen de la carta</b>`].filter(Boolean);
    $('imPrevia').innerHTML = `<p class="im-res ${r.errores ? 'mal' : ''}">${r.errores ? `<b>${r.errores} fila${r.errores > 1 ? 's' : ''} con problemas.</b> Corrígelas en la planilla, pégala de nuevo y vuelve a revisar.` : '<b>Todo bien.</b> Revisa la vista previa y confirma.'}
        ${partes.length ? `<br>${partes.join(' · ')}` : ''}${r.con_titulos ? '<br><small>Se usó la primera fila como títulos de las columnas.</small>' : ''}</p>
      ${r.archivados.length ? `<details class="im-arch-l"><summary>Ver los que salen de la carta</summary><p class="ayuda">${r.archivados.map(esc).join(', ')}</p></details>` : ''}
      <div class="im-tabla"><table><thead><tr><th>Fila</th><th>Categoría</th><th>Producto</th><th class="r">Precio</th><th>Qué pasa</th></tr></thead><tbody>
      ${r.filas.map((f) => `<tr class="${f.error ? 'mal' : ''}"><td class="num">${f.linea}</td><td>${esc(f.categoria)}</td><td>${esc(f.nombre)}${f.descripcion ? `<small>${esc(f.descripcion)}</small>` : ''}</td>
        <td class="r num">${f.precio == null || Number.isNaN(f.precio) ? '—' : clp(f.precio)}</td><td>${estado(f)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  async function confirmar() {
    const r0 = previa;
    if (r0.archivados.length && !confirm(`${r0.archivados.length} producto${r0.archivados.length > 1 ? 's salen' : ' sale'} de la carta. ¿Seguir?`)) return;
    $('imErr').textContent = ''; $('imOk').disabled = true;
    try {
      const r = await api('panel/importar', { method: 'POST', body: cuerpoIm(true) });
      $('dlgImportar').close();
      toast(`✓ Carta importada: ${r.nuevos} nuevos, ${r.actualizados} actualizados`);
      await alCambiar(); await cargar();
    } catch (err) { $('imErr').textContent = err.message; previa = null; $('imOk').textContent = 'Revisar de nuevo'; }
    $('imOk').disabled = false;
  }

  return { cargar, ayuda, abrirImportar, irA, mostrarFaltan };
}
