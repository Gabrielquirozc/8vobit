// Banco masivo del cerebro: GENERA los casos (frases x horas x estados) y los comprueba con invariantes.
// Uso: node --test infra/n8n/bot/cerebro.masivo.test.js
// Cada combinacion es un test() propio. Las invariantes no codifican respuestas exactas: dicen que cosas
// NUNCA pueden pasar (excepcion, Calendly, "mañana desde las 9" por la hora, precio inventado, etc.).
const test = require('node:test');
const assert = require('node:assert');
const { decidir, TEXTOS } = require('./cerebro.js');
const { chileATimestamp } = require('./simulador.js');

const MIN = 60e3, H = 3600e3;
const LINKS = { agenda: 'https://8vobit.xyz/#agendar', web: 'https://8vobit.xyz', pedidos: 'https://pedidos.8vobit.xyz' };
const LINKS_CALENDLY = { agenda: 'https://calendly.com/octavobit/diagnostico', web: 'https://8vobit.xyz', pedidos: 'https://pedidos.8vobit.xyz' };
const LINKS_VACIOS = { agenda: '', web: 'https://8vobit.xyz', pedidos: 'https://pedidos.8vobit.xyz' };

// Precios aprobados (marketing/PRECIOS-SERVICIO-TECNICO.md): lista FIJA escrita a mano. Si un precio cambia
// a proposito, se actualiza aqui y en cerebro.js a la vez; un precio inventado en un texto hace fallar el banco.
const PRECIOS_APROBADOS = ['$5.000', '$10.000', '$15.000', '$20.000', '$25.000', '$30.000', '$35.000', '$45.000', '$50.000'];
const norm = m => m.replace(/[\s.]/g, '');
const PRECIOS = new Set(PRECIOS_APROBADOS.map(norm));

