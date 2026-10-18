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
    'Puedes tomar hora directo acá: ' + AGENDA + '. Atendemos solo con hora agendada, y al confirmar te llega la dirección 🙌',
    '¡Dale! Las horas disponibles están acá: ' + AGENDA + '. Atendemos solo con hora agendada; al confirmar te mandamos la dirección.'
  ],
  horario: [
    'Atendemos solo con hora agendada: de lunes a viernes de 9:00 a 12:30 y de 14:30 a 20:00, y el sábado de 10:00 a 12:30. Las horas libres las ves acá: ' + AGENDA
  ],
  ubicacion: [
    'Estamos en Freire 1458, Concepción. Atendemos solo con hora agendada (' + AGENDA + '). Recibimos en el lobby del edificio: me escribes al llegar y bajo 🙌',
    'Freire 1458, Concepción, solo con hora agendada (' + AGENDA + '). Es un edificio: recibimos en el lobby, me escribes cuando llegues y bajo.'
  ],
  tiempo: [
    'Formateo y limpieza quedan el mismo día. Si hay que pedir una pieza, depende: con stock en Santiago son 2 a 7 días hábiles, e importada, 2 a 4 semanas. Te aviso siempre antes.'
  ],
  descuento: [
    '¡Sí! Estudiantes tienen 10% en la mano de obra mostrando la credencial 🙌'
  ],
  domicilio: [
    'Podemos retirar y entregar dentro de Concepción por $5.000 cada tramo. Si te acomoda más, lo traes tú con hora agendada: ' + AGENDA
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

// ---------------------------------------------------------------------------
// Flujo de onboarding para desarrollo web (ver infra/n8n/FLUJO-WEB.md).
// 3 preguntas con botones (quick replies) y un cierre que muestra y agenda.
// Estado en contacto.web = { paso, eleccion, negocio, hoy, cuando, t, reintento }.
// ---------------------------------------------------------------------------
const LINK_REUNION = 'https://8vobit.xyz/#reunion';
const LINK_GASSUSO = 'https://pedidos.8vobit.xyz/gassuso';
const LINK_AGENDA_DEMO = 'https://8vobit.xyz/#agendar';

const MENU_INICIO = [['Reparación', 'MENU_REP'], ['Desarrollo web', 'MENU_WEB']];
const W_ELECCION = [['Página web', 'W_PAGINA'], ['Agenda online', 'W_AGENDA'], ['Pedidos para local', 'W_PEDIDOS'], ['Quiero conversarlo', 'W_CONVERSAR']];
const W_HOY = {
  PAGINA: [['No tengo página', 'H_NO'], ['Quiero mejorarla', 'H_MEJORAR']],
  AGENDA: [['WhatsApp o cuaderno', 'H_WSP'], ['Uso otra app', 'H_APP']],
  PEDIDOS: [['Por WhatsApp', 'H_WSP'], ['Por apps de delivery', 'H_APPS'], ['Ambas', 'H_AMBAS']]
};
const W_CUANDO = [['Este mes', 'C_MES'], ['En 1 a 3 meses', 'C_TRIM'], ['Solo estoy mirando', 'C_MIRANDO']];
const NOMBRE_ELECCION = { PAGINA: 'Página web', AGENDA: 'Agenda online', PEDIDOS: 'Pedidos para local', CONVERSAR: 'Quiere conversarlo' };

function botones(lista) { return lista.map(([titulo, payload]) => ({ titulo, payload })); }

function eleccionDesde(t, payload) {
  if (payload && payload.startsWith('W_')) return payload.slice(2);
  if (/pagina|web|sitio|landing/.test(t)) return 'PAGINA';
  if (/agenda|reserva|hora/.test(t)) return 'AGENDA';
  if (/pedido|local|delivery|carta|restoran|comida/.test(t)) return 'PEDIDOS';
  if (/convers|hablar|reunion|no se/.test(t)) return 'CONVERSAR';
  return null;
}

function cierreWeb(w) {
  const caliente = w.cuando !== 'C_MIRANDO';
  const resumen = [NOMBRE_ELECCION[w.eleccion], w.negocio, w.hoyTexto, { C_MES: 'este mes', C_TRIM: 'en 1 a 3 meses', C_MIRANDO: 'solo mirando' }[w.cuando]].filter(Boolean).join(' · ');
  let texto;
  if (w.eleccion === 'PEDIDOS') {
    texto = 'Mira cómo funciona en un local real, Gassuso: ' + LINK_GASSUSO + '\nTus clientes piden directo, por 1% del pedido, sin las comisiones de las apps.';
  } else if (w.eleccion === 'AGENDA') {
    texto = 'Es la misma agenda que usamos en 8vobit. Pruébala como si fueras cliente: ' + LINK_AGENDA_DEMO + '\nLa tuya queda con tu marca y conectada a tu Google Calendar.';
  } else if (w.eleccion === 'PAGINA') {
    texto = 'Para mostrarte ejemplos parecidos a lo que buscas, Gabriel te escribe personalmente por acá 🙌';
  } else {
    texto = '¡Buenísimo! Lo vemos juntos.';
  }
  texto += caliente
    ? '\n\nSi quieres, agendamos una reunión gratis de 45 min por Google Meet: ' + LINK_REUNION + '\nCuando agendes, te confirmo el link de Meet por aquí.'
    : '\n\nCuando quieras verlo con calma, agenda una reunión gratis acá: ' + LINK_REUNION + ' o escribe REUNIÓN.';
  // Página web siempre pasa a Gabriel (no hay portafolio publicado todavía).
  const urgente = caliente || w.eleccion === 'PAGINA' || w.eleccion === 'CONVERSAR';
  return { texto, aviso: urgente ? 'urgente' : 'normal', resumen };
}

// Devuelve null si el mensaje no es del flujo web; si lo es, { respuesta, botones, aviso, intencion, resumen }.
function flujoWeb(texto, payload, c, ahora) {
  const t = normalizar(texto);
  const activo = c.web && c.web.paso !== undefined && ahora - c.web.t < DIA;
  const inicia = payload === 'MENU_WEB'
    || /\b(desarrollo web|pagina web|sitio web|agenda pro|landing|sistema de pedidos|pedidos para mi local)\b|^(web|demo|agenda pro)[!. ]*$/.test(t)
    || /\bdemo\b/.test(t);
  if (!activo && !inicia) return null;

  // Salida a una persona en cualquier momento.
  if (/\b(hablar|persona|humano|gabriel)\b/.test(t)) {
    const resumen = c.web ? NOMBRE_ELECCION[c.web.eleccion] || '' : '';
    c.web = null;
    return { intencion: 'web_humano', respuesta: '¡Dale! Le aviso a Gabriel y te escribe por aquí 🙌', botones: null, aviso: 'urgente', resumen };
  }

  if (!activo) {
    // Inicio: si el mensaje ya dice qué quiere, se salta la primera pregunta.
    const pre = /\bdemo\b|pedido/.test(t) ? 'PEDIDOS' : /agenda/.test(t) ? 'AGENDA' : payload === 'MENU_WEB' ? null : (/pagina|sitio|landing/.test(t) ? 'PAGINA' : null);
    c.web = { paso: pre ? 1 : 0, eleccion: pre, t: ahora, reintento: 0 };
    if (!pre) return { intencion: 'web_inicio', respuesta: '¡Hola! Te ayudo con eso 🙌 ¿Qué te gustaría resolver?', botones: botones(W_ELECCION), aviso: null };
    return { intencion: 'web_inicio', respuesta: '¡Buenísimo! Para mostrarte algo que te sirva: ¿a qué se dedica tu negocio?', botones: null, aviso: null };
  }

  const w = c.web; w.t = ahora;
  const reintentar = (pregunta, lista) => {
    if (w.reintento >= 1) { c.web = null; return { intencion: 'web_humano', respuesta: 'Te paso con Gabriel para verlo directo 🙌', botones: null, aviso: 'urgente', resumen: NOMBRE_ELECCION[w.eleccion] || '' }; }
    w.reintento++;
    return { intencion: 'web_repite', respuesta: pregunta, botones: lista ? botones(lista) : null, aviso: null };
  };

  if (w.paso === 0) {
    const e = eleccionDesde(t, payload);
    if (!e) return reintentar('¿Cuál de estas opciones se parece más a lo que buscas?', W_ELECCION);
    w.eleccion = e; w.reintento = 0;
    if (e === 'CONVERSAR') { w.cuando = 'C_TRIM'; const f = cierreWeb(w); c.web = null; return { intencion: 'web_cierre', respuesta: f.texto, botones: null, aviso: f.aviso, resumen: f.resumen }; }
    w.paso = 1;
    return { intencion: 'web_paso1', respuesta: '¿A qué se dedica tu negocio?', botones: null, aviso: null };
  }
  if (w.paso === 1) {
    if (!t || t.length < 2) return reintentar('¿A qué se dedica tu negocio? (por ejemplo: psicóloga, sushi, peluquería)');
    w.negocio = String(texto).slice(0, 80); w.paso = 2; w.reintento = 0;
    return { intencion: 'web_paso2', respuesta: '¿Y cómo lo haces hoy?', botones: botones(W_HOY[w.eleccion] || W_HOY.PAGINA), aviso: null };
  }
  if (w.paso === 2) {
    const op = (W_HOY[w.eleccion] || []).find(([, p]) => p === payload);
    w.hoyTexto = op ? op[0] : String(texto).slice(0, 60);
    w.paso = 3; w.reintento = 0;
    return { intencion: 'web_paso3', respuesta: '¿Para cuándo lo necesitas?', botones: botones(W_CUANDO), aviso: null };
  }
  if (w.paso === 3) {
    let cuando = payload && payload.startsWith('C_') ? payload : null;
    if (!cuando) cuando = /mirando|viendo|cotiz|todavia|aun no/.test(t) ? 'C_MIRANDO' : /mes|ya|urgente|pronto|semana|luego/.test(t) ? 'C_MES' : /\d|mes|meses/.test(t) ? 'C_TRIM' : null;
    if (!cuando) return reintentar('¿Para cuándo lo necesitas?', W_CUANDO);
    w.cuando = cuando;
    const f = cierreWeb(w); c.web = null;
    return { intencion: 'web_cierre', respuesta: f.texto, botones: null, aviso: f.aviso, resumen: f.resumen };
  }
  c.web = null;
  return null;
}

// contacto: { visto, gabriel, enviados: {intencion: ts}, ultimoBot, bots: [ts], web } (memoria persistente)
// Devuelve { intencion, respuesta|null, botones|null, aviso: null|'normal'|'urgente', resumen?, contacto }
function decidir(texto, contacto, ahora, links, payload) {
  const c0 = Object.assign({ visto: 0, gabriel: 0, enviados: {}, bots: [] }, contacto || {});
  const gabrielActivo = c0.gabriel && ahora - c0.gabriel < 12 * HORA;
  // El menú de bienvenida "Reparación" vuelve al bot de siempre con un saludo de servicio técnico.
  if (payload === 'MENU_REP') {
    c0.visto = ahora; c0.web = null;
    if (gabrielActivo) return { intencion: 'menu_rep', respuesta: null, botones: null, aviso: 'normal', contacto: c0 };
    c0.ultimoBot = ahora; c0.bots = (c0.bots || []).concat(ahora);
    return { intencion: 'menu_rep', respuesta: '¡Dale! Cuéntame qué le pasa a tu notebook o PC (y el modelo si lo tienes) y te digo cuánto sale.', botones: null, aviso: null, contacto: c0 };
  }
  if (!gabrielActivo) {
    const w = flujoWeb(texto, payload, c0, ahora);
    if (w) {
      c0.visto = ahora;
      if (w.respuesta) { c0.ultimoBot = ahora; c0.bots = (c0.bots || []).filter(x => ahora - x < HORA).concat(ahora); }
      return Object.assign({ contacto: c0 }, w);
    }
  }
  const r = decidirBase(texto, c0, ahora, links);
  // La bienvenida ofrece el menú de dos opciones como botones.
  if (r.respuesta && (r.contacto.enviados.bienvenida === ahora || r.contacto.enviados.fuera_horario === ahora)) r.botones = botones(MENU_INICIO);
  return r;
}

function decidirBase(texto, contacto, ahora, links) {
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
if (typeof module !== 'undefined') module.exports = { decidir, flujoWeb, clasificar, normalizar, TEXTOS, REGLAS };
