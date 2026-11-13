// Generador de frases en español de Chile NO forzado para el banco cerebro.chileno.test.js.
// Registro tomado de PATRONES agregados de los DM exportados (sin copiar mensajes, nombres ni usuarios):
//   mediana de ~22 caracteres (55% de los mensajes <= 25), ~2/3 sin tildes, ~5 de cada 6 sin signo de pregunta,
//   alargues ("holaa", "yaa") en ~7%, emojis en ~6%, "q"/"xq" en ~2%, muletillas (po, altiro, pucha, sipo) muy escasas (<1%),
//   aperturas "hola", "buenas", "oie", "wena" + "una consulta". Por eso la mayoría de las frases es neutra-informal y
//   las muletillas entran solo en una fracción de las variantes. Todas las frases de abajo son SINTÉTICAS.
//
// Cada base lleva [texto, intencion esperada]. 'sin_intencion' = el bot debe derivar a Gabriel (no hay dato aprobado).

const SERV = {
  pantalla: { cambiar: ['cambiar la pantalla', 'cambiar la pantalla de mi notebook', 'arreglar la pantalla', 'reparar el display', 'cambiar la pantalla del lenovo'], tiempo: 'tiempo_pantalla' },
  ssd: { cambiar: ['cambiar el disco por un ssd', 'poner un ssd', 'instalar un ssd de 500', 'cambiar el disco duro', 'ponerle un ssd a mi pc'], tiempo: 'tiempo' },
  upgrade_ram: { cambiar: ['ampliar la ram', 'subir la memoria ram', 'poner más ram', 'agrandar la ram a 16', 'ponerle ram al notebook'], tiempo: 'upgrade_ram' },
  bateria: { cambiar: ['cambiar la batería', 'cambiar la batería del notebook', 'poner una batería nueva', 'cambiarle la batería a mi note'], tiempo: 'tiempo' },
  teclado: { cambiar: ['cambiar el teclado', 'arreglar el teclado del note', 'cambiar el teclado de mi notebook', 'reparar el teclado'], tiempo: 'tiempo' },
  formateo: { cambiar: ['formatear mi pc', 'hacer un formateo', 'reinstalar windows', 'formatear el notebook', 'instalar windows de nuevo'], tiempo: 'formateo' },
  limpieza: { cambiar: ['hacer una limpieza', 'limpiar el notebook', 'hacerle mantención al pc', 'cambiar la pasta térmica', 'limpiar el pc por dentro'], tiempo: 'limpieza' }
};
const PRECIO_TPL = ['cuánto sale {x}', 'cuánto cuesta {x}', 'cuánto me saldría {x} más o menos', 'precio de {x}', 'cuánto cobran por {x}', 'y {x} cuánto sería', 'me cotizas {x}?', 'oye cuánto sale {x}', 'una consulta, cuánto sale {x}'];
const PLAZO_TPL = ['cuánto demoran en {x}', 'en cuánto tiempo pueden {x}', 'cuántos días se demoran en {x}', 'y cuánto demora {x}', 'para cuándo podrían {x}'];

const B = [];   // [texto, esperada, familia]
const add = (fam, lista) => lista.forEach(([t, e]) => B.push([t, e, fam]));

for (const [int, d] of Object.entries(SERV)) {
  for (const x of d.cambiar) for (const t of PRECIO_TPL.slice(0, 5 + (x.length % 4))) add('precio_' + int, [[t.replace('{x}', x), int]]);
  for (const x of d.cambiar.slice(0, 3)) for (const t of PLAZO_TPL.slice(0, 3)) add('plazo_' + int, [[t.replace('{x}', x), d.tiempo]]);
}

