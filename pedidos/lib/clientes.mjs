// Clientes del canal propio (plan Gestión): quién compra, cuánto y cada cuánto, a partir de los
// pedidos web (el celular identifica al cliente; los pedidos anonimizados ya no aparecen).
// Solo en el panel: nunca se muestra fuera ni se usa para otra cosa que atender al cliente.

const tel9 = (t) => String(t || '').replace(/\D/g, '').slice(-9);
const CLAVE = "substr(replace(replace(replace(telefono,'+',''),' ',''),'-',''), -9)";

export function crearClientes(db) {
  function lista(lid, { q = '', hoy }) {
    const filas = db.prepare(`SELECT ${CLAVE} t, COUNT(*) n, SUM(total) total, MIN(dia) primero, MAX(dia) ultimo, MAX(id) ult_id
      FROM pedidos WHERE local_id=? AND canal='web' AND estado!='anulado' AND telefono!='' GROUP BY t ORDER BY ultimo DESC, n DESC LIMIT 500`).all(lid);
    const nombre = db.prepare('SELECT cliente, telefono FROM pedidos WHERE id=?');
    const dias = (d) => Math.round((new Date(`${hoy}T12:00:00`) - new Date(`${d}T12:00:00`)) / 864e5);
    const nq = String(q).trim().toLowerCase(), dq = nq.replace(/\D/g, '');
    const clientes = filas.map((r) => { const u = nombre.get(r.ult_id); return { clave: r.t, nombre: u.cliente, telefono: u.telefono, pedidos: r.n, total: r.total,
      promedio: Math.round(r.total / r.n), primero: r.primero, ultimo: r.ultimo, dias: dias(r.ultimo),
      tipo: r.n === 1 ? (dias(r.primero) <= 30 ? 'nuevo' : 'una_vez') : dias(r.ultimo) > 45 ? 'dormido' : 'frecuente' }; })
      .filter((c) => !nq || c.nombre.toLowerCase().includes(nq) || (dq.length >= 3 && c.clave.includes(dq)));
    const tot = (f) => clientes.filter(f).length;
    return { clientes: clientes.slice(0, 200), total: clientes.length,
      grupos: { frecuente: tot((c) => c.tipo === 'frecuente'), nuevo: tot((c) => c.tipo === 'nuevo'), dormido: tot((c) => c.tipo === 'dormido'), una_vez: tot((c) => c.tipo === 'una_vez') },
      vuelven: clientes.length ? Math.round((tot((c) => c.pedidos > 1) / clientes.length) * 100) : 0 };
  }
  function detalle(lid, clave) {
    const t = tel9(clave);
    if (t.length < 8) return { error: 'Cliente inválido', status: 400 };
    const pedidos = db.prepare(`SELECT id, numero, dia, total, estado, modalidad, descuento, promo_nombre FROM pedidos WHERE local_id=? AND canal='web' AND ${CLAVE}=? ORDER BY id DESC LIMIT 30`).all(lid, t);
    if (!pedidos.length) return { error: 'No existe', status: 404 };
    const productos = db.prepare(`SELECT i.nombre, SUM(i.cantidad) n FROM pedido_items i JOIN pedidos p ON p.id=i.pedido_id
      WHERE p.local_id=? AND p.canal='web' AND p.estado!='anulado' AND ${CLAVE.replace(/telefono/g, 'p.telefono')}=? GROUP BY i.nombre ORDER BY n DESC LIMIT 5`).all(lid, t);
    return { clave: t, pedidos, productos };
  }
  return { lista, detalle };
}
