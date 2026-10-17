// Panel: pestaña Promociones (plan Pro). Promociones automáticas por día y horario o con código,
// y combos (un producto de la carta con los productos que incluye).
export function crearPromosUI({ $, ico, toast, api, clp, esc }) {
  const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  let P = [], C = null, edit = null, comboDe = null;
  const desc = (p) => (p.tipo === 'pct' ? `${p.valor} %` : clp(p.valor));
  const cuando = (p) => [p.codigo ? `Código <b>${esc(p.codigo)}</b>` : 'Automática',
    p.dias.length ? p.dias.map((d) => DIAS[d]).join(', ') : 'todos los días', p.desde ? `${p.desde}–${p.hasta}` : '',
    p.minimo ? `desde ${clp(p.minimo)}` : '', p.vence ? `hasta el ${new Date(`${p.vence}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}` : ''].filter(Boolean).join(' · ');
  const productos = () => C.categorias.flatMap((c) => c.productos.map((p) => ({ ...p, cat: c.nombre })));

  function form(p) {
    const v = p || { nombre: '', tipo: 'pct', valor: 10, codigo: '', dias: [], desde: '', hasta: '', minimo: 0, categoria_id: null, vence: '', usos_max: null, activa: true };
    return `<section class="cardf" id="prForm"><h3>${p ? 'Editar promoción' : 'Nueva promoción'}</h3>
      <div class="dos"><div class="field"><label for="prNom">Nombre (lo ve el cliente)</label><input id="prNom" maxlength="60" value="${esc(v.nombre)}" placeholder="Ej. Martes de churrasco"></div>
        <div class="field"><label for="prCod">Código <span class="opc">(opcional: vacío = se aplica sola)</span></label><input id="prCod" maxlength="16" value="${esc(v.codigo || '')}" placeholder="Ej. VUELVE10" style="text-transform:uppercase"></div></div>
      <div class="dos"><div class="field"><label for="prTipo">Descuento</label><select id="prTipo"><option value="pct" ${v.tipo === 'pct' ? 'selected' : ''}>Porcentaje (%)</option><option value="monto" ${v.tipo === 'monto' ? 'selected' : ''}>Monto fijo ($)</option></select></div>
        <div class="field"><label for="prVal">Valor</label><input id="prVal" inputmode="numeric" value="${v.valor}"></div></div>
      <div class="field"><span class="lbl">Días <span class="opc">(ninguno = todos)</span></span><div class="medios dias" role="group" aria-label="Días">${DIAS.map((d, i) =>
        `<button type="button" data-prdia="${i}" aria-pressed="${v.dias.includes(i)}">${d}</button>`).join('')}</div></div>
      <div class="dos"><div class="field"><label for="prDesde">Desde <span class="opc">(hora, opcional)</span></label><input id="prDesde" type="time" value="${v.desde || ''}"></div>
        <div class="field"><label for="prHasta">Hasta</label><input id="prHasta" type="time" value="${v.hasta || ''}"></div></div>
      <div class="dos"><div class="field"><label for="prCat">Solo en la categoría <span class="opc">(opcional)</span></label><select id="prCat"><option value="">Todo el pedido</option>${C.categorias.map((c) =>
        `<option value="${c.id}" ${c.id === v.categoria_id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></div>
        <div class="field"><label for="prMin">Pedido mínimo <span class="opc">($, opcional)</span></label><input id="prMin" inputmode="numeric" value="${v.minimo || ''}"></div></div>
      <div class="dos"><div class="field"><label for="prVence">Termina el <span class="opc">(opcional)</span></label><input id="prVence" type="date" value="${v.vence || ''}"></div>
        <div class="field"><label for="prUsos">Máximo de usos <span class="opc">(opcional)</span></label><input id="prUsos" inputmode="numeric" value="${v.usos_max || ''}"></div></div>
      <label class="chk"><input type="checkbox" id="prAct" ${v.activa ? 'checked' : ''}> Activa</label>
      <div class="formerr" id="prErr" role="alert"></div>
      <div style="display:flex;gap:8px;margin-top:10px"><button class="ghost" data-prcancel type="button">Cancelar</button><button class="primary" data-prguardar type="button">Guardar</button></div></section>`;
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
      ${edit !== null ? form(P.find((p) => p.id === edit)) : ''}
      ${P.length ? `<table><tr><th>Promoción</th><th>Descuento</th><th>Cuándo</th><th class="r">Usos</th><th></th></tr>${P.map((p) => `<tr class="${p.activa ? '' : 'off'}">
        <td><b>${esc(p.nombre)}</b>${p.activa ? '' : ' <span class="opc">(pausada)</span>'}</td><td>${desc(p)}${p.categoria_id ? ` <span class="opc">en ${esc(C.categorias.find((c) => c.id === p.categoria_id)?.nombre || '')}</span>` : ''}</td>
        <td>${cuando(p)}</td><td class="r">${p.usos}${p.usos_max ? ` / ${p.usos_max}` : ''}</td>
        <td class="r"><button class="link" data-preditar="${p.id}">Editar</button> <button class="link" data-prpausa="${p.id}">${p.activa ? 'Pausar' : 'Activar'}</button></td></tr>`).join('')}</table>`
        : edit === null ? '<div class="cardf vacio" style="padding:28px">Aún no hay promociones. Ideas: un día flojo con 15 % ("Martes de churrasco"), un código para Instagram o un monto fijo desde cierto pedido.</div>' : ''}
      <div class="res-head" style="margin-top:24px"><h2 class="t" style="margin:0">Combos</h2>
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
    el.addEventListener('change', (e) => { if (e.target.id === 'cbElegir' && e.target.value) { comboDe = Number(e.target.value); pintar(el); } });
    el.addEventListener('click', async (e) => {
      const t = (s) => e.target.closest(s);
      let b;
      if (t('[data-prnuevo]')) { edit = 0; return pintar(el); }
      if ((b = t('[data-preditar]'))) { edit = Number(b.dataset.preditar); return pintar(el); }
      if (t('[data-prcancel]')) { edit = null; return pintar(el); }
      if ((b = t('[data-prdia]'))) return b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true');
      if ((b = t('[data-prpausa]'))) {
        const p = P.find((x) => x.id === Number(b.dataset.prpausa));
        try { await api(`panel/promos/${p.id}`, { method: 'PATCH', body: { activa: !p.activa } }); toast(p.activa ? 'Promoción pausada' : 'Promoción activa'); pintar(el); } catch (err) { alert(err.message); }
        return;
      }
      if (t('[data-prguardar]')) {
        const body = { nombre: $('prNom').value, codigo: $('prCod').value.trim() || null, tipo: $('prTipo').value, valor: n('prVal'),
          dias: [...el.querySelectorAll('[data-prdia][aria-pressed="true"]')].map((x) => Number(x.dataset.prdia)), desde: $('prDesde').value || null, hasta: $('prHasta').value || null,
          categoria_id: $('prCat').value ? Number($('prCat').value) : null, minimo: n('prMin'), vence: $('prVence').value || null, usos_max: n('prUsos') || null, activa: $('prAct').checked };
        try { await api(edit ? `panel/promos/${edit}` : 'panel/promos', { method: edit ? 'PATCH' : 'POST', body }); toast('Promoción guardada'); edit = null; pintar(el); }
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