add('sintomas', [
  ['mi compu anda muy lenta', 'lento'], ['buenas, mi compu anda muy lenta', 'lento'], ['se me quedó pegado el computador', 'lento'], ['el notebook está lentísimo', 'lento'], ['se pega todo cuando abro el chrome', 'lento'], ['anda lento mi pc desde hace una semana', 'lento'],
  ['mi pc no prende', 'no_enciende'], ['no me enciende el notebook', 'no_enciende'], ['no da imagen el computador', 'no_enciende'], ['se murió mi notebook', 'no_enciende'], ['la pantalla se queda negra', ['pantalla', 'no_enciende']], ['no parte mi compu', 'no_enciende'],
  ['se echó a perder mi notebook', 'dano_general'], ['no me anda el computador', 'dano_general'], ['se me rompió el pc', 'dano_general'], ['mi compu está mala', 'dano_general'], ['hola, no funciona mi notebook', 'dano_general'], ['falla algo en mi pc y no sé qué', 'dano_general'], ['tiene arreglo mi notebook?', 'dano_general'], ['se puede reparar?', 'dano_general'],
  ['me sale pantalla azul', 'sin_intencion'], ['mi pc se reinicia solo', 'dano_general'], ['se calienta mucho mi notebook', 'limpieza'], ['hace mucho ruido el ventilador', 'ventilador'], ['el pc se apaga solo', 'dano_general']
]);
add('datos', [
  ['puedo recuperar mis fotos?', 'datos'], ['se me borraron los archivos del pendrive', 'datos'], ['necesito recuperar unos documentos', 'datos'], ['no quiero perder mis datos', 'respaldo'], ['tengo que respaldar mis cosas antes de formatear', 'respaldo'], ['pueden hacer un respaldo?', 'respaldo'],
  ['se me cayó el disco externo y no lo lee', ['datos']], ['pierdo mis fotos si formatean?', ['respaldo', 'formateo']]
]);
add('info', [
  ['donde quedan?', 'ubicacion'], ['dónde están ubicados', 'ubicacion'], ['cuál es la dirección?', 'ubicacion'], ['donde queda el taller', 'ubicacion'], ['en qué parte están', 'sin_intencion'], ['en qué depto es', 'ubicacion'],
  ['están abiertos?', 'horario'], ['hasta qué hora atienden', 'horario'], ['atienden los sábados?', 'horario'], ['cuál es el horario', 'horario'], ['abren hoy?', 'horario'], ['están atendiendo ahora?', 'horario'],
  ['van a buscar el equipo?', 'domicilio'], ['hacen retiro a domicilio?', 'domicilio'], ['pueden ir a buscar el notebook a mi casa', 'domicilio'], ['tienen servicio a domicilio?', 'domicilio'],
  ['hay descuento para estudiantes?', 'descuento'], ['tienen alguna promo?', 'descuento'], ['soy estudiante, me hacen descuento?', 'descuento'],
  ['tiene garantía el arreglo?', 'garantia_q'], ['dan garantía?', 'garantia_q'], ['con garantía?', 'garantia_q'], ['y si vuelve a fallar tiene garantía?', 'garantia_q'],
  ['cuánto sale el diagnóstico', 'precio_general'], ['cuánto cobran por revisarlo', 'precio_general'], ['me pueden dar un presupuesto?', 'precio_general'], ['cuánto sale revisar un notebook', 'precio_general'], ['cuánto es la revisión', 'precio_general'], ['sale caro?', 'sin_intencion'],
  ['tienen hora para mañana?', 'agendar'], ['quiero agendar una hora', 'agendar'], ['hay horas disponibles?', 'agendar'], ['cómo reservo?', 'agendar'], ['quiero reservar para el lunes', 'agendar'],
  ['cómo sé cuándo está listo?', 'estado'], ['ya está listo mi notebook?', 'estado'], ['alguna novedad de mi pc?', 'estado'], ['cómo va mi equipo', 'estado'], ['puedo ir a buscarlo?', 'estado']
]);
add('urgencia', [
  ['se me cayó café en el notebook', 'urgente'], ['le cayó agua a mi pc', 'urgente'], ['derramé jugo en el teclado', 'urgente'], ['mi notebook está mojado', 'urgente'], ['se mojó el computador', 'urgente'], ['se me cayó el líquido en el teclado', 'urgente'],
  ['me urge, es para mi pega', 'urgencia'], ['es urgente', 'urgencia'], ['lo necesito para hoy', 'urgencia'], ['lo necesito para mañana por favor', 'urgencia'], ['necesito el pc lo antes posible', 'urgencia'], ['tengo que cuidar la pega, es urgente', 'urgencia'], ['el lunes lo necesito sí o sí', 'sin_intencion']
]);
add('marcas_placa', [
  ['trabajan con asus?', 'marcas'], ['arreglan lenovo?', 'marcas'], ['reparan hp?', 'marcas'], ['hacen reparaciones a placas madres?', 'placa_madre'], ['arreglan la placa madre?', 'placa_madre'], ['reparan macbook?', 'otros_disp'],
  ['reparan celulares?', 'otros_disp'], ['arreglan impresoras?', 'otros_disp'], ['reparan consolas?', 'otros_disp']
]);
add('objeciones', [
  ['está caro', 'objecion'], ['uff es caro', 'objecion'], ['qué caro', 'objecion'], ['es muy caro para mí', 'objecion'], ['no me alcanza la plata', 'objecion'], ['no tengo plata ahora', 'objecion'], ['me sale muy caro', 'objecion'],
  ['estoy cotizando en otros lados', 'compara'], ['voy a ir a otro lado', 'compara'], ['estoy comparando precios', 'compara'], ['me voy a otro técnico', 'compara'], ['estoy viendo otras opciones', 'compara'],
  ['lo voy a pensar', 'sin_intencion'], ['ya, lo pienso y te aviso', 'sin_intencion'], ['después te escribo', 'sin_intencion']
]);
add('cortesia', [
  ['hola', 'saludo'], ['holaa', 'saludo'], ['hola buenas tardes', 'saludo'], ['buenas', 'saludo'], ['buenos días', 'saludo'], ['wena', 'saludo'], ['oie', 'saludo'], ['hola, una consulta', 'sin_intencion'], ['hola buenas noches', 'saludo'], ['hooola', 'saludo'],
  ['hola cómo estás', 'saludo'], ['q tal', ['como_estas', 'saludo']], ['qué tal', ['como_estas', 'saludo']], ['cómo estás?', 'como_estas'], ['cómo estai', 'como_estas'], ['todo bien?', 'sin_intencion'],
  ['gracias', 'gracias'], ['muchas gracias', 'gracias'], ['gracias po', 'gracias'], ['ya, gracias', 'gracias'], ['dale gracias', 'gracias'], ['bacán gracias', 'gracias'], ['mil gracias', 'gracias'], ['ya perfecto', 'gracias'], ['genial, muchas gracias!', 'gracias'], ['ya buenísimo', 'gracias']
]);
add('para_gabriel', [
  ['hola gabo, te escribo por el notebook', 'otra_persona'], ['wena gabriel', 'otra_persona'], ['hola gab, cómo estás', 'otra_persona'], ['buenas gabo, tengo una consulta', 'otra_persona'], ['quiero hablar con una persona', 'humano'], ['hay alguien ahí?', 'humano'], ['con quién hablo?', 'humano'],
  ['eres un bot?', 'es_bot'], ['hablo con una persona o con un bot?', 'es_bot']
]);
add('logistica', [
  ['llegué, estoy abajo', 'llegada'], ['ya estoy afuera', 'llegada'], ['estoy en el lobby', 'llegada'], ['voy llegando', 'llegada'], ['ya agendé para el lunes', 'agendo'], ['tomé la hora para el martes', 'agendo']
]);
add('web_agenda', [
  ['quiero una página web para mi consulta', 'web_inicio'], ['soy kinesióloga y quiero una agenda online', ['web_inicio', 'web_marca']], ['AGENDA', 'web_inicio'], ['DEMO', 'web_inicio'], ['me interesa la agenda para mi negocio', ['web_inicio', 'agendar']], ['hacen páginas web?', ['web_inicio', 'web']], ['necesito un sitio web para mi emprendimiento', 'web_inicio'],
  ['quiero un sistema de reservas para mi peluquería', ['agendar', 'web_inicio']]
]);
add('otros', [
  ['tengo un pc gamer, hacen armado?', 'armado'], ['quiero armar un pc', 'armado'], ['pueden hacerlo remoto?', 'remoto'], ['necesito instalar office', 'programas'], ['me instalan photoshop?', 'programas'], ['me pueden instalar autocad', 'programas'],
  ['cambian el jack de carga?', 'jack'], ['no carga, será el jack?', 'jack'], ['se me rompió la bisagra', 'bisagras'], ['cambian bisagras?', 'bisagras'], ['mi pc tiene poca memoria', 'memoria_duda'], ['me quedé sin espacio en el disco', ['ssd', 'memoria_duda']],
  ['mi notebook no tiene audio', 'sin_intencion'], ['no me reconoce el wifi', 'sin_intencion'], ['tengo virus', 'sin_intencion']
]);

