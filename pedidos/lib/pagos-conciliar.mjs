// Pago con tarjeta en línea: confirmar, conciliar, expirar y devolver (la parte "viva" de lib/pagos.mjs).
//
// - `aplicar` es la única función que marca un intento como pagado: la usan el webhook (confirmar) y la
//   conciliación (preguntarle a la pasarela sin esperar el webhook). Valida referencia, monto y CLP, es
//   idempotente y corre en una transacción BEGIN IMMEDIATE. La verdad la da siempre la API de la pasarela.
// - Estados de pago_intentos: creado, pagado, rechazado, fallido, expirado, devolucion_pendiente, devuelto.
//   Se puede pasar a `pagado` desde creado, rechazado o expirado (si el dinero entró, se acepta);
//   desde pagado en adelante solo cambia por una devolución iniciada por el dueño.
// - Umbrales por variable de entorno (solo se tocan en pruebas): PAGOS_ESPERA_S (20), PAGOS_LIMITE_S (15),
//   PAGOS_EXPIRA_S (86400), PAGOS_CONCILIAR_MS (300000; 0 apaga el barrido).
const EN_FIRME = ['pagado', 'devolucion_pendiente', 'devuelto'];
const ABIERTOS = ['creado', 'rechazado', 'expirado']; // se siguen consultando: un pago tardío o con otra tarjeta puede entrar
const TOPE = 40; // intentos que mira el barrido en cada pasada
const num = (v, d) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);

