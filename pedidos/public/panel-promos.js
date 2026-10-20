// Panel: pestaña Promociones (plan Pro). Promociones automáticas por día y horario o con código,
// y combos (un producto de la carta con los productos que incluye).
// Crear una promoción va en dos pasos: 1) elegir el tipo, 2) formulario corto con los campos de ese tipo
// (el resto, en "Más opciones"). Todos los campos existen siempre en el formulario: el payload es el mismo para cualquier tipo.
export function crearPromosUI({ $, ico, toast, api, clp, esc }) {
  const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const DIAS_L = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
  let P = [], C = null, edit = null, comboDe = null, tipoSel = null;
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
  const ORDEN = ['codigo', 'categoria', 'minimo', 'dias', 'horas', 'vence', 'usos'];
  const tipoDe = (v) => (v.codigo ? 'codigo' : v.categoria_id ? 'categoria' : v.minimo > 0 && !v.dias.length && !v.desde ? 'minimo' : 'auto');
  const porDefecto = (k, v) => ({ codigo: !v.codigo, categoria: !v.categoria_id, minimo: !v.minimo, dias: !v.dias.length, horas: !v.desde && !v.hasta, vence: !v.vence, usos: !v.usos_max })[k];

  // Frase de resumen ("15 % de descuento en Sándwiches los martes de 12:00 a 16:00"). Texto plano: se escapa al pintar.
  function resumen(v) {
    const val = Number(v.valor) || 0, cat = v.categoria_id ? C.categorias.find((c) => c.id === Number(v.categoria_id))?.nombre : '';
    const dias = [...v.dias].sort().map((d) => DIAS_L[d]), l = dias.length > 1 ? `${dias.slice(0, -1).join(', ')} y ${dias.at(-1)}` : dias[0];
    return [`${v.tipo === 'pct' ? `${val} %` : clp(val)} de descuento`, cat ? `en ${cat}` : '', l && v.dias.length < 7 ? `los ${l}` : '',
      v.desde && v.hasta ? `de ${v.desde} a ${v.hasta}` : '', v.minimo ? `desde ${clp(v.minimo)} de pedido` : '',
      v.codigo ? `con el código ${String(v.codigo).toUpperCase()}` : '', v.vence ? `hasta el ${new Date(`${v.vence}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })}` : '',
      v.usos_max ? `(máx. ${v.usos_max} usos)` : ''].filter(Boolean).join(' ');
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
      usos: `<div class="field"><label for="prUsos">Máximo de usos <span class="opc">(opcional)</span></label><input id="prUsos" inputmode="numeric" value="${v.usos_max || ''}"></div>`
    }[k];
  }

  function pasoTipo() {
    return `<section class="cardf" id="prForm"><h3>¿Qué quieres hacer?</h3><p class="ayuda top">Elige el tipo de promoción. Después solo te pedimos lo necesario.</p>
      <div class="prtipos">${Object.entries(TIPOS).map(([k, x]) => `<button type="button" class="prtipo" data-prtipo="${k}"><b>${x.t}</b><span>${x.d}</span><em>${x.e}</em></button>`).join('')}
        <button type="button" class="prtipo" data-prcombo><b>Combo</b><span>Un producto de la carta con su precio propio y los productos que incluye.</span><em>Ej. "Completo + bebida + papas a precio fijo"</em></button></div>
      <div style="margin-top:10px"><button class="ghost" data-prcancel type="button">Cancelar</button></div></section>`;
  }

  function form(p) {
    const v = p || { nombre: '', tipo: 'pct', valor: 10, codigo: '', dias: [], desde: '', hasta: '', minimo: 0, categoria_id: null, vence: '', usos_max: null, activa: true };
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

  function filaCombo(x = { producto_id: '', cantidad: 1 }) {
    return `<div class="dos" data-cbrow><select data-cbp><option value="">Elegir producto…</option>${productos().filter((p) => p.id !== comboDe && !p.combo).map((p) =>
      `<option value="${p.id}" ${p.id === x.producto_id ? 'selected' : ''}>${esc(p.nombre)} · ${esc(p.cat)}</option>`).join('')}</select>
      <div style="display:flex;gap:6px"><input data-cbc inputmode="numeric" value="${x.cantidad}" aria-label="Cantidad" style="width:70px"><button class="link peligro" data-cbquitar type="button">Quitar</button></div></div>`;
  }
  function editorCombo() {
    const p = productos().find((x) => x.id === comboDe);
    return `<section class="cardf" id="cbForm"><h3>Combo: ${esc(p.nombre)} <span class="opc">(${clp(p.precio)})</span></h3>
      <p class="ayuda">Qué incluye. La carta lo muestra y, con inventario, cada venta descuenta los insumos de cada producto.</p>
      <div id="cbRows">${(p.combo || []).map(filaCombo).join('') || filaCombo()}</div>
      <button class="ghostb" data-cbmas type="button">${ico('plus')}Agregar producto</button>
      <div class="formerr" id="cbErr" role="alert"></div>
      <div style="display:flex;gap:8px;margin-top:10px"><button class="ghost" data-cbcancel type="button">Cancelar</button><button class="primary" data-cbguardar type="button">Guardar combo</button></div></section>`;
  }

  async function pintar(el) {
    [{ promociones: P }, C] = await Promise.all([api('panel/promos'), api('panel/carta')]);
    const combos = productos().filter((p) => p.combo);
    el.innerHTML = `<div class="res-head"><h2 class="t" style="margin:0">Promociones</h2>
        <button class="primary chico" data-prnuevo style="width:auto;flex:none;padding:0 18px">${ico('plus')}Nueva promoción</button></div>
      <p class="ayuda">Cada pedido lleva la promoción que más le descuenta. El descuento no toca el despacho. Las automáticas se anuncian en la carta; las de código, solo las conoce quien tiene el código.</p>
      ${edit === null ? '' : edit === 0 && !tipoSel ? pasoTipo() : form(P.find((p) => p.id === edit))}
      ${P.length ? `<table><tr><th>Promoción</th><th>Descuento</th><th>Cuándo</th><th class="r">Usos</th><th></th></tr>${P.map((p) => `<tr class="${p.activa ? '' : 'off'}">
        <td><b>${esc(p.nombre)}</b>${p.activa ? '' : ' <span class="opc">(pausada)</span>'}<div class="opc">${esc(resumen(p))}</div></td><td>${desc(p)}${p.categoria_id ? ` <span class="opc">en ${esc(C.categorias.find((c) => c.id === p.categoria_id)?.nombre || '')}</span>` : ''}</td>
        <td>${cuando(p)}</td><td class="r">${p.usos}${p.usos_max ? ` / ${p.usos_max}` : ''}</td>
        <td class="r"><button class="link" data-preditar="${p.id}">Editar</button> <button class="link" data-prpausa="${p.id}">${p.activa ? 'Pausar' : 'Activar'}</button></td></tr>`).join('')}</table>`
        : edit === null ? '<div class="cardf vacio" style="padding:28px">Aún no hay promociones. Ideas: un día flojo con 15 % ("Martes de churrasco"), un código para Instagram o un monto fijo desde cierto pedido.</div>' : ''}
      <div class="res-head" id="cbSec" style="margin-top:24px"><h2 class="t" style="margin:0">Combos</h2>
        <select id="cbElegir" style="width:auto"><option value="">Armar combo con…</option>${productos().filter((p) => !p.combo).map((p) => `<option value="${p.id}">${esc(p.nombre)} · ${esc(p.cat)}</option>`).join('')}</select></div>
      <p class="ayuda">Un combo es un producto de la carta con su precio propio (créalo en Carta y precios, por ejemplo en una categoría "Combos") y los productos que incluye.</p>
      ${comboDe ? editorCombo() : ''}
      ${combos.length ? `<table><tr><th>Combo</th><th>Incluye</th><th class="r">Precio</th><th class="r">Suma suelta</th><th></th></tr>${combos.map((p) => {
        const suelto = p.combo.reduce((s, x) => s + (productos().find((q) => q.id === x.producto_id)?.precio || 0) * x.cantidad, 0);
        return `<tr><td><b>${esc(p.nombre)}</b></td><td>${p.combo.map((x) => `${x.cantidad > 1 ? x.cantidad + '× ' : ''}${esc(x.nombre)}`).join(' + ')}</td><td class="r">${clp(p.precio)}</td>
          <td class="r opc">${clp(suelto)}${suelto > p.precio ? ` (ahorra ${clp(suelto - p.precio)})` : ''}</td><td class="r"><button class="link" data-cbeditar="${p.id}">Editar</button></td></tr>`; }).join('')}</table>`
        : comboDe ? '' : '<div class="cardf vacio" style="padding:20px">Sin combos todavía.</div>'}`;
  }

  function conectar(el) {
    const n = (id) => Number(String($(id).value).replace(/\D/g, '')) || 0;
    // Lee el formulario tal como lo enviará "Guardar" (mismo payload de siempre) y alimenta la frase de resumen.
    const leer = () => ({ nombre: $('prNom').value, codigo: $('prCod').value.trim() || null, tipo: $('prTipo').value, valor: n('prVal'),
      dias: [...el.querySelectorAll('[data-prdia][aria-pressed="true"]')].map((x) => Number(x.dataset.prdia)), desde: $('prDesde').value || null, hasta: $('prHasta').value || null,
      categoria_id: $('prCat').value ? Number($('prCat').value) : null, minimo: n('prMin'), vence: $('prVence').value || null, usos_max: n('prUsos') || null, activa: $('prAct').checked });
    const actualizar = () => { if ($('prResumen')) $('prResumen').textContent = resumen(leer()); };
    el.addEventListener('input', (e) => { if (e.target.closest('#prForm')) actualizar(); });
    el.addEventListener('change', (e) => {
      if (e.target.closest('#prForm')) actualizar();
      if (e.target.id === 'cbElegir' && e.target.value) { comboDe = Number(e.target.value); pintar(el); }
    });
    el.addEventListener('click', async (e) => {
      const t = (s) => e.target.closest(s);
      let b;
      if (t('[data-prnuevo]')) { edit = 0; tipoSel = null; return pintar(el); }
      if ((b = t('[data-prtipo]'))) { tipoSel = b.dataset.prtipo; return pintar(el); }
      if (t('[data-prvolver]')) { tipoSel = null; return pintar(el); }
      if (t('[data-prcombo]')) { edit = null; tipoSel = null; await pintar(el); toast('Elige el producto que será el combo'); $('cbSec').scrollIntoView({ block: 'start' }); $('cbElegir').focus(); return; }
      if ((b = t('[data-preditar]'))) { edit = Number(b.dataset.preditar); tipoSel = tipoDe(P.find((p) => p.id === edit)); return pintar(el); }
      if (t('[data-prcancel]')) { edit = null; tipoSel = null; return pintar(el); }
      if ((b = t('[data-prdia]'))) { b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'); return actualizar(); }
      if ((b = t('[data-prpausa]'))) {
        const p = P.find((x) => x.id === Number(b.dataset.prpausa));
        try { await api(`panel/promos/${p.id}`, { method: 'PATCH', body: { activa: !p.activa } }); toast(p.activa ? 'Promoción pausada' : 'Promoción activa'); pintar(el); } catch (err) { alert(err.message); }
        return;
      }
      if (t('[data-prguardar]')) {
        const body = leer();
        const falta = { codigo: !body.codigo && ['prCod', 'Escribe el código que usarán los clientes'], categoria: !body.categoria_id && ['prCat', 'Elige la categoría'], minimo: !body.minimo && ['prMin', 'Escribe el monto mínimo de compra'] }[tipoSel];
        if (falta) { $('prErr').textContent = falta[1]; $(falta[0]).focus(); return; }
        try { await api(edit ? `panel/promos/${edit}` : 'panel/promos', { method: edit ? 'PATCH' : 'POST', body }); toast('Promoción guardada'); edit = null; tipoSel = null; pintar(el); }
        catch (err) { $('prErr').textContent = err.message; }
        return;
      }
      if ((b = t('[data-cbeditar]'))) { comboDe = Number(b.dataset.cbeditar); return pintar(el); }
      if (t('[data-cbcancel]')) { comboDe = null; return pintar(el); }
      if (t('[data-cbmas]')) return $('cbRows').insertAdjacentHTML('beforeend', filaCombo());
      if ((b = t('[data-cbquitar]'))) return b.closest('[data-cbrow]').remove();
      if (t('[data-cbguardar]')) {
        const items = [...el.querySelectorAll('[data-cbrow]')].map((r) => ({ producto_id: Number(r.querySelector('[data-cbp]').value), cantidad: Number(r.querySelector('[data-cbc]').value) || 1 })).filter((x) => x.producto_id);
        try { await api(`panel/combos/${comboDe}`, { method: 'PUT', body: { items } }); toast(items.length ? 'Combo guardado' : 'Ya no es combo'); comboDe = null; pintar(el); }
        catch (err) { $('cbErr').textContent = err.message; }
      }
    });
  }
  return { pintar, conectar };
}
