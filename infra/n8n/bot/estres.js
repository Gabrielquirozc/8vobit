#!/usr/bin/env node
// Motor de estrés del cerebro (SPEC-004, fase estrés). NO es parte de `node --test`.
//   node infra/n8n/bot/estres.js --n 1000000 --seed 1 [--reporte archivo.md] [--ejemplos 4]
// Genera mensajes por gramática con etiqueta de verdad y por mutación de semillas, más secuencias de 2-6 turnos con
// reloj y respuestas de Gabriel, los pasa por decidir() y comprueba oráculos. Determinista por semilla, sin dependencias,
// en streaming (solo guarda contadores y los ejemplos mínimos por categoría).
// Principio: ante la duda, derivar a Gabriel (sin_intencion / silencio con aviso). Nunca algo equivocado ni «De nada»
// a quien pide o reporta algo.
const { decidir } = require('./cerebro.js');
const { chileATimestamp } = require('./simulador.js');
const { BASES } = require('./chileno.gen.js');

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const N = Number(arg('--n', 100000));
const SEED = Number(arg('--seed', 1));
const REPORTE = arg('--reporte', '');
const MAXEJ = Number(arg('--ejemplos', 4));
const HISTORICO = args.includes('--historico');
const SEMILLAS_REALES = HISTORICO ? require('./historico.js').mensajesCliente().filter(m => m.texto.length >= 3 && m.texto.length <= 400 && !/https?:|@\w/.test(m.texto)) : [];
if (HISTORICO && !SEMILLAS_REALES.length) { console.error('--historico: no hay corpus real (infra/n8n/chats); se usa solo la gramatica'); }

const MIN = 60e3, H = 3600e3, DIA = 24 * H;
const LINKS = { agenda: 'https://8vobit.xyz/#agendar', web: 'https://8vobit.xyz', pedidos: 'https://pedidos.8vobit.xyz' };
const PRECIOS = new Set(['$5.000', '$10.000', '$15.000', '$20.000', '$25.000', '$30.000', '$35.000', '$45.000', '$50.000'].map(x => x.replace(/[\s.]/g, '')));

// ------------------------------------------------------------------ azar determinista
let st = (SEED >>> 0) || 1;
function rnd() { st |= 0; st = (st + 0x6D2B79F5) | 0; let t = Math.imul(st ^ (st >>> 15), 1 | st); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const pick = a => a[Math.floor(rnd() * a.length)];
const chance = p => rnd() < p;
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));

