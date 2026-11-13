// Utilidades compartidas por los bancos generados (masivo y chileno): enlaces de prueba, precios aprobados e invariantes.
const assert = require('node:assert');
const { decidir } = require('./cerebro.js');

const MIN = 60e3, H = 3600e3;
const LINKS = { agenda: 'https://8vobit.xyz/#agendar', web: 'https://8vobit.xyz', pedidos: 'https://pedidos.8vobit.xyz' };
const LINKS_CALENDLY = { agenda: 'https://calendly.com/octavobit/diagnostico', web: 'https://8vobit.xyz', pedidos: 'https://pedidos.8vobit.xyz' };
const LINKS_VACIOS = { agenda: '', web: 'https://8vobit.xyz', pedidos: 'https://pedidos.8vobit.xyz' };

// Precios aprobados (marketing/PRECIOS-SERVICIO-TECNICO.md): lista FIJA escrita a mano. Si un precio cambia
// a proposito, se actualiza aqui y en cerebro.js a la vez; un precio inventado en un texto hace fallar el banco.
const PRECIOS_APROBADOS = ['$5.000', '$10.000', '$15.000', '$20.000', '$25.000', '$30.000', '$35.000', '$45.000', '$50.000'];
const norm = m => m.replace(/[\s.]/g, '');
const PRECIOS = new Set(PRECIOS_APROBADOS.map(norm));

function urls(t) { return Array.from(new Set((t.match(/https?:\/\/[^\s)]+/g) || []).map(u => u.replace(/[.,;]+$/, '')))); }
function llamar(f, contacto, ahora, links) {
  return decidir(f.texto, contacto, ahora, links || LINKS, f.payload || '', f.adjunto || '');
}

// Invariantes sobre UNA respuesta (aplican a cualquier hora y estado).
function invariantesRespuesta(r, f, ctx) {
  assert.ok(r && typeof r === 'object' && typeof r.intencion === 'string', 'devuelve un objeto con intencion');
  assert.ok(r.contacto && typeof r.contacto === 'object', 'devuelve el contacto');
  if (r.respuesta == null) return;
  const t = r.respuesta;
  assert.strictEqual(typeof t, 'string');
  assert.ok(t.trim().length > 0, 'respuesta no vacia');
  assert.ok(t.length <= 700, 'longitud ' + t.length + ' > 700');
  assert.doesNotMatch(t, /calendly/i, 'nunca Calendly');
  assert.doesNotMatch(t, /\{\{|undefined|\bnull\b|\[object/i, 'sin placeholders sueltos');
  assert.ok(urls(t).length <= 1, 'maximo un enlace distinto por mensaje: ' + urls(t).join(' '));
  if (/santiago/i.test(t)) assert.doesNotMatch(t, /pantalla/i, 'Santiago junto a pantalla');
  // Sin modo fuera, ningun texto promete respuesta "mañana" por la hora del dia ni suena a aviso de horario.
  assert.doesNotMatch(t, /fuera de horario|ma[ñn]ana desde las 9|respuesta autom[aá]tica|mensaje autom[aá]tico|lo veo ma[ñn]ana|te contesta ma[ñn]ana|te respondo con calma ma[ñn]ana/i, 'sin aviso nocturno');
  for (const m of t.match(/\$\s?\d[\d.]*/g) || []) assert.ok(PRECIOS.has(norm(m)), 'precio fuera de la lista: ' + m);
  for (const b of r.botones || []) assert.ok(String(b.titulo).length <= 20, 'boton largo: ' + b.titulo);
}

module.exports = { MIN, H, LINKS, LINKS_CALENDLY, LINKS_VACIOS, PRECIOS_APROBADOS, PRECIOS, norm, urls, llamar, invariantesRespuesta };