// ---------------------------------------------------------------- frases base (familias de intencion)
// [texto, intencion esperada de decidir() para un contacto nuevo]
const FAMILIAS = {
  precios: [['cuanto sale formatear', 'formateo'], ['precio de la limpieza', 'limpieza'], ['cuanto cobran por la revision', 'precio_general'], ['cuanto cuesta arreglar un notebook', 'precio_general'], ['me das un presupuesto?', 'precio_general'], ['valor del diagnostico', 'precio_general']],
  plazos: [['cuanto demora una pantalla', 'tiempo_pantalla'], ['cuanto se demoran en formatear', 'formateo'], ['en cuantos dias estaria listo', 'tiempo'], ['para cuando estaria mi pc', 'tiempo']],
  pantalla: [['se me quebro la pantalla del notebook', 'pantalla'], ['cuanto sale cambiar la pantalla', 'pantalla'], ['pantalla rota hp pavilion', 'pantalla']],
  ssd: [['quiero cambiar el disco por un ssd', 'ssd'], ['cuanto sale un ssd de 500', 'ssd'], ['mi pc anda lento, sirve un disco solido?', 'ssd']],
  ram: [['quiero ampliar la ram', 'upgrade_ram'], ['cuanto cuesta subir la memoria ram a 16gb', 'upgrade_ram'], ['mi pc tiene poca memoria', 'memoria_duda']],
  bateria: [['cambio de bateria para mi lenovo', 'bateria'], ['la bateria dura nada', 'bateria'], ['precio bateria notebook', 'bateria']],
  teclado: [['cuanto sale cambiar el teclado', 'teclado'], ['se me mojo el teclado, tienen teclados?', 'teclado']],
  formateo: [['necesito formatear mi pc', 'formateo'], ['reinstalar windows cuanto cobran', 'formateo'], ['se me olvido la clave de windows', 'formateo']],
  limpieza: [['limpieza interna cuanto sale', 'limpieza'], ['mi notebook se calienta mucho', 'limpieza'], ['cambio de pasta termica', 'limpieza']],
  datos: [['puedo recuperar mis fotos', 'datos'], ['se me borraron los archivos', 'datos'], ['no quiero perder mis datos', 'respaldo']],
  ubicacion: [['donde estan ubicados?', 'ubicacion'], ['cual es la direccion?', 'ubicacion'], ['donde queda el taller', 'ubicacion']],
  horario: [['cual es el horario de atencion', 'horario'], ['atienden los sabados?', 'horario'], ['estan atendiendo?', 'horario']],
  domicilio: [['hacen retiro a domicilio?', 'domicilio'], ['pueden ir a buscar el equipo', 'domicilio']],
  descuento: [['tienen descuento para estudiantes?', 'descuento'], ['hay alguna promo?', 'descuento']],
  garantia: [['tiene garantia la reparacion?', 'garantia_q'], ['dan garantia?', 'garantia_q']],
  no_enciende: [['mi notebook no prende', 'no_enciende'], ['el pc no enciende y no da imagen', 'no_enciende'], ['se murio mi computador', 'no_enciende']],
  lento: [['mi compu esta muy lenta', 'lento'], ['se pega todo el rato', 'lento']],
  dano_vago: [['Hola se me le rompio el pc', 'dano_general'], ['no funciona mi notebook', 'dano_general'], ['mi compu esta mala', 'dano_general'], ['se echo a perder el computador', 'dano_general'], ['se puede reparar?', 'dano_general'], ['falla algo en mi pc', 'dano_general'], ['no funciona', 'dano_general']],
  // Casos negativos: mencionan equipo o "no funciona" pero NO son daño de equipo.
  no_es_dano: [['gracias, el pc quedo perfecto', 'gracias'], ['mil gracias por arreglar mi notebook', 'gracias'], ['ya retire el pc, gracias', 'gracias'], ['ya no falla, gracias!', 'gracias'], ['perfecto, mi notebook ya funciona', 'gracias'],
    ['no falla nada', 'sin_intencion'], ['hola gabo, te escribo por el notebook que te deje', 'otra_persona'], ['quiero comprar un notebook', 'sin_intencion'], ['tienes un notebook a la venta?', 'sin_intencion'],
    ['el link no funciona', 'sin_intencion'], ['la pagina no anda', 'sin_intencion'], ['falla de luz en el edificio?', 'sin_intencion'], ['es un notebook lenovo ideapad 3', 'sin_intencion'], ['mi notebook es un hp 240', 'sin_intencion']],
  // Agradecen pero reportan una falla: dano_general o garantia (urgente), NUNCA gracias.
  gracias_con_falla: [['el pc quedo malo de nuevo, gracias', ['garantia', 'dano_general']], ['hola, el notebook se apaga solo gracias', ['dano_general']], ['gracias, pero se me rompio otra vez', ['garantia', 'dano_general', 'sin_intencion']],
    ['gracias, mi pc esta fallando de nuevo', ['garantia', 'dano_general']], ['gracias, y tambien tengo otro notebook que no funciona', ['dano_general']], ['gracias, pero sigue fallando', ['garantia', 'dano_general']]],
  urgencia_mojado: [['mi notebook esta mojado', ['urgente']], ['se me cayo el cafe en el pc', ['urgente']], ['me urge, lo necesito para hoy', ['urgencia']], ['lo necesito para manana', ['urgencia']]],
  objeciones: [['uff muy caro', 'objecion'], ['esta carisimo', 'objecion'], ['estoy cotizando en otros lados', 'compara']],
  saludos: [['hola', 'saludo'], ['holaa buenas tardes', 'saludo'], ['buenos dias', 'saludo'], ['hooola', 'saludo'], ['como estas?', 'como_estas'], ['que tal', 'como_estas']],
  agradecimientos: [['gracias', 'gracias'], ['muchas gracias!', 'gracias'], ['ya perfecto', 'gracias'], ['bacan, gracias', 'gracias']],
  spam: [['Watch my private video https://x.app.link/abc', 'spam'], ['ganar dinero rapido, unete', 'spam'], ['compra bitcoin ahora', 'spam']],
  // Hoy el ingles cae en la heuristica de spam (silencio): queda documentado como decision pendiente de Gabriel.
  ingles: [['hello, do you repair laptops?', 'spam'], ['hi how much for a screen replacement', 'spam']],
  web_agenda: [['AGENDA', 'web_inicio'], ['quiero una pagina web para mi negocio', 'web_inicio'], ['DEMO', 'web_inicio'], ['quiero agendar una hora', 'agendar'], ['tienen horas disponibles?', 'agendar']],
  humano: [['quiero hablar con una persona', 'humano'], ['eres un bot?', 'es_bot'], ['hay alguien ahi?', 'humano']],
  estado: [['ya esta listo mi equipo?', 'estado'], ['alguna novedad del pc?', 'estado']],
  logistica: [['llegue, estoy abajo', 'llegada'], ['estoy afuera', 'llegada'], ['ya agende para el lunes', 'agendo']],
  otros: [['reparan celulares?', 'otros_disp'], ['tienen impresoras?', 'otros_disp'], ['trabajan con asus?', 'sin_intencion'], ['hacen reparaciones a placas madres?', 'sin_intencion'], ['tengo una duda', 'sin_intencion'], ['necesito ayuda urgente', 'urgencia']]
};
const ADJUNTOS = ['audio', 'image', 'video', 'share', 'otro'];

