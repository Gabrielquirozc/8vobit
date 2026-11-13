// Simulador del bot de DM: prueba conversaciones sin cuenta de Instagram.
// Imita el pegamento de n8n (construir-flujo.js): la memoria del contacto pasa de turno a turno,
// el eco de Gabriel marca c.gabriel, y el último texto del bot queda en c.ultimoTexto.
// Uso interactivo: node infra/n8n/bot/simulador.js [--hora 23:30] [--fecha 2026-11-14]
// Uso con guion:   node infra/n8n/bot/simulador.js guion.json   (ver COBERTURA-BOT.md)
const { decidir, seguimientos } = require('./cerebro.js');

const MIN = 60e3;
const LINKS_POR_DEFECTO = { agenda: 'https://8vobit.xyz/#agendar', web: 'https://8vobit.xyz', pedidos: 'https://pedidos.8vobit.xyz' };

// Hora de Chile (verano UTC-3, invierno UTC-4) → timestamp. Se prueba con -3 y -4 y se queda con el que coincide.
function chileATimestamp(fecha, hora) {
  const [h, m] = String(hora || '12:00').split(':').map(Number);
  for (const off of [3, 4]) {
    const ts = Date.parse(fecha + 'T00:00:00Z') + ((h + off) * 60 + (m || 0)) * MIN;
    const real = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Santiago', hour: '2-digit', hourCycle: 'h23' }).format(new Date(ts)));
    if (real === h) return ts;
  }
  return Date.parse(fecha + 'T00:00:00Z') + ((h + 3) * 60 + (m || 0)) * MIN;
}

function etiquetaHora(ts) {
  return new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ts));
}

// opciones: { hora: '23:30', fecha: '2026-11-14', links, contacto (memoria inicial) }
function crearConversacion(opciones) {
  const o = opciones || {};
  let ahora = chileATimestamp(o.fecha || '2026-11-14', o.hora || '15:00');
  let contacto = o.contacto || null;
  const links = Object.assign({}, LINKS_POR_DEFECTO, o.links || {});
  const historial = [];

  const reg = (quien, texto, extra) => {
    const e = Object.assign({ quien, texto, ts: ahora, hora: etiquetaHora(ahora) }, extra || {});
    historial.push(e);
    return e;
  };

  return {
    historial,
    get ahora() { return ahora; },
    get contacto() { return contacto; },
    // Mensaje del cliente. extra: { payload, adjunto } (botón de respuesta rápida o tipo de adjunto sin texto).
    cliente(texto, extra) {
      const x = extra || {};
      const d = decidir(String(texto == null ? '' : texto), contacto, ahora, links, x.payload || '', x.adjunto || '');
      if (d.respuesta) d.contacto.ultimoTexto = d.respuesta;   // igual que n8n: sirve para distinguir el eco del bot del de Gabriel
      contacto = d.contacto;
      reg('cliente', String(texto), x.adjunto ? { adjunto: x.adjunto } : {});
      reg('bot', d.respuesta, { intencion: d.intencion, aviso: d.aviso, botones: (d.botones || []).map(b => b.titulo) });
      return d;
    },
    // Gabriel responde a mano desde la cuenta: el eco no es el último texto del bot → c.gabriel = ahora.
    gabriel(texto) {
      const c = contacto || {};
      if (typeof texto !== 'string' || texto !== c.ultimoTexto) c.gabriel = ahora;
      contacto = c;
      reg('gabriel', texto);
    },
    // Corre el cron de seguimientos (el nodo "Seguimientos" de n8n, cada 15 min) con este contacto y el reloj actual.
    // Igual que en n8n, el cerebro deja el texto enviado en contacto.ultimoTexto (eco propio del bot).
    cron() {
      if (!contacto) return [];
      const memoria = { sim: contacto };
      const envios = seguimientos(memoria, ahora, links);
      contacto = memoria.sim;
      for (const e of envios) reg('bot', e.texto, { intencion: e.intencion, aviso: null, botones: [] });
      return envios;
    },
    esperar(minutos) { ahora += minutos * MIN; },
    irA(hora, fecha) {
      const d = fecha || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date(ahora));
      ahora = chileATimestamp(d, hora);
    },
    imprimir() { return historial.map(imprimirEntrada).join('\n'); }
  };
}

