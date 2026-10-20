// Mensajes del pedido: el cliente escribe desde el seguimiento y el local responde desde la tarjeta
// del pedido en el panel. No es un chat general: solo sobre ese pedido, y se cierra al entregarlo o
// anularlo. No depende de WhatsApp ni de ningún servicio de mensajería pagado.

export const MAX_TEXTO = 300;
export const MAX_POR_PEDIDO = 40;
const CERRADO = new Set(['entregado', 'anulado']);

export function crearMensajes(db) {
  db.exec(`
CREATE TABLE IF NOT EXISTS pedido_mensajes (
  id INTEGER PRIMARY KEY, pedido_id INTEGER NOT NULL REFERENCES pedidos(id),
  de TEXT NOT NULL CHECK (de IN ('cliente','local')), texto TEXT NOT NULL, autor TEXT,
  leido INTEGER NOT NULL DEFAULT 0, creado TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE INDEX IF NOT EXISTS pedido_mensajes_pedido ON pedido_mensajes(pedido_id);`);

  const abierto = (p) => !CERRADO.has(p.estado);
  const de = (pid) => db.prepare('SELECT id, de, texto, autor, creado FROM pedido_mensajes WHERE pedido_id=? ORDER BY id').all(pid);
  const sinLeer = (pid) => db.prepare("SELECT COUNT(*) n FROM pedido_mensajes WHERE pedido_id=? AND de='cliente' AND leido=0").get(pid).n;

  function escribir(p, quien, texto, autor = null) {
    if (!abierto(p)) return { error: 'Este pedido ya terminó: los mensajes están cerrados.', status: 409 };
    const t = String(texto ?? '').replace(/\s+/g, ' ').trim();
    if (!t) return { error: 'Escribe el mensaje.' };
    if (t.length > MAX_TEXTO) return { error: `El mensaje puede tener hasta ${MAX_TEXTO} caracteres.` };
    if (db.prepare('SELECT COUNT(*) n FROM pedido_mensajes WHERE pedido_id=?').get(p.id).n >= MAX_POR_PEDIDO)
      return { error: 'Este pedido ya tiene muchos mensajes. Llama al local.', status: 429 };
    db.prepare('INSERT INTO pedido_mensajes (pedido_id, de, texto, autor) VALUES (?,?,?,?)').run(p.id, quien, t, autor);
    // Si el local responde, se da por leído lo que escribió el cliente.
    if (quien === 'local') leer(p.id);
    return { ok: true };
  }
  const leer = (pid) => { db.prepare("UPDATE pedido_mensajes SET leido=1 WHERE pedido_id=? AND de='cliente' AND leido=0").run(pid); };

  // Lo que ve el cliente: sin el nombre de quién del local respondió.
  const paraCliente = (p) => ({ abierto: abierto(p), lista: de(p.id).map((m) => ({ id: m.id, de: m.de, texto: m.texto, creado: m.creado })) });

  return { abierto, de, sinLeer, escribir, leer, paraCliente };
}
