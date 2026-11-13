// Banco en español de Chile NO forzado (SPEC-004 extensión). Frases sintéticas generadas en chileno.gen.js a partir de
// patrones agregados de los DM reales (sin copiar mensajes). Uso: node --test infra/n8n/bot/cerebro.chileno.test.js
//  1) cada frase base x 5 variantes de ruido natural, con su intención esperada (contacto nuevo, 15:00);
//  2) una variante por frase x 5 horas x 4 estados (nuevo, Gabriel hace 5 min, Gabriel hace 11 min, ya recibió la respuesta);
//  3) ~60 conversaciones de 2-4 turnos con la secuencia esperada.
// Invariantes compartidas con el banco masivo (banco.util.js): 24/7, sin Calendly, un solo enlace, precios de la lista, largo.
const test = require('node:test');
const assert = require('node:assert');
const { decidir } = require('./cerebro.js');
const { crearConversacion, chileATimestamp } = require('./simulador.js');
const { MIN, H, LINKS, llamar, invariantesRespuesta } = require('./banco.util.js');
const { BASES, VARIANTES, CONVERSACIONES } = require('./chileno.gen.js');

const HORAS = ['03:00', '09:00', '14:00', '21:00', '23:30'];
const ok = (esperada, intencion) => [].concat(esperada).includes(intencion);
const stats = {};   // reconocido por familia: { ok, total }
test.after(() => {
  const filas = Object.entries(stats).map(([f, v]) => f + ' ' + Math.round(100 * v.ok / v.total) + '% (' + v.ok + '/' + v.total + ')');
  console.log('# reconocimiento chileno por familia: ' + filas.join(' · '));
});

// ---------------------------------------------------------------- 1) frase x variantes de ruido (intencion esperada)
BASES.forEach(b => {
  VARIANTES.forEach((v, k) => {
    const texto = v(b.texto);
    test(`[${b.fam}] v${k} "${texto.slice(0, 50)}" => ${[].concat(b.esperada).join('|')}`, () => {
      const ahora = chileATimestamp('2026-11-11', '15:00');
      const r = llamar({ texto }, null, ahora);
      const f = b.fam.replace(/_.*/, '');
      stats[f] = stats[f] || { ok: 0, total: 0 };
      stats[f].total++;
      if (ok(b.esperada, r.intencion)) stats[f].ok++;
      assert.ok(ok(b.esperada, r.intencion), 'intencion ' + r.intencion + ' en lugar de ' + [].concat(b.esperada).join('|'));
      invariantesRespuesta(r, { texto });
    });
  });
});

// ---------------------------------------------------------------- 2) frase x hora x estado (invariantes)
const ESTADOS = {
  nuevo: () => null,
  'Gabriel hace 5 min': ahora => ({ visto: ahora - H, gabriel: ahora - 5 * MIN, enviados: {}, bots: [] }),
  'Gabriel hace 11 min': ahora => ({ visto: ahora - H, gabriel: ahora - 11 * MIN, enviados: {}, bots: [] }),
  'ya recibio la respuesta hace 2 h': null
};
BASES.forEach((b, i) => {
  const k = i % VARIANTES.length;
  const texto = VARIANTES[k](b.texto);
  for (const hora of HORAS) {
    for (const [estado, armar] of Object.entries(ESTADOS)) {
      test(`[${b.fam}] "${texto.slice(0, 40)}" · ${hora} · ${estado}`, () => {
        const ahora = chileATimestamp('2026-11-11', hora);
        let previo, previaRespuesta = null;
        if (armar) previo = armar(ahora);
        else { const p = llamar({ texto }, null, ahora - 2 * H); previo = p.contacto; previaRespuesta = p.respuesta; }
        const r = llamar({ texto }, previo, ahora);
        invariantesRespuesta(r, { texto });
        if (estado === 'nuevo') assert.ok(ok(b.esperada, r.intencion), 'intencion ' + r.intencion);
        if (estado === 'Gabriel hace 5 min') assert.strictEqual(r.respuesta, null, 'Gabriel activo calla al bot');
        if (estado === 'Gabriel hace 11 min') {
          const sin = llamar({ texto }, Object.assign(armar(ahora), { gabriel: 0 }), ahora);
          assert.strictEqual(r.respuesta == null, sin.respuesta == null, 'pasados 10 min responde como siempre');
        }
        if (previaRespuesta && r.respuesta) assert.notStrictEqual(r.respuesta, previaRespuesta, 'repite la respuesta en 24 h');
        // 24/7: misma intencion y mismo silencio/respuesta a las 15:00 (salvo llegada, que de noche no promete bajar).
        if (estado === 'nuevo' && r.intencion !== 'llegada') {
          const t15 = llamar({ texto }, null, chileATimestamp('2026-11-11', '15:00'));
          assert.strictEqual(r.intencion, t15.intencion);
          assert.strictEqual(r.respuesta == null, t15.respuesta == null, 'de ' + hora + ' responde distinto que de dia');
        }
      });
    }
  }
});

// ---------------------------------------------------------------- 3) conversaciones cortas
for (const [nombre, pasos] of CONVERSACIONES) {
  for (const hora of ['03:00', '14:00', '23:30']) {
    test(`conversacion «${nombre}» · ${hora}`, () => {
      const conv = crearConversacion({ hora, fecha: '2026-11-11' });
      const noche = hora !== '14:00';
      for (const p of pasos) {
        if (p.w) { conv.esperar(p.w); continue; }
        if (p.g) { conv.gabriel(p.g); conv.esperar(1); continue; }
        const d = conv.cliente(p.c);
        invariantesRespuesta(d, { texto: p.c });
        if (p.int) assert.ok(ok(p.int, d.intencion), `"${p.c}": intencion ${d.intencion} en lugar de ${[].concat(p.int).join('|')}`);
        const debeResponder = p.resp === 'dia' ? !noche : p.resp === 'si';
        if (p.resp instanceof RegExp) assert.match(d.respuesta || '', p.resp, `"${p.c}"`);
        else if (p.resp !== undefined) assert.strictEqual(d.respuesta != null, debeResponder, `"${p.c}": ${debeResponder ? 'debia responder' : 'debia callar'}`);
        if (p.aviso) assert.strictEqual(d.aviso, p.aviso, `"${p.c}": aviso`);
        conv.esperar(1);
      }
    });
  }
}
