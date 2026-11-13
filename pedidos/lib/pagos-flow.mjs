// Adaptador de Flow (flow.cl) para el pago con tarjeta del pedido. Sin SDK: REST con fetch.
// Documentación: https://www.flow.cl/docs/api.html
//
// Firma: los parámetros se ordenan por nombre, se concatenan nombre+valor sin separadores y se
// firman con HMAC-SHA256 (hex) usando el secretKey del comercio. La confirmación de Flow solo trae
// un `token`: no viene firmada, así que el estado real se consulta a Flow (getStatus, firmado con
// nuestro secretKey) y eso es lo que manda. Lo que diga el navegador nunca cuenta.
import crypto from 'node:crypto';

export const NOMBRE = 'Flow';
// Estados de Flow: 1 pendiente, 2 pagada, 3 rechazada, 4 anulada.
const ESTADO = { 1: 'pendiente', 2: 'pagado', 3: 'rechazado', 4: 'rechazado' };

export function firmar(params, secret) {
  const cadena = Object.keys(params).sort().map((k) => `${k}${params[k]}`).join('');
  return crypto.createHmac('sha256', secret).update(cadena).digest('hex');
}

// Valida las credenciales que pega el dueño. Devuelve solo lo que se guarda (cifrado).
export function validarCredenciales(c = {}) {
  const api_key = String(c.api_key ?? '').trim(), secret = String(c.secret ?? '').trim();
  if (!/^[\w-]{10,80}$/.test(api_key)) return { error: 'La API Key de Flow no tiene el formato esperado.' };
  if (!/^[\w-]{10,80}$/.test(secret)) return { error: 'La Secret Key de Flow no tiene el formato esperado.' };
  return { cred: { api_key, secret } };
}
export const enmascarar = (c) => ({ api_key: mask(c.api_key) });
const mask = (v) => (v ? `••••${String(v).slice(-4)}` : null);

export function crearAdaptador({ apiUrl, cred, fetch = globalThis.fetch }) {
  async function llamar(metodo, ruta, params) {
    const p = { ...params, apiKey: cred.api_key };
    p.s = firmar(p, cred.secret);
    const cuerpo = new URLSearchParams(p).toString();
    const r = metodo === 'GET'
      ? await fetch(`${apiUrl}${ruta}?${cuerpo}`, { signal: AbortSignal.timeout(10000) })
      : await fetch(`${apiUrl}${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: cuerpo, signal: AbortSignal.timeout(10000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(`Flow ${r.status}: ${j.message || 'error'}`), { pasarela: true, status: r.status });
    return j;
  }
  return {
    // `email` lo exige Flow para crear el pago (ahí manda el comprobante).
    async crearPago({ referencia, monto, asunto, email, urlRetorno, urlConfirmacion }) {
      const j = await llamar('POST', '/payment/create', { commerceOrder: referencia, subject: asunto, currency: 'CLP', amount: monto,
        email, urlConfirmation: urlConfirmacion, urlReturn: urlRetorno });
      if (!j.url || !j.token) throw Object.assign(new Error('Flow no devolvió la URL de pago'), { pasarela: true });
      return { url: `${j.url}?token=${encodeURIComponent(j.token)}`, externo: String(j.flowOrder ?? j.token) };
    },
    // Confirmación servidor a servidor: Flow manda `token`; el estado se le pregunta a Flow.
    async verificarCallback({ cuerpo }) {
      const token = String(cuerpo?.token || '');
      if (!/^[\w-]{10,100}$/.test(token)) return { error: 'firma_invalida', detalle: 'Sin token de Flow' };
      const j = await llamar('GET', '/payment/getStatus', { token });
      return { referencia: String(j.commerceOrder || ''), estado: ESTADO[j.status] || 'pendiente', monto: Math.round(Number(j.amount)), moneda: j.currency || 'CLP',
        externo: String(j.flowOrder ?? ''), raw: { flowOrder: j.flowOrder, status: j.status, amount: j.amount, currency: j.currency, requestDate: j.requestDate } };
    },
  };
}
