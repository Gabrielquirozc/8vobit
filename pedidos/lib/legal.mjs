// Textos legales como plantilla fija de 8vobit: Términos y Privacidad que la carta muestra al
// cliente final, y el Contrato de servicio + Anexo A (encargo de tratamiento) que acepta el dueño.
// Solo cambian los datos del local; el contenido jurídico vive en lib/plantillas/*.html con
// marcadores {{campo}} (con escape), {{{campo}}} (HTML armado aquí mismo), {{#x}}…{{/x}} y
// {{^x}}…{{/x}} (bloques según x) y {{>ficha}} (pieza común).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { LEGAL_VERSION, LEGAL_VIGENCIA } from '../public/legal-version.js';

// Versión del Contrato de servicio + Anexo A. Cambiarla cada vez que cambie contrato.html:
// los dueños que aceptaron una versión anterior ven el aviso para aceptar de nuevo.
export const CONTRATO_VERSION = '2026-10-20';
export { LEGAL_VERSION, LEGAL_VIGENCIA };

const DIR = path.resolve(import.meta.dirname, 'plantillas');
const leer = (f) => fs.readFileSync(path.join(DIR, f), 'utf8').replace(/\r\n?/g, '\n');
const PLANTILLAS = { contrato: leer('contrato.html'), terminos: leer('terminos.html'), privacidad: leer('privacidad.html') };
const PIEZAS = { ficha: leer('ficha.html') };

// Datos del local que la plantilla necesita. `publico`: puede salir en la carta (Términos y Privacidad);
// el representante legal y su RUT solo van en el contrato.
export const CAMPOS = [
  { id: 'razon_social', nombre: 'Razón social', max: 100, publico: true },
  { id: 'rut', nombre: 'RUT de la empresa', tipo: 'rut', publico: true },
  { id: 'giro', nombre: 'Giro', max: 120, publico: true },
  { id: 'domicilio', nombre: 'Domicilio legal', max: 120, publico: true },
  { id: 'comuna', nombre: 'Comuna', max: 60, publico: true },
  { id: 'representante', nombre: 'Representante legal', max: 100 },
  { id: 'representante_rut', nombre: 'RUT del representante legal', tipo: 'rut' },
  { id: 'correo', nombre: 'Correo para privacidad y reclamos', tipo: 'correo', publico: true },
  { id: 'telefono', nombre: 'Teléfono de contacto', tipo: 'tel', publico: true },
];
const PRESTADOR = [['nombre', 'PRESTADOR_NOMBRE'], ['rut', 'PRESTADOR_RUT'], ['correo', 'PRESTADOR_CORREO'], ['domicilio', 'PRESTADOR_DOMICILIO']];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const txt = (v, max) => String(v ?? '').replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// RUT chileno con dígito verificador (módulo 11). Acepta 12.345.678-9, 12345678-9 o 123456789.
export function rutValido(r) {
  const m = String(r ?? '').replace(/[.\s]/g, '').toUpperCase().match(/^(\d{7,8})-?([\dK])$/);
  if (!m) return false;
  let s = 0, k = 2;
  for (const d of [...m[1]].reverse()) { s += Number(d) * k; k = k === 7 ? 2 : k + 1; }
  const dv = 11 - (s % 11);
  return m[2] === (dv === 11 ? '0' : dv === 10 ? 'K' : String(dv));
}
export function rutFormato(r) {
  const s = String(r ?? '').toUpperCase().replace(/[^\dK]/g, '');
  return s.length < 2 ? s : `${s.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${s.slice(-1)}`;
}
export function telefonoNormal(v) {
  let t = String(v ?? '').replace(/\D/g, '');
  if (t.length === 9 && t.startsWith('9')) t = '56' + t;
  return t;
}

// Valida los datos legales que llegan del panel o de /admin. Se aceptan incompletos (el paso queda
// pendiente), pero lo que viene debe ser válido. Devuelve { datos } o { error }.
export function validar(b) {
  const e = b && typeof b === 'object' ? b : {}, datos = {};
  for (const c of CAMPOS) {
    let v = txt(e[c.id], c.max || 80);
    if (!v) continue;
    if (c.tipo === 'rut') { if (!rutValido(v)) return { error: `${c.nombre} inválido: revisa el dígito verificador.`, campo: c.id }; v = rutFormato(v); }
    if (c.tipo === 'correo' && !CORREO.test(v)) return { error: `${c.nombre}: el correo no es válido.`, campo: c.id };
    if (c.tipo === 'tel') { v = telefonoNormal(v); if (v.length < 10 || v.length > 15) return { error: `${c.nombre} inválido. Ej: +56 9 1234 5678`, campo: c.id }; }
    datos[c.id] = v;
  }
  return { datos };
}
export const faltan = (datos) => CAMPOS.filter((c) => !datos?.[c.id]).map((c) => ({ id: c.id, nombre: c.nombre }));
export const completo = (datos) => !faltan(datos).length;
// Lo que puede salir en la carta pública (sin el representante ni su RUT).
export const publicos = (datos) => Object.fromEntries(CAMPOS.filter((c) => c.publico && datos?.[c.id]).map((c) => [c.id, datos[c.id]]));
export function leerDatos(json) { try { const d = JSON.parse(json || 'null'); return d && typeof d === 'object' ? d : {}; } catch { return {}; } }

