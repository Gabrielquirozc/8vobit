// Pago con tarjeta en línea del pedido de la carta (el dinero va a la cuenta del local, no a 8vobit).
// Capa común sobre dos pasarelas (Flow y Mercado Pago); cada una es un adaptador con la misma forma:
//   crearPago({ referencia, monto, asunto, email, urlRetorno, urlConfirmacion }) -> { url, externo }
//   verificarCallback({ cuerpo, query, headers }) -> { referencia, estado, monto, moneda, externo, raw } | { error } | { ignorar }
//
// Reglas:
// - El monto sale siempre del pedido guardado (pedidos.total), nunca del navegador.
// - El pedido queda pagado solo por la confirmación servidor a servidor (webhook) verificada con la
//   pasarela; la página de retorno solo muestra el estado.
// - Idempotente por `referencia`: una confirmación repetida no vuelve a marcar ni a registrar el cobro.
// - Las credenciales de cada local se guardan cifradas (AES-256-GCM) con PAGOS_CLAVE del .env;
//   nunca vuelven al navegador completas ni se escriben en el registro.
// - Cobros reales: solo si el servidor tiene PAGOS_PRODUCCION=1 y el local eligió modo producción.
import crypto from 'node:crypto';
import * as FLOW from './pagos-flow.mjs';
import * as MP from './pagos-mercadopago.mjs';

export const PASARELAS = { flow: FLOW, mercadopago: MP };
const MODOS = ['sandbox', 'produccion'];
const REF = /^[\w-]{20,40}$/;
const EMAIL = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,120}\.[a-z]{2,24}$/i;
const MONTO_PRUEBA = 1000;
// HTTPS siempre; http solo hacia la misma máquina (pruebas automáticas con una pasarela simulada).
const red = (e) => e.pasarela || e.name === 'TimeoutError' || (e.name === 'TypeError' && !!e.cause);
const seguro = (u) => /^https:\/\//.test(u) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(u);

