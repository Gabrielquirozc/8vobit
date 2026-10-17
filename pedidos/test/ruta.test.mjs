import test from 'node:test';
import assert from 'node:assert/strict';
import { ordenarRuta, finFranja, enlaceWaze, enlaceMaps, distancia } from '../public/ruta.js';

const local = { lat: -36.8270, lng: -73.0503 };
// Tres puntos hacia el norte, a distintas distancias del local.
const cerca = { id: 1, lat: -36.8200, lng: -73.0503 }, medio = { id: 2, lat: -36.8100, lng: -73.0503 }, lejos = { id: 3, lat: -36.8000, lng: -73.0503 };

test('finFranja: lee el fin de la franja y pasa la madrugada al día siguiente', () => {
  assert.equal(finFranja('21:00–21:30'), 21 * 60 + 30);
  assert.equal(finFranja('Lo antes posible'), null);
  assert.equal(finFranja('00:00–00:30', 23 * 60), 24 * 60 + 30);
});

test('ordenarRuta: sin apuro va del más cercano al más lejano', () => {
  const r = ordenarRuta(local, [lejos, cerca, medio].map((p) => ({ ...p, fin: null })), { factor: 1, velocidad: 30, ahora: 20 * 60 });
  assert.deepEqual(r.pasos.map((p) => p.id), [1, 2, 3]);
  assert.equal(r.retraso, 0);
  assert.ok(Math.abs(r.km - distancia(local, lejos) / 1000) < 0.2);
});

test('ordenarRuta: la franja más temprana va primero aunque quede más lejos', () => {
  const ahora = 20 * 60;
  const r = ordenarRuta(local, [{ ...cerca, fin: ahora + 60 }, { ...medio, fin: ahora + 60 }, { ...lejos, fin: ahora + 6 }], { factor: 1.35, velocidad: 30, minEntrega: 3, ahora });
  assert.equal(r.pasos[0].id, 3);
});

test('ordenarRuta: deja aparte los pedidos sin ubicación', () => {
  const r = ordenarRuta(local, [{ ...cerca, fin: null }, { id: 9, lat: null, lng: null, fin: null }], {});
  assert.deepEqual(r.pasos.map((p) => p.id), [1]);
  assert.deepEqual(r.sin_ubicacion.map((p) => p.id), [9]);
});

test('enlaces: Waze a una parada y Google Maps con las paradas en orden', () => {
  assert.equal(enlaceWaze(cerca), 'https://waze.com/ul?ll=-36.82,-73.0503&navigate=yes');
  const u = enlaceMaps(local, [cerca, medio, lejos]);
  assert.ok(u.includes('destination=-36.8,-73.0503'));
  assert.ok(u.includes(`waypoints=${encodeURIComponent('-36.82,-73.0503|-36.81,-73.0503')}`));
  assert.equal(enlaceMaps(local, []), null);
});