// ------------------------------------------------------------------ componentes con etiqueta de verdad
// Cada componente: [texto, [intenciones aceptables]]. Las listas aceptables incluyen alternativas legítimas.
const EQUIPO = ['mi pc', 'mi notebook', 'el computador', 'mi compu', 'el note', 'mi laptop', 'el pc', 'mi computadora'];
const PROBLEMA = [
  ['no prende', ['no_enciende']], ['no enciende', ['no_enciende']], ['no da imagen', ['no_enciende']], ['se murió', ['no_enciende']],
  ['anda muy lento', ['lento']], ['está lentísimo', ['lento']], ['se pega todo', ['lento']], ['se quedó pegado', ['lento']],
  ['se echó a perder', ['dano_general']], ['no funciona', ['dano_general']], ['se rompió', ['dano_general']], ['está malo', ['dano_general']], ['no me anda', ['dano_general']], ['está fallando', ['dano_general']],
  ['se calienta mucho', ['limpieza']], ['se apaga solo', ['dano_general']], ['se reinicia solo', ['dano_general']], ['hace mucho ruido el ventilador', ['ventilador']]
];
const PIEZA_PEDIDO = [
  ['cuánto sale cambiar la pantalla', ['pantalla']], ['cuánto cuesta cambiar la batería', ['bateria']], ['cuánto sale cambiar el teclado', ['teclado']], ['cuánto sale poner un ssd', ['ssd']],
  ['cuánto sale ampliar la ram', ['upgrade_ram']], ['cuánto sale formatear', ['formateo']], ['cuánto sale una limpieza', ['limpieza']], ['precio del diagnóstico', ['precio_general']],
  ['cuánto cobran por revisarlo', ['precio_general']], ['pueden recuperar mis fotos', ['datos']], ['cuánto demora cambiar la pantalla', ['tiempo_pantalla']], ['cuántos días se demoran en cambiar la batería', ['tiempo']],
  ['cuánto demora un formateo', ['formateo']], ['cuánto cuesta cambiar el jack de carga', ['jack']], ['cambian bisagras?', ['bisagras']]
];
const INFO = [
  ['dónde quedan', ['ubicacion']], ['están abiertos', ['horario']], ['hasta qué hora atienden', ['horario']], ['hacen retiro a domicilio', ['domicilio']], ['hay descuento para estudiantes', ['descuento']],
  ['tienen garantía', ['garantia_q']], ['tienen hora para mañana', ['agendar']], ['quiero agendar una hora', ['agendar']], ['ya está listo mi equipo', ['estado']], ['alguna novedad de mi pc', ['estado']],
  ['trabajan con asus', ['marcas']], ['de qué marca es el ssd', ['marca_pieza']], ['son wd?', ['marca_pieza']], ['las piezas son originales', ['marca_pieza']], ['arreglan la placa madre', ['placa_madre']], ['reparan celulares', ['otros_disp']]
];
// Mensajes que piden/preguntan algo que el bot NO sabe resolver: tras un «gracias» deben derivarse, nunca «De nada».
const PIDE_OTRO = ['me avisas cuando esté listo?', 'mañana lo llevo pa que lo revisen', 'te aviso cuando pueda ir', 'me guardas el equipo hasta el lunes?', 'puedo pasar en la tarde?', 'me mandas la factura?', 'cómo te pago?', 'cuánto es el abono', 'lo paso a buscar el martes', 'tienes el número de cuenta?', 'puedes revisar mi otro pc también?', 'me puedes llamar?'];
const FALLA_REPETIDA = ['sigue igual', 'sigue fallando', 'volvió a fallar', 'otra vez lo mismo', 'quedó pegado de nuevo', 'quedó pegada otra vez', 'pantalla azul de nuevo', 'se apagó otra vez', 'de nuevo no prende', 'no quedó bien', 'se volvió a echar a perder', 'sigue con el mismo problema'];
const NEGATIVOS = [   // etiqueta: sin_intencion (o intenciones inocuas)
  'derrame cerebral jaja', 'mi tío tuvo un derrame', 'tuve un derrame de bilis', 'me derramé de la risa', 'trabajan hp? busco trabajo', 'vendo repuestos de notebook, te interesa?', 'soy proveedor de pantallas',
  'ofrecemos repuestos al por mayor', 'quiero comprar un notebook', 'tienes un notebook a la venta?', 'el link no funciona', 'la página no anda', 'falla de luz en el edificio', 'no falla nada', 'el café está caliente'
];
// Liquidos y equipo mojado: CRITICO de seguridad (no prender ni cargar + aviso urgente). Los negativos no son liquido.
const LIQ_POS = ['se me mojó el pc', 'se mojó el notebook', 'se cayó café al notebook', 'le cayó agua', 'le tiré café al computador', 'me cayó té', 'se me derramó el jugo en la compu', 'cayó líquido en mi laptop', 'mi notebook está mojado', 'mi compu quedó mojada', 'tiene humedad el notebook', 'se me mojó la compu', 'se mojó mi note', 'derramé cerveza en el teclado', 'le cayó coca al pc'];
const LIQ_NEG = ['moje el pan en la sopa', 'se mojó la ropa', 'cae agua en mi casa', 'derrame cerebral jaja', 'se me derramó el jugo en el piso', 'me mojé con la lluvia', 'mi tío tuvo un derrame', 'el café está caliente'];
const AGRADECE = ['gracias', 'muchas gracias', 'mil gracias', 'ya, gracias', 'dale gracias', 'gracias po', 'bacán, gracias'];
const CLAVES = ['mi clave de windows es Hunter22', 'la contraseña es abc12345 no me deja entrar', 'el pin es 4455 y la clave: Zorro99', 'mi password es qwer1234'];
const INGLES = ['hello, do you repair laptops?', 'hi how much for a screen replacement', 'my laptop does not turn on, can you help me?', 'good morning, are you open today?'];
const SALUDO = ['', '', '', 'hola ', 'buenas ', 'oie ', 'wena ', 'hola, ', 'buenas tardes, ', 'hola una consulta, '];
const CONECTOR = ['', '', 'oye ', 'y ', 'quería saber ', 'disculpa, '];
const SUFIJO_T = [['', null], [' para hoy', 'urgencia'], [' para mañana', null], [' es urgente', 'urgencia'], [' me urge', 'urgencia']];
const CIERRE = ['', '', '', ' porfa', ' po', ' 🙏', ' jaja', ' altiro', ' 😅'];

