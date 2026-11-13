// Panel → Datos del local → Pago con tarjeta en línea (solo el dueño).
// El dueño elige la pasarela (Flow o Mercado Pago), pega sus credenciales, elige el modo y prueba.
// Las credenciales se guardan cifradas en el servidor y nunca vuelven completas al navegador.
// Se guarda al tiro con sus propios botones (no usa la barra "Guardar cambios" del formulario).
export function crearPagosUI({ $, esc, api, toast, clp, esDueno, correo }) {
  const NOMBRE = { flow: 'Flow', mercadopago: 'Mercado Pago' };
  const ESTADO = { creado: 'Iniciado', pagado: 'Pagado', rechazado: 'Rechazado', fallido: 'Falló al crear', expirado: 'Vencido' };
  const EVENTO = { confirmado: 'Pago confirmado', rechazado: 'Pago rechazado', pendiente: 'Pago pendiente', firma_invalida: 'Aviso con firma inválida (ignorado)',
    referencia_distinta: 'Aviso con referencia distinta (ignorado)', monto_distinto: 'Aviso con monto distinto (ignorado)', referencia_desconocida: 'Aviso de un pago desconocido',
    error_crear: 'La pasarela no respondió al crear', error_verificar: 'No se pudo verificar con la pasarela', sin_credenciales: 'Aviso sin credenciales guardadas',
    pago_a_revisar: 'Pago a revisar' };
  const CAMPOS = {
    flow: [['api_key', 'API Key', 'En Flow: Mis datos → Integración → API Key.'], ['secret', 'Secret Key', 'Misma pantalla. Nunca la compartas por WhatsApp ni correo.']],
    mercadopago: [['access_token', 'Access Token', 'En Mercado Pago Developers: Tus integraciones → Credenciales. De prueba empieza con TEST-.'],
      ['webhook_secret', 'Clave secreta de webhooks (opcional)', 'Tus integraciones → Webhooks. Con ella, además se revisa la firma de cada aviso.']],
  };

  // Texto del campo: lo guardado se muestra enmascarado (o solo "Guardada" si no se muestra nada de él).
  const guardada = (cred, k) => {
    if (!cred || cred[k] === false || (k === 'webhook_secret' && !cred[k])) return 'Pegar aquí';
    return typeof cred[k] === 'string' ? `Guardada (${esc(cred[k])}). Pega una nueva para cambiarla.` : 'Guardada. Pega una nueva para cambiarla.';
  };
  async function pintar(el) {
    if (!esDueno()) { el.innerHTML = '<h3>Pago con tarjeta en línea</h3><p class="ayuda">Lo configura el dueño del local.</p>'; return; }
    const C = await api('panel/pagos');
    const pas = C.pasarela || 'flow';
    const avisos = [!C.servidor.cifrado && 'El servidor aún no tiene PAGOS_CLAVE: no se pueden guardar credenciales.',
      !C.servidor.url_base && 'El servidor aún no tiene PAGOS_URL_BASE: la pasarela no sabría dónde avisar el pago.'].filter(Boolean);
    const campos = (p) => CAMPOS[p].map(([k, n, ayuda]) => `<div class="field"><label for="pg-${p}-${k}">${n}</label>
      <input id="pg-${p}-${k}" type="password" autocomplete="off" spellcheck="false" placeholder="${guardada(C.credenciales[p], k)}">
      <p class="ayuda">${ayuda}</p></div>`).join('');
    el.innerHTML = `<h3>Pago con tarjeta en línea</h3>
      <p class="ayuda top">El cliente paga su pedido con tarjeta al confirmarlo. El dinero llega a <b>tu</b> cuenta de la pasarela (8vobit no cobra por esto; la comisión es la de tu pasarela). Efectivo y transferencia siguen igual.</p>
      ${avisos.map((a) => `<p class="formerr">${esc(a)}</p>`).join('')}
      <p><b>Estado:</b> ${C.funcionando ? `Activo con ${NOMBRE[C.pasarela]} (${C.modo === 'sandbox' ? 'modo de prueba: no se cobra de verdad' : 'cobros reales'})` : C.activo ? 'Activado, pero falta algo en el servidor' : 'Desactivado'}</p>
      <div class="dos">
        <div class="field"><label for="pg-pasarela">Pasarela</label><select id="pg-pasarela">${Object.entries(NOMBRE).map(([k, n]) => `<option value="${k}" ${pas === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="field"><label for="pg-modo">Modo</label><select id="pg-modo"><option value="sandbox" ${C.modo !== 'produccion' ? 'selected' : ''}>Prueba (sandbox)</option>
          <option value="produccion" ${C.modo === 'produccion' ? 'selected' : ''} ${C.servidor.produccion ? '' : 'disabled'}>Cobros reales${C.servidor.produccion ? '' : ' (aún no habilitado)'}</option></select></div>
      </div>
      ${Object.keys(CAMPOS).map((p) => `<div data-pg="${p}" ${p === pas ? '' : 'hidden'}><div class="dos">${campos(p)}</div></div>`).join('')}
      <label class="ck"><input type="checkbox" id="pg-activo" ${C.activo ? 'checked' : ''}> Ofrecer el pago con tarjeta en la carta</label>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        <button type="button" class="primary" id="pg-guardar">Guardar pago en línea</button>
        <button type="button" class="ghostb" id="pg-probar">Probar con un pago de prueba</button>
      </div>
      <div class="field" id="pg-correoW" style="margin-top:10px"><label for="pg-correo">Correo para la prueba</label><input id="pg-correo" type="email" value="${esc(correo() || '')}" autocomplete="off"><p class="ayuda">Flow lo pide para mandar el comprobante. La prueba es de $1.000 en sandbox y no cobra nada.</p></div>
      <p class="formerr" id="pg-err" role="alert"></p>
      ${C.intentos.length ? `<details style="margin-top:10px"><summary>Últimos pagos en línea</summary><table class="tabla"><tr><th>Fecha</th><th>Pedido</th><th>Monto</th><th>Estado</th></tr>
        ${C.intentos.map((i) => `<tr><td>${esc(i.creado.slice(0, 16))}</td><td>${i.numero ? `#${i.numero}` : 'Prueba'}</td><td>${clp(i.monto)}</td><td>${ESTADO[i.estado] || esc(i.estado)} · ${NOMBRE[i.pasarela]}${i.modo === 'sandbox' ? ' (prueba)' : ''}</td></tr>`).join('')}</table></details>` : ''}
      ${C.eventos.length ? `<details><summary>Avisos de la pasarela</summary><ul>${C.eventos.map((e) => `<li>${esc(e.creado.slice(0, 16))} · ${EVENTO[e.tipo] || esc(e.tipo)}${e.detalle ? ` · ${esc(e.detalle)}` : ''}</li>`).join('')}</ul></details>` : ''}
      <p class="ayuda">Cómo conectar tu cuenta real y pasar a cobros reales: pídelo a 8vobit; primero se prueba en sandbox.</p>`;
    const sel = () => $('pg-pasarela').value;
    $('pg-pasarela').onchange = () => { el.querySelectorAll('[data-pg]').forEach((d) => { d.hidden = d.dataset.pg !== sel(); }); $('pg-correoW').hidden = sel() !== 'flow'; };
    $('pg-correoW').hidden = pas !== 'flow';
    const credenciales = () => Object.fromEntries(CAMPOS[sel()].map(([k]) => [k, $(`pg-${sel()}-${k}`).value.trim()]).filter(([, v]) => v));
    $('pg-guardar').onclick = async () => {
      $('pg-err').textContent = ''; $('pg-guardar').disabled = true;
      try {
        await api('panel/pagos', { method: 'PUT', body: { pasarela: sel(), modo: $('pg-modo').value, activo: $('pg-activo').checked, credenciales: credenciales() } });
        toast('✓ Pago en línea guardado'); await pintar(el);
      } catch (e) { $('pg-err').textContent = e.message; $('pg-guardar').disabled = false; }
    };
    $('pg-probar').onclick = async () => {
      $('pg-err').textContent = '';
      // Lo escrito en las credenciales se guarda antes de probar (sin activar todavía).
      try {
        const cr = credenciales();
        if (Object.keys(cr).length || sel() !== C.pasarela) await api('panel/pagos', { method: 'PUT', body: { pasarela: sel(), modo: $('pg-modo').value, activo: sel() === C.pasarela ? undefined : false, credenciales: cr } });
        const r = await api('panel/pagos/probar', { method: 'POST', body: { email: $('pg-correo').value.trim() || undefined } });
        window.open(r.url, '_blank', 'noopener');
        toast('Se abrió el pago de prueba en otra pestaña'); await pintar(el);
      } catch (e) { $('pg-err').textContent = e.message; }
    };
  }
  return { pintar };
}