// Variantes generadas: original, MAYUSCULAS, sin tildes/signos, falta de ortografia, prefijo de saludo.
const sinTildes = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[?!¿¡]/g, '');
const faltas = s => s.replace(/qu/g, 'k').replace(/v/g, 'b').replace(/h/g, '').replace(/ll/g, 'y');
const VARIANTES = [s => s, s => s.toUpperCase(), sinTildes, faltas, s => 'hola buenas, ' + s, s => s + ' porfa'];

// Las variantes 0..2 (original, MAYUSCULAS, sin tildes/signos) conservan la intencion; el resto (faltas de
// ortografia, saludo delante, "porfa" detras) solo se someten a las invariantes de seguridad.
const CONSERVAN = 3;
const FRASES = [];
for (const [fam, lista] of Object.entries(FAMILIAS)) {
  for (const [base, esperada] of lista) {
    VARIANTES.forEach((v, k) => FRASES.push({ fam, texto: v(base), base, esperada: k < CONSERVAN ? esperada : null }));
  }
}
for (const a of ADJUNTOS) FRASES.push({ fam: 'adjunto', texto: '', adjunto: a });
for (const pl of ['MENU_REP', 'MENU_WEB']) FRASES.push({ fam: 'boton', texto: '', payload: pl });

const CON_RESPUESTA = { n: 0, total: 0 };
test.after(() => console.log('# casos de la matriz que producen respuesta: ' + CON_RESPUESTA.n + ' de ' + CON_RESPUESTA.total));
const HORAS = ['03:00', '09:00', '14:00', '21:00', '23:30'];
// estado: arma el contacto previo respecto de `ahora`.
const ESTADOS = {
  nuevo: () => null,
  'conversando hace 1 h': ahora => ({ visto: ahora - H, enviados: {}, bots: [] }),
  'Gabriel hace 2 min': ahora => ({ visto: ahora - H, gabriel: ahora - 2 * MIN, enviados: {}, bots: [] }),
  'Gabriel hace 9 min': ahora => ({ visto: ahora - H, gabriel: ahora - 9 * MIN, enviados: {}, bots: [] }),
  'Gabriel hace 11 min': ahora => ({ visto: ahora - H, gabriel: ahora - 11 * MIN, enviados: {}, bots: [] }),
  'Gabriel hace 3 h': ahora => ({ visto: ahora - 4 * H, gabriel: ahora - 3 * H, enviados: {}, bots: [] }),
  'ya recibio la respuesta hace 2 h': null,   // se arma con la misma frase (ver mas abajo)
  'conversando hace 30 h': ahora => ({ visto: ahora - 30 * H, enviados: {}, bots: [] })
};

