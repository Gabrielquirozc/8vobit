// Panel: pestaña Clientes (plan Gestión). Quién compra por la carta, cuánto y cada cuánto,
// y el cupón de vuelta que se le da al cliente después de cada pedido para que vuelva.
export function crearClientesUI({ $, ico, toast, api, clp, esc, fmtTel, puede = () => true }) {
  let K = null, q = '', grupo = '';
  const TIPO = { frecuente: ['Frecuentes', 'Más de un pedido y compró hace poco'], nuevo: ['Nuevos', 'Primer pedido en los últimos 30 días'],
    dormido: ['Dormidos', 'Compraban y llevan más de 45 días sin pedir'], una_vez: ['Una sola vez', 'Pidieron una vez, hace más de 30 días'] };
  const fecha = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
  const wa = (c) => `https://wa.me/${c.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${c.nombre.split(' ')[0]}, `)}`;

  function fidelizacion() {
    const f = K.fidelizacion;
    return `<section class="cardf"><header class="sh"><h3>Cupón de vuelta</h3><span class="sp"></span>
        <label class="sw" title="Activar"><input type="checkbox" id="fdAct" ${f.activo ? 'checked' : ''} ${puede('carta') ? '' : 'disabled'} aria-label="Activar cupón de vuelta"><span></span></label></header>
      <p class="ayuda top">Después de cada pedido por la carta, el cliente recibe un código de un solo uso para su próximo pedido (lo ve al confirmar y en el seguimiento). Es la forma más barata de que vuelva al canal propio en vez de a la app.</p>
      <div class="dos"><div class="field"><label for="fdPct">Descuento (%)</label><input id="fdPct" inputmode="numeric" value="${f.pct}"></div>
        <div class="field"><label for="fdDias">Vale por (días)</label><input id="fdDias" inputmode="numeric" value="${f.dias}"></div></div>
      <div class="field"><label for="fdMin">Desde un pedido de ($, opcional)</label><input id="fdMin" inputmode="numeric" value="${f.minimo || ''}"></div>
      ${puede('carta') ? '<button class="primary chico" data-fdok type="button" style="width:auto;padding:0 18px">Guardar</button>' : ''}
      <p class="ayuda">${K.cupones} cupón${K.cupones === 1 ? '' : 'es'} entregado${K.cupones === 1 ? '' : 's'} hasta ahora.</p></section>`;
  }

  async function pintar(el) {
    K = await api(`panel/clientes${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    const lista = grupo ? K.clientes.filter((c) => c.tipo === grupo) : K.clientes;
    el.innerHTML = `<div class="res-head"><h2 class="t" style="margin:0">Clientes</h2>
        <label class="search" style="max-width:320px"><svg class="ico"><use href="#i-search"/></svg><span class="sr">Buscar cliente</span><input id="clQ" type="search" placeholder="Nombre o celular…" value="${esc(q)}" autocomplete="off"></label></div>
      <p class="ayuda">Clientes de la carta online (la venta de mostrador no guarda datos). Los pedidos se anonimizan pasado el plazo de la política de privacidad y entonces el cliente deja de aparecer.</p>
      <div class="kpis"><div>Clientes<b class="num">${K.total}</b><span class="sub">${K.vuelven} % volvió a pedir</span></div>
        ${Object.entries(TIPO).map(([k, [n, ay]]) => `<button class="kpi-b ${grupo === k ? 'on' : ''}" data-clg="${k}" title="${ay}">${n}<b class="num">${K.grupos[k]}</b><span class="sub">${ay}</span></button>`).join('')}</div>
      ${fidelizacion()}
      ${lista.length ? `<table><tr><th>Cliente</th><th class="r">Pedidos</th><th class="r">Total</th><th class="r">Promedio</th><th>Último pedido</th><th></th></tr>${lista.map((c) => `<tr>
        <td><b>${esc(c.nombre)}</b><br><span class="opc">${esc(fmtTel ? fmtTel(c.telefono.replace(/\D/g, '')) : c.telefono)} · ${TIPO[c.tipo][0].replace(/s$/, '').toLowerCase()}</span></td>
        <td class="r">${c.pedidos}</td><td class="r">${clp(c.total)}</td><td class="r">${clp(c.promedio)}</td><td>${fecha(c.ultimo)} <span class="opc">(hace ${c.dias} d)</span></td>
        <td class="r"><button class="link" data-clver="${c.clave}">Ver</button> <a class="link" href="${wa(c)}" target="_blank" rel="noopener">${ico('msg')}WhatsApp</a></td></tr>
        <tr hidden data-cldet="${c.clave}"><td colspan="6"></td></tr>`).join('')}</table>`
        : `<div class="cardf vacio" style="padding:28px">${q || grupo ? 'Ningún cliente coincide.' : 'Aún no hay pedidos por la carta online.'}</div>`}`;
  }

  function conectar(el) {
    let espera = 0;
    el.addEventListener('input', (e) => { if (e.target.id !== 'clQ') return; clearTimeout(espera); espera = setTimeout(async () => { q = e.target.value; await pintar(el); const i = $('clQ'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 350); });
    el.addEventListener('click', async (e) => {
      const t = (s) => e.target.closest(s);
      let b;
      if ((b = t('[data-clg]'))) { grupo = grupo === b.dataset.clg ? '' : b.dataset.clg; return pintar(el); }
      if ((b = t('[data-clver]'))) {
        const fila = el.querySelector(`[data-cldet="${b.dataset.clver}"]`);
        if (!fila.hidden) { fila.hidden = true; return; }
        try {
          const d = await api(`panel/clientes/${b.dataset.clver}`);
          fila.firstElementChild.innerHTML = `<div style="display:flex;gap:24px;flex-wrap:wrap"><div><b>Lo que más pide</b><br>${d.productos.map((p) => `${esc(p.nombre)} <span class="opc">×${p.n}</span>`).join('<br>') || '—'}</div>
            <div><b>Pedidos</b><br>${d.pedidos.map((p) => `${fecha(p.dia)} · #${p.numero} · ${clp(p.total)}${p.descuento ? ` <span class="opc">(−${clp(p.descuento)} ${esc(p.promo_nombre || '')})</span>` : ''}${p.estado === 'anulado' ? ' <span class="tarde">anulado</span>' : ''}`).join('<br>')}</div></div>`;
          fila.hidden = false;
        } catch (err) { alert(err.message); }
        return;
      }
      if (t('[data-fdok]')) {
        const n = (id) => Number(String($(id).value).replace(/\D/g, '')) || 0;
        try { await api('panel/clientes/fidelizacion', { method: 'PUT', body: { activo: $('fdAct').checked, pct: n('fdPct'), dias: n('fdDias'), minimo: n('fdMin') } }); toast('Cupón de vuelta guardado'); pintar(el); }
        catch (err) { alert(err.message); }
      }
    });
    el.addEventListener('change', async (e) => {
      if (e.target.id !== 'fdAct') return;
      try { await api('panel/clientes/fidelizacion', { method: 'PUT', body: { activo: e.target.checked } }); toast(e.target.checked ? 'Cupón de vuelta activo' : 'Cupón de vuelta apagado'); } catch (err) { alert(err.message); e.target.checked = !e.target.checked; }
    });
  }
  return { pintar, conectar };
}
