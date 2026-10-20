// Panel: movimientos de caja (fondo, ingresos, retiros, gastos), arqueo al cierre y la pestaña Gastos.
// Las utilidades llegan desde el panel (ctx) para no cargar comun.js dos veces.
export function crearCajaUI({ $, ico, toast, api, clp, esc, dinero, digitos, fechaLarga, BASE, puede = () => true }) {
  const TIPO = { fondo: 'Fondo inicial', ingreso: 'Ingreso', retiro: 'Retiro', gasto: 'Gasto' };
  const MEDIOS = { efectivo: ['Efectivo', 'cash'], transferencia: ['Transferencia', 'bank'], tarjeta: ['Tarjeta', 'card'], otro: ['Otro', 'dots'] };
  const UMBRAL_NOTA = 5000; // igual que en lib/caja.mjs
  const BILLETES = [20000, 10000, 5000, 2000, 1000, 500, 100, 50, 10];
  const signo = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + clp(Math.abs(n));
  let CATS = {};

  // ---------- arqueo ciego (opcional, preferencia de este dispositivo) ----------
  // Si está activo, el "Debería haber en caja" se oculta hasta que se escribe el efectivo contado.
  const ciegoOn = () => { try { return localStorage.getItem('caja_ciego') === '1'; } catch { return false; } };
  const aplicarCiego = (C) => {
    const v = $('cjContado');
    $('v-cierre').classList.toggle('ciego-on', !!(C && !C.cierre && v && !v.value.trim() && ciegoOn()));
  };

  // ---------- diálogo de movimiento ----------
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet'; dlg.id = 'dlgMov'; dlg.setAttribute('aria-labelledby', 'mvTitulo');
  dlg.innerHTML = `<div class="sh-head"><h2 id="mvTitulo"></h2><button class="close" data-close aria-label="Cerrar">${ico('x')}</button></div>
    <form class="sh-body" id="mvForm" novalidate></form>
    <div class="sh-foot"><button class="ghost" data-close type="button">Cancelar</button><button class="primary" id="mvOk" form="mvForm">Guardar</button></div>`;
  document.body.append(dlg);
  dlg.querySelectorAll('[data-close]').forEach((b) => b.onclick = () => dlg.close());
  let mv = null;
  function abrirMov(tipo, { dia, hoy, sugerido, alGuardar, rapido }) {
    mv = { tipo, medio: 'efectivo', alGuardar };
    $('mvTitulo').textContent = { fondo: 'Anotar fondo inicial', ingreso: 'Anotar ingreso', corte: 'Entregar la caja', retiro: 'Anotar retiro', gasto: 'Anotar gasto' }[tipo];
    const g = tipo === 'gasto';
    $('mvForm').innerHTML = `
      <div class="field"><label for="mvMonto">${tipo === 'corte' ? 'Efectivo contado' : 'Monto'}</label>${dinero('mvMonto', tipo === 'fondo' ? sugerido?.monto : 0, 'placeholder="0" required')}
        ${tipo === 'fondo' ? `<p class="ayuda">${sugerido ? `Sugerido: lo contado al cerrar el ${esc(fechaLarga(sugerido.dia))}.` : 'El sencillo con que se abre la caja.'}</p>` : ''}</div>
      ${g ? `<div class="field"><label for="mvCat">Categoría</label><select id="mvCat" required><option value="">Elegir…</option>${Object.entries(CATS).map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join('')}</select></div>
        <div class="field"><span class="lbl">Cómo se pagó</span><div class="medios" role="group" aria-label="Cómo se pagó">${Object.entries(MEDIOS).map(([k, [n, i]]) =>
          `<button type="button" data-mvmedio="${k}" aria-pressed="${k === 'efectivo'}">${ico(i)}${n}</button>`).join('')}</div>
          <p class="ayuda" id="mvMedioAyuda">Sale del efectivo de la caja.</p></div>` : ''}
      ${tipo === 'corte' ? `<p class="ayuda" style="margin:0 0 10px">Cuenta la plata antes de pasarle la caja a otra persona. El día sigue abierto.</p>` : ''}
      ${tipo === 'corte' ? `<div class="field"><label for="mvDesc">Nota <span class="opc">(obligatoria si la diferencia pasa de ${clp(UMBRAL_NOTA)})</span></label><input id="mvDesc" maxlength="300" autocomplete="off" placeholder="Ej. entrega de turno a Juan"></div>` : ''}
      ${tipo !== 'fondo' && tipo !== 'corte' ? `<div class="field"><label for="mvDesc">${g ? 'Detalle <span class="opc">(opcional)</span>' : 'Motivo'}</label><input id="mvDesc" maxlength="120" autocomplete="off" placeholder="${g ? 'Ej. paltas y tomates de la feria' : tipo === 'retiro' ? 'Ej. retiro del dueño, depósito al banco' : 'Ej. sencillo, aporte del dueño'}"></div>` : ''}
      ${g ? `<div class="dos"><div class="field"><label for="mvDoc">N° de boleta o factura <span class="opc">(opcional)</span></label><input id="mvDoc" maxlength="40" autocomplete="off"></div>
        <div class="field"><label for="mvDia">Fecha</label><input id="mvDia" type="date" value="${dia}" max="${hoy}"></div></div>` : ''}
      <div class="formerr" id="mvErr" role="alert"></div>`;
    dlg.showModal();
    if (rapido && CATS[rapido.cat]) { $('mvCat').value = rapido.cat; $('mvDesc').value = rapido.txt; }
    $('mvMonto').focus();
  }
  dlg.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mvmedio]'); if (!b) return;
    mv.medio = b.dataset.mvmedio;
    dlg.querySelectorAll('[data-mvmedio]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    $('mvMedioAyuda').textContent = mv.medio === 'efectivo' ? 'Sale del efectivo de la caja.' : 'No toca el efectivo de la caja; solo queda anotado como gasto.';
  });
  $('mvForm').onsubmit = async (e) => {
    e.preventDefault();
    const body = { tipo: mv.tipo, monto: digitos($('mvMonto').value), descripcion: $('mvDesc')?.value };
    if (mv.tipo === 'gasto') Object.assign(body, { categoria: $('mvCat').value, medio: mv.medio, documento: $('mvDoc').value, dia: $('mvDia').value });
    else if (mv.dia) body.dia = mv.dia;
    if (mv.tipo === 'corte') {
      if (!$('mvMonto').value.trim()) { $('mvErr').textContent = 'Cuenta el efectivo y escribe el total (si no hay nada, escribe 0).'; return $('mvMonto').focus(); }
      $('mvOk').disabled = true;
      try {
        await api('panel/caja/cortes', { method: 'POST', body: { dia: mv.dia, contado: body.monto, nota: body.descripcion } });
        dlg.close(); toast('✓ Entrega de caja anotada'); mv.alGuardar?.();
      } catch (err) { $('mvErr').textContent = err.message; } finally { $('mvOk').disabled = false; }
      return;
    }
    if (!body.monto) { $('mvErr').textContent = 'Escribe el monto.'; return $('mvMonto').focus(); }
    if (mv.tipo === 'gasto' && !body.categoria) { $('mvErr').textContent = 'Elige la categoría.'; return $('mvCat').focus(); }
    $('mvOk').disabled = true;
    try {
      await api('panel/caja/movimientos', { method: 'POST', body });
      dlg.close(); toast(`✓ ${TIPO[mv.tipo]} de ${clp(body.monto)} anotado`); mv.alGuardar?.();
    } catch (err) { $('mvErr').textContent = err.message; } finally { $('mvOk').disabled = false; }
  };
  // Ingreso, retiro o fondo de un día anterior: se guardan en ese día.
  const abrirEnDia = (tipo, C, alGuardar, rapido) => { abrirMov(tipo, { dia: C.dia, hoy: C.hoy, sugerido: C.fondo_sugerido, alGuardar, rapido }); mv.dia = C.dia; };
  // Gastos de un toque: categoría y detalle ya puestos (solo categorías que existen); el medio queda en Efectivo.
  const RAPIDOS = { bolsas: ['Bolsas', 'envases'], guantes: ['Guantes', 'envases'], gas: ['Gas', 'servicios'], hielo: ['Hielo', 'insumos'], super: ['Súper', 'insumos'], repartidor: ['Pago repartidor', 'despacho'] };

  // ---------- bloque de caja dentro de "Caja del día" ----------
  function bloqueCaja(C) {
    CATS = C.categorias;
    const E = C.esperado, K = C.cierre;
    const filas = [['Fondo inicial', E.fondo, 'fondo'], [`Ventas en efectivo (${E.ventas_n})`, E.ventas], ['Ingresos', E.ingresos], ['Retiros', -E.retiros], ['Gastos pagados en efectivo', -E.gastos]];
    const dif = K ? K.diferencia : null;
    // Hoy, sin cerrar, con movimiento y sin fondo anotado: falta abrir la caja.
    const sinAbrir = !K && C.dia === C.hoy && !E.fondo && (E.ventas_n > 0 || C.movimientos.some((m) => !m.anulado));
    return `${sinAbrir ? `<div class="banner aviso noprint" role="status" style="border-radius:var(--r-sm);margin-bottom:12px"><strong>Caja sin abrir:</strong> anota el fondo inicial para que el efectivo cuadre.
        <button class="ghostb" data-cj="mov" data-tipo="fondo" style="margin-left:8px">Anotar fondo inicial</button></div>` : ''}
    <section class="cardf cj">
      <div class="res-head" style="margin-bottom:6px"><h3 style="margin:0">Cuadre del efectivo</h3>
        <div class="cj-acc noprint">${K ? '' : `<button class="ghostb" data-cj="mov" data-tipo="gasto">${ico('plus')}Gasto</button>
          <button class="ghostb" data-cj="mov" data-tipo="ingreso">${ico('plus')}Ingreso</button>
          <button class="ghostb" data-cj="mov" data-tipo="retiro">${ico('minus')}Retiro</button>
          <button class="ghostb" data-cj="mov" data-tipo="corte">${ico('note')}Entregar la caja</button>`}</div></div>
      ${K ? '' : `<div class="cj-rapidos noprint" role="group" aria-label="Gastos rápidos"><span class="opc">Gasto rápido:</span>${Object.entries(RAPIDOS).map(([k, [n]]) => `<button class="ghostb" data-cj="mov" data-tipo="gasto" data-rapido="${k}">${n}</button>`).join('')}</div>`}
      <div class="cj-grid">
        <table class="cj-cuenta cj-esp">${filas.map(([n, v, t]) => `<tr><td>${n}${t === 'fondo' && !K ? ` <button class="link noprint" data-cj="mov" data-tipo="fondo">${E.fondo ? 'cambiar' : 'anotar'}</button>` : ''}</td><td class="r">${signo(v)}</td></tr>`).join('')}</table>
          <p class="cj-ciegomsg ayuda">Debería haber en caja: se muestra al escribir lo contado.</p>
          <div class="cj-tot cj-esp"><span>Debería haber en caja</span><b class="num">${clp(E.total)}</b></div>
        <div class="cj-arqueo">${K ? `
          <div class="cj-res ${dif === 0 ? 'ok' : 'mal'}"><span>${dif === 0 ? 'Caja cuadrada' : dif > 0 ? 'Sobra' : 'Falta'}</span><b class="num">${dif === 0 ? clp(K.contado) : clp(Math.abs(dif))}</b>
            <span class="sub">Contado ${clp(K.contado)} · debía haber ${clp(K.esperado)} · cerrada a las ${esc(K.creado.slice(11, 16))}${K.usuario ? ` por ${esc(K.usuario)}` : ''}</span></div>
          ${['tarjeta', 'transferencia'].map((m) => { const v = K[`contado_${m}`], sis = K.detalle[`sistema_${m}`]; if (v == null || sis == null) return '';
            const d = v - sis; return `<p class="ayuda">${m === 'tarjeta' ? 'Tarjeta (voucher)' : 'Transferencias (cartola)'}: ${clp(v)} · sistema ${clp(sis)} · ${d === 0 ? 'cuadra' : `${d > 0 ? 'sobran' : 'faltan'} ${clp(Math.abs(d))}`}</p>`; }).join('')}
          ${K.nota ? `<p class="nota" style="margin-top:8px">${ico('note')}<span>${esc(K.nota)}</span></p>` : ''}
          ${K.esperado !== E.total ? `<p class="ayuda">Ojo: después del cierre cambiaron ventas en efectivo. Debería haber en caja ${clp(E.total)}; reabre la caja y vuelve a contar.</p>` : ''}
          ${K.detalle.por_cobrar ? `<p class="ayuda">Al cerrar quedaban ${K.detalle.por_cobrar} pedido(s) por cobrar.</p>` : ''}
          ${puede('reabrir_caja') ? '<button class="ghostb noprint" data-cj="reabrir" style="margin-top:10px">Reabrir caja</button>' : ''}` : `
          <form id="cjForm"><label class="noprint" style="display:flex;align-items:center;gap:8px;margin:0 0 8px;font-size:.88rem;color:var(--ink-2)"><input type="checkbox" data-cj-ciego ${ciegoOn() ? 'checked' : ''}>Contar sin ver lo que debería haber en caja</label><div class="field" style="margin-top:0"><label for="cjContado">Efectivo contado</label>${dinero('cjContado', 0, 'placeholder="Cuenta billetes y monedas"')}</div>
          <details class="cj-bill"><summary>Contar por billetes y monedas</summary><div class="cj-bills">${BILLETES.map((b) =>
            `<label><span>${clp(b)}</span><input inputmode="numeric" data-bill="${b}" placeholder="0" aria-label="Cantidad de ${clp(b)}"></label>`).join('')}</div></details>
          <details class="cj-bill"><summary>Voucher y cartola <span class="opc">(opcional)</span></summary><div class="cj-bills">
            <label><span>Tarjeta</span>${dinero('cjTarjeta', 0, 'placeholder="Según voucher"')}</label>
            <label><span>Transferencias</span>${dinero('cjTransf', 0, 'placeholder="Según cartola"')}</label></div></details>
          <div class="cj-dif num" id="cjDif" aria-live="polite"></div>
          <div class="field"><label for="cjNota">Nota <span class="opc">(obligatoria si la diferencia pasa de ${clp(UMBRAL_NOTA)})</span></label><input id="cjNota" maxlength="300" placeholder="Ej. se pagó al gásfiter con plata de la caja"></div>
          <div class="formerr" id="cjErr" role="alert"></div>
          <button class="primary" style="width:100%;margin-top:10px">Cerrar caja</button></form>`}
        </div></div>
      ${C.cortes.length ? `<h3>Entregas de caja</h3><div class="cj-scroll"><table><tr><th>Hora</th><th>Quién</th><th class="r">Contado</th><th class="r">Debería haber en caja</th><th class="r">Diferencia</th></tr>
        ${C.cortes.map((t) => `<tr><td>${esc(t.creado.slice(11, 16))}</td><td>${esc(t.usuario || '')}${t.nota ? `<br><span class="opc">${esc(t.nota)}</span>` : ''}</td><td class="r">${clp(t.contado)}</td><td class="r">${clp(t.esperado)}</td><td class="r">${t.diferencia === 0 ? 'Cuadra' : signo(t.diferencia)}</td></tr>`).join('')}</table></div>` : ''}
      ${C.movimientos.length ? `<h3>Movimientos</h3><div class="cj-scroll"><table><tr><th>Hora</th><th>Tipo</th><th>Detalle</th><th>Medio</th><th class="r">Monto</th><th class="noprint"></th></tr>
        ${C.movimientos.map((m) => `<tr${m.anulado ? ' class="anulada"' : ''}><td>${esc(m.creado.slice(11, 16))}${m.usuario ? `<br><span class="opc">${esc(m.usuario)}</span>` : ''}</td><td>${TIPO[m.tipo]}${m.categoria ? ` · ${esc(CATS[m.categoria] || m.categoria)}` : ''}</td>
          <td>${esc(m.descripcion || '')}${m.documento ? ` <span class="opc">(${esc(m.documento)})</span>` : ''}</td><td>${MEDIOS[m.medio]?.[0] || ''}</td>
          <td class="r">${['retiro', 'gasto'].includes(m.tipo) ? '−' : ''}${clp(m.monto)}</td>
          <td class="noprint r">${m.anulado ? `Anulado${m.anulado_por ? ` por ${esc(m.anulado_por)}` : ''}` : (K && m.medio === 'efectivo') ? '' : `<button class="link peligro" data-cj="anular" data-id="${m.id}">Anular</button>`}</td></tr>`).join('')}</table></div>` : ''}
    </section>`;
  }
  function difTxt(C) {
    const v = $('cjContado'); aplicarCiego(C); if (!v) return;
    if (!v.value) { $('cjDif').textContent = ''; $('cjDif').className = 'cj-dif num'; return; }
    const d = digitos(v.value) - C.esperado.total;
    $('cjDif').textContent = d === 0 ? '✓ Cuadra' : `${d > 0 ? 'Sobran' : 'Faltan'} ${clp(Math.abs(d))}`;
    $('cjDif').className = `cj-dif num ${d === 0 ? 'ok' : 'mal'}`;
  }
  // Conecta los eventos del bloque (se llama una vez con el contenedor y cómo leer la caja actual).
  function conectar(cont, actual, recargar) {
    cont.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-cj]'); if (!b) return;
      const C = actual();
      try {
        if (b.dataset.cj === 'mov') { const q = RAPIDOS[b.dataset.rapido]; abrirEnDia(b.dataset.tipo, C, recargar, q && { txt: q[0], cat: q[1] }); }
        else if (b.dataset.cj === 'anular') {
          if (!confirm('¿Anular este movimiento? Queda en el registro como anulado.')) return;
          await api(`panel/caja/movimientos/${b.dataset.id}`, { method: 'DELETE' }); toast('Movimiento anulado'); recargar();
        } else if (b.dataset.cj === 'reabrir') {
          if (!confirm('¿Reabrir la caja? El cierre queda en el registro y tendrás que volver a contar.')) return;
          await api(`panel/caja/cierre?dia=${C.dia}`, { method: 'DELETE' }); toast('Caja reabierta'); recargar();
        }
      } catch (err) { alert(err.message); }
    });
    cont.addEventListener('change', (e) => {
      if (!e.target.matches?.('[data-cj-ciego]')) return;
      try { localStorage.setItem('caja_ciego', e.target.checked ? '1' : '0'); } catch {}
      aplicarCiego(actual());
    });
    cont.addEventListener('input', (e) => {
      if (e.target.dataset.bill !== undefined) {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 5);
        const s = [...cont.querySelectorAll('[data-bill]')].reduce((t, i) => t + Number(i.dataset.bill) * (Number(i.value) || 0), 0);
        $('cjContado').value = s ? s.toLocaleString('es-CL') : '';
      }
      if (e.target.id === 'cjContado' || e.target.dataset.bill !== undefined) difTxt(actual());
    });
    cont.addEventListener('submit', async (e) => {
      if (e.target.id !== 'cjForm') return;
      e.preventDefault();
      const C = actual();
      if (!$('cjContado').value.trim()) { $('cjErr').textContent = 'Cuenta el efectivo y escribe el total (si no hay nada, escribe 0).'; return $('cjContado').focus(); }
      const contado = digitos($('cjContado').value), d = contado - C.esperado.total;
      if (Math.abs(d) > UMBRAL_NOTA && $('cjNota').value.replace(/[^\p{L}\p{N}]/gu, '').length < 3) {
        $('cjErr').textContent = `${d > 0 ? 'Sobran' : 'Faltan'} ${clp(Math.abs(d))}. Escribe qué pasó antes de cerrar.`; return $('cjNota').focus();
      }
      if (d !== 0 && !confirm(`${d > 0 ? 'Sobran' : 'Faltan'} ${clp(Math.abs(d))}. ¿Cerrar la caja igual?`)) return;
      try {
        await api('panel/caja/cierre', { method: 'POST', body: { dia: C.dia, contado, nota: $('cjNota').value, contado_tarjeta: $('cjTarjeta').value.trim() ? digitos($('cjTarjeta').value) : null, contado_transferencia: $('cjTransf').value.trim() ? digitos($('cjTransf').value) : null } });
        toast(d === 0 ? '✓ Caja cerrada y cuadrada' : '✓ Caja cerrada con diferencia'); recargar();
      } catch (err) { $('cjErr').textContent = err.message; }
    });
  }

  // ---------- pestaña Gastos ----------
  let G = null, gMes = null;
  const otroMes = (mes, n) => { const [y, m] = mes.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const nombreMes = (mes) => new Date(`${mes}-15T12:00:00`).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
  async function pintarGastos(el, mes = gMes) {
    G = await api(`panel/gastos${mes ? `?mes=${mes}` : ''}`);
    gMes = G.mes; CATS = G.categorias;
    const actual = G.mes === G.hoy.slice(0, 7);
    const dif = G.total - G.anterior.total;
    const cats = Object.entries(G.categorias).map(([k, n]) => [k, n, G.por_categoria[k], G.anterior.por_categoria[k]]).filter(([, , v, a]) => v || a).sort((a, b) => b[2] - a[2]);
    const max = Math.max(1, ...cats.map((c) => c[2]));
    el.innerHTML = `
      <div class="res-head"><div style="display:flex;align-items:center;gap:8px">
          <button class="ghost ico-b" data-gm="-1" aria-label="Mes anterior">${ico('left')}</button>
          <h2 class="t" style="margin:0">Gastos de ${esc(nombreMes(G.mes))}</h2>
          <button class="ghost ico-b" data-gm="1" aria-label="Mes siguiente" ${actual ? 'disabled' : ''}>${ico('right')}</button></div>
        <button class="primary chico" data-gnuevo style="width:auto;flex:none;padding:0 18px">${ico('plus')}Anotar gasto</button></div>
      <div class="kpis">
        <div>Total del mes<b class="num">${clp(G.total)}</b><span class="sub">${G.gastos.length} gasto${G.gastos.length === 1 ? '' : 's'}</span></div>
        <div>Mes anterior<b class="num">${clp(G.anterior.total)}</b><span class="sub">${G.anterior.total ? `${dif > 0 ? 'Este mes van ' + clp(dif) + ' más' : dif < 0 ? 'Este mes van ' + clp(-dif) + ' menos' : 'Igual'}` : 'Sin gastos anotados'}</span></div>
        <div>Pagado en efectivo<b class="num">${clp(G.gastos.filter((g) => g.medio === 'efectivo').reduce((s, g) => s + g.monto, 0))}</b><span class="sub">Sale de la caja del día</span></div>
      </div>
      ${cats.length ? `<h3>Por categoría</h3><table class="g-cats"><tr><th>Categoría</th><th></th><th class="r">Este mes</th><th class="r">Mes anterior</th></tr>
        ${cats.map(([k, n, v, a]) => `<tr><td>${esc(n)}</td><td class="g-barra"><span style="width:${Math.round((v / max) * 100)}%"></span></td><td class="r">${clp(v)}</td><td class="r opc">${clp(a)}</td></tr>`).join('')}</table></div>` : ''}
      <h3>Detalle</h3>
      ${G.gastos.length ? `<table><tr><th>Fecha</th><th>Categoría</th><th>Detalle</th><th>Medio</th><th class="r">Monto</th><th></th></tr>
        ${G.gastos.map((g) => `<tr><td>${esc(new Date(`${g.dia}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }))}</td><td>${esc(G.categorias[g.categoria] || g.categoria)}</td>
          <td>${esc(g.descripcion || '')}${g.documento ? ` <span class="opc">(${esc(g.documento)})</span>` : ''}</td><td>${MEDIOS[g.medio]?.[0] || ''}</td><td class="r">${clp(g.monto)}</td>
          <td class="r"><button class="link peligro" data-ganular="${g.id}">Anular</button></td></tr>`).join('')}</table>`
        : `<div class="cardf vacio" style="padding:28px">Aún no hay gastos anotados este mes. Anota lo que se paga: insumos, arriendo, luz, gas, sueldos, contador… Con eso, más adelante, el panel calcula si el local está ganando plata.</div>`}`;
  }
  function conectarGastos(el) {
    el.addEventListener('click', async (e) => {
      const m = e.target.closest('[data-gm]');
      if (m) return pintarGastos(el, otroMes(G.mes, Number(m.dataset.gm)));
      if (e.target.closest('[data-gnuevo]')) {
        // Por defecto, hoy si se mira el mes actual; si no, el último día del mes que se está viendo.
        const fin = G.mes === G.hoy.slice(0, 7) ? G.hoy : `${otroMes(G.mes, 1)}-01`;
        const dia = fin === G.hoy ? G.hoy : new Date(new Date(`${fin}T12:00:00`) - 864e5).toISOString().slice(0, 10);
        return abrirMov('gasto', { dia, hoy: G.hoy, alGuardar: () => pintarGastos(el) });
      }
      const a = e.target.closest('[data-ganular]');
      if (a && confirm('¿Anular este gasto? Queda en el registro como anulado.')) {
        try { await api(`panel/caja/movimientos/${a.dataset.ganular}`, { method: 'DELETE' }); toast('Gasto anulado'); pintarGastos(el); } catch (err) { alert(err.message); }
      }
    });
  }

  // ---------- exportar para el contador (va al final del Resumen) ----------
  const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const EXPORTS = [['ventas', 'Ventas', 'Cada pedido: fecha, canal, medio de pago, total y folio de boleta.'],
    ['productos', 'Productos vendidos', 'Cada línea vendida con su precio y costo de insumos.'],
    ['caja', 'Caja diaria', 'Por día: efectivo esperado, contado y diferencia.'],
    ['gastos', 'Gastos', 'Cada gasto con categoría, medio de pago y N° de documento.']];
  function bloqueExportar() {
    const h = new Date(), ini = new Date(h.getFullYear(), h.getMonth(), 1);
    return `<section class="cardf noprint" id="exp" style="margin-top:18px"><h3>Exportar para el contador</h3>
      <p class="ayuda" style="margin-top:-4px">Archivos CSV que abren en Excel. No incluyen teléfonos ni direcciones de clientes.</p>
      <div class="exp-rango"><div class="field"><label for="expDesde">Desde</label><input type="date" id="expDesde" value="${isoLocal(ini)}" max="${isoLocal(h)}"></div>
        <div class="field"><label for="expHasta">Hasta</label><input type="date" id="expHasta" value="${isoLocal(h)}" max="${isoLocal(h)}"></div>
        <div class="exp-rap"><button type="button" class="ghostb" data-exp-mes="0">Este mes</button><button type="button" class="ghostb" data-exp-mes="-1">Mes anterior</button></div></div>
      <div class="exp-lista">${EXPORTS.map(([k, n, d]) => `<a class="exp-item" data-exp="${k}" download href="#">${ico('note')}<span><b>${n}</b><span>${d}</span></span></a>`).join('')}</div>
      <div class="formerr" id="expErr" role="alert"></div></section>`;
  }
  function conectarExportar(el) {
    const enlaces = () => {
      const d = $('expDesde')?.value, h = $('expHasta')?.value; if (!d) return;
      const mal = !d || !h || d > h;
      $('expErr').textContent = mal ? 'Revisa las fechas: el inicio debe ser anterior al término.' : '';
      el.querySelectorAll('[data-exp]').forEach((a) => { a.href = mal ? '#' : `${BASE}/api/panel/exportar?tipo=${a.dataset.exp}&desde=${d}&hasta=${h}`; a.toggleAttribute('aria-disabled', mal); });
    };
    el.addEventListener('change', (e) => { if (e.target.closest('#exp')) enlaces(); });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-exp-mes]');
      if (b) {
        const h = new Date(), n = Number(b.dataset.expMes), ini = new Date(h.getFullYear(), h.getMonth() + n, 1);
        const fin = n === 0 ? h : new Date(h.getFullYear(), h.getMonth() + n + 1, 0);
        $('expDesde').value = isoLocal(ini); $('expHasta').value = isoLocal(fin); return enlaces();
      }
      const a = e.target.closest('[data-exp]');
      if (a?.hasAttribute('aria-disabled') || (a && a.getAttribute('href') === '#')) { e.preventDefault(); enlaces(); }
    });
    return enlaces;
  }

  // ---------- estado de resultados (pestaña Resultados) ----------
  let rMes = null;
  async function pintarResultados(el, mes = rMes) {
    const R = await api(`panel/resultados${mes ? `?mes=${mes}` : ''}`);
    rMes = R.mes;
    const A = R.anterior, hoyMes = isoLocal(new Date()).slice(0, 7);
    const var_ = (a, b) => (b ? `<span class="opc">${a >= b ? '▲' : '▼'} ${clp(Math.abs(a - b))}</span>` : '');
    const fila = (n, v, ant, cls = '') => `<tr class="${cls}"><td>${n}</td><td class="r">${v < 0 ? '−' : ''}${clp(Math.abs(v))}</td><td class="r opc">${ant == null ? '' : `${ant < 0 ? '−' : ''}${clp(Math.abs(ant))}`}</td></tr>`;
    const P = R.personal;
    el.innerHTML = `
      <div class="res-head"><div style="display:flex;align-items:center;gap:8px">
        <button class="ghost ico-b" data-rm="-1" aria-label="Mes anterior">${ico('left')}</button>
        <h2 class="t" style="margin:0">Resultados de ${esc(nombreMes(R.mes))}</h2>
        <button class="ghost ico-b" data-rm="1" aria-label="Mes siguiente" ${R.mes >= hoyMes ? 'disabled' : ''}>${ico('right')}</button></div>
        <button class="ghost" data-print style="display:inline-flex;align-items:center;gap:6px;width:auto">${ico('printer')}Imprimir</button></div>
      <div class="kpis">
        <div>Ventas cobradas<b class="num">${clp(R.ventas)}</b><span class="sub">${R.pedidos} pedidos ${var_(R.ventas, A.ventas)}</span></div>
        <div>Margen de la comida<b class="num">${clp(R.margen_bruto)}</b><span class="sub">${R.ventas ? Math.round((R.margen_bruto / R.ventas) * 100) : 0}% de las ventas</span></div>
        <div class="${R.resultado >= 0 ? 'cj-res ok' : 'cj-res mal'}">Resultado del mes<b class="num">${R.resultado < 0 ? '−' : ''}${clp(Math.abs(R.resultado))}</b><span class="sub">${R.margen_pct == null ? '' : `${R.margen_pct}% de las ventas`} ${var_(R.resultado, A.resultado)}</span></div>
        <div>Comisión que no pagaste<b class="num">${clp(R.comision_app)}</b><span class="sub">${R.comision_app_pct}% de las ventas web, si fueran por app</span></div>
      </div>
      ${R.lineas_total && R.lineas_estimadas / R.lineas_total > 0.2 ? `<p class="nota">${ico('note')}<span>Resultado aproximado: en ${Math.round((R.lineas_estimadas / R.lineas_total) * 100)}% de lo vendido el costo de la comida se estimó en ${R.costo_pct}% del precio. Para que sea exacto, carga el costo de cada producto en Carta y precios (filtro "Sin costo").</span></p>` : ''}
      <table class="res-tabla"><tr><th></th><th class="r">${esc(nombreMes(R.mes))}</th><th class="r">Mes anterior</th></tr>
        ${fila('Ventas cobradas', R.ventas, A.ventas)}
        ${fila(`− Costo de la comida${R.lineas_estimadas ? ` <span class="opc">(${R.lineas_estimadas} línea${R.lineas_estimadas === 1 ? '' : 's'} estimada${R.lineas_estimadas === 1 ? '' : 's'} con ${R.costo_pct}%)</span>` : ''}`, -R.costo_comida, null)}
        ${fila('= Margen de la comida', R.margen_bruto, A.margen_bruto, 'sub')}
        ${fila(`− Personal <span class="opc">(${P.fuente === 'gastos' ? 'sueldos anotados en Gastos' : P.fuente === 'equipo' ? `estimado en Equipo, ${P.personas} persona${P.personas === 1 ? '' : 's'}` : 'sin datos: carga el equipo o anota los sueldos'})</span>`, -P.monto, -A.personal)}
        ${R.operacion.map((g) => fila(`− ${esc(g.nombre)}`, -g.monto, null)).join('')}
        ${fila('= Resultado', R.resultado, A.resultado, 'tot')}
      </table>
      <p class="ayuda">Compras de insumos anotadas este mes: <b>${clp(R.compras_insumos)}</b> (no se restan: el costo de la comida ya las considera; sirven para ver si el costo estimado está bien).
        Despacho cobrado incluido en las ventas: ${clp(R.despacho_cobrado)}. Sin IVA ni impuestos: es una guía para la gestión; el balance lo hace el contador.</p>`;
    el.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => pintarResultados(el, otroMes(R.mes, Number(b.dataset.rm))));
  }

  return { bloqueCaja, conectar, difTxt, pintarGastos, conectarGastos, bloqueExportar, conectarExportar, pintarResultados };
}
