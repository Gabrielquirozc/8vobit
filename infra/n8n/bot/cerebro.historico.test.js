// Pruebas contra el corpus REAL de DM (SPEC-004). PRIVACIDAD: los chats viven en infra/n8n/chats (en .gitignore) y se leen
// en tiempo de ejecución; si la carpeta no existe, todo se salta con aviso. Nada de su contenido se versiona ni se imprime:
//  (a) replay de cada conversación con su reloj real y los mensajes de Gabriel como eco, con invariantes;
//  (b) snapshot SIN TEXTO (historico.estado.json): hash sha256(texto normalizado)[0..12] -> intención. Si un mensaje cambia
//      de intención el test falla y lista SOLO hashes con intención antigua/nueva. HISTORICO_ACTUALIZAR=1 lo regenera
//      (cada cambio debe ser una decisión consciente);
//  (c) métricas agregadas en consola (no versionadas).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { decidir } = require('./cerebro.js');
const { chileATimestamp } = require('./simulador.js');
const { MIN, H, LINKS, invariantesRespuesta } = require('./banco.util.js');
const historico = require('./historico.js');

// PRIVACIDAD: el snapshot por mensaje y la clave del HMAC viven SOLO dentro de infra/n8n/chats/ (carpeta en .gitignore).
// En el arbol versionado solo hay agregados (historico.agregados.json: conteos por intencion, sin hashes ni texto).
const CARPETA_LOCAL = path.join(__dirname, '..', 'chats');
const ESTADO = path.join(CARPETA_LOCAL, '.historico.estado.json');
const CLAVE = path.join(CARPETA_LOCAL, '.historico.clave');
const AGREGADOS = path.join(__dirname, 'historico.agregados.json');
function claveLocal() {
  if (!fs.existsSync(CLAVE)) fs.writeFileSync(CLAVE, crypto.randomBytes(32).toString('hex'));
  return fs.readFileSync(CLAVE, 'utf8').trim();
}
const corpus = historico.cargar();
const DIA = 24 * H;

if (!corpus) {
  test('histórico real: corpus ausente (infra/n8n/chats), se omite', t => { t.skip('no hay chats exportados en esta máquina; las pruebas del histórico real se saltan'); });
  return;
}

const norm = s => historico.normalizarBasico(s);
const hash12 = s => crypto.createHmac('sha256', claveLocal()).update(norm(s)).digest('hex').slice(0, 12);
const RE_CLAVE = /\b(clave|contrasena|contraseña|password|pass|pin)\b.{0,15}\d|\b(clave|contrasena|contraseña|password)\s*(es|:)\s*\S{4,}/i;
const RE_PIDE_FUERTE = /\?|\b(quiero|necesito|puedes|pueden|podrias|me avisas|cuanto|cuando|donde)\b/;
const LIBRES = /^(web_|adjunto|menu|pend|ag_|clave|confuso|seg)/;

// ---------------------------------------------------------------- (a) replay de cada conversación
corpus.hilos.forEach((h, n) => {
  test(`replay histórico #${n + 1} (${h.msgs.length} mensajes): invariantes con reloj real y eco de Gabriel`, () => {
    let c = null, ultimoG = 0;
    const enviados = [];
    for (const m of h.msgs) {
      if (m.quien === 'gabriel') {
        c = c || { visto: 0, enviados: {}, bots: [] };
        if (m.texto !== c.ultimoTexto) c.gabriel = m.ts;
        ultimoG = m.ts;
        continue;
      }
      const r = decidir(m.texto, c, m.ts, LINKS, '', m.adjunto);
      invariantesRespuesta(r, { texto: m.texto });
      c = r.contacto;
      if (r.respuesta) c.ultimoTexto = r.respuesta;
      // pausa de Gabriel: callado 10 min
      if (ultimoG && m.ts - ultimoG < 10 * MIN && !RE_CLAVE.test(m.texto)) assert.strictEqual(r.respuesta, null, 'Gabriel activo debe callar al bot');
      // contraseñas: nunca viajan al aviso
      if (RE_CLAVE.test(m.texto)) assert.strictEqual(r.ocultar, true, 'mensaje con clave debe ir oculto');
      // «gracias» / «De nada» nunca a quien pide algo
      if (m.texto && RE_PIDE_FUERTE.test(norm(m.texto)) && /gracia/.test(norm(m.texto))) {
        assert.notStrictEqual(r.intencion, 'gracias', 'gracias con pedido');
        assert.ok(!r.respuesta || !/de nada/i.test(r.respuesta), 'De nada a quien pide');
      }
      if (r.respuesta) {
        enviados.push({ ts: m.ts, t: r.respuesta, i: r.intencion });
        if (!LIBRES.test(r.intencion) && !c.web && !c.ag) assert.ok(enviados.filter(e => m.ts - e.ts < H).length <= 3, 'más de 3 respuestas en una hora');
        const rep = enviados.slice(0, -1).find(e => e.t === r.respuesta && m.ts - e.ts < DIA);
        if (rep && !LIBRES.test(r.intencion) && !r.botones && !/^ping/.test(r.intencion) && !c.web && !c.ag) assert.fail('repite la misma respuesta dentro de 24 h (' + r.intencion + ')');
      }
    }
  });
});

