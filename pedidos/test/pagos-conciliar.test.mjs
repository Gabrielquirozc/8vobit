// Pago con tarjeta en línea: conciliación sin webhook, expiración y devoluciones, contra la pasarela
// simulada (test/_sim.mjs). Dos servidores: uno sin barrido periódico (para medir las consultas de la
// página de retorno y las devoluciones) y otro con barrido y plazos cortos (para el barrido y el vencimiento).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { crearSim, levantar, FLOW, MP_TOKEN, MP_SECRETO, nuevoPedido, esperar, hasta } from './_sim.mjs';

let A, B; // A: sin barrido; B: barrido cada 0,5 s y vence a los 5 s
before(async () => {
  A = await levantar(crearSim(), { PAGOS_ESPERA_S: '3', PAGOS_LIMITE_S: '4', PAGOS_CONCILIAR_MS: '0', PAGOS_MANUAL_S: '2', PAGOS_DEVOLVER_MAX: '1000' });
  B = await levantar(crearSim(), { PAGOS_ESPERA_S: '1', PAGOS_LIMITE_S: '1', PAGOS_EXPIRA_S: '5', PAGOS_CONCILIAR_MS: '500' });
});
after(async () => { await A?.cerrar(); await B?.cerrar(); });

// Dueño con Flow y Mercado Pago guardados (el activo se cambia con usar()).
async function preparar(S) {
  const pub = S.cliente(), dueno = S.cliente();
  assert.equal((await dueno('POST', '/api/panel/login', { slug: 'gassuso', password: 'clave-de-prueba' })).status, 200);
  assert.equal((await dueno('PUT', '/api/panel/pagos', { pasarela: 'mercadopago', modo: 'sandbox', credenciales: { access_token: MP_TOKEN, webhook_secret: MP_SECRETO } })).status, 200);
  assert.equal((await dueno('PUT', '/api/panel/pagos', { pasarela: 'flow', activo: true, credenciales: FLOW })).status, 200);
  return { pub, dueno };
}
const usar = async (dueno, pasarela) => assert.equal((await dueno('PUT', '/api/panel/pagos', { pasarela })).status, 200);
const pagar = async (pub, p, b = {}) => { const r = await pub('POST', `/api/seguimiento/${p.token}/pagar`, { email: 'ana@correo.cl', ...b }); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.referencia; };
const tokenFlow = (S, ref) => [...S.pas.flow].find(([, x]) => x.commerceOrder === ref)?.[0];
const hookFlow = (pub, S, ref) => pub('POST', `/api/pagos/webhook/flow?ref=${ref}`, `token=${tokenFlow(S, ref)}`);
let seq = 555000;
const pagoMP = (S, ref, total, extra = {}) => { const id = String(++seq); S.pas.mpPagos.set(id, { status: 'approved', external_reference: ref, transaction_amount: total, currency_id: 'CLP', ...extra }); return id; };
function hookMP(pub, ref, id) {
  const ts = String(Date.now()), rid = `req-${id}`, v1 = crypto.createHmac('sha256', MP_SECRETO).update(`id:${id};request-id:${rid};ts:${ts};`).digest('hex');
  return pub('POST', `/api/pagos/webhook/mercadopago?ref=${ref}&data.id=${id}&type=payment`, { type: 'payment', data: { id } }, { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': rid });
}
const intento = (S, ref) => S.leerDb('SELECT estado, externo, devolucion_externo FROM pago_intentos WHERE referencia=?', ref)[0];
const eventos = (S, ref, tipo) => S.leerDb('SELECT COUNT(*) n FROM pago_eventos WHERE referencia=? AND tipo=?', ref, tipo)[0].n;

test('conciliación: la página de retorno resuelve el pago sin webhook, con límite de frecuencia por referencia', async () => {
  const { pub, dueno } = await preparar(A);
  const llamadasFlow = () => A.sim.cuenta('GET', '/flow/payment/getStatusByCommerceId');
  const pf = await nuevoPedido(pub), pm = await nuevoPedido(pub), pr = await nuevoPedido(pub);
  await usar(dueno, 'flow');
  const rf = await pagar(pub, pf), rr = await pagar(pub, pr);
  await usar(dueno, 'mercadopago');
  const rm = await pagar(pub, pm, { email: undefined });
  // Recién iniciado (menos de 3 s): se muestra el estado guardado y no se molesta a la pasarela.
  for (const r of [rf, rm, rr]) assert.equal((await pub('GET', `/api/pagos/estado/${r}`)).body.estado, 'creado');
  assert.equal(llamadasFlow(), 0);
  // La pasarela cobró, pero el webhook no llegó.
  A.pas.flow.get(tokenFlow(A, rf)).status = 2;
  pagoMP(A, rm, pm.total - 1, { status: 'rejected' }); // un intento rechazado antes...
  pagoMP(A, rm, pm.total); // ...y el aprobado: el que cuenta
  await esperar(3300);
  const ef = (await pub('GET', `/api/pagos/estado/${rf}`)).body;
  assert.equal(ef.estado, 'pagado');
  assert.equal(ef.seguimiento, pf.token);
  assert.equal((await pub('GET', `/api/pagos/estado/${rm}`)).body.estado, 'pagado');
  assert.equal((await pub('GET', `/api/seguimiento/${pf.token}`)).body.pagado, true);
  const ped = (await dueno('GET', `/api/panel/pedidos/${pm.id}`)).body;
  assert.equal(ped.medio_pago, 'tarjeta');
  assert.equal(ped.cobrado_por, 'Pago en línea (Mercado Pago)');
  assert.equal(eventos(A, rf, 'confirmado'), 1);
  // Un webhook tardío no duplica nada.
  assert.equal((await hookFlow(pub, A, rf)).body.repetido, true);
  assert.equal(eventos(A, rf, 'confirmado'), 1);
  // Pago pendiente en Flow: se consulta una vez y, mientras no pasen 4 s, no se vuelve a consultar.
  const antes = llamadasFlow();
  assert.equal((await pub('GET', `/api/pagos/estado/${rr}`)).body.estado, 'creado');
  for (let i = 0; i < 3; i++) await pub('GET', `/api/pagos/estado/${rr}`);
  assert.equal(llamadasFlow(), antes + 1);
  // Pasado el límite se vuelve a preguntar y ahora sí está pagado.
  A.pas.flow.get(tokenFlow(A, rr)).status = 2;
  await esperar(4200);
  assert.equal((await pub('GET', `/api/pagos/estado/${rr}`)).body.estado, 'pagado');
  assert.equal(llamadasFlow(), antes + 2);
});

test('conciliación: pago aprobado por otro monto no marca el pedido y queda registrado', async () => {
  const { pub, dueno } = await preparar(A);
  await usar(dueno, 'mercadopago');
  const p = await nuevoPedido(pub), ref = await pagar(pub, p);
  pagoMP(A, ref, p.total - 100);
  await esperar(3300);
  assert.equal((await pub('GET', `/api/pagos/estado/${ref}`)).body.estado, 'creado');
  assert.equal((await pub('GET', `/api/seguimiento/${p.token}`)).body.pagado, false);
  assert.equal(eventos(A, ref, 'monto_distinto'), 1);
});

test('devolución con Mercado Pago: solo el dueño, confirmando el monto, una sola vez', async () => {
  const { pub, dueno } = await preparar(A);
  await usar(dueno, 'mercadopago');
  const p = await nuevoPedido(pub), ref = await pagar(pub, p), id = pagoMP(A, ref, p.total);
  assert.equal((await hookMP(pub, ref, id)).status, 200);
  const url = `/api/panel/pedidos/${p.id}/devolver-pago`;
  // Otro rol del mismo local (403) y otro local (404).
  assert.equal((await dueno('POST', '/api/panel/usuarios', { nombre: 'Caja', rol: 'caja', pin: '4826' })).status, 201);
  const caja = A.cliente();
  assert.equal((await caja('POST', '/api/panel/login', { slug: 'gassuso', password: 'clave-de-prueba' })).status, 200);
  assert.equal((await caja('POST', '/api/panel/pin', { pin: '4826' })).status, 200);
  assert.equal((await caja('POST', url, { confirmar_monto: p.total })).status, 403);
  const ad = A.cliente();
  assert.equal((await ad('POST', '/api/admin/login', { password: 'admin-de-prueba' })).status, 200);
  const nuevo = await ad('POST', '/api/admin/locales', { slug: 'la-picada', nombre: 'La Picada', plan: 'canal', whatsapp: '+56 9 1234 5678' });
  const otro = A.cliente();
  assert.equal((await otro('POST', '/api/panel/login', { slug: 'la-picada', password: nuevo.body.clave })).status, 200);
  assert.equal((await otro('POST', url, { confirmar_monto: p.total })).status, 404); // convención del panel: el pedido no existe para otro local
  assert.equal(A.pas.mpDev.length, 0);
  // Sin confirmar el monto total no se devuelve nada.
  assert.equal((await dueno('POST', url, {})).status, 400);
  assert.equal((await dueno('POST', url, { confirmar_monto: p.total - 1 })).status, 400);
  assert.equal(A.pas.mpDev.length, 0);
  // Anular un pedido pagado en línea avisa que hay que devolver; el pedido sigue pagado hasta devolver.
  const an = await dueno('PATCH', `/api/panel/pedidos/${p.id}`, { estado: 'anulado' });
  assert.equal(an.status, 200);
  assert.match(an.body.aviso_devolucion, /devolver/);
  assert.equal(an.body.pago_online.estado, 'pagado');
  const r = await dueno('POST', url, { confirmar_monto: p.total });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.estado, 'devuelto');
  assert.equal(r.body.pedido.pagado, 0);
  assert.equal(r.body.pedido.medio_pago, null);
  assert.equal(r.body.pedido.pago_online.estado, 'devuelto');
  assert.deepEqual(A.pas.mpIdempotencia, [ref]); // X-Idempotency-Key = referencia
  assert.equal(intento(A, ref).estado, 'devuelto');
  assert.equal(eventos(A, ref, 'devuelto'), 1);
  // Doble devolución: rechazada, sin una segunda llamada a la pasarela.
  assert.equal((await dueno('POST', url, { confirmar_monto: p.total })).status, 409);
  assert.equal(A.pas.mpDev.length, 1);
  // El aviso de la pasarela por el pago devuelto (status refunded) no lo vuelve a pagado ni a rechazado.
  assert.equal((await hookMP(pub, ref, id)).status, 200);
  assert.equal(intento(A, ref).estado, 'devuelto');
  assert.equal((await pub('GET', `/api/seguimiento/${p.token}`)).body.pagado, false);
});

test('devolución con Flow: queda pendiente hasta que Flow la confirma (aviso o barrido) y el pedido vuelve a por cobrar', async () => {
  const { pub, dueno } = await preparar(A);
  await usar(dueno, 'flow');
  const p = await nuevoPedido(pub), ref = await pagar(pub, p);
  const url = `/api/panel/pedidos/${p.id}/devolver-pago`;
  assert.equal((await dueno('POST', url, { confirmar_monto: p.total })).status, 409); // aún no pagó
  A.pas.flow.get(tokenFlow(A, ref)).status = 2;
  assert.equal((await hookFlow(pub, A, ref)).status, 200);
  assert.equal((await pub('GET', `/api/seguimiento/${p.token}`)).body.pagado, true);
  assert.equal((await dueno('POST', url, { confirmar_monto: p.total, email: 'correo-malo' })).status, 400); // Flow exige un correo válido; el local no tiene uno legal en la prueba
  const r = await dueno('POST', url, { confirmar_monto: p.total, email: 'dueno@local.cl' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.estado, 'devolucion_pendiente');
  assert.equal(r.body.pedido.pagado, 1); // todavía no es plata devuelta
  const [d] = [...A.pas.flowDev.values()];
  assert.equal(d.receiverEmail, 'dueno@local.cl');
  assert.equal(d.amount, p.total);
  assert.equal(d.commerceOrder, ref);
  assert.equal(d.urlCallBack, `https://pedidos.test/api/pagos/devolucion/flow?ref=${ref}`);
  assert.ok(intento(A, ref).devolucion_externo);
  // Otro clic mientras está pendiente: no crea otra devolución.
  const otra = await dueno('POST', url, { confirmar_monto: p.total, email: 'dueno@local.cl' });
  assert.equal(otra.body.estado, 'devolucion_pendiente');
  assert.equal(A.pas.flowDev.size, 1);
  // Flow avisa (el contenido del aviso no cuenta: se le pregunta a Flow). Mientras no esté devuelta, nada cambia.
  assert.equal((await pub('POST', `/api/pagos/devolucion/flow?ref=${ref}`, 'token=cualquiera')).status, 200);
  assert.equal(intento(A, ref).estado, 'devolucion_pendiente');
  d.status = 'refunded';
  assert.equal((await pub('POST', `/api/pagos/devolucion/flow?ref=${ref}`, 'token=cualquiera')).status, 200);
  assert.equal(intento(A, ref).estado, 'devuelto');
  const ped = (await dueno('GET', `/api/panel/pedidos/${p.id}`)).body;
  assert.equal(ped.pagado, 0);
  assert.equal(ped.medio_pago, null);
  assert.equal(ped.pago_online.estado, 'devuelto');
  assert.equal((await dueno('POST', url, { confirmar_monto: p.total, email: 'dueno@local.cl' })).status, 409);
  assert.equal(A.pas.flowDev.size, 1);
  assert.equal((await pub('POST', '/api/pagos/devolucion/flow?ref=referencia-que-no-existe-aqui', '')).status, 404);
});

test('devolución sin respuesta de la pasarela (Mercado Pago): queda en curso, el reintento solo consulta y no crea otra', async () => {
  const { pub, dueno } = await preparar(A);
  await usar(dueno, 'mercadopago');
  const p = await nuevoPedido(pub), ref = await pagar(pub, p), id = pagoMP(A, ref, p.total);
  assert.equal((await hookMP(pub, ref, id)).status, 200);
  const url = `/api/panel/pedidos/${p.id}/devolver-pago`;
  A.pas.mpFalla500 = true; // la pasarela crea la devolución pero la respuesta no llega
  const r = await dueno('POST', url, { confirmar_monto: p.total });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.estado, 'devolucion_pendiente');
  assert.equal(r.body.incierta, true);
  assert.equal(intento(A, ref).estado, 'devolucion_pendiente');
  assert.equal((await dueno('GET', `/api/panel/pedidos/${p.id}`)).body.pagado, 1);
  // Reintento: consulta, descubre que sí se devolvió y cierra; no hay una segunda devolución.
  const r2 = await dueno('POST', url, { confirmar_monto: p.total });
  assert.equal(r2.body.estado, 'devuelto');
  assert.equal(A.pas.mpDev.filter((d) => d.payment_id === Number(id)).length, 1);
  assert.equal((await dueno('GET', `/api/panel/pedidos/${p.id}`)).body.pagado, 0);
});

test('devolución sin respuesta de la pasarela (Flow): queda en curso y se resuelve consultando por refundCommerceOrder', async () => {
  const { pub, dueno } = await preparar(A);
  await usar(dueno, 'flow');
  const p = await nuevoPedido(pub), ref = await pagar(pub, p);
  A.pas.flow.get(tokenFlow(A, ref)).status = 2;
  assert.equal((await hookFlow(pub, A, ref)).status, 200);
  const url = `/api/panel/pedidos/${p.id}/devolver-pago`, cuerpo = { confirmar_monto: p.total, email: 'dueno@local.cl' };
  const antes = A.pas.flowDev.size;
  A.pas.flowFalla500 = true;
  const r = await dueno('POST', url, cuerpo);
  assert.equal(r.body.estado, 'devolucion_pendiente');
  assert.equal(r.body.incierta, true);
  assert.equal(intento(A, ref).devolucion_externo, null);
  // Reintento mientras Flow aún no la termina: sigue en curso y no se crea otra.
  assert.equal((await dueno('POST', url, cuerpo)).body.estado, 'devolucion_pendiente');
  assert.equal(A.pas.flowDev.size, antes + 1);
  [...A.pas.flowDev.values()].at(-1).status = 'refunded';
  assert.equal((await dueno('POST', url, cuerpo)).body.estado, 'devuelto');
  assert.equal(A.pas.flowDev.size, antes + 1);
  assert.equal((await dueno('GET', `/api/panel/pedidos/${p.id}`)).body.pagado, 0);
});

test('devolución rechazada explícitamente (Mercado Pago, status rejected): vuelve a pagado', async () => {
  const { pub, dueno } = await preparar(A);
  await usar(dueno, 'mercadopago');
  const p = await nuevoPedido(pub), ref = await pagar(pub, p), id = pagoMP(A, ref, p.total);
  assert.equal((await hookMP(pub, ref, id)).status, 200);
  A.pas.mpDevEstado = 'rejected';
  const r = await dueno('POST', `/api/panel/pedidos/${p.id}/devolver-pago`, { confirmar_monto: p.total });
  A.pas.mpDevEstado = '';
  assert.equal(r.body.estado, 'pagado');
  assert.equal(eventos(A, ref, 'devolucion_rechazada'), 1);
});

test('contracargo de un pago ya cobrado: queda como evento y el pago sigue pagado', async () => {
  const { pub, dueno } = await preparar(A);
  await usar(dueno, 'mercadopago');
  const p = await nuevoPedido(pub), ref = await pagar(pub, p), id = pagoMP(A, ref, p.total);
  assert.equal((await hookMP(pub, ref, id)).status, 200);
  A.pas.mpPagos.get(id).status = 'charged_back';
  assert.equal((await hookMP(pub, ref, id)).status, 200);
  assert.equal((await hookMP(pub, ref, id)).status, 200);
  assert.equal(intento(A, ref).estado, 'pagado');
  assert.equal(eventos(A, ref, 'contracargo'), 1);
});

test('si el total del pedido cambió respecto de lo cobrado, el pago queda a revisar y el pedido no se marca pagado', async () => {
  const { pub, dueno } = await preparar(A);
  await usar(dueno, 'flow');
  const p = await nuevoPedido(pub), ref = await pagar(pub, p);
  A.escribirDb('UPDATE pedidos SET total=total+500 WHERE id=?', p.id);
  A.pas.flow.get(tokenFlow(A, ref)).status = 2;
  assert.equal((await hookFlow(pub, A, ref)).status, 200);
  assert.equal(intento(A, ref).estado, 'pagado'); // el dinero entró
  assert.equal((await pub('GET', `/api/seguimiento/${p.token}`)).body.pagado, false);
  assert.equal(eventos(A, ref, 'pago_a_revisar'), 1);
});


test('devolución rechazada por la pasarela: el pago sigue vigente y se puede reintentar', async () => {
  const { pub, dueno } = await preparar(A);
  await usar(dueno, 'mercadopago');
  const p = await nuevoPedido(pub), ref = await pagar(pub, p), id = pagoMP(A, ref, p.total);
  assert.equal((await hookMP(pub, ref, id)).status, 200);
  A.pas.mpPagos.get(id).status = 'in_process'; // la pasarela no la acepta
  const r = await dueno('POST', `/api/panel/pedidos/${p.id}/devolver-pago`, { confirmar_monto: p.total });
  assert.equal(r.status, 502);
  assert.equal(intento(A, ref).estado, 'pagado');
  assert.equal((await dueno('GET', `/api/panel/pedidos/${p.id}`)).body.pagado, 1);
  assert.equal(eventos(A, ref, 'devolucion_rechazada'), 1);
  A.pas.mpPagos.get(id).status = 'approved';
  assert.equal((await dueno('POST', `/api/panel/pedidos/${p.id}/devolver-pago`, { confirmar_monto: p.total })).body.estado, 'devuelto');
});

test('barrido: concilia solo lo que el webhook no avisó; vence a las 24 h y un pago tardío igual se acepta', async () => {
  const { pub, dueno } = await preparar(B);
  await usar(dueno, 'flow');
  const [p1, p2, p3, p4] = [await nuevoPedido(pub), await nuevoPedido(pub), await nuevoPedido(pub), await nuevoPedido(pub)];
  const r1 = await pagar(pub, p1), r2 = await pagar(pub, p2), r3 = await pagar(pub, p3), r4 = await pagar(pub, p4);
  B.pas.flow.get(tokenFlow(B, r2)).status = 2; // pagado sin webhook
  B.pas.flow.get(tokenFlow(B, r3)).status = 3; // rechazado sin webhook
  await hasta(() => intento(B, r2).estado === 'pagado');
  assert.equal((await dueno('GET', `/api/panel/pedidos/${p2.id}`)).body.cobrado_por, 'Pago en línea (Flow)');
  await hasta(() => intento(B, r3).estado === 'rechazado');
  // El cliente reintenta con otra tarjeta y Flow lo cobra: sin webhook, el barrido lo concilia aunque estuviera rechazado.
  B.pas.flow.get(tokenFlow(B, r3)).status = 2;
  await hasta(() => intento(B, r3).estado === 'pagado');
  assert.equal((await pub('GET', `/api/seguimiento/${p3.token}`)).body.pagado, true);
  assert.equal(intento(B, r1).estado, 'creado'); // todavía dentro de las 24 h (5 s en la prueba)
  // r1 nunca se pagó: pasado el plazo (5 s en la prueba) queda expirado y el pedido sigue por cobrar.
  await hasta(() => intento(B, r1).estado === 'expirado' && intento(B, r4).estado === 'expirado', 12000);
  assert.equal(eventos(B, r1, 'expirado'), 1);
  assert.equal((await pub('GET', `/api/seguimiento/${p1.token}`)).body.pagado, false);
  assert.equal((await pub('GET', `/api/pagos/estado/${r1}`)).body.estado, 'expirado');
  // Flow cobra después de vencido: el dinero entró. Primero lo concilia el barrido sin webhook (p4, vencido pero dentro de la ventana)...
  B.pas.flow.get(tokenFlow(B, r4)).status = 2;
  await hasta(() => intento(B, r4).estado === 'pagado');
  assert.equal((await pub('GET', `/api/seguimiento/${p4.token}`)).body.pagado, true);
  // ...y también se acepta por webhook (r1).
  B.pas.flow.get(tokenFlow(B, r1)).status = 2;
  assert.equal((await hookFlow(pub, B, r1)).status, 200);
  assert.equal(intento(B, r1).estado, 'pagado');
  assert.equal((await pub('GET', `/api/seguimiento/${p1.token}`)).body.pagado, true);
  // Y un pagado nunca baja a otro estado, ni siquiera si la pasarela cambia de opinión.
  B.pas.flow.get(tokenFlow(B, r1)).status = 3;
  assert.equal((await hookFlow(pub, B, r1)).body.repetido, true);
  await esperar(1500);
  assert.equal(intento(B, r1).estado, 'pagado');
});

test('barrido: una pasarela con respuestas basura o caída no tumba el servidor ni llena de eventos, y se recupera', async () => {
  const { pub, dueno } = await preparar(B);
  await usar(dueno, 'flow');
  const p = await nuevoPedido(pub), ref = await pagar(pub, p);
  B.pas.flowModo = 'basura'; // 200 con texto que no es JSON
  await esperar(2600);
  assert.equal((await pub('GET', '/salud')).status, 200);
  assert.ok(eventos(B, ref, 'referencia_distinta') >= 1, 'se registró la respuesta rara');
  assert.ok(eventos(B, ref, 'referencia_distinta') <= 1, 'el mismo evento no se repite en cada barrido');
  B.pas.flowModo = '500'; // pasarela caída: se corta la pasada y se reintenta
  await esperar(1200);
  assert.equal((await pub('GET', '/salud')).status, 200);
  B.pas.flowModo = '';
  B.pas.flow.get(tokenFlow(B, ref)).status = 2;
  await hasta(() => intento(B, ref).estado === 'pagado');
  assert.equal((await pub('GET', '/salud')).status, 200);
});

test('devolución con 4xx "ya devuelto" (Mercado Pago): antes de revertir se consulta y se cierra como devuelto', async () => {
  const { pub, dueno } = await preparar(A);
  await usar(dueno, 'mercadopago');
  const p = await nuevoPedido(pub), ref = await pagar(pub, p), id = pagoMP(A, ref, p.total);
  assert.equal((await hookMP(pub, ref, id)).status, 200);
  A.pas.mpPagos.get(id).status = 'refunded'; // el dueño ya la devolvió desde el panel de Mercado Pago
  const r = await dueno('POST', `/api/panel/pedidos/${p.id}/devolver-pago`, { confirmar_monto: p.total });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.estado, 'devuelto');
  assert.equal(r.body.pedido.pagado, 0);
  assert.equal(A.pas.mpDev.filter((d) => d.payment_id === Number(id)).length, 0);
});

