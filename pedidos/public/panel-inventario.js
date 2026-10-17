// Panel: pestaña Inventario (plan Pro). Insumos con stock y alerta, compras, conteos y mermas,
// y la receta de cada producto (con su costo real, que reemplaza el costo estimado).
export function crearInventarioUI({ $, ico, toast, api, clp, esc }) {
  let I = null, C = null, modo = null, recetaDe = null;
  const cant = (n, u) => `${String(Math.round(n * 1000) / 1000).replace('.', ',')} ${u}`;
  const num = (v) => Number(String(v ?? '').replace(',', '.'));
  const opcInsumos = (sel) => I.insumos.map((i) => `<option value="${i.id}" ${i.id === sel ? 'selected' : ''}>${esc(i.nombre)} (${i.unidad})</option>`).join('');
  const productos = () => C.categorias.flatMap((c) => c.productos.map((p) => ({ ...p, cat: c.nombre })));
  const costoReceta = (lista) => lista.reduce((s, r) => s + r.cantidad * (I.insumos.find((i) => i.id === r.insumo_id)?.costo || 0), 0);

  function formulario() {
    if (!modo) return '';
    const pie = (txt) => `<div class="formerr" id="ivErr" role="alert"></div><div style="display:flex;gap:8px;margin-top:10px"><button class="ghost" data-ivcancel type="button">Cancelar</button><button class="primary" data-ivok="${modo.tipo}" type="button">${txt}</button></div></section>`;
    if (modo.tipo === 'insumo') {
      const v = I.insumos.find((i) => i.id === modo.id) || { nombre: '', unidad: 'un', costo: '', minimo: '', proveedor: '' };
      return `<section class="cardf"><h3>${modo.id ? 'Editar insumo' : 'Nuevo insumo'}</h3>
        <div class="dos"><div class="field"><label for="ivNom">Nombre</label><input id="ivNom" maxlength="60" value="${esc(v.nombre)}" placeholder="Ej. Pan frica"></div>
          <div class="field"><label for="ivUni">Unidad</label><select id="ivUni">${Object.entries(I.unidades).map(([k, n]) => `<option value="${k}" ${k === v.unidad ? 'selected' : ''}>${n}</option>`).join('')}</select></div></div>
        <div class="dos"><div class="field"><label for="ivCosto">Costo por unidad ($)</label><input id="ivCosto" inputmode="decimal" value="${v.costo}"></div>
          <div class="field"><label for="ivMin">Avisar bajo</label><input id="ivMin" inputmode="decimal" value="${v.minimo}"></div></div>
        <div class="dos"><div class="field"><label for="ivProv">Proveedor <span class="opc">(opcional)</span></label><input id="ivProv" maxlength="60" value="${esc(v.proveedor || '')}"></div>
          ${modo.id ? '' : '<div class="field"><label for="ivStock">Stock inicial</label><input id="ivStock" inputmode="decimal" placeholder="0"></div>'}</div>
        ${modo.id ? '<button class="link peligro" data-ivarchivar type="button">Archivar insumo</button>' : ''}${pie('Guardar')}`;
    }
    if (modo.tipo === 'compra') return `<section class="cardf"><h3>Registrar compra</h3>
      <div class="dos"><div class="field"><label for="ivIns">Insumo</label><select id="ivIns">${opcInsumos(modo.id)}</select></div>
        <div class="field"><label for="ivCant">Cantidad comprada</label><input id="ivCant" inputmode="decimal"></div></div>
      <div class="dos"><div class="field"><label for="ivTot">Total pagado ($)</label><input id="ivTot" inputmode="numeric"></div>
        <div class="field"><label for="ivProv">Proveedor <span class="opc">(opcional)</span></label><input id="ivProv" maxlength="60"></div></div>
      <label class="chk"><input type="checkbox" id="ivGasto" checked> Anotarla también como gasto de insumos</label>
      <div class="field" id="ivMedioW"><label for="ivMedio">Cómo se pagó</label><select id="ivMedio"><option value="efectivo">Efectivo (sale de la caja)</option><option value="transferencia">Transferencia</option><option value="tarjeta">Tarjeta</option><option value="otro">Otro</option></select></div>
      <p class="ayuda">El costo del insumo queda como el promedio entre lo que había y lo comprado.</p>${pie('Registrar compra')}`;
    return `<section class="cardf"><h3>Contar o anotar merma</h3>
      <div class="dos"><div class="field"><label for="ivIns">Insumo</label><select id="ivIns">${opcInsumos(modo.id)}</select></div>
        <div class="field"><label for="ivAj">Qué pasó</label><select id="ivAj"><option value="conteo">Lo conté: hay esta cantidad</option><option value="merma">Se perdió o venció esta cantidad</option></select></div></div>
      <div class="dos"><div class="field"><label for="ivCant">Cantidad</label><input id="ivCant" inputmode="decimal"></div>
        <div class="field"><label for="ivNota">Nota <span class="opc">(opcional)</span></label><input id="ivNota" maxlength="120"></div></div>${pie('Guardar')}`;
  }

  function editorReceta() {
    const p = productos().find((x) => x.id === recetaDe), lista = I.recetas[recetaDe] || [];
    const fila = (r = { insumo_id: '', cantidad: '' }) => `<div class="dos" data-rcrow><select data-rci><option value="">Elegir insumo…</option>${opcInsumos(r.insumo_id)}</select>
      <div style="display:flex;gap:6px"><input data-rcc inputmode="decimal" value="${r.cantidad}" placeholder="Cantidad" style="width:110px"><button class="link peligro" data-rcquitar type="button">Quitar</button></div></div>`;
    return `<section class="cardf"><h3>Receta: ${esc(p.nombre)}</h3><p class="ayuda">Cuánto de cada insumo lleva una unidad. Costo actual: <b>${clp(costoReceta(lista))}</b> de ${clp(p.precio)}.</p>
      <div id="rcRows">${lista.map(fila).join('') || fila()}</div><template id="rcFila">${fila()}</template>
      <button class="ghostb" data-rcmas type="button">${ico('plus')}Agregar insumo</button><div class="formerr" id="rcErr" role="alert"></div>
      <div style="display:flex;gap:8px;margin-top:10px"><button class="ghost" data-rccancel type="button">Cancelar</button><button class="primary" data-rcok type="button">Guardar receta</button></div></section>`;
  }

  async function pintar(el) {
    [I, C] = await Promise.all([api('panel/inventario'), api('panel/carta')]);
    const sinReceta = productos().filter((p) => !I.recetas[p.id] && !p.combo && p.activo);
    el.innerHTML = `<div class="res-head"><h2 class="t" style="margin:0">Inventario</h2><div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="ghost chico" data-ivnuevo="ajuste" ${I.insumos.length ? '' : 'disabled'}>Contar / merma</button>
        <button class="ghost chico" data-ivnuevo="compra" ${I.insumos.length ? '' : 'disabled'}>${ico('cart')}Compra</button>
        <button class="primary chico" data-ivnuevo="insumo" style="width:auto;flex:none;padding:0 18px">${ico('plus')}Insumo</button></div></div>
      <div class="kpis"><div>Insumos<b class="num">${I.insumos.length}</b><span class="sub">${I.bajos ? `<span class="tarde">${I.bajos} bajo el mínimo</span>` : 'Todo sobre el mínimo'}</span></div>
        <div>Inventario valorizado<b class="num">${clp(I.valorizado)}</b><span class="sub">Stock × costo</span></div>
        <div>Productos con receta<b class="num">${Object.keys(I.recetas).length}</b><span class="sub">${sinReceta.length} sin receta</span></div></div>
      ${formulario()}${recetaDe ? editorReceta() : ''}
      ${I.insumos.length ? `<table><tr><th>Insumo</th><th class="r">Stock</th><th class="r">Mínimo</th><th class="r">Costo</th><th>Proveedor</th><th></th></tr>${I.insumos.map((i) => `<tr>
        <td><b>${esc(i.nombre)}</b>${i.productos ? ` <span class="opc">· en ${i.productos} producto${i.productos === 1 ? '' : 's'}</span>` : ''}</td>
        <td class="r ${i.bajo ? 'tarde' : ''}">${cant(i.stock, i.unidad)}${i.bajo ? ' ⚠' : ''}</td><td class="r opc">${cant(i.minimo, i.unidad)}</td><td class="r">${clp(i.costo)}/${i.unidad}</td>
        <td>${esc(i.proveedor || '')}</td><td class="r"><button class="link" data-ivcompra="${i.id}">Compra</button> <button class="link" data-iveditar="${i.id}">Editar</button></td></tr>`).join('')}</table>`
        : '<div class="cardf vacio" style="padding:28px">Agrega los insumos que más cuestan (pan, carne, palta, queso, bebidas, envases). Después, en cada producto, anota cuánto lleva: cada venta los descuenta solos y el panel avisa cuando algo se está acabando.</div>'}
      ${I.insumos.length ? `<h3 style="margin-top:22px">Recetas</h3><div class="field" style="max-width:420px"><label for="rcElegir">Editar la receta de</label><select id="rcElegir"><option value="">Elegir producto…</option>${productos().filter((p) => !p.combo).map((p) =>
        `<option value="${p.id}">${I.recetas[p.id] ? '✓ ' : ''}${esc(p.nombre)} · ${esc(p.cat)}</option>`).join('')}</select></div>
        <details class="tabla"><summary>Últimos movimientos</summary><div id="ivMovs">Cargando…</div></details>` : ''}`;
    el.querySelector('details.tabla')?.addEventListener('toggle', async (e) => {
      if (!e.target.open) return;
      const { movimientos } = await api('panel/inventario/movimientos');
      const T = { compra: 'Compra', venta: 'Venta', anulacion: 'Anulación', conteo: 'Conteo', merma: 'Merma', ajuste: 'Inicial' };
      $('ivMovs').innerHTML = `<table><tr><th>Fecha</th><th>Insumo</th><th>Tipo</th><th class="r">Cantidad</th><th>Detalle</th></tr>${movimientos.map((m) => `<tr><td>${esc(m.creado.slice(5, 16))}</td><td>${esc(m.nombre)}</td>
        <td>${T[m.tipo] || m.tipo}${m.pedido_id ? ` <span class="opc">(pedido)</span>` : ''}</td><td class="r">${m.cantidad > 0 ? '+' : ''}${cant(m.cantidad, m.unidad)}</td><td>${esc(m.nota || '')}${m.usuario ? ` <span class="opc">${esc(m.usuario)}</span>` : ''}</td></tr>`).join('')}</table>`;
    });
  }

  function conectar(el) {
    el.addEventListener('change', (e) => {
      if (e.target.id === 'rcElegir' && e.target.value) { recetaDe = Number(e.target.value); modo = null; pintar(el); }
      if (e.target.id === 'ivGasto') $('ivMedioW').hidden = !e.target.checked;
    });
    el.addEventListener('click', async (e) => {
      const t = (s) => e.target.closest(s);
      let b;
      if ((b = t('[data-ivnuevo]'))) { modo = { tipo: b.dataset.ivnuevo, id: null }; recetaDe = null; return pintar(el); }
      if ((b = t('[data-iveditar]'))) { modo = { tipo: 'insumo', id: Number(b.dataset.iveditar) }; return pintar(el); }
      if ((b = t('[data-ivcompra]'))) { modo = { tipo: 'compra', id: Number(b.dataset.ivcompra) }; return pintar(el); }
      if (t('[data-ivcancel]')) { modo = null; return pintar(el); }
      const guardar = async (ruta, method, body, msg) => {
        try { await api(ruta, { method, body }); toast(msg); modo = null; pintar(el); } catch (err) { $('ivErr').textContent = err.message; }
      };
      if (t('[data-ivarchivar]') && confirm('¿Archivar este insumo? Deja de aparecer y se quita de las recetas al editarlas.')) return guardar(`panel/inventario/insumos/${modo.id}`, 'PATCH', { archivado: true }, 'Insumo archivado');
      if ((b = t('[data-ivok]'))) {
        const k = b.dataset.ivok;
        if (k === 'insumo') return guardar(modo.id ? `panel/inventario/insumos/${modo.id}` : 'panel/inventario/insumos', modo.id ? 'PATCH' : 'POST',
          { nombre: $('ivNom').value, unidad: $('ivUni').value, costo: num($('ivCosto').value) || 0, minimo: num($('ivMin').value) || 0, proveedor: $('ivProv').value, stock: $('ivStock') ? num($('ivStock').value) || 0 : undefined }, 'Insumo guardado');
        if (k === 'compra') return guardar('panel/inventario/compras', 'POST', { insumo_id: Number($('ivIns').value), cantidad: num($('ivCant').value), total: Number($('ivTot').value.replace(/\D/g, '')) || 0,
          proveedor: $('ivProv').value || null, gasto: $('ivGasto').checked, medio: $('ivMedio').value }, 'Compra registrada');
        return guardar('panel/inventario/ajustes', 'POST', { insumo_id: Number($('ivIns').value), tipo: $('ivAj').value, cantidad: num($('ivCant').value), nota: $('ivNota').value }, 'Stock actualizado');
      }
      if (t('[data-rccancel]')) { recetaDe = null; return pintar(el); }
      if (t('[data-rcmas]')) return $('rcRows').insertAdjacentHTML('beforeend', $('rcFila').innerHTML);
      if ((b = t('[data-rcquitar]'))) return b.closest('[data-rcrow]').remove();
      if (t('[data-rcok]')) {
        const items = [...el.querySelectorAll('#rcRows [data-rcrow]')].map((r) => ({ insumo_id: Number(r.querySelector('[data-rci]').value), cantidad: num(r.querySelector('[data-rcc]').value) })).filter((x) => x.insumo_id);
        try { const r = await api(`panel/inventario/recetas/${recetaDe}`, { method: 'PUT', body: { items } }); toast(`Receta guardada · costo ${clp(r.costo ?? 0)}`); recetaDe = null; pintar(el); }
        catch (err) { $('rcErr').textContent = err.message; }
      }
    });
  }
  return { pintar, conectar };
}