// Datos de 8vobit (prestador): variables de entorno o lib/plantillas/prestador.json. No son secretos.
export function prestador(env = process.env) {
  let f = {};
  try { f = JSON.parse(fs.readFileSync(path.join(DIR, 'prestador.json'), 'utf8')) || {}; } catch {}
  return Object.fromEntries(PRESTADOR.map(([k, v]) => [k, txt(env[v] || f[k], 120)]));
}

// ---------- render ----------
const ETIQUETA = Object.fromEntries([...CAMPOS.map((c) => [c.id, c.nombre]), ['prestador_nombre', 'nombre del prestador'], ['prestador_rut', 'RUT del prestador'],
  ['prestador_correo', 'correo del prestador'], ['prestador_domicilio', 'domicilio del prestador'], ['contacto', 'datos de contacto'], ['ciudad', 'comuna']]);
const falta = (k) => `<span class="falta">[${esc(ETIQUETA[k] || k)}]</span>`;
// Reemplaza los marcadores. Un dato vacío queda marcado como faltante (el texto dice "Borrador").
export function render(plantilla, datos) {
  let s = String(plantilla).replace(/\{\{>(\w+)\}\}/g, (m, k) => PIEZAS[k] ?? '');
  for (let antes = ''; antes !== s;) {
    antes = s;
    s = s.replace(/\{\{([#^])(\w+)\}\}([\s\S]*?)\{\{\/\2\}\}/, (m, t, k, cuerpo) => (!!datos[k] === (t === '#') ? cuerpo : ''));
  }
  const vacio = (v) => v === undefined || v === null || v === '';
  return s.replace(/\{\{\{(\w+)\}\}\}/g, (m, k) => (vacio(datos[k]) ? falta(k) : String(datos[k])))
    .replace(/\{\{(\w+)\}\}/g, (m, k) => (vacio(datos[k]) ? falta(k) : esc(datos[k])));
}
export const hash = (texto) => crypto.createHash('sha256').update(texto).digest('hex');
const fechaLarga = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} de ${['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][m - 1]} de ${y}`; };
const fmtTel = (t) => (/^569\d{8}$/.test(t) ? `+56 9 ${t.slice(3, 7)} ${t.slice(7)}` : `+${t}`);
const domicilioDe = (g) => [g.domicilio, g.comuna].filter(Boolean).join(', ');

// Términos o Privacidad del local. `local` es la ficha pública de la carta (ya sin los canales que el
// local ocultó). Devuelve el HTML y lo que falta, solo con nombres de campos.
export function documento(doc, local, datos, base = '') {
  const g = datos || {};
  const contactos = [
    local.whatsapp && `WhatsApp <a href="https://wa.me/${esc(local.whatsapp)}">${esc(fmtTel(local.whatsapp))}</a>`,
    local.telefono && `teléfono <a href="tel:+${esc(local.telefono)}">${esc(fmtTel(local.telefono))}</a>`,
    !local.telefono && g.telefono && `teléfono <a href="tel:+${esc(g.telefono)}">${esc(fmtTel(g.telefono))}</a>`,
    g.correo && `correo <a href="mailto:${esc(g.correo)}">${esc(g.correo)}</a>`,
  ].filter(Boolean);
  const html = render(PLANTILLAS[doc], { ...g, rut: g.rut, domicilio: domicilioDe(g), nombre_local: local.nombre, despacho: !!local.despacho?.activo,
    contacto: contactos.join(', '), privacidad_url: `${base}/privacidad?l=${encodeURIComponent(local.slug)}` });
  return { html, version: LEGAL_VERSION, vigencia: LEGAL_VIGENCIA, faltan: CAMPOS.filter((c) => c.publico && !g[c.id]).map((c) => c.nombre) };
}

// Contrato de servicio + Anexo A con los datos del local, del prestador y del plan.
export function contrato({ local, datos, plan, ciclo, fecha, prest = prestador() }) {
  const g = datos || {};
  const html = render(PLANTILLAS.contrato, { ...g, domicilio: domicilioDe(g), ciudad: g.comuna, nombre_local: local.nombre, fecha: fecha ? fechaLarga(fecha) : '',
    plan, ciclo, prueba_dias: '14', version: CONTRATO_VERSION,
    prestador_nombre: prest.nombre, prestador_rut: prest.rut, prestador_correo: prest.correo, prestador_domicilio: prest.domicilio });
  return { html, hash: hash(html), version: CONTRATO_VERSION };
}

// ---------- aceptación en línea (registro) ----------
export function crearLegal(db, { hoy, licencia }) {
  db.exec(`CREATE TABLE IF NOT EXISTS contrato_aceptaciones (
  id INTEGER PRIMARY KEY, local_id INTEGER NOT NULL REFERENCES locales(id), version TEXT NOT NULL,
  fecha TEXT NOT NULL DEFAULT (datetime('now','localtime')), nombre TEXT NOT NULL, rut TEXT NOT NULL,
  ip TEXT, hash TEXT NOT NULL, texto TEXT NOT NULL, usuario_id INTEGER);
CREATE INDEX IF NOT EXISTS contrato_acept_local ON contrato_aceptaciones(local_id, id);`);
  const fila = (lid) => db.prepare('SELECT id, nombre, slug, legal FROM locales WHERE id=?').get(lid);
  const datosDe = (lid) => leerDatos(fila(lid)?.legal);
  const ciclos = { mensual: 'mensual', semestral: 'semestral', anual: 'anual' };

  function texto(lid) {
    const l = fila(lid), e = licencia(lid);
    return contrato({ local: l, datos: leerDatos(l.legal), plan: e?.plan_nombre || '', ciclo: ciclos[e?.ciclo] || e?.ciclo || '', fecha: hoy() });
  }
  // Última aceptación del local (sin el texto: se baja aparte).
  const ultima = (lid) => db.prepare('SELECT id, version, fecha, nombre, rut, hash FROM contrato_aceptaciones WHERE local_id=? ORDER BY id DESC LIMIT 1').get(lid) || null;
  const vigente = (lid) => ultima(lid)?.version === CONTRATO_VERSION;
  function estado(lid) {
    const t = texto(lid), p = prestador(), d = datosDe(lid);
    return { version: CONTRATO_VERSION, html: t.html, hash: t.hash, faltan: faltan(d).map((c) => c.nombre),
      prestador_ok: PRESTADOR.every(([k]) => p[k]), aceptado: ultima(lid), vigente: vigente(lid) };
  }
  // El dueño acepta el texto que vio (mismo hash). Exige datos completos del local y del prestador.
  function aceptar(lid, b, { ip, usuarioId }) {
    const nombre = txt(b?.nombre, 100), rut = txt(b?.rut, 12);
    if (nombre.replace(/[^\p{L}]/gu, '').length < 3) return { error: 'Escribe tu nombre completo.' };
    if (!rutValido(rut)) return { error: 'Tu RUT no es válido: revisa el dígito verificador.' };
    if (!b?.acepto) return { error: 'Marca la casilla para aceptar el contrato.' };
    const f = faltan(datosDe(lid));
    if (f.length) return { error: `Antes de aceptar, completa los datos legales: ${f.map((c) => c.nombre.toLowerCase()).join(', ')}.`, status: 409 };
    const p = prestador();
    if (!PRESTADOR.every(([k]) => p[k])) return { error: 'El contrato todavía no se puede aceptar: faltan los datos de 8vobit. Avísanos por correo.', status: 409 };
    const t = texto(lid);
    if (b.hash !== t.hash) return { error: 'El texto del contrato cambió mientras lo leías. Revísalo de nuevo y vuelve a aceptar.', status: 409 };
    db.prepare('INSERT INTO contrato_aceptaciones (local_id,version,nombre,rut,ip,hash,texto,usuario_id) VALUES (?,?,?,?,?,?,?,?)')
      .run(lid, CONTRATO_VERSION, nombre, rutFormato(rut), String(ip || '').slice(0, 64), t.hash, t.html, usuarioId ?? null);
    return { ok: true, aceptado: ultima(lid) };
  }
  // Texto exacto que se aceptó (la última aceptación, o una en particular).
  function aceptadoTexto(lid, id) {
    return db.prepare(`SELECT id, version, fecha, nombre, rut, ip, hash, texto FROM contrato_aceptaciones WHERE local_id=? ${id ? 'AND id=?' : ''} ORDER BY id DESC LIMIT 1`)
      .get(...(id ? [lid, id] : [lid])) || null;
  }
  const historial = (lid) => db.prepare('SELECT id, version, fecha, nombre, rut, hash FROM contrato_aceptaciones WHERE local_id=? ORDER BY id DESC').all(lid);
  // Resumen para /admin.
  const corto = (lid) => { const u = ultima(lid); return { datos_completos: completo(datosDe(lid)), aceptado: u ? { version: u.version, fecha: u.fecha } : null, vigente: vigente(lid) }; };

  return { datosDe, estado, aceptar, aceptadoTexto, historial, vigente, corto, texto };
}

// Página HTML completa para ver o guardar un texto aceptado (sin scripts).
export function paginaAceptada(a, nombreLocal) {
  return `<!doctype html><html lang="es-CL"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Contrato aceptado · ${esc(nombreLocal)}</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#241c17}
.falta{background:#fff1c2}.reg{background:#f6efe6;border-radius:12px;padding:12px 16px;font-size:.92rem}</style></head><body>
<p class="reg">Aceptado en línea el ${esc(a.fecha)} por ${esc(a.nombre)} (RUT ${esc(a.rut)}), versión ${esc(a.version)}.<br>Huella SHA-256 del texto: <code>${esc(a.hash)}</code></p>
${a.texto}</body></html>`;
}