// ------------------------------------------------------------------ mutaciones (preservan o relajan la etiqueta)
const sinTildes = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const mut = {
  sinTildes: s => sinTildes(s).replace(/[¿¡?!]/g, ''),
  mayus: s => s.toUpperCase(),
  repite: s => { const i = int(0, Math.max(0, s.length - 1)); return s.slice(0, i) + s[i] + s[i] + s[i] + s.slice(i + 1); },
  emoji: s => s + pick([' 🙏', ' 😅', ' 😭', ' 🔥', ' 👍']),
  hola: s => pick(['hola ', 'buenas ', 'wena ', 'oie ']) + s,
  abrevia: s => s.replace(/\bque\b/g, 'q').replace(/\bpara\b/g, 'pa').replace(/\bpor favor\b/g, 'porfa').replace(/\bcomo\b/g, 'cm'),
  typo: s => { const w = s.split(' '); const k = int(0, w.length - 1); const x = w[k]; if (x.length > 4) { const i = int(1, x.length - 2); w[k] = x.slice(0, i) + x[i + 1] + x[i] + x.slice(i + 2); } return w.join(' '); },
  corta: s => { const w = s.split(' '); const k = int(0, w.length - 1); if (w[k].length > 4) w[k] = w[k].slice(0, w[k].length - 2); return w.join(' '); },
  trunca: s => s.slice(0, Math.max(3, Math.floor(s.length * (0.4 + rnd() * 0.5)))),
  duplica: s => s + ' ' + s,
  puntos: s => s.replace(/ /g, pick([' ', '  ', ' ... ']))
};
const MUT_FUERTES = ['sinTildes', 'mayus', 'repite', 'emoji', 'hola', 'abrevia'];   // no deben cambiar la intención
const MUT_DEBILES = ['typo', 'corta', 'trunca', 'duplica', 'puntos'];                // pueden perder reconocimiento, no equivocarse