// ----------------------------------------------------------------- ruido natural
function h(s) { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }
const sinTildes = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿¡]/g, '');
const sinSignos = s => s.replace(/[?!.,;]/g, '');
const abrevia = s => s.replace(/\bque\b/g, 'q').replace(/\bpor que\b/g, 'xq').replace(/\bpara\b/g, 'pa').replace(/\best[aá]\b/g, 'ta').replace(/\bcomo\b/g, 'cm').replace(/\bhacer\b/g, 'aser').replace(/\bpor favor\b/g, 'porfa');
const MULETILLAS = ['po', 'porfa', 'altiro', 'pucha,', 'ya,', 'oie,', 'wena,', 'buenas,', 'hola,'];
const alarga = s => s.replace(/^(ho)la\b/i, 'hooola').replace(/\bya\b/g, 'yaa').replace(/\bgracias\b/g, 'graciaas');

// k = 0 original · 1 sin tildes ni signos · 2 MAYÚSCULAS de enojo · 3 apertura/muletilla ocasional · 4 abreviaturas + alargue + emoji
// Las palabras clave de los carruseles (AGENDA, DEMO) se escriben tal cual: no llevan muletillas ni emojis.
const esClave = t => /^(AGENDA|DEMO)$/.test(t);
const conClave = f => t => (esClave(t) ? t : f(t));
const VARIANTES_BASE = [
  t => t,
  t => sinSignos(sinTildes(t)).toLowerCase(),
  t => t.toUpperCase().replace(/\?$/, '??') + '!!',
  t => { const m = MULETILLAS[h(t) % MULETILLAS.length]; return /,$/.test(m) ? m + ' ' + sinTildes(t) : sinTildes(t) + ' ' + m; },
  t => alarga(abrevia(sinSignos(sinTildes(t)).toLowerCase())) + ([' 🙏', ' 😅', ' 😭', ''][h(t) % 4])
];
const VARIANTES = VARIANTES_BASE.map((f, k) => (k >= 3 ? conClave(f) : f));

