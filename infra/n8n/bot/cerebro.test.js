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

test('cierre de AGENDA en el flujo web: precio de lista y página de la agenda', () => {
  let r = decidir('AGENDA', null, tarde, links);
  r = decidir('kinesióloga', r.contacto, tarde + 1e3, links);
  r = decidir('por whatsapp', r.contacto, tarde + 2e3, links);
  r = decidir('este mes', r.contacto, tarde + 3e3, links);
  assert.strictEqual(r.intencion, 'web_cierre');
  assert.match(r.respuesta, /\$190\.000 \+ \$14\.990/);
  assert.match(r.respuesta, /tu-agenda/);
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

test('flujo web completo con botones: pedidos, caliente → Gassuso, reunión y aviso urgente', () => {
  let r = decidir('quiero una pagina web', null, tarde, links);
  // "pagina web" ya dice qué quiere: salta a la pregunta del negocio
  assert.strictEqual(r.contacto.web.eleccion, 'PAGINA');
  r = decidir('', null, tarde, links, 'MENU_WEB');
  assert.strictEqual(r.botones.length, 4);
  r = decidir('Pedidos para mi local', r.contacto, tarde + 60e3, links, 'W_PEDIDOS');
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

test('flujo web: solo mirando no es urgente', () => {
  let r = decidir('', null, tarde, links, 'MENU_WEB');
  r = decidir('agenda', r.contacto, tarde + 1e3, links);
  r = decidir('psicóloga', r.contacto, tarde + 2e3, links);
  r = decidir('por whatsapp', r.contacto, tarde + 3e3, links);
  r = decidir('solo estoy mirando', r.contacto, tarde + 4e3, links);
  assert.strictEqual(r.aviso, 'normal');
  assert.match(r.respuesta, /#agendar/);
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
  assert.strictEqual(r.contacto.pend, null);
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

test('sal5_modelo ya no existe', () => {
  assert.strictEqual(require('./cerebro.js').TEXTOS.sal5_modelo, undefined);
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
