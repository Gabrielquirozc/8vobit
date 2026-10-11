// Utilidades compartidas por las páginas. BASE se deduce de la URL para que
// funcione igual en la raíz o bajo un prefijo (BASE_PATH).
export const BASE = location.pathname.replace(/\/(panel|comanda|carta-imprimible|[a-z0-9-]+)$/, '').replace(/\/$/, '');
export const clp = (n) => '$' + Math.round(n).toLocaleString('es-CL');
export async function api(path, opts = {}) {
  const r = await fetch(`${BASE}/api/${path}`, {
    ...opts,
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || `Error ${r.status}`), { status: r.status });
  return data;
}
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
