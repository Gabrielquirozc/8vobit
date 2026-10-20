// Utilidades compartidas por las páginas. BASE se deduce de la URL para que
// funcione igual en la raíz o bajo un prefijo (BASE_PATH).
export const BASE = location.pathname.replace(/\/(panel|comanda|carta-imprimible|seguimiento|[a-z0-9-]+)$/, '').replace(/\/$/, '');
// 56984506842 → "+56 9 8450 6842" (celular chileno); otros números quedan con + y sin formato.
export const fmtTel = (t) => { const d = String(t || '').replace(/\D/g, ''); return /^569\d{8}$/.test(d) ? `+56 9 ${d.slice(3, 7)} ${d.slice(7)}` : d ? '+' + d : ''; };
export const clp = (n) => '$' + Math.round(n).toLocaleString('es-CL');
export async function api(path, opts = {}) {
  const r = await fetch(`${BASE}/api/${path}`, {
    ...opts,
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || `Error ${r.status}`), { status: r.status, data });
  return data;
}
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Botones de imprimir sin onclick en línea (la CSP no permite manejadores en línea).
document.addEventListener('click', (e) => { if (e.target.closest('[data-print]')) print(); });

// Emoji para productos sin foto, según lo que es. El orden importa: lo más
// específico primero (un "batido de frutilla" es frutilla, no batido genérico).
const EMOJIS = [
  [/frutilla/, '🍓'], [/pi[nñ]a/, '🍍'], [/ar[aá]ndano/, '🫐'], [/pl[aá]tano/, '🍌'],
  [/jugo/, '🧃'], [/batido|leche/, '🥛'], [/bebida|lata|gaseosa/, '🥤'], [/caf[eé]/, '☕'],
  [/salchipapa/, '🍟'], [/papa/, '🍟'], [/bowl|ensalada/, '🥗'],
  [/burger|hamburguesa/, '🍔'], [/vega|vegetarian|vegano/, '🌱'],
  [/hot ?dog|completo|italiano|alem[aá]n|din[aá]mico|campesino|coleslow|champipleto|champiluco|luco$|palta queso|queso champi|as mechada|as gassuso/, '🌭'],
  [/pobre|churrasco|vacuno|barros|chacarero|diplom|patr[oó]n/, '🥩'],
  [/pollo/, '🍗'], [/cerdo/, '🥓'], [/mechada/, '🥩'], [/huevo/, '🍳'],
];
const POR_CATEGORIA = [[/hot|complet|vegaplet/, '🌭'], [/sang|sand/, '🥪'], [/papa/, '🍟'], [/bebid|jugo/, '🥤'], [/bowl/, '🥗']];
export function emojiDe(nombre, categoria = '') {
  const n = String(nombre).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const c = String(categoria).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (/vegaplet/.test(c)) return '🌭';
  return (EMOJIS.find(([r]) => r.test(n)) || POR_CATEGORIA.find(([r]) => r.test(c)) || [, '🍽️'])[1];
}
