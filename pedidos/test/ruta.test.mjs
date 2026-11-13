import test from 'node:test';
import assert from 'node:assert/strict';
import { ordenarRuta, finFranja, enlaceWaze, enlaceMaps, distancia, seleccionInicial, vehiculoDe } from '../public/ruta.js';

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

test('ordenarRuta: tres despachos reales, el atrasado primero y luego el más corto', () => {
  // Local en el centro; A al norte con franja que vence pronto, B y C al sur sin apuro.
  const ahora = 21 * 60;
  const A = { id: 'A', lat: -36.815, lng: -73.050, fin: ahora + 8 };
  const B = { id: 'B', lat: -36.835, lng: -73.050, fin: ahora + 60 };
  const C = { id: 'C', lat: -36.845, lng: -73.050, fin: ahora + 60 };
  const r = ordenarRuta(local, [C, B, A], { factor: 1.35, velocidad: 25, minEntrega: 5, ahora });
  assert.deepEqual(r.pasos.map((p) => p.id), ['A', 'B', 'C']);
  assert.equal(r.retraso, 0);
  // La hora de llegada crece parada a parada.
  assert.ok(r.pasos[0].llegada < r.pasos[1].llegada && r.pasos[1].llegada < r.pasos[2].llegada);
});

test('ordenarRuta: contar la vuelta suma el regreso al local', () => {
  // Ida y vuelta en línea recta hacia el norte: con la vuelta, el doble de km.
  const sin = ordenarRuta(local, [cerca, lejos].map((p) => ({ ...p, fin: null })), { factor: 1 });
  const con = ordenarRuta(local, [cerca, lejos].map((p) => ({ ...p, fin: null })), { factor: 1, vuelta: true });
  assert.ok(Math.abs(con.km - 2 * sin.km) < 0.2);
});

test('seleccionInicial: marca los listos del repartidor que tiene más', () => {
  const ps = [
    { id: 1, estado: 'listo', repartidor_id: 'r1' }, { id: 2, estado: 'listo', repartidor_id: 'r2' },
    { id: 3, estado: 'listo', repartidor_id: 'r1' }, { id: 4, estado: 'preparacion', repartidor_id: 'r1' },
  ];
  assert.deepEqual(seleccionInicial(ps), { repartidor: 'r1', ids: [1, 3] });
  // Nada listo: los que están en cocina. Sin repartidores: todos.
  assert.deepEqual(seleccionInicial([{ id: 5, estado: 'preparacion' }, { id: 6, estado: 'preparacion' }]), { repartidor: null, ids: [5, 6] });
  // Empate entre sin asignar y un repartidor: gana el repartidor.
  assert.equal(seleccionInicial([{ id: 7, estado: 'listo' }, { id: 8, estado: 'listo', repartidor_id: 'r3' }]).repartidor, 'r3');
});

test('vehiculoDe: el del repartidor, luego el del cálculo, luego el primero', () => {
  const vs = [{ id: 'v1', velocidad: 25 }, { id: 'v2', velocidad: 14, repartidorId: 'r9' }, { id: 'v3', velocidad: 22 }];
  assert.equal(vehiculoDe(vs, 'r9', 'v3').id, 'v2');
  assert.equal(vehiculoDe(vs, 'r1', 'v3').id, 'v3');
  assert.equal(vehiculoDe(vs, null, null).id, 'v1');
  assert.equal(vehiculoDe([], 'r9'), null);
});
