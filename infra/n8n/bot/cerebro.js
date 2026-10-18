// Cerebro del bot de DM de @8vobit. Sin IA: reglas por intención + textos con la voz de Gabriel.
// Es una función pura: recibe el mensaje y la memoria del contacto, y devuelve qué hacer.
// Se incrusta tal cual en el nodo Code de n8n (lo hace construir-flujo.js); lo de abajo de
// FIN-CEREBRO solo existe para las pruebas locales.
// Precios: marketing/PRECIOS-SERVICIO-TECNICO.md. Si cambian allá, cambian aquí.

const HORA = 3600 * 1000;
const DIA = 24 * HORA;

const AGENDA = '{{LINK_AGENDA}}';
const LINK_WEB = '{{LINK_WEB}}';
const LINK_PEDIDOS = '{{LINK_PEDIDOS}}';
const DIAG = 'El diagnóstico son $5.000 y se descuentan si haces el servicio.';

// Varias versiones por respuesta: el bot no suena igual cada vez.
const TEXTOS = {
  bienvenida: [
    '¡Hola! ¿Cómo estás? Cuéntame qué le pasa a tu compu (y el modelo si lo tienes a mano) y te ayudo 🙌',
    'Holaa, ¿cómo va? Cuéntame qué necesitas con tu equipo y lo vemos 🙌',
    '¡Hola! Bienvenid@ a 8vobit. ¿Qué le pasa a tu notebook o PC?'
  ],
  llegada: [
    '¡Voy bajando! Dame un par de minutos 🏃',
    '¡Bajo altiro! Espérame en el lobby porfa 🙌',
    '¡Ya voy! Un par de minutos y estoy abajo'
  ],
  garantia: [
    'Uff, lo siento. Déjame revisar tu caso y te escribo en un rato para solucionarlo.',
    'Pucha, perdón por eso. Lo vemos con prioridad: te escribo en un rato.'
  ],
  urgente: [
    'Ojo: si se mojó, **no lo prendas ni lo cargues**. Desconéctalo y, si puedes, sácale la batería. Te escribo en un rato para verlo lo antes posible. Si quieres asegurar hora: ' + AGENDA,
    'Si le cayó líquido, déjalo apagado y sin cargador, eso es lo más importante. Te escribo en un rato; mientras, puedes tomar hora acá: ' + AGENDA
  ],
  no_enciende: [
    'Uh, ¿no prende ni enchufado? Puede ser batería, cargador o placa. Hay que verlo en diagnóstico. ' + DIAG + ' Agenda acá: ' + AGENDA,
    'Ya veo. Para saber si es batería, cargador o algo de placa hay que revisarlo. ' + DIAG + ' Puedes tomar hora acá: ' + AGENDA
  ],
  estado: [
    'Déjame revisar cómo va tu equipo y te aviso altiro 🙌',
    '¡Hola! Reviso cómo va y te cuento en un rato.'
  ],
  pago: [
    '¡Gracias! Apenas lo vea te confirmo 🙌',
    '¡Dale! Quedo atento y te confirmo el pago.'
  ],
  precio_general: [
    'Depende de lo que tenga el equipo. Formateo $15.000, limpieza interna $20.000 (gamer $25.000) y el combo de las dos $30.000. Para algo más específico, cuéntame qué le pasa y el modelo. ' + DIAG,
    'Te cuento: formateo $15.000, limpieza $20.000 (gamer o torre $25.000) y formateo + limpieza $30.000. Si es otra cosa, dime qué le pasa y el modelo y te doy precio. ' + DIAG
  ],
  formateo: [
    'El formateo son $15.000 e incluye drivers y programas gratuitos. Si quieres que respalde tus archivos son $5.000 más. Queda listo el mismo día. Agenda acá: ' + AGENDA,
    'Formatear sale $15.000 (con respaldo de tus cosas, $20.000), y se entrega el mismo día. Si además lo limpiamos por dentro, el combo queda en $30.000. Hora acá: ' + AGENDA
  ],
  lento: [
    'Si está lento, muchas veces es Windows o temperatura. Formateo $15.000, limpieza $20.000 o las dos por $30.000. Si no sabes cuál, lo vemos en el diagnóstico. ' + DIAG + ' Agenda: ' + AGENDA,
    'Cuando anda lento, normalmente es un formateo ($15.000), una limpieza ($20.000) o las dos ($30.000). Lo vemos en el diagnóstico. ' + DIAG + ' Hora acá: ' + AGENDA
  ],
  limpieza: [
    'La limpieza interna con cambio de pasta térmica son $20.000; si es gamer o torre (pasta y pads), $25.000. Queda el mismo día. Agenda acá: ' + AGENDA,
    'Limpieza interna: $20.000 en notebook normal y $25.000 en gamer o torre. Si le sumas formateo, el combo queda en $30.000. Hora acá: ' + AGENDA
  ],
  pantalla: [
    'La instalación de pantalla son $25.000 más la pieza, que depende del modelo. ¿Me mandas el modelo exacto (sale en la etiqueta de abajo) y una foto? Así te cotizo la pieza.',
    'Para cotizar pantalla necesito el modelo exacto (etiqueta de abajo) y una foto del daño. La instalación son $25.000 más la pieza.'
  ],
  bateria: [
    'Instalar batería son $10.000 más la pieza. ¿Me mandas el modelo exacto (etiqueta de abajo)? Así te cotizo la batería.',
    'La batería: $10.000 de instalación más la pieza según el modelo. Mándame el modelo exacto y te cotizo.'
  ],
  jack: [
    'El jack de carga va desde $15.000 (si está soldado a la placa, $30.000) más la pieza. Hay que verlo en diagnóstico. ' + DIAG + ' Agenda: ' + AGENDA,
    'Cambio de jack: $15.000 si va en cable o placa aparte y $30.000 si está soldado, más la pieza. Lo confirmamos en el diagnóstico. ' + DIAG
  ],
  upgrade: [
    'Instalar RAM son $10.000 y SSD $15.000 (con Windows instalado, $25.000), más la pieza. ¿Me mandas el modelo exacto? Así veo qué le sirve y te cotizo.',
    'Para RAM o SSD necesito el modelo exacto para ver qué es compatible. Instalación: RAM $10.000, SSD $15.000 o $25.000 con sistema operativo, más la pieza.'
  ],
  ventilador: [
    'El cambio de ventilador son $15.000 más la pieza. Muchas veces basta con una limpieza ($20.000). Lo vemos en el diagnóstico. ' + DIAG + ' Agenda: ' + AGENDA
  ],
  bisagras: [
    'Las bisagras son $25.000 más la pieza (si hay que reconstruir los anclajes, $10.000 más). Mándame el modelo y una foto y te cotizo.'
  ],
  teclado: [
    'Cambios de teclado no estamos haciendo, porque no quedan con la terminación que nos gusta 😕. Si quieres te recomiendo un teclado externo, o lo vemos si es otra cosa.'
  ],
  datos: [
    'La recuperación de datos son $20.000; si no se logra recuperar nada, pagas solo el diagnóstico ($5.000). Demora 1 a 2 días. Agenda acá: ' + AGENDA
  ],
  programas: [
    'Cada programa con licencia (Office, Photoshop, etc.) son $10.000. Si formateamos, los programas gratuitos van incluidos. Agenda: ' + AGENDA
  ],
  armado: [
    'El armado de PC son $50.000. Cuéntame para qué lo vas a usar y tu presupuesto, y te recomiendo piezas.'
  ],
  remoto: [
    'Atendemos remoto por AnyDesk: $10.000 hasta 1 hora (dudas, programas, configuración). Formateos y limpiezas son presenciales. ¿Qué necesitas?'
  ],
  otros_disp: [
    'Nos dedicamos a notebooks y PC 💻. Celulares, tablets y consolas no los estamos viendo, ¡perdón! Si tienes algo con tu compu, feliz te ayudo.'
  ],
  agendar: [
    'Puedes tomar hora directo acá: ' + AGENDA + '. Dejas el equipo en el lobby de Freire 1458 y me escribes al llegar 🙌',
    '¡Dale! Las horas disponibles están acá: ' + AGENDA + '. Recibimos en el lobby de Freire 1458, no hay que subir.'
  ],
  horario: [
    'Atendemos de lunes a viernes de 9:00 a 12:30 y de 14:30 a 20:00, y el sábado de 10:00 a 12:30. Las horas libres las ves acá: ' + AGENDA
  ],
  ubicacion: [
    'Estamos en Freire 1458, Concepción. Recibimos en el lobby del edificio, así que no hay que subir: me escribes al llegar y bajo 🙌',
    'Freire 1458, Concepción. Es un edificio: recibimos en el lobby, me escribes cuando llegues y bajo.'
  ],
  tiempo: [
    'Formateo y limpieza quedan el mismo día. Si hay que pedir una pieza, depende: con stock en Santiago son 2 a 7 días hábiles, e importada, 2 a 4 semanas. Te aviso siempre antes.'
  ],
  descuento: [
    '¡Sí! Estudiantes tienen 10% en la mano de obra mostrando la credencial 🙌'
  ],
  domicilio: [
    'Podemos retirar y entregar dentro de Concepción por $5.000 cada tramo. Si te acomoda más, lo dejas en el lobby de Freire 1458. Agenda: ' + AGENDA
  ],
  web: [
    '¡Hola! Hacemos tu página profesional con agenda incluida: tus clientes reservan solos, a cualquier hora. Cuéntame a qué te dedicas y te muestro un ejemplo. Más info: ' + LINK_WEB
  ],
  demo: [
    '¡Hola! Te muestro el sistema de pedidos funcionando: carta web, despacho por zonas y caja del día, por 1% del pedido. Detalles: ' + LINK_PEDIDOS + ' ¿Cómo se llama tu local y en qué sector está?'
  ],
  gracias: [
    '¡De nada! Cualquier cosa me escribes 🙌',
    '¡Un gusto! Aquí estoy para lo que necesites.'
  ],
  fuera_horario: [
    'Te respondo con calma mañana desde las 9 🙌 Mientras, si quieres, puedes tomar hora acá: ' + AGENDA,
    'Ahora no estoy, pero te contesto mañana temprano. Si te sirve, las horas están acá: ' + AGENDA
  ]
};

