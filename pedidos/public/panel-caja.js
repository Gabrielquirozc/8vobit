// Panel: movimientos de caja (fondo, ingresos, retiros, gastos), arqueo al cierre y la pestaña Gastos.
// Las utilidades llegan desde el panel (ctx) para no cargar comun.js dos veces.
export function crearCajaUI({ $, ico, toast, api, clp, esc, dinero, digitos, fechaLarga }) {
  const TIPO = { fondo: 'Fondo inicial', ingreso: 'Ingreso', retiro: 'Retiro', gasto: 'Gasto' };
  const MEDIOS = { efectivo: ['Efectivo', 'cash'], transferencia: ['Transferencia', 'bank'], tarjeta: ['Tarjeta', 'card'], otro: ['Otro', 'dots'] };
  const BILLETES = [20000, 10000, 5000, 2000, 1000, 500, 100, 50, 10];
  const signo = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + clp(Math.abs(n));
  let CATS = {};

  // ---------- diálogo de movimiento ----------
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet'; dlg.id = 'dlgMov'; dlg.setAttribute('aria-labelledby', 'mvTitulo');
  dlg.innerHTML = `<div class="sh-head"><h2 id="mvTitulo"></h2><button class="close" data-close aria-label="Cerrar">${ico('x')}</button></div>
    <form class="sh-body" id="mvForm" novalidate></form>
    <div class="sh-foot"><button class="ghost" data-close type="button">Cancelar</button><button class="primary" id="mvOk" form="mvForm">Guardar</button></div>`;
  document.body.append(dlg);
  dlg.querySelectorAll('[data-close]').forEach((b) => b.onclick = () => dlg.close());
  let mv = null;
  function abrirMov(tipo, { dia, hoy, sugerido, alGuardar }) {
    mv = { tipo, medio: 'efectivo', alGuardar };
    $('mvTitulo').textContent = { fondo: 'Fondo inicial de la caja', ingreso: 'Ingreso de efectivo', retiro: 'Retiro de efectivo', gasto: 'Nuevo gasto' }[tipo];
    const g = tipo === 'gasto';
    $('mvForm').innerHTML = `
      <div class="field"><label for="mvMonto">Monto</label>${dinero('mvMonto', tipo === 'fondo' ? sugerido?.monto : 0, 'placeholder="0" required')}
        ${tipo === 'fondo' ? `<p class="ayuda">${sugerido ? `Sugerido: lo contado al cerrar el ${esc(fechaLarga(sugerido.dia))}.` : 'El sencillo con que se abre la caja.'}</p>` : ''}</div>
      ${g ? `<div class="field"><label for="mvCat">Categoría</label><select id="mvCat" required><option value="">Elegir…</option>${Object.entries(CATS).map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join('')}</select></div>
        <div class="field"><span class="lbl">Cómo se pagó</span><div class="medios" role="group" aria-label="Cómo se pagó">${Object.entries(MEDIOS).map(([k, [n, i]]) =>
          `<button type="button" data-mvmedio="${k}" aria-pressed="${k === 'efectivo'}">${ico(i)}${n}</button>`).join('')}</div>
          <p class="ayuda" id="mvMedioAyuda">Sale del efectivo de la caja.</p></div>` : ''}
      ${tipo !== 'fondo' ? `<div class="field"><label for="mvDesc">${g ? 'Detalle <span class="opc">(opcional)</span>' : 'Motivo'}</label><input id="mvDesc" maxlength="120" autocomplete="off" placeholder="${g ? 'Ej. paltas y tomates de la feria' : tipo === 'retiro' ? 'Ej. retiro del dueño, depósito al banco' : 'Ej. sencillo, aporte del dueño'}"></div>` : ''}
      ${g ? `<div class="dos"><div class="field"><label for="mvDoc">N° de boleta o factura <span class="opc">(opcional)</span></label><input id="mvDoc" maxlength="40" autocomplete="off"></div>
        <div class="field"><label for="mvDia">Fecha</label><input id="mvDia" type="date" value="${dia}" max="${hoy}"></div></div>` : ''}
      <div class="formerr" id="mvErr" role="alert"></div>`;
    dlg.showModal();
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
    if (!body.monto) { $('mvErr').textContent = 'Escribe el monto.'; return $('mvMonto').focus(); }
    if (mv.tipo === 'gasto' && !body.categoria) { $('mvErr').textContent = 'Elige la categoría.'; return $('mvCat').focus(); }
    $('mvOk').disabled = true;
    try {
      await api('panel/caja/movimientos', { method: 'POST', body });
      dlg.close(); toast(`✓ ${TIPO[mv.tipo]} de ${clp(body.monto)} anotado`); mv.alGuardar?.();
    } catch (err) { $('mvErr').textContent = err.message; } finally { $('mvOk').disabled = false; }
  };
  // Ingreso, retiro o fondo de un día anterior: se guardan en ese día.
  const abrirEnDia = (tipo, C, alGuardar) => { abrirMov(tipo, { dia: C.dia, hoy: C.hoy, sugerido: C.fondo_sugerido, alGuardar }); mv.dia = C.dia; };

  // ---------- bloque de caja dentro de "Caja del día" ----------
  function bloqueCaja(C) {
    CATS = C.categorias;
    const E = C.esperado, K = C.cierre;
    const filas = [['Fondo inicial', E.fondo, 'fondo'], [`Ventas en efectivo (${E.ventas_n})`, E.ventas], ['Ingresos', E.ingresos], ['Retiros', -E.retiros], ['Gastos pagados en efectivo', -E.gastos]];
    const dif = K ? K.diferencia : null;
    return `<section class="cardf cj">
      <div class="res-head" style="margin-bottom:6px"><h3 style="margin:0">Efectivo en caja</h3>
        <div class="cj-acc noprint">${K ? '' : `<button class="ghostb" data-cj="mov" data-tipo="gasto">${ico('plus')}Gasto</button>
          <button class="ghostb" data-cj="mov" data-tipo="ingreso">${ico('plus')}Ingreso</button>
          <button class="ghostb" data-cj="mov" data-tipo="retiro">${ico('minus')}Retiro</button>`}</div></div>
      <div class="cj-grid">
        <table class="cj-cuenta">${filas.map(([n, v, t]) => `<tr><td>${n}${t === 'fondo' && !K ? ` <button class="link noprint" data-cj="mov" data-tipo="fondo">${E.fondo ? 'cambiar' : 'anotar'}</button>` : ''}</td><td class="r">${signo(v)}</td></tr>`).join('')}</table>
          <div class="cj-tot"><span>Debería haber</span><b class="num">${clp(E.total)}</b></div>
        <div class="cj-arqueo">${K ? `
          <div class="cj-res ${dif === 0 ? 'ok' : 'mal'}"><span>${dif === 0 ? 'Caja cuadrada' : dif > 0 ? 'Sobra' : 'Falta'}</span><b class="num">${dif === 0 ? clp(K.contado) : clp(Math.abs(dif))}</b>
            <span class="sub">Contado ${clp(K.contado)} · esperado ${clp(K.esperado)} · cerrada a las ${esc(K.creado.slice(11, 16))}</span></div>
          ${K.nota ? `<p class="nota" style="margin-top:8px">${ico('note')}<span>${esc(K.nota)}</span></p>` : ''}
          ${K.esperado !== E.total ? `<p class="ayuda">Ojo: después del cierre cambiaron ventas en efectivo. Hoy debería haber ${clp(E.total)}; reabre la caja y vuelve a contar.</p>` : ''}
          ${K.detalle.por_cobrar ? `<p class="ayuda">Al cerrar quedaban ${K.detalle.por_cobrar} pedido(s) por cobrar.</p>` : ''}
          <button class="ghostb noprint" data-cj="reabrir" style="margin-top:10px">Reabrir caja</button>` : `
          <form id="cjForm"><div class="field" style="margin-top:0"><label for="cjContado">Efectivo contado</label>${dinero('cjContado', 0, 'placeholder="Cuenta billetes y monedas"')}</div>
          <details class="cj-bill"><summary>Contar por billetes y monedas</summary><div class="cj-bills">${BILLETES.map((b) =>
            `<label><span>${clp(b)}</span><input inputmode="numeric" data-bill="${b}" placeholder="0" aria-label="Cantidad de ${clp(b)}"></label>`).join('')}</div></details>
          <div class="cj-dif num" id="cjDif" aria-live="polite"></div>
          <div class="field"><label for="cjNota">Nota <span class="opc">(opcional)</span></label><input id="cjNota" maxlength="300" placeholder="Ej. se pagó al gásfiter con plata de la caja"></div>
          <div class="formerr" id="cjErr" role="alert"></div>
          <button class="primary" style="width:100%;margin-top:10px">Cerrar caja</button></form>`}
        </div></div>
      ${C.movimientos.length ? `<h3>Movimientos</h3><div class="cj-scroll"><table><tr><th>Hora</th><th>Tipo</th><th>Detalle</th><th>Medio</th><th class="r">Monto</th><th class="noprint"></th></tr>
        ${C.movimientos.map((m) => `<tr${m.anulado ? ' class="anulada"' : ''}><td>${esc(m.creado.slice(11, 16))}</td><td>${TIPO[m.tipo]}${m.categoria ? ` · ${esc(CATS[m.categoria] || m.categoria)}` : ''}</td>
          <td>${esc(m.descripcion || '')}${m.documento ? ` <span class="opc">(${esc(m.documento)})</span>` : ''}</td><td>${MEDIOS[m.medio]?.[0] || ''}</td>
          <td class="r">${['retiro', 'gasto'].includes(m.tipo) ? '−' : ''}${clp(m.monto)}</td>
          <td class="noprint r">${m.anulado ? 'Anulado' : (K && m.medio === 'efectivo') ? '' : `<button class="link peligro" data-cj="anular" data-id="${m.id}">Anular</button>`}</td></tr>`).join('')}</table></div>` : ''}
    </section>`;
  }
  function difTxt(C) {
    const v = $('cjContado'); if (!v) return;
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
        if (b.dataset.cj === 'mov') abrirEnDia(b.dataset.tipo, C, recargar);
        else if (b.dataset.cj === 'anular') {
          if (!confirm('¿Anular este movimiento? Queda en el registro como anulado.')) return;
          await api(`panel/caja/movimientos/${b.dataset.id}`, { method: 'DELETE' }); toast('Movimiento anulado'); recargar();
        } else if (b.dataset.cj === 'reabrir') {
          if (!confirm('¿Reabrir la caja? El cierre queda en el registro y tendrás que volver a contar.')) return;
          await api(`panel/caja/cierre?dia=${C.dia}`, { method: 'DELETE' }); toast('Caja reabierta'); recargar();
        }
      } catch (err) { alert(err.message); }
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
      if (d !== 0 && !confirm(`${d > 0 ? 'Sobran' : 'Faltan'} ${clp(Math.abs(d))}. ¿Cerrar la caja igual?`)) return;
      try {
        await api('panel/caja/cierre', { method: 'POST', body: { dia: C.dia, contado, nota: $('cjNota').value } });
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

  return { bloqueCaja, conectar, difTxt, pintarGastos, conectarGastos };
}
