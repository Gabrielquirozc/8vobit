// Panel: entrada (clave del local o PIN del equipo), quién está usando el panel, permisos por rol,
// aviso del estado de la cuenta, "Tu plan" y "Usuarios y PIN" (en Datos del local) y horas trabajadas.
// Las utilidades llegan desde el panel (ctx) para no cargar comun.js dos veces.
export function crearCuentaUI({ $, ico, toast, api, clp, esc }) {
  let YO = null;
  // Pestaña → permiso del rol y función del plan.
  const TABS = { pedidos: ['ver_pedidos'], venta: ['venta'], cierre: ['caja'], gastos: ['gastos'], resumen: ['resumen'],
    resultados: ['resultados', 'resultados'], carta: ['carta'], despacho: ['despacho'], equipo: ['equipo', 'equipo'], local: ['local'] };
  const PLAN_NOMBRE = { canal: 'Canal', gestion: 'Gestión', pro: 'Pro' };
  const PLAN_DE = { costos: 'gestion', equipo: 'gestion', exportar: 'gestion', resultados: 'gestion' };
  const ESTADO = { prueba: 'Prueba', activa: 'Activa', gracia: 'Pago pendiente', suspendida: 'Suspendida', cancelada: 'Cancelada' };
  const fecha = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }) : '—');

  const puede = (perm) => !!YO?.permisos?.[perm];
  const tiene = (f) => !YO?.licencia || YO.licencia.funciones.includes(f);
  const verCostos = () => puede('costos') && tiene('costos');

  // ---------- entrada ----------
  let modoClave = false, pin = '';
  async function pantallaEntrada(alEntrar) {
    const acc = await api('panel/acceso');
    const el = $('login'); el.hidden = false;
    const dev = acc.dispositivo;
    const param = new URLSearchParams(location.search).get('local');
    // Un enlace a otro local (?local=) pide la clave de ese local, no el PIN de esta tablet.
    const conPin = dev?.con_pin && !modoClave && (!param || param === dev.slug);
    const local = param || dev?.slug || '';
    if (conPin) {
      pin = '';
      el.innerHTML = `${dev.logo ? `<img src="${esc(dev.logo)}" alt="" style="height:44px;width:auto;display:block;margin:0 auto 8px">` : ''}
        <h1 style="text-align:center">${esc(dev.nombre)}</h1><p class="ayuda" style="text-align:center;margin:0 0 12px">Escribe tu PIN</p>
        <div class="pin-dots" id="pinDots" aria-live="polite"></div>
        <div class="pin-pad" role="group" aria-label="Teclado del PIN">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" data-n="${n}">${n}</button>`).join('')}
          <button type="button" data-n="borrar" aria-label="Borrar">${ico('left')}</button><button type="button" data-n="0">0</button><button type="button" class="ok" data-n="ok" aria-label="Entrar">${ico('check')}</button></div>
        <div class="formerr" id="loginErr" role="alert"></div>
        <div class="pin-turno"><button type="button" class="ghostb" data-turno="entrada">Marcar entrada</button><button type="button" class="ghostb" data-turno="salida">Marcar salida</button></div>
        <p style="text-align:center;margin:14px 0 0"><button type="button" class="link" id="aClave">Entrar con la clave del local</button></p>`;
      const dots = () => { $('pinDots').innerHTML = Array.from({ length: Math.max(4, pin.length) }, (_, i) => `<span class="${i < pin.length ? 'on' : ''}"></span>`).join(''); };
      dots();
      const enviar = async (ruta, extra = {}) => {
        if (pin.length < 4) { $('loginErr').textContent = 'El PIN tiene al menos 4 números.'; return null; }
        try { return await api(ruta, { method: 'POST', body: { pin, ...extra } }); } catch (e) { $('loginErr').textContent = e.message; pin = ''; dots(); return null; }
      };
      el.onclick = async (e) => {
        const b = e.target.closest('[data-n]'), t = e.target.closest('[data-turno]');
        if (e.target.closest('#aClave')) { modoClave = true; return pantallaEntrada(alEntrar); }
        if (t) {
          const r = await enviar('panel/turno', { tipo: t.dataset.turno });
          if (r) { toast(`✓ ${r.nombre}: ${t.dataset.turno === 'entrada' ? 'entrada' : 'salida'} marcada`); $('loginErr').textContent = ''; pin = ''; dots(); }
          return;
        }
        if (!b) return;
        $('loginErr').textContent = '';
        if (b.dataset.n === 'borrar') pin = pin.slice(0, -1);
        else if (b.dataset.n === 'ok') { if (await enviar('panel/pin')) { el.hidden = true; el.onclick = null; alEntrar(); } return; }
        else if (pin.length < 6) pin += b.dataset.n;
        dots();
      };
      document.onkeydown = (e) => {
        if (el.hidden) return;
        if (/^\d$/.test(e.key)) el.querySelector(`[data-n="${e.key}"]`)?.click();
        else if (e.key === 'Backspace') el.querySelector('[data-n="borrar"]').click();
        else if (e.key === 'Enter') el.querySelector('[data-n="ok"]').click();
      };
      return;
    }
    el.innerHTML = `<h1>Panel del local</h1>
      ${acc.unico ? '' : `<div class="field"><label for="lslug">Código del local</label><input id="lslug" autocapitalize="off" autocomplete="username" value="${esc(local)}" placeholder="ej. gassuso"><p class="ayuda">Es la última parte de la dirección de tu carta.</p></div>`}
      <div class="field"><label for="clave">Clave del local</label><input id="clave" type="password" autocomplete="current-password"></div>
      <div class="formerr" id="loginErr" role="alert"></div>
      <button class="primary" id="entrar" style="width:100%;margin-top:12px">Entrar</button>
      ${dev?.con_pin ? '<p style="text-align:center;margin:14px 0 0"><button type="button" class="link" id="aPin">Entrar con PIN</button></p>' : ''}`;
    el.onclick = (e) => { if (e.target.closest('#aPin')) { modoClave = false; pantallaEntrada(alEntrar); } };
    document.onkeydown = null;
    const entrar = async () => {
      try {
        await api('panel/login', { method: 'POST', body: { slug: $('lslug')?.value.trim() || undefined, password: $('clave').value } });
        el.hidden = true; el.onclick = null; modoClave = false; alEntrar();
      } catch (e) { $('loginErr').textContent = e.message; }
    };
    $('entrar').onclick = entrar;
    $('clave').onkeydown = (e) => e.key === 'Enter' && entrar();
    ($('lslug') && !$('lslug').value ? $('lslug') : $('clave')).focus();
  }

  // ---------- quién usa el panel y qué ve ----------
  async function cargarYo() { YO = await api('panel/yo'); return YO; }
  function aplicar() {
    document.body.classList.toggle('sin-costos', !verCostos());
    for (const [v, [perm]] of Object.entries(TABS)) {
      const b = document.querySelector(`[data-v="${v}"]`); if (!b) continue;
      b.hidden = !puede(perm);
      const f = TABS[v][1], bloq = f && !tiene(f);
      b.classList.toggle('bloq', bloq);
      b.title = bloq ? `Disponible en el plan ${PLAN_NOMBRE[PLAN_DE[f]]}` : '';
    }
    $('pausa').hidden = !puede('pausa');
    $('quien').innerHTML = YO.rol === 'dueno' ? '<span>Dueño<small>Cambiar usuario</small></span>'
      : `<span>${esc(YO.nombre)}<small>${esc(YO.rol_nombre)}${YO.turno_desde ? ` · desde ${YO.turno_desde.slice(11, 16)}` : ''}</small></span>`;
    $('quien').title = 'Cambiar de usuario';
    banner();
  }
  // Pestaña bloqueada por el plan: se ve, pero muestra qué plan la abre.
  function bloqueada(v) { const f = TABS[v]?.[1]; return f && !tiene(f) ? f : null; }
  function vistaBloqueada(f) {
    return `<div class="cardf vacio" style="padding:32px;max-width:640px;margin:20px auto">${ico('ban')}<h3>Disponible en el plan ${PLAN_NOMBRE[PLAN_DE[f]]}</h3>
      <p>${{ equipo: 'Equipo calcula el costo del personal, los turnos y el sueldo estimado de cada persona según la ley.', exportar: 'Exporta ventas, caja y gastos a Excel para el contador.', resultados: 'El estado de resultados muestra cuánto gana el local cada mes.' }[f] || ''}</p>
      <p class="ayuda">Para cambiar de plan, escríbenos. Tus datos se mantienen.</p></div>`;
  }
  function banner() {
    const L = YO.licencia, el = $('banner');
    let txt = '', cls = '';
    if (L?.estado === 'gracia') { txt = `Pago pendiente: el plan venció. El panel sigue funcionando ${L.dias} día${L.dias === 1 ? '' : 's'} más; después queda en solo lectura.`; cls = 'mal'; }
    else if (L?.estado === 'suspendida') { txt = 'Cuenta suspendida por falta de pago: el panel está en solo lectura y la carta no recibe pedidos. Tus datos están a salvo y puedes exportarlos.'; cls = 'mal'; }
    else if (L?.estado === 'cancelada') { txt = 'Cuenta cancelada. Puedes exportar tus datos desde el Resumen.'; cls = 'mal'; }
    else if (L?.estado === 'prueba' && L.dias <= 7 && puede('licencia')) { txt = `Tu prueba termina en ${L.dias} día${L.dias === 1 ? '' : 's'} (${fecha(L.hasta)}).`; cls = 'aviso'; }
    el.hidden = !txt; el.className = `banner ${cls}`; el.textContent = txt;
  }

  // ---------- Tu plan (Datos del local) ----------
  async function pintarPlan(el) {
    if (!puede('licencia')) { el.remove(); return; }
    const L = await api('panel/licencia');
    const t = L.tarifa_mes;
    el.innerHTML = `<h3>Tu plan</h3>
      <div class="plan-cab"><b>${esc(L.plan_nombre)}</b><span class="chip2 ${['activa', 'prueba'].includes(L.estado) ? 'ok' : 'warn'}">${ESTADO[L.estado]}</span>
        <span class="opc">${L.estado === 'prueba' ? `hasta el ${fecha(L.hasta)}` : L.vence ? `pagado hasta el ${fecha(L.vence)}` : ''}</span></div>
      <table class="tabla-plan"><tr><td>Precio ${L.ciclo === 'mensual' ? 'mensual' : L.ciclo}${L.estado === 'prueba' ? ' al terminar la prueba' : ''}</td><td class="r">${clp(L.precio)} + IVA${L.descuento ? ` <span class="opc">(${L.descuento.pct}% de descuento${L.descuento.hasta ? ` hasta el ${fecha(L.descuento.hasta)}` : ''})</span>` : ''}</td></tr>
        <tr><td>Tarifa por pedido web</td><td class="r">0,5 % con tope de $100 por pedido${L.tarifa_exenta_hasta ? ` <span class="opc">(exento hasta el ${fecha(L.tarifa_exenta_hasta)})</span>` : ''}</td></tr>
        <tr><td>Este mes</td><td class="r">${t.pedidos} pedido${t.pedidos === 1 ? '' : 's'} web · tarifa ${clp(t.monto)}${t.exentos ? ` <span class="opc">(${t.exentos} exento${t.exentos === 1 ? '' : 's'})</span>` : ''}</td></tr>
        <tr><td>Usuarios con PIN</td><td class="r">${L.usuarios ? `hasta ${L.usuarios}` : 'sin límite'}</td></tr></table>
      <p class="ayuda">La tarifa por pedido sale de tu venta y no se le cobra al cliente. Un pedido de ${clp(12000)} paga ${clp(60)}.</p>
      ${L.pagos.length ? `<details style="margin-top:8px"><summary class="opc">Pagos (${L.pagos.length})</summary><table class="tabla-plan">${L.pagos.map((p) =>
        `<tr><td>${fecha(p.fecha)}</td><td>${fecha(p.desde)} → ${fecha(p.hasta)}</td><td class="r">${clp(p.monto + p.tarifa)}${p.factura ? ` · factura ${esc(p.factura)}` : ''}</td></tr>`).join('')}</table></details>` : ''}`;
  }

  // ---------- Usuarios y PIN (Datos del local) ----------
  async function pintarUsuarios(el) {
    if (!puede('usuarios')) { el.remove(); return; }
    const U = await api('panel/usuarios');
    const lleno = U.limite != null && U.usuarios.filter((u) => u.activo).length >= U.limite;
    el.innerHTML = `<header class="sh"><h3>Usuarios y PIN</h3><span class="sp"></span><button type="button" class="ghostb" data-u="nuevo" ${lleno ? 'disabled' : ''}>${ico('plus')}Agregar</button></header>
      <p class="ayuda top">Cada persona entra en la tablet con su PIN y solo ve lo que su rol permite. Queda registrado quién cobró, anuló o movió la caja.
        <b>Cocina</b>: pedidos y agotados. <b>Caja</b>: además vende, cobra, caja y gastos. <b>Encargado</b>: además carta, despacho, resumen y reabrir la caja.
        Tú (dueño) entras con la clave del local y ves todo.${U.limite != null ? ` Tu plan permite ${U.limite} usuarios activos.` : ''}</p>
      ${U.usuarios.length ? `<table class="tabla-plan">${U.usuarios.map((u) => `<tr${u.activo ? '' : ' class="anulada"'}><td><b>${esc(u.nombre)}</b>${u.abierto ? ' <span class="chip2 ok">en turno</span>' : ''}</td><td>${esc(U.roles[u.rol] || u.rol)}</td>
        <td class="opc">${u.ultimo_acceso ? `entró ${esc(u.ultimo_acceso.slice(0, 16))}` : 'no ha entrado'}</td>
        <td class="r"><button type="button" class="link" data-u="editar" data-id="${u.id}">Editar</button> <button type="button" class="link ${u.activo ? 'peligro' : ''}" data-u="${u.activo ? 'desactivar' : 'activar'}" data-id="${u.id}">${u.activo ? 'Desactivar' : 'Activar'}</button></td></tr>`).join('')}</table>`
        : '<p class="opc">Aún no hay usuarios. Agrega a quienes usan la tablet (cocina, caja).</p>'}
      <form id="uForm" class="u-form" hidden><div class="dos"><div class="field"><label for="uNombre">Nombre</label><input id="uNombre" maxlength="60" autocomplete="off"></div>
        <div class="field"><label for="uRol">Rol</label><select id="uRol">${Object.entries(U.roles).map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join('')}</select></div>
        <div class="field"><label for="uPin">PIN <span class="opc" id="uPinAyuda">(4 a 6 números)</span></label><input id="uPin" inputmode="numeric" maxlength="6" autocomplete="off" pattern="\\d*"></div></div>
        <div class="formerr" id="uErr" role="alert"></div>
        <div style="display:flex;gap:8px;margin-top:10px"><button class="primary chico" style="width:auto;flex:none;padding:0 18px">Guardar</button><button type="button" class="ghostb" data-u="cancelar">Cancelar</button></div></form>`;
    let editando = null;
    el.onclick = async (e) => {
      const b = e.target.closest('[data-u]'); if (!b) return;
      const u = U.usuarios.find((x) => x.id === Number(b.dataset.id));
      if (b.dataset.u === 'nuevo' || b.dataset.u === 'editar') {
        editando = u || null; $('uForm').hidden = false;
        $('uNombre').value = u?.nombre || ''; $('uRol').value = u?.rol || 'caja'; $('uPin').value = '';
        $('uPinAyuda').textContent = u ? '(vacío = no cambia)' : '(4 a 6 números)'; $('uErr').textContent = ''; $('uNombre').focus();
      } else if (b.dataset.u === 'cancelar') $('uForm').hidden = true;
      else if (b.dataset.u === 'desactivar' || b.dataset.u === 'activar') {
        if (b.dataset.u === 'desactivar' && !confirm(`¿Desactivar a ${u.nombre}? No podrá entrar con su PIN.`)) return;
        try { await api(`panel/usuarios/${u.id}`, { method: 'PATCH', body: { activo: b.dataset.u === 'activar' } }); toast('✓ Usuario actualizado'); pintarUsuarios(el); } catch (err) { alert(err.message); }
      }
    };
    $('uForm').onsubmit = async (e) => {
      e.preventDefault();
      const body = { nombre: $('uNombre').value, rol: $('uRol').value };
      if ($('uPin').value || !editando) body.pin = $('uPin').value.replace(/\D/g, '');
      try {
        await api(editando ? `panel/usuarios/${editando.id}` : 'panel/usuarios', { method: editando ? 'PATCH' : 'POST', body });
        toast(editando ? '✓ Usuario guardado' : `✓ ${body.nombre} ya puede entrar con su PIN`); pintarUsuarios(el);
      } catch (err) { $('uErr').textContent = err.message; }
    };
  }

  // ---------- horas trabajadas (Equipo) ----------
  async function bloqueHoras(mes) {
    const r = await api(`panel/turnos?mes=${mes}`);
    if (!r.horas.length) return `<section class="cardf" style="margin-top:14px"><h3>Horas marcadas</h3><p class="ayuda">Cuando el equipo marque entrada y salida con su PIN en la tablet, aquí aparecen las horas reales de cada persona.</p></section>`;
    return `<section class="cardf" style="margin-top:14px"><h3>Horas marcadas en el mes</h3><table class="tabla-plan"><tr><th>Persona</th><th class="r">Turnos</th><th class="r">Horas</th><th></th></tr>
      ${r.horas.map((h) => `<tr><td>${esc(h.nombre)}</td><td class="r">${h.turnos}</td><td class="r">${h.horas.toLocaleString('es-CL')}</td>
        <td class="opc">${[h.abiertos && `${h.abiertos} sin salida`, h.revisar && `${h.revisar} de más de 16 h (revisar)`].filter(Boolean).join(' · ')}</td></tr>`).join('')}</table>
      <p class="ayuda">Horas según las marcas con PIN. Sirven para comparar con los turnos planificados y para la liquidación que hace el contador.</p></section>`;
  }

  return { pantallaEntrada, cargarYo, aplicar, puede, tiene, verCostos, bloqueada, vistaBloqueada, pintarPlan, pintarUsuarios, bloqueHoras, yo: () => YO };
}