export function crearConciliacion({ db, env, evento, descifrar, fila, adaptador, PASARELAS, red, REF, EMAIL, urlDevolucion, correoLocal }) {
  const espera = num(env.PAGOS_ESPERA_S, 20), limite = num(env.PAGOS_LIMITE_S, 15), expira = num(env.PAGOS_EXPIRA_S, 86400), ventana = expira * 2; // ventana de conciliación: 48 h (el doble del plazo de 24 h)
  const manualS = num(env.PAGOS_MANUAL_S, 600); // una devolución en curso se puede cerrar a mano pasados ~10 min
  const hace = (s) => `-${Math.round(s)} seconds`;
  const ultima = new Map(); // referencia -> última consulta a la pasarela (límite de frecuencia por referencia)
  const credDe = (it) => descifrar(fila(it.local_id)?.credenciales)[it.pasarela];
  // Evento que no se repite: en cada barrido volvería a salir lo mismo (error de la pasarela, monto distinto…).
  function eventoUnico(it, tipo, detalle) {
    const u = it.referencia
      ? db.prepare('SELECT tipo FROM pago_eventos WHERE referencia=? ORDER BY id DESC LIMIT 1').get(it.referencia)
      : db.prepare('SELECT tipo FROM pago_eventos WHERE referencia IS NULL AND local_id IS NULL ORDER BY id DESC LIMIT 1').get();
    if (u?.tipo !== tipo) evento(it.local_id, it.referencia, it.pasarela, tipo, detalle);
  }
  const rechazo = (it, tipo, detalle, unico) => { (unico ? eventoUnico : (a, ...r) => evento(a.local_id, a.referencia, a.pasarela, ...r))(it, tipo, detalle); return { status: 400, body: { error: 'Confirmación no válida' } }; };

  // ---------- marcar el resultado de la pasarela en el intento y el pedido ----------
  // `silencioso`: en la conciliación periódica, un "sigue pendiente" no deja evento (serían cientos por día).
  function aplicar(it, v, { silencioso = false } = {}) {
    if (v.ignorar) return { status: 200, body: { ok: true } };
    if (v.error) return rechazo(it, v.error, v.detalle, silencioso);
    if (v.referencia !== it.referencia) return rechazo(it, 'referencia_distinta', `La pasarela informa ${String(v.referencia).slice(0, 40)}`, silencioso);
    if (v.estado === 'pagado' && (v.monto !== it.monto || v.moneda !== 'CLP')) return rechazo(it, 'monto_distinto', `Esperado ${it.monto} CLP, informado ${v.monto} ${v.moneda}`, silencioso);
    db.exec('BEGIN IMMEDIATE');
    try {
      const ahora = db.prepare('SELECT estado FROM pago_intentos WHERE id=?').get(it.id);
      // Contracargo (el cliente disputó el pago en su banco), en cualquier estado: no cambia nada, pero el dueño lo tiene que ver.
      if (v.estado === 'contracargo') {
        eventoUnico(it, 'contracargo', EN_FIRME.includes(ahora.estado) ? 'El cliente disputó este pago: revisa la pasarela.'
          : `La pasarela informó un cobro disputado (contracargo) en un intento que figura ${ahora.estado}: revisa la pasarela; no se cambió ningún estado.`);
        db.exec('COMMIT'); return { status: 200, body: { ok: true } }; }
      if (EN_FIRME.includes(ahora.estado)) {
        db.exec('COMMIT'); return { status: 200, body: { ok: true, repetido: true } }; }
      // Un rechazo solo cuenta mientras el intento sigue abierto; un vencido o fallido no cambia por un rechazo.
      const estado = v.estado === 'pagado' ? 'pagado' : v.estado === 'rechazado' && ahora.estado === 'creado' ? 'rechazado' : ahora.estado;
      if (silencioso && estado === ahora.estado) { db.exec('COMMIT'); return { status: 200, body: { ok: true, sin_cambios: true } }; }
      db.prepare("UPDATE pago_intentos SET estado=?, externo=COALESCE(?,externo), raw=?, actualizado=datetime('now','localtime') WHERE id=?")
        .run(estado, v.externo || null, JSON.stringify(v.raw || {}), it.id);
      let tipo = estado === 'pagado' ? 'confirmado' : estado === 'rechazado' ? 'rechazado' : 'pendiente', detalle = null;
      if (estado === 'pagado' && it.pedido_id) {
        const p = db.prepare('SELECT id, total, pagado, estado FROM pedidos WHERE id=? AND local_id=?').get(it.pedido_id, it.local_id);
        // El intento queda pagado (el dinero entró), pero el pedido solo se marca si el total sigue siendo el cobrado.
        if (p && !p.pagado && p.estado !== 'anulado' && p.total === it.monto) {
          db.prepare('UPDATE pedidos SET pagado=1, medio_pago=?, recibido=?, cobrado_en=?, cobrado_por=?, actualizado=? WHERE id=?')
            .run('tarjeta', p.total, new Date().toTimeString().slice(0, 5), `Pago en línea (${PASARELAS[it.pasarela].NOMBRE})`, Date.now(), p.id);
        } else { tipo = 'pago_a_revisar'; detalle = p?.estado === 'anulado' ? 'El pedido estaba anulado: revisa la devolución en la pasarela.' : p && p.total !== it.monto ? `El total del pedido (${p.total}) no coincide con lo cobrado (${it.monto}): revisa y devuelve o cobra la diferencia.` : 'El pedido ya estaba cobrado: revisa si corresponde devolver.'; }
      }
      evento(it.local_id, it.referencia, it.pasarela, tipo, detalle);
      db.exec('COMMIT');
      return { status: 200, body: { ok: true } };
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }

  // ---------- conciliación: preguntarle a la pasarela sin depender del webhook ----------
  // Devuelve el resultado de aplicar, o null si no hay nada que aplicar (sin credenciales, aún sin pago).
  // Lanza solo los errores de red (los maneja quien llama); un 4xx de la pasarela queda como evento.
  async function conciliar(it) {
    const cred = credDe(it);
    if (!cred) return null;
    ultima.set(it.referencia, Date.now());
    let v;
    try { v = await adaptador(it.pasarela, it.modo, cred).consultar({ referencia: it.referencia, externo: it.externo }); }
    catch (e) {
      if (red(e) && !(e.status >= 400 && e.status < 500)) throw e;
      eventoUnico(it, 'error_conciliar', e.pasarela ? e.message : 'respuesta inesperada');
      return null;
    }
    return v.ninguno ? null : aplicar(it, v, { silencioso: true });
  }
  const puedeConsultar = (ref) => Date.now() - (ultima.get(ref) || 0) >= limite * 1000;

  // Para la página de retorno: si sigue "creado" pasados ~20 s y no se consultó hace poco, se concilia.
  async function estadoConciliando(ref, leer) {
    const e = leer(ref);
    if (!e || !ABIERTOS.includes(e.estado) || !puedeConsultar(ref)) return e;
    const it = db.prepare("SELECT * FROM pago_intentos WHERE referencia=? AND estado IN ('creado','rechazado','expirado') AND creado <= datetime('now','localtime',?) AND creado > datetime('now','localtime',?)").get(ref, hace(espera), hace(ventana));
    if (!it) return e;
    try { await conciliar(it); } catch { /* sin red: se muestra lo que hay y se reintenta después */ }
    return leer(ref);
  }

  // Barrido periódico: concilia los abiertos (creado, rechazado o expirado) de las últimas 48 h, resuelve devoluciones pendientes y
  // vence los que pasaron el plazo (tras un último intento de conciliación).
  async function barrer() {
    try {
      // Abiertos dentro de la ventana (creado, rechazado o expirado) menos los creados que ya pasaron el plazo.
      const abiertos = db.prepare(`SELECT * FROM pago_intentos WHERE estado IN ('creado','rechazado','expirado') AND creado > datetime('now','localtime',?) AND creado <= datetime('now','localtime',?)
        AND (estado!='creado' OR creado > datetime('now','localtime',?)) ORDER BY id DESC LIMIT ?`).all(hace(ventana), hace(espera), hace(expira), TOPE);
      const vencidos = db.prepare("SELECT * FROM pago_intentos WHERE estado='creado' AND creado <= datetime('now','localtime',?) ORDER BY id LIMIT ?").all(hace(expira), TOPE);
      const devoluciones = db.prepare("SELECT * FROM pago_intentos WHERE estado='devolucion_pendiente' ORDER BY id LIMIT ?").all(TOPE);
      // Cada intento va aparte: un error raro en uno (respuesta basura) no frena a los demás. Si la pasarela
      // no responde (red, 5xx) se corta la pasada y se reintenta en la próxima.
      const cada = async (it, fn) => {
        try { await fn(it); } catch (e) {
          if (red(e)) throw e;
          eventoUnico(it, 'error_conciliar', 'error interno al conciliar');
        }
      };
      for (const it of abiertos) if (puedeConsultar(it.referencia)) await cada(it, conciliar);
      for (const it of vencidos) {
        await cada(it, conciliar); // último intento: si el dinero entró, se acepta aunque esté vencido
        const r = db.prepare("UPDATE pago_intentos SET estado='expirado', actualizado=datetime('now','localtime') WHERE id=? AND estado='creado'").run(it.id);
        if (r.changes) evento(it.local_id, it.referencia, it.pasarela, 'expirado', 'Sin pago en 24 horas.');
        ultima.delete(it.referencia);
      }
      for (const it of devoluciones) await cada(it, conciliarDevolucion);
    } catch (e) {
      // El barrido nunca tumba el servidor: pasarela caída (se reintenta) o error inesperado (queda como evento).
      if (!red(e)) { try { eventoUnico({ local_id: null, referencia: null, pasarela: null }, 'error_barrido', String(e?.message || e).slice(0, 200)); } catch { /* sin base: nada que hacer */ } }
    }
    for (const [ref, t] of ultima) if (Date.now() - t > 3600e3) ultima.delete(ref); // no crece sin límite
  }

  // ---------- devoluciones (totales) ----------
  // Cierra una devolución confirmada: el intento pasa a `devuelto` y el pedido vuelve a "por cobrar".
  function finalizarDevolucion(it) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const r = db.prepare("UPDATE pago_intentos SET estado='devuelto', actualizado=datetime('now','localtime') WHERE id=? AND estado='devolucion_pendiente'").run(it.id);
      if (r.changes) {
        let tipo = 'devuelto', detalle = null;
        if (it.pedido_id) {
          // Solo si el cobro del pedido fue este pago en línea: un cobro manual posterior no se toca.
          const p = db.prepare("UPDATE pedidos SET pagado=0, medio_pago=NULL, recibido=NULL, cobrado_en=NULL, cobrado_por=NULL, actualizado=? WHERE id=? AND local_id=? AND medio_pago='tarjeta' AND cobrado_por LIKE 'Pago en línea%'")
            .run(Date.now(), it.pedido_id, it.local_id);
          if (!p.changes) { tipo = 'devolucion_a_revisar'; detalle = 'El pedido tenía otro cobro registrado: revísalo en Caja.'; }
        }
        evento(it.local_id, it.referencia, it.pasarela, tipo, detalle);
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  function volverAPagado(it, detalle) {
    const r = db.prepare("UPDATE pago_intentos SET estado='pagado', devolucion_externo=NULL, actualizado=datetime('now','localtime') WHERE id=? AND estado='devolucion_pendiente'").run(it.id);
    if (r.changes) evento(it.local_id, it.referencia, it.pasarela, 'devolucion_rechazada', detalle);
  }
  // Pregunta a la pasarela cómo va una devolución pendiente (barrido y aviso de Flow). La verdad la da su API.
  async function conciliarDevolucion(it) {
    const cred = credDe(it);
    if (!cred || it.estado !== 'devolucion_pendiente') return;
    let d;
    try { d = await adaptador(it.pasarela, it.modo, cred).consultarDevolucion({ referencia: it.referencia, externo: it.externo, devolucionExterno: it.devolucion_externo }); }
    catch (e) { if (red(e) && !(e.status >= 400 && e.status < 500)) throw e; eventoUnico(it, 'error_conciliar', 'devolución'); return; }
    if (d.estado === 'devuelto') finalizarDevolucion(it);
    else if (d.estado === 'rechazado') volverAPagado(it, 'La pasarela rechazó la devolución.');
    return d.estado; // 'ninguna' = la pasarela confirma que no existe ninguna devolución (solo lo usa devolver() tras un 4xx)
  }
  // Aviso de Flow (urlCallBack). Su contenido no cuenta: solo dispara la consulta a la API.
  async function avisoDevolucion(pasarela, ref) {
    const it = REF.test(ref || '') ? db.prepare("SELECT * FROM pago_intentos WHERE referencia=? AND pasarela=?").get(ref, pasarela) : null;
    if (!it) return { status: 404, body: { error: 'No existe' } };
    try { await conciliarDevolucion(it); } catch { return { status: 502, body: { error: 'Pasarela no disponible' } }; }
    return { status: 200, body: { ok: true } };
  }

  // Devolución total de un pago en línea (solo dueño; la ruta ya aisló el pedido por local).
  async function devolver(local, pedido, b = {}) {
    const it = db.prepare("SELECT * FROM pago_intentos WHERE pedido_id=? AND local_id=? AND estado IN ('pagado','devolucion_pendiente','devuelto') ORDER BY id DESC LIMIT 1").get(pedido.id, local.id);
    if (!it) return { error: 'Ese pedido no tiene un pago en línea vigente para devolver.', status: 409 };
    if (it.estado === 'devuelto') return { error: 'Ese pago ya fue devuelto.', status: 409 };
    if (it.estado === 'devolucion_pendiente') {
      // Un reintento sobre una devolución en curso solo consulta: nunca crea otra.
      try { await conciliarDevolucion(it); } catch { /* se informa el estado actual */ }
      const estado = db.prepare('SELECT estado FROM pago_intentos WHERE id=?').get(it.id).estado;
      return { ok: true, estado, ...(estado === 'devolucion_pendiente' ? { aviso: 'La devolución sigue en curso en la pasarela.' } : {}) };
    }
    if (Number(b.confirmar_monto) !== it.monto) return { error: `Para devolver confirma el monto total: ${it.monto}.`, status: 400 };
    const A = PASARELAS[it.pasarela], cred = credDe(it);
    if (!cred) return { error: `Faltan las credenciales de ${A.NOMBRE}: pégalas de nuevo en Datos del local para devolver.`, status: 409 };
    const pedido_email = String(b.email ?? '').trim().slice(0, 190);
    if (pedido_email && !EMAIL.test(pedido_email)) return { error: 'Revisa el correo: no parece válido.', status: 400 };
    const email = pedido_email || correoLocal(local.id) || null;
    if (it.pasarela === 'flow' && !email) return { error: 'Flow necesita un correo donde avisar la devolución: escríbelo.', status: 400 };
    // Se reserva el intento ANTES de llamar a la pasarela: dos clics seguidos no devuelven dos veces.
    const reserva = db.prepare("UPDATE pago_intentos SET estado='devolucion_pendiente', actualizado=datetime('now','localtime') WHERE id=? AND estado='pagado'").run(it.id);
    if (!reserva.changes) return { error: 'Esa devolución ya está en curso.', status: 409 };
    evento(local.id, it.referencia, it.pasarela, 'devolucion_iniciada', `${it.monto} CLP`);
    let r;
    try { r = await adaptador(it.pasarela, it.modo, cred).devolver({ referencia: it.referencia, externo: it.externo, monto: it.monto, email, urlConfirmacion: urlDevolucion(it.referencia, it.pasarela) }); }
    catch (e) {
      // Solo un rechazo explícito de la pasarela (4xx) devuelve el pago a "pagado" y permite reintentar.
      if (e.pasarela && e.status >= 400 && e.status < 500) {
        // Antes de revertir se le pregunta a la pasarela: un 4xx como "ya devuelto" o "en proceso" significa que la devolución existe.
        // Solo se vuelve a `pagado` si la consulta responde `rechazado` o confirma que NO existe ninguna ('ninguna');
        // con `pendiente` o ante cualquier duda queda en curso (un segundo reembolso sería plata devuelta dos veces).
        let incierta = false, d;
        try { d = await conciliarDevolucion({ ...it, estado: 'devolucion_pendiente' }); } catch { incierta = true; }
        const est = db.prepare('SELECT estado FROM pago_intentos WHERE id=?').get(it.id).estado;
        if (est === 'devuelto') return { ok: true, estado: 'devuelto' };
        if (est === 'devolucion_pendiente') {
          if (incierta || d !== 'ninguna') { eventoUnico(it, 'devolucion_incierta', e.message); return { ok: true, estado: 'devolucion_pendiente', incierta: true, aviso: `${A.NOMBRE} no confirmó la devolución todavía. Queda en curso y se revisa sola; no la repitas.` }; }
          volverAPagado(it, e.message);
        }
        return { error: `${A.NOMBRE} no aceptó la devolución. Revisa el pago en el panel de ${A.NOMBRE} o intenta más tarde.`, status: 502 };
      }
      // Sin respuesta, 5xx o respuesta rara: la pasarela pudo haberla creado. Queda en curso y se resuelve consultándole
      // (barrido o un nuevo clic); NUNCA se vuelve a crear otra devolución.
      eventoUnico(it, 'devolucion_incierta', e.pasarela ? e.message : 'sin respuesta');
      return { ok: true, estado: 'devolucion_pendiente', incierta: true, aviso: `${A.NOMBRE} no confirmó la devolución todavía. Queda en curso y se revisa sola; no la repitas.` };
    }
    db.prepare('UPDATE pago_intentos SET devolucion_externo=? WHERE id=?').run(r.externo || null, it.id);
    if (r.estado === 'devuelto') finalizarDevolucion(it);
    else if (r.estado === 'rechazado') volverAPagado(it, 'La pasarela rechazó la devolución.');
    else evento(local.id, it.referencia, it.pasarela, 'devolucion_pendiente', 'A la espera de la pasarela.');
    return { ok: true, estado: db.prepare('SELECT estado FROM pago_intentos WHERE id=?').get(it.id).estado };
  }

  // Salida manual de una devolución que quedó en curso (pasados ~10 min): el dueño comprobó en la pasarela si se hizo.
  function resolverManual(local, pedido, b = {}, nombre = '') {
    const it = db.prepare("SELECT * FROM pago_intentos WHERE pedido_id=? AND local_id=? AND estado='devolucion_pendiente' ORDER BY id DESC LIMIT 1").get(pedido.id, local.id);
    if (!it) return { error: 'Ese pedido no tiene una devolución en curso.', status: 409 };
    if (!['devuelto', 'pagado'].includes(b.resultado)) return { error: 'Indica si la devolución se hizo (devuelto) o no (pagado).', status: 400 };
    const viejo = db.prepare("SELECT 1 x FROM pago_intentos WHERE id=? AND actualizado <= datetime('now','localtime',?)").get(it.id, hace(manualS));
    if (!viejo) return { error: 'La devolución se inició hace poco: espera unos minutos a que la pasarela responda.', status: 409 };
    evento(local.id, it.referencia, it.pasarela, 'devolucion_manual', `Marcada como ${b.resultado === 'devuelto' ? 'devuelta' : 'no devuelta'} por ${String(nombre).slice(0, 60)}`);
    if (b.resultado === 'devuelto') finalizarDevolucion(it); else volverAPagado(it, 'Marcada a mano: no se devolvió.');
    return { ok: true, estado: db.prepare('SELECT estado FROM pago_intentos WHERE id=?').get(it.id).estado };
  }

  return { aplicar, conciliar, resolverManual, manualS, estadoConciliando, barrer, devolver, avisoDevolucion, intervalo: num(env.PAGOS_CONCILIAR_MS, 300000) };
}