// ---------------------------------------------------------------- (b) snapshot sin texto
const T0 = chileATimestamp('2026-11-11', '15:00');
const unicos = new Map();
for (const m of historico.mensajesCliente()) { const k = norm(m.texto); if (k.length >= 4 && !unicos.has(k)) unicos.set(k, m.texto); }
const ordenado = o => Object.fromEntries(Object.entries(o).sort((a, b) => (a[0] < b[0] ? -1 : 1)));

test('snapshot histórico local (HMAC, fuera del repo): ningún mensaje real cambia de intención sin decisión consciente', t => {
  const actual = {};
  const porIntencion = {};
  for (const [, texto] of unicos) {
    const i = decidir(texto, null, T0, LINKS).intencion;
    actual[hash12(texto)] = i;
    porIntencion[i] = (porIntencion[i] || 0) + 1;
  }
  if (process.env.HISTORICO_ACTUALIZAR === '1') {
    fs.writeFileSync(ESTADO, JSON.stringify({ version: 2, nota: 'LOCAL, ignorado por git. HMAC-SHA256 con clave local (.historico.clave) del texto normalizado -> intencion.', total: Object.keys(actual).length, mapa: ordenado(actual) }, null, 1) + '\n');
    fs.writeFileSync(AGREGADOS, JSON.stringify({ version: 2, nota: 'Solo agregados: conteos de mensajes unicos por intencion. Sin hashes ni texto.', total: Object.keys(actual).length, porIntencion: ordenado(porIntencion) }, null, 1) + '\n');
    return;
  }
  if (!fs.existsSync(ESTADO)) { t.skip('no hay snapshot local; correr una vez con HISTORICO_ACTUALIZAR=1 (se guarda en infra/n8n/chats/, ignorada por git)'); return; }
  const previo = JSON.parse(fs.readFileSync(ESTADO, 'utf8')).mapa;
  const cambios = [];
  for (const [h, i] of Object.entries(actual)) if (previo[h] !== undefined && previo[h] !== i) cambios.push(h + ': ' + previo[h] + ' -> ' + i);
  const nuevos = Object.keys(actual).filter(h => previo[h] === undefined).length, faltan = Object.keys(previo).filter(h => actual[h] === undefined).length;
  assert.ok(cambios.length === 0 && nuevos === 0 && faltan === 0,
    cambios.length + ' mensajes cambiaron de intención, ' + nuevos + ' hashes nuevos, ' + faltan + ' ausentes. Si es intencional: HISTORICO_ACTUALIZAR=1. Cambios (hash: antes -> ahora):\n' + cambios.slice(0, 50).join('\n'));
});

// ---------------------------------------------------------------- (c) métricas agregadas (consola)
test.after(() => {
  const todos = historico.mensajesCliente();
  const ev = todos.map(m => ({ m, i: decidir(m.texto, null, T0, LINKS).intencion }));
  const pct = (a, b) => (b ? (100 * a / b).toFixed(1) : '0') + '%';
  const rec = ev.filter(e => e.i !== 'sin_intencion').length;
  const prim = ev.filter(e => e.m.primero), primRec = prim.filter(e => e.i !== 'sin_intencion').length;
  const pid = ev.filter(e => e.m.pide), pidRec = pid.filter(e => e.i !== 'sin_intencion').length;
  const formas = {};
  for (const e of pid.filter(e => e.i === 'sin_intencion')) {
    const k = norm(e.m.texto).replace(/https?:\S+/g, 'URL').replace(/@\w+/g, '@u').replace(/\d[\d.,]*/g, 'N').replace(/[^a-zn @u?]/g, '').split(' ').slice(0, 6).join(' ').trim();
    if (k) formas[k] = (formas[k] || 0) + 1;
  }
  const top = Object.entries(formas).filter(e => e[1] >= 2).sort((a, b) => b[1] - a[1]).slice(0, 60);
  console.log('# HISTÓRICO REAL (solo agregados): ' + corpus.hilos.length + ' conversaciones, ' + todos.length + ' mensajes de cliente con texto, ' + unicos.size + ' únicos');
  console.log('#   con intención: ' + pct(rec, ev.length) + ' · primeros mensajes: ' + pct(primRec, prim.length) + ' · preguntas/pedidos reconocidos: ' + pct(pidRec, pid.length) + ' (' + pidRec + '/' + pid.length + ')');
  if (process.env.HISTORICO_FORMAS === '1') console.log('#   formas de pregunta NO reconocidas más frecuentes (normalizadas, ≥2 veces): ' + top.map(([k, v]) => v + 'x «' + k + '»').join(' · '));
  else console.log('#   (formas de pregunta no reconocidas: HISTORICO_FORMAS=1 las imprime; por defecto solo conteos)');
});