// ------------------------------------------------------------------ casos de un mensaje
// kind: nombre del generador; ok: intenciones aceptables (null = sin etiqueta); espera: 'derivar' si debe ir a Gabriel
const CLASES = { saludo: 'saludo', como_estas: 'saludo', ping: 'saludo', garantia_q: 'garantia', demo: 'web' };   // equivalentes para los metamorficos
const canon = i => CLASES[i] || (/^web/.test(i) ? 'web' : i);   // los pasos del flujo web son una misma clase
// Clases de seguridad: un cambio de intencion que las toque es critico; entre servicios/info distintos por ruido es solo cobertura.
const SEGURIDAD = new Set(['urgente', 'urgencia', 'garantia', 'garantia_q', 'gracias', 'spam', 'humano', 'es_bot', 'llegada', 'clave', 'estado', 'objecion']);
const KEYWORD = /^(agenda|demo)\b/i;
function generarHistorico() {
  const m = pick(SEMILLAS_REALES), o = rnd();
  if (o < 0.5) { const f = chance(0.75), nom = pick(f ? MUT_FUERTES : MUT_DEBILES); return { kind: 'hist_mut_' + nom, texto: mut[nom](m.texto), hist: m, fuerte: f, familia: 'historico', ok: null }; }
  if (o < 0.7) return { kind: 'hist_gracias_mas', texto: chance(0.5) ? pick(AGRADECE) + ', ' + m.texto : m.texto + ' ' + pick(AGRADECE), hist: m, familia: 'historico', ok: null, graciasMas: m.pide };
  if (o < 0.85) { const m2 = pick(SEMILLAS_REALES); return { kind: 'hist_dos_juntas', texto: m.texto + (chance(0.5) ? ' y ' : '. ') + m2.texto, hist: m, familia: 'historico', ok: null }; }
  return { kind: 'hist_tal_cual', texto: m.texto, hist: m, familia: 'historico', ok: null };
}
function generar() {
  if (SEMILLAS_REALES.length && chance(0.5)) return generarHistorico();
  if (chance(0.05)) {                                           // liquidos: positivos (urgente) y negativos
    const pos = chance(0.7), base = pick(pos ? LIQ_POS : LIQ_NEG);
    const m = chance(0.6) ? pick(MUT_FUERTES) : null;
    return { kind: pos ? 'liquido' : 'liquido_neg', texto: (m ? mut[m](base) : pick(SALUDO) + base + pick(CIERRE)).trim(), ok: pos ? ['urgente'] : ['sin_intencion', 'saludo', 'otra_persona', 'ping'], liquido: pos, negLiquido: !pos, familia: 'liquido', relajado: false };
  }
  const t = rnd();
  if (t < 0.34) {                                           // gramática: [saludo][conector][núcleo][tiempo][cierre]
    const k = pick(['pedido', 'problema', 'info']);
    let nucleo, ok;
    if (k === 'pedido') [nucleo, ok] = pick(PIEZA_PEDIDO);
    else if (k === 'info') [nucleo, ok] = pick(INFO);
    else { const [p, o] = pick(PROBLEMA); nucleo = pick(EQUIPO) + ' ' + p; ok = o; }
    let [suf, extra] = pick(SUFIJO_T);
    ok = extra ? ok.concat(extra) : ok.slice();
    let texto = pick(SALUDO) + pick(CONECTOR) + nucleo + suf + pick(CIERRE);
    if (chance(0.12)) texto += (chance(0.5) ? ' ' : ', ') + pick(AGRADECE);
    return { kind: 'gramatica_' + k, texto: texto.trim(), ok, familia: k };
  }
  if (t < 0.52) {                                           // mutación de semillas etiquetadas (chileno.gen)
    let b = pick(BASES);
    while (KEYWORD.test(b.texto)) b = pick(BASES);
    const fuerte = chance(0.7);
    const m = pick(fuerte ? MUT_FUERTES : MUT_DEBILES);
    return { kind: 'mutacion_' + m, texto: mut[m](b.texto), ok: [].concat(b.esperada), base: b.texto, relajado: !fuerte, familia: 'mutacion' };
  }
  if (t < 0.58) {                                           // gracias + pedido que el bot no entiende => derivar
    const g = pick(AGRADECE), x = pick(PIDE_OTRO);
    return { kind: 'gracias_pide', texto: chance(0.5) ? g + ', ' + x : x + ' ' + g, ok: ['sin_intencion', 'voy', 'estado', 'agendar', 'horario', 'agendo', 'domicilio', 'ubicacion', 'llegada', 'precio_general', 'otra_persona', 'pago'], noGracias: true, familia: 'gracias_x' };
  }
  if (t < 0.64) {                                           // gracias + pregunta de info / pedido conocido
    const [x, ok] = pick(chance(0.5) ? PIEZA_PEDIDO : INFO);
    return { kind: 'gracias_pregunta', texto: pick(AGRADECE) + ', ' + x + '?', ok, noGracias: true, familia: 'gracias_x' };
  }
  if (t < 0.71) {                                           // gracias + falla (con y sin historial)
    const [p, o] = pick(PROBLEMA);
    return { kind: 'gracias_falla', texto: pick(AGRADECE) + ', ' + pick(EQUIPO) + ' ' + p, ok: o.concat(['garantia', 'limpieza', 'memoria_duda', 'sin_intencion']), noGracias: true, falla: true, familia: 'gracias_x' };
  }
  if (t < 0.77) {                                           // falla repetida: con historial es garantía; sin historial no
    const f = pick(FALLA_REPETIDA);
    return { kind: 'falla_repetida', texto: pick(['gracias, ', '', 'hola, ']) + (chance(0.5) ? pick(EQUIPO) + ' ' : '') + f, ok: ['garantia', 'dano_general', 'no_enciende', 'sin_intencion', 'lento', 'urgente', 'gracias_no'], repetida: true, noGracias: true, falla: true, familia: 'falla_rep' };
  }
  if (t < 0.82) return { kind: 'negativo', texto: pick(SALUDO) + pick(NEGATIVOS), ok: ['sin_intencion', 'saludo', 'otra_persona', 'ping', 'spam'], negativo: true, familia: 'negativo' };
  if (t < 0.85) return { kind: 'clave', texto: pick(CLAVES), ok: null, clave: true, familia: 'clave' };
  if (t < 0.87) return { kind: 'ingles', texto: pick(INGLES), ok: null, ingles: true, familia: 'ingles' };
  if (t < 0.92) {                                           // dos intenciones juntas
    const [a, oa] = pick(PIEZA_PEDIDO), [b, ob] = pick(INFO);
    return { kind: 'dos_intenciones', texto: a + (chance(0.5) ? ' y ' : '? ') + b, ok: oa.concat(ob, ['dos_temas', 'sin_intencion'], ob.includes('marca_pieza') ? ['ssd'] : []), relajado: true, familia: 'dos' };
  }
  if (t < 0.95) {                                           // ruido puro / entradas límite
    const raros = ['', ' ', '?', '👍', '🔥🔥🔥', 'a', '.', '...', 'ok', 'ya', 'jajaja', 'x'.repeat(int(300, 5000)), 'hola '.repeat(int(5, 300)), '\u0000‮', 'http://' + 'a'.repeat(int(5, 3000)) + '.com/x', '+56 9 ' + int(1000, 9999) + ' ' + int(1000, 9999), '12.345.678-5', '<script>x</script>', '{"a":[1,2]}', '🙂'.repeat(int(1, 400))];
    return { kind: 'ruido', texto: pick(raros), ok: null, familia: 'ruido' };
  }
  const b = pick(BASES);                                    // mensaje largo: semilla + relleno
  return { kind: 'largo', texto: b.texto + '. ' + 'Es que ayer estuve revisando y la verdad no sé qué pasó. '.repeat(int(2, 20)), ok: null, familia: 'largo' };
}