// Orden = prioridad. 'aviso' manda ntfy; 'urgente' lo manda con prioridad alta.
const REGLAS = [
  { id: 'spam', re: /app\.link|bnc\.lt|private video|too shy|really? hot|ur realy|crypto|bitcoin|forex|followers? (gratis|free)|sneaky mission/ },
  { id: 'llegada', re: /\b(llegu[eé]|estoy (afuera|abajo|aca|aqui|en el hall|en la puerta|en el lobby|esperando)|ya estoy (aca|aqui|afuera|abajo)|voy llegando|estoy llegando)\b/, urgente: true },
  { id: 'garantia', re: /\b(sigue (igual|fallando|con)|volvio a (fallar|pasar)|otra vez (lo mismo|se)|no quedo bien)\b/, urgente: true },
  { id: 'urgente', re: /\b(se mojo|derram|le cayo (agua|cafe|te|jugo|bebida)|se me cayo (agua|cafe)|liquido)\b/, urgente: true },
  { id: 'estado', re: /\b(esta listo|ya esta (listo)?\??$|estara listo|como va (mi|el)|novedad(es)? (de|del|con)|puedo (ir a )?(buscar|retirar)|cuando (lo )?retiro|esta disponible mi)\b/, urgente: true },
  { id: 'pago', re: /\b(te (transferi|deposite)|ya (transferi|pague|deposite)|comprobante|transferencia (lista|hecha))\b/, aviso: true },
  { id: 'agendo', re: /\b(agende|ya agendo|voy a agendar|agendada|agendado|tome (la )?hora|reserve)\b/, aviso: true },
  { id: 'demo', re: /\bdemo\b/ },
  { id: 'web', re: /\b(agenda pro|pagina web|sitio web|landing)\b|^web$/ },
  { id: 'teclado', re: /\bteclado\b/ },
  { id: 'pantalla', re: /\b(pantalla|display|flex)\b/ },
  { id: 'bisagras', re: /\bbisagra/ },
  { id: 'jack', re: /\b(jack|pin de carga|entrada de(l)? cargador|puerto de carga)\b/ },
  { id: 'bateria', re: /\bbateria/ },
  { id: 'upgrade', re: /\b(ram|ssd|disco|almacenamiento|memoria)\b/ },
  { id: 'ventilador', re: /\bventilador\b/ },
  { id: 'datos', re: /\b(recuperar|recuperacion|se (me )?borr|tarjeta sd|disco externo|pendrive)\b/ },
  { id: 'programas', re: /\b(office|photoshop|autocad|licencia|instalar (un )?programa)\b/ },
  { id: 'armado', re: /\b(armar|armado|pc gamer)\b/ },
  { id: 'remoto', re: /\b(remot[ao]|anydesk|teamviewer|telematic)/ },
  { id: 'domicilio', re: /\b(domicilio|retiran|van a buscar|lo pasan a buscar)\b/ },
  { id: 'otros_disp', re: /\b(celular|iphone|telefono|tablet|ipad|consola|play ?station|nintendo|switch)\b/ },
  { id: 'no_enciende', re: /\b(no (prende|enciende|parte|da imagen)|murio|pantalla negra)\b/ },
  { id: 'formateo', re: /\b(format|reinstal|windows)/ },
  { id: 'limpieza', re: /\b(limpieza|limpiar|mantencion|manutencion|pasta termica|se calienta|temperatura)\b/ },
  { id: 'lento', re: /\b(lento|lenta|se pega|se queda pegad)/ },
  { id: 'descuento', re: /\b(descuento|estudiante|promo)\b/ },
  { id: 'tiempo', re: /\b(cuanto (se )?demora|cuanto tiempo|cuantos dias|para cuando estaria)\b/ },
  { id: 'agendar', re: /\b(agend|reserv|tienes hora|hay hora|disponibilidad|cupo)/ },
  { id: 'ubicacion', re: /\b(donde (esta|estan|queda|quedan|atiend)|direccion|ubicad|que depto|departamento)\b/ },
  { id: 'horario', re: /\b(horario|a que hora|hasta que hora|atienden|abren|trabajan (hoy|el sabado|los sabados))\b/ },
  { id: 'precio_general', re: /\b(cuanto (sale|cuesta|cobr|vale|saldria|seria)|precio|valor|cotiz|presupuesto|costo)\b/ },
  { id: 'gracias', re: /^(muchas )?gracias|^(bacan|genial|excelente|perfecto|super)[!. ]*(gracias)?/ },
  { id: 'saludo', re: /^(hol+[ai]+s?|holi+s?|buena?s?|wena?s?|hola buenas)( (tardes|noches|dias))?[ !.,]*(como (estas|estan|va)\??)?[ !.]*$/ }
];

