// Regresiones congeladas (bot/regresiones.json): fallos reales encontrados por el estres y por los revisores.
// Cada caso se prueba con contacto nuevo y con historial, a las 03:00 y a las 15:00.
const test = require('node:test');
const assert = require('node:assert');
const { decidir } = require('./cerebro.js');
const { chileATimestamp } = require('./simulador.js');
const { MIN, LINKS, invariantesRespuesta } = require('./banco.util.js');
const { casos } = require('./regresiones.json');

for (const c of casos) {
  for (const hora of ['03:00', '15:00']) {
    for (const estado of ['nuevo', 'previo']) {
      test(`regresion «${c.t}» · ${hora} · ${estado}`, () => {
        const ahora = chileATimestamp('2026-11-11', hora);
        const contacto = estado === 'nuevo' ? null : { visto: ahora - 30 * MIN, enviados: { formateo: ahora - 30 * MIN }, bots: [ahora - 30 * MIN], ultimoBot: ahora - 30 * MIN };
        const r = decidir(c.t, contacto, ahora, LINKS);
        const esperadas = estado === 'previo' && c.p ? c.p : c.n;
        assert.ok(esperadas.includes(r.intencion), `intencion ${r.intencion}, esperaba ${esperadas.join('|')}`);
        invariantesRespuesta(r, { texto: c.t });
        if (c.noNada) assert.ok(!r.respuesta || !/de nada/i.test(r.respuesta), 'respondio «De nada»');
        if (c.aviso) assert.strictEqual(r.aviso, c.aviso);
        if (c.oculto) assert.strictEqual(r.ocultar, true);
      });
    }
  }
}
