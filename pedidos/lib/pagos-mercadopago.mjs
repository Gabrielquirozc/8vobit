// Adaptador de Mercado Pago (Checkout Pro) para el pago con tarjeta del pedido. Sin SDK: REST con fetch.
// Documentación: https://www.mercadopago.cl/developers/es/reference (no se pudo leer automáticamente al
// escribir esto; lo marcado "verificar en sandbox" sale de memoria de la documentación).
//
// Se crea una "preferencia" con el monto calculado en el servidor y nuestra referencia como
// external_reference. El webhook trae solo el id del pago: el pago se consulta a Mercado Pago con
// el token del local y se compara referencia, monto y moneda. Si el local configuró la clave
// secreta de webhooks, además se exige la firma `x-signature` (HMAC-SHA256).
import crypto from 'node:crypto';

export const NOMBRE = 'Mercado Pago';
export const MONTO_MINIMO = 0;
// refunded: el pago ya fue devuelto (no es un rechazo; el orquestador nunca baja un pago confirmado).
// charged_back: contracargo; el orquestador lo deja como evento visible para el dueño.
const ESTADO = { approved: 'pagado', authorized: 'pendiente', pending: 'pendiente', in_process: 'pendiente', in_mediation: 'pendiente',
  rejected: 'rechazado', cancelled: 'rechazado', refunded: 'devuelto', charged_back: 'contracargo' };

export function validarCredenciales(c = {}) {
  const access_token = String(c.access_token ?? '').trim(), webhook_secret = String(c.webhook_secret ?? '').trim();
  if (!/^(TEST|APP_USR)-[\w-]{20,200}$/.test(access_token)) return { error: 'El Access Token de Mercado Pago debe empezar con TEST- o APP_USR-.' };
  if (webhook_secret && !/^[\w-]{16,128}$/.test(webhook_secret)) return { error: 'La clave secreta de webhooks no tiene el formato esperado.' };
  return { cred: { access_token, ...(webhook_secret ? { webhook_secret } : {}) } };
}
export const enmascarar = (c) => ({ access_token: c.access_token ? `${c.access_token.split('-')[0]}-••••${c.access_token.slice(-4)}` : null, webhook_secret: !!c.webhook_secret });

// Firma del webhook: cabecera x-signature "ts=...,v1=..." sobre "id:<data.id>;request-id:<x-request-id>;ts:<ts>;".
// El id es el `data.id` de la URL (query), en minúsculas si es alfanumérico.
export function firmaValida(headers, dataId, secret) {
  const partes = Object.fromEntries(String(headers['x-signature'] || '').split(',').map((x) => x.trim().split('=')));
  if (!partes.ts || !partes.v1) return false;
  const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  const manifiesto = `id:${id};request-id:${headers['x-request-id'] || ''};ts:${partes.ts};`;
  const bueno = crypto.createHmac('sha256', secret).update(manifiesto).digest('hex');
  return bueno.length === partes.v1.length && crypto.timingSafeEqual(Buffer.from(bueno), Buffer.from(partes.v1));
}

// Estado de una devolución: aprobada, rechazada/cancelada o en proceso.
const ESTADO_DEV = (st) => (st === 'approved' ? 'devuelto' : ['rejected', 'cancelled'].includes(st) ? 'rechazado' : 'pendiente');

// Pago de Mercado Pago -> forma común de los adaptadores.
const leerPago = (j, id) => ({ referencia: String(j.external_reference || ''), estado: ESTADO[j.status] || 'pendiente', monto: Math.round(Number(j.transaction_amount)),
  moneda: j.currency_id || '', externo: String(j.id ?? id), raw: { id: j.id, status: j.status, status_detail: j.status_detail, transaction_amount: j.transaction_amount, currency_id: j.currency_id } });