test('devolución en curso sin salida: el dueño la cierra a mano pasados unos minutos, con su nombre en el evento', async () => {
  const { pub, dueno } = await preparar(A);
  await usar(dueno, 'mercadopago');
  const mk = async () => {
    const p = await nuevoPedido(pub), ref = await pagar(pub, p), id = pagoMP(A, ref, p.total);
    assert.equal((await hookMP(pub, ref, id)).status, 200);
    A.pas.mpFalla500 = true;
    A.pas.mpPagos.get(id).status = 'approved';
    const r = await dueno('POST', `/api/panel/pedidos/${p.id}/devolver-pago`, { confirmar_monto: p.total });
    assert.equal(r.body.estado, 'devolucion_pendiente');
    // La pasarela dejó la devolución sin confirmar para siempre.
    A.pas.mpDev.pop(); A.pas.mpClaves.clear(); A.pas.mpPagos.get(id).status = 'approved';
    return { p, ref };
  };
  const a = await mk(), url = (x) => `/api/panel/pedidos/${x.p.id}/devolucion-manual`;
  assert.equal((await dueno('POST', url(a), { resultado: 'devuelto' })).status, 409); // muy reciente
  const caja = A.cliente();
  assert.equal((await caja('POST', '/api/panel/login', { slug: 'gassuso', password: 'clave-de-prueba' })).status, 200);
  assert.equal((await caja('POST', '/api/panel/pin', { pin: '4826' })).status, 200);
  assert.equal((await caja('POST', url(a), { resultado: 'devuelto' })).status, 403);
  await esperar(2300);
  assert.equal((await dueno('POST', url(a), { resultado: 'quizas' })).status, 400);
  const ped = (await dueno('GET', `/api/panel/pedidos/${a.p.id}`)).body;
  assert.equal(ped.pago_online.manual, true);
  const r = await dueno('POST', url(a), { resultado: 'devuelto' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.estado, 'devuelto');
  assert.equal(r.body.pedido.pagado, 0);
  const ev = A.leerDb("SELECT detalle FROM pago_eventos WHERE referencia=? AND tipo='devolucion_manual'", a.ref);
  assert.equal(ev.length, 1);
  assert.match(ev[0].detalle, /devuelta por /);
  assert.equal((await dueno('POST', url(a), { resultado: 'devuelto' })).status, 409); // ya cerrada
  // Otra devolución trabada se declara "no devuelta": el pago sigue vigente.
  const b = await mk();
  await esperar(2300);
  assert.equal((await dueno('POST', url(b), { resultado: 'pagado' })).body.estado, 'pagado');
  assert.equal((await dueno('GET', `/api/panel/pedidos/${b.p.id}`)).body.pagado, 1);
});

test('contracargo sobre un pago que aún no estaba cobrado también queda como evento', async () => {
  const { pub, dueno } = await preparar(A);
  await usar(dueno, 'mercadopago');
  const p = await nuevoPedido(pub), ref = await pagar(pub, p), id = pagoMP(A, ref, p.total, { status: 'charged_back' });
  assert.equal((await hookMP(pub, ref, id)).status, 200);
  assert.equal(intento(A, ref).estado, 'creado');
  assert.equal(eventos(A, ref, 'contracargo'), 1);
});

test('devolución con 4xx al crear mientras ya hay una en proceso: queda en curso, no vuelve a pagado y un clic no crea otra', async () => {
  const { pub, dueno } = await preparar(A);
  await usar(dueno, 'mercadopago');
  const p = await nuevoPedido(pub), ref = await pagar(pub, p), id = pagoMP(A, ref, p.total);
  assert.equal((await hookMP(pub, ref, id)).status, 200);
  const url = `/api/panel/pedidos/${p.id}/devolver-pago`, propias = () => A.pas.mpDev.filter((d) => d.payment_id === Number(id));
  const enProceso = { id: 7900 + A.pas.mpDev.length, payment_id: Number(id), amount: p.total, status: 'in_process' };
  A.pas.mpDev.push(enProceso); // una devolución ya iniciada (p. ej. desde el panel de Mercado Pago), todavía sin aprobar
  A.pas.mpRechaza400 = true;
  const r = await dueno('POST', url, { confirmar_monto: p.total });
  A.pas.mpRechaza400 = false;
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.estado, 'devolucion_pendiente');
  assert.equal(r.body.incierta, true);
  assert.equal(intento(A, ref).estado, 'devolucion_pendiente'); // no volvió a pagado
  assert.equal(eventos(A, ref, 'devolucion_incierta'), 1);
  // Un nuevo clic solo consulta: no hay otra devolución.
  assert.equal((await dueno('POST', url, { confirmar_monto: p.total })).body.estado, 'devolucion_pendiente');
  assert.equal(propias().length, 1);
  enProceso.status = 'approved';
  assert.equal((await dueno('POST', url, { confirmar_monto: p.total })).body.estado, 'devuelto');
  assert.equal(propias().length, 1);
});

