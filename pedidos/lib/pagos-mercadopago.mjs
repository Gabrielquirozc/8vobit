// Adaptador de Mercado Pago (Checkout Pro) para el pago con tarjeta del pedido. Sin SDK: REST con fetch.
// Documentación: https://www.mercadopago.cl/developers/es/reference
//
// Se crea una "preferencia" con el monto calculado en el servidor y nuestra referencia como
// external_reference. El webhook trae solo el id del pago: el pago se consulta a Mercado Pago con
// el token del local y se compara referencia, monto y moneda. Si el local configuró la clave
// secreta de webhooks, además se exige la firma `x-signature` (HMAC-SHA256).
import crypto from 'node:crypto';

export const NOMBRE = 'Mercado Pago';
const ESTADO = { approved: 'pagado', authorized: 'pendiente', pending: 'pendiente', in_process: 'pendiente', in_mediation: 'pendiente',
  rejected: 'rechazado', cancelled: 'rechazado', refunded: 'rechazado', charged_back: 'rechazado' };

export function validarCredenciales(c = {}) {
  const access_token = String(c.access_token ?? '').trim(), webhook_secret = String(c.webhook_secret ?? '').trim();
  if (!/^(TEST|APP_USR)-[\w-]{20,200}$/.test(access_token)) return { error: 'El Access Token de Mercado Pago debe empezar con TEST- o APP_USR-.' };
  if (webhook_secret && !/^[\w-]{16,128}$/.test(webhook_secret)) return { error: 'La clave secreta de webhooks no tiene el formato esperado.' };
  return { cred: { access_token, ...(webhook_secret ? { webhook_secret } : {}) } };
}
export const enmascarar = (c) => ({ access_token: c.access_token ? `${c.access_token.split('-')[0]}-••••${c.access_token.slice(-4)}` : null, webhook_secret: !!c.webhook_secret });

// Firma del webhook: "ts=...,v1=..." sobre "id:<data.id>;request-id:<x-request-id>;ts:<ts>;".
export function firmaValida(headers, dataId, secret) {
  const partes = Object.fromEntries(String(headers['x-signature'] || '').split(',').map((x) => x.trim().split('=')));
  if (!partes.ts || !partes.v1) return false;
  const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  const manifiesto = `id:${id};request-id:${headers['x-request-id'] || ''};ts:${partes.ts};`;
  const bueno = crypto.createHmac('sha256', secret).update(manifiesto).digest('hex');
  return bueno.length === partes.v1.length && crypto.timingSafeEqual(Buffer.from(bueno), Buffer.from(partes.v1));
}

export function crearAdaptador({ apiUrl, cred, modo, fetch = globalThis.fetch }) {
  async function llamar(metodo, ruta, cuerpo) {
    const r = await fetch(`${apiUrl}${ruta}`, { method: metodo, signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${cred.access_token}`, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(`Mercado Pago ${r.status}: ${j.message || 'error'}`), { pasarela: true, status: r.status });
    return j;
  }
  return {
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
      const id = String(cuerpo?.data?.id ?? query.get('data.id') ?? query.get('id') ?? '');
      if (tipo !== 'payment') return { ignorar: true };
      if (!/^\d{1,30}$/.test(id)) return { error: 'firma_invalida', detalle: 'Id de pago inválido' };
      if (cred.webhook_secret && !firmaValida(headers, id, cred.webhook_secret)) return { error: 'firma_invalida', detalle: 'x-signature no coincide' };
      const j = await llamar('GET', `/v1/payments/${id}`);
      return { referencia: String(j.external_reference || ''), estado: ESTADO[j.status] || 'pendiente', monto: Math.round(Number(j.transaction_amount)),
        moneda: j.currency_id || '', externo: String(j.id ?? id), raw: { id: j.id, status: j.status, status_detail: j.status_detail, transaction_amount: j.transaction_amount, currency_id: j.currency_id } };
    },
  };
}