export function crearPagos(db, { env = process.env, base = '', fetch = globalThis.fetch } = {}) {
  db.exec(`
CREATE TABLE IF NOT EXISTS local_pagos_config (
  local_id INTEGER PRIMARY KEY REFERENCES locales(id), pasarela TEXT, modo TEXT NOT NULL DEFAULT 'sandbox',
  activo INTEGER NOT NULL DEFAULT 0, credenciales TEXT,
  creado TEXT NOT NULL DEFAULT (datetime('now','localtime')), actualizado TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS pago_intentos (
  id INTEGER PRIMARY KEY, local_id INTEGER NOT NULL REFERENCES locales(id), pedido_id INTEGER, pasarela TEXT NOT NULL,
  modo TEXT NOT NULL, referencia TEXT NOT NULL UNIQUE, externo TEXT, monto INTEGER NOT NULL,
  estado TEXT NOT NULL DEFAULT 'creado', raw TEXT,
  creado TEXT NOT NULL DEFAULT (datetime('now','localtime')), actualizado TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE INDEX IF NOT EXISTS pago_intentos_pedido ON pago_intentos(pedido_id);
CREATE TABLE IF NOT EXISTS pago_eventos (
  id INTEGER PRIMARY KEY, local_id INTEGER, referencia TEXT, pasarela TEXT, tipo TEXT NOT NULL, detalle TEXT,
  creado TEXT NOT NULL DEFAULT (datetime('now','localtime')));
`);

  const urlBase = String(env.PAGOS_URL_BASE || '').replace(/\/$/, '') + base;
  const urlBaseOk = !!env.PAGOS_URL_BASE && seguro(urlBase);
  const produccion = env.PAGOS_PRODUCCION === '1';
  const clave = env.PAGOS_CLAVE ? crypto.createHash('sha256').update(String(env.PAGOS_CLAVE)).digest() : null;
  const apiUrl = (pasarela, modo) => (pasarela === 'flow'
    ? (modo === 'produccion' ? env.FLOW_API_URL_PRODUCCION || 'https://www.flow.cl/api' : env.FLOW_API_URL_SANDBOX || 'https://sandbox.flow.cl/api')
    : env.MP_API_URL || 'https://api.mercadopago.com').replace(/\/$/, '');

  // ---------- cifrado de credenciales ----------
  function cifrar(obj) {
    const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', clave, iv);
    const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
    return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
  }
  function descifrar(txt) {
    if (!txt || !clave) return {};
    try {
      const [v, iv, tag, ct] = txt.split('.');
      if (v !== 'v1') return {};
      const d = crypto.createDecipheriv('aes-256-gcm', clave, Buffer.from(iv, 'base64url'));
      d.setAuthTag(Buffer.from(tag, 'base64url'));
      return JSON.parse(Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8'));
    } catch { return {}; } // otra PAGOS_CLAVE o dato dañado: como si no hubiera credenciales
  }

  const fila = (lid) => db.prepare('SELECT * FROM local_pagos_config WHERE local_id=?').get(lid);
  const evento = (lid, referencia, pasarela, tipo, detalle) =>
    db.prepare('INSERT INTO pago_eventos (local_id,referencia,pasarela,tipo,detalle) VALUES (?,?,?,?,?)').run(lid ?? null, referencia ?? null, pasarela ?? null, tipo, detalle ? String(detalle).slice(0, 300) : null);
  const adaptador = (pasarela, modo, cred) => PASARELAS[pasarela].crearAdaptador({ apiUrl: apiUrl(pasarela, modo), cred, modo, fetch });
  const urls = (ref, pasarela) => ({ urlRetorno: `${urlBase}/pago/retorno?ref=${ref}`, urlConfirmacion: `${urlBase}/api/pagos/webhook/${pasarela}?ref=${ref}` });

  // Configuración utilizable para cobrar ahora (o null, con el motivo para el panel).
  function activa(lid) {
    const f = fila(lid);
    if (!f?.activo || !PASARELAS[f.pasarela]) return null;
    const cred = descifrar(f.credenciales)[f.pasarela];
    if (!cred || !urlBaseOk || (f.modo === 'produccion' && !produccion)) return null;
    return { pasarela: f.pasarela, modo: f.modo, cred };
  }

  // ---------- panel (dueño) ----------
  function config(lid) {
    const f = fila(lid) || { pasarela: null, modo: 'sandbox', activo: 0 };
    const cred = descifrar(f.credenciales);
    return {
      pasarela: f.pasarela, modo: f.modo, activo: !!f.activo, funcionando: !!activa(lid),
      credenciales: Object.fromEntries(Object.entries(PASARELAS).map(([k, A]) => [k, cred[k] ? A.enmascarar(cred[k]) : null])),
      servidor: { cifrado: !!clave, url_base: urlBaseOk, produccion },
      intentos: db.prepare(`SELECT i.creado, i.pasarela, i.modo, i.monto, i.estado, p.numero, p.dia FROM pago_intentos i LEFT JOIN pedidos p ON p.id=i.pedido_id
        WHERE i.local_id=? ORDER BY i.id DESC LIMIT 15`).all(lid),
      eventos: db.prepare('SELECT creado, pasarela, tipo, detalle FROM pago_eventos WHERE local_id=? ORDER BY id DESC LIMIT 15').all(lid),
    };
  }
  function guardarConfig(lid, b = {}) {
    const f = fila(lid) || { pasarela: null, modo: 'sandbox', activo: 0, credenciales: null };
    const pasarela = b.pasarela === undefined ? f.pasarela : b.pasarela || null;
    if (pasarela !== null && !PASARELAS[pasarela]) return { error: 'Pasarela inválida.' };
    const modo = b.modo === undefined ? f.modo : b.modo;
    if (!MODOS.includes(modo)) return { error: 'Modo inválido.' };
    if (modo === 'produccion' && !produccion) return { error: 'Los cobros reales todavía no están habilitados en este servidor. Usa el modo de prueba (sandbox).' };
    let cred = descifrar(f.credenciales);
    if (b.credenciales && typeof b.credenciales === 'object' && Object.values(b.credenciales).some((v) => String(v ?? '').trim())) {
      if (!pasarela) return { error: 'Elige la pasarela antes de pegar las credenciales.' };
      if (!clave) return { error: 'El servidor no tiene PAGOS_CLAVE: no se pueden guardar credenciales.' };
      const v = PASARELAS[pasarela].validarCredenciales(b.credenciales);
      if (v.error) return v;
      cred = { ...cred, [pasarela]: v.cred };
    }
    if (b.quitar && PASARELAS[b.quitar]) { cred = { ...cred }; delete cred[b.quitar]; }
    const activo = b.activo === undefined ? !!f.activo && !!pasarela : !!b.activo;
    if (activo && !pasarela) return { error: 'Elige una pasarela para activar el pago con tarjeta.' };
    if (activo && !cred[pasarela]) return { error: `Pega las credenciales de ${PASARELAS[pasarela].NOMBRE} antes de activar.` };
    if (activo && !urlBaseOk) return { error: 'El servidor no tiene PAGOS_URL_BASE (https): la pasarela no sabría a dónde avisar.' };
    const txt = Object.keys(cred).length ? cifrar(cred) : null;
    db.prepare(`INSERT INTO local_pagos_config (local_id,pasarela,modo,activo,credenciales) VALUES (?,?,?,?,?)
      ON CONFLICT(local_id) DO UPDATE SET pasarela=excluded.pasarela, modo=excluded.modo, activo=excluded.activo, credenciales=excluded.credenciales, actualizado=datetime('now','localtime')`)
      .run(lid, pasarela, modo, activo ? 1 : 0, txt);
    return config(lid);
  }

  // Lo que la carta y el seguimiento necesitan saber (sin credenciales).
  function publico(lid) {
    const a = activa(lid);
    return a ? { pasarela: a.pasarela, nombre: PASARELAS[a.pasarela].NOMBRE, pide_email: a.pasarela === 'flow', prueba: a.modo === 'sandbox' } : null;
  }

  // ---------- iniciar ----------
  async function crearIntento(lid, pedidoId, { pasarela, modo, cred }, monto, asunto, email) {
    const referencia = crypto.randomBytes(18).toString('base64url');
    db.prepare('INSERT INTO pago_intentos (local_id,pedido_id,pasarela,modo,referencia,monto) VALUES (?,?,?,?,?,?)').run(lid, pedidoId, pasarela, modo, referencia, monto);
    try {
      const r = await adaptador(pasarela, modo, cred).crearPago({ referencia, monto, asunto, email, ...urls(referencia, pasarela) });
      if (!seguro(r.url)) throw Object.assign(new Error('URL de pago no segura'), { pasarela: true });
      db.prepare("UPDATE pago_intentos SET externo=?, actualizado=datetime('now','localtime') WHERE referencia=?").run(r.externo || null, referencia);
      return { url: r.url, referencia };
    } catch (e) {
      db.prepare("UPDATE pago_intentos SET estado='fallido', actualizado=datetime('now','localtime') WHERE referencia=?").run(referencia);
      evento(lid, referencia, pasarela, 'error_crear', e.pasarela ? e.message : 'sin respuesta');
      if (!red(e)) throw e;
      return { error: `${PASARELAS[pasarela].NOMBRE} no respondió. Intenta de nuevo o paga en el local.`, status: 502 };
    }
  }
  const emailDe = (b, pasarela) => {
    const email = String(b?.email ?? '').trim().slice(0, 190);
    if (email && !EMAIL.test(email)) return { error: 'Revisa el correo: no parece válido.' };
    if (!email && pasarela === 'flow') return { error: 'Escribe tu correo: ahí te llega el comprobante del pago.' };
    return { email: email || null };
  };
  async function iniciar(local, pedido, b = {}) {
    const a = activa(local.id);
    if (!a) return { error: 'Este local no tiene pago con tarjeta en línea.', status: 409 };
    if (pedido.canal !== 'web') return { error: 'Solo los pedidos de la carta se pagan en línea.', status: 409 };
    if (pedido.estado === 'anulado') return { error: 'Ese pedido está anulado.', status: 409 };
    if (pedido.pagado || pedido.fiado_nombre) return { error: 'Ese pedido ya está pagado.', status: 409 };
    if (!(pedido.total > 0)) return { error: 'El pedido no tiene monto a pagar.', status: 409 };
    const e = emailDe(b, a.pasarela);
    if (e.error) return { ...e, status: 400 };
    // El monto es el total guardado del pedido: lo que mande el navegador no se usa.
    return crearIntento(local.id, pedido.id, a, pedido.total, `Pedido #${pedido.numero} ${local.nombre}`.slice(0, 80), e.email);
  }
  // Prueba de conexión del panel: un pago de prueba sin pedido, solo en sandbox.
  async function probar(local, b = {}) {
    const f = fila(local.id);
    if (!f?.pasarela) return { error: 'Elige la pasarela y guarda sus credenciales primero.' };
    if (f.modo !== 'sandbox') return { error: 'La prueba de conexión se hace en modo sandbox, con las credenciales de prueba.' };
    const cred = descifrar(f.credenciales)[f.pasarela];
    if (!cred) return { error: `Pega las credenciales de ${PASARELAS[f.pasarela].NOMBRE} primero.` };
    if (!urlBaseOk) return { error: 'El servidor no tiene PAGOS_URL_BASE (https).' };
    const e = emailDe(b, f.pasarela);
    if (e.error) return e;
    return crearIntento(local.id, null, { pasarela: f.pasarela, modo: 'sandbox', cred }, MONTO_PRUEBA, `Prueba de conexion ${local.nombre}`.slice(0, 80), e.email);
  }

  // ---------- confirmación (webhook) ----------
  async function confirmar(pasarela, { ref, cuerpo, query, headers }) {
    if (!PASARELAS[pasarela]) return { status: 404, body: { error: 'Pasarela desconocida' } };
    const it = REF.test(ref || '') ? db.prepare('SELECT * FROM pago_intentos WHERE referencia=? AND pasarela=?').get(ref, pasarela) : null;
    if (!it) { evento(null, String(ref || '').slice(0, 40), pasarela, 'referencia_desconocida'); return { status: 404, body: { error: 'No existe' } }; }
    const cred = descifrar(fila(it.local_id)?.credenciales)[pasarela];
    if (!cred) { evento(it.local_id, ref, pasarela, 'sin_credenciales'); return { status: 503, body: { error: 'Sin credenciales' } }; }
    let v;
    try { v = await adaptador(pasarela, it.modo, cred).verificarCallback({ cuerpo, query, headers }); } catch (e) {
      evento(it.local_id, ref, pasarela, 'error_verificar', e.pasarela ? e.message : 'sin respuesta');
      if (!red(e)) throw e;
      // 4xx de la pasarela (token falso, pago inexistente): se rechaza. Caída: 502 para que reintente.
      return e.status >= 400 && e.status < 500 ? { status: 400, body: { error: 'Confirmación no válida' } } : { status: 502, body: { error: 'Pasarela no disponible' } };
    }
    if (v.ignorar) return { status: 200, body: { ok: true } };
    const rechazo = (tipo, detalle) => { evento(it.local_id, ref, pasarela, tipo, detalle); return { status: 400, body: { error: 'Confirmación no válida' } }; };
    if (v.error) return rechazo(v.error, v.detalle);
    if (v.referencia !== it.referencia) return rechazo('referencia_distinta', `La pasarela informa ${v.referencia.slice(0, 40)}`);
    if (v.estado === 'pagado' && (v.monto !== it.monto || v.moneda !== 'CLP')) return rechazo('monto_distinto', `Esperado ${it.monto} CLP, informado ${v.monto} ${v.moneda}`);

    db.exec('BEGIN IMMEDIATE');
    try {
      const ahora = db.prepare('SELECT estado FROM pago_intentos WHERE id=?').get(it.id);
      if (ahora.estado === 'pagado') { db.exec('COMMIT'); return { status: 200, body: { ok: true, repetido: true } }; }
      const estado = v.estado === 'pagado' ? 'pagado' : v.estado === 'rechazado' ? 'rechazado' : ahora.estado;
      db.prepare("UPDATE pago_intentos SET estado=?, externo=COALESCE(?,externo), raw=?, actualizado=datetime('now','localtime') WHERE id=?")
        .run(estado, v.externo || null, JSON.stringify(v.raw || {}), it.id);
      let tipo = estado === 'pagado' ? 'confirmado' : estado === 'rechazado' ? 'rechazado' : 'pendiente', detalle = null;
      if (estado === 'pagado' && it.pedido_id) {
        const p = db.prepare('SELECT id, total, pagado, estado FROM pedidos WHERE id=? AND local_id=?').get(it.pedido_id, it.local_id);
        if (p && !p.pagado && p.estado !== 'anulado') {
          db.prepare('UPDATE pedidos SET pagado=1, medio_pago=?, recibido=?, cobrado_en=?, cobrado_por=?, actualizado=? WHERE id=?')
            .run('tarjeta', p.total, new Date().toTimeString().slice(0, 5), `Pago en línea (${PASARELAS[pasarela].NOMBRE})`, Date.now(), p.id);
        } else { tipo = 'pago_a_revisar'; detalle = p?.estado === 'anulado' ? 'El pedido estaba anulado: revisa la devolución en la pasarela.' : 'El pedido ya estaba cobrado: revisa si corresponde devolver.'; }
      }
      evento(it.local_id, ref, pasarela, tipo, detalle);
      db.exec('COMMIT');
      return { status: 200, body: { ok: true } };
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }

  // Estado para la página de retorno (la referencia es aleatoria: quien la tiene, pagó ese pedido).
  function estado(ref) {
    if (!REF.test(ref || '')) return null;
    const it = db.prepare('SELECT i.estado, i.monto, i.pasarela, p.numero, p.token, p.pagado FROM pago_intentos i LEFT JOIN pedidos p ON p.id=i.pedido_id WHERE i.referencia=?').get(ref);
    if (!it) return null;
    return { estado: it.estado, monto: it.monto, pasarela: PASARELAS[it.pasarela].NOMBRE, numero: it.numero ?? null, pedido_pagado: !!it.pagado, seguimiento: it.token || null };
  }
  // Último pago en línea de un pedido (para el panel).
  const dePedido = (pedidoId) => db.prepare("SELECT pasarela, estado, monto, creado FROM pago_intentos WHERE pedido_id=? AND estado IN ('pagado','rechazado','creado') ORDER BY (estado='pagado') DESC, id DESC LIMIT 1").get(pedidoId) || null;

  return { config, guardarConfig, publico, iniciar, probar, confirmar, estado, dePedido };
}
