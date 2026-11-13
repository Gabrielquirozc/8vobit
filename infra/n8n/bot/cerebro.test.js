// Pruebas del cerebro: node --test infra/n8n/bot/
const test = require('node:test');
const assert = require('node:assert');
const { decidir } = require('./cerebro.js');

const links = { agenda: 'https://agenda.test', web: 'https://web.test', pedidos: 'https://pedidos.test' };
const tarde = Date.parse('2026-10-15T18:00:00Z');   // 15:00 en Chile
const noche = Date.parse('2026-10-16T03:00:00Z');   // 00:00 en Chile
const H = 3600 * 1000;

test('saludo de alguien nuevo: bienvenida; el segundo saludo no se responde', () => {
  const a = decidir('Holaa', null, tarde, links);
  assert.match(a.respuesta, /hola/i);
  const b = decidir('hola?', a.contacto, tarde + 60e3, links);
  assert.strictEqual(b.respuesta, null);
});

test('palabra clave AGENDA de los carruseles: abre el flujo de pagina + agenda, no el link del taller', () => {
  for (const s of ['AGENDA', 'Agenda!', 'agenda']) {
    const r = decidir(s, null, tarde, links);
    assert.strictEqual(r.intencion, 'web_inicio', s);
    assert.doesNotMatch(r.respuesta, /agenda\.test/, s);
  }
  // Pedir hora para el taller sigue yendo al link de agenda.
  assert.strictEqual(decidir('quiero agendar una hora', null, tarde, links).intencion, 'agendar');
});

test('palabra clave REVISIÓN de los carruseles de reparación: diagnóstico y link del taller', () => {
  for (const s of ['REVISIÓN', 'Revision!', 'revisión', 'quiero una revisión']) {
    const r = decidir(s, null, tarde, links);
    assert.strictEqual(r.intencion, 'revision', s);
    assert.match(r.respuesta, /\$5\.000/, s);
    assert.match(r.respuesta, /agenda\.test/, s);
  }
  // "Revisión" dentro de otra frase no la secuestra: manda el servicio concreto.
  assert.strictEqual(decidir('me puedes hacer revisión de la pantalla?', null, tarde, links).intencion, 'pantalla');
});

