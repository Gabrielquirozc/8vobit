// Panel: pestaña Promociones (plan Pro). Promociones automáticas por día y horario o con código,
// combos con precio propio y las ideas que salen de las ventas de los últimos 60 días.
// Crear una promoción va en dos pasos: 1) elegir el tipo, 2) formulario corto con los campos de ese tipo
// (el resto, en "Más opciones"). Todos los campos existen siempre en el formulario: el payload es el mismo para cualquier tipo.
export function crearPromosUI({ $, ico, toast, api, clp, esc }) {
  const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const DIAS_L = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
  let P = [], C = null, edit = null, tipoSel = null, cf = null, SG = null, COSTOS = {}, pre = null, ideasAbiertas;
  const desc = (p) => (p.tipo === 'pct' ? `${p.valor} %` : clp(p.valor));
  const cuando = (p) => [p.codigo ? `Código <b>${esc(p.codigo)}</b>` : 'Automática',
    p.dias.length ? p.dias.map((d) => DIAS[d]).join(', ') : 'todos los días', p.desde ? `${p.desde}–${p.hasta}` : '',
    p.minimo ? `desde ${clp(p.minimo)}` : '', p.vence ? `hasta el ${new Date(`${p.vence}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}` : ''].filter(Boolean).join(' · ');
  const productos = () => C.categorias.flatMap((c) => c.productos.map((p) => ({ ...p, cat: c.nombre })));

  // Tipos de promoción (los que ya existen en lib/promos.mjs): `main` = campos a la vista; el resto va en "Más opciones".
  const TIPOS = {
    auto: { t: 'Descuento por día u horario', d: 'Se aplica sola, sin código, en los días y horas que elijas.', e: 'Ej. "Martes y jueves 15 % de 12:00 a 16:00"', main: ['valor', 'dias', 'horas'], ph: 'Ej. Martes de churrasco' },
    codigo: { t: 'Código de descuento', d: 'Solo lo usa quien conoce el código (Instagram, volantes, amigos).', e: 'Ej. "10 % con el código GASSUSO10"', main: ['codigo', 'valor'], ph: 'Ej. Código Instagram' },
    categoria: { t: 'Descuento en una categoría', d: 'Rebaja solo los productos de una categoría de la carta.', e: 'Ej. "20 % en Bebidas"', main: ['categoria', 'valor'], ph: 'Ej. Bebidas con descuento' },
    minimo: { t: 'Descuento por compra mínima', d: 'Premia los pedidos grandes: se aplica desde cierto monto.', e: 'Ej. "$2.000 de descuento desde $15.000"', main: ['minimo', 'valor'], ph: 'Ej. Pedido grande' }
  };
  const ORDEN = ['codigo', 'categoria', 'minimo', 'dias', 'horas', 'vence', 'usos', 'cupo'];
  const tipoDe = (v) => (v.codigo ? 'codigo' : v.categoria_id ? 'categoria' : v.minimo > 0 && !v.dias.length && !v.desde ? 'minimo' : 'auto');
  const porDefecto = (k, v) => ({ codigo: !v.codigo, categoria: !v.categoria_id, minimo: !v.minimo, dias: !v.dias.length, horas: !v.desde && !v.hasta, vence: !v.vence, usos: !v.usos_max, cupo: !v.cupo_unidades })[k];

  // Frase de resumen ("15 % de descuento en Sándwiches los martes de 12:00 a 16:00"). Texto plano: se escapa al pintar.
  function resumen(v) {
    const val = Number(v.valor) || 0, cat = v.categoria_id ? C.categorias.find((c) => c.id === Number(v.categoria_id))?.nombre : '';
    const dias = [...v.dias].sort().map((d) => DIAS_L[d]), l = dias.length > 1 ? `${dias.slice(0, -1).join(', ')} y ${dias.at(-1)}` : dias[0];
    return [`${v.tipo === 'pct' ? `${val} %` : clp(val)} de descuento`, cat ? `en ${cat}` : '', l && v.dias.length < 7 ? `los ${l}` : '',
      v.desde && v.hasta ? `de ${v.desde} a ${v.hasta}` : '', v.minimo ? `desde ${clp(v.minimo)} de pedido` : '',
      v.codigo ? `con el código ${String(v.codigo).toUpperCase()}` : '', v.vence ? `hasta el ${new Date(`${v.vence}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })}` : '',
      v.usos_max ? `(máx. ${v.usos_max} usos)` : '', v.cupo_unidades ? `(cupo de ${v.cupo_unidades} unidades)` : ''].filter(Boolean).join(' ');
  }

  function campo(k, v) {
    const cats = `<option value="">Todo el pedido</option>${C.categorias.map((c) => `<option value="${c.id}" ${c.id === v.categoria_id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}`;
    return {
      codigo: `<div class="field"><label for="prCod">Código <span class="opc">(vacío = se aplica sola)</span></label><input id="prCod" maxlength="16" value="${esc(v.codigo || '')}" placeholder="Ej. VUELVE10" style="text-transform:uppercase"></div>`,
      valor: `<div class="dos"><div class="field"><label for="prTipo">Descuento</label><select id="prTipo"><option value="pct" ${v.tipo === 'pct' ? 'selected' : ''}>Porcentaje (%)</option><option value="monto" ${v.tipo === 'monto' ? 'selected' : ''}>Monto fijo ($)</option></select></div>
        <div class="field"><label for="prVal">Valor</label><input id="prVal" inputmode="numeric" value="${esc(v.valor)}"></div></div>`,
      dias: `<div class="field"><span class="lbl">Días <span class="opc">(ninguno = todos)</span></span><div class="medios dias" role="group" aria-label="Días">${DIAS.map((d, i) =>
        `<button type="button" data-prdia="${i}" aria-pressed="${v.dias.includes(i)}">${d}</button>`).join('')}</div></div>`,
      horas: `<div class="dos"><div class="field"><label for="prDesde">Desde <span class="opc">(hora, opcional)</span></label><input id="prDesde" type="time" value="${esc(v.desde || '')}"></div>
        <div class="field"><label for="prHasta">Hasta</label><input id="prHasta" type="time" value="${esc(v.hasta || '')}"></div></div>`,
      categoria: `<div class="field"><label for="prCat">Solo en la categoría <span class="opc">(vacío = todo el pedido)</span></label><select id="prCat">${cats}</select></div>`,
      minimo: `<div class="field"><label for="prMin">Pedido mínimo <span class="opc">($, opcional)</span></label><input id="prMin" inputmode="numeric" value="${v.minimo || ''}"></div>`,
      vence: `<div class="field"><label for="prVence">Termina el <span class="opc">(opcional)</span></label><input id="prVence" type="date" value="${v.vence || ''}"></div>`,
      usos: `<div class="field"><label for="prUsos">Máximo de usos <span class="opc">(opcional)</span></label><input id="prUsos" inputmode="numeric" value="${v.usos_max || ''}"></div>`,
      cupo: `<div class="field"><label for="prCupo">Cupo de unidades <span class="opc">(opcional)</span></label><input id="prCupo" inputmode="numeric" value="${v.cupo_unidades || ''}"><p class="ayuda">Cuántas unidades puede descontar en total. Al agotarse, la promoción deja de aplicar. Si un pedido pasa del cupo, solo se descuentan las que quedan (las más caras primero).</p></div>`
    }[k];
  }

  function pasoTipo() {
    return `<section class="cardf" id="prForm"><h3>¿Qué quieres hacer?</h3><p class="ayuda top">Elige el tipo de promoción. Después solo te pedimos lo necesario.</p>
      <div class="prtipos">${Object.entries(TIPOS).map(([k, x]) => `<button type="button" class="prtipo" data-prtipo="${k}"><b>${x.t}</b><span>${x.d}</span><em>${x.e}</em></button>`).join('')}
        <button type="button" class="prtipo" data-prcombo><b>Combo</b><span>Varios productos juntos a un precio propio.</span><em>Ej. "Completo + bebida + papas a $5.990"</em></button></div>
      <div style="margin-top:10px"><button class="ghost" data-prcancel type="button">Cancelar</button></div></section>`;
  }

  function form(p) {
    const v = p || pre || { nombre: '', tipo: 'pct', valor: 10, codigo: '', dias: [], desde: '', hasta: '', minimo: 0, categoria_id: null, vence: '', usos_max: null, activa: true };
    const x = TIPOS[tipoSel], mas = ORDEN.filter((k) => !x.main.includes(k));
    return `<section class="cardf" id="prForm"><h3>${p ? 'Editar promoción' : esc(x.t)}</h3>
      <p class="prresumen" id="prResumen" aria-live="polite">${esc(resumen(v))}</p>
      <div class="field"><label for="prNom">Nombre (lo ve el cliente)</label><input id="prNom" maxlength="60" value="${esc(v.nombre)}" placeholder="${esc(x.ph)}"></div>
      ${x.main.map((k) => campo(k, v)).join('')}
      <details class="prmas" ${mas.some((k) => !porDefecto(k, v)) ? 'open' : ''}><summary>Más opciones</summary>${mas.map((k) => campo(k, v)).join('')}</details>
      <label class="chk"><input type="checkbox" id="prAct" ${v.activa ? 'checked' : ''}> Activa</label>
      <div class="formerr" id="prErr" role="alert"></div>
      <div style="display:flex;gap:8px;margin-top:10px">${p ? '' : '<button class="ghost" data-prvolver type="button">Volver</button>'}<button class="ghost" data-prcancel type="button">Cancelar</button><button class="primary" data-prguardar type="button">Guardar</button></div></section>`;
  }

  // ---------- combos propios ----------
  // Un combo es un producto de la carta (categoría "Combos") con su precio propio y los productos que incluye.
  const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const porId = (id) => productos().find((p) => p.id === id);
  const suelto = (items) => items.reduce((s, x) => s + (porId(x.producto_id)?.precio || 0) * x.cantidad, 0);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function formCombo() {
    return `<section class="cardf" id="cfForm"><h3>${cf.id ? 'Editar combo' : 'Nuevo combo'}</h3>
      <div class="field"><label for="cfNom">Nombre del combo</label><input id="cfNom" maxlength="80" value="${esc(cf.nombre)}" placeholder="Ej. Combo completo + bebida" autocomplete="off"></div>
      <div class="field"><span class="lbl">Qué incluye</span><div id="cfItems"></div>
        <input id="cfBus" type="search" class="cfbus" placeholder="Buscar un producto para agregar…" autocomplete="off" aria-label="Buscar un producto para agregar">
        <div id="cfRes" class="cfres"></div></div>
      <div class="field"><label for="cfCupo">Cupo de unidades por día <span class="opc">(opcional)</span></label><input id="cfCupo" inputmode="numeric" value="${cf.cupo_dia || ''}" placeholder="Sin límite"><p class="ayuda">Cuántos puedes vender hoy; se reinicia cada día. Al agotarse, la carta lo marca "Agotado".</p></div>
      <div class="field"><label for="cfPrecio">Precio del combo</label><div class="money"><span aria-hidden="true">$</span><input id="cfPrecio" inputmode="numeric" autocomplete="off" value="${cf.precio ? esc(String(cf.precio)) : ''}" placeholder="0"></div></div>
      <div id="cfCalc" class="cfcalc" aria-live="polite"></div>
      <div class="formerr" id="cfErr" role="alert"></div>
      <div class="prbtns"><button class="ghost" data-cfcancel type="button">Cancelar</button><button class="primary" data-cfguardar type="button">Guardar combo</button></div></section>`;
  }
  function pintarCfItems() {
    $('cfItems').innerHTML = cf.items.length ? cf.items.map((x) => { const p = porId(x.producto_id); return `<div class="cfitem"><span class="cfn"><b>${esc(p?.nombre || 'Producto')}</b><small>${p ? clp(p.precio) : ''} c/u</small></span>
      <span class="cfq"><button type="button" data-cfq="${x.producto_id}" data-d="-1" aria-label="Menos ${esc(p?.nombre || '')}">−</button><b class="num">${x.cantidad}</b><button type="button" data-cfq="${x.producto_id}" data-d="1" aria-label="Más ${esc(p?.nombre || '')}">+</button></span>
      <button class="link peligro" type="button" data-cfdel="${x.producto_id}">Quitar</button></div>`; }).join('')
      : '<p class="ayuda" style="margin:0 0 8px">Agrega al menos 2 productos.</p>';
    calcCf();
  }
  function pintarCfRes() {
    const q = norm($('cfBus').value.trim());
    const hay = new Set(cf.items.map((x) => x.producto_id));
    const l = productos().filter((p) => !p.combo && !hay.has(p.id) && p.precio > 0 && (!q || norm(`${p.nombre} ${p.cat}`).includes(q))).slice(0, 8);
    $('cfRes').innerHTML = l.length ? l.map((p) => `<button type="button" class="cfadd" data-cfadd="${p.id}">${ico('plus')}<span><b>${esc(p.nombre)}</b><small>${esc(p.cat)}</small></span><span class="num">${clp(p.precio)}</span></button>`).join('')
      : '<p class="ayuda" style="margin:4px 0 0">No hay productos que coincidan.</p>';
  }
  // Suma de precios sueltos, ahorro del cliente y margen estimado (con costos de receta o de producto).
  function calcCf() {
    const s = suelto(cf.items), pr = Number(cf.precio) || 0;
    let h = `<div class="cfl"><span>Suma de los productos sueltos</span><b class="num">${clp(s)}</b></div>`;
    if (pr > 0 && s > 0) {
      const a = s - pr;
      h += a > 0 ? `<div class="cfl"><span>Ahorro del cliente</span><b class="num">${clp(a)} (${Math.round((a / s) * 100)} %)</b></div>`
        : `<div class="cfl aviso"><span>El combo sale ${a === 0 ? 'igual que' : 'más caro que'} comprar los productos sueltos</span></div>`;
      const costos = cf.items.map((x) => COSTOS[x.producto_id]);
      if (costos.length && costos.every((c) => c != null)) {
        const costo = cf.items.reduce((t, x) => t + COSTOS[x.producto_id] * x.cantidad, 0), m = pr - costo;
        h += `<div class="cfl"><span>Margen estimado</span><b class="num">${clp(m)} (${Math.round((m / pr) * 100)} %)</b></div>`;
        if (m < 0) h += `<div class="cfl aviso"><span>Ojo: el precio queda bajo el costo (${clp(costo)}). Pierdes ${clp(-m)} por combo.</span></div>`;
      }
    }
    $('cfCalc').innerHTML = h;
  }
  const abrirCombo = (el, c) => { cf = c; edit = null; tipoSel = null; pre = null; return pintar(el).then(() => { pintarCfItems(); pintarCfRes(); $('cfForm').scrollIntoView({ block: 'nearest' }); $('cfNom').focus(); }); };

  // Ideas según las ventas de los últimos 60 días (solo lectura).
  function ideasHtml() {
    if (!SG) return '';
    const hay = SG.suficiente && (SG.dias.length || SG.combos.length);
    const abierto = ideasAbiertas ?? !!hay;
    return `<details class="cardf pideas" id="prIdeas" ${abierto ? 'open' : ''}><summary><b>Ideas según tus ventas</b>${hay ? `<span class="opc">${SG.dias.length + SG.combos.length} para probar</span>` : ''}</summary>
      ${!SG.suficiente ? `<p class="ayuda" style="margin:8px 0 0">Aún hay pocas ventas para sugerir (${SG.pedidos} de ${SG.minimo} pedidos en 60 días); vuelve en unos días.</p>`
        : !hay ? '<p class="ayuda" style="margin:8px 0 0">Tus ventas van parejas: no encontramos días flojos ni productos que se pidan juntos. Vuelve en unos días.</p>'
        : `<ul class="idlist">${SG.dias.map((d, i) => `<li><span><b>Descuento los ${esc(d.nombre)}${d.desde ? ` de ${esc(d.desde)} a ${esc(d.hasta)}` : ''}</b><small>${esc(d.evidencia)}</small></span>
            <button class="ghostb" type="button" data-sugdia="${i}">Crear promoción</button></li>`).join('')}
          ${SG.combos.map((c, i) => `<li><span><b>Combo: ${esc(c.nombre)}</b><small>${esc(c.evidencia)} Suelto suman ${clp(c.suma)}; sugerido ${clp(c.precio)}.</small></span>
            <button class="ghostb" type="button" data-sugcombo="${i}">Crear combo</button></li>`).join('')}</ul>`}</details>`;
  }

  async function pintar(el) {
    [{ promociones: P, costos: COSTOS = {} }, C, SG] = await Promise.all([api('panel/promos'), api('panel/carta'), api('panel/promos/sugerencias').catch(() => null)]);
    const combos = productos().filter((p) => p.combo);
    el.innerHTML = `<div class="res-head"><h2 class="t" style="margin:0">Promociones</h2>
        <button class="primary chico" data-prnuevo style="width:auto;flex:none;padding:0 18px">${ico('plus')}Nueva promoción</button></div>
      <p class="ayuda">Cada pedido lleva la promoción que más le descuenta, sin tocar el despacho.</p>
      ${ideasHtml()}
      ${edit === null ? '' : edit === 0 && !tipoSel ? pasoTipo() : form(P.find((p) => p.id === edit))}
      ${P.length ? `<div class="cj-scroll"><table><tr><th>Promoción</th><th>Descuento</th><th>Cuándo</th><th class="r">Usos</th><th></th></tr>${P.map((p) => `<tr class="${p.activa ? '' : 'off'}">
        <td><b>${esc(p.nombre)}</b>${p.activa ? '' : ' <span class="opc">(pausada)</span>'}<div class="opc">${esc(resumen(p))}</div></td><td>${desc(p)}${p.categoria_id ? ` <span class="opc">en ${esc(C.categorias.find((c) => c.id === p.categoria_id)?.nombre || '')}</span>` : ''}</td>
        <td>${cuando(p)}</td><td class="r">${p.usos}${p.usos_max ? ` / ${p.usos_max}` : ''}${p.cupo_unidades ? `<div class="opc">${p.unidades_usadas >= p.cupo_unidades ? 'Agotada' : `Quedan ${p.cupo_unidades - p.unidades_usadas} de ${p.cupo_unidades}`}</div>` : ''}</td>
        <td class="r"><button class="link" data-preditar="${p.id}">Editar</button> <button class="link" data-prpausa="${p.id}">${p.activa ? 'Pausar' : 'Activar'}</button> <button class="link peligro" data-prquitar="${p.id}">Quitar</button></td></tr>`).join('')}</table></div>`
        : edit === null ? '<div class="cardf vacio" style="padding:24px">Aún no hay promociones. Toca "Nueva promoción" y elige un tipo: por ejemplo, 15 % los martes o un código para Instagram.</div>' : ''}
      <div class="res-head" id="cbSec" style="margin-top:32px"><h2 class="t" style="margin:0">Combos</h2>
        <button class="primary chico" data-cfnuevo style="width:auto;flex:none;padding:0 18px">${ico('plus')}Nuevo combo</button></div>
      ${cf ? formCombo() : ''}
      ${combos.length ? `<div class="cj-scroll"><table><tr><th>Combo</th><th>Incluye</th><th class="r">Precio</th><th class="r">Ahorro</th><th></th></tr>${combos.map((p) => {
        const s = suelto(p.combo), a = s - p.precio;
        return `<tr class="${p.activo ? '' : 'off'}"><td><b>${esc(p.nombre)}</b>${p.activo ? '' : ' <span class="opc">(pausado)</span>'}${p.cupo_dia ? `<div class="opc">${p.agotado ? 'Agotado por hoy' : `Quedan ${p.quedan} de ${p.cupo_dia} hoy`}</div>` : ''}</td><td>${p.combo.map((x) => `${x.cantidad > 1 ? x.cantidad + '× ' : ''}${esc(x.nombre)}`).join(' + ')}</td><td class="r">${clp(p.precio)}</td>
          <td class="r opc">${a > 0 ? `${clp(a)} (${Math.round((a / s) * 100)} %)` : '—'}</td>
          <td class="r"><button class="link" data-cfeditar="${p.id}">Editar</button> <button class="link" data-cfpausa="${p.id}">${p.activo ? 'Pausar' : 'Activar'}</button> <button class="link peligro" data-cfquitar="${p.id}">Quitar</button></td></tr>`; }).join('')}</table></div>`
        : cf ? '' : '<div class="cardf vacio" style="padding:24px">Aún no hay combos. Toca "Nuevo combo": le pones nombre y precio, y eliges los productos que incluye.</div>'}`;
    if (cf) { pintarCfItems(); pintarCfRes(); }
  }

  function conectar(el) {
    const n = (id) => Number(String($(id).value).replace(/\D/g, '')) || 0;
    // Lee el formulario tal como lo enviará "Guardar" (mismo payload de siempre) y alimenta la frase de resumen.
    const leer = () => ({ nombre: $('prNom').value, codigo: $('prCod').value.trim() || null, tipo: $('prTipo').value, valor: n('prVal'),
      dias: [...el.querySelectorAll('[data-prdia][aria-pressed="true"]')].map((x) => Number(x.dataset.prdia)), desde: $('prDesde').value || null, hasta: $('prHasta').value || null,
      categoria_id: $('prCat').value ? Number($('prCat').value) : null, minimo: n('prMin'), vence: $('prVence').value || null, usos_max: n('prUsos') || null, cupo_unidades: n('prCupo') || null, activa: $('prAct').checked });
    const actualizar = () => { if ($('prResumen')) $('prResumen').textContent = resumen(leer()); };
    el.addEventListener('input', (e) => {
      if (e.target.closest('#prForm')) actualizar();
      if (e.target.id === 'cfBus') pintarCfRes();
      else if (e.target.id === 'cfNom') cf.nombre = e.target.value;
      else if (e.target.id === 'cfCupo') cf.cupo_dia = n('cfCupo') || null;
      else if (e.target.id === 'cfPrecio') { cf.precio = n('cfPrecio'); calcCf(); }
    });
    el.addEventListener('change', (e) => { if (e.target.closest('#prForm')) actualizar(); });
    el.addEventListener('toggle', (e) => { if (e.target.id === 'prIdeas') ideasAbiertas = e.target.open; }, true);
    el.addEventListener('click', async (e) => {
      const t = (s) => e.target.closest(s);
      let b;
      if (t('[data-prnuevo]')) { edit = 0; tipoSel = null; pre = null; cf = null; return pintar(el); }
      if ((b = t('[data-prtipo]'))) { tipoSel = b.dataset.prtipo; return pintar(el); }
      if (t('[data-prvolver]')) { tipoSel = null; return pintar(el); }
      if (t('[data-prcombo]')) return abrirCombo(el, { id: null, nombre: '', precio: 0, items: [] });
      if ((b = t('[data-sugdia]'))) {
        const d = SG.dias[Number(b.dataset.sugdia)];
        pre = { nombre: `Promo ${d.nombre}`, tipo: 'pct', valor: d.valor, codigo: '', dias: [d.dia], desde: d.desde || '', hasta: d.hasta || '', minimo: 0, categoria_id: null, vence: '', usos_max: null, activa: true };
        edit = 0; tipoSel = 'auto'; cf = null; await pintar(el); return $('prForm').scrollIntoView({ block: 'nearest' });
      }
      if ((b = t('[data-sugcombo]'))) { const c = SG.combos[Number(b.dataset.sugcombo)]; return abrirCombo(el, { id: null, nombre: `Combo ${c.nombre}`, precio: c.precio, items: c.items.map((x) => ({ ...x })) }); }
      if ((b = t('[data-preditar]'))) { edit = Number(b.dataset.preditar); tipoSel = tipoDe(P.find((p) => p.id === edit)); pre = null; cf = null; return pintar(el); }
      if (t('[data-prcancel]')) { edit = null; tipoSel = null; pre = null; return pintar(el); }
      if ((b = t('[data-prdia]'))) { b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'); return actualizar(); }
      if ((b = t('[data-prpausa]'))) {
        const p = P.find((x) => x.id === Number(b.dataset.prpausa));
        try { await api(`panel/promos/${p.id}`, { method: 'PATCH', body: { activa: !p.activa } }); toast(p.activa ? 'Promoción pausada' : 'Promoción activa'); pintar(el); } catch (err) { alert(err.message); }
        return;
      }
      if ((b = t('[data-prquitar]'))) {
        const p = P.find((x) => x.id === Number(b.dataset.prquitar));
        if (!confirm(`¿Quitar la promoción "${p.nombre}"?${p.usos ? ' Ya se usó en pedidos: queda en el historial pero deja de aplicar.' : ''}`)) return;
        try { await api(`panel/promos/${p.id}`, { method: 'DELETE' }); toast('Promoción quitada'); pintar(el); } catch (err) { alert(err.message); }
        return;
      }
      if (t('[data-prguardar]')) {
        const body = leer();
        const falta = { codigo: !body.codigo && ['prCod', 'Escribe el código que usarán los clientes'], categoria: !body.categoria_id && ['prCat', 'Elige la categoría'], minimo: !body.minimo && ['prMin', 'Escribe el monto mínimo de compra'] }[tipoSel];
        if (falta) { $('prErr').textContent = falta[1]; $(falta[0]).focus(); return; }
        try { await api(edit ? `panel/promos/${edit}` : 'panel/promos', { method: edit ? 'PATCH' : 'POST', body }); toast('Promoción guardada'); edit = null; tipoSel = null; pre = null; pintar(el); }
        catch (err) { $('prErr').textContent = err.message; }
        return;
      }
      // Combos propios
      if (t('[data-cfnuevo]')) return abrirCombo(el, { id: null, nombre: '', precio: 0, items: [] });
      if ((b = t('[data-cfeditar]'))) { const p = porId(Number(b.dataset.cfeditar)); return abrirCombo(el, { id: p.id, nombre: p.nombre, precio: p.precio, cupo_dia: p.cupo_dia, items: p.combo.map((x) => ({ producto_id: x.producto_id, cantidad: x.cantidad })) }); }
      if (t('[data-cfcancel]')) { cf = null; return pintar(el); }
      if ((b = t('[data-cfadd]'))) { cf.items.push({ producto_id: Number(b.dataset.cfadd), cantidad: 1 }); $('cfBus').value = ''; pintarCfItems(); pintarCfRes(); return $('cfBus').focus(); }
      if ((b = t('[data-cfq]'))) { const x = cf.items.find((i) => i.producto_id === Number(b.dataset.cfq)); x.cantidad = Math.max(1, Math.min(20, x.cantidad + Number(b.dataset.d))); return pintarCfItems(); }
      if ((b = t('[data-cfdel]'))) { cf.items = cf.items.filter((i) => i.producto_id !== Number(b.dataset.cfdel)); pintarCfItems(); return pintarCfRes(); }
      if (t('[data-cfguardar]')) {
        const err = (m, foco) => { $('cfErr').textContent = m; $(foco).focus(); };
        if (!cf.nombre.trim()) return err('Ponle un nombre al combo.', 'cfNom');
        if (cf.items.reduce((s, x) => s + x.cantidad, 0) < 2) return err('Agrega al menos 2 productos al combo.', 'cfBus');
        if (!(cf.precio > 0)) return err('Escribe el precio del combo.', 'cfPrecio');
        const body = { nombre: cf.nombre, precio: cf.precio, items: cf.items, cupo_dia: cf.cupo_dia || null };
        try { await api(cf.id ? `panel/combos/${cf.id}` : 'panel/combos', { method: cf.id ? 'PATCH' : 'POST', body }); toast('Combo guardado'); cf = null; pintar(el); }
        catch (e2) { $('cfErr').textContent = e2.message; }
        return;
      }
      if ((b = t('[data-cfpausa]'))) {
        const p = porId(Number(b.dataset.cfpausa));
        try { await api(`panel/combos/${p.id}`, { method: 'PATCH', body: { activo: !p.activo } }); toast(p.activo ? 'Combo pausado' : 'Combo activo'); pintar(el); } catch (err) { alert(err.message); }
        return;
      }
      if ((b = t('[data-cfquitar]'))) {
        const p = porId(Number(b.dataset.cfquitar));
        if (!confirm(`¿Quitar el combo "${p.nombre}"? Sale de la carta.`)) return;
        try { await api(`panel/combos/${p.id}`, { method: 'DELETE' }); toast('Combo quitado'); pintar(el); } catch (err) { alert(err.message); }
      }
    });
  }
  return { pintar, conectar };
}