function imprimirEntrada(e) {
  if (e.quien === 'cliente') return `[${e.hora}] CLIENTE${e.adjunto ? ' (adjunto ' + e.adjunto + ')' : ''}: ${e.texto}`;
  if (e.quien === 'gabriel') return `[${e.hora}] GABRIEL: ${e.texto}`;
  return `[${e.hora}] BOT (${e.intencion}${e.aviso ? ', aviso ' + e.aviso : ''}): ${e.texto == null ? '(silencio)' : e.texto}`;
}

// Guion: [{ hora, fecha }, { cliente: '...', payload?, adjunto? }, { gabriel: '...' }, { esperar: 10 }, { hora: '23:30' }, { cron: true }, { espera: ... }]
// Un paso puede traer `espera` (en texto, regex) para comprobar la respuesta del bot: { cliente: 'hola', espera: 'hola' | null }
function correrGuion(pasos, opciones) {
  const conv = crearConversacion(opciones);
  const fallos = [];
  for (const p of pasos) {
    if (p.hora) conv.irA(p.hora, p.fecha);
    if (p.esperar) conv.esperar(p.esperar);
    if (p.cron) conv.cron();
    if (p.gabriel != null) conv.gabriel(p.gabriel);
    if (p.cliente != null) {
      const d = conv.cliente(p.cliente, { payload: p.payload, adjunto: p.adjunto });
      if ('espera' in p) {
        const ok = p.espera === null ? d.respuesta === null : new RegExp(p.espera, 'i').test(d.respuesta || '');
        if (!ok) fallos.push(`"${p.cliente}": esperaba ${p.espera === null ? 'silencio' : '/' + p.espera + '/'} y el bot dijo ${d.respuesta == null ? 'nada' : JSON.stringify(d.respuesta.slice(0, 80))}`);
      }
    }
  }
  return { conv, fallos };
}

function interactivo(argv) {
  const readline = require('readline');
  const arg = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const conv = crearConversacion({ hora: arg('--hora'), fecha: arg('--fecha') });
  console.log('Simulador del bot. Escribe como cliente. Comandos: /g texto (Gabriel responde) · /+10m o /+2h (avanza el reloj) · /hora 23:30 · /cron (seguimientos) · /memoria · /salir');
  console.log('Reloj: ' + etiquetaHora(conv.ahora));
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'cliente> ' });
  rl.prompt();
  rl.on('line', linea => {
    const t = linea.trim();
    let m;
    if (t === '/salir') return rl.close();
    else if (t.startsWith('/g ')) { conv.gabriel(t.slice(3)); console.log('  (Gabriel respondió; el bot se calla 10 min)'); }
    else if ((m = t.match(/^\/\+(\d+)(m|h)$/))) { conv.esperar(Number(m[1]) * (m[2] === 'h' ? 60 : 1)); console.log('  Reloj: ' + etiquetaHora(conv.ahora)); }
    else if ((m = t.match(/^\/hora (\d{1,2}:\d{2})$/))) { conv.irA(m[1]); console.log('  Reloj: ' + etiquetaHora(conv.ahora)); }
    else if (t === '/cron') { const e = conv.cron(); console.log(e.length ? e.map(x => '  SEGUIMIENTO [' + x.intencion + ']: ' + x.texto).join(String.fromCharCode(10)) : '  (el cron no envia nada ahora)'); }
    else if (t === '/memoria') console.log(JSON.stringify(conv.contacto, null, 1));
    else if (t) {
      const d = conv.cliente(t);
      console.log(`  BOT [${d.intencion}${d.aviso ? ' · aviso ' + d.aviso : ''}]: ${d.respuesta == null ? '(silencio)' : d.respuesta}`);
      if (d.botones && d.botones.length) console.log('  botones: ' + d.botones.map(b => b.titulo).join(' | '));
    }
    rl.prompt();
  });
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const archivo = argv.find(a => /\.(json|js)$/i.test(a));
  if (archivo) {
    const path = require('path');
    const pasos = require(path.resolve(archivo));
    const { conv, fallos } = correrGuion(Array.isArray(pasos) ? pasos : pasos.pasos);
    console.log(conv.imprimir());
    if (fallos.length) { console.log('\nFALLOS:\n' + fallos.join('\n')); process.exitCode = 1; }
  } else interactivo(argv);
}

module.exports = { crearConversacion, correrGuion, chileATimestamp, etiquetaHora };
