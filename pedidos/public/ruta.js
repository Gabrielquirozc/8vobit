// Orden de entrega de una salida de despacho. Sin servicios externos: distancia en línea recta
// por el factor de calles (el mismo de la pestaña Despacho). Con pocos pedidos se prueban todos
// los órdenes posibles; gana el que llega más a tiempo a la franja de cada cliente y, si empatan,
// el más corto. Waze y Google Maps solo se usan para navegar el orden ya calculado.

export function distancia(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// "21:00–21:30" → minutos del fin de la franja (21:30 = 1290). "Lo antes posible" → null.
// Las franjas de madrugada (00:30) cuentan como el día siguiente si el servicio parte de tarde.
export function finFranja(franja, ahora = 0) {
  const m = String(franja || '').match(/(\d{1,2}):(\d{2})\s*$/);
  if (!m) return null;
  let min = Number(m[1]) * 60 + Number(m[2]);
  if (min < ahora - 6 * 60) min += 24 * 60;
  return min;
}

function permutaciones(xs) {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutaciones([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r) => [x, ...r]));
}

// origen: { lat, lng } del local. paradas: [{ id, lat, lng, fin (min) | null }].
// opc: { factor, velocidad (km/h), minEntrega (min por parada), ahora (min del día), vuelta (suma el regreso al local) }.
export function ordenarRuta(origen, paradas, opc = {}) {
  const factor = opc.factor || 1.35, vel = Math.max(5, opc.velocidad || 25), parada = opc.minEntrega ?? 3, ahora = opc.ahora ?? 0;
  const validas = paradas.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const sinUbicacion = paradas.filter((p) => !validas.includes(p));
  const evaluar = (orden) => {
    let t = ahora, km = 0, retraso = 0, pos = origen;
    const pasos = orden.map((p) => {
      const tramo = (distancia(pos, p) / 1000) * factor;
      km += tramo; t += (tramo / vel) * 60;
      const llegada = t;
      if (p.fin != null) retraso += Math.max(0, llegada - p.fin);
      t += parada; pos = p;
      return { ...p, km_tramo: Math.round(tramo * 10) / 10, llegada: Math.round(llegada) };
    });
    // La vuelta vacía al local no atrasa a nadie, pero sí suma km: cambia el desempate.
    if (opc.vuelta && orden.length) km += (distancia(pos, origen) / 1000) * factor;
    return { pasos, km: Math.round(km * 10) / 10, retraso: Math.round(retraso) };
  };
  let candidatos;
  if (validas.length <= 7) candidatos = permutaciones(validas); // 7! = 5040 órdenes: instantáneo
  else {
    // Muchos pedidos: el más cercano primero (rápido y suficiente para una moto).
    const resto = [...validas], orden = []; let pos = origen;
    while (resto.length) { resto.sort((a, b) => distancia(pos, a) - distancia(pos, b)); pos = resto.shift(); orden.push(pos); }
    candidatos = [orden];
  }
  let mejor = null;
  for (const c of candidatos) {
    const r = evaluar(c);
    if (!mejor || r.retraso < mejor.retraso || (r.retraso === mejor.retraso && r.km < mejor.km)) mejor = r;
  }
  return { ...(mejor || { pasos: [], km: 0, retraso: 0 }), sin_ubicacion: sinUbicacion };
}

export const enlaceWaze = (p) => `https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes`;
export function enlaceMaps(origen, pasos) {
  if (!pasos.length) return null;
  const c = (p) => `${p.lat},${p.lng}`, ult = pasos[pasos.length - 1];
  const via = pasos.slice(0, -1).map(c).join('|');
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${c(origen)}&destination=${c(ult)}${via ? `&waypoints=${encodeURIComponent(via)}` : ''}`;
}

// Qué despachos se marcan al abrir "Armar salida": los listos del repartidor que tiene más listos
// (si nada está listo, los que están en cocina). pedidos: [{ id, estado, repartidor_id }].
export function seleccionInicial(pedidos) {
  const listos = pedidos.filter((p) => p.estado === 'listo');
  const base = listos.length ? listos : pedidos;
  const cuenta = new Map();
  for (const p of base) cuenta.set(p.repartidor_id ?? null, (cuenta.get(p.repartidor_id ?? null) || 0) + 1);
  let repartidor = null, max = 0;
  for (const [r, n] of cuenta) if (n > max || (n === max && repartidor === null && r !== null)) { repartidor = r; max = n; }
  return { repartidor, ids: base.filter((p) => (p.repartidor_id ?? null) === repartidor).map((p) => p.id) };
}

// Vehículo con que sale el repartidor: el que tiene asignado; si no, el elegido en el cálculo de
// Despacho; si no, el primero cargado. Sin vehículos: null (el orden supone 25 km/h).
export function vehiculoDe(vehiculos = [], repartidorId = null, vehiculoCalculo = null) {
  return (repartidorId != null && vehiculos.find((v) => v.repartidorId != null && String(v.repartidorId) === String(repartidorId)))
    || vehiculos.find((v) => v.id === vehiculoCalculo) || vehiculos[0] || null;
}