test('cierre de AGENDA en el flujo web: muestra la agenda, sin precio ni Meet de 45 min', () => {
  let r = decidir('AGENDA', null, tarde, links);
  r = decidir('kinesióloga', r.contacto, tarde + 1e3, links);
  r = decidir('sí', r.contacto, tarde + 2e3, links);
  r = decidir('por whatsapp', r.contacto, tarde + 3e3, links);
  assert.strictEqual(r.intencion, 'web_mostrar');
  assert.match(r.respuesta, /8vobit\.xyz\/#agendar/);
  assert.doesNotMatch(r.respuesta, /\$|190|14\.990|45 min|Meet/);
  r = decidir('dale', r.contacto, tarde + 4e3, links);
  assert.strictEqual(r.intencion, 'web_llamada');
  assert.match(r.respuesta, /8vobit\.xyz\/#reunion/);
  assert.doesNotMatch(r.respuesta, /45 min|Meet/);
});

test('precio de formateo con un contacto nuevo: precio y link de agenda', () => {
  const r = decidir('Hola, cuánto sale formatear un notebook?', null, tarde, links);
  assert.strictEqual(r.intencion, 'formateo');
  assert.match(r.respuesta, /\$15\.000/);
  assert.match(r.respuesta, /agenda\.test/);
});

test('llegada: respuesta y aviso urgente', () => {
  const r = decidir('Llegué, estoy abajo', { visto: tarde - H }, tarde, links);
  assert.strictEqual(r.intencion, 'llegada');
  assert.strictEqual(r.aviso, 'urgente');
  assert.match(r.respuesta, /baj/i);
});

test('si Gabriel está conversando, el bot se calla pero avisa', () => {
  const r = decidir('llegué', { visto: tarde - H, gabriel: tarde - 2 * H }, tarde, links);
  assert.strictEqual(r.respuesta, null);
  assert.strictEqual(r.aviso, 'urgente');
});

test('de noche: avisa que responde mañana, una sola vez', () => {
  const a = decidir('hola', null, noche, links);
  assert.match(a.respuesta, /mañana/);
  const b = decidir('alguien?', a.contacto, noche + 10 * 60e3, links);
  assert.strictEqual(b.respuesta, null);
});

test('de noche no promete bajar al lobby', () => {
  const r = decidir('estoy afuera', { visto: noche - H }, noche, links);
  assert.strictEqual(r.respuesta === null || !/baj/i.test(r.respuesta), true);
  assert.strictEqual(r.aviso, 'urgente');
});

test('spam: no responde ni avisa', () => {
  const r = decidir('Watch my private video https://x.app.link/abc', null, tarde, links);
  assert.strictEqual(r.respuesta, null);
  assert.strictEqual(r.aviso, null);
});

test('conversación en curso: las consultas las sigue Gabriel', () => {
  const r = decidir('y cuánto sería el arreglo?', { visto: tarde - 3 * H }, tarde, links);
  assert.strictEqual(r.respuesta, null);
});

test('"ya agendé" no se responde', () => {
  const r = decidir('Agendé para el lunes a las 10', null, tarde, links);
  assert.strictEqual(r.respuesta, null);
});

test('no repite la misma respuesta en 24 h', () => {
  const a = decidir('dónde están ubicados?', null, tarde, links);
  assert.ok(a.respuesta);
  const b = decidir('cuál es la dirección?', a.contacto, tarde + 3 * H, links);
  assert.strictEqual(b.respuesta, null);
});

test('teclado: dice que no se hace', () => {
  const r = decidir('cuánto sale cambiar el teclado de mi note', null, tarde, links);
  assert.match(r.respuesta, /no estamos haciendo/);
});

test('DEMO inicia el flujo web directo en pedidos', () => {
  const r = decidir('DEMO', null, tarde, links);
  assert.strictEqual(r.intencion, 'web_inicio');
  assert.match(r.respuesta, /a qué se dedica/i);
  assert.strictEqual(r.contacto.web.eleccion, 'PEDIDOS');
});

test('flujo de Pedidos (DEMO) completo con botones: caliente → Gassuso, reunión y aviso urgente', () => {
  let r = decidir('DEMO', null, tarde, links);
  assert.strictEqual(r.contacto.web.eleccion, 'PEDIDOS');
  assert.match(r.respuesta, /a qué se dedica/i);
  r = decidir('Sushi en Lomas', r.contacto, tarde + 120e3, links);
  assert.strictEqual(r.botones.length, 3);
  r = decidir('Por apps de delivery', r.contacto, tarde + 180e3, links, 'H_APPS');
  assert.strictEqual(r.botones.length, 3);
  r = decidir('Este mes', r.contacto, tarde + 240e3, links, 'C_MES');
  assert.strictEqual(r.intencion, 'web_cierre');
  assert.match(r.respuesta, /gassuso/);
  assert.match(r.respuesta, /#reunion/);
  assert.strictEqual(r.aviso, 'urgente');
  assert.match(r.resumen, /Sushi en Lomas/);
  assert.strictEqual(r.contacto.web, null);
});

test('flujo web: solo mirando termina en «ahora no» con aviso normal (ejemplo 9)', () => {
  let r = decidir('página web', null, tarde, links);
  r = decidir('tengo una barbería', r.contacto, tarde + 1e3, links);
  r = decidir('sí', r.contacto, tarde + 2e3, links);
  r = decidir('otra app', r.contacto, tarde + 3e3, links);
  assert.strictEqual(r.intencion, 'web_mostrar');
  r = decidir('ahora no', r.contacto, tarde + 4e3, links);
  assert.strictEqual(r.intencion, 'web_ahora_no');
  assert.strictEqual(r.aviso, 'normal');
  assert.match(r.respuesta, /LLAMADA/);
});

test('flujo web: "hablar" pasa a Gabriel en cualquier paso', () => {
  let r = decidir('', null, tarde, links, 'MENU_WEB');
  r = decidir('prefiero hablar con alguien', r.contacto, tarde + 1e3, links);
  assert.strictEqual(r.intencion, 'web_humano');
  assert.strictEqual(r.aviso, 'urgente');
});

test('bienvenida ofrece el menú Reparación / Desarrollo web', () => {
  const r = decidir('hola', null, tarde, links);
  assert.deepStrictEqual(r.botones.map(b => b.payload), ['MENU_REP', 'MENU_WEB']);
});

test('si Gabriel está conversando, el flujo web no arranca', () => {
  const r = decidir('DEMO', { visto: tarde - 3 * H, gabriel: tarde - H }, tarde, links);
  assert.strictEqual(r.respuesta, null);
});

// ---------------------------------------------------------------------------
// Memoria (sección B) y modo fuera de Concepción (sección A) de DIALOGOS-BOT-V2.
// ---------------------------------------------------------------------------
const { modoFuera } = require('./cerebro.js');
const linksFuera = Object.assign({ fuera: '2026-10-18' }, links);   // domingo 18 → vuelta lunes 19
const MIN = 60e3;

test('modoFuera: deriva «lunes 19» y «domingo» de la fecha; vacío, inválida o pasada = apagado', () => {
  assert.deepStrictEqual(modoFuera(linksFuera, tarde), { vuelta: 'lunes 19', hasta: 'domingo' });
  assert.deepStrictEqual(modoFuera({ fuera: '2026-11-15' }, tarde), { vuelta: 'lunes 16', hasta: 'domingo' });
  assert.strictEqual(modoFuera({ fuera: '' }, tarde), null);
  assert.strictEqual(modoFuera({}, tarde), null);
  assert.strictEqual(modoFuera({ fuera: '2026-13-45' }, tarde), null);
  assert.strictEqual(modoFuera({ fuera: 'mañana' }, tarde), null);
  assert.strictEqual(modoFuera({ fuera: '2026-10-14' }, tarde), null);
  assert.ok(modoFuera({ fuera: '2026-10-15' }, tarde));            // el último día todavía cuenta
});

test('banco 13: error de memoria → MEM-S, nunca cotización de RAM', () => {
  const r = decidir('me sale error de memoria', null, tarde, links);
  assert.strictEqual(r.intencion, 'memoria_sintoma');
  assert.match(r.respuesta, /no siempre es la RAM|no significa que haya que cambiar la RAM/);
  assert.doesNotMatch(r.respuesta, /\$10\.000/);
  assert.strictEqual(r.aviso, 'normal');
  assert.match(r.resumen, /Síntoma de memoria/);
});

test('banco 14: demora en prender + ampliar memoria → MEM-D2 directo', () => {
  const r = decidir('demora 20 minutos en prender y quiero ampliar la memoria', null, tarde, links);
  assert.strictEqual(r.intencion, 'mem_d2');
  assert.match(r.respuesta, /\$5\.000/);
  assert.match(r.respuesta, /agenda\.test/);
  assert.strictEqual(r.contacto.pend, undefined);
});

test('banco 15: necesito ram ddr4 → RAM-1 → ideapad 3 → RAM-1a', () => {
  let r = decidir('necesito ram ddr4', null, tarde, links);
  assert.strictEqual(r.intencion, 'upgrade_ram');
  assert.strictEqual(r.contacto.pend.q, 'RAM-1');
  assert.deepStrictEqual(r.botones.map(b => b.titulo), ['Cotizar', 'Diagnóstico']);
  r = decidir('ideapad 3', r.contacto, tarde + MIN, links);
  assert.strictEqual(r.intencion, 'ram_1a');
  assert.match(r.respuesta, /\$10\.000/);
  assert.strictEqual(r.contacto.pend.q, 'MODELO');       // pidió el modelo: «no sé» o una foto lo contestan
  // También un modelo con letras y números juntos.
  let q = decidir('quiero ram ddr4', null, tarde, links);
  q = decidir('ideapad 3 15itl6', q.contacto, tarde + MIN, links);
  assert.strictEqual(q.intencion, 'ram_1a');
});

test('RAM-1: «2» → RAM-1b con link de agenda', () => {
  let r = decidir('quiero ponerle ram', null, tarde, links);
  r = decidir('2', r.contacto, tarde + MIN, links);
  assert.strictEqual(r.intencion, 'ram_1b');
  assert.match(r.respuesta, /agenda\.test/);
});

test('banco 16: la ram la compro yo con crédito → MEM-P', () => {
  const r = decidir('la ram la compro yo con credito', null, tarde, links);
  assert.strictEqual(r.intencion, 'mem_pieza');
  assert.match(r.respuesta, /no compres una que no calce/);
  const y = decidir('ya compré la ram', null, tarde, links);
  assert.strictEqual(y.intencion, 'mem_pieza_ya');
  assert.match(y.respuesta, /compatibles/);
});

test('MEM-C: «no sé si a mi notebook se le puede hacer eso»', () => {
  const r = decidir('no se si a mi notebook se le puede hacer eso', null, tarde, links);
  assert.strictEqual(r.intencion, 'mem_compat');
  assert.match(r.respuesta, /soldada/);
});

test('MEM-M: «me da miedo hacerlo yo»', () => {
  const r = decidir('me da miedo hacerlo yo', null, tarde, links);
  assert.strictEqual(r.intencion, 'mem_miedo');
  assert.match(r.respuesta, /agenda\.test/);
});

test('SSD y disco sin «memoria» conservan la respuesta de SSD', () => {
  for (const s of ['cuanto sale un ssd', 'quiero cambiar el disco', 'necesito más almacenamiento']) {
    const r = decidir(s, null, tarde, links);
    assert.strictEqual(r.intencion, 'ssd', s);
    assert.match(r.respuesta, /\$15\.000/, s);
  }
});

test('MEM-D → «1» → MEM-D1 (SSD)', () => {
  let r = decidir('quiero aumentar la memoria', null, tarde, links);
  assert.strictEqual(r.intencion, 'memoria_duda');
  assert.match(r.respuesta, /1️⃣/);
  assert.deepStrictEqual(r.botones.map(b => b.payload), ['MEMD_1', 'MEMD_2']);
  r = decidir('1', r.contacto, tarde + MIN, links);
  assert.strictEqual(r.intencion, 'mem_d1');
  assert.match(r.respuesta, /SSD/);
  assert.match(r.resumen, /Quiere SSD/);
});

test('MEM-D → botón «Se pone lento» (payload) → MEM-D2', () => {
  let r = decidir('tengo poca memoria', null, tarde, links);
  r = decidir('Se pone lento', r.contacto, tarde + MIN, links, 'MEMD_2');
  assert.strictEqual(r.intencion, 'mem_d2');
});

test('MEM-D → «se pega con el chrome» → MEM-D2', () => {
  let r = decidir('tengo poca memoria', null, tarde, links);
  r = decidir('se pega con el chrome', r.contacto, tarde + MIN, links);
  assert.strictEqual(r.intencion, 'mem_d2');
  assert.match(r.respuesta, /\$5\.000/);
});

test('MEM-D → «ya» → repregunta → «no sé» → SAL-5 sin contar fallo', () => {
  let r = decidir('más memoria', null, tarde, links);
  r = decidir('ya', r.contacto, tarde + MIN, links);
  assert.strictEqual(r.intencion, 'pend_repite');
  assert.match(r.respuesta, /no te entendí/);
  assert.strictEqual(r.contacto.pend.intentos, 1);
  r = decidir('no sé', r.contacto, tarde + 2 * MIN, links);
  assert.strictEqual(r.intencion, 'sal5');
  assert.match(r.respuesta, /para eso está el diagnóstico/);   // SAL-5 «qué le pasa»
  assert.notStrictEqual(r.aviso, 'urgente');
});

test('MEM-D con dos fallos → SAL-2 y aviso urgente; de noche agrega «mañana desde las 9»', () => {
  let r = decidir('más memoria', null, tarde, links);
  r = decidir('ya', r.contacto, tarde + MIN, links);
  r = decidir('hmm quizás depende', r.contacto, tarde + 2 * MIN, links);
  assert.strictEqual(r.intencion, 'sal2');
  assert.strictEqual(r.aviso, 'urgente');
  assert.match(r.respuesta, /Mejor lo ve Gabriel/);
  assert.doesNotMatch(r.respuesta, /mañana desde las 9/);
  assert.strictEqual(r.contacto.pend, null);
  let n = decidir('ampliar memoria', null, noche - 2 * H, links);
  n = decidir('ya', n.contacto, noche - H, links);
  n = decidir('ok', n.contacto, noche, links);
  assert.strictEqual(n.intencion, 'sal2');
  assert.match(n.respuesta, /Te contesta mañana desde las 9/);
});

test('MEM-D: «jaja» no cuenta como intento fallido', () => {
  let r = decidir('poca memoria', null, tarde, links);
  r = decidir('jajaja', r.contacto, tarde + MIN, links);
  assert.strictEqual(r.respuesta, null);
  assert.strictEqual(r.contacto.pend.intentos, 0);
});

test('respuesta a pregunta pendiente dentro de 48 h no queda silenciada; sin pendiente, sí', () => {
  // El contacto ya tenía conversación hace 3 h (enCurso) y el bot le hizo la pregunta.
  const c = { visto: tarde - 3 * H, enviados: { memoria_duda: tarde - 2 * H }, bots: [], pend: { q: 'MEM-D', t: tarde - 2 * H, intentos: 0 } };
  const r = decidir('1', c, tarde, links);
  assert.strictEqual(r.intencion, 'mem_d1');
  assert.ok(r.respuesta);
  // La repregunta tampoco la frena el «no repetir en 24 h».
  const rep = decidir('ya', Object.assign({}, c, { enviados: { memoria_duda: tarde - 2 * H, rep_mem_d: tarde - H } }), tarde, links);
  assert.strictEqual(rep.intencion, 'pend_repite');
  assert.ok(rep.respuesta);
  // Sin pregunta pendiente, la consulta sigue siendo de Gabriel.
  assert.strictEqual(decidir('1', { visto: tarde - 3 * H }, tarde, links).respuesta, null);
  // Pendiente vencida (más de 24 h): no se interpreta.
  const v = decidir('1', { visto: tarde - 30 * H, pend: { q: 'MEM-D', t: tarde - 30 * H, intentos: 0 } }, tarde, links);
  assert.strictEqual(v.respuesta, null);
});

test('pregunta pendiente: la logística manda y Gabriel activo calla al bot', () => {
  const c = { visto: tarde - H, pend: { q: 'MEM-D', t: tarde - H, intentos: 0 } };
  const l = decidir('llegué, estoy abajo', c, tarde, links);
  assert.strictEqual(l.intencion, 'llegada');
  assert.strictEqual(l.contacto.pend, null);
  const g = decidir('1', Object.assign({ gabriel: tarde - H }, c), tarde, links);
  assert.strictEqual(g.respuesta, null);
});

test('banco 24: modo fuera activo, «estoy afuera» → FUERA-3 urgente, nunca «voy bajando»', () => {
  const r = decidir('estoy afuera', { visto: tarde - H }, tarde, linksFuera);
  assert.strictEqual(r.aviso, 'urgente');
  assert.match(r.respuesta, /fuera de Concepción|no estamos en Concepción/);
  assert.doesNotMatch(r.respuesta, /baj/i);
  assert.match(r.resumen, /Llegó alguien y estás fuera/);
  // También de noche: avisa en vez de callarse.
  const n = decidir('estoy afuera', { visto: noche - H }, noche, linksFuera);
  assert.match(n.respuesta, /no estamos en Concepción/);
  assert.match(n.respuesta, /mañana desde las 9/);
  assert.doesNotMatch(n.respuesta, /baj|ahora/i);
  assert.strictEqual(n.aviso, 'urgente');
});

test('banco 25: modo fuera activo, «ya lo dejé en portería» → FUERA-4 + aviso urgente', () => {
  for (const s of ['ya lo deje en porteria', 'lo dejo en portería', 'voy a dejarlo', 'voy en camino', 'voy para allá']) {
    const r = decidir(s, { visto: tarde - H }, tarde, linksFuera);
    assert.strictEqual(r.intencion, 'fuera_porteria', s);
    assert.strictEqual(r.aviso, 'urgente', s);
    assert.match(r.respuesta, /lunes 19/, s);
    assert.match(r.resumen, /portería/, s);
  }
  // Con el modo apagado, esas frases no activan nada nuevo.
  assert.notStrictEqual(decidir('ya lo deje en porteria', { visto: tarde - H }, tarde, links).intencion, 'fuera_porteria');
});

test('banco 26: modo fuera + AGENDA → flujo web sin aviso', () => {
  const r = decidir('AGENDA', null, tarde, linksFuera);
  assert.strictEqual(r.intencion, 'web_inicio');
  assert.doesNotMatch(r.respuesta, /fuera de Concepción/);
  const d = decidir('DEMO', null, tarde, linksFuera);
  assert.doesNotMatch(d.respuesta, /fuera de Concepción/);
});

test('FUERA-1: el aviso sale una sola vez por contacto, antes de la respuesta del servicio', () => {
  const a = decidir('cuanto sale formatear', null, tarde, linksFuera);
  assert.match(a.respuesta, /^(Ojo: esta semana estamos fuera|Te cuento que hasta el domingo andamos fuera)/);
  assert.match(a.respuesta, /lunes 19/);
  assert.match(a.respuesta, /\n\n.*\$15\.000/s);
  // Segundo mensaje de reparación (pasadas 49 h para no estar «en curso»): sin aviso.
  const b = decidir('cuanto sale la limpieza', a.contacto, tarde + 49 * H, linksFuera);
  assert.ok(b.respuesta);
  assert.doesNotMatch(b.respuesta, /fuera de Concepción/);
});

test('FUERA-1: la logística (ubicación) no lleva el aviso', () => {
  const r = decidir('dónde están ubicados?', null, tarde, linksFuera);
  assert.strictEqual(r.intencion, 'ubicacion');
  assert.doesNotMatch(r.respuesta, /fuera de Concepción/);
});

test('FUERA-2: contacto nuevo que saluda recibe el aviso en vez de la bienvenida', () => {
  const r = decidir('hola', null, tarde, linksFuera);
  assert.match(r.respuesta, /fuera de Concepción/);
  assert.match(r.respuesta, /lunes 19/);
  assert.strictEqual(decidir('buenas tardes', r.contacto, tarde + 10e3, linksFuera).respuesta, null);
});

test('FUERA-5: «cuándo vuelven» y «la próxima semana» → día de vuelta + agenda', () => {
  for (const s of ['cuando vuelven?', 'cuándo vuelves', 'y la próxima semana?']) {
    const r = decidir(s, { visto: tarde - H }, tarde, linksFuera);
    assert.strictEqual(r.intencion, 'fuera_vuelta', s);
    assert.match(r.respuesta, /lunes 19/, s);
    assert.match(r.respuesta, /agenda\.test/, s);
  }
});

test('modo vacío o fecha pasada: comportamiento de siempre', () => {
  for (const l of [Object.assign({ fuera: '' }, links), Object.assign({ fuera: '2026-10-10' }, links)]) {
    assert.match(decidir('hola', null, tarde, l).respuesta, /hola/i);
    assert.match(decidir('llegué', { visto: tarde - H }, tarde, l).respuesta, /baj/i);
    const f = decidir('cuanto sale formatear', null, tarde, l);
    assert.doesNotMatch(f.respuesta, /fuera de Concepción/);
    assert.notStrictEqual(decidir('cuando vuelven', { visto: tarde - H }, tarde, l).intencion, 'fuera_vuelta');
  }
});

// ---------------------------------------------------------------------------
// Iteración 2: correcciones del reviewer.
// ---------------------------------------------------------------------------
test('RAM-1 pendiente + otro servicio: atiende ese servicio y borra la pendiente', () => {
  for (const [s, intencion] of [['cuanto sale formatear', 'formateo'], ['precio de la bateria', 'bateria']]) {
    const c = { visto: tarde - 3 * H, enviados: {}, bots: [], pend: { q: 'RAM-1', t: tarde - H, intentos: 0 } };
    const r = decidir(s, c, tarde, links);
    assert.strictEqual(r.intencion, intencion, s);
    assert.strictEqual(r.contacto.pend, null, s);
  }
  // Un «cuánto sale» pelado sigue siendo la opción 1, y un párrafo largo no cuenta como modelo.
  const c = () => ({ visto: tarde - H, enviados: {}, bots: [], pend: { q: 'RAM-1', t: tarde - H, intentos: 0 } });
  assert.strictEqual(decidir('cuanto sale?', c(), tarde, links).intencion, 'ram_1a');
  assert.strictEqual(decidir('creo que es el modelo hp15 pero mi hermano dice otra cosa', c(), tarde, links).intencion, 'pend_repite');
});

test('tope de 3 por hora: SAL-2 conserva el aviso urgente y MEM-D1 su resumen', () => {
  const bots = [tarde - 10 * MIN, tarde - 9 * MIN, tarde - 8 * MIN];
  const p = { q: 'MEM-D', t: tarde - 5 * MIN, intentos: 1 };
  const a = decidir('hmm quizás', { visto: tarde - 5 * MIN, enviados: {}, bots: bots.slice(), pend: Object.assign({}, p) }, tarde, links);
  assert.strictEqual(a.respuesta, null);
  assert.strictEqual(a.aviso, 'urgente');
  assert.match(a.resumen, /MEM-D/);
  const b = decidir('1', { visto: tarde - 5 * MIN, enviados: {}, bots: bots.slice(), pend: { q: 'MEM-D', t: tarde - 5 * MIN, intentos: 0 } }, tarde, links);
  assert.strictEqual(b.respuesta, null);
  assert.strictEqual(b.aviso, 'normal');
  assert.match(b.resumen, /Quiere SSD/);
});

test('mem_pieza_ya y mem_miedo acotados a la memoria; «memoria llena» es MEM-D', () => {
  assert.strictEqual(decidir('tengo la memoria llena', null, tarde, links).intencion, 'memoria_duda');
  assert.notStrictEqual(decidir('ya compre la pantalla', null, tarde, links).intencion, 'mem_pieza_ya');
  assert.notStrictEqual(decidir('tengo miedo a cambiar la pantalla', null, tarde, links).intencion, 'mem_miedo');
  assert.strictEqual(decidir('ya compre el ssd', null, tarde, links).intencion, 'mem_pieza_ya');
  assert.strictEqual(decidir('me da miedo abrir el notebook para cambiar la ram', null, tarde, links).intencion, 'mem_miedo');
});

test('MEM-D sin la palabra «memoria»: «se llena», «sin espacio», «se me llenó el disco»', () => {
  for (const s of ['se me llena el pc', 'me quede sin espacio', 'se me lleno el disco']) {
    const r = decidir(s, null, tarde, links);
    assert.strictEqual(r.intencion, 'memoria_duda', s);
    assert.strictEqual(r.contacto.pend.q, 'MEM-D', s);
  }
  // «subir ram» nombra la RAM: va a RAM-1 (decisión documentada).
  assert.strictEqual(decidir('quiero subir la ram', null, tarde, links).intencion, 'upgrade_ram');
});

test('fuera_llegada de día no cambia; de noche no promete «ahora»', () => {
  const d = decidir('estoy abajo', { visto: tarde - H }, tarde, linksFuera);
  assert.match(d.respuesta, /fuera de Concepción|no estamos en Concepción/);
  assert.doesNotMatch(d.respuesta, /mañana desde las 9/);
});

test('SAL-2 tiene dos variantes del doc', () => {
  const { TEXTOS } = require('./cerebro.js');
  assert.strictEqual(TEXTOS.sal2.length, 2);
  assert.match(TEXTOS.sal2[1], /Para no marearte/);
});

test('mem_compat acotado a memoria; «error de ram» es MEM-S', () => {
  assert.notStrictEqual(decidir('se le puede hacer un formateo', null, tarde, links).intencion, 'mem_compat');
  assert.strictEqual(decidir('se le puede aumentar la ram a mi notebook', null, tarde, links).intencion, 'mem_compat');
  const r = decidir('me sale error de ram', null, tarde, links);
  assert.strictEqual(r.intencion, 'memoria_sintoma');
  assert.doesNotMatch(r.respuesta, /\$10\.000/);
});

test('borde horario de Chile del último día del modo fuera (offset real con Intl)', () => {
  // 2026-10-18 es domingo; en Chile ya rige el horario de verano (UTC-3 desde el 6-sep-2026).
  const offset = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Santiago', timeZoneName: 'shortOffset' })
    .formatToParts(new Date('2026-10-19T02:30:00Z')).find(x => x.type === 'timeZoneName').value.replace('GMT', ''));
  assert.strictEqual(offset, -3);
  // 02:30Z = 23:30 del domingo 18 en Chile: sigue activo; 03:30Z = 00:30 del lunes 19: apagado.
  assert.ok(modoFuera(linksFuera, Date.parse('2026-10-19T02:30:00Z')));
  assert.strictEqual(modoFuera(linksFuera, Date.parse('2026-10-19T03:30:00Z')), null);
});

// ---------------------------------------------------------------------------
// Iteración 3.
// ---------------------------------------------------------------------------
test('«se llena» sin contexto de almacenamiento no secuestra ventilador ni líquidos', () => {
  assert.strictEqual(decidir('se llena de polvo el ventilador', null, tarde, links).intencion, 'ventilador');
  const agua = decidir('se me llena de agua el notebook', null, tarde, links);
  assert.strictEqual(agua.intencion, 'urgente');
  assert.strictEqual(agua.aviso, 'urgente');
  assert.notStrictEqual(decidir('se llena de polvo', null, tarde, links).intencion, 'memoria_duda');
  for (const s of ['se me llenó el disco', 'sin espacio en el notebook', 'se me llena el pc de fotos']) {
    assert.strictEqual(decidir(s, null, tarde, links).intencion, 'memoria_duda', s);
  }
});

test('mem_pieza_ya exige señal de compra: «tengo la ram 8gb puesta» no cuenta', () => {
  assert.notStrictEqual(decidir('tengo la ram 8gb puesta', null, tarde, links).intencion, 'mem_pieza_ya');
  for (const s of ['ya compré la ram', 'compré el ssd', 'tengo la ram nueva', 'me llegó el ssd']) {
    assert.strictEqual(decidir(s, null, tarde, links).intencion, 'mem_pieza_ya', s);
  }
});

test('MEM-D pendiente + «cuanto sale?»: responde, repite la pregunta y mantiene la pendiente', () => {
  let r = decidir('quiero más memoria', null, tarde, links);
  r = decidir('cuanto sale?', r.contacto, tarde + MIN, links);
  assert.strictEqual(r.intencion, 'pend_precio');
  assert.match(r.respuesta, /El precio depende de cuál de las dos es; dime y te lo digo altiro\./);
  assert.match(r.respuesta, /1️⃣.*2️⃣/s);
  assert.strictEqual(r.contacto.pend.q, 'MEM-D');
  assert.strictEqual(r.contacto.pend.intentos, 0);
  assert.strictEqual(decidir('1', r.contacto, tarde + 2 * MIN, links).intencion, 'mem_d1');
});

test('SAL-5 de modelo existe con v1 y v2 del doc', () => {
  const m = require('./cerebro.js').TEXTOS.sal5_modelo;
  assert.strictEqual(m.length, 2);
  assert.match(m[0], /etiqueta/);
  assert.match(m[1], /Dale vuelta al equipo/);
});

// ---------------------------------------------------------------------------
// Iteración 4.
// ---------------------------------------------------------------------------
test('mem_pieza_ya: «pieza» de otro servicio no cuenta; ram/ssd sí', () => {
  assert.strictEqual(decidir('compre la pieza de la pantalla', null, tarde, links).intencion, 'pantalla');
  assert.strictEqual(decidir('ya compre la ram', null, tarde, links).intencion, 'mem_pieza_ya');
  assert.strictEqual(decidir('ya compre la pieza', null, tarde, links).intencion, 'mem_pieza_ya');
  assert.notStrictEqual(decidir('compre el cargador', null, tarde, links).intencion, 'mem_pieza_ya');
});

test('memoria_duda no se activa con virus, basura, malware ni publicidad', () => {
  for (const s of ['mi pc se llena de virus', 'se me llena el notebook de publicidad', 'mi compu se llena de basura', 'el pc se llena de malware']) {
    assert.notStrictEqual(decidir(s, null, tarde, links).intencion, 'memoria_duda', s);
  }
});

// ---------------------------------------------------------------------------
// Diálogo C · Página con agenda (palabra clave AGENDA).
// ---------------------------------------------------------------------------
const S = 1e3;
// Lleva a un contacto nuevo hasta AG-3 (muestra la agenda y propone la llamada).
function hastaAG3(t0 = tarde) {
  let r = decidir('AGENDA', null, t0, links);
  r = decidir('soy psicóloga', r.contacto, t0 + S, links);
  r = decidir('sí', r.contacto, t0 + 2 * S, links);
  r = decidir('por whatsapp', r.contacto, t0 + 3 * S, links);
  assert.strictEqual(r.intencion, 'web_mostrar');
  return r;
}

test('C: ningún texto del diálogo menciona precios ni Meet de 45 min', () => {
  const { TEXTOS } = require('./cerebro.js');
  for (const k of Object.keys(TEXTOS).filter(x => /^ag_|^sal[38]/.test(x))) {
    for (const v of TEXTOS[k]) assert.doesNotMatch(v, /\$|190|14\.990|45 min|Meet|gratis/, k);
  }
});

test('C ejemplo 1: cliente ideal AGENDA → rubro → marca → agenda hoy → AG-3 → dale → AG-4a urgente', () => {
  let r = decidir('AGENDA', null, tarde, links);
  assert.strictEqual(r.intencion, 'web_inicio');
  assert.match(r.respuesta, /¿a qué te dedicas\?/);
  assert.strictEqual(r.aviso, null);
  r = decidir('soy psicóloga', r.contacto, tarde + S, links);
  assert.strictEqual(r.intencion, 'web_marca');
  assert.deepStrictEqual(r.botones.map(b => b.titulo), ['Sí, ya tengo', 'Todavía no']);
  r = decidir('sí', r.contacto, tarde + 2 * S, links);
  assert.strictEqual(r.intencion, 'web_hoy');
  assert.strictEqual(r.botones.length, 3);
  r = decidir('por whatsapp', r.contacto, tarde + 3 * S, links);
  assert.strictEqual(r.intencion, 'web_mostrar');
  assert.match(r.respuesta, /8vobit\.xyz\/#agendar/);
  assert.match(r.respuesta, /15 min/);
  assert.strictEqual(r.contacto.ag.preguntas, 3);   // rubro, marca y hoy: máximo tres preguntas de datos
  r = decidir('dale', r.contacto, tarde + 4 * S, links);
  assert.strictEqual(r.intencion, 'web_llamada');
  assert.strictEqual(r.aviso, 'urgente');
  assert.match(r.respuesta, /8vobit\.xyz\/#reunion/);
  assert.match(r.resumen, /Lead agenda · soy psicóloga · con marca · agenda por WhatsApp · quiere: sin dato · pidió precio: no · recomendado: no · compara: no/);
});

test('banco 3 / ejemplo 2 (caso del 9-nov): web → web → soy contador → 1 → ¿qué cosa? → whatsapp', () => {
  let r = decidir('web', null, tarde, links);
  assert.strictEqual(r.intencion, 'web_inicio');
  r = decidir('web', r.contacto, tarde + S, links);
  assert.strictEqual(r.intencion, 'web_repite');
  assert.match(r.respuesta, /psicóloga, kinesiólogo, abogada, peluquería/);
  r = decidir('soy contador', r.contacto, tarde + 2 * S, links);
  assert.strictEqual(r.intencion, 'web_marca');
  r = decidir('1', r.contacto, tarde + 3 * S, links);
  assert.strictEqual(r.intencion, 'web_hoy');
  r = decidir('¿qué cosa?', r.contacto, tarde + 4 * S, links);
  assert.strictEqual(r.intencion, 'web_repite');
  assert.match(r.respuesta, /Me refiero a cómo te reservan hora/);
  r = decidir('whatsapp', r.contacto, tarde + 5 * S, links);
  assert.strictEqual(r.intencion, 'web_mostrar');
});

test('banco 4 / ejemplo 3: relato largo salta AG-0/1/2, responde AG-P y manda AG-3 con la frase', () => {
  const r = decidir('Quería cotizar una página para mi emprendimiento de servicios fotográficos. No tengo logo ni página, sería portafolio y tienda, y un calendario para agendar sesiones. Solo quiero un rango de precio', null, tarde, links);
  assert.strictEqual(r.intencion, 'web_mostrar');
  assert.match(r.respuesta, /Depende de lo que necesites|Te lo digo con tu caso en la mano/);              // AG-P
  assert.match(r.respuesta, /Gracias por contarme\. Con lo que me dices, la página lleva portafolio, tienda y calendario\./);
  assert.doesNotMatch(r.respuesta, /fotogr/);                                                                 // nunca el rubro
  assert.doesNotMatch(r.respuesta, /\$/);
  assert.match(r.respuesta, /#agendar/);
  assert.strictEqual(r.contacto.ag.marca, 'no');
  assert.strictEqual(r.contacto.ag.precio, true);
  assert.match(r.resumen, /mi emprendimiento de servicios fotográficos · sin marca/);
  assert.match(r.resumen, /pidió precio: sí/);
  r.contacto.ag.paso === 'cierre' || assert.fail('debía quedar en AG-3');
  const f = decidir('dale', r.contacto, tarde + S, links);
  assert.strictEqual(f.aviso, 'urgente');
  assert.match(f.resumen, /quiere: portafolio, tienda, agenda · pidió precio: sí/);
});

test('banco 5: AGENDA → soy kinesiólogo → no tengo logo → no agendo → AG-3 con aviso «sin marca» y «no agenda»', () => {
  let r = decidir('AGENDA', null, tarde, links);
  r = decidir('soy kinesiólogo', r.contacto, tarde + S, links);
  assert.strictEqual(r.intencion, 'web_marca');
  r = decidir('no tengo logo', r.contacto, tarde + 2 * S, links);
  assert.strictEqual(r.intencion, 'web_hoy');
  r = decidir('no agendo', r.contacto, tarde + 3 * S, links);
  assert.strictEqual(r.intencion, 'web_mostrar');
  assert.ok(r.aviso);
  assert.match(r.resumen, /sin marca/);
  assert.match(r.resumen, /no agenda/);
});

test('banco 6, 7, 8: «no hay problema» y «no, tranqui» cuentan como sí; «no gracias» como no', () => {
  for (const s of ['no hay problema', 'no, tranqui', 'no te preocupes', 'no importa']) {
    const r = decidir(s, hastaAG3().contacto, tarde + 10 * S, links);
    assert.strictEqual(r.intencion, 'web_llamada', s);
  }
  const n = decidir('no gracias', hastaAG3().contacto, tarde + 10 * S, links);
  assert.strictEqual(n.intencion, 'web_ahora_no');
  assert.strictEqual(n.aviso, 'normal');
  assert.match(n.resumen, /ahora no/);
  const l = decidir('lo voy a pensar', hastaAG3().contacto, tarde + 10 * S, links);
  assert.strictEqual(l.intencion, 'web_ahora_no');
});

test('banco 9: en AG-1, «jajaja» y emojis no cuentan como intento (se pidió M2)', () => {
  let r = decidir('AGENDA', null, tarde, links);
  r = decidir('soy peluquera', r.contacto, tarde + S, links);
  const a = decidir('jajaja', r.contacto, tarde + 2 * S, links);
  assert.strictEqual(a.respuesta, null);
  const b = decidir('🙃', a.contacto, tarde + 3 * S, links);
  assert.strictEqual(b.respuesta, null);
  assert.strictEqual(b.contacto.ag.intentos, 0);
  assert.strictEqual(decidir('liked a message', b.contacto, tarde + 4 * S, links).respuesta, null);
});

test('M5: dos respuestas que no se entienden → SAL-2 con aviso urgente', () => {
  let r = decidir('AGENDA', null, tarde, links);
  r = decidir('soy peluquera', r.contacto, tarde + S, links);
  r = decidir('mmm', r.contacto, tarde + 2 * S, links);
  assert.strictEqual(r.intencion, 'web_repite');
  r = decidir('eh', r.contacto, tarde + 3 * S, links);
  assert.strictEqual(r.intencion, 'web_humano');
  assert.match(r.respuesta, /Gabriel/);
  assert.strictEqual(r.aviso, 'urgente');
  assert.match(r.resumen, /Lead agenda · soy peluquera/);
});

test('banco 17: «cuanto sale» en AG-1 → AG-P + repite AG-1, sin contar fallo', () => {
  let r = decidir('AGENDA', null, tarde, links);
  r = decidir('soy peluquera', r.contacto, tarde + S, links);
  r = decidir('cuanto sale', r.contacto, tarde + 2 * S, links);
  assert.strictEqual(r.intencion, 'web_repite');
  assert.match(r.respuesta, /llamada/);
  assert.match(r.respuesta, /¿Ya tienes logo|¿ya tienes tu logo/i);
  assert.doesNotMatch(r.respuesta, /\$|\d{2}\.\d{3}/);
  assert.strictEqual(r.contacto.ag.intentos, 0);
  r = decidir('1', r.contacto, tarde + 3 * S, links);          // la pregunta sigue vigente
  assert.strictEqual(r.intencion, 'web_hoy');
});

test('banco 18 / ejemplo 8: pide precio dos veces → SAL-2 con aviso «pide precio dos veces»', () => {
  let r = hastaAG3();
  r = decidir('cuanto sale', r.contacto, tarde + 10 * S, links);
  assert.strictEqual(r.intencion, 'web_repite');
  assert.match(r.respuesta, /1️⃣/);
  r = decidir('aunque sea aproximado', r.contacto, tarde + 11 * S, links);
  assert.strictEqual(r.intencion, 'web_humano');
  assert.strictEqual(r.aviso, 'urgente');
  assert.match(r.resumen, /pide precio dos veces/);
  assert.match(r.respuesta, /Gabriel/);
});

test('banco 20 / ejemplo 10: «hablame al wsp +56…» → SAL-8, el número va solo al aviso', () => {
  let r = decidir('AGENDA', null, tarde, links);
  r = decidir('soy contador', r.contacto, tarde + S, links);
  r = decidir('no me escribas por acá, hablame al wsp +56912345678', r.contacto, tarde + 2 * S, links);
  assert.strictEqual(r.intencion, 'web_canal');
  assert.strictEqual(r.aviso, 'urgente');
  assert.match(r.resumen, /\+56912345678/);
  assert.doesNotMatch(r.respuesta, /\d{6}/);
  assert.match(r.respuesta, /Gabriel/);
  // Sin flujo previo también.
  const s = decidir('hablame al wsp +56912345678', null, tarde, links);
  assert.strictEqual(s.intencion, 'web_canal');
  assert.match(s.resumen, /\+56912345678/);
  // Un teléfono suelto: solo confirma que ya lo tiene si ya lo había dejado.
  const y = decidir('mi número es 9 8765 4321', s.contacto, tarde + 60 * S, links);
  assert.match(y.respuesta, /ya tengo tu número/);
  assert.doesNotMatch(y.respuesta, /8765/);
});

test('SAL-8 en AG-3: «ya, pero por escrito» cambia de canal', () => {
  const r = decidir('ya, pero por escrito', hastaAG3().contacto, tarde + 10 * S, links);
  assert.strictEqual(r.intencion, 'web_canal');
  assert.strictEqual(r.aviso, 'urgente');
});

test('banco 29 / ejemplo 7: AG-3 → «te aviso» → SAL-6, sin fallo y la pregunta sigue vigente', () => {
  let r = decidir('te aviso', hastaAG3().contacto, tarde + 10 * S, links);
  assert.strictEqual(r.intencion, 'web_pausa');
  assert.strictEqual(r.respuesta, 'Dale, sin apuro. Aquí quedo.');
  assert.strictEqual(r.aviso, null);
  assert.strictEqual(r.contacto.ag.paso, 'cierre');
  r = decidir('dale', r.contacto, tarde + 20 * S, links);
  assert.strictEqual(r.intencion, 'web_llamada');
});

test('banco 31 / ejemplo 5: rediseño con dirección y comparando → AG-D + AG-O → AG-3', () => {
  const r = decidir('Necesito rediseñar la página de mi papá, estoy cotizando en varios lados, es esta: https://www.ejemplo.cl/tienda', null, tarde, links);
  assert.strictEqual(r.intencion, 'web_mostrar');
  assert.match(r.respuesta, /no partimos de cero/);                                  // AG-D
  assert.match(r.respuesta, /Normal, conviene comparar|Tiene sentido/);              // AG-O
  assert.match(r.respuesta, /#agendar/);
  assert.match(r.respuesta, /la página lleva rediseño/);
  assert.doesNotMatch(r.respuesta, /Hago páginas|Armo páginas/);
  assert.strictEqual(r.contacto.ag.compara, true);
  assert.match(r.resumen, /compara: sí/);
  assert.match(r.resumen, /web: https:\/\/www\.ejemplo\.cl/);
});

test('banco 32: «me dio tu contacto Juan» en el flujo → AG-R, no bloquea y el nombre va al aviso', () => {
  let r = decidir('AGENDA', null, tarde, links);
  r = decidir('me dio tu contacto Juan', r.contacto, tarde + S, links);
  assert.strictEqual(r.intencion, 'web_repite');
  assert.match(r.respuesta, /¿Quién te recomendó\?/);
  assert.match(r.respuesta, /¿a qué te dedicas tú\?|¿a qué te dedicas\?/);
  assert.strictEqual(r.contacto.ag.intentos, 0);
  r = decidir('soy abogada', r.contacto, tarde + 2 * S, links);
  assert.strictEqual(r.intencion, 'web_marca');
  assert.doesNotMatch(r.respuesta, /Quién te recomendó/);                             // no repregunta
  assert.strictEqual(r.contacto.ag.nombreRec, 'Juan');
});

test('ejemplo 4: recomendado, informativa y con dominio → AG-R + AG-D, salta todo y llega a AG-3', () => {
  const r = decidir('Me dieron tu contacto, necesito una página informativa y habilitar unos correos. Ya compré un dominio', null, tarde, links);
  assert.strictEqual(r.intencion, 'web_mostrar');
  assert.match(r.respuesta, /¿Quién te recomendó\?/);
  assert.match(r.respuesta, /no partimos de cero/);
  assert.match(r.respuesta, /la página lleva correos\./);
  assert.match(r.resumen, /recomendado: sí/);
  assert.match(r.resumen, /quiere: correos, dominio/);
});

test('M3: informativa + correos salta «cómo agenda hoy» pero sigue preguntando rubro y marca', () => {
  let r = decidir('AGENDA', null, tarde, links);
  r = decidir('soy contador, quiero una página informativa y correos', r.contacto, tarde + S, links);
  assert.strictEqual(r.intencion, 'web_marca');
  r = decidir('todavía no', r.contacto, tarde + 2 * S, links);
  assert.strictEqual(r.intencion, 'web_mostrar');      // sin AG-2
  assert.match(r.respuesta, /la página lleva correos/);
});

test('ejemplo 9: «LLAMADA» dos días después de AG-4b → AG-4a con el lead', () => {
  let r = decidir('ahora no', hastaAG3().contacto, tarde + 10 * S, links);
  assert.strictEqual(r.intencion, 'web_ahora_no');
  r = decidir('LLAMADA', r.contacto, tarde + 2 * 24 * H, links);
  assert.strictEqual(r.intencion, 'web_llamada');
  assert.strictEqual(r.aviso, 'urgente');
  assert.match(r.resumen, /Lead agenda · soy psicóloga/);
  // Sin flujo previo también entra directo.
  const n = decidir('llamada', null, tarde, links);
  assert.strictEqual(n.intencion, 'web_llamada');
});

test('C: «no sé qué es eso de marca» explica y cuenta como «no»; «tengo el logo pero feo» como «sí»', () => {
  let r = decidir('AGENDA', null, tarde, links);
  r = decidir('soy contador', r.contacto, tarde + S, links);
  const base = JSON.stringify(r.contacto);
  const a = decidir('no sé qué es eso de marca', JSON.parse(base), tarde + 2 * S, links);
  assert.match(a.respuesta, /Marca es el logo y los colores/);
  assert.strictEqual(a.contacto.ag.marca, 'no');
  assert.strictEqual(a.intencion, 'web_hoy');
  const b = decidir('tengo el logo pero feo', JSON.parse(base), tarde + 2 * S, links);
  assert.strictEqual(b.contacto.ag.marca, 'si');
});

test('C: pregunta intermedia («¿incluye dominio?») se responde con una línea y se repite la pregunta', () => {
  let r = decidir('AGENDA', null, tarde, links);
  r = decidir('¿cuánto demoras en hacerla?', r.contacto, tarde + S, links);
  assert.strictEqual(r.intencion, 'web_repite');
  assert.match(r.respuesta, /Eso lo definimos en la llamada/);
  assert.match(r.respuesta, /a qué te dedicas/);
  assert.strictEqual(r.contacto.ag.intentos, 0);
});

test('C: pide arreglar un notebook → «dos temas» y vuelve a la pregunta', () => {
  let r = decidir('AGENDA', null, tarde, links);
  r = decidir('soy contador', r.contacto, tarde + S, links);
  r = decidir('y también me arreglas la pantalla de mi notebook', r.contacto, tarde + 2 * S, links);
  assert.match(r.respuesta, /Eso también lo hago/);
  assert.match(r.respuesta, /¿ya tienes tu logo|¿Ya tienes logo/i);
  assert.strictEqual(r.aviso, 'normal');
  assert.match(r.resumen, /dos temas/);
});

test('C: SAL-3 «quiero hablar con Gabriel» pasa a una persona con aviso urgente', () => {
  const r = decidir('prefiero hablar con alguien', hastaAG3().contacto, tarde + 10 * S, links);
  assert.strictEqual(r.intencion, 'web_humano');
  assert.strictEqual(r.aviso, 'urgente');
  assert.match(r.respuesta, /Le aviso a Gabriel/);
});

test('C: M8 la logística manda y pausa el flujo; Gabriel activo calla al bot; el flujo expira a las 24 h', () => {
  const c = hastaAG3().contacto;
  const l = decidir('llegué, estoy abajo', c, tarde + 10 * S, links);
  assert.strictEqual(l.intencion, 'llegada');
  assert.strictEqual(l.contacto.ag.paso, 'cierre');                       // el flujo sigue pausado, no se pierde
  const g = decidir('dale', Object.assign({}, c, { gabriel: tarde + 5 * S }), tarde + 10 * S, links);
  assert.strictEqual(g.respuesta, null);
  const e = decidir('dale', c, tarde + 25 * H, links);                    // 25 h después: ya no es respuesta del flujo
  assert.notStrictEqual(e.intencion, 'web_llamada');
});

test('C: tope de 3 por hora en una entrada nueva conserva el aviso (SAL-8) y no manda texto', () => {
  const c = { visto: tarde - 5 * 60e3, enviados: {}, bots: [tarde - 3 * 60e3, tarde - 2 * 60e3, tarde - 60e3] };
  const r = decidir('hablame al wsp +56912345678', c, tarde, links);
  assert.strictEqual(r.respuesta, null);
  assert.strictEqual(r.aviso, 'urgente');
  assert.match(r.resumen, /\+56912345678/);
});

test('C: el flujo no se rompe con la bienvenida: «Desarrollo web» (MENU_WEB) abre AG-0', () => {
  const r = decidir('', null, tarde, links, 'MENU_WEB');
  assert.strictEqual(r.intencion, 'web_inicio');
  assert.match(r.respuesta, /a qué te dedicas/);
  assert.strictEqual(r.botones, null);
  for (const s of ['página web', 'sitio web', 'landing', 'desarrollo web', 'agenda online', 'web']) {
    assert.strictEqual(decidir(s, null, tarde, links).intencion, 'web_inicio', s);
  }
  // Pedir hora para el taller no entra al flujo web.
  assert.strictEqual(decidir('quiero agendar una hora', null, tarde, links).intencion, 'agendar');
});

test('FUERA-6: con el modo fuera activo, AGENDA entra a AG-0 sin aviso', () => {
  const r = decidir('AGENDA', null, tarde, linksFuera);
  assert.strictEqual(r.intencion, 'web_inicio');
  assert.doesNotMatch(r.respuesta, /fuera de Concepción/);
});

// ---------------------------------------------------------------------------
// Diálogo C · iteración 2.
// ---------------------------------------------------------------------------
test('C + MODO_FUERA: «ya lo dejé en portería» dentro del flujo es FUERA-4 urgente y pausa el flujo', () => {
  let r = decidir('AGENDA', null, tarde, linksFuera);
  r = decidir('ya lo deje en porteria', r.contacto, tarde + S, linksFuera);
  assert.strictEqual(r.intencion, 'fuera_porteria');
  assert.strictEqual(r.aviso, 'urgente');
  assert.match(r.respuesta, /lunes 19|domingo/);
  assert.strictEqual(r.contacto.ag.rubro, null);              // no se tomó como rubro
  assert.strictEqual(r.contacto.ag.paso, 'rubro');            // el flujo sigue pausado
  r = decidir('soy contador', r.contacto, tarde + 2 * S, linksFuera);
  assert.strictEqual(r.intencion, 'web_marca');
});

test('C + MODO_FUERA: «cuando vuelven?» en AG-1 responde FUERA-5 y repite la pregunta pendiente', () => {
  let r = decidir('AGENDA', null, tarde, linksFuera);
  r = decidir('soy contador', r.contacto, tarde + S, linksFuera);
  r = decidir('cuando vuelven?', r.contacto, tarde + 2 * S, linksFuera);
  assert.strictEqual(r.intencion, 'fuera_vuelta');
  assert.match(r.respuesta, /Volvemos a recibir equipos el lunes 19/);
  assert.match(r.respuesta, /¿Ya tienes logo|¿ya tienes tu logo/i);
  assert.strictEqual(r.contacto.ag.intentos, 0);
  assert.strictEqual(r.contacto.ag.paso, 'marca');
  // Con el modo apagado, «cuando vuelven?» no tiene significado especial.
  let a = decidir('AGENDA', null, tarde, links);
  a = decidir('soy contador', a.contacto, tarde + S, links);
  assert.notStrictEqual(decidir('cuando vuelven?', a.contacto, tarde + 2 * S, links).intencion, 'fuera_vuelta');
});

test('C: «aunque sea aproximado» (sin «rango») es la insistencia de precio → SAL-2 urgente', () => {
  for (const s of ['aunque sea aproximado', 'más o menos cuánto', 'dime un número', 'pero cuánto']) {
    let r = hastaAG3();
    r = decidir('cuanto sale', r.contacto, tarde + 10 * S, links);
    assert.strictEqual(r.intencion, 'web_repite', s);
    r = decidir(s, r.contacto, tarde + 11 * S, links);
    assert.strictEqual(r.intencion, 'web_humano', s);
    assert.match(r.resumen, /pide precio dos veces/, s);
  }
  // Sin precio previo, «aunque sea» no es precio.
  const n = decidir('dale aunque sea ahora', hastaAG3().contacto, tarde + 10 * S, links);
  assert.strictEqual(n.intencion, 'web_llamada');
});

test('C: «tienda y calendario» sí pregunta cómo agenda hoy; tienda sola o con correos lo salta', () => {
  const corre = (msg) => {
    let r = decidir('AGENDA', null, tarde, links);
    r = decidir('soy contador, ' + msg, r.contacto, tarde + S, links);
    assert.strictEqual(r.intencion, 'web_marca');
    return decidir('todavía no', r.contacto, tarde + 2 * S, links);
  };
  assert.strictEqual(corre('quiero tienda y calendario').intencion, 'web_hoy');
  assert.strictEqual(corre('quiero un calendario').intencion, 'web_hoy');
  assert.strictEqual(corre('quiero tienda').intencion, 'web_mostrar');
  assert.strictEqual(corre('quiero portafolio y correos').intencion, 'web_mostrar');
});

test('SAL-8: un número de 9 dígitos dentro de una consulta no desvía nada', () => {
  const r = decidir('mi notebook tiene la serie 912345678, se pega', null, tarde, links);
  assert.notStrictEqual(r.intencion, 'web_canal');
  assert.strictEqual(r.intencion, 'lento');
  // Dentro del flujo, un número en una frase larga tampoco es SAL-8, pero queda como señal.
  let f = decidir('AGENDA', null, tarde, links);
  f = decidir('soy contador y mi local queda en el 912345678 de Freire', f.contacto, tarde + S, links);
  assert.notStrictEqual(f.intencion, 'web_canal');
});

test('SAL-8: «mi número es …», un número solo dentro del flujo y «llámame» sin número', () => {
  const a = decidir('mi número es 9 8765 4321', null, tarde, links);
  assert.strictEqual(a.intencion, 'web_canal');
  assert.match(a.resumen, /9 8765 4321/);
  let r = decidir('AGENDA', null, tarde, links);
  r = decidir('+56 9 8765 4321', r.contacto, tarde + S, links);
  assert.strictEqual(r.intencion, 'web_canal');
  assert.strictEqual(r.aviso, 'urgente');
  assert.strictEqual(decidir('llámame', null, tarde, links).intencion, 'web_canal');
  // Fuera del flujo, un número pelado no activa nada.
  assert.notStrictEqual(decidir('912345678', null, tarde, links).intencion, 'web_canal');
});

// ---------------------------------------------------------------------------
// Diálogo C · iteración 3: lo que quiere no es el rubro; nuevas entradas.
// ---------------------------------------------------------------------------
test('C: en AG-0, «quiero tienda» no es el rubro: se anota en quiere y se repregunta sin fallo', () => {
  let r = decidir('AGENDA', null, tarde, links);
  r = decidir('quiero tienda', r.contacto, tarde + S, links);
  assert.strictEqual(r.intencion, 'web_repite');
  assert.match(r.respuesta, /Perfecto, lo anoto\. ¿Y a qué te dedicas\?/);
  assert.doesNotMatch(r.respuesta, /Te pregunto por tu trabajo/);
  assert.strictEqual(r.contacto.ag.rubro, null);
  assert.deepStrictEqual(r.contacto.ag.quiere, ['tienda']);
  assert.strictEqual(r.contacto.ag.intentos, 0);
  r = decidir('soy psicóloga', r.contacto, tarde + 2 * S, links);
  assert.strictEqual(r.intencion, 'web_marca');
  assert.strictEqual(r.contacto.ag.rubro, 'soy psicóloga');
  r = decidir('no', r.contacto, tarde + 3 * S, links);
  r = decidir('dale', r.contacto, tarde + 4 * S, links);
  assert.match(r.resumen, /Lead agenda · soy psicóloga · sin marca/);
  assert.match(r.resumen, /quiere: tienda/);
  assert.doesNotMatch(r.resumen, /quiero tienda/);
});

test('C: varios «quiero …» seguidos en AG-0 no cuentan como fallo ni como rubro', () => {
  let r = decidir('AGENDA', null, tarde, links);
  for (const s of ['quiero tienda', 'necesito correos y un calendario', 'busco algo bonito']) {
    r = decidir(s, r.contacto, tarde + S, links);
    assert.strictEqual(r.intencion, 'web_repite', s);
    assert.strictEqual(r.contacto.ag.intentos, 0, s);
    assert.strictEqual(r.contacto.ag.rubro, null, s);
  }
  assert.deepStrictEqual(r.contacto.ag.quiere.sort(), ['agenda', 'correos', 'tienda']);
});

test('C: «soy fotógrafa y quiero una tienda» guarda rubro y quiere juntos', () => {
  let r = decidir('AGENDA', null, tarde, links);
  r = decidir('soy fotógrafa y quiero una tienda', r.contacto, tarde + S, links);
  assert.strictEqual(r.intencion, 'web_marca');
  assert.strictEqual(r.contacto.ag.rubro, 'soy fotógrafa');
  assert.deepStrictEqual(r.contacto.ag.quiere, ['tienda']);
});

test('C entradas nuevas: tienda online/virtual, ecommerce, catálogo online, página para mi negocio', () => {
  for (const s of ['quiero una tienda online', 'tienda virtual', 'necesito un e-commerce', 'ecommerce', 'catálogo online para vender', 'una página para mi negocio', 'quiero una página']) {
    const r = decidir(s, null, tarde, links);
    assert.strictEqual(r.intencion, 'web_inicio', s);
    assert.match(r.respuesta, /a qué te dedicas/, s);
    assert.strictEqual(r.contacto.ag.rubro, null, s);                       // lo detectado va a quiere, no a rubro
  }
  const t = decidir('quiero una tienda online', null, tarde, links);
  assert.deepStrictEqual(t.contacto.ag.quiere, ['tienda']);
  const e = decidir('quiero un catálogo online', null, tarde, links);
  assert.ok(e.contacto.ag.quiere.includes('tienda'));
});

test('C: «quiero tienda y calendario» como primer mensaje NO entra (sin forma segura); dentro del flujo sí cuenta', () => {
  // Decisión: «tienda» sola es demasiado común en reparación («lo compré en una tienda»), así que
  // sin «online/virtual» ni «página» no se abre el flujo desde un mensaje frío.
  assert.notStrictEqual(decidir('quiero tienda y calendario', null, tarde, links).intencion, 'web_inicio');
  let r = decidir('AGENDA', null, tarde, links);
  r = decidir('quiero tienda y calendario', r.contacto, tarde + S, links);
  assert.deepStrictEqual(r.contacto.ag.quiere.sort(), ['agenda', 'tienda']);
});

test('«tienda» de otros contextos (reparación) no dispara el flujo web', () => {
  const r = decidir('lo compré en una tienda y no prende', null, tarde, links);
  assert.strictEqual(r.intencion, 'no_enciende');
  assert.strictEqual(r.contacto.ag, undefined);
  assert.notStrictEqual(decidir('compré el cargador en una tienda', null, tarde, links).intencion, 'web_inicio');
});

// ---------------------------------------------------------------------------
// Diálogo C · iteración 4: las frases libres de entrada no capturan reparaciones.
// ---------------------------------------------------------------------------
test('C: frases de reparación con «tienda online», «ecommerce» o «página» NO entran al flujo web', () => {
  const casos = [
    ['compre el notebook en una tienda online y no prende', 'no_enciende'],
    ['vendo en una tienda online y mi pc se calienta', 'limpieza'],
    ['mi notebook de la tienda virtual va lento', 'lento'],
    ['hola, quiero una pagina de ayuda con el windows, se pega', null],
    ['quiero que la pagina de inicio no cambie sola en mi pc', null],
    ['necesito una pagina de descarga de drivers para mi notebook', null],
    ['el ecommerce de la tienda me cobró dos veces, necesito la factura', null]
  ];
  for (const [s, intencion] of casos) {
    const r = decidir(s, null, tarde, links);
    assert.notStrictEqual(r.intencion, 'web_inicio', s);
    assert.strictEqual(r.contacto.ag, undefined, s);
    if (intencion) assert.strictEqual(r.intencion, intencion, s);
  }
});

test('C: las palabras clave exactas entran siempre, aunque traigan palabras de reparación', () => {
  for (const s of ['AGENDA', 'página web', 'sitio web', 'landing', 'desarrollo web', 'web', 'necesito una página web para mi notebook shop']) {
    assert.strictEqual(decidir(s, null, tarde, links).intencion, 'web_inicio', s);
  }
  assert.strictEqual(decidir('', null, tarde, links, 'MENU_WEB').intencion, 'web_inicio');
  assert.strictEqual(decidir('DEMO', null, tarde, links).intencion, 'web_inicio');
});

test('C: frases libres legítimas siguen entrando', () => {
  const a = decidir('quiero una tienda online para vender ropa', null, tarde, links);
  assert.strictEqual(a.intencion, 'web_inicio');          // no dijo su rubro: se pregunta
  assert.ok(a.contacto.ag);
  const b = decidir('necesito una página para mi consulta de psicología', null, tarde, links);
  assert.strictEqual(b.intencion, 'web_marca');           // entra y ya trae el rubro: salta a la marca
  assert.match(b.contacto.ag.rubro, /consulta de psicolog/);
});

// ---------------------------------------------------------------------------
// Diálogo C · iteración 5: «web» en frase libre, vender por internet y «armar mi tienda».
// ---------------------------------------------------------------------------
test('C: «quiero una web para mi negocio» y «necesito una web para mi consulta» entran', () => {
  for (const s of ['quiero una web para mi negocio', 'necesito una web para mi consulta']) {
    const r = decidir(s, null, tarde, links);
    assert.ok(r.intencion.startsWith('web_'), s);
    assert.ok(r.contacto.ag, s);
  }
  // El veto de reparación también rige para «web» en frase libre.
  assert.strictEqual(decidir('mi notebook no abre paginas web y se pega', null, tarde, links).contacto.ag, undefined);
});

test('C: «tienda en línea», «vender por internet» y «sitio para vender» entran', () => {
  for (const s of ['quiero una tienda en linea', 'quiero vender por internet', 'necesito un sitio para vender mis productos', 'una pagina para vender']) {
    const r = decidir(s, null, tarde, links);
    assert.strictEqual(r.intencion, 'web_inicio', s);
    assert.ok(r.contacto.ag.quiere.includes('tienda'), s);
    assert.strictEqual(r.contacto.ag.rubro, null, s);
  }
});

test('C: «quiero armar mi tienda online» es del flujo C; «armar un pc gamer» sigue siendo armado', () => {
  const a = decidir('quiero armar mi tienda online', null, tarde, links);
  assert.strictEqual(a.intencion, 'web_inicio');
  assert.notStrictEqual(a.intencion, 'armado');
  assert.strictEqual(decidir('quiero armar un pc gamer', null, tarde, links).intencion, 'armado');
  assert.strictEqual(decidir('cuanto sale el armado de un pc', null, tarde, links).intencion, 'armado');
});

test('C (a propósito): «mi pagina web no abre» entra al flujo por la palabra fija, sin veto de reparación', () => {
  // Si su página web no abre es un caso para Gabriel por la línea web, no de reparación de equipos.
  const r = decidir('mi pagina web no abre', null, tarde, links);
  assert.strictEqual(r.intencion, 'web_inicio');
});

// ---------------------------------------------------------------------------
// «web» libre acotado (arreglo pendiente de C).
// ---------------------------------------------------------------------------
test('C: «web» libre no atrapa frases ajenas (SII, municipalidad, cuenta web, banco)', () => {
  for (const s of ['la web del sii no abre', 'pagar en la web de la municipalidad', 'mi cuenta web me pide clave', 'nuestra web bancaria se cae']) {
    const r = decidir(s, null, tarde, links);
    assert.notStrictEqual(r.intencion, 'web_inicio', s);
    assert.strictEqual(r.contacto.ag, undefined, s);
  }
});

test('C: «web» libre sigue entrando con las formas acotadas', () => {
  for (const s of ['quiero una web para mi negocio', 'necesito una web para mi consulta', 'quiero hacer una web', 'busco crear mi web', 'necesito web para mi tienda']) {
    const r = decidir(s, null, tarde, links);
    assert.ok(r.contacto.ag, s);
  }
});

// ---------------------------------------------------------------------------
// E · Respuestas fuera de norma.
// ---------------------------------------------------------------------------
const nuevoSinVisto = () => null;

test('SAL-4 audio dentro de C (banco 10): repite la pregunta sin avanzar; el segundo audio → SAL-2', () => {
  let r = decidir('AGENDA', null, tarde, links);
  r = decidir('soy peluquera', r.contacto, tarde + S, links);
  r = decidir('', r.contacto, tarde + 2 * S, links, '', 'audio');
  assert.strictEqual(r.intencion, 'web_repite');
  assert.match(r.respuesta, /audios/);
  assert.match(r.respuesta, /¿Ya tienes logo|¿ya tienes tu logo/i);
  assert.strictEqual(r.contacto.ag.paso, 'marca');
  assert.strictEqual(r.contacto.ag.intentos, 1);
  r = decidir('', r.contacto, tarde + 3 * S, links, '', 'audio');
  assert.strictEqual(r.intencion, 'web_humano');
  assert.strictEqual(r.aviso, 'urgente');
  assert.match(r.respuesta, /Gabriel/);
});

test('SAL-4 foto dentro de C: en AG-1 es «marca: sí»; en otro paso, texto de foto y repite la pregunta', () => {
  let r = decidir('AGENDA', null, tarde, links);
  r = decidir('soy peluquera', r.contacto, tarde + S, links);
  const base = JSON.stringify(r.contacto);
  const logo = decidir('', JSON.parse(base), tarde + 2 * S, links, '', 'image');
  assert.match(logo.respuesta, /Gracias por el logo\. Gabriel lo mira antes de la llamada\./);
  assert.strictEqual(logo.contacto.ag.marca, 'si');
  assert.strictEqual(logo.intencion, 'web_hoy');
  const f = decidir('', decidir('AGENDA', null, tarde, links).contacto, tarde + 2 * S, links, '', 'image');   // en AG-0
  assert.match(f.respuesta, /Recibí la foto, gracias\. Gabriel la mira antes de la hora\./);
  assert.match(f.respuesta, /a qué te dedicas/);
  assert.strictEqual(f.contacto.ag.marca, null);
});

test('SAL-4 con una pregunta pendiente de B: audio repite, segundo audio → SAL-2; foto de un modelo cuenta', () => {
  let r = decidir('quiero más memoria', null, tarde, links);
  r = decidir('', r.contacto, tarde + MIN, links, '', 'audio');
  assert.match(r.respuesta, /audios/);
  assert.match(r.respuesta, /1️⃣/);
  assert.strictEqual(r.contacto.pend.q, 'MEM-D');
  r = decidir('', r.contacto, tarde + 2 * MIN, links, '', 'audio');
  assert.strictEqual(r.intencion, 'sal2');
  assert.strictEqual(r.aviso, 'urgente');
  // La pendiente es el modelo (tras pedirlo): la foto cuenta como respuesta.
  let m = decidir('cuanto sale cambiar la pantalla', null, tarde, links);
  assert.strictEqual(m.contacto.pend.q, 'MODELO');
  m = decidir('', m.contacto, tarde + MIN, links, '', 'image');
  assert.match(m.respuesta, /Recibí la foto, gracias\. Gabriel la mira antes de la hora\./);
  assert.strictEqual(m.aviso, 'normal');
  assert.strictEqual(m.contacto.pend, null);
  // RAM-1 pendiente: también.
  let q = decidir('necesito ram ddr4', null, tarde, links);
  q = decidir('', q.contacto, tarde + MIN, links, '', 'image');
  assert.match(q.respuesta, /Recibí la foto/);
  assert.strictEqual(q.contacto.pend, null);
  // MEM-D pendiente: la foto no contesta 1/2: texto de foto y repite la pregunta.
  let d = decidir('tengo poca memoria', null, tarde, links);
  d = decidir('', d.contacto, tarde + MIN, links, '', 'image');
  assert.match(d.respuesta, /Recibí la foto/);
  assert.match(d.respuesta, /1️⃣/);
  assert.strictEqual(d.contacto.pend.q, 'MEM-D');
});

test('SAL-4 sin pendiente: contacto nuevo recibe el texto una sola vez con aviso normal; video con aviso; share se ignora', () => {
  const a = decidir('', null, tarde, links, '', 'image');
  assert.match(a.respuesta, /Recibí la foto/);
  assert.strictEqual(a.aviso, 'normal');
  const b = decidir('', a.contacto, tarde + MIN, links, '', 'image');
  assert.strictEqual(b.respuesta, null);
  assert.strictEqual(b.aviso, 'normal');
  const au = decidir('', null, tarde, links, '', 'audio');
  assert.match(au.respuesta, /no alcanzo a escuchar audios|no los puedo escuchar/i);
  const v = decidir('', null, tarde, links, '', 'video');
  assert.match(v.respuesta, /Recibí el video\. Gabriel lo ve y te responde\./);
  assert.strictEqual(v.aviso, 'normal');
  const enCurso = decidir('', { visto: tarde - H, enviados: {}, bots: [] }, tarde, links, '', 'image');
  assert.strictEqual(enCurso.respuesta, null);
  assert.strictEqual(enCurso.aviso, 'normal');
  const sh = decidir('', null, tarde, links, '', 'share');
  assert.strictEqual(sh.respuesta, null);
  assert.strictEqual(sh.aviso, null);
  // Con Gabriel conversando, el bot no responde.
  const g = decidir('', { visto: tarde - H, gabriel: tarde - H, enviados: {}, bots: [] }, tarde, links, '', 'image');
  assert.strictEqual(g.respuesta, null);
});

test('SAL-4: «audio call started» recibe el texto de llamadas una sola vez; «ended» se ignora', () => {
  const a = decidir('audio call started', null, tarde, links);
  assert.match(a.respuesta, /No alcanzo a contestar llamadas por Instagram/);
  assert.strictEqual(decidir('audio call started', a.contacto, tarde + MIN, links).respuesta, null);
  assert.strictEqual(decidir('audio call ended', null, tarde, links).respuesta, null);
});

test('SAL-5: «no sé / no cacho / no tengo el modelo» tras pedir el modelo → texto de modelo; frase de «no sé de computadores»', () => {
  for (const s of ['no se', 'no cacho', 'no tengo el modelo', 'apenas se ve']) {
    let r = decidir('cuanto sale cambiar la bateria', null, tarde, links);
    assert.strictEqual(r.contacto.pend.q, 'MODELO');
    r = decidir(s, r.contacto, tarde + MIN, links);
    assert.strictEqual(r.intencion, 'sal5', s);
    assert.match(r.respuesta, /etiqueta/, s);
    assert.strictEqual(r.contacto.pend, null);
    assert.notStrictEqual(r.aviso, 'urgente');
  }
  let c = decidir('quiero ram ddr4', null, tarde, links);
  c = decidir('1', c.contacto, tarde + MIN, links);
  assert.strictEqual(c.intencion, 'ram_1a');
  c = decidir('no cacho nada de computadores', c.contacto, tarde + 2 * MIN, links);
  assert.strictEqual(c.intencion, 'sal5');
  assert.match(c.respuesta, /Cuéntame con tus palabras qué ves, yo me encargo del resto\./);
  // Si da el modelo, la pendiente se cierra y Gabriel sigue (aviso, sin respuesta del bot).
  let m = decidir('cuanto sale cambiar la pantalla', null, tarde, links);
  m = decidir('es un ideapad 3 15itl6', m.contacto, tarde + MIN, links);
  assert.strictEqual(m.respuesta, null);
  assert.strictEqual(m.contacto.pend, null);
});

test('SAL-5: MEM-C, MEM-D1, bisagras y SSD también dejan pendiente el modelo', () => {
  for (const s of ['no se si a mi notebook se le puede hacer eso', 'quiero cambiar las bisagras', 'quiero cambiar el disco']) {
    const r = decidir(s, null, tarde, links);
    assert.strictEqual(r.contacto.pend && r.contacto.pend.q, 'MODELO', s);
  }
  let d = decidir('quiero más memoria', null, tarde, links);
  d = decidir('1', d.contacto, tarde + MIN, links);
  assert.strictEqual(d.intencion, 'mem_d1');
  assert.strictEqual(d.contacto.pend.q, 'MODELO');
});

test('SAL-7: «es muy caro», «juntaré platita», «no me alcanza» → texto, aviso «objeción de precio», sin descuento', () => {
  for (const s of ['es muy caro', 'voy a juntar platita', 'no me alcanza por ahora', 'uf que caro']) {
    const r = decidir(s, null, tarde, links);
    assert.strictEqual(r.intencion, 'objecion', s);
    assert.match(r.respuesta, /Te entiendo\. Por eso el diagnóstico se descuenta|tómate tu tiempo/, s);
    assert.doesNotMatch(r.respuesta, /descuento de|10%/, s);
    assert.strictEqual(r.aviso, 'normal', s);
    assert.match(r.resumen, /objeción de precio/, s);
  }
  // Mencionando el descuento de estudiante, gana la respuesta del descuento.
  assert.strictEqual(decidir('es caro, tienen descuento para estudiantes?', null, tarde, links).intencion, 'descuento');
  // También responde con conversación en curso.
  const e = decidir('es muy caro', { visto: tarde - 3 * H, enviados: {}, bots: [] }, tarde, links);
  assert.ok(e.respuesta);
});

test('banco 19 / SAL-9: «la clave es 1234» → texto de claves, aviso sin la clave y texto oculto', () => {
  for (const s of ['la clave es 1234', 'mi contraseña: Hola2026', 'password: abc123', 'mi pin es 4455', 'clave 8x7y9z']) {
    const r = decidir(s, null, tarde, links);
    assert.strictEqual(r.intencion, 'clave', s);
    assert.strictEqual(r.ocultar, true, s);
    assert.match(r.respuesta, /no mandes claves por mensaje/, s);
    assert.strictEqual(r.aviso, 'normal', s);
    assert.strictEqual(r.resumen, 'mandó una clave por chat', s);
    assert.doesNotMatch(JSON.stringify([r.resumen, r.respuesta]), /1234|Hola2026|abc123|4455|8x7y9z/, s);
  }
  // Dentro del flujo C no se toma como rubro.
  let f = decidir('AGENDA', null, tarde, links);
  f = decidir('la clave es 1234', f.contacto, tarde + S, links);
  assert.strictEqual(f.intencion, 'clave');
  assert.strictEqual(f.contacto.ag.rubro, null);
  assert.strictEqual(f.contacto.ag.paso, 'rubro');
  // Una sola vez en 24 h: el aviso sigue, el texto no se repite.
  const r2 = decidir('la clave es 9999', decidir('la clave es 1234', null, tarde, links).contacto, tarde + MIN, links);
  assert.strictEqual(r2.respuesta, null);
  assert.strictEqual(r2.aviso, 'normal');
  assert.strictEqual(r2.ocultar, true);
  // Hablar de «clave» o «contraseña» sin dar una no la dispara; el Mac bloqueado es otro caso.
  assert.notStrictEqual(decidir('olvidé mi contraseña de windows', null, tarde, links).intencion, 'clave');
  assert.strictEqual(decidir('mi macbook está bloqueado, olvidé la contraseña', null, tarde, links).intencion, 'mac_bloqueo');
});

test('SAL-10: «te pasaste», «nos vemos», «quedo atento» → una sola respuesta tras un cierre del bot', () => {
  for (const s of ['te pasaste', 'nos vemos', 'quedo atenta', 'ya gracias']) {
    const a = decidir('cuanto sale formatear', null, tarde, links);
    const b = decidir(s, a.contacto, tarde + 5 * MIN, links);
    assert.strictEqual(b.intencion, 'gracias', s);
    assert.strictEqual(b.respuesta !== null && /^(De nada, cualquier cosa me escribes\.|¡Un gusto!)/.test(b.respuesta), true, s);
    assert.strictEqual(decidir(s, b.contacto, tarde + 6 * MIN, links).respuesta, null, s);
  }
  assert.strictEqual(decidir('gracias', null, tarde, links).respuesta, null);          // sin cierre previo del bot
});

test('SAL-11: fuera de rubro (iPhone, impresora, router…) y excepción del Mac con bloqueo', () => {
  for (const s of ['arreglas iphone?', 'reparan impresoras', 'tengo un router malo', 'una camara', 'un televisor']) {
    const r = decidir(s, null, tarde, links);
    assert.strictEqual(r.intencion, 'otros_disp', s);
    assert.match(r.respuesta, /Nos dedicamos a notebooks y PC\. Eso no lo vemos|Eso no lo hacemos, solo notebooks y PC/, s);
  }
  const m = decidir('mi macbook quedó en la pantalla de inicio con bloqueo', null, tarde, links);
  assert.strictEqual(m.intencion, 'mac_bloqueo');
  assert.match(m.respuesta, /Es un caso especial: se lo paso a Gabriel/);
  assert.strictEqual(m.aviso, 'normal');
  assert.strictEqual(decidir('arreglas mac?', null, tarde, links).intencion, 'otros_disp');
});

test('SAL-12: compara fuera del flujo C → «conviene comparar», aviso «compara»; si pregunta qué incluye, lista de precios', () => {
  const r = decidir('estoy cotizando en otros lados', null, tarde, links);
  assert.strictEqual(r.intencion, 'compara');
  assert.match(r.respuesta, /Normal, conviene comparar\. Si quieres volver, aquí estamos\./);
  assert.strictEqual(r.aviso, 'normal');
  assert.match(r.resumen, /compara/);
  const p = decidir('estoy cotizando, que incluye el servicio?', null, tarde, links);
  assert.strictEqual(p.intencion, 'precio_general');
  assert.match(p.respuesta, /\$15\.000/);
});

test('SAL-13: «¿tiene garantía?» → texto provisional con GARANTIA_ACTIVA = false; el doc queda en GARANTIA_LEGAL', () => {
  const { GARANTIA_ACTIVA, GARANTIA_LEGAL } = require('./cerebro.js');
  assert.strictEqual(GARANTIA_ACTIVA, false);
  assert.match(GARANTIA_LEGAL[0], /30 días hábiles desde que lo retiras/);
  assert.match(GARANTIA_LEGAL[1], /Tiene garantía legal: 30 días hábiles/);
  const r = decidir('hola, tiene garantía el trabajo?', null, tarde, links);
  assert.strictEqual(r.intencion, 'garantia_q');
  assert.strictEqual(r.respuesta, 'Sí, el trabajo tiene garantía. Te la detalla Gabriel al tomar hora.');
  assert.strictEqual(r.aviso, 'normal');
  // «Sigue igual / volvió a fallar» mantiene la regla urgente de siempre.
  const g = decidir('sigue igual', { visto: tarde - H }, tarde, links);
  assert.strictEqual(g.intencion, 'garantia');
  assert.strictEqual(g.aviso, 'urgente');
  // Datos o miedo a perder archivos.
  assert.match(decidir('quiero formatear pero me da miedo perder mis archivos', null, tarde, links).respuesta, /respaldar tus archivos \(son \$5\.000 más\)/);
});

test('SAL-14: urgencia → aviso urgente, no promete hora; con el modo fuera, sin link de agenda', () => {
  const r = decidir('es urgente, lo necesito para hoy', null, tarde, links);
  assert.strictEqual(r.intencion, 'urgencia');
  assert.strictEqual(r.aviso, 'urgente');
  assert.match(r.respuesta, /Entiendo que es urgente\. Le aviso a Gabriel ahora para ver si hay hora hoy\./);
  assert.doesNotMatch(r.respuesta, /te espero|tienes hora|confirmad/i);
  const f = decidir('es urgente', null, tarde, linksFuera);
  assert.match(f.respuesta, /Entiendo que es urgente\. Le aviso a Gabriel ahora y te escribe por acá\./);
  assert.strictEqual(f.aviso, 'urgente');
});

test('SAL-15: reparación y web en el mismo mensaje → «dos temas» y parte por la que dijo primero', () => {
  const a = decidir('quiero formatear y además una web para mi negocio', null, tarde, links);
  assert.strictEqual(a.intencion, 'dos_temas');
  assert.match(a.respuesta, /Las dos cosas se pueden\. Parto por la reparación y después vemos la otra\. ¿Seguimos así\?/);
  assert.match(a.resumen, /dos temas/);
  assert.strictEqual(a.contacto.ag, undefined);
  const b = decidir('necesito una pagina web y además que me formateen el notebook', null, tarde, links);
  assert.strictEqual(b.intencion, 'dos_temas');
  assert.match(b.respuesta, /Parto por la página web/);
});

test('SAL-16: «hola?» tras un silencio del bot; repite la pregunta pendiente (B y C)', () => {
  const a = decidir('cuanto sale formatear', null, tarde, links);
  assert.strictEqual(decidir('hola?', a.contacto, tarde + MIN, links).respuesta, null);                 // aún no es silencio
  const b = decidir('hola?', a.contacto, tarde + 6 * MIN, links);
  assert.strictEqual(b.intencion, 'ping');
  assert.strictEqual(b.respuesta, 'Hola! Perdona la demora. ¿Qué necesitabas?');
  assert.strictEqual(b.aviso, 'normal');
  const m = decidir('quiero más memoria', null, tarde, links);
  const bm = decidir('alo?', m.contacto, tarde + 6 * MIN, links);
  assert.match(bm.respuesta, /Perdona la demora/);
  assert.match(bm.respuesta, /1️⃣/);
  assert.strictEqual(bm.contacto.pend.intentos, 0);
  let c = decidir('AGENDA', null, tarde, links);
  c = decidir('soy contador', c.contacto, tarde + S, links);
  const bc = decidir('hola?', c.contacto, tarde + 6 * MIN, links);
  assert.match(bc.respuesta, /Perdona la demora/);
  assert.match(bc.respuesta, /¿Ya tienes logo|¿ya tienes tu logo/i);
  assert.strictEqual(bc.contacto.ag.intentos, 0);
});

test('banco 22 / SAL-17: «¿eres un bot?» → asistente automático; «sí» pasa a Gabriel (SAL-3)', () => {
  let r = decidir('eres un bot?', null, tarde, links);
  assert.strictEqual(r.intencion, 'es_bot');
  assert.match(r.respuesta, /Soy el asistente automático de OCTAVOBIT\. Gabriel revisa los mensajes y responde lo que yo no puedo\. ¿Quieres que le avise\?/);
  assert.strictEqual(r.contacto.pend.q, 'BOT');
  const si = decidir('sí', JSON.parse(JSON.stringify(r.contacto)), tarde + MIN, links);
  assert.match(si.respuesta, /Le aviso a Gabriel y te responde por acá/);
  assert.strictEqual(si.aviso, 'urgente');
  const no = decidir('no gracias', JSON.parse(JSON.stringify(r.contacto)), tarde + MIN, links);
  assert.match(no.respuesta, /aquí estoy/);
  // Dentro del flujo C también se contesta.
  let c = decidir('AGENDA', null, tarde, links);
  c = decidir('eres un bot?', c.contacto, tarde + S, links);
  assert.strictEqual(c.intencion, 'es_bot');
});

test('SAL-18: «hola gab» o «busco a…» → este es el chat de OCTAVOBIT, aviso normal', () => {
  const r = decidir('hola gab', null, tarde, links);
  assert.strictEqual(r.intencion, 'otra_persona');
  assert.match(r.respuesta, /Este es el chat de OCTAVOBIT\. Si buscabas a Gabriel, le aviso para que te responda\./);
  assert.strictEqual(r.aviso, 'normal');
  assert.strictEqual(decidir('busco a Marcela', null, tarde, links).intencion, 'otra_persona');
  // Con otra intención de por medio, esa gana.
  assert.strictEqual(decidir('hola gab, cuanto sale formatear', null, tarde, links).intencion, 'formateo');
});

test('SAL-19: spam, ofertas de trabajo, cripto, inglés y «sent an attachment» → sin respuesta ni aviso', () => {
  for (const s of ['We are hiring, trabajo estable desde casa', 'buscamos vendedores, ingresos extra desde casa', 'invierte en criptomonedas', 'Hello dear, are you available for this offer please', 'Gabriel sent an attachment', 'te agregaron al grupo de ofertas']) {
    const r = decidir(s, null, tarde, links);
    assert.strictEqual(r.intencion, 'spam', s);
    assert.strictEqual(r.respuesta, null, s);
    assert.strictEqual(r.aviso, null, s);
  }
  // Un mensaje legítimo en español o con una palabra en inglés no es spam.
  assert.notStrictEqual(decidir('hola, mi notebook HP no prende', null, tarde, links).intencion, 'spam');
  assert.notStrictEqual(decidir('ok thanks, quiero formatear', null, tarde, links).intencion, 'spam');
  // El spam no abre ni rompe un flujo en marcha.
  let c = decidir('AGENDA', null, tarde, links);
  c = decidir('trabajo estable, ingresos extra', c.contacto, tarde + S, links);
  assert.strictEqual(c.respuesta, null);
  assert.strictEqual(c.contacto.ag.rubro, null);
});

test('SAL-20: insulto o mensaje sin sentido → respuesta neutra y retoma la pregunta; la segunda vez, silencio y aviso', () => {
  let r = decidir('asdfghjk', null, tarde, links);
  assert.strictEqual(r.respuesta, 'Hola! ¿En qué te puedo ayudar?');
  assert.strictEqual(r.aviso, null);
  r = decidir('zxcvbnm', r.contacto, tarde + MIN, links);
  assert.strictEqual(r.respuesta, null);
  assert.strictEqual(r.aviso, 'normal');
  assert.match(r.resumen, /mensaje confuso/);
  let c = decidir('AGENDA', null, tarde, links);
  c = decidir('eres un idiota', c.contacto, tarde + S, links);
  assert.match(c.respuesta, /^Hola! ¿En qué te puedo ayudar\?/);
  assert.match(c.respuesta, /a qué te dedicas/);
  assert.strictEqual(c.contacto.ag.intentos, 0);
  assert.strictEqual(decidir('jajaja', null, tarde, links).intencion !== 'confuso', true);
  assert.notStrictEqual(decidir('hola construcción transplante', null, tarde, links).intencion, 'confuso');
});

// ---------------------------------------------------------------------------
// D · Seguimiento.
// ---------------------------------------------------------------------------
const cr = ts => new Date(ts).toLocaleString('es-CL', { timeZone: 'America/Santiago', hour12: false });

test('D: regla de tiempo (ejemplos 1 a 4) con el horario de Chile', () => {
  const { momentoSeguimiento } = require('./cerebro.js');
  const en = (v) => momentoSeguimiento(v);
  assert.strictEqual(en(tarde), tarde + 5 * H);                                // 15:00 → 20:00 (ejemplo 1)
  assert.strictEqual(en(tarde + 2.5 * H), tarde + 19 * H);                     // 17:30 → 10:00 siguiente, 16,5 h (ejemplo 2)
  assert.strictEqual(en(tarde + 2.5 * H) - (tarde + 2.5 * H), 16.5 * H);
  assert.strictEqual(en(tarde + 11 * H), tarde + 19 * H);                      // 02:00 → 10:00, 8 h (ejemplo 3)
  assert.strictEqual(en(tarde + 11 * H) - (tarde + 11 * H), 8 * H);
  const v = tarde + 8 * H + 50 * MIN;                                           // 23:50 → 10:00, 10 h 10 min (ejemplo 4)
  assert.strictEqual(en(v), tarde + 19 * H);
  assert.strictEqual(en(v) - v, 10 * H + 10 * MIN);
  assert.match(cr(en(v)), /10:00:00/);
  // Nunca si pasan más de 23 h: a las 21:30 las 5 h son las 02:30 y las 10:00 caen a 12,5 h; a las 11:30 pasa de 23 h.
  assert.ok(en(tarde + 6.5 * H) !== null);
  assert.strictEqual(en(tarde - 3.5 * H + 0), tarde - 3.5 * H + 5 * H);        // 11:30 → 16:30
});

test('D ejemplo 1: AG-4a a las 15:00 sin reserva → SEG-1 a las 20:00, uno solo', () => {
  const { seguimientos } = require('./cerebro.js');
  const r = hastaAG3();
  const f = decidir('dale', r.contacto, tarde + 10 * S, links);
  assert.strictEqual(f.contacto.seg.tipo, 'SEG-1');
  const m = { u1: f.contacto };
  assert.deepStrictEqual(seguimientos(m, tarde + 4 * H + 59 * MIN, links), []);          // todavía no son las 5 h
  const env = seguimientos(m, tarde + 5 * H + 10 * S, links);
  assert.strictEqual(env.length, 1);
  assert.strictEqual(env[0].remitente, 'u1');
  assert.strictEqual(env[0].intencion, 'seg_1');
  assert.match(env[0].texto, /¿Pudiste ver la agenda\?|8vobit\.xyz\/#reunion/);
  assert.strictEqual(m.u1.ultimoTexto, env[0].texto);                                    // eco: no se confunde con Gabriel
  assert.deepStrictEqual(seguimientos(m, tarde + 6 * H, links), []);                     // nunca más de uno
});

test('D ejemplo 2 / banco 28: AG-4a a las 17:30 → SEG-1 a las 10:00 del día siguiente', () => {
  const { seguimientos } = require('./cerebro.js');
  const t = tarde + 2.5 * H;
  const f = decidir('dale', hastaAG3(t - 10 * S).contacto, t, links);
  assert.strictEqual(f.contacto.seg.tipo, 'SEG-1');
  const m = { u1: f.contacto };
  assert.deepStrictEqual(seguimientos(m, t + 5 * H, links), []);                         // 22:30: fuera de horario
  assert.deepStrictEqual(seguimientos(m, t + 10 * H, links), []);                        // 03:30
  assert.deepStrictEqual(seguimientos(m, tarde + 19 * H - MIN, links), []);              // 09:59
  assert.strictEqual(seguimientos(m, tarde + 19 * H, links).length, 1);                  // 10:00
});

test('D: el cron tolera hasta las 20:15; pasada esa hora espera al otro día si no pasan 23 h', () => {
  const { seguimientos } = require('./cerebro.js');
  const f = decidir('dale', hastaAG3().contacto, tarde + 10 * S, links);
  const m = { u1: JSON.parse(JSON.stringify(f.contacto)) };
  assert.deepStrictEqual(seguimientos(m, tarde + 6 * H + 10 * MIN, links), []);          // 21:10: fuera de la ventana de envío
  assert.strictEqual(seguimientos(m, tarde + 19 * H, links).length, 1);                  // al día siguiente, 10:00 (19 h)
  const v = { u1: JSON.parse(JSON.stringify(f.contacto)) };
  assert.deepStrictEqual(seguimientos(v, tarde + 24 * H, links), []);                    // más de 23 h: nunca
  assert.strictEqual(v.u1.seg, null);
});

test('D ejemplo 5 / banco 27: «agendé a las 11:30» después de AG-4a → no hay seguimiento', () => {
  const { seguimientos } = require('./cerebro.js');
  let r = decidir('dale', hastaAG3().contacto, tarde + 10 * S, links);
  r = decidir('agendé a las 11:30', r.contacto, tarde + 40 * MIN, links);
  assert.strictEqual(r.contacto.seg, null);
  assert.deepStrictEqual(seguimientos({ u1: r.contacto }, tarde + 6 * H, links), []);
});

test('D ejemplo 6: AG-4b («ahora no») nunca recibe seguimiento; postergar (SAL-6) y «lo pienso» tampoco', () => {
  const { seguimientos } = require('./cerebro.js');
  const n = decidir('ahora no', hastaAG3().contacto, tarde + 10 * S, links);
  assert.strictEqual(n.contacto.seg, null);
  assert.deepStrictEqual(seguimientos({ u: n.contacto }, tarde + 6 * H, links), []);
  const p = decidir('te aviso', hastaAG3().contacto, tarde + 10 * S, links);          // SAL-6
  assert.strictEqual(p.contacto.seg, null);
  const l = decidir('lo pienso', hastaAG3().contacto, tarde + 10 * S, links);
  assert.strictEqual(l.contacto.seg, null);
});

test('D ejemplo 7: AG-1 a las 12:00 → SEG-2 a las 17:00 → «sí, cuéntame» pasa a Gabriel con aviso urgente', () => {
  const { seguimientos } = require('./cerebro.js');
  const t = tarde - 3 * H;                                                               // 12:00
  let r = decidir('AGENDA', null, t - 10 * S, links);
  r = decidir('soy contador', r.contacto, t, links);
  assert.strictEqual(r.intencion, 'web_marca');
  assert.strictEqual(r.contacto.seg.tipo, 'SEG-2');
  const m = { u1: r.contacto };
  const env = seguimientos(m, t + 5 * H, links);                                         // 17:00
  assert.strictEqual(env.length, 1);
  assert.strictEqual(env[0].intencion, 'seg_2');
  assert.match(env[0].texto, /8vobit\.xyz\/#agendar/);
  const resp = decidir('sí, cuéntame', m.u1, t + 5 * H + 5 * MIN, links);
  assert.strictEqual(resp.intencion, 'seg_respuesta');
  assert.strictEqual(resp.aviso, 'urgente');
  assert.match(resp.resumen, /respondió al seguimiento/);
  assert.match(resp.respuesta, /Gabriel/);
  assert.strictEqual(resp.contacto.ag.paso, 'fin');
  assert.strictEqual(resp.contacto.seg, null);
});

test('D: responder «agendé» o «ahora no» al seguimiento no se toma como interés', () => {
  const { seguimientos } = require('./cerebro.js');
  const f = decidir('dale', hastaAG3().contacto, tarde + 10 * S, links);
  const m = { u1: f.contacto };
  seguimientos(m, tarde + 5 * H + 10 * S, links);
  const r = decidir('ya agendé gracias', m.u1, tarde + 5 * H + 5 * MIN, links);
  assert.notStrictEqual(r.intencion, 'seg_respuesta');
});

test('D: SEG-3 — «voy en camino» o «agendé» en reparación sin «llegué» → «¿Pudiste pasar?» a las 5 h', () => {
  const { seguimientos } = require('./cerebro.js');
  for (const s of ['ya voy en camino', 'Agendé para el lunes a las 10', 'voy para alla']) {
    const r = decidir(s, null, tarde, links);
    assert.strictEqual(r.contacto.seg && r.contacto.seg.tipo, 'SEG-3', s);
    const env = seguimientos({ u: JSON.parse(JSON.stringify(r.contacto)) }, tarde + 5 * H, links);
    assert.strictEqual(env.length, 1, s);
    assert.match(env[0].texto, /¿Pudiste pasar\? Si no alcanzaste, dime y vemos otra hora: https:\/\/agenda\.test/, s);
  }
  // «Llegué» después cancela; también cualquier mensaje posterior del cliente.
  let r = decidir('ya voy en camino', null, tarde, links);
  r = decidir('llegué', r.contacto, tarde + H, links);
  assert.strictEqual(r.contacto.seg, null);
  let o = decidir('ya voy en camino', null, tarde, links);
  o = decidir('ok', o.contacto, tarde + H, links);
  assert.strictEqual(o.contacto.seg, null);
  // Con el modo fuera activo no se pregunta «¿pudiste pasar?».
  const f = decidir('Agendé para el lunes a las 10', null, tarde, linksFuera);
  assert.strictEqual(f.contacto.seg, null);
});

test('D: Gabriel escribió a mano → se cancela el seguimiento', () => {
  const { seguimientos } = require('./cerebro.js');
  const f = decidir('dale', hastaAG3().contacto, tarde + 10 * S, links);
  f.contacto.gabriel = tarde + H;                                                        // respondió a mano después
  const m = { u1: f.contacto };
  assert.deepStrictEqual(seguimientos(m, tarde + 5 * H + 10 * S, links), []);
  assert.strictEqual(m.u1.seg, null);
  // Con Gabriel activo al momento de calcular, ni siquiera se abre el episodio.
  const g = decidir('dale', Object.assign({}, hastaAG3().contacto, { gabriel: tarde }), tarde + 10 * S, links);
  assert.strictEqual(g.contacto.seg, null);
});

test('D: el flujo de n8n incluye el Schedule, el Code «Seguimientos» y el HTTP, con conexiones válidas', () => {
  const fs = require('node:fs');
  const f = JSON.parse(fs.readFileSync(require('node:path').join(__dirname, '..', 'flujo-dm-instagram.json'), 'utf8'));
  const nombres = new Set(f.nodes.map(n => n.name));
  for (const n of ['Cada 15 minutos', 'Seguimientos', 'Responder seguimiento']) assert.ok(nombres.has(n), n);
  assert.strictEqual(f.nodes.find(n => n.name === 'Cada 15 minutos').type, 'n8n-nodes-base.scheduleTrigger');
  assert.deepStrictEqual(f.connections['Cada 15 minutos'].main[0][0].node, 'Seguimientos');
  assert.deepStrictEqual(f.connections['Seguimientos'].main[0][0].node, 'Responder seguimiento');
  for (const [origen, v] of Object.entries(f.connections)) {
    assert.ok(nombres.has(origen), origen);
    for (const salidas of v.main) for (const d of salidas) assert.ok(nombres.has(d.node), d.node);
  }
  const decide = f.nodes.find(n => n.name === 'Verificar firma y decidir').parameters.jsCode;
  assert.match(decide, /ocultar/);
  assert.match(decide, /tipoAdj/);
  assert.match(f.nodes.find(n => n.name === 'Seguimientos').parameters.jsCode, /seguimientos\(memoria\.contactos/);
});

// ---------------------------------------------------------------------------
// Iteración 2 de D y E.
// ---------------------------------------------------------------------------
test('SAL-9: claves con palabras intermedias o sin conector también se ocultan', () => {
  for (const s of ['la clave del wifi es 1234', 'password Hunter2 no me entra', 'pin 4321', 'mi contraseña de correo es Abc12345', 'pass: 8899']) {
    const r = decidir(s, null, tarde, links);
    assert.strictEqual(r.ocultar, true, s);
    assert.strictEqual(r.intencion, 'clave', s);
    assert.doesNotMatch(JSON.stringify([r.resumen, r.respuesta]), /1234|Hunter2|4321|Abc12345|8899/, s);
  }
});

test('SAL-9: red de seguridad — con una clave y otra intención, el texto va oculto igual', () => {
  const r = decidir('mi clave de windows es abc123, no me deja entrar', null, tarde, links);
  assert.strictEqual(r.ocultar, true);
  assert.doesNotMatch(JSON.stringify([r.resumen, r.respuesta]), /abc123/);
  // Sin respuesta del bot por Gabriel conversando, sigue oculto.
  const g = decidir('la clave es hunter22', { visto: tarde - H, gabriel: tarde - H, enviados: {}, bots: [] }, tarde, links);
  assert.strictEqual(g.ocultar, true);
  assert.strictEqual(g.respuesta, null);
  // En un flujo en marcha también.
  let f = decidir('AGENDA', null, tarde, links);
  f = decidir('soy contador, mi clave de instagram es qwer1234', f.contacto, tarde + S, links);
  assert.strictEqual(f.ocultar, true);
  assert.strictEqual(f.contacto.ag.rubro, null);
});

test('SAL-9: «mi clave de windows no me funciona» (sin valor) no se oculta y sigue en formateo', () => {
  const r = decidir('mi clave de windows no me funciona', null, tarde, links);
  assert.notStrictEqual(r.ocultar, true);
  assert.strictEqual(r.intencion, 'formateo');
  assert.notStrictEqual(decidir('olvidé mi contraseña', null, tarde, links).ocultar, true);
});

test('SAL-19: «vendedores» o «trabajo estable» sueltos no son spam; las ofertas con contexto sí', () => {
  for (const s of ['los vendedores de la tienda me cambiaron la pantalla', 'mi trabajo estable necesita el pc', 'hablé con los vendedores y no me instalaron office']) {
    const r = decidir(s, null, tarde, links);
    assert.notStrictEqual(r.intencion, 'spam', s);
  }
  assert.strictEqual(decidir('los vendedores de la tienda me cambiaron la pantalla', null, tarde, links).intencion, 'pantalla');
  for (const s of ['buscamos vendedores, ingresos extra desde casa', 'tenemos vacantes, únete a nuestro equipo', 'trabajo estable desde casa, ganar dinero', 'ofrecemos oportunidad laboral']) {
    assert.strictEqual(decidir(s, null, tarde, links).intencion, 'spam', s);
  }
  // Nunca spam si trae una intención de servicio, aunque tenga palabras de oferta.
  assert.notStrictEqual(decidir('ofrecemos mejores precios? mi pantalla no prende', null, tarde, links).intencion, 'spam');
});

test('SAL-10: «ok», «ya», «dale», «jaja», «👍» de un contacto nuevo no reciben bienvenida; «hola» sí', () => {
  for (const s of ['ok', 'ya', 'dale', 'jaja', 'jajaja', '👍', '🙃🙃', 'sii', 'oki', '?']) {
    const r = decidir(s, null, tarde, links);
    assert.strictEqual(r.respuesta, null, s);
    assert.strictEqual(r.aviso, 'normal', s);
    const n = decidir(s, null, noche, links);                                   // tampoco «te respondo mañana» de noche
    assert.strictEqual(n.respuesta, null, s);
  }
  assert.match(decidir('hola', null, tarde, links).respuesta, /hola/i);
  assert.match(decidir('hola buenas tardes', null, tarde, links).respuesta, /hola|Hola/i);
  // Un mensaje sin intención que no es un acuse sigue recibiendo la bienvenida.
  assert.ok(decidir('buenas, una consulta', null, tarde, links).respuesta);
});

function tras(seg, texto, t) {
  // Lleva un contacto hasta el envío del seguimiento `seg` y responde `texto` 5 min después.
  const { seguimientos } = require('./cerebro.js');
  let c, t0;
  if (seg === 'SEG-1') { t0 = tarde; c = decidir('dale', hastaAG3().contacto, t0 + 10 * S, links).contacto; }
  else if (seg === 'SEG-2') { t0 = tarde - 3 * H; c = decidir('soy contador', decidir('AGENDA', null, t0 - 10 * S, links).contacto, t0, links).contacto; }
  else { t0 = tarde; c = decidir('ya voy en camino', null, t0, links).contacto; }
  const m = { u: c };
  const env = seguimientos(m, t0 + 5 * H + 10 * S, links);
  assert.strictEqual(env.length, 1, seg);
  return { r: decidir(texto, m.u, t0 + 5 * H + 5 * MIN, links), m, t0 };
}

test('Respuesta al seguimiento: acuses y reacciones no escalan ni se responden', () => {
  for (const seg of ['SEG-1', 'SEG-2', 'SEG-3']) {
    for (const s of ['jaja', 'ok', 'ya', '👍', 'oki']) {
      const { r } = tras(seg, s);
      assert.strictEqual(r.respuesta, null, seg + ' ' + s);
      assert.notStrictEqual(r.aviso, 'urgente', seg + ' ' + s);
      assert.notStrictEqual(r.intencion, 'seg_respuesta', seg + ' ' + s);
    }
  }
  // El acuse no consume el episodio: un mensaje real después sí escala.
  const { r, t0 } = tras('SEG-1', 'ok');
  const real = decidir('quiero cambiar la hora de la llamada', r.contacto, t0 + 5 * H + 10 * MIN, links);
  assert.strictEqual(real.intencion, 'seg_respuesta');
  assert.strictEqual(real.aviso, 'urgente');
});

test('Respuesta al seguimiento: «gracias» sigue SAL-10 (sin escalar)', () => {
  const { r } = tras('SEG-1', 'gracias');
  assert.notStrictEqual(r.intencion, 'seg_respuesta');
  assert.notStrictEqual(r.aviso, 'urgente');
});

test('Respuesta al seguimiento: «sí»/«dale» tras SEG-1 da el link de la llamada (urgente); tras SEG-2 retoma la pregunta', () => {
  for (const s of ['sí', 'dale']) {
    const a = tras('SEG-1', s).r;
    assert.strictEqual(a.intencion, 'seg_interes_link', s);
    assert.match(a.respuesta, /8vobit\.xyz\/#reunion/, s);
    assert.strictEqual(a.aviso, 'urgente', s);
    assert.match(a.resumen, /Lead agenda/, s);
    const b = tras('SEG-2', s).r;
    assert.strictEqual(b.intencion, 'seg_retoma', s);
    assert.match(b.respuesta, /¿Ya tienes logo|¿ya tienes tu logo/i, s);
    assert.notStrictEqual(b.aviso, 'urgente', s);
    assert.strictEqual(b.contacto.ag.paso, 'marca', s);
  }
  // Sigue el flujo después de retomar.
  const { r } = tras('SEG-2', 'sí');
  const s2 = decidir('1', r.contacto, tarde + 20 * H, links);
  assert.strictEqual(s2.intencion, 'web_hoy');
});

test('Respuesta al seguimiento: el contenido real sigue escalando a Gabriel', () => {
  const { r } = tras('SEG-1', 'sí, cuéntame cuánto demora');
  assert.strictEqual(r.intencion, 'seg_respuesta');
  assert.strictEqual(r.aviso, 'urgente');
  assert.match(r.respuesta, /Le aviso a Gabriel/);
  const s3 = tras('SEG-3', 'no pude, mañana paso').r;
  assert.strictEqual(s3.intencion, 'seg_respuesta');
});

test('plazo de la pantalla (13-nov): responde 7 a 14 días hábiles, no el precio', () => {
  const frases = ['cuanto demora una pantalla', 'cuánto se demora el cambio de pantalla?', 'cuanto tiempo tarda cambiar la pantalla',
    'en cuantos dias me cambian la pantalla', 'cuantas semanas demora la pantalla', 'pantalla rota, cuanto demora', 'para cuando estaria la pantalla'];
  for (const f of frases) {
    const r = decidir(f, null, tarde, links);
    assert.strictEqual(r.intencion, 'tiempo_pantalla', f);
    assert.match(r.respuesta, /7 a 14 días hábiles/, f);
    assert.doesNotMatch(r.respuesta, /\$25\.000/, f);
  }
});

test('plazo de otras piezas: respuesta general de tiempos; sin pieza no cambia', () => {
  assert.strictEqual(decidir('cuanto demora cambiar la bateria', null, tarde, links).intencion, 'tiempo');
  assert.strictEqual(decidir('cuanto demora', null, tarde, links).intencion, 'tiempo');
  assert.strictEqual(decidir('cuanto sale la pantalla', null, tarde, links).intencion, 'pantalla');
});

test('de noche, quien ya conversó recibe la respuesta con datos (no "lo veo mañana")', () => {
  const nocheCL = Date.parse('2026-10-16T03:00:00Z');   // 00:00 en Chile
  const a = decidir('cuanto sale formatear', null, nocheCL - 3600e3, links);
  assert.ok(a.respuesta);
  const r = decidir('cuanto demora una pantalla', a.contacto, nocheCL, links);
  assert.strictEqual(r.intencion, 'tiempo_pantalla');
  assert.match(r.respuesta, /7 a 14 días hábiles/);
  assert.doesNotMatch(r.respuesta, /mañana/);
});

test('de día, si Gabriel conversa o es conversación en curso, el bot sigue callando los datos', () => {
  const a = decidir('cuanto sale formatear', null, tarde, links);
  const r = decidir('cuanto demora una pantalla', a.contacto, tarde + 600e3, links);
  assert.strictEqual(r.respuesta, null);
});