// Combinaciones: si hay intención de servicio, gana sobre precio_general, agendar o saludo.
const SERVICIO = ['no_enciende','teclado','pantalla','bisagras','jack','bateria','upgrade','ventilador','datos','programas','armado','remoto','domicilio','otros_disp','formateo','limpieza','lento'];

function normalizar(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function clasificar(texto) {
  const t = normalizar(texto);
  const ids = REGLAS.filter(r => r.re.test(t)).map(r => r.id);
  return ids;
}

function horaChile(ahora) {
  const h = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', hour: 'numeric', hourCycle: 'h23' }).format(new Date(ahora));
  return Number(h);
}

// contacto: { visto, gabriel, enviados: {intencion: ts}, ultimoBot, bots: [ts] } (memoria persistente)
// Devuelve { intencion, respuesta|null, aviso: null|'normal'|'urgente', contacto }
function decidir(texto, contacto, ahora, links) {
  const c = Object.assign({ visto: 0, gabriel: 0, enviados: {}, bots: [] }, contacto || {});
  const ids = clasificar(texto);
  const regla = id => REGLAS.find(r => r.id === id);
  const nuevo = !c.visto || ahora - c.visto > 30 * DIA;
  c.visto = ahora;

  let id = ids[0] || null;
  const servicio = ids.find(x => SERVICIO.includes(x));
  if (servicio && ['precio_general', 'agendar', 'saludo', 'gracias', 'tiempo', 'descuento', 'horario', 'ubicacion'].includes(id)) id = servicio;
  // "lento" + "formatear" → formateo; "no prende" + "batería" → batería
  if (id === 'lento' && ids.includes('formateo')) id = 'formateo';
  if (id === 'no_enciende' && ids.includes('bateria')) id = 'bateria';

  const r = id && regla(id);
  let aviso = r && r.urgente ? 'urgente' : 'normal';
  if (id === 'spam') return { intencion: 'spam', respuesta: null, aviso: null, contacto: c };

  // Conversación en curso (algo en las últimas 48 h): el bot solo se encarga de la logística;
  // las consultas las sigue Gabriel. Las respuestas con datos son para quien recién llega.
  const enCurso = contacto && contacto.visto && ahora - contacto.visto < 2 * DIA;
  const LOGISTICA = ['llegada', 'estado', 'pago', 'urgente', 'garantia', 'ubicacion', 'horario'];
  const gabrielActivo = c.gabriel && ahora - c.gabriel < 12 * HORA;
  const h = horaChile(ahora);
  const deNoche = h >= 21 || h < 9;

  let clave = null;
  if (!id) clave = nuevo ? 'bienvenida' : null;            // sin intención clara: solo saludo si es nuevo
  else if (id === 'saludo') clave = nuevo ? 'bienvenida' : null;
  else if (id === 'gracias') clave = c.ultimoBot && ahora - c.ultimoBot < 2 * HORA ? 'gracias' : null;
  else clave = id;

  if (id === 'agendo') clave = null;
  if (enCurso && clave && !LOGISTICA.includes(clave) && clave !== 'gracias') clave = null;

  // De noche y sin nada que contestar con datos: avisar que se responde mañana (una vez por noche).
  if (deNoche && (!clave || clave === 'bienvenida') && !(c.enviados.fuera_horario && ahora - c.enviados.fuera_horario < 10 * HORA)) {
    clave = 'fuera_horario';
  }
  // De noche no se promete bajar al lobby.
  if (clave === 'llegada' && deNoche) clave = null;

  // Gabriel está conversando: el bot se calla (los avisos siguen).
  if (gabrielActivo) clave = null;
  // No repetir la misma respuesta en 24 h ni mandar más de 3 por hora.
  if (clave && c.enviados[clave] && ahora - c.enviados[clave] < DIA) clave = null;
  c.bots = (c.bots || []).filter(t => ahora - t < HORA);
  if (clave && c.bots.length >= 3) clave = null;

  let respuesta = null;
  if (clave) {
    const opciones = TEXTOS[clave];
    respuesta = opciones[hash(String(ahora) + clave) % opciones.length]
      .split('{{LINK_AGENDA}}').join(links.agenda)
      .split('{{LINK_WEB}}').join(links.web)
      .split('{{LINK_PEDIDOS}}').join(links.pedidos)
      .replace(/\*\*/g, '');
    c.enviados[clave] = ahora;
    c.ultimoBot = ahora;
    c.bots.push(ahora);
  }
  if (!id && !respuesta) aviso = 'normal';
  return { intencion: id || 'sin_intencion', respuesta, aviso, contacto: c };
}

/* FIN-CEREBRO */
if (typeof module !== 'undefined') module.exports = { decidir, clasificar, normalizar, TEXTOS, REGLAS };
