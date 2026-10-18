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

test('palabra DEMO de los carruseles sigue funcionando', () => {
  const r = decidir('DEMO', null, tarde, links);
  assert.match(r.respuesta, /pedidos\.test/);
});
