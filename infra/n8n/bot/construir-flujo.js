// Arma infra/n8n/flujo-dm-instagram.json incrustando bot/cerebro.js en el nodo Code.
// Uso: node infra/n8n/bot/construir-flujo.js   (después: importar el JSON en n8n)
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const archivo = path.join(raiz, 'flujo-dm-instagram.json');
const flujo = JSON.parse(fs.readFileSync(archivo, 'utf8'));
const cerebro = fs.readFileSync(path.join(__dirname, 'cerebro.js'), 'utf8').split('/* FIN-CEREBRO */')[0];

const pegamento = `
// ---- Pegamento n8n: firma de Meta, memoria por contacto y salida ----
const crypto = require('crypto');
const memoria = $getWorkflowStaticData('global');
memoria.contactos = memoria.contactos || {};
const links = { agenda: $env.LINK_AGENDA, web: $env.LINK_WEB, pedidos: $env.LINK_PEDIDOS };
const ahora = Date.now();

// Olvidar contactos sin movimiento en 60 días (la memoria vive dentro de n8n).
for (const [id, c] of Object.entries(memoria.contactos)) {
  if (ahora - (c.visto || c.gabriel || 0) > 60 * DIA) delete memoria.contactos[id];
}

const salida = [];
for (const item of $input.all()) {
  const headers = item.json.headers || {};
  const firma = String(headers['x-hub-signature-256'] || '');
  const crudo = item.binary && item.binary.data
    ? Buffer.from(item.binary.data.data, 'base64')
    : Buffer.from(JSON.stringify(item.json.body || {}));
  const esperada = 'sha256=' + crypto.createHmac('sha256', $env.IG_APP_SECRET || '').update(crudo).digest('hex');
  if (firma.length !== esperada.length || !crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))) continue;

  for (const entry of (item.json.body || {}).entry || []) {
    for (const ev of entry.messaging || []) {
      const msg = ev.message;
      if (!msg) continue;
      if (msg.is_echo) {
        // Mensaje enviado desde la cuenta: si no es el último texto del bot, lo escribió Gabriel.
        const cliente = ev.recipient && ev.recipient.id;
        const c = memoria.contactos[cliente] || {};
        if (typeof msg.text !== 'string' || msg.text !== c.ultimoTexto) {
          c.gabriel = ahora;
          memoria.contactos[cliente] = c;
        }
        continue;
      }
      const remitente = ev.sender && ev.sender.id;
      if (!remitente) continue;
      const texto = typeof msg.text === 'string' ? msg.text : (msg.attachments ? '[adjunto]' : '');
      const d = decidir(texto === '[adjunto]' ? '' : texto, memoria.contactos[remitente], ahora, links);
      if (d.respuesta) d.contacto.ultimoTexto = d.respuesta;
      memoria.contactos[remitente] = d.contacto;
      if (!d.respuesta && !d.aviso) continue;
      salida.push({ json: {
        remitente,
        intencion: d.intencion,
        texto: texto.slice(0, 300),
        respuesta: d.respuesta,
        aviso: d.aviso,
        prioridad: d.aviso === 'urgente' ? '5' : '3',
        // Pausa "humana": más larga si la respuesta es más larga (6 a 25 s).
        pausa: d.respuesta ? Math.min(25, 6 + Math.round(d.respuesta.length / 15)) : 0
      } });
    }
  }
}
return salida;
`;

const graph = 'https://graph.instagram.com/v21.0/me/messages';
const auth = { parameters: [{ name: 'Authorization', value: '={{ "Bearer " + $env.IG_ACCESS_TOKEN }}' }] };
const fijos = flujo.nodes.filter(n => ['a1', 'a2', 'b1'].includes(n.id));