function urls(t) { return Array.from(new Set((t.match(/https?:\/\/[^\s)]+/g) || []).map(u => u.replace(/[.,;]+$/, '')))); }
function llamar(f, contacto, ahora, links) {
  return decidir(f.texto, contacto, ahora, links || LINKS, f.payload || '', f.adjunto || '');
}

// Invariantes sobre UNA respuesta (aplican a cualquier hora y estado).
function invariantesRespuesta(r, f, ctx) {
  assert.ok(r && typeof r === 'object' && typeof r.intencion === 'string', 'devuelve un objeto con intencion');
  assert.ok(r.contacto && typeof r.contacto === 'object', 'devuelve el contacto');
  if (r.respuesta == null) return;
  const t = r.respuesta;
  assert.strictEqual(typeof t, 'string');
  assert.ok(t.trim().length > 0, 'respuesta no vacia');
  assert.ok(t.length <= 700, 'longitud ' + t.length + ' > 700');
  assert.doesNotMatch(t, /calendly/i, 'nunca Calendly');
  assert.doesNotMatch(t, /\{\{|undefined|\bnull\b|\[object/i, 'sin placeholders sueltos');
  assert.ok(urls(t).length <= 1, 'maximo un enlace distinto por mensaje: ' + urls(t).join(' '));
  if (/santiago/i.test(t)) assert.doesNotMatch(t, /pantalla/i, 'Santiago junto a pantalla');
  // Sin modo fuera, ningun texto promete respuesta "mañana" por la hora del dia ni suena a aviso de horario.
  assert.doesNotMatch(t, /fuera de horario|ma[ñn]ana desde las 9|respuesta autom[aá]tica|mensaje autom[aá]tico|lo veo ma[ñn]ana|te contesta ma[ñn]ana|te respondo con calma ma[ñn]ana/i, 'sin aviso nocturno');
  for (const m of t.match(/\$\s?\d[\d.]*/g) || []) assert.ok(PRECIOS.has(norm(m)), 'precio fuera de la lista: ' + m);
  for (const b of r.botones || []) assert.ok(String(b.titulo).length <= 20, 'boton largo: ' + b.titulo);
}

// ---------------------------------------------------------------- el banco: frase x hora x estado
for (const f of FRASES) {
  for (const hora of HORAS) {
    for (const [estado, armar] of Object.entries(ESTADOS)) {
      CON_RESPUESTA.total++;
      test(`[${f.fam}] "${(f.texto || f.adjunto || f.payload).slice(0, 40)}" · ${hora} · ${estado}`, () => {
        const ahora = chileATimestamp('2026-11-11', hora);
        let previo, previaRespuesta = null;
        if (armar) previo = armar(ahora);
        else {   // ya recibio la misma respuesta hace 2 h
          const p = llamar(f, null, ahora - 2 * H);
          previo = p.contacto; previaRespuesta = p.respuesta;
        }
        const r = llamar(f, previo, ahora);
        invariantesRespuesta(r, f);
        if (r.respuesta) CON_RESPUESTA.n++;
        // Intencion canonica (contacto nuevo o con conversacion previa, a cualquier hora).
        if (f.esperada && (estado === 'nuevo' || estado === 'conversando hace 1 h')) assert.ok([].concat(f.esperada).includes(r.intencion), 'intencion de "' + f.texto + '": ' + r.intencion);
        if (f.esperada && f.fam === 'no_es_dano') assert.notStrictEqual(r.intencion, 'dano_general');
        if (f.esperada && f.fam === 'gracias_con_falla') { assert.notStrictEqual(r.intencion, 'gracias'); assert.ok(!r.respuesta || !/De nada/i.test(r.respuesta)); }
        if (f.esperada && [].concat(f.esperada).includes('garantia') && estado === 'conversando hace 1 h') { assert.strictEqual(r.intencion, 'garantia'); assert.strictEqual(r.aviso, 'urgente'); }   // con historial: garantia urgente
        if (f.esperada && [].concat(f.esperada)[0] === 'urgente' && estado === 'nuevo') assert.strictEqual(r.aviso, 'urgente', 'aviso urgente');

        // Misma respuesta no se repite en 24 h (salvo un boton de menu: el cliente lo toco a proposito).
        if (previaRespuesta && r.respuesta && !f.payload) assert.notStrictEqual(r.respuesta, previaRespuesta, 'repite la respuesta en 24 h');

        // Pausa de Gabriel: < 10 min callado; >= 10 min responde igual que si Gabriel no hubiera escrito.
        if (estado === 'Gabriel hace 2 min' || estado === 'Gabriel hace 9 min') assert.strictEqual(r.respuesta, null, 'Gabriel activo debe callar al bot');
        if (estado === 'Gabriel hace 11 min' || estado === 'Gabriel hace 3 h') {
          const sin = llamar(f, Object.assign(armar(ahora), { gabriel: 0 }), ahora);   // contacto fresco: decidir muta enviados
          assert.strictEqual(r.respuesta == null, sin.respuesta == null, 'pasados 10 min el bot debe responder como siempre');
        }

        // 24/7: la misma consulta se trata igual de dia y de noche (salvo «estoy abajo», que de noche no promete bajar).
        // Los estados relativos a `ahora` se rearman a las 15:00 para comparar manzanas con manzanas.
        if (armar && !/^Gabriel/.test(estado)) {
          const tarde = chileATimestamp('2026-11-11', '15:00');
          const rt = llamar(f, armar(tarde), tarde);
          if (r.intencion !== 'llegada') {
            assert.strictEqual(r.intencion, rt.intencion, 'la intencion no depende de la hora');
            assert.strictEqual(r.respuesta == null, rt.respuesta == null, 'a las ' + hora + ' responde distinto que a las 15:00');
          }
        }
      });
    }
  }
}

// ---------------------------------------------------------------- enlaces: nunca Calendly
for (const [nombre, links] of [['calendly', LINKS_CALENDLY], ['vacio', LINKS_VACIOS]]) {
  for (const f of FRASES.filter(x => ['precios', 'no_enciende', 'dano_vago', 'web_agenda', 'agradecimientos'].includes(x.fam))) {
    test(`enlace de agenda ${nombre}: "${f.texto.slice(0, 40)}" nunca manda Calendly`, () => {
      const r = llamar(f, null, chileATimestamp('2026-11-11', '23:30'), links);
      invariantesRespuesta(r, f);
      if (r.respuesta && /agend/i.test(r.respuesta) && urls(r.respuesta).length) assert.match(urls(r.respuesta)[0], /8vobit\.xyz/);
    });
  }
}

// ---------------------------------------------------------------- todos los TEXTOS cumplen las reglas de forma
for (const [clave, opciones] of Object.entries(TEXTOS)) {
  opciones.forEach((t, i) => {
    test(`TEXTOS.${clave}[${i}]: sin Calendly, <=1 enlace, precios de la lista, sin aviso nocturno`, () => {
      const real = t.split('{{LINK_AGENDA}}').join('https://8vobit.xyz/#agendar').split('{{LINK_WEB}}').join('https://8vobit.xyz').split('{{LINK_PEDIDOS}}').join('https://pedidos.8vobit.xyz');
      assert.doesNotMatch(real, /calendly/i);
      if (!/^fuera_/.test(clave)) assert.doesNotMatch(real, /fuera de horario|ma[ñn]ana desde las 9|autom[aá]tica?\b.*ma[ñn]ana/i);
      if (/santiago/i.test(real)) assert.doesNotMatch(real, /pantalla/i);
      for (const m of real.match(/\$\s?\d[\d.]*/g) || []) assert.ok(PRECIOS.has(norm(m)), m);
    });
  });
}

// ---------------------------------------------------------------- fuzz: ninguna entrada lanza excepcion
const FUZZ = [
  ['vacio', ''], ['solo espacios', '    \n\t '], ['solo emojis', '😀🔥👍🏽🙏'], ['5000 caracteres', 'hola cuanto sale formatear '.repeat(200)],
  ['unicode raro', '𝓗𝓸𝓵𝓪 ‮cuanto‬ sale ﷽ Ω≈ç√∫'], ['MAYUSCULAS', 'CUANTO SALE LA PANTALLA??'], ['sin tildes', 'donde estan ubicados'],
  ['faltas', 'kuanto sale aser una limpiesa'], ['solo signos', '?????!!!!...'], ['numeros', '123456789012'], ['url larga', 'https://' + 'a'.repeat(3000) + '.com'],
  ['null bytes', 'hola\u0000mundo'], ['saltos', 'hola\n\n\n\ncuanto\r\nsale'], ['regex', '(((.*+?[^$\\'], ['html', '<script>alert(1)</script>'], ['json', '{"a":1}'],
  ['clave', 'mi clave es Hunter2 y el pin 1234'], ['rut', '12.345.678-5'], ['mezcla', 'hola cuanto sale la pantalla pero tambien el ssd y estoy afuera'],
  ['repetido', 'a'.repeat(5000)], ['espacios internos', 'c u a n t o   s a l e'], ['emoji con texto', '🙏 gracias 🙏 amigo 🙏'], ['numero como texto', 5], ['undefined', undefined], ['null', null], ['objeto', {}]
];
for (const [nombre, entrada] of FUZZ) {
  for (const hora of HORAS) {
    test(`fuzz ${nombre} · ${hora}: no lanza y cumple invariantes`, () => {
      const ahora = chileATimestamp('2026-11-11', hora);
      let r;
      assert.doesNotThrow(() => { r = decidir(entrada, null, ahora, LINKS, '', ''); });
      invariantesRespuesta(r, { texto: String(entrada) });
      assert.doesNotThrow(() => { r = decidir(entrada, r.contacto, ahora + 30 * MIN, LINKS, '', ''); });
      invariantesRespuesta(r, { texto: String(entrada) });
    });
  }
}

// ---------------------------------------------------------------- secuencias largas: la memoria no rompe nada
// Los flujos web/agenda y los botones de menu quedan fuera: cada paso contesta un mensaje y el tope de 3 por hora no los corta.
const SIN_FLUJOS = FRASES.filter(x => !['web_agenda', 'boton'].includes(x.fam));
test('conversacion de 40 turnos mezclando frases: nunca lanza, nunca repite, nunca mas de 3 por hora', () => {
  let c = null;
  let ahora = chileATimestamp('2026-11-11', '22:50');
  const vistas = [];
  for (let i = 0; i < 40; i++) {
    const f = SIN_FLUJOS[(i * 7) % SIN_FLUJOS.length];
    const r = llamar(f, c, ahora);
    invariantesRespuesta(r, f);
    c = r.contacto;
    if (r.respuesta) vistas.push({ t: r.respuesta, ts: ahora });
    ahora += (i % 5) * 7 * MIN + MIN;
  }
  for (const v of vistas) assert.ok(vistas.filter(x => x.ts > v.ts - H && x.ts <= v.ts).length <= 3, 'mas de 3 respuestas en una hora');
});

// ---------------------------------------------------------------- MODO_FUERA: unico caso con textos de ausencia
for (const hora of HORAS) {
  for (const f of FRASES.filter(x => ['logistica', 'saludos', 'precios', 'no_enciende'].includes(x.fam))) {
    test(`MODO_FUERA activo · ${hora} · "${f.texto.slice(0, 30)}": no lanza, <=700 y sin Calendly`, () => {
      const ahora = chileATimestamp('2026-11-11', hora);
      const links = Object.assign({ fuera: '2026-11-15' }, LINKS);
      const r = llamar(f, { visto: ahora - H, enviados: {}, bots: [] }, ahora, links);
      if (r.respuesta) { assert.ok(r.respuesta.length <= 700); assert.doesNotMatch(r.respuesta, /calendly/i); }
    });
  }
}

// ---------------------------------------------------------------- falla real del 13-nov y simulador
test('13-nov 01:34: "Hola se me le rompio el pc" recibe pregunta de sintoma, sin aviso nocturno ni Calendly', () => {
  const { crearConversacion } = require('./simulador.js');
  for (const hora of ['01:34', '03:00', '15:00', '23:30']) {
    const conv = crearConversacion({ hora });
    const d = conv.cliente('Hola se me le rompio el pc');
    assert.strictEqual(d.intencion, 'dano_general', hora);
    assert.match(d.respuesta, /no enciende|no prende|qué hace tu equipo|qué le pasa/i, hora);
    assert.doesNotMatch(d.respuesta, /ma[ñn]ana|autom[aá]tic|calendly/i, hora);
  }
});

test('simulador: Gabriel responde a mano, el bot calla 10 min y despues vuelve; el reloj avanza', () => {
  const { crearConversacion } = require('./simulador.js');
  const conv = crearConversacion({ hora: '23:30' });
  conv.cliente('hola');
  conv.gabriel('Hola, te ayudo yo');
  conv.esperar(5);
  assert.strictEqual(conv.cliente('cuanto sale formatear').respuesta, null);
  conv.esperar(6);
  assert.ok(conv.cliente('cuanto sale formatear').respuesta);
  assert.ok(conv.historial.some(e => e.quien === 'gabriel'));
});

// ---------------------------------------------------------------- pendiente MODELO: responder el modelo no repregunta el daño
for (const [nombre, texto, extra] of [['modelo en texto', 'es un notebook lenovo ideapad 3', {}], ['modelo con "mi notebook es"', 'mi notebook es un hp 240', {}],
  ['modelo con Gabriel hace 11 min', 'es un notebook lenovo ideapad 3', { gabriel: -11 * MIN }], ['no se el modelo', 'no se el modelo', {}]]) {
  for (const hora of HORAS) {
    test(`MODELO pendiente · ${nombre} · ${hora}: no cae en dano_general`, () => {
      const ahora = chileATimestamp('2026-11-11', hora);
      const a = decidir('cuanto sale cambiar la pantalla', { visto: ahora - 20 * MIN, enviados: {}, bots: [] }, ahora - 10 * MIN, LINKS);
      assert.strictEqual(a.contacto.pend && a.contacto.pend.q, 'MODELO');
      const c = Object.assign({}, a.contacto, extra.gabriel ? { gabriel: ahora + extra.gabriel } : {});
      const r = decidir(texto, c, ahora, LINKS);
      assert.notStrictEqual(r.intencion, 'dano_general');
      if (nombre === 'no se el modelo') assert.strictEqual(r.intencion, 'sal5');
      else assert.strictEqual(r.respuesta, null);
      invariantesRespuesta(r, { texto });
    });
  }
}

for (const texto of ['es un dell pero esta mojado', 'es un hp, me urge', 'es un lenovo con cafe', 'es un asus, es urgente', 'es un hp y se le cayo agua']) {
  for (const hora of HORAS) {
    test(`MODELO pendiente · "${texto}" · ${hora}: el aviso a Gabriel es urgente`, () => {
      const ahora = chileATimestamp('2026-11-11', hora);
      const a = decidir('cuanto sale cambiar la pantalla', { visto: ahora - 20 * MIN, enviados: {}, bots: [] }, ahora - 10 * MIN, LINKS);
      const r = decidir(texto, a.contacto, ahora, LINKS);
      assert.strictEqual(r.aviso, 'urgente');
      invariantesRespuesta(r, { texto });
    });
  }
}

test('MODELO pendiente: una foto cuenta como el modelo y no repregunta', () => {
  const ahora = chileATimestamp('2026-11-11', '15:00');
  const a = decidir('cuanto sale cambiar la pantalla', null, ahora - 10 * MIN, LINKS);
  const r = decidir('', a.contacto, ahora, LINKS, '', 'image');
  assert.notStrictEqual(r.intencion, 'dano_general');
  assert.strictEqual(r.intencion, 'adjunto_foto');
  assert.doesNotMatch(r.respuesta || '', /qué hace tu equipo|no enciende|qué le pasa/i);
});

test('simulador: el cron de seguimientos corre sobre la misma memoria y deja el eco del bot', () => {
  const { crearConversacion } = require('./simulador.js');
  const conv = crearConversacion({ hora: '10:00' });
  conv.cliente('AGENDA');
  assert.deepStrictEqual(conv.cron(), []);          // aun no pasan las horas del seguimiento
  conv.esperar(6 * 60);
  const envios = conv.cron();
  assert.ok(envios.length >= 1);
  assert.ok(conv.historial.some(e => e.quien === 'bot' && /^seg_/.test(e.intencion)));
  assert.deepStrictEqual(conv.cron(), []);          // no se repite
});

// ---------------------------------------------------------------- no regresion: «para mañana» y «otra vez» no secuestran pedidos normales
const NO_REGRESION = [   // [texto, intencion esperada para contacto NUEVO, a cualquier hora]
  ['tienes hora para manana?', 'agendar'], ['cuanto sale formatear para manana', 'formateo'], ['para manana estaria listo?', 'sin_intencion'],
  ['otra vez yo, tengo un pc que no prende', 'no_enciende'], ['de nuevo no me carga la agenda', 'agendar'],
  ['de nuevo tengo que pedir hora, no me funciona el formulario', 'sin_intencion'],
  ['me urge para manana', 'urgencia'], ['lo necesito para manana', 'urgencia']
];
for (const [texto, esperada] of NO_REGRESION) {
  for (const hora of HORAS) {
    test(`no regresion · "${texto}" · ${hora} (contacto nuevo) => ${esperada}`, () => {
      const r = decidir(texto, null, chileATimestamp('2026-11-11', hora), LINKS);
      assert.strictEqual(r.intencion, esperada);
      assert.notStrictEqual(r.intencion, 'garantia');
      invariantesRespuesta(r, { texto });
    });
  }
}

test('«de nuevo» + daño de equipo solo es garantia para quien ya conversaba; con tema de agenda nunca', () => {
  const ahora = chileATimestamp('2026-11-11', '15:00');
  const previo = () => decidir('cuanto sale formatear', null, ahora - 30 * MIN, LINKS).contacto;
  assert.strictEqual(decidir('el pc quedo malo de nuevo', previo(), ahora, LINKS).intencion, 'garantia');
  assert.strictEqual(decidir('el pc quedo malo de nuevo', null, ahora, LINKS).intencion, 'dano_general');
  assert.notStrictEqual(decidir('de nuevo no me carga la agenda', previo(), ahora, LINKS).intencion, 'garantia');
});

test('MODELO pendiente: «es un hp para mañana» no es urgencia; «es un hp, me urge» sí', () => {
  const ahora = chileATimestamp('2026-11-11', '15:00');
  const pend = () => decidir('cuanto sale cambiar la pantalla', null, ahora - 10 * MIN, LINKS).contacto;
  const a = decidir('es un hp para manana', pend(), ahora, LINKS);
  assert.strictEqual(a.intencion, 'modelo_dado'); assert.strictEqual(a.aviso, 'normal');
  assert.strictEqual(decidir('es un hp, me urge', pend(), ahora, LINKS).aviso, 'urgente');
});
