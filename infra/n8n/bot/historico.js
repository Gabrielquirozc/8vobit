// Lector del corpus REAL de DM (solo para pruebas y el motor de estrés). PRIVACIDAD: los chats viven en
// infra/n8n/chats/instagram-8vobit-*/ (carpeta en .gitignore, NO es parte del repo). Este módulo los lee en tiempo
// de ejecución y nada de su contenido se copia a archivos versionados ni a reportes. Si la carpeta no existe,
// cargar() devuelve null y los tests se saltan con aviso.
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', 'chats');

// Instagram guarda el texto como utf8 leído en latin1 (mojibake): se deshace; si no calza, queda tal cual.
function arreglar(s) {
  const t = String(s == null ? '' : s);
  if (!/[ÃÂâ]/.test(t)) return t;
  try { const u = Buffer.from(t, 'latin1').toString('utf8'); return u.includes('�') ? t : u; } catch (e) { return t; }
}
// Eventos de sistema de Instagram que no son mensajes de la persona.
const SISTEMA = /envi[oó] un archivo adjunto|comparti[oó] una historia|audio call|video chat|llamada de audio|videollamada|sent an attachment|liked a message|^reacted |a reaccionado|created the group|named the group|le gust[oó] un mensaje/i;

// Marca de pregunta o pedido (todo mensaje se conserva; esto solo etiqueta los que piden algo).
const RE_PIDE = /\?|\b(cuanto|cuando|donde|como|tienen|tienes|quiero|quisiera|necesito|me (pueden|puedes|ayudan|ayudas|avisas|mandas|das|cotizas)|hacen|arreglan|reparan|venden|cambian|atienden|reagendar|cancelar)\b/;
function normalizarBasico(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function esPedido(texto) { return RE_PIDE.test(normalizarBasico(texto)); }

let cache;
function cargar() {
  if (cache !== undefined) return cache;
  cache = null;
  let carpetas = [];
  try { carpetas = fs.readdirSync(RAIZ, { withFileTypes: true }).filter(d => d.isDirectory() && /^instagram-/.test(d.name)).map(d => path.join(RAIZ, d.name)); } catch (e) { return cache; }
  const hilos = [], conteo = {};
  for (const base of carpetas) {
    const inbox = path.join(base, 'your_instagram_activity', 'messages', 'inbox');
    let dirs = [];
    try { dirs = fs.readdirSync(inbox, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => path.join(inbox, d.name)); } catch (e) { continue; }
    for (const d of dirs) {
      let msgs = [], participantes = 0;
      for (const f of fs.readdirSync(d).filter(x => /^message_\d+\.json$/.test(x))) {
        try {
          const j = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));
          participantes = Math.max(participantes, (j.participants || []).length);
          for (const m of j.messages || []) msgs.push({ s: arreglar(m.sender_name), t: arreglar(m.content), ts: m.timestamp_ms, audio: !!m.audio_files, foto: !!m.photos, video: !!m.videos, share: !!m.share });
        } catch (e) { /* hilo ilegible: se omite */ }
      }
      if (!msgs.length) continue;
      msgs.sort((a, b) => a.ts - b.ts);
      for (const s of new Set(msgs.map(m => m.s))) conteo[s] = (conteo[s] || 0) + 1;
      hilos.push({ msgs, grupo: participantes > 2 });
    }
  }
  if (!hilos.length) return cache;
  const titular = Object.entries(conteo).sort((a, b) => b[1] - a[1])[0][0];
  const salida = [];
  for (const h of hilos) {
    if (h.grupo) continue;                                  // chats grupales: fuera
    const msgs = [];
    for (const m of h.msgs) {
      if (m.t && SISTEMA.test(m.t)) continue;
      const quien = m.s === titular ? 'gabriel' : 'cliente';
      const adj = m.audio ? 'audio' : m.foto ? 'image' : m.video ? 'video' : m.share ? 'share' : '';
      if (!m.t && !adj) continue;
      msgs.push({ quien, texto: m.t || '', ts: m.ts, adjunto: m.t ? '' : adj, pide: quien === 'cliente' && !!m.t && esPedido(m.t) });
    }
    if (msgs.some(m => m.quien === 'cliente')) salida.push({ msgs });
  }
  cache = { hilos: salida };
  return cache;
}

// Mensajes con datos personales (telefono, RUT, correo, enlaces, cifras largas): NUNCA entran a snapshots, semillas ni conteos.
function esDatoPersonal(texto) {
  const t = normalizarBasico(texto);
  const digitos = (t.match(/\d/g) || []).length;
  return digitos >= 6 || /@|https?:|www\./.test(t) || /\d{1,2}\.?\d{3}\.?\d{3}-?[\dk]/.test(t) || (t.length < 25 && digitos >= 3);
}

// Todos los mensajes de cliente con texto, con indicador de primer mensaje de su conversación.
function mensajesCliente() {
  const c = cargar();
  if (!c) return [];
  const out = [];
  for (const h of c.hilos) { let primero = true; for (const m of h.msgs) if (m.quien === 'cliente') { if (m.texto && !esDatoPersonal(m.texto)) out.push({ texto: m.texto, ts: m.ts, pide: m.pide, primero }); primero = false; } }
  return out;
}

module.exports = { cargar, mensajesCliente, esDatoPersonal, esPedido, arreglar, normalizarBasico };