flujo.id = 'GOhImTsPA0GizMPu'; // mismo ID: al importar reemplaza el flujo que ya está en n8n
flujo.name = 'DM Instagram · bot 8vobit';
flujo.nodes = [
  ...fijos,
  { id: 'b2', name: 'Verificar firma y decidir', type: 'n8n-nodes-base.code', typeVersion: 2, position: [240, 240],
    parameters: { jsCode: cerebro + pegamento } },
  { id: 'b3', name: '¿Hay respuesta?', type: 'n8n-nodes-base.filter', typeVersion: 2, position: [480, 160],
    parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'loose' }, combinator: 'and',
      conditions: [{ id: 'r1', leftValue: '={{ $json.respuesta }}', rightValue: '', operator: { type: 'string', operation: 'notEmpty', singleValue: true } }] }, options: {} } },
  { id: 'b4', name: 'Escribiendo…', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [720, 160], onError: 'continueRegularOutput',
    parameters: { method: 'POST', url: graph, sendHeaders: true, headerParameters: auth, sendBody: true, specifyBody: 'json',
      jsonBody: '={{ JSON.stringify({ recipient: { id: $json.remitente }, sender_action: "typing_on" }) }}', options: {} } },
  { id: 'b5', name: 'Pausa humana', type: 'n8n-nodes-base.wait', typeVersion: 1.1, position: [960, 160], webhookId: '8vobit-pausa',
    parameters: { amount: "={{ $('¿Hay respuesta?').item.json.pausa }}" } },
  { id: 'b6', name: 'Responder DM', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1200, 160],
    parameters: { method: 'POST', url: graph, sendHeaders: true, headerParameters: auth, sendBody: true, specifyBody: 'json',
      jsonBody: "={{ JSON.stringify({ recipient: { id: $('¿Hay respuesta?').item.json.remitente }, message: { text: $('¿Hay respuesta?').item.json.respuesta } }) }}", options: {} } },
  { id: 'b7', name: '¿Hay que avisar?', type: 'n8n-nodes-base.filter', typeVersion: 2, position: [480, 360],
    parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'loose' }, combinator: 'and',
      conditions: [{ id: 'v1', leftValue: '={{ $json.aviso }}', rightValue: '', operator: { type: 'string', operation: 'notEmpty', singleValue: true } }] }, options: {} } },
  { id: 'b8', name: 'Avisar por ntfy', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [720, 360],
    parameters: { method: 'POST', url: '={{ $env.NTFY_URL }}', sendHeaders: true,
      headerParameters: { parameters: [
        { name: 'Title', value: "={{ ($json.aviso === 'urgente' ? '🚨 ' : '') + 'DM Instagram: ' + $json.intencion }}" },
        { name: 'Priority', value: '={{ $json.prioridad }}' },
        { name: 'Tags', value: 'speech_balloon' }
      ] },
      sendBody: true, contentType: 'raw', rawContentType: 'text/plain',
      body: "={{ $json.texto + ($json.respuesta ? '\\n\\nBot: ' + $json.respuesta : '\\n\\n(el bot no respondió)') }}", options: {} } }
];
flujo.connections = {
  'Verificación Meta (GET)': { main: [[{ node: 'Devolver challenge', type: 'main', index: 0 }]] },
  'Mensajes Instagram (POST)': { main: [[{ node: 'Verificar firma y decidir', type: 'main', index: 0 }]] },
  'Verificar firma y decidir': { main: [[
    { node: '¿Hay respuesta?', type: 'main', index: 0 },
    { node: '¿Hay que avisar?', type: 'main', index: 0 }
  ]] },
  '¿Hay respuesta?': { main: [[{ node: 'Escribiendo…', type: 'main', index: 0 }]] },
  'Escribiendo…': { main: [[{ node: 'Pausa humana', type: 'main', index: 0 }]] },
  'Pausa humana': { main: [[{ node: 'Responder DM', type: 'main', index: 0 }]] },
  '¿Hay que avisar?': { main: [[{ node: 'Avisar por ntfy', type: 'main', index: 0 }]] }
};

fs.writeFileSync(archivo, JSON.stringify(flujo, null, 2) + '\n');
console.log('Listo:', archivo, '·', flujo.nodes.length, 'nodos');
