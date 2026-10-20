// Panel: datos legales del local (formulario guiado con vista previa del texto) y aceptación en línea
// del Contrato de servicio + Anexo A. Los textos son la plantilla fija de 8vobit (lib/legal.mjs): aquí
// solo se completan los datos. Todo se valida de nuevo en el servidor.
export function crearLegalUI(ctx) {
  const { $, esc, api, toast, BASE, rutFormato, rutValido, fmtTel, esDueno } = ctx;
  // Mismos campos que lib/legal.mjs (CAMPOS), con una ayuda corta para quien no es abogado.
  const CAMPOS = [
    ['razon_social', 'Razón social', 'Como figura en el SII. Si eres persona natural, tu nombre completo.', 'maxlength="100"'],
    ['rut', 'RUT de la empresa', 'El de la boleta. Ej: 76.123.456-7', 'maxlength="12" autocomplete="off" data-rut'],
    ['giro', 'Giro', 'La actividad inscrita en el SII. Ej: venta de comida preparada.', 'maxlength="120"'],
    ['domicilio', 'Domicilio legal', 'Calle y número del domicilio de la empresa.', 'maxlength="120"'],
    ['comuna', 'Comuna', '', 'maxlength="60"'],
    ['representante', 'Representante legal', 'Quien firma por la empresa (si eres persona natural, tú).', 'maxlength="100"'],
    ['representante_rut', 'RUT del representante', 'No aparece en la carta: solo en el contrato.', 'maxlength="12" autocomplete="off" data-rut'],
    ['correo', 'Correo para privacidad y reclamos', 'Ahí te escriben los clientes para pedir, corregir o borrar sus datos.', 'type="email" maxlength="80"'],
    ['telefono', 'Teléfono de contacto', 'Aparece en los Términos aunque ocultes el teléfono en la carta.', 'type="tel" inputmode="tel" maxlength="20"'],
  ];
  let K = null;

  // Campos del formulario (dentro de la sección "Datos legales" de Datos del local).
  function campos(g) {
    const val = (id) => (id === 'telefono' ? fmtTel(g[id]) : g[id]);
    const faltan = CAMPOS.filter(([id]) => !g[id]).length;
    return `${faltan ? `<p class="nota">⚠️ <span>Faltan ${faltan} dato${faltan > 1 ? 's' : ''}: mientras tanto tus Términos y tu Privacidad dicen "Borrador" y no puedes aceptar el contrato ni abrir la carta.</span></p>` : '<p class="ok-legal">✓ Datos legales completos.</p>'}
      <div class="dos">${CAMPOS.map(([id, n, ayuda, extra]) => `<div class="field"><label for="g-${id}">${n}</label><input id="g-${id}" data-legal="${id}" value="${esc(val(id) ?? '')}" ${extra}>${ayuda ? `<p class="ayuda">${ayuda}</p>` : ''}<div class="err" id="g-${id}-err"></div></div>`).join('')}</div>
      <div class="sh" style="gap:8px;flex-wrap:wrap"><span class="ayuda" style="margin:0">Vista previa con estos datos (sin guardar):</span>
        <button type="button" class="ghostb" data-vista="terminos">Términos</button><button type="button" class="ghostb" data-vista="privacidad">Privacidad</button><button type="button" class="ghostb" data-vista="contrato">Contrato</button></div>
      <div id="g-vista"></div>`;
  }
  const valores = () => Object.fromEntries(CAMPOS.map(([id]) => [id, $(`g-${id}`).value.trim()]).map(([k, v]) => [k, $(`g-${k}`).hasAttribute('data-rut') && v ? rutFormato(v) : v]));
  // Revisa los RUT antes de enviar. Devuelve el primer campo con error (o null).
  function revisar() {
    for (const [id] of CAMPOS) {
      const x = $(`g-${id}`);
      if (x.hasAttribute('data-rut') && x.value && !rutValido(x.value)) { $(`g-${id}-err`).textContent = 'Revisa el RUT: el dígito verificador no coincide.'; x.focus(); return id; }
    }
    return null;
  }
  function enlazar() {
    for (const x of document.querySelectorAll('[data-legal][data-rut]')) x.addEventListener('blur', () => {
      x.value = rutFormato(x.value);
      $(`${x.id}-err`).textContent = x.value && !rutValido(x.value) ? 'Revisa el RUT: el dígito verificador no coincide.' : '';
    });
    for (const b of document.querySelectorAll('[data-vista]')) b.onclick = async () => {
      if (revisar()) return;
      try {
        const v = await api('panel/legal/vista', { method: 'POST', body: { doc: b.dataset.vista, legal: valores() } });
        $('g-vista').innerHTML = `<div class="legal-prev">${v.faltan?.length ? `<p class="nota">⚠️ <span>Borrador: falta ${v.faltan.map((f) => esc(f)).join(', ')}.</span></p>` : ''}${v.html}</div>`;
      } catch (err) { $('g-vista').innerHTML = `<p class="formerr">${esc(err.message)}</p>`; }
    };
  }

  // ---------- contrato ----------
  async function pintarContrato(el) {
    K = await api('panel/contrato');
    const a = K.aceptado;
    const ver = a ? `<a href="${BASE}/api/panel/contrato/aceptado" target="_blank" rel="noopener">Ver el texto aceptado</a> · <a href="${BASE}/api/panel/contrato/aceptado?descargar=1">Descargar</a>` : '';
    let cuerpo;
    if (K.vigente) cuerpo = `<p class="ok-legal">✓ Aceptado el ${esc(a.fecha.slice(0, 16))} por ${esc(a.nombre)} (versión ${esc(a.version)}).</p><p class="ayuda">${ver}</p>`;
    else if (K.faltan.length) cuerpo = `<p class="nota">⚠️ <span>Para aceptarlo, primero completa los datos legales: ${K.faltan.map((f) => esc(f)).join(', ')}. <a href="#s-legal">Ir a Datos legales</a></span></p>`;
    else if (!K.prestador_ok) cuerpo = '<p class="nota">⚠️ <span>El contrato todavía no está disponible para aceptar. Escríbenos a hola@8vobit.xyz.</span></p>';
    else if (!esDueno()) cuerpo = '<p class="nota">⚠️ <span>El contrato lo acepta el dueño del local, entrando con la clave del local.</span></p>';
    else {
      const L = ctx.local();
      cuerpo = `${a ? `<p class="nota">⚠️ <span>Hay una versión nueva del contrato (${esc(K.version)}). Tus pedidos siguen funcionando; léela y acéptala cuando puedas. ${ver}</span></p>` : ''}
        <details class="legal-det"><summary>Leer el contrato con tus datos</summary><div class="legal-prev">${K.html}</div></details>
        <div class="dos"><div class="field"><label for="k-nombre">Tu nombre completo</label><input id="k-nombre" maxlength="100" value="${esc(L.legal?.representante || '')}"></div>
          <div class="field"><label for="k-rut">Tu RUT</label><input id="k-rut" maxlength="12" autocomplete="off" value="${esc(L.legal?.representante_rut || '')}"></div></div>
        <label class="ck" style="min-height:44px"><input type="checkbox" id="k-acepto"> <span>Leí y acepto el Contrato de servicio y su Anexo A (encargo de tratamiento de datos) en nombre de ${esc(L.legal?.razon_social || L.nombre)}.</span></label>
        <div class="formerr" id="k-err" role="alert"></div>
        <p><button type="button" class="primary" id="k-ok">Aceptar el contrato</button></p>`;
    }
    el.innerHTML = `<h3>Contrato de servicio</h3><p class="ayuda top">El contrato con 8vobit y el encargo de tratamiento de datos (Ley 19.628 y 21.719). Es el mismo para todos los locales: solo cambian tus datos. Se acepta en línea y queda guardado con su versión.</p>${cuerpo}`;
    const rut = el.querySelector('#k-rut');
    if (rut) rut.onblur = () => { rut.value = rutFormato(rut.value); };
    const ok = el.querySelector('#k-ok');
    if (ok) ok.onclick = async () => {
      $('k-err').textContent = '';
      if (!rutValido($('k-rut').value)) { $('k-err').textContent = 'Revisa tu RUT: el dígito verificador no coincide.'; return; }
      ok.disabled = true;
      try {
        await api('panel/contrato', { method: 'POST', body: { nombre: $('k-nombre').value, rut: rutFormato($('k-rut').value), acepto: $('k-acepto').checked, hash: K.hash } });
        toast('✓ Contrato aceptado'); await ctx.alCambiar(); await pintarContrato(el);
      } catch (err) { $('k-err').textContent = err.message; }
      ok.disabled = false;
    };
  }

  return { campos, valores, revisar, enlazar, pintarContrato };
}
