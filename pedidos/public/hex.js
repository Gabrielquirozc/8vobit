// Zonas de despacho con hexágonos (como Uber), sin dependencias: lo usan el servidor
// (para cobrar) y el navegador (para dibujar y cotizar), así el precio es siempre el mismo.
//
// La grilla se arma en metros alrededor del local (proyección equirectangular: a la escala
// de una comuna el error es despreciable). Hexágonos "pointy-top" en coordenadas axiales
// (q, r); `tam` es el radio del hexágono en metros (centro a vértice).

const M_LAT = 110540;
const mLng = (lat0) => 111320 * Math.cos((lat0 * Math.PI) / 180);
const R3 = Math.sqrt(3);

export const aMetros = (o, lat, lng) => ({ x: (lng - o.lng) * mLng(o.lat), y: (lat - o.lat) * M_LAT });
export const aLatLng = (o, x, y) => ({ lat: o.lat + y / M_LAT, lng: o.lng + x / mLng(o.lat) });
export function distancia(a, b) { const p = aMetros(a, b.lat, b.lng); return Math.hypot(p.x, p.y); }

// Hexágono que contiene el punto (redondeo cúbico estándar).
export function hexDe(o, tam, lat, lng) {
  const { x, y } = aMetros(o, lat, lng);
  const qf = ((R3 / 3) * x - y / 3) / tam, rf = ((2 / 3) * y) / tam, sf = -qf - rf;
  let q = Math.round(qf), r = Math.round(rf); const s = Math.round(sf);
  const dq = Math.abs(q - qf), dr = Math.abs(r - rf), ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s; else if (dr > ds) r = -q - s;
  return { q, r, id: `${q},${r}` };
}
export const centro = (o, tam, q, r) => aLatLng(o, tam * R3 * (q + r / 2), tam * 1.5 * r);
export function vertices(o, tam, q, r) {
  const cx = tam * R3 * (q + r / 2), cy = tam * 1.5 * r;
  return [...Array(6)].map((_, i) => { const a = (Math.PI / 180) * (60 * i - 30); return aLatLng(o, cx + tam * Math.cos(a), cy + tam * Math.sin(a)); });
}

// Precio de un hexágono: el ajuste manual manda (null = bloqueado); si no, el tramo de
// distancia (medida desde el local al centro del hexágono, igual para todo el hexágono).
export function precioHex(desp, o, q, r) {
  const id = `${q},${r}`, c = centro(o, desp.tam, q, r), d = Math.round(distancia(o, c));
  if (desp.ajustes && id in desp.ajustes) {
    const v = desp.ajustes[id];
    return v === null ? { ok: false, motivo: 'bloqueado', id, distancia: d } : { ok: true, costo: v, id, distancia: d, ajustado: true };
  }
  const t = (desp.tramos || []).find((x) => d <= x.hasta);
  return t ? { ok: true, costo: t.costo, id, distancia: d, tramo: t } : { ok: false, motivo: 'lejos', id, distancia: d };
}
// Cotiza un punto (ubicación del cliente).
export function cotizar(desp, o, lat, lng) {
  const h = hexDe(o, desp.tam, lat, lng);
  return { ...precioHex(desp, o, h.q, h.r), distancia: Math.round(distancia(o, { lat, lng })) };
}
// Hexágonos a dibujar: los que caen dentro del tramo más lejano (más un anillo de borde,
// para poder habilitar a mano un sector un poco más allá) y los ajustados a mano.
export function hexesZona(desp, o, extra = 1) {
  const max = Math.max(0, ...(desp.tramos || []).map((t) => t.hasta));
  const n = Math.ceil(max / (desp.tam * R3)) + extra, out = new Map();
  for (let q = -n; q <= n; q++) for (let r = Math.max(-n, -q - n); r <= Math.min(n, -q + n); r++) {
    const p = precioHex(desp, o, q, r);
    if (p.ok || p.distancia <= max + desp.tam * R3 * extra) out.set(p.id, { q, r, ...p });
  }
  for (const id of Object.keys(desp.ajustes || {})) if (!out.has(id)) { const [q, r] = id.split(',').map(Number); out.set(id, { q, r, ...precioHex(desp, o, q, r) }); }
  return [...out.values()];
}
