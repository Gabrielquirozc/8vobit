// Pruebas del cerebro: node --test infra/n8n/bot/
const test = require('node:test');
const assert = require('node:assert');
const { decidir } = require('./cerebro.js');

const links = { agenda: 'https://agenda.test', web: 'https://web.test', pedidos: 'https://pedidos.test' };
const tarde = Date.parse('2026-10-15T18:00:00Z');   // 15:00 en Chile
const noche = Date.parse('2026-10-16T03:00:00Z');   // 00:00 en Chile
const H = 3600 * 1000;

test('saludo de alguien nuevo: bienvenida; el segundo saludo no se responde', () => {
  const a = decidir('Holaa', null, tarde, links);
  assert.match(a.respuesta, /hola/i);
  const b = decidir('hola?', a.contacto, tarde + 60e3, links);
  assert.strictEqual(b.respuesta, null);
});

test('precio de formateo con un contacto nuevo: precio y link de agenda', () => {
  const r = decidir('Hola, cuánto sale formatear un notebook?', null, tarde, links);
  assert.strictEqual(r.intencion, 'formateo');
  assert.match(r.respuesta, /\$15\.000/);
  assert.match(r.respuesta, /agenda\.test/);
});

test('llegada: respuesta y aviso urgente', () => {
  const r = decidir('Llegué, estoy abajo', { visto: tarde - H }, tarde, links);
  assert.strictEqual(r.intencion, 'llegada');
  assert.strictEqual(r.aviso, 'urgente');
  assert.match(r.respuesta, /baj/i);
});

test('si Gabriel está conversando, el bot se calla pero avisa', () => {
  const r = decidir('llegué', { visto: tarde - H, gabriel: tarde - 2 * H }, tarde, links);
  assert.strictEqual(r.respuesta, null);
  assert.strictEqual(r.aviso, 'urgente');
});

test('de noche: avisa que responde mañana, una sola vez', () => {
  const a = decidir('hola', null, noche, links);
  assert.match(a.respuesta, /mañana/);
  const b = decidir('alguien?', a.contacto, noche + 10 * 60e3, links);
  assert.strictEqual(b.respuesta, null);
});

test('de noche no promete bajar al lobby', () => {
  const r = decidir('estoy afuera', { visto: noche - H }, noche, links);
  assert.strictEqual(r.respuesta === null || !/baj/i.test(r.respuesta), true);
  assert.strictEqual(r.aviso, 'urgente');
});

test('spam: no responde ni avisa', () => {
  const r = decidir('Watch my private video https://x.app.link/abc', null, tarde, links);
  assert.strictEqual(r.respuesta, null);
  assert.strictEqual(r.aviso, null);
});

test('conversación en curso: las consultas las sigue Gabriel', () => {
  const r = decidir('y cuánto sería el arreglo?', { visto: tarde - 3 * H }, tarde, links);
  assert.strictEqual(r.respuesta, null);
});

test('"ya agendé" no se responde', () => {
  const r = decidir('Agendé para el lunes a las 10', null, tarde, links);
  assert.strictEqual(r.respuesta, null);
});

test('no repite la misma respuesta en 24 h', () => {
  const a = decidir('dónde están ubicados?', null, tarde, links);
  assert.ok(a.respuesta);
  const b = decidir('cuál es la dirección?', a.contacto, tarde + 3 * H, links);
  assert.strictEqual(b.respuesta, null);
});

test('teclado: dice que no se hace', () => {
  const r = decidir('cuánto sale cambiar el teclado de mi note', null, tarde, links);
  assert.match(r.respuesta, /no estamos haciendo/);
});

test('DEMO inicia el flujo web directo en pedidos', () => {
  const r = decidir('DEMO', null, tarde, links);
  assert.strictEqual(r.intencion, 'web_inicio');
  assert.match(r.respuesta, /a qué se dedica/i);
  assert.strictEqual(r.contacto.web.eleccion, 'PEDIDOS');
});

test('flujo web completo con botones: pedidos, caliente → Gassuso, reunión y aviso urgente', () => {
  let r = decidir('quiero una pagina web', null, tarde, links);
  // "pagina web" ya dice qué quiere: salta a la pregunta del negocio
  assert.strictEqual(r.contacto.web.eleccion, 'PAGINA');
  r = decidir('', null, tarde, links, 'MENU_WEB');
  assert.strictEqual(r.botones.length, 4);
  r = decidir('Pedidos para mi local', r.contacto, tarde + 60e3, links, 'W_PEDIDOS');
  assert.match(r.respuesta, /a qué se dedica/i);
  r = decidir('Sushi en Lomas', r.contacto, tarde + 120e3, links);
  assert.strictEqual(r.botones.length, 3);
  r = decidir('Por apps de delivery', r.contacto, tarde + 180e3, links, 'H_APPS');
  assert.strictEqual(r.botones.length, 3);
  r = decidir('Este mes', r.contacto, tarde + 240e3, links, 'C_MES');
  assert.strictEqual(r.intencion, 'web_cierre');
  assert.match(r.respuesta, /gassuso/);
  assert.match(r.respuesta, /#reunion/);
  assert.strictEqual(r.aviso, 'urgente');
  assert.match(r.resumen, /Sushi en Lomas/);
  assert.strictEqual(r.contacto.web, null);
});

test('flujo web: solo mirando no es urgente', () => {
  let r = decidir('', null, tarde, links, 'MENU_WEB');
  r = decidir('agenda', r.contacto, tarde + 1e3, links);
  r = decidir('psicóloga', r.contacto, tarde + 2e3, links);
  r = decidir('por whatsapp', r.contacto, tarde + 3e3, links);
  r = decidir('solo estoy mirando', r.contacto, tarde + 4e3, links);
  assert.strictEqual(r.aviso, 'normal');
  assert.match(r.respuesta, /#agendar/);
});

test('flujo web: "hablar" pasa a Gabriel en cualquier paso', () => {
  let r = decidir('', null, tarde, links, 'MENU_WEB');
  r = decidir('prefiero hablar con alguien', r.contacto, tarde + 1e3, links);
  assert.strictEqual(r.intencion, 'web_humano');
  assert.strictEqual(r.aviso, 'urgente');
});

test('bienvenida ofrece el menú Reparación / Desarrollo web', () => {
  const r = decidir('hola', null, tarde, links);
  assert.deepStrictEqual(r.botones.map(b => b.payload), ['MENU_REP', 'MENU_WEB']);
});

test('si Gabriel está conversando, el flujo web no arranca', () => {
  const r = decidir('DEMO', { visto: tarde - 3 * H, gabriel: tarde - H }, tarde, links);
  assert.strictEqual(r.respuesta, null);
});