// ------------------------------------------------------------------ contextos
const HORAS = ['03:00', '07:30', '09:00', '12:00', '15:30', '20:59', '21:00', '23:30'];
const TS_HORA = {};
const tsHora = h => TS_HORA[h] || (TS_HORA[h] = chileATimestamp('2026-11-11', h));
function contexto() {
  const hora = pick(HORAS), ahora = tsHora(hora) + int(0, 50) * MIN;
  const e = pick(['nuevo', 'nuevo', 'previo', 'previo', 'gab2', 'gab9', 'gab11', 'gab180']);
  return { e, hora, ahora, armar: () => armarContacto(e, ahora) };
}
function armarContacto(e, ahora) {
  if (e === 'nuevo') return null;
  const c = { visto: ahora - 30 * MIN, enviados: { formateo: ahora - 30 * MIN }, bots: [ahora - 30 * MIN], ultimoBot: ahora - 30 * MIN };
  if (e === 'gab2') c.gabriel = ahora - 2 * MIN;
  if (e === 'gab9') c.gabriel = ahora - 9 * MIN;
  if (e === 'gab11') c.gabriel = ahora - 11 * MIN;
  if (e === 'gab180') c.gabriel = ahora - 180 * MIN;
  return c;
}

// ------------------------------------------------------------------ oráculos
const viol = {};     // categoria -> { n, ej: [{len,texto,ctx,det}] }
const dist = {};     // intencion -> n
let casos = 0, llamadas = 0, silencios = 0, derivaciones = 0, conRespuesta = 0, ingles_spam = 0, ingles_n = 0, miss = {};
// PRIVACIDAD: si el caso viene de un mensaje real, el reporte no lleva su texto (solo el largo y la categoria).
let OCULTAR = false;
function reporta(cat, texto, ctx, det) {
  const v = viol[cat] || (viol[cat] = { n: 0, ej: [] });
  v.n++;
  const len = String(texto).length;
  const ej = OCULTAR ? { len, texto: '(texto de origen real oculto, ' + len + ' car.)', ctx, det: String(det).split(' con «')[0].replace(/«[^»]*»/g, '«…»').slice(0, 60) } : { len, texto: String(texto).slice(0, 160), ctx, det };
  if (v.ej.length < MAXEJ) { v.ej.push(ej); v.ej.sort((a, b) => a.len - b.len); }
  else if (ej.len < v.ej[v.ej.length - 1].len && !v.ej.some(x => x.texto === ej.texto)) { v.ej[v.ej.length - 1] = ej; v.ej.sort((a, b) => a.len - b.len); }
}
function run(texto, contacto, ahora, links, payload, adjunto) {
  llamadas++;
  return decidir(texto, contacto, ahora, links || LINKS, payload || '', adjunto || '');
}
const urls = t => Array.from(new Set((t.match(/https?:\/\/[^\s)]+/g) || []).map(u => u.replace(/[.,;]+$/, ''))));
function invariantes(r, texto, ctxs) {
  if (!r || typeof r !== 'object' || typeof r.intencion !== 'string' || !r.contacto) return reporta('b_forma_de_salida', texto, ctxs, 'salida mal formada');
  if (r.respuesta == null) return;
  const t = r.respuesta;
  if (typeof t !== 'string' || !t.trim()) return reporta('b_respuesta_vacia', texto, ctxs, '');
  if (t.length > 700) reporta('b_largo_700', texto, ctxs, t.length + ' chars');
  if (/calendly/i.test(t)) reporta('b_calendly', texto, ctxs, '');
  if (/\{\{|undefined|\bnull\b|\[object/i.test(t)) reporta('b_placeholder', texto, ctxs, t.slice(0, 80));
  const dosDisenados = urls(t).length === 2 && urls(t).some(u => /pedidos\.8vobit\.xyz\/gassuso/.test(u)) && urls(t).some(u => /8vobit\.xyz\/#reunion/.test(u));   // cierre del embudo Pedidos: demo + reunion, diseno aprobado
  if (urls(t).length > 1 && !dosDisenados) reporta('b_dos_enlaces', texto, ctxs, urls(t).join(' '));
  if (/santiago/i.test(t) && /pantalla/i.test(t)) reporta('b_santiago_con_pantalla', texto, ctxs, '');
  if (/fuera de horario|ma[ñn]ana desde las 9|respuesta autom[aá]tica|mensaje autom[aá]tico|lo veo ma[ñn]ana|te contesta ma[ñn]ana/i.test(t)) reporta('b_aviso_horario', texto, ctxs, t.slice(0, 80));
  for (const m of t.match(/\$\s?\d[\d.]*/g) || []) if (!PRECIOS.has(m.replace(/[\s.]/g, ''))) reporta('b_precio_fuera_de_lista', texto, ctxs, m);
  for (const b of r.botones || []) if (String(b.titulo).length > 20) reporta('b_boton_largo', texto, ctxs, b.titulo);
}
const DERIVA = new Set(['sin_intencion']);

function casoUnico() {
  const g = generar(), cx = contexto();
  OCULTAR = !!g.hist;
  casos++;
  const ctxs = cx.e + ' ' + cx.hora;
  let r;
  try { r = run(g.texto, cx.armar(), cx.ahora); }
  catch (e) { return reporta('a_excepcion', g.texto, ctxs, String(e && e.message).slice(0, 100)); }
  invariantes(r, g.texto, ctxs);
  if (!r || typeof r.intencion !== 'string') return;
  dist[r.intencion] = (dist[r.intencion] || 0) + 1;
  if (r.respuesta == null) { silencios++; if (r.aviso) derivaciones++; } else conRespuesta++;

  // (c) pausa de Gabriel y topes
  if ((cx.e === 'gab2' || cx.e === 'gab9') && r.respuesta != null && !g.clave) reporta('c_responde_con_gabriel_activo', g.texto, ctxs, r.intencion);
  if ((cx.e === 'gab11' || cx.e === 'gab180') && casos % 5 === 0) {
    const c2 = cx.armar(); c2.gabriel = 0;
    const s = run(g.texto, c2, cx.ahora);
    if ((r.respuesta == null) !== (s.respuesta == null)) reporta('c_pausa_no_termina_a_10min', g.texto, ctxs, 'con Gabriel hace ' + (cx.e === 'gab11' ? 11 : 180) + ' min: ' + (r.respuesta == null ? 'calla' : 'responde') + '; sin Gabriel: ' + (s.respuesta == null ? 'calla' : 'responde'));
  }

  if (g.hist) {
    if (g.kind.startsWith('hist_mut_') && g.fuerte && !KEYWORD.test(g.hist.texto)) {
      const r0 = run(g.hist.texto, cx.armar(), cx.ahora);
      if (r0.intencion !== 'sin_intencion' && r0.intencion !== 'clave' && canon(r0.intencion) !== canon(r.intencion)) reporta((r.intencion === 'sin_intencion' ? 'm_perdida_reconocimiento_hist_' : (SEGURIDAD.has(r0.intencion) || SEGURIDAD.has(r.intencion)) ? 'h_metamorfico_' : 'm_cambio_servicio_por_ruido_hist_') + g.kind.slice(9), '(semilla real ' + g.hist.texto.length + ' car.) ' + g.kind, ctxs, r0.intencion + ' -> ' + r.intencion);
    }
    if (g.graciasMas && (r.intencion === 'gracias' || (r.respuesta && /de nada/i.test(r.respuesta)))) reporta('h_gracias_con_pedido_real', '(semilla real ' + g.hist.texto.length + ' car.)', ctxs, r.intencion);
  }
  // (d) etiqueta de verdad
  if (g.ok) {
    const aceptable = g.ok.includes(r.intencion) || g.ok.some(x => canon(x) === canon(r.intencion));
    const aceptable2 = aceptable || (g.relajado && ['precio_general', 'tiempo', 'agendar', 'saludo', 'como_estas', 'ssd', 'pantalla', 'bateria', 'teclado', 'upgrade_ram', 'formateo', 'limpieza', 'datos', 'jack', 'bisagras', 'voy', 'dano_general', 'memoria_duda', 'confuso', 'clave', 'urgente'].includes(r.intencion)) || (g.ok.includes('web_inicio') && ['demo', 'agendar', 'web'].includes(r.intencion)) || (g.ok.some(x => canon(x) === 'saludo') && canon(r.intencion) === 'saludo');
    if (!aceptable2) {
      if (r.intencion === 'sin_intencion') { const k = g.kind; miss[k] = (miss[k] || [0, 0]); miss[k][0]++; if (!g.relajado && !g.negativo) reporta('d_no_reconocido_' + g.familia, g.texto, ctxs, 'esperaba ' + g.ok.join('|')); }
      else if (g.negativo) reporta('d_negativo_reconocido_como_algo', g.texto, ctxs, r.intencion);
      else if (g.repetida || g.relajado) { /* alternativas amplias: solo cuenta si cae en una intención ajena */ if (!['gracias', 'spam'].includes(r.intencion) || g.noGracias) reporta('d_intencion_ajena_' + g.familia, g.texto, ctxs, r.intencion + ' (esperaba ' + g.ok.join('|') + ')'); }
      else reporta('d_intencion_equivocada_' + g.familia, g.texto, ctxs, r.intencion + ' (esperaba ' + g.ok.join('|') + ')');
    }
    miss[g.kind] = miss[g.kind] || [0, 0]; miss[g.kind][1]++;
  }
  // (e) metamórficos y reglas de oro
  if (g.noGracias) {
    if (r.intencion === 'gracias') reporta('e_gracias_con_pedido_o_falla', g.texto, ctxs, 'intencion gracias');
    if (r.respuesta && /de nada/i.test(r.respuesta)) reporta('e_de_nada_a_quien_pide', g.texto, ctxs, r.respuesta.slice(0, 40));
  }
  if (g.negativo && r.respuesta && /de nada/i.test(r.respuesta)) reporta('e_de_nada_a_quien_pide', g.texto, ctxs, r.respuesta.slice(0, 40));
  if (g.falla && r.respuesta == null && !r.aviso) reporta('e_falla_en_silencio_sin_aviso', g.texto, ctxs, r.intencion);
  if (g.liquido && (r.intencion !== 'urgente' || r.aviso !== 'urgente')) reporta('e_liquido_no_urgente', g.texto, ctxs, r.intencion + '/' + r.aviso);
  if (g.negLiquido && r.intencion === 'urgente') reporta('e_falso_positivo_liquido', g.texto, ctxs, r.intencion);
  if (g.clave && !r.ocultar) reporta('e_clave_no_oculta', g.texto, ctxs, r.intencion);
  if (g.ingles) { ingles_n++; if (r.intencion === 'spam') ingles_spam++; }
  if (g.repetida && cx.e === 'nuevo' && r.intencion === 'garantia' && !/^gracias/.test(g.texto) && /(otra vez|de nuevo|nuevamente)/i.test(g.texto) && !/(sigue|volvio|volvió|no quedo bien|no quedó bien|lo mismo)/i.test(g.texto)) reporta('e_garantia_sin_historial', g.texto, ctxs, 'garantia con contacto nuevo');
  if (g.repetida && (cx.e === 'previo') && r.intencion !== 'garantia' && /(sigue|volvio|volvió|otra vez|de nuevo|quedo pegad|quedó pegad|no quedo bien|no quedó bien)/i.test(g.texto)) reporta('e_falla_repetida_con_historial_no_es_garantia', g.texto, ctxs, r.intencion);

  if (g.ok && !g.negativo && !g.clave && !g.relajado && r.intencion !== 'sin_intencion' && casos % 3 === 0) {
    // ruido / tildes / mayúsculas / emoji / hola delante no cambian la intención
    for (const m of ['sinTildes', 'mayus', 'emoji', 'hola']) {
      if (m === 'hola' && /^(hola|buenas|oie|wena)/i.test(g.texto)) continue;
      if (KEYWORD.test(g.texto)) continue;
      const tv = mut[m](g.texto);
      const rv = run(tv, cx.armar(), cx.ahora);
      if (canon(rv.intencion) !== canon(r.intencion)) reporta((rv.intencion === 'sin_intencion' ? 'm_perdida_reconocimiento_' : 'e_metamorfico_') + m, g.texto, ctxs, r.intencion + ' -> ' + rv.intencion + ' con «' + tv.slice(0, 80) + '»');
    }
  }
  if (casos % 4 === 0 && r.intencion !== 'llegada') {
    const h2 = pick(HORAS.filter(h => h !== cx.hora)), a2 = tsHora(h2) + (cx.ahora - tsHora(cx.hora));
    const r2 = run(g.texto, armarContacto(cx.e, a2), a2);
    if (r2.intencion !== r.intencion || (r2.respuesta == null) !== (r.respuesta == null)) {
      if (r2.intencion !== 'llegada') reporta('e_misma_frase_distinta_hora', g.texto, ctxs + '->' + h2, r.intencion + (r.respuesta == null ? '(silencio)' : '') + ' -> ' + r2.intencion + (r2.respuesta == null ? '(silencio)' : ''));
    }
  }
  // (f) estabilidad: el mismo mensaje dos veces seguidas
  if (casos % 4 === 1 && r.intencion !== 'sin_intencion' && cx.e !== 'gab2' && cx.e !== 'gab9' && !/^web/.test(r.intencion) && !/(otra vez|de nuevo|nuevamente|volvio|volvió|vu+e+l)/i.test(g.texto) && !r.contacto.pend && !r.contacto.web && !r.contacto.ag) {
    const r3 = run(g.texto, r.contacto, cx.ahora + MIN);
    if (r3.intencion !== r.intencion) reporta('f_inestable_al_repetir', g.texto, ctxs, r.intencion + ' -> ' + r3.intencion);
    else if (r3.respuesta != null && r.respuesta != null && r3.respuesta === r.respuesta && !r3.botones) reporta('c_repite_respuesta_en_24h', g.texto, ctxs, r3.intencion);
  }
}

// ------------------------------------------------------------------ secuencias de 2-6 turnos
function secuencia() {
  const cx = contexto();
  casos++;
  let ahora = cx.ahora, c = cx.armar(), ultimoG = c && c.gabriel ? c.gabriel : 0;
  const turnos = int(2, 6), enviados = [], hist = [];
  OCULTAR = false;
  for (let i = 0; i < turnos; i++) {
    const w = rnd();
    if (w < 0.18) { const txt = 'Hola, te cuento ' + int(1, 99); if (!c) c = { visto: ahora, enviados: {}, bots: [] }; if (txt !== c.ultimoTexto) c.gabriel = ahora; ultimoG = ahora; hist.push('[Gabriel]'); ahora += int(1, 3) * MIN; continue; }
    if (w < 0.45) ahora += int(1, 180) * MIN; else ahora += int(0, 2) * MIN;
    const g = generar();
    if (g.hist) OCULTAR = true;
    let r;
    try { r = run(g.texto, c, ahora); } catch (e) { reporta('a_excepcion', hist.concat(g.texto).join(' | '), 'secuencia', String(e && e.message).slice(0, 100)); return; }
    hist.push(g.texto.slice(0, 50));
    invariantes(r, g.texto, 'secuencia');
    if (!r || !r.contacto) return;
    if (r.respuesta) r.contacto.ultimoTexto = r.respuesta;
    c = r.contacto;
    const trace = hist.join(' | ');
    if (ultimoG && ahora - ultimoG < 10 * MIN && r.respuesta != null && !g.clave) reporta('c_responde_con_gabriel_activo', trace, 'secuencia', r.intencion);
    if (r.respuesta != null) {
      enviados.push({ ts: ahora, t: r.respuesta, i: r.intencion });
      const libres = !/^(web_|adjunto|menu|pend|ag_|clave|confuso)/.test(r.intencion) && !c.web && !c.ag;   // la advertencia de claves no se limita
      const ult = enviados.filter(e => ahora - e.ts < H);
      if (libres && ult.length > 3) reporta('c_mas_de_3_respuestas_por_hora', trace, 'secuencia', ult.map(e => e.i).join(','));
      const rep = enviados.slice(0, -1).find(e => e.t === r.respuesta && ahora - e.ts < DIA);
      if (rep && libres && !r.botones && !/^(seg|pend|ping)/.test(r.intencion)) reporta('c_repite_respuesta_en_24h', trace, 'secuencia', r.intencion);
    }
  }
}

// ------------------------------------------------------------------ ejecución
const t0 = Date.now();
for (let i = 0; i < N; i++) { if (chance(0.22)) secuencia(); else casoUnico(); }
const seg = (Date.now() - t0) / 1000;

// ------------------------------------------------------------------ reporte
const cats = Object.entries(viol).sort((a, b) => b[1].n - a[1].n);
const critica = c => /^(a_|b_|c_|e_|f_|h_)/.test(c) || /^d_(intencion_equivocada|negativo|intencion_ajena)/.test(c);
const out = [];
out.push('# Reporte de estrés del bot (semilla ' + SEED + ', ' + N + ' casos)');
out.push('');
out.push('- Casos: ' + casos + ' · llamadas a decidir(): ' + llamadas + ' · tiempo: ' + seg.toFixed(1) + ' s (' + Math.round(llamadas / seg) + ' llamadas/s)');
out.push('- Mensajes únicos (primer turno) con respuesta: ' + conRespuesta + ' · en silencio: ' + silencios + ' (con aviso a Gabriel: ' + derivaciones + ')');
out.push('- Inglés: ' + ingles_n + ' casos, ' + ingles_spam + ' caen en spam (decisión pendiente de Gabriel; no se cambió)');
const criticas = cats.filter(([c]) => critica(c)), info = cats.filter(([c]) => !critica(c));
out.push('- **Violaciones críticas: ' + criticas.reduce((a, [, v]) => a + v.n, 0) + ' en ' + criticas.length + ' categorías** · no reconocidos (cobertura): ' + info.reduce((a, [, v]) => a + v.n, 0));
out.push('');
out.push('## Categorías');
for (const [c, v] of cats) {
  out.push('');
  out.push('### ' + c + ' — ' + v.n + (critica(c) ? ' (crítica)' : ' (cobertura)'));
  for (const e of v.ej) out.push('- `' + JSON.stringify(e.texto) + '` · ' + e.ctx + ' · ' + e.det);
}
out.push('');
out.push('## Distribución de intenciones (primer turno)');
out.push(Object.entries(dist).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(' · '));
out.push('');
out.push('## Reconocimiento por generador (aceptable/total)');
out.push('Formato: generador: % sin perdida de reconocimiento (casos que cayeron en sin_intencion SIN ser una respuesta aceptable / total con etiqueta). 0/N = ninguno se perdio. En los generadores donde derivar es lo correcto (negativo, gracias_pide, dos_intenciones) sin_intencion es aceptable y el 100% es por diseno.');
out.push(Object.entries(miss).map(([k, [m, t]]) => k + ': ' + (t ? (100 * (t - m) / t).toFixed(1) : '0') + '% (' + m + '/' + t + ')').join(' · '));
const texto = out.join('\n') + '\n';
if (REPORTE) require('fs').writeFileSync(REPORTE, texto);
console.log(texto.split('\n').slice(0, REPORTE ? 8 : 400).join('\n'));
process.exitCode = criticas.length ? 1 : 0;