const BASES = B.map(([texto, esperada, fam]) => ({ texto, esperada, fam }));
// Con la variante de apertura/muletilla pasan a coexistir dos saludos; esas frases se prueban igual pero la intencion
// esperada se mantiene: el cerebro debe quedarse con la consulta (no con el saludo).


// ----------------------------------------------------------------- conversaciones cortas (2-4 turnos, cliente-bot-cliente)
// Pasos: { c: texto del cliente, int: intencion esperada (string|array|null = cualquiera), resp: 'si' | 'no' | 'dia' (responde solo de dia) | RegExp, aviso? },
//        { g: texto } = Gabriel responde a mano · { w: minutos } = pasa el tiempo. Entre mensajes pasa 1 minuto.
const CONVERSACIONES = [
  ['cotiza pantalla, da el modelo, pregunta el plazo', [{ c: 'cuanto sale cambiar la pantalla?', int: 'pantalla', resp: 'si' }, { c: 'es un lenovo ideapad 3', int: 'modelo_dado', resp: 'no' }, { c: 'y cuanto demora?', int: 'tiempo_pantalla', resp: /7 a 14/ }]],
  ['cotiza bateria, da el modelo, pregunta el plazo', [{ c: 'cuanto sale cambiar la bateria', int: 'bateria', resp: 'si' }, { c: 'mi notebook es un hp 240', int: 'modelo_dado', resp: 'no' }, { c: 'oye y cuanto demoran?', int: 'tiempo', resp: 'si' }]],
  ['lento, ssd', [{ c: 'buenas, mi compu anda muy lenta', int: 'lento', resp: 'si' }, { c: 'sirve cambiar el disco por un ssd?', int: 'ssd', resp: 'si' }]],
  ['saludo, daño vago, sintoma', [{ c: 'hola', int: 'saludo', resp: 'si' }, { c: 'se me echó a perder el pc', int: 'dano_general', resp: 'si' }, { c: 'no prende', int: 'no_enciende', resp: 'si' }]],
  ['una consulta, no me anda, no da imagen', [{ c: 'hola, una consulta', int: 'sin_intencion', resp: 'si' }, { c: 'mi compu no me anda', int: 'dano_general', resp: 'si' }, { c: 'no da imagen', int: 'no_enciende', resp: 'si' }]],
  ['precio, objecion, lo pienso', [{ c: 'cuanto sale formatear', int: 'formateo', resp: 'si' }, { c: 'uff está caro', int: 'objecion', resp: 'si' }, { c: 'ya, lo voy a pensar', int: 'sin_intencion', resp: 'no' }]],
  ['ubicacion, horario, gracias', [{ c: 'donde quedan?', int: 'ubicacion', resp: 'si' }, { c: 'están abiertos?', int: 'horario', resp: 'si' }, { c: 'dale gracias', int: 'gracias', resp: 'si' }]],
  ['Gabriel responde a mano: el bot calla 10 min', [{ c: 'cuanto sale limpiar el notebook', int: 'limpieza', resp: 'si' }, { g: 'Hola! Te cuento: ...' }, { c: 'y formatear cuanto seria', int: 'formateo', resp: 'no' }, { w: 11 }, { c: 'y el formateo cuanto sale?', int: 'formateo', resp: 'si' }]],
  ['liquido: aviso urgente, y lo necesita hoy', [{ c: 'se me cayó café en el notebook', int: 'urgente', resp: 'si', aviso: 'urgente' }, { c: 'lo necesito pa hoy', int: 'urgencia', resp: 'si', aviso: 'urgente' }]],
  ['pantalla y compara', [{ c: 'cuanto sale cambiar la pantalla', int: 'pantalla', resp: 'si' }, { c: 'estoy cotizando en otros lados', int: 'compara', resp: 'si' }]],
  ['garantia y diagnostico', [{ c: 'tienen garantía?', int: 'garantia_q', resp: 'si' }, { c: 'cuánto sale el diagnóstico', int: 'precio_general', resp: 'si' }]],
  ['datos y respaldo', [{ c: 'se me borraron las fotos del pendrive', int: 'datos', resp: 'si' }, { c: 'pierdo todo si formatean?', int: ['respaldo', 'formateo'], resp: 'si' }]],
  ['ram', [{ c: 'quiero ampliar la ram', int: 'upgrade_ram', resp: 'si' }, { c: 'acer aspire 5', int: 'ram_1a', resp: 'si' }]],
  ['llegada: de noche el bot no promete bajar', [{ c: 'hola ya llegué, estoy abajo', int: 'llegada', resp: 'dia', aviso: 'urgente' }]],
  ['domicilio y revision', [{ c: 'hacen retiro a domicilio?', int: 'domicilio', resp: 'si' }, { c: 'cuánto cobran por revisarlo', int: 'precio_general', resp: 'si' }]],
  ['estudiante', [{ c: 'soy estudiante, hay descuento?', int: 'descuento', resp: 'si' }, { c: 'ya, gracias', int: 'gracias', resp: 'si' }]],
  ['teclado y modelo', [{ c: 'cuanto sale cambiar el teclado de mi note', int: 'teclado', resp: 'si' }, { c: 'es un asus', int: 'sin_intencion', resp: 'no' }]],
  ['marcas y placa madre', [{ c: 'trabajan con lenovo?', int: 'marcas', resp: 'si' }, { c: 'y la placa madre?', int: 'placa_madre', resp: 'si' }]],
  ['spam y despues saludo', [{ c: 'ganar dinero rapido, únete', int: 'spam', resp: 'no' }, { c: 'hola', int: 'saludo', resp: 'no' }]],
  ['es un bot?', [{ c: 'eres un bot?', int: 'es_bot', resp: 'si' }]],
  ['mensajes cortados en 3', [{ c: 'hola', int: 'saludo', resp: 'si' }, { c: 'una consulta', int: 'sin_intencion', resp: 'no' }, { c: 'cuanto sale la limpieza?', int: 'limpieza', resp: 'si' }]]
];

module.exports = { BASES, VARIANTES, SERV, CONVERSACIONES };
