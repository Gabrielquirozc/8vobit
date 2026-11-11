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
const LINK_REUNION = 'https://8vobit.xyz/#reunion';
const LINK_GASSUSO = 'https://pedidos.8vobit.xyz/gassuso';
const LINK_AGENDA_DEMO = 'https://8vobit.xyz/#agendar';
const DIAG = 'El diagnóstico son $5.000 y se descuentan si haces el servicio.';

// Varias versiones por respuesta: el bot no suena igual cada vez.
const TEXTOS = {
  bienvenida: [
    '¡Hola! ¿Cómo estás? Cuéntame qué le pasa a tu compu (y el modelo si lo tienes a mano) y te ayudo 🙌',
    'Holaa, ¿cómo va? Cuéntame qué necesitas con tu equipo y lo vemos 🙌',
    '¡Hola! Bienvenid@ a OCTAVOBIT. ¿Qué le pasa a tu notebook o PC?'
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
    'Depende de lo que tenga el equipo. Formateo $15.000, limpieza interna $25.000 (gamer $30.000, PC de torre $45.000) y el combo de las dos $35.000. Para algo más específico, cuéntame qué le pasa y el modelo. ' + DIAG,
    'Te cuento: formateo $15.000, limpieza $25.000 (gamer $30.000, torre $45.000) y formateo + limpieza $35.000. Si es otra cosa, dime qué le pasa y el modelo y te doy precio. ' + DIAG
  ],
  formateo: [
    'El formateo son $15.000 e incluye drivers y programas gratuitos. Si quieres que respalde tus archivos son $5.000 más. Queda listo el mismo día. Agenda acá: ' + AGENDA,
    'Formatear sale $15.000 (con respaldo de tus cosas, $20.000), y se entrega el mismo día. Si además lo limpiamos por dentro, el combo queda en $35.000. Hora acá: ' + AGENDA
  ],
  lento: [
    'Si está lento, muchas veces es Windows o temperatura. Formateo $15.000, limpieza $25.000 o las dos por $35.000. Si no sabes cuál, lo vemos en el diagnóstico. ' + DIAG + ' Agenda: ' + AGENDA,
    'Cuando anda lento, normalmente es un formateo ($15.000), una limpieza ($25.000) o las dos ($35.000). Lo vemos en el diagnóstico. ' + DIAG + ' Hora acá: ' + AGENDA
  ],
  limpieza: [
    'La limpieza interna con cambio de pasta térmica son $25.000; notebook gamer o gama alta (pasta y pads), $30.000; PC de torre, $45.000. Agenda acá: ' + AGENDA,
    'Limpieza interna: $25.000 en notebook normal, $30.000 en gamer o gama alta y $45.000 en PC de torre. Con formateo, el combo queda en $35.000. Hora acá: ' + AGENDA
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
  // SSD explícito, «disco» o «almacenamiento» sin la palabra «memoria» (antes era 'upgrade').
  ssd: [
    'Instalar un SSD son $15.000 (con Windows instalado, $25.000), más la pieza. ¿Me mandas el modelo exacto? Así veo qué le sirve y te cotizo.',
    'Para el SSD necesito el modelo exacto para ver qué es compatible. Instalación: $15.000, o $25.000 con sistema operativo, más la pieza.'
  ],
  // «Memoria» no siempre es RAM (DIALOGOS-BOT-V2, sección B).
  memoria_sintoma: [
    'Ojo: un error de memoria no siempre es la RAM, muchas veces es temperatura o el disco. Antes de comprar una pieza conviene el diagnóstico: son $5.000 y se descuentan si haces el servicio. ¿Qué modelo es y cuándo te pasa?',
    'Tranqui, que diga «memoria» no significa que haya que cambiar la RAM. Puede ser temperatura o el disco. Lo vemos en el diagnóstico ($5.000, se descuentan del servicio). ¿Me cuentas el modelo y en qué momento falla?'
  ],
  memoria_duda: [
    'Te ayudo. «Memoria» puede ser dos cosas, y así no te cotizo mal:\n1️⃣ No me queda espacio para guardar cosas\n2️⃣ Se pega cuando abro varias cosas a la vez',
    'Para cotizarte bien, ¿cuál se parece más?\n1️⃣ Se me llenó el espacio (fotos, archivos, programas)\n2️⃣ Se pone lento o se pega con varias cosas abiertas'
  ],
  mem_d1: [
    'Eso se arregla con un SSD de más capacidad. La instalación son $15.000, o $25.000 con Windows ya instalado, más la pieza según tu equipo. Mándame el modelo exacto (sale en la etiqueta de abajo) y te doy el total.',
    'Para eso va un SSD más grande: $15.000 la instalación ($25.000 con Windows) más la pieza. Con el modelo exacto, que sale en la etiqueta de abajo, te cotizo el total.'
  ],
  mem_d2: [
    'Ahí conviene mirarlo antes de comprar nada: muchas veces lo que lo deja rápido es un SSD o una limpieza, no más RAM. El diagnóstico son $5.000 y se descuentan si haces el servicio. Toma hora acá: ' + AGENDA,
    'Antes de gastar en RAM, mejor lo revisamos: a veces la solución es otra y sale más barata. Diagnóstico $5.000, que se descuentan del servicio. Hora acá: ' + AGENDA
  ],
  upgrade_ram: [
    'Dale, te lo puedo ver de dos formas:\n1️⃣ Me mandas el modelo exacto y te cotizo la RAM instalada\n2️⃣ Lo revisamos primero en un diagnóstico ($5.000, se descuentan), por si le conviene otra cosa',
    'Claro. ¿Cómo prefieres?\n1️⃣ Cotización: me dices el modelo exacto y te doy el total\n2️⃣ Diagnóstico de $5.000 (se descuentan) para ver qué le sirve más'
  ],
  ram_1a: [
    'Perfecto. Mándame el modelo exacto (etiqueta de abajo) y cuánta RAM quieres dejarle. La instalación son $10.000 más la pieza; te escribo con el total.'
  ],
  ram_1b: [
    'Buena idea. Toma hora acá y lo vemos: ' + AGENDA + '. Te decimos por escrito qué tiene y cuánto sale antes de tocarlo.'
  ],
  mem_pieza: [
    'Sí, la instalamos igual. Antes de comprarla mándame el modelo exacto del equipo para que no compres una que no calce. La instalación es $10.000 la RAM y $15.000 el SSD.'
  ],
  mem_pieza_ya: [
    'Perfecto. Mándame el modelo del equipo y el de la pieza para confirmar que son compatibles.'
  ],
  mem_compat: [
    'Depende del modelo: algunos traen la RAM soldada y no se amplían, y casi todos aceptan un SSD. Mándame el modelo exacto y te digo qué se puede hacer.'
  ],
  mem_miedo: [
    'Hacemos eso a diario, no te preocupes. Si te parece, lo dejas con hora agendada y lo revisamos con cuidado: ' + AGENDA
  ],
  // Repreguntas (SAL-1, «Si no se entiende») y salidas comunes (sección E).
  rep_mem_d: [
    'Perdón, no te entendí. ¿Es 1️⃣ que se llenó el espacio o 2️⃣ que se pone lento?'
  ],
  rep_ram: [
    '¿Prefieres 1️⃣ que te cotice con el modelo o 2️⃣ partir por el diagnóstico?'
  ],
  sal2: [
    'Mejor lo ve Gabriel directo, para no enredarte. Te escribe por acá.',
    'Para no marearte, le paso tu consulta a Gabriel y te responde él por acá.'
  ],
  // SAL-5 cuando la pregunta pendiente es «qué le pasa» (MEM-D).
  // M4: preguntó el precio con MEM-D pendiente; se responde y se repite la pregunta.
  mem_d_precio: [
    'El precio depende de cuál de las dos es; dime y te lo digo altiro. ¿Es 1️⃣ que se llenó el espacio o 2️⃣ que se pone lento?'
  ],
  sal5_que: [
    'No pasa nada, para eso está el diagnóstico: son $5.000 y se descuentan si haces el servicio. Toma hora acá: ' + AGENDA
  ],
  // Diálogo C · Página con agenda (sección C). Sin precio ni Meet de 45 min.
  ag_0: [
    'Hola! Hago páginas con agenda: tus clientes reservan solos, a cualquier hora. Para mostrarte algo que te sirva, ¿a qué te dedicas?',
    'Hola! Armo páginas donde tus clientes toman hora sin tener que escribirte. Cuéntame, ¿a qué te dedicas?'
  ],
  ag_0_anoto: [
    'Perfecto, lo anoto. ¿Y a qué te dedicas?'
  ],
  ag_0_rep: [
    'Te pregunto por tu trabajo, por ejemplo psicóloga, kinesiólogo, abogada, peluquería. ¿A qué te dedicas tú?'
  ],
  ag_1: [
    '¿Ya tienes logo o una marca definida?\n1️⃣ Sí, ya tengo\n2️⃣ Todavía no',
    'Y cuéntame, ¿ya tienes tu logo o tu marca armada?\n1️⃣ Sí\n2️⃣ Todavía no'
  ],
  ag_1_rep: [
    'Perdón, no te entendí. ¿Ya tienes logo o marca? 1️⃣ Sí, ya tengo · 2️⃣ Todavía no'
  ],
  ag_1_explica: [
    'Marca es el logo y los colores con que te reconocen. Si no tienes, no pasa nada: igual lo vemos.'
  ],
  ag_2: [
    '¿Y cómo te piden hora hoy tus clientes?\n1️⃣ Por WhatsApp o mensajes\n2️⃣ Los anoto en cuaderno o planilla\n3️⃣ Uso otra app',
    'Última pregunta: hoy, ¿cómo coordinas las horas con tus clientes?\n1️⃣ WhatsApp o mensajes\n2️⃣ Cuaderno o planilla\n3️⃣ Otra app'
  ],
  ag_2_rep: [
    'Me refiero a cómo te reservan hora tus clientes hoy: 1️⃣ te escriben por WhatsApp · 2️⃣ los anotas tú · 3️⃣ usas alguna app.'
  ],
  ag_3: [
    'Mira cómo se ve funcionando: así reserva un cliente en mi propia agenda 👉 ' + LINK_AGENDA_DEMO + '\nLa tuya queda con tus servicios, tus horarios y tu marca. ¿Lo vemos para tu caso en una llamada de 15 min por WhatsApp?\n1️⃣ Sí, veámoslo\n2️⃣ Ahora no',
    'Te muestro una de verdad: esta es mi agenda, pruébala como si fueras cliente 👉 ' + LINK_AGENDA_DEMO + '\nLa tuya se arma igual, con tu marca. ¿Te parece conversarlo 15 min por WhatsApp?\n1️⃣ Sí\n2️⃣ Ahora no'
  ],
  ag_3_rep: [
    'Perdón, no te entendí. ¿Lo vemos en una llamada de 15 min por WhatsApp? 1️⃣ Sí, veámoslo · 2️⃣ Ahora no'
  ],
  ag_4a: [
    'Elige la hora que te acomode 👉 ' + LINK_REUNION + '\nSon 15 minutos y Gabriel te llama por WhatsApp.',
    'Toma la hora acá 👉 ' + LINK_REUNION + '\nSon 15 minutos y te llama Gabriel por WhatsApp.'
  ],
  ag_4b: [
    'Ningún problema. Cuando quieras retomarlo, escribe LLAMADA y lo coordinamos.',
    'Tranqui, queda acá para cuando lo necesites: escribes LLAMADA y lo vemos.'
  ],
  ag_precio: [
    'Depende de lo que necesites, por eso prefiero verlo contigo en la llamada: son 15 minutos y sin compromiso.',
    'Te lo digo con tu caso en la mano, en la llamada de 15 min, para no darte un número que no te sirva.'
  ],
  ag_compara: [
    'Normal, conviene comparar. Para que compares con algo concreto, en la llamada de 15 min te muestro qué incluye y cómo funciona. Sin compromiso.',
    'Tiene sentido. Lo que te puedo mostrar es una agenda funcionando y qué incluye la página, para que compares con lo mismo. 15 min por WhatsApp.'
  ],
  ag_recom: [
    'Qué bueno, gracias por avisar. ¿Quién te recomendó? Así le agradezco.'
  ],
  ag_dominio: [
    'Perfecto, eso nos sirve: no partimos de cero. Si me dices la dirección de tu página o dónde está tu dominio, lo reviso antes de la llamada.'
  ],
  ag_lateral: [
    'Eso lo definimos en la llamada, porque depende de tu caso.'
  ],
  ag_dos_temas: [
    'Eso también lo hago: escribe REVISIÓN y lo vemos. Volvamos a tu página:'
  ],
  ag_sal6: [
    'Dale, sin apuro. Aquí quedo.'
  ],
  sal3: [
    'Claro. Le aviso a Gabriel y te responde por acá.'
  ],
  sal8: [
    'Dale. Le aviso a Gabriel para que te escriba por WhatsApp. Si me dejas tu número, mejor.',
    'Perfecto, se lo paso a Gabriel para que te contacte por WhatsApp.'
  ],
  sal8_ya: [
    'Gracias, ya tengo tu número. Gabriel te escribe por WhatsApp.'
  ],
  sal8_octavo: [
    'Gabriel te escribe él por WhatsApp. Si quieres, déjame tu número.'
  ],
  // Modo «fuera de Concepción» (MODO_FUERA, sección A). {{VUELTA}} = «lunes 16», {{HASTA}} = «domingo».
  fuera_aviso: [
    'Ojo: esta semana estamos fuera de Concepción, así que las reparaciones las retomamos el {{VUELTA}}.',
    'Te cuento que hasta el {{HASTA}} andamos fuera de Concepción. Volvemos a recibir equipos el {{VUELTA}}.'
  ],
  fuera_bienvenida: [
    'Hola! Esta semana estamos fuera de Concepción y las reparaciones las retomamos el {{VUELTA}}. Cuéntame qué le pasa a tu equipo y el modelo, y te lo dejo cotizado para la vuelta.',
    'Hola! Hasta el {{HASTA}} andamos fuera de Concepción. Si me cuentas qué le pasa a tu notebook o PC, te respondo con la cotización el {{VUELTA}}.'
  ],
  fuera_llegada: [
    'Perdón: esta semana estamos fuera de Concepción y no hay quien reciba. Gabriel te escribe ahora para ver cómo lo resolvemos.',
    'Disculpa, hasta el {{HASTA}} no estamos en Concepción. Le aviso a Gabriel para que te escriba.'
  ],
  // Igual que fuera_llegada pero de noche (21:00 a 09:00): no promete que Gabriel escriba «ahora».
  fuera_llegada_noche: [
    'Disculpa, esta semana no estamos en Concepción. Le aviso a Gabriel y te escribe mañana desde las 9.'
  ],
  fuera_porteria: [
    'Mejor no lo dejes esta semana: no hay quien lo reciba ni lo cuide. Te esperamos desde el {{VUELTA}}, y si quieres asegurar hora, dime y Gabriel te la agenda.',
    'Espera un poco con eso: hasta el {{HASTA}} no estamos. El {{VUELTA}} lo recibimos con calma.'
  ],
  fuera_vuelta: [
    'Volvemos a recibir equipos el {{VUELTA}}. Para ese día puedes tomar hora acá: ' + AGENDA
  ],
  ventilador: [
    'El cambio de ventilador son $15.000 más la pieza. Muchas veces basta con una limpieza ($25.000). Lo vemos en el diagnóstico. ' + DIAG + ' Agenda: ' + AGENDA
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
  // Palabra clave REVISIÓN de los carruseles de reparación (AGENDA es la de página + agenda).
  revision: [
    '¡Hola! Para la revisión cuéntame qué le pasa al equipo y el modelo, y te digo qué conviene. ' + DIAG + ' Agenda acá: ' + AGENDA,
    '¡Dale! Revisamos tu notebook o PC y te decimos qué tiene y cuánto sale antes de tocarlo. ' + DIAG + ' ¿Qué le pasa? Hora acá: ' + AGENDA
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
  // Solo con MODO_FUERA activo (soloFuera): con el modo apagado no existen.
  { id: 'fuera_porteria', soloFuera: true, re: /\b(lo (dejo|deje) en (la )?porteria|ya lo deje|voy a dejarlo|voy en camino|voy para alla)\b/, urgente: true },
  { id: 'llegada', re: /\b(llegu[eé]|estoy (afuera|abajo|aca|aqui|en el hall|en la puerta|en el lobby|esperando)|ya estoy (aca|aqui|afuera|abajo)|voy llegando|estoy llegando)\b/, urgente: true },
  { id: 'garantia', re: /\b(sigue (igual|fallando|con)|volvio a (fallar|pasar)|otra vez (lo mismo|se)|no quedo bien)\b/, urgente: true },
  { id: 'urgente', re: /\b(se mojo|derram|le cayo (agua|cafe|te|jugo|bebida)|se (me )?llen[oa] de (agua|liquido)|se me cayo (agua|cafe)|liquido)\b/, urgente: true },
  { id: 'estado', re: /\b(esta listo|ya esta (listo)?\??$|estara listo|como va (mi|el)|novedad(es)? (de|del|con)|puedo (ir a )?(buscar|retirar)|cuando (lo )?retiro|esta disponible mi)\b/, urgente: true },
  { id: 'pago', re: /\b(te (transferi|deposite)|ya (transferi|pague|deposite)|comprobante|transferencia (lista|hecha))\b/, aviso: true },
  { id: 'agendo', re: /\b(agende|ya agendo|voy a agendar|agendada|agendado|tome (la )?hora|reserve)\b/, aviso: true },
  { id: 'fuera_vuelta', soloFuera: true, re: /\b(cuando (vuelven|vuelves|regresan|regresas)|la proxima semana)\b/ },
  { id: 'demo', re: /\bdemo\b/ },
  { id: 'revision', re: /^(una )?revision[!. ]*$|\b(quiero|necesito|para) (una )?revision\b/ },
  { id: 'web', re: /\b(agenda pro|pagina web|sitio web|landing)\b|^web$/ },
  // Memoria, en orden de prioridad (sección B). Van antes que pantalla/batería/etc.
  { id: 'memoria_sintoma', re: /^(?=.*\b(memoria|ram)\b).*(error|pantallazo azul|se (apaga|apago|congela|congelo|cuelga|colgo|reinicia|reinicio)|no (prende|enciende))/ },
  { id: 'mem_miedo', re: /miedo (de |a )?hacerlo\b|hacerlo yo.*miedo|^(?=.*\b(ram|ssd|memoria|disco|pieza)\b).*miedo (de |a )?(abrir|cambiar|romper|meterle|tocar)/ },
  { id: 'mem_pieza_ya', re: /^(?!.*\b(pantalla|bateria|teclado|bisagras?|jack|cargador|ventilador)\b)(?=.*(\b(ya )?compre (la|el|una?|mi) (pieza|disco)\b|\btengo (la|el|una?|mi) (pieza|disco) (nueva|nuevo|comprada|comprado)\b|\bme llego (la|el|una?|mi) (pieza|disco)\b))|\b(ya )?compre (la|el|una?|mi) (ram|ssd|memoria|ddr[345])\b(?! llen)|\btengo (la|el|una?|mi) (ram|ssd|memoria|ddr[345]) (nueva|nuevo|comprada|comprado)\b|\bme llego (la|el|una?|mi) (ram|ssd|ddr[345])\b/ },
  { id: 'mem_pieza', re: /\b(la|lo) (compro|compraria) yo\b|\bcomprarl[ao] yo\b|^(?=.*\b(ram|ssd|memoria|disco)\b).*con credito/ },
  { id: 'mem_compat', re: /se le puede hacer (eso|esto)\b|^(?=.*\b(ram|ssd|memoria|ddr[345]|disco)\b).*(se le puede (hacer|poner|aumentar|ampliar)|\bse puede\b|sirve para mi|\bcompatible\b)/ },
  { id: 'memoria_duda', re: /^(?!.*\b(ram|ddr[345]|ssd|disco solido)\b)(?!.*(polvo|agua|liquido|cafe|ventilador|mojo|derram|virus|basura|malware|publicidad))(?=.*(\bmemoria\b|sin espacio|(disco|almacenamiento|fotos|archivos|pc|notebook|compu\w*|laptop).*se (me )?llen[ao]\b|se (me )?llen[ao]\b.*(disco|almacenamiento|fotos|archivos|pc|notebook|compu\w*|laptop)))/ },
  { id: 'upgrade_ram', re: /\b(ram|ddr[345])\b/ },
  { id: 'ssd', re: /\b(ssd|disco solido|disco|almacenamiento)\b/ },
  { id: 'teclado', re: /\bteclado\b/ },
  { id: 'pantalla', re: /\b(pantalla|display|flex)\b/ },
  { id: 'bisagras', re: /\bbisagra/ },
  { id: 'jack', re: /\b(jack|pin de carga|entrada de(l)? cargador|puerto de carga)\b/ },
  { id: 'bateria', re: /\bbateria/ },
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
const SERVICIO = ['no_enciende','teclado','pantalla','bisagras','jack','bateria','memoria_sintoma','mem_miedo','mem_pieza_ya','mem_pieza','mem_compat','memoria_duda','upgrade_ram','ssd','ventilador','datos','programas','armado','remoto','domicilio','otros_disp','formateo','limpieza','lento'];

function normalizar(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// fuera = true activa las reglas marcadas soloFuera (MODO_FUERA).
function clasificar(texto, fuera) {
  const t = normalizar(texto);
  const ids = REGLAS.filter(r => (!r.soloFuera || fuera) && r.re.test(t)).map(r => r.id);
  return ids;
}

function horaChile(ahora) {
  const h = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', hour: 'numeric', hourCycle: 'h23' }).format(new Date(ahora));
  return Number(h);
}

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// Fecha de hoy en Chile como 'YYYY-MM-DD'.
function fechaChile(ahora) {
  const p = {};
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(ahora)).forEach(x => { p[x.type] = x.value; });
  return p.year + '-' + p.month + '-' + p.day;
}

// MODO_FUERA: links.fuera = 'YYYY-MM-DD' (último día fuera). Devuelve null si está apagado,
// vacío, inválido o ya pasó; si está activo, { vuelta: 'lunes 16', hasta: 'domingo' } derivados de la fecha.
function modoFuera(links, ahora) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String((links && links.fuera) || '').trim());
  if (!m) return null;
  const fin = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (fin.getUTCFullYear() !== +m[1] || fin.getUTCMonth() !== +m[2] - 1 || fin.getUTCDate() !== +m[3]) return null;
  if (fechaChile(ahora) > fin.toISOString().slice(0, 10)) return null;
  const vuelta = new Date(fin.getTime() + DIA);
  return { vuelta: DIAS_SEMANA[vuelta.getUTCDay()] + ' ' + vuelta.getUTCDate(), hasta: DIAS_SEMANA[fin.getUTCDay()] };
}

// Elige una variante (con hash, como siempre) y rellena los placeholders.
function renderizar(clave, ahora, links, fuera) {
  const opciones = TEXTOS[clave];
  const f = fuera || {};
  return opciones[hash(String(ahora) + clave) % opciones.length]
    .split('{{LINK_AGENDA}}').join(links.agenda)
    .split('{{LINK_WEB}}').join(links.web)
    .split('{{LINK_PEDIDOS}}').join(links.pedidos)
    .split('{{VUELTA}}').join(f.vuelta || '')
    .split('{{HASTA}}').join(f.hasta || '')
    .replace(/\*\*/g, '');
}

// ---------------------------------------------------------------------------
// Preguntas pendientes (contacto.pend = { q, t, intentos }, válidas 24 h).
// El bot recuerda qué preguntó para entender «1», «2» o un modelo suelto.
// ---------------------------------------------------------------------------
const LOGISTICA = ['llegada', 'estado', 'pago', 'urgente', 'garantia', 'ubicacion', 'horario', 'fuera_porteria', 'fuera_vuelta'];
const MEMORIA_IDS = ['memoria_sintoma', 'mem_miedo', 'mem_pieza_ya', 'mem_pieza', 'mem_compat', 'memoria_duda', 'upgrade_ram', 'ssd'];
const PREGUNTAS = { memoria_duda: 'MEM-D', upgrade_ram: 'RAM-1' };
const BOTONES_PREGUNTA = {
  'MEM-D': [['Se me llena', 'MEMD_1'], ['Se pone lento', 'MEMD_2']],
  'RAM-1': [['Cotizar', 'RAM_1'], ['Diagnóstico', 'RAM_2']]
};
const SENAL_LENTO = /\b(lent[oa]|se pega|pegad[oa]|varias cosas|pestanas?|programas abiertos|demora|demoro|tarda|tardo)\b|prender|encender/;
const SENAL_ESPACIO = /^(1|uno)\b|espacio|llen[ao]\b|guardar|\bfotos?\b|archivos?|almacenamiento|disco/;
const NO_SE = /\b(no se|no tengo idea|no cacho|nula con la tecnologia|no estoy segur[oa])\b/;

function esModelo(t) {
  return /\b(?=[a-z0-9-]*[a-z])(?=[a-z0-9-]*\d)[a-z0-9-]{3,}\b/.test(t) || /\b[a-z]{3,}\s?-?\d{1,4}\b/.test(t);
}

// Devuelve '1', '2', 'nose' o null (no se entiende).
function interpretar(q, t, payload) {
  if (q === 'MEM-D') {
    if (payload === 'MEMD_1') return '1';
    if (payload === 'MEMD_2') return '2';
    const lento = SENAL_LENTO.test(t) || /^(2|dos)\b/.test(t);
    const espacio = SENAL_ESPACIO.test(t);
    if (lento) return '2';              // lento, o ambas: el diagnóstico cubre las dos
    if (espacio) return '1';
    return NO_SE.test(t) ? 'nose' : null;
  }
  if (payload === 'RAM_1') return '1';
  if (payload === 'RAM_2') return '2';
  if (/^(1|uno)\b/.test(t)) return '1';
  if (/^(2|dos)\b|diagnostic|revis/.test(t)) return '2';
  if (/cotiz|precio|cuanto/.test(t)) return '1';
  if (NO_SE.test(t)) return '2';
  return t.split(' ').length <= 4 && esModelo(t) ? '1' : null;   // solo respuestas cortas
}

// Salida común de las respuestas a una pregunta pendiente: respeta el tope de 3 por hora.
function salidaPend(c, intencion, clave, ahora, links, extra) {
  c.bots = (c.bots || []).filter(x => ahora - x < HORA);
  // Con el tope solo se anula el texto: el aviso y el resumen a Gabriel se conservan.
  const aviso = extra.aviso === undefined ? 'normal' : extra.aviso;
  if (c.bots.length >= 3) return { intencion, respuesta: null, botones: null, aviso, resumen: extra.resumen || '', contacto: c };
  let respuesta = renderizar(clave, ahora, links, null);
  if (extra.noche && (horaChile(ahora) >= 21 || horaChile(ahora) < 9)) respuesta += ' Te contesta mañana desde las 9.';
  c.enviados[clave] = ahora; c.ultimoBot = ahora; c.bots.push(ahora);
  if (!extra.mantener) c.pend = null;
  return { intencion, respuesta, botones: extra.botones || null, aviso, resumen: extra.resumen || '', contacto: c };
}

// Si el mensaje responde a una pregunta pendiente, la atiende (aunque haya conversación en curso
// de las últimas 48 h o la misma respuesta ya se haya mandado en 24 h). Devuelve null si no corresponde.
function resolverPendiente(texto, payload, c, ahora, links) {
  const p = c.pend;
  if (!p) return null;
  if (ahora - p.t > DIA) { c.pend = null; return null; }
  const t = normalizar(texto).replace(/(.)\1{2,}/g, '$1');
  const ids = clasificar(texto, !!modoFuera(links, ahora));
  if (ids.some(i => LOGISTICA.includes(i))) { c.pend = null; return null; }   // la logística manda (M8)
  // Pidió otro servicio (formateo, batería...): se borra la pendiente y se atiende esa intención.
  const ajenos = SERVICIO.filter(x => !MEMORIA_IDS.includes(x) && !(p.q === 'MEM-D' && (x === 'lento' || x === 'no_enciende')));
  if (ids.some(i => ajenos.includes(i))) { c.pend = null; return null; }
  c.visto = ahora;
  // Reacciones, «jaja», emojis o adjuntos sin texto: no avanzan ni cuentan como fallo (M2).
  if (!/[a-z0-9]/.test(t) || /^(ja|je|ji|jo)+[ !.]*$/.test(t)) return { intencion: 'pend_ignorada', respuesta: null, botones: null, aviso: null, contacto: c };
  const op = interpretar(p.q, t, payload);
  if (p.q === 'MEM-D') {
    if (op === '1') return salidaPend(c, 'mem_d1', 'mem_d1', ahora, links, { resumen: 'Quiere SSD · falta cotizar la pieza' });
    if (op === '2') return salidaPend(c, 'mem_d2', 'mem_d2', ahora, links, { resumen: 'Memoria · lentitud o demora en prender' });
    if (op === 'nose') return salidaPend(c, 'sal5', 'sal5_que', ahora, links, { resumen: 'No sabe qué elegir (memoria)' });
  } else if (op) {
    const a = op === '1';
    return salidaPend(c, a ? 'ram_1a' : 'ram_1b', a ? 'ram_1a' : 'ram_1b', ahora, links, {
      resumen: a ? 'RAM · pide cotización · ' + String(texto).slice(0, 80) : 'RAM · eligió diagnóstico' });
  }
  if (p.q === 'MEM-D' && ids.includes('precio_general')) {                         // M4: no cuenta como fallo
    return salidaPend(c, 'pend_precio', 'mem_d_precio', ahora, links, { botones: botones(BOTONES_PREGUNTA[p.q]), mantener: true, aviso: null });
  }
  if (ids.length) { c.pend = null; return null; }                               // habló de otra cosa
  const bts = botones(BOTONES_PREGUNTA[p.q]);
  if (p.intentos >= 1) {
    return salidaPend(c, 'sal2', 'sal2', ahora, links, { noche: true, aviso: 'urgente',
      resumen: 'No entendió la pregunta ' + p.q + ' · último mensaje: ' + String(texto).slice(0, 80) });
  }
  p.intentos++; p.t = ahora;
  return salidaPend(c, 'pend_repite', p.q === 'MEM-D' ? 'rep_mem_d' : 'rep_ram', ahora, links, { botones: bts, mantener: true, aviso: null });
}


// ---------------------------------------------------------------------------
// Flujo de Pedidos (DEMO): se conserva como estaba (ver infra/n8n/FLUJO-WEB.md).
// Estado en contacto.web = { paso, eleccion: 'PEDIDOS', negocio, hoyTexto, cuando, t, reintento }.
// ---------------------------------------------------------------------------
const MENU_INICIO = [['Reparación', 'MENU_REP'], ['Desarrollo web', 'MENU_WEB']];
const W_HOY_PEDIDOS = [['Por WhatsApp', 'H_WSP'], ['Por apps de delivery', 'H_APPS'], ['Ambas', 'H_AMBAS']];
const W_CUANDO = [['Este mes', 'C_MES'], ['En 1 a 3 meses', 'C_TRIM'], ['Solo estoy mirando', 'C_MIRANDO']];

function botones(lista) { return lista.map(([titulo, payload]) => ({ titulo, payload })); }

function cierrePedidos(w) {
  const caliente = w.cuando !== 'C_MIRANDO';
  const resumen = ['Pedidos para local', w.negocio, w.hoyTexto, { C_MES: 'este mes', C_TRIM: 'en 1 a 3 meses', C_MIRANDO: 'solo mirando' }[w.cuando]].filter(Boolean).join(' · ');
  let texto = 'Mira cómo funciona en un local real, Gassuso: ' + LINK_GASSUSO + '\nTus clientes piden directo, por 1% del pedido, sin las comisiones de las apps.';
  texto += caliente
    ? '\n\nSi quieres, agendamos una reunión gratis de 45 min por Google Meet: ' + LINK_REUNION + '\nCuando agendes, te confirmo el link de Meet por aquí.'
    : '\n\nCuando quieras verlo con calma, agenda una reunión gratis acá: ' + LINK_REUNION + ' o escribe REUNIÓN.';
  return { texto, aviso: caliente ? 'urgente' : 'normal', resumen };
}

const REG_DEMO = /\bdemo\b|\b(sistema de pedidos|pedidos para mi local)\b/;

// Devuelve null si el mensaje no es del flujo de Pedidos; si lo es, { respuesta, botones, aviso, intencion, resumen }.
function flujoPedidos(texto, payload, c, ahora) {
  const t = normalizar(texto);
  const activo = c.web && c.web.paso !== undefined && ahora - c.web.t < DIA;
  if (!activo && !REG_DEMO.test(t)) return null;

  // Salida a una persona en cualquier momento.
  if (/\b(hablar|persona|humano|gabriel)\b/.test(t)) {
    c.web = null;
    return { intencion: 'web_humano', respuesta: '¡Dale! Le aviso a Gabriel y te escribe por aquí 🙌', botones: null, aviso: 'urgente', resumen: 'Pedidos para local' };
  }
  if (!activo) {
    c.web = { paso: 1, eleccion: 'PEDIDOS', t: ahora, reintento: 0 };
    return { intencion: 'web_inicio', respuesta: '¡Buenísimo! Para mostrarte algo que te sirva: ¿a qué se dedica tu negocio?', botones: null, aviso: null };
  }

  const w = c.web; w.t = ahora;
  const reintentar = (pregunta, lista) => {
    if (w.reintento >= 1) { c.web = null; return { intencion: 'web_humano', respuesta: 'Te paso con Gabriel para verlo directo 🙌', botones: null, aviso: 'urgente', resumen: 'Pedidos para local' }; }
    w.reintento++;
    return { intencion: 'web_repite', respuesta: pregunta, botones: lista ? botones(lista) : null, aviso: null };
  };
  if (w.paso === 1) {
    if (!t || t.length < 2) return reintentar('¿A qué se dedica tu negocio? (por ejemplo: psicóloga, sushi, peluquería)');
    w.negocio = String(texto).slice(0, 80); w.paso = 2; w.reintento = 0;
    return { intencion: 'web_paso2', respuesta: '¿Y cómo lo haces hoy?', botones: botones(W_HOY_PEDIDOS), aviso: null };
  }
  if (w.paso === 2) {
    const op = W_HOY_PEDIDOS.find(([, p]) => p === payload);
    w.hoyTexto = op ? op[0] : String(texto).slice(0, 60);
    w.paso = 3; w.reintento = 0;
    return { intencion: 'web_paso3', respuesta: '¿Para cuándo lo necesitas?', botones: botones(W_CUANDO), aviso: null };
  }
  if (w.paso === 3) {
    let cuando = payload && payload.startsWith('C_') ? payload : null;
    if (!cuando) cuando = /mirando|viendo|cotiz|todavia|aun no/.test(t) ? 'C_MIRANDO' : /mes|ya|urgente|pronto|semana|luego/.test(t) ? 'C_MES' : /\d|mes|meses/.test(t) ? 'C_TRIM' : null;
    if (!cuando) return reintentar('¿Para cuándo lo necesitas?', W_CUANDO);
    w.cuando = cuando;
    const f = cierrePedidos(w); c.web = null;
    return { intencion: 'web_cierre', respuesta: f.texto, botones: null, aviso: f.aviso, resumen: f.resumen };
  }
  c.web = null;
  return null;
}

// ---------------------------------------------------------------------------
// Diálogo C · Página con agenda (DIALOGOS-BOT-V2, sección C).
// El bot guarda lo que el cliente va contando y pregunta solo lo que falta (M3):
// rubro → marca → cómo agenda hoy, máximo 3 preguntas. Sin precio ni Meet de 45 min.
// Estado en contacto.ag = { paso: rubro|marca|hoy|cierre|fin, t, rubro, marca, hoy, quiere[], ... }.
// ---------------------------------------------------------------------------
const AG_QUIERE = {
  tienda: /\b(tienda|vender|catalogo|productos?|carrito)\b/,
  portafolio: /\b(portafolio|galeria|mostrar (mis )?trabajos)\b/,
  agenda: /\b(agendar|reservas?|citas?|calendario|que reserven)\b/,
  correos: /\b(correos?|mails?|email)\b/,
  rediseno: /redisen|moderniz|actualizar (la |mi )?pagina|ya tengo una pagina|https?:\/\/|www\.|\b[a-z0-9-]+\.(cl|com|net|org|xyz)\b/,
  dominio: /\b(dominio|hosting)\b/
};
// Las que se repiten en la frase «la página lleva …» (en este orden) y cómo se nombran.
const AG_FRASE = [['portafolio', 'portafolio'], ['tienda', 'tienda'], ['agenda', 'calendario'], ['correos', 'correos'], ['rediseno', 'rediseño']];
const AG_ETIQ = { portafolio: 'portafolio', tienda: 'tienda', agenda: 'agenda', correos: 'correos', rediseno: 'rediseño', dominio: 'dominio' };
const AG_RUBRO = /\b(soy|somos|me dedico a|trabajo (?:de|como|en)|mi (?:emprendimiento|negocio|consult[a-z]*|local|empresa|taller|estudio|clinica|clínica|salon|salón) (?:de|es)\b)[^.,;\n]{0,70}/i;
const AG_DIR = /(https?:\/\/\S+|www\.\S+|\b[a-z0-9-]+\.(?:cl|com|net|org|xyz)\b\S*)/i;
const AG_TEL = /(?:\+?56[\s-]?)?9[\s-]?\d{4}[\s-]?\d{4}\b/;
// Palabras clave exactas: entran siempre.
const AG_ENTRADA_FIJA = /\b(desarrollo web|pagina web|sitio web|landing|agenda online|agenda pro)\b|^(web|agenda|agenda pro|agenda online)[!. ]*$/;
// Frases libres: entran solo si el mensaje no es de reparación ni de otro tema (ver vetoReparacion).
const AG_ENTRADA_LIBRE = /\bweb\b|\b(tienda (online|virtual|en linea)|e-?commerce|catalogo online|vender por internet|(pagina|sitio) para vender|sitio para vender (mis )?productos|pagina para mi (negocio|emprendimiento)|quiero una pagina)\b|\b(necesit\w+|quer\w+|quier\w+|quisiera|cotiz\w+|busco|hacer|armar|crear|hacen|redisen\w+)\b.*\bpagina\b/;
const AG_NO_WEB = /\b(factura|cobro|cobr[oó]|garantia|windows|drivers?|inicio|descarga|ayuda|banco)\b/;
const AG_EQUIPO = /\b(notebook|pc|compu\w*|laptop|computador\w*)\b/;
const AG_SINTOMA = /\b(no prende|no enciende|no parte|se pega|lent[oa]|se calienta|falla\w*|se apaga|se cuelga|error|no funciona|no carga)\b/;
function vetoReparacion(texto) {
  const t = normalizar(texto);
  // «Armar mi tienda online» no es armado de PC: con tienda/página/web/sitio/catálogo gana el flujo C.
  const armaWeb = /\b(tienda|pagina|web|sitio|catalogo)\b/.test(t);
  return clasificar(texto).some(i => SERVICIO.includes(i) && !(i === 'armado' && armaWeb)) || AG_NO_WEB.test(t) || (AG_EQUIPO.test(t) && AG_SINTOMA.test(t));
}
const AG_SAL8 = /\b(mi (numero|telefono|celular|whatsapp|wsp)|hablame|escribeme|llamame|llamenme|(mandame|pasame|dame) (tu |el )?(numero|wsp|whatsapp)|(cual es|tienes) (tu |el )?(numero|wsp|whatsapp)|te escribo al (correo|mail)|no me escribas|pero por escrito|prefiero por (aca|aqui))\b/;
const AG_HUMANO = /\b(hablar|persona|humano|gabriel)\b|con quien hablo|hay alguien/;
const AG_POSTERGA = /\b(te aviso|te confirmo|dame un (rato|segundo|ratito|momento)|dejame (ver|revisar|pensarlo)|voy a ver|mas tarde|en un rato|cuando pueda|llegando te mando|quedo atent[oa])\b/;
const FALSOS_NO = /\b(no hay (problema|drama)|no te preocupes|no tranqui|no importa|no te compliques)\b/;
const SI_RE = /^(si|sip|ya|yap|yapo|yapis|dale|vale|ok|oki|okis|oka|listo|perfecto|super|genial|bacan|buenisimo|claro|obvio|de una|altiro|ahora si|ahh ya|1|uno)\b/;
const NO_RE = /^(no|nop|ahora no|despues|mas adelante|lo pienso|lo voy a pensar|por ahora no|solo estoy mirando|solo queria saber|2|dos)\b|\bno gracias\b|\bahora no\b/;
const CONFUSION = /^(\?+|como|que|que cosa|eh|alo|no entendi|a que te refieres)$/;
const ENTRADA_SOLA = /^(web|agenda|agenda online|agenda pro|pagina|pagina web|sitio web|landing|desarrollo web|hola|holi|buenas|buenas tardes|buenos dias|si|no|ya|ok|dale)$/;

const AG_PIDE = /^(quiero|necesito|busco|quisiera|queria)\b/;
const AG_PREG = { rubro: 'ag_0', marca: 'ag_1', hoy: 'ag_2', cierre: 'ag_3' };
const AG_REP = { rubro: 'ag_0_rep', marca: 'ag_1_rep', hoy: 'ag_2_rep', cierre: 'ag_3_rep' };
const AG_INTENT = { rubro: 'web_inicio', marca: 'web_marca', hoy: 'web_hoy', cierre: 'web_mostrar' };
const AG_BOTONES = {
  marca: [['Sí, ya tengo', 'AG1_SI'], ['Todavía no', 'AG1_NO']],
  hoy: [['WhatsApp o mensajes', 'AG2_1'], ['Cuaderno o planilla', 'AG2_2'], ['Otra app', 'AG2_3']],
  cierre: [['Sí, veámoslo', 'AG3_SI'], ['Ahora no', 'AG3_NO']]
};

// Normaliza para interpretar respuestas: sin tildes, letras repetidas colapsadas y sin signos.
function lim(s) {
  return normalizar(s).replace(/(.)\1{2,}/g, '$1').replace(/[¿?¡!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// 'si' | 'no' | null. Los falsos «no» («no hay problema», «no tranqui») se evalúan antes que el «no».
function respSiNo(t) {
  if (FALSOS_NO.test(t)) return 'si';
  if (NO_RE.test(t)) return 'no';
  if (SI_RE.test(t)) return 'si';
  return null;
}

function respMarca(t, payload) {
  if (payload === 'AG1_SI') return 'si';
  if (payload === 'AG1_NO') return 'no';
  if (/no se que es|que es (eso de )?marca/.test(t)) return 'explica';
  if (/^(2|dos)\b|todavia no|aun no|estoy en eso|mas o menos|a medias|solo el nombre|no tengo (ni )?(logo|marca|identidad)|no hay (logo|marca)|sin (logo|marca)|no tengo$/.test(t)) return 'no';
  if (/tengo (el |un |mi )?(logo|marca|identidad)|mi (logo|marca)/.test(t)) return 'si';
  return respSiNo(t);
}

function respHoy(t, payload) {
  if (payload && /^AG2_[123]$/.test(payload)) return ['wsp', 'cuaderno', 'app'][Number(payload.slice(4)) - 1];
  if (/no agendo|aun no atiendo|^nada\b/.test(t)) return 'no_agenda';
  if (/^(1|uno)\b|whatsapp|wsp|wasap|wpp|mensajes|instagram|\bdm\b|me escriben|me llaman|telefono/.test(t)) return 'wsp';
  if (/^(2|dos)\b|cuaderno|planilla|excel|libreta|papel|a mano/.test(t)) return 'cuaderno';
  if (/^(3|tres)\b|\bapp\b|aplicacion|calendly|agendapro|google calendar|sistema|software/.test(t)) return 'app';
  return null;
}

function nuevoAg(ahora) {
  return { paso: 'rubro', t: ahora, rubro: null, marca: null, hoy: null, quiere: [], precio: false, recomendado: false, nombreRec: null,
    compara: false, urgencia: false, telefono: null, dir: null, intentos: 0, preguntas: 0, dioO: false, dioR: false, dioD: false, precioPedido: false };
}

// Extrae datos de CUALQUIER mensaje (M3). Devuelve lo que apareció en este mensaje.
function leerAg(ag, texto) {
  const t = normalizar(texto);
  const ev = { precio: false, compara: false, recomendado: false, d: false, quiereAhora: false };
  const antes = ag.quiere.length;
  const dir = AG_DIR.exec(String(texto));
  const tSinUrl = normalizar(String(texto).replace(AG_DIR, ' '));      // «/tienda» dentro de una dirección no es «quiero tienda»
  for (const k of Object.keys(AG_QUIERE)) if ((AG_QUIERE[k].test(k === 'rediseno' ? t : tSinUrl) || (k === 'rediseno' && dir)) && !ag.quiere.includes(k)) ag.quiere.push(k);
  if (dir && !ag.dir) ag.dir = dir[0].slice(0, 80);
  ev.quiereAhora = Object.keys(AG_QUIERE).some(k => AG_QUIERE[k].test(k === 'rediseno' ? t : tSinUrl)) || !!dir;
  ev.d = !!dir || ag.quiere.slice(antes).some(k => ['rediseno', 'dominio', 'correos'].includes(k));
  if (!ag.marca) {
    if (/no (hay|tengo|tenemos) (un |ni )?(logo|marca|identidad)|sin (logo|marca)|solo el nombre/.test(t)) ag.marca = 'no';
    else if (/(ya )?tengo (un |mi |el )?(logo|marca|identidad)|\bmi (logo|marca)\b/.test(t)) ag.marca = 'si';
  }
  if (!ag.hoy && /no agendo|cuaderno|planilla|excel|calendly|agendapro|google calendar|(agendo|coordino|reservan|piden hora)\b.*\b(whatsapp|wsp|instagram)/.test(t)) {
    ag.hoy = /no agendo/.test(t) ? 'no_agenda' : /cuaderno|planilla|excel/.test(t) ? 'cuaderno' : /calendly|agendapro|google calendar/.test(t) ? 'app' : 'wsp';
  }
  if (!ag.rubro) { const r = AG_RUBRO.exec(String(texto)); if (r) ag.rubro = r[0].replace(/\s*(?:,|\by\b)?\s*\b(quiero|necesito|busco|quisiera)\b.*$/i, '').trim().slice(0, 80) || null; }
  ev.precio = /\b(cuanto (sale|cuesta|cobr\w*|vale|seria|saldria|es)|precio|valor|rango|presupuesto|platita)\b/.test(t);
  // Ya preguntó el precio: la insistencia sin las palabras de siempre («aunque sea aproximado») también cuenta.
  if (!ev.precio && ag.precioPedido) ev.precio = /\b(aproximado|aproximada|aunque sea|mas o menos cuanto|un numero|un valor|insisto|pero cuanto)\b/.test(t);
  ev.compara = /\b(cotizando|cotizo|comparando|comparar|otras opciones|varias opciones|varios lados|otros lados)\b/.test(t);
  ev.recomendado = /\b(me (dio|dieron|paso|pasaron) (tu|el|su) (dato|contacto|numero|instagram)|me recomend\w+|te recomendaron|vengo de parte)\b/.test(t);
  if (ev.recomendado && !ag.nombreRec) {
    const n = /(?:contacto|dato|numero)\s+(?:de\s+)?([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,})/.exec(String(texto)) || /me recomend(?:ó|o)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,})/.exec(String(texto));
    if (n) ag.nombreRec = n[1];
  }
  if (ev.recomendado) ag.recomendado = true;
  if (ev.compara) ag.compara = true;
  if (/\b(urgente|lo antes posible|para hoy|es para mi trabajo|lo necesito (ya|rapido))\b/.test(t)) ag.urgencia = true;
  return ev;
}

// Resumen estructurado para Gabriel (nunca lleva claves: solo lo que el cliente contó del negocio).
function resumenAg(ag) {
  const marca = ag.marca === 'si' ? 'con marca' : ag.marca === 'no' ? 'sin marca' : 'marca sin dato';
  const hoy = { wsp: 'agenda por WhatsApp', cuaderno: 'cuaderno o planilla', app: 'otra app', no_agenda: 'no agenda' }[ag.hoy] || 'cómo agenda: sin dato';
  const sn = v => v ? 'sí' : 'no';
  return ['Lead agenda', ag.rubro || 'sin rubro', marca, hoy,
    'quiere: ' + (Object.keys(AG_ETIQ).filter(k => ag.quiere.includes(k)).map(k => AG_ETIQ[k]).join(', ') || 'sin dato'),
    'pidió precio: ' + sn(ag.precio), 'recomendado: ' + sn(ag.recomendado) + (ag.nombreRec ? ' (' + ag.nombreRec + ')' : ''), 'compara: ' + sn(ag.compara)]
    .concat(ag.urgencia ? ['urgencia: sí'] : [], ag.telefono ? ['teléfono: ' + ag.telefono] : [], ag.dir ? ['web: ' + ag.dir] : []).join(' · ');
}

function sufijoNoche(ahora) { const h = horaChile(ahora); return h >= 21 || h < 9 ? ' Te contesta mañana desde las 9.' : ''; }

// Arma la salida: segmentos laterales (AG-P/O/R/D), frase opcional y el texto del paso.
function salidaAg(ag, ahora, links, intencion, segs, clave, extra) {
  const e = extra || {};
  const partes = (segs || []).slice();
  if (clave) partes.push((e.frase ? e.frase + '\n\n' : '') + renderizar(clave, ahora, links, null) + (e.sufijo || ''));
  return { intencion, respuesta: partes.join('\n\n'), botones: e.botones ? botones(e.botones) : null,
    aviso: e.aviso === undefined ? null : e.aviso, resumen: e.resumen || '' };
}

function sal2Ag(ag, ahora, links, texto, motivo) {
  ag.paso = 'fin';
  const ultimo = /clave|contrasena|password/.test(normalizar(texto)) ? '[mensaje omitido]' : String(texto).slice(0, 80);
  return salidaAg(ag, ahora, links, 'web_humano', [], 'sal2', { sufijo: sufijoNoche(ahora), aviso: 'urgente',
    resumen: resumenAg(ag) + ' · ' + motivo + ' · último mensaje: ' + ultimo });
}

function cierreAg(ag, ahora, links, si) {
  ag.paso = 'fin';
  return salidaAg(ag, ahora, links, si ? 'web_llamada' : 'web_ahora_no', [], si ? 'ag_4a' : 'ag_4b', {
    aviso: si ? 'urgente' : 'normal', resumen: si ? '🔥 ' + resumenAg(ag) + ' · ya tiene el link' : resumenAg(ag) + ' · ahora no' });
}

// SAL-8: pide otro canal o deja un teléfono. El número va solo al aviso, nunca al cliente.
function canalAg(ag, ahora, links, texto, tel) {
  const yaTenia = !!ag.telefono;
  if (tel) ag.telefono = tel[0].trim();
  ag.paso = 'fin';
  const clave = yaTenia ? 'sal8_ya' : /(tu|el) (numero|wsp|whatsapp)/.test(normalizar(texto)) && !tel ? 'sal8_octavo' : 'sal8';
  return salidaAg(ag, ahora, links, 'web_canal', [], clave, { aviso: 'urgente', resumen: 'Pide contacto por WhatsApp · ' + resumenAg(ag) });
}

function siguientePaso(ag) {
  if (!ag.rubro) return 'rubro';
  if (!ag.marca) return 'marca';
  // «Hoy» se pregunta si no dijo qué quiere o si quiere agenda; se salta solo si quiere otra cosa y no agenda.
  if (!ag.hoy && (!ag.quiere.length || ag.quiere.includes('agenda'))) return 'hoy';
  return 'cierre';
}

function fraseAg(ag) {
  const p = AG_FRASE.filter(([k]) => ag.quiere.includes(k)).map(([, n]) => n);
  if (!p.length) return null;
  return 'Gracias por contarme. Con lo que me dices, la página lleva ' + (p.length > 1 ? p.slice(0, -1).join(', ') + ' y ' + p[p.length - 1] : p[0]) + '.';
}

// Segmentos laterales, una vez cada uno: AG-R, AG-D, AG-O y AG-P (en ese orden).
function segmentosAg(ag, ev, ahora, links) {
  const s = [];
  if (ev.recomendado && !ag.dioR) { ag.dioR = true; s.push(renderizar('ag_recom', ahora, links, null)); }
  if (ev.d && !ag.dioD) { ag.dioD = true; s.push(renderizar('ag_dominio', ahora, links, null)); }
  if (ev.compara && !ag.dioO) { ag.dioO = true; s.push(renderizar('ag_compara', ahora, links, null)); }
  if (ev.precio) { ag.precio = true; ag.precioPedido = true; s.push(renderizar('ag_precio', ahora, links, null)); }
  return s;
}

// Muestra el paso `ag.paso` (pregunta nueva). AG-3 lleva aviso normal con el resumen del lead.
function preguntaAg(ag, ahora, links, segs, opciones) {
  const paso = ag.paso;
  if (paso !== 'cierre') ag.preguntas++;
  ag.intentos = 0;
  const e = Object.assign({ botones: AG_BOTONES[paso] }, opciones || {});
  if (paso === 'cierre') { e.frase = fraseAg(ag); e.aviso = 'normal'; e.resumen = resumenAg(ag); }
  return salidaAg(ag, ahora, links, AG_INTENT[paso], segs, AG_PREG[paso], e);
}

function rubroValidoAg(texto, t, ev) {
  if (/\?/.test(texto) || CONFUSION.test(t) || ENTRADA_SOLA.test(t)) return null;
  if (AG_PIDE.test(t) || ev.quiereAhora) return null;               // «quiero una tienda» es lo que quiere, no su rubro
  if (t.replace(/[^a-z]/g, '').length < 3 || /^(ja|je|ji|jo)+$/.test(t)) return null;
  if (ev.precio || ev.compara || ev.recomendado) return null;       // era una consulta, no su rubro
  return String(texto).trim().slice(0, 80);
}

// Aplica la respuesta al paso actual. Devuelve true si el mensaje respondía la pregunta.
function respondePaso(ag, texto, t, payload, ev, segs, ahora, links) {
  if (ag.paso === 'rubro') {
    if (!ag.rubro) ag.rubro = rubroValidoAg(texto, t, ev);
    return !!ag.rubro;
  }
  if (ag.paso === 'marca') {
    if (!ag.marca) {
      const m = respMarca(t, payload);
      if (m === 'explica') { ag.marca = 'no'; segs.push(renderizar('ag_1_explica', ahora, links, null)); }
      else if (m) ag.marca = m;
    }
    return !!ag.marca;
  }
  if (ag.paso === 'hoy') {
    if (!ag.hoy) ag.hoy = respHoy(t, payload);
    return !!ag.hoy;
  }
  return false;
}

// Mensaje que no responde la pregunta: M4 (lo preguntado se responde y se repite), M5 (dos intentos).
function noRespondeAg(ag, texto, t, segs, ahora, links, ev) {
  const paso = ag.paso;
  const rep = clave => salidaAg(ag, ahora, links, 'web_repite', segs, clave, { botones: AG_BOTONES[paso] });
  // Dijo qué quiere en vez de su rubro: ya quedó anotado en `quiere`; se repregunta sin contar fallo.
  if (paso === 'rubro' && ev && (ev.quiereAhora || AG_PIDE.test(t))) return rep('ag_0_anoto');
  if (segs.length) return rep(AG_PREG[paso]);                               // contestó algo lateral: repite la pregunta, no es fallo
  if (/\?/.test(texto) && !CONFUSION.test(t)) {
    segs.push(renderizar('ag_lateral', ahora, links, null));
    return rep(AG_PREG[paso]);
  }
  const ids = clasificar(texto).filter(i => SERVICIO.includes(i));
  if (ids.length) {
    segs.push(renderizar('ag_dos_temas', ahora, links, null));
    const r = salidaAg(ag, ahora, links, 'web_repite', segs, AG_PREG[paso], { botones: AG_BOTONES[paso], aviso: 'normal', resumen: 'dos temas · ' + resumenAg(ag) });
    return r;
  }
  if (ag.intentos >= 1) return sal2Ag(ag, ahora, links, texto, 'no entendió ' + paso);
  ag.intentos++;
  return rep(AG_REP[paso]);
}

// Devuelve null si el mensaje no es del flujo de la página con agenda.
function flujoAgenda(texto, payload, c, ahora, links) {
  const t = lim(texto);
  const activo = !!c.ag && c.ag.paso !== 'fin' && ahora - c.ag.t < DIA;
  const tel = AG_TEL.exec(String(texto));
  const llamada = /^(quiero )?(la )?llamada$/.test(t);
  // SAL-8: pide contacto explícito (con o sin número) o, dentro del flujo, el mensaje es casi solo un número.
  // Un número dentro de una consulta («la serie 912345678, se pega») no desvía nada.
  const palabras = tel ? lim(String(texto).replace(AG_TEL, ' ')).split(' ').filter(Boolean).length : 0;
  const sal8 = AG_SAL8.test(t) || (!!tel && activo && palabras <= 3);
  const fuera = !!modoFuera(links, ahora);
  const norm = normalizar(texto);
  const inicia = payload === 'MENU_WEB' || AG_ENTRADA_FIJA.test(norm) || (AG_ENTRADA_LIBRE.test(norm) && !vetoReparacion(texto));
  if (!activo && !llamada && !sal8 && !inicia) return null;
  if (activo && (!/[a-z0-9]/.test(t) || /^(ja|je|ji|jo)+$/.test(t) || /\b(liked a message|reacted|audio call)\b/.test(t))) {
    return { intencion: 'web_ignorada', respuesta: null, botones: null, aviso: null };        // M2
  }
  const ids = activo ? clasificar(texto, fuera) : [];
  if (activo && fuera && ids.includes('fuera_vuelta') && !ids.some(i => i !== 'fuera_vuelta' && LOGISTICA.includes(i))) {
    // FUERA-5 dentro del flujo: responde cuándo vuelven y repite la pregunta pendiente, sin contar fallo.
    c.ag.t = ahora;
    const ag = c.ag;
    return salidaAg(ag, ahora, links, 'fuera_vuelta', [renderizar('fuera_vuelta', ahora, links, modoFuera(links, ahora))], AG_PREG[ag.paso], { botones: AG_BOTONES[ag.paso] });
  }
  if (activo && ids.some(i => LOGISTICA.includes(i))) return null;                            // M8: la logística manda

  const previo = c.ag;
  const ag = activo || (previo && (llamada || sal8)) ? previo : nuevoAg(ahora);
  const nuevo = !activo;
  c.ag = ag; ag.t = ahora;
  if (llamada) return cierreAg(ag, ahora, links, true);
  if (sal8) { leerAg(ag, texto); return canalAg(ag, ahora, links, texto, tel); }
  if (activo && AG_HUMANO.test(t)) {                                                          // SAL-3
    ag.paso = 'fin';
    return salidaAg(ag, ahora, links, 'web_humano', [], 'sal3', { sufijo: sufijoNoche(ahora), aviso: 'urgente', resumen: resumenAg(ag) });
  }
  if (activo && AG_POSTERGA.test(t)) return salidaAg(ag, ahora, links, 'web_pausa', [], 'ag_sal6', {});   // SAL-6

  const ev = leerAg(ag, texto);
  if (tel && !ag.telefono) ag.telefono = tel[0].trim();      // dejó su teléfono dentro de una respuesta: señal para Gabriel
  if (ev.precio && ag.precioPedido) return sal2Ag(ag, ahora, links, texto, 'pide precio dos veces');
  const segs = segmentosAg(ag, ev, ahora, links);

  if (nuevo) {
    // Relato que ya trae lo que quiere (y quién es o de dónde viene): salta las preguntas.
    const relato = ag.quiere.length > 0 && (ag.rubro || ag.recomendado || ag.compara || ag.dir || ev.d);
    ag.paso = relato ? 'cierre' : siguientePaso(ag);
    return preguntaAg(ag, ahora, links, segs);
  }
  if (ag.paso === 'cierre') {
    const r = payload === 'AG3_SI' ? 'si' : payload === 'AG3_NO' ? 'no' : /llamada|cuando|me interesa/.test(t) && !respSiNo(t) ? 'si' : respSiNo(t);
    if (r) return cierreAg(ag, ahora, links, r === 'si');
    return noRespondeAg(ag, texto, t, segs, ahora, links, ev);
  }
  if (respondePaso(ag, texto, t, payload, ev, segs, ahora, links)) {
    ag.paso = siguientePaso(ag);
    return preguntaAg(ag, ahora, links, segs);
  }
  return noRespondeAg(ag, texto, t, segs, ahora, links, ev);
}

// Despacha: Pedidos (DEMO) conserva su flujo; lo demás de desarrollo web es el diálogo C.
function flujoWeb(texto, payload, c, ahora, links) {
  const pedidosActivo = c.web && c.web.paso !== undefined && ahora - c.web.t < DIA;
  if (pedidosActivo || REG_DEMO.test(normalizar(texto))) { c.ag = null; return flujoPedidos(texto, payload, c, ahora); }
  return flujoAgenda(texto, payload, c, ahora, links || {});
}

// contacto: { visto, gabriel, enviados: {intencion: ts}, ultimoBot, bots: [ts], web } (memoria persistente)
// Devuelve { intencion, respuesta|null, botones|null, aviso: null|'normal'|'urgente', resumen?, contacto }
function decidir(texto, contacto, ahora, links, payload) {
  const c0 = Object.assign({ visto: 0, gabriel: 0, enviados: {}, bots: [] }, contacto || {});
  const gabrielActivo = c0.gabriel && ahora - c0.gabriel < 12 * HORA;
  // El menú de bienvenida "Reparación" vuelve al bot de siempre con un saludo de servicio técnico.
  if (payload === 'MENU_REP') {
    c0.visto = ahora; c0.web = null; c0.pend = null;
    if (gabrielActivo) return { intencion: 'menu_rep', respuesta: null, botones: null, aviso: 'normal', contacto: c0 };
    c0.ultimoBot = ahora; c0.bots = (c0.bots || []).concat(ahora);
    return { intencion: 'menu_rep', respuesta: '¡Dale! Cuéntame qué le pasa a tu notebook o PC (y el modelo si lo tienes) y te digo cuánto sale.', botones: null, aviso: null, contacto: c0 };
  }
  if (!gabrielActivo) {
    const antes = JSON.stringify({ ag: c0.ag, web: c0.web });
    // Una conversación de flujo ya en marcha no se corta con el tope: cada respuesta contesta un mensaje del cliente.
    const enFlujo = (c0.ag && c0.ag.paso !== 'fin' && ahora - c0.ag.t < DIA) || (c0.web && c0.web.paso !== undefined && ahora - c0.web.t < DIA);
    const w = flujoWeb(texto, payload, c0, ahora, links);
    if (w) {
      c0.visto = ahora; c0.pend = null;
      c0.bots = (c0.bots || []).filter(x => ahora - x < HORA);
      if (w.respuesta && !enFlujo && c0.bots.length >= 3) {
        // Tope de 3 por hora: no se manda el texto (y el flujo no avanza), pero el aviso y el resumen siguen.
        const e = JSON.parse(antes);
        c0.ag = e.ag; c0.web = e.web;
        return Object.assign({ contacto: c0 }, w, { respuesta: null, botones: null });
      }
      if (w.respuesta) { c0.ultimoBot = ahora; c0.bots = c0.bots.concat(ahora); }
      return Object.assign({ contacto: c0 }, w);
    }
    // Respuesta a una pregunta pendiente del bot (MEM-D, RAM-1): no la silencia el «conversación en curso».
    const p = resolverPendiente(texto, payload, c0, ahora, links);
    if (p) return p;
  }
  const r = decidirBase(texto, c0, ahora, links);
  // La bienvenida ofrece el menú de dos opciones como botones.
  if (r.respuesta && (r.contacto.enviados.bienvenida === ahora || r.contacto.enviados.fuera_bienvenida === ahora || r.contacto.enviados.fuera_horario === ahora)) r.botones = botones(MENU_INICIO);
  return r;
}

// Servicios de reparación: la primera respuesta con modo fuera activo lleva el aviso de FUERA-1.
const CON_AVISO_FUERA = SERVICIO.filter(x => x !== 'otros_disp' && x !== 'remoto')
  .concat(['precio_general', 'revision', 'tiempo', 'descuento', 'agendar', 'mem_d2']);
const RESUMEN_ID = {
  memoria_sintoma: 'Síntoma de memoria',
  mem_pieza_ya: 'Ya compró la pieza',
  fuera_porteria: 'Iba a dejar un equipo en portería'
};

function decidirBase(texto, contacto, ahora, links) {
  const c = Object.assign({ visto: 0, gabriel: 0, enviados: {}, bots: [] }, contacto || {});
  const fuera = modoFuera(links, ahora);
  const ids = clasificar(texto, !!fuera);
  const regla = id => REGLAS.find(r => r.id === id);
  const nuevo = !c.visto || ahora - c.visto > 30 * DIA;
  c.visto = ahora;

  let id = ids[0] || null;
  const servicio = ids.find(x => SERVICIO.includes(x));
  if (servicio && ['precio_general', 'agendar', 'saludo', 'gracias', 'tiempo', 'descuento', 'horario', 'ubicacion'].includes(id)) id = servicio;
  // "lento" + "formatear" → formateo; "no prende" + "batería" → batería
  if (id === 'lento' && ids.includes('formateo')) id = 'formateo';
  if (id === 'no_enciende' && ids.includes('bateria')) id = 'bateria';
  // "demora en prender" + memoria: va directo al diagnóstico, sin repreguntar.
  if (id === 'memoria_duda' && SENAL_LENTO.test(normalizar(texto))) id = 'mem_d2';

  const r = id && regla(id);
  let aviso = r && r.urgente ? 'urgente' : 'normal';
  if (id === 'spam') return { intencion: 'spam', respuesta: null, aviso: null, contacto: c };

  // Conversación en curso (algo en las últimas 48 h): el bot solo se encarga de la logística;
  // las consultas las sigue Gabriel. Las respuestas con datos son para quien recién llega.
  const enCurso = contacto && contacto.visto && ahora - contacto.visto < 2 * DIA;
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

  // Modo fuera de Concepción: la bienvenida y el «voy bajando» cambian de texto.
  if (fuera && clave === 'bienvenida') clave = 'fuera_bienvenida';
  if (fuera && clave === 'llegada') clave = deNoche ? 'fuera_llegada_noche' : 'fuera_llegada';

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
  let botonesPregunta = null;
  if (clave) {
    respuesta = renderizar(clave, ahora, links, fuera);
    // FUERA-1: el aviso va primero, una sola vez por contacto, y solo en consultas de reparación.
    if (fuera && CON_AVISO_FUERA.includes(clave) && !c.enviados.fuera_aviso) {
      respuesta = renderizar('fuera_aviso', ahora, links, fuera) + '\n\n' + respuesta;
      c.enviados.fuera_aviso = ahora;
    }
    c.enviados[clave] = ahora;
    c.ultimoBot = ahora;
    c.bots.push(ahora);
    if (PREGUNTAS[clave]) {          // la pregunta queda pendiente para entender la respuesta siguiente
      c.pend = { q: PREGUNTAS[clave], t: ahora, intentos: 0 };
      botonesPregunta = botones(BOTONES_PREGUNTA[PREGUNTAS[clave]]);
    }
  }
  if (!id && !respuesta) aviso = 'normal';
  const salida = { intencion: id || 'sin_intencion', respuesta, aviso, contacto: c };
  if (botonesPregunta) salida.botones = botonesPregunta;
  let resumen = RESUMEN_ID[id];
  if (fuera && id === 'llegada') resumen = 'Llegó alguien y estás fuera';
  if (id === 'mem_d1') resumen = 'Quiere SSD · falta cotizar la pieza';
  if (resumen) salida.resumen = resumen;
  return salida;
}

/* FIN-CEREBRO */
if (typeof module !== 'undefined') module.exports = { decidir, flujoWeb, flujoAgenda, clasificar, normalizar, modoFuera, TEXTOS, REGLAS };