test('contracargo sobre un intento no pagado deja constancia en el detalle y no cambia estados', async () => {
  const { pub, dueno } = await preparar(A);
  await usar(dueno, 'mercadopago');
  const p = await nuevoPedido(pub), ref = await pagar(pub, p), id = pagoMP(A, ref, p.total, { status: 'charged_back' });
  assert.equal((await hookMP(pub, ref, id)).status, 200);
  const [e] = A.leerDb("SELECT detalle FROM pago_eventos WHERE referencia=? AND tipo='contracargo'", ref);
  assert.match(e.detalle, /informó un cobro disputado.*creado/);
  assert.equal(intento(A, ref).estado, 'creado');
  assert.equal((await pub('GET', `/api/seguimiento/${p.token}`)).body.pagado, false);
});

test('devolución con 4xx y un pago sin el campo refunds: no se puede asegurar que no exista, queda en curso', async () => {
  const { pub, dueno } = await preparar(A);
  await usar(dueno, 'mercadopago');
  const p = await nuevoPedido(pub), ref = await pagar(pub, p), id = pagoMP(A, ref, p.total);
  assert.equal((await hookMP(pub, ref, id)).status, 200);
  A.pas.mpPagos.get(id).refunds = undefined; // la respuesta del pago no trae el campo
  A.pas.mpRechaza400 = true;
  const r = await dueno('POST', `/api/panel/pedidos/${p.id}/devolver-pago`, { confirmar_monto: p.total });
  A.pas.mpRechaza400 = false;
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.estado, 'devolucion_pendiente');
  assert.equal(r.body.incierta, true);
  assert.equal(intento(A, ref).estado, 'devolucion_pendiente');
});
