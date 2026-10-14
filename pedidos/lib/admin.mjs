// Consola de administración (solo nosotros): locales, licencias, pagos y números del negocio.
// Entra con ADMIN_PASSWORD (variable de entorno); sin ella, la consola no existe.
import { PLANES, CICLOS, precioPeriodo, sumarDias } from './licencias.mjs';
import { claveNueva } from './usuarios.mjs';

const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
const RESERVADOS = new Set(['panel', 'admin', 'api', 'img', 'salud', 'comanda', 'carta-imprimible', 'cartel', 'seguimiento', 'terminos', 'privacidad', 'robots', 'demo-vacia']);
const texto = (v, max) => String(v ?? '').replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max) || null;
const HORARIO_BASE = Object.fromEntries([...'0123456'].map((d) => [d, ['12:00', '22:00']]));

export function crearAdmin(db, { LIC, USU, crearLocal, hoy }) {
  const mesDe = (dia, n = 0) => { const [y, m] = dia.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

  function resumen() {
    const h = hoy(), desde30 = sumarDias(h, -30), mes = h.slice(0, 7), mesAnt = mesDe(h, -1);
    const locales = db.prepare('SELECT id, slug, nombre FROM locales ORDER BY id').all().map((l) => {
      const e = LIC.estado(l.id), f = LIC.fila(l.id);
      const p = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(total),0) s, SUM(canal='web') web, MAX(dia) ult FROM pedidos WHERE local_id=? AND estado!='anulado' AND dia>=?").get(l.id, desde30);
      // Ingreso mensual equivalente (MRR): lo que paga por mes según su ciclo y descuento vigente.
      const mrr = e && ['activa', 'gracia'].includes(e.estado) ? Math.round(e.precio / CICLOS[e.ciclo].meses) : 0;
      return { ...l, estado: e?.estado, plan: e?.plan, plan_nombre: e?.plan_nombre, ciclo: e?.ciclo, hasta: e?.hasta, dias: e?.dias, vence: f?.vence, mrr,
        descuento: e?.descuento, pedidos30: p.n, ventas30: p.s, web30: p.web || 0, ultimo_pedido: p.ult, usuarios: USU.activos(l.id),
        tarifa_mes: LIC.tarifaMes(l.id, mes).monto, tarifa_mes_anterior: LIC.tarifaMes(l.id, mesAnt).monto };
    });
    const cuenta = (k, v) => locales.filter((l) => l[k] === v).length;
    return {
      hoy: h, mes, mes_anterior: mesAnt, locales,
      totales: {
        mrr: locales.reduce((s, l) => s + l.mrr, 0),
        tarifa_mes: locales.reduce((s, l) => s + l.tarifa_mes, 0),
        tarifa_mes_anterior: locales.reduce((s, l) => s + l.tarifa_mes_anterior, 0),
        por_estado: Object.fromEntries(['prueba', 'activa', 'gracia', 'suspendida', 'cancelada'].map((k) => [k, cuenta('estado', k)])),
        por_plan: Object.fromEntries(Object.keys(PLANES).map((k) => [k, locales.filter((l) => l.plan === k && !['cancelada'].includes(l.estado)).length])),
        cobrado_mes: db.prepare("SELECT COALESCE(SUM(monto+tarifa),0) s FROM licencia_pagos WHERE anulado=0 AND substr(fecha,1,7)=?").get(mes).s,
      },
    };
  }

  function detalle(id) {
    const l = db.prepare('SELECT id, slug, nombre, whatsapp, direccion FROM locales WHERE id=?').get(id);
    if (!l) return null;
    const h = hoy();
    return { local: l, licencia: LIC.fila(id), estado: LIC.estado(id), pagos: LIC.pagos(id), eventos: LIC.eventos(id),
      tarifas: [0, -1, -2].map((n) => LIC.tarifaMes(id, mesDe(h, n))),
      precios: Object.fromEntries(Object.keys(PLANES).map((p) => [p, Object.fromEntries(Object.keys(CICLOS).map((c) => [c, precioPeriodo(p, c)]))])) };
  }

  // Alta de un local: carta vacía (una categoría) o importada desde un JSON con el formato del seed.
  function alta(b) {
    const slug = String(b.slug || '').trim().toLowerCase();
    if (!SLUG.test(slug) || RESERVADOS.has(slug)) return { error: 'Código inválido: 3 a 40 letras minúsculas, números o guiones (será la dirección de la carta).' };
    if (db.prepare('SELECT 1 FROM locales WHERE slug=?').get(slug)) return { error: 'Ya existe un local con ese código.' };
    const nombre = texto(b.nombre, 80);
    if (!nombre) return { error: 'Escribe el nombre del local.' };
    if (!PLANES[b.plan || 'gestion']) return { error: 'Plan inválido' };
    const dias = b.prueba_dias === undefined || b.prueba_dias === '' ? 14 : Number(b.prueba_dias);
    if (!Number.isInteger(dias) || dias < 0 || dias > 365) return { error: 'Días de prueba inválidos (0 a 365).' };
    let carta = { agregados: [], salsas: [], categorias: [{ nombre: 'Carta', productos: [] }] };
    if (b.carta) {
      try { carta = typeof b.carta === 'string' ? JSON.parse(b.carta) : b.carta; } catch { return { error: 'El JSON de la carta no es válido.' }; }
      if (!Array.isArray(carta.categorias) || carta.categorias.some((c) => !texto(c.nombre, 60) || !Array.isArray(c.productos) || c.productos.some((p) => !texto(p.nombre, 80) || !(Number(p.precio || 0) >= 0))))
        return { error: 'La carta debe traer categorías con nombre y productos con nombre y precio.' };
    }
    const local = { slug, nombre, instagram: texto(b.instagram, 40), whatsapp: String(b.whatsapp || '').replace(/\D/g, '').slice(0, 15) || null,
      telefono: null, direccion: texto(b.direccion, 120), horario: HORARIO_BASE, cupo_franja: 10, modo_boleta: 2 };
    const clave = claveNueva();
    db.exec('BEGIN');
    try {
      const lid = crearLocal({ ...carta, local });
      USU.ponerClave(lid, clave);
      LIC.crear(lid, { plan: b.plan || 'gestion', pruebaDias: dias, notas: texto(b.notas, 500) });
      db.exec('COMMIT');
      return { id: lid, slug, clave };
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }

  function nuevaClave(id) {
    if (!db.prepare('SELECT 1 FROM locales WHERE id=?').get(id)) return { error: 'No existe', status: 404 };
    const clave = claveNueva();
    USU.ponerClave(id, clave);
    db.prepare('INSERT INTO licencia_eventos (local_id,tipo,detalle) VALUES (?,?,?)').run(id, 'clave', '{}');
    return { clave };
  }

  return { resumen, detalle, alta, nuevaClave };
}