export function crearAdaptador({ apiUrl, cred, modo, fetch = globalThis.fetch }) {
  async function llamar(metodo, ruta, cuerpo, cabeceras = {}) {
    const r = await fetch(`${apiUrl}${ruta}`, { method: metodo, signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${cred.access_token}`, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}), ...cabeceras },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(`Mercado Pago ${r.status}: ${j.message || 'error'}`), { pasarela: true, status: r.status });
    return j;
  }
  return {
    // POST /checkout/preferences responde 201 con { id, init_point, sandbox_init_point }.
    async crearPago({ referencia, monto, asunto, email, urlRetorno, urlConfirmacion }) {
      const j = await llamar('POST', '/checkout/preferences', {
        items: [{ id: referencia, title: asunto, quantity: 1, unit_price: monto, currency_id: 'CLP' }],
        external_reference: referencia, notification_url: urlConfirmacion,
        back_urls: { success: urlRetorno, failure: urlRetorno, pending: urlRetorno }, auto_return: 'approved',
        ...(email ? { payer: { email } } : {}), statement_descriptor: asunto.slice(0, 22),
      });
      const url = modo === 'sandbox' ? j.sandbox_init_point || j.init_point : j.init_point;
      if (!url) throw Object.assign(new Error('Mercado Pago no devolvió la URL de pago'), { pasarela: true });
      return { url, externo: String(j.id || '') };
    },
    // Webhook: { type: 'payment', data: { id } } (o ?data.id=&type= / ?topic=payment&id= en el formato antiguo).
    async verificarCallback({ cuerpo, query, headers }) {
      const tipo = cuerpo?.type || query.get('type') || query.get('topic');
      // La firma se calcula con el data.id de la URL; el del cuerpo es el mismo, pero se prefiere la URL.
      const id = String(query.get('data.id') ?? cuerpo?.data?.id ?? query.get('id') ?? '');
      if (tipo !== 'payment') return { ignorar: true };
      if (!/^\d{1,30}$/.test(id)) return { error: 'firma_invalida', detalle: 'Id de pago inválido' };
      if (cred.webhook_secret && !firmaValida(headers, id, cred.webhook_secret)) return { error: 'firma_invalida', detalle: 'x-signature no coincide' };
      return leerPago(await llamar('GET', `/v1/payments/${id}`), id);
    },
    // Conciliación sin webhook: busca los pagos de nuestra preferencia por external_reference y toma el
    // aprobado si existe (si no, el más reciente). GET /v1/payments/search responde { results: [...] }.
    async consultar({ referencia }) {
      const j = await llamar('GET', `/v1/payments/search?external_reference=${encodeURIComponent(referencia)}&sort=date_created&criteria=desc`);
      const r = (Array.isArray(j.results) ? j.results : []).filter((x) => String(x.external_reference) === referencia);
      const p = r.find((x) => x.status === 'approved') || r[0];
      return p ? leerPago(p) : { ninguno: true };
    },
    // Devolución total: sin monto se devuelve todo el pago. X-Idempotency-Key = referencia: un reintento
    // (aun si no supimos la respuesta) no devuelve dos veces. Responde 201 { id, payment_id, amount, status }.
    async devolver({ referencia, externo }) {
      if (!/^\d{1,30}$/.test(externo || '')) throw Object.assign(new Error('Sin el id del pago de Mercado Pago'), { pasarela: true });
      const j = await llamar('POST', `/v1/payments/${externo}/refunds`, {}, { 'X-Idempotency-Key': referencia });
      return { estado: ESTADO_DEV(j.status), externo: String(j.id ?? ''), raw: { id: j.id, status: j.status, amount: j.amount } };
    },
    async consultarDevolucion({ externo }) {
      const j = await llamar('GET', `/v1/payments/${externo}/refunds`);
      const l = Array.isArray(j) ? j : [];
      if (l.some((x) => x.status === 'approved')) return { estado: 'devuelto' };
      // Sin devoluciones listadas, el propio pago dice si ya está devuelto (status refunded o refunds[] aprobadas).
      if (!l.length) {
        const p = await llamar('GET', `/v1/payments/${externo}`);
        if (p.status === 'refunded' || (Array.isArray(p.refunds) && p.refunds.some((x) => x.status === 'approved'))) return { estado: 'devuelto' };
        // 'ninguna' solo si Mercado Pago lo dice explícito: pago no devuelto Y `refunds` presente como arreglo vacío
        // (además del listado vacío). Si el campo falta o no es un arreglo, es duda: queda 'pendiente' (solo devolver() lo usa).
        if (p.status !== 'refunded' && Array.isArray(p.refunds) && p.refunds.length === 0) return { estado: 'ninguna' };
      }
      return { estado: l.length && l.every((x) => ['rejected', 'cancelled'].includes(x.status)) ? 'rechazado' : 'pendiente' };
    },
  };
}
