# Estudio de onboarding y UX — 8vobit Pedidos (16-10-2026)

Es un complemento de `REVISION-UX.md`. Se hizo en local con datos simulados: un servidor propio en el puerto 8123, con su base en un scratchpad (no se tocó `data/`), y el script `simular-mes.mjs` del scratchpad.

El mes simulado es el de Gassuso, del 16-09 al 15-10:

- 1.161 pedidos: 25 a 40 por día de semana y 45 a 60 los viernes y sábados.
- Canales: 35 % mostrador y 65 % web; de la web, 30 % despacho.
- Medios de pago: efectivo, tarjeta y transferencia. Un 3 % de los pedidos quedó anulado.
- Gastos diarios de insumos y envases, más los fijos de octubre: arriendo, sueldos, luz y gas, contador y publicidad.
- Un cierre de caja por día.
- Además se creó un local nuevo ("La Picada del Test") desde `/admin` y se completaron sus primeros pasos como lo haría el dueño.

> **Ojo con dos cifras de la simulación:** cargué los gastos fijos solo en octubre, así que "Resultados" de septiembre sale inflado ($3,27 M). Además, la simulación termina el 15-10 y la semana actual está incompleta. Más abajo indico cuándo eso es un problema real del producto y cuándo es un efecto de la simulación.

---

## 1. Resumen ejecutivo

1. **El onboarding del dueño es lo mejor del producto.** Son 5 pasos con barra de avance y cada uno se abre en una hoja propia. El importador de planilla tiene vista previa fila por fila y errores en español claro. Se termina en unos 5 minutos sin ayuda, y al cerrar hay un mensaje de logro con "Ver mi carta" y "Cartel y tarjetas con QR". Está al nivel de Toast y por sobre lo habitual en la región.
2. **Lo más débil son las notificaciones de pedidos nuevos.** El panel consulta cada 3 s y emite un pitido solo si alguien activó la campana. Ese pitido suena una vez y no se repite. No hay notificaciones del sistema, ni *web push*, ni cambio en el título de la pestaña. Peor aún: **en 5 de las 10 pestañas (Carta, Datos del local, Resumen, Resultados y Gastos) el panel deja de buscar pedidos** (`panel.html:2037`). Un dueño que está editando precios no se entera de que entró un pedido. **Esto es Crítico.**
3. **El cliente no tiene cuenta, y está bien así.** El navegador solo guarda el último pedido por 12 horas (`localStorage pedido:<slug>`). No guarda su nombre, su teléfono ni su dirección, así que el cliente que vuelve tiene que escribir todo otra vez.
4. **Para el dueño, el onboarding termina en "carta lista", pero el local todavía no está listo para operar.** Quedan fuera la campana y la instalación del panel en la tablet, los usuarios con PIN, el despacho, un pedido de prueba, el costo de los productos y el fondo de caja. El local nuevo queda "Recibiendo pedidos web" desde el primer segundo, aunque no tenga ni un producto.
5. **Con un mes de datos, el panel es útil pero da números con falsa precisión.** "Resultado del mes $285.952" se calcula con un costo estimado del 35 % en los 45 productos (ninguno tiene costo cargado). El resumen semanal compara una semana incompleta con una completa ("▼ 57 %") y alarma sin motivo.

---

## 2. Cómo llegan las notificaciones de un pedido

### 2.1 Hoy, según el código

| Para quién | Canal | Cómo funciona | Dónde está |
|---|---|---|---|
| Local (tablet) | Consulta cada 3 s | `setInterval(refrescar, 3000)` mientras la pestaña está abierta; **se salta** las vistas `carta`, `local`, `resumen`, `resultados` y `gastos`. | `panel.html:2037` |
| Local | Sonido | `AudioContext` con dos tonos (880 Hz y 1175 Hz) de 0,4 s, **una sola vez** por pedido nuevo web. Necesita que se toque la campana (lo exige el navegador) y no se recuerda: se pierde al recargar. | `panel.html:614-625, 682` |
| Local | Señal visual | Un globo con el número en la pestaña "Pedidos" (`#bNuevos`). No parpadea, no cambia el título del navegador ni el ícono. | `panel.html:677` |
| Local | Pantalla encendida | `navigator.wakeLock` mientras el panel está visible. | `panel.html:2023` |
| Local | Notificación del sistema / push | **No hay.** Ni `Notification`, ni *service worker*, ni web push. Si la tablet bloquea la pantalla o se cambia de app, no llega nada. | — |
| Cliente | Confirmación | Una hoja con el número, la franja y el total, más un botón "Avisar por WhatsApp" que abre `wa.me` con un mensaje armado. El cliente decide si lo manda. | `carta.html:505-516` |
| Cliente | Seguimiento | La página `/seguimiento?p=<token>` se consulta cada 5 s (30 s si está oculta) y vibra cuando cambia el estado. **No hay push ni correo.** Si el cliente cierra la pestaña, no se entera. | `seguimiento.html:99-104` |
| Cliente | Aviso de "listo" | El local toca un botón que abre `wa.me/<cliente>` con un texto. Es manual: alguien tiene que mandarlo desde el WhatsApp de la tablet. | `panel.html:629` |

### 2.2 Qué hacen los demás

- **Toast:** muestra alertas emergentes de pedidos digitales, que hay que activar en la web y en los permisos del sistema (volumen de notificaciones). Exige un equipo encendido durante todo el horario, que recibe los pedidos automáticamente. Antes del lanzamiento recomienda **un pedido de prueba** y partir un día tranquilo. ([Toast: Get Started With Online Ordering](https://support.toasttab.com/en/article/Getting-Started-Online-Ordering), [Toast: Online Ordering Launch Best Practices](https://support.toasttab.com/en/article/Online-Ordering-Best-Practices), [Toast: notificaciones](https://support.toasttab.com/es-US/article/Can-Toast-send-alerts-to-my-app-when-certain-things-occur-1493068611739))
- **Wibo (app de pedidos para restaurantes):** tiene un artículo de ayuda solo para "activar el sonido en la tablet": el volumen de notificaciones, de medios y del sistema, el modo No molestar, un pedido de prueba y parlantes Bluetooth que "roban" el audio. Muestra que **el sonido es el problema número 1 de soporte** en este rubro. ([Wibo](https://intercom.help/wibo/es/articles/12824706-como-activar-el-sonido-en-la-tablet-o-pc-windows-en-el-app-de-pedidos-de-wibo))
- **Square:** en la comunidad se repiten los reclamos de "las notificaciones no llegan a la tablet". La solución típica es activar los permisos, quitar la optimización de batería y mantener la app abierta. ([Square Community](https://community.squareup.com/t5/Online-Store/Help-Square-Online-Order-Notifications-Not-Working-on-Tablet/m-p/836136))
- **Justo (Chile):** se presenta como "detrás del restaurante": el sitio de pedidos es del local y Justo pone la tecnología y el delivery. No encontré documentación pública de sus notificaciones. ([Forbes MX](https://forbes.com.mx/?p=698687), [El Espectador](https://www.elespectador.com/economia/empresas/justo-el-nuevo-jugador-tecnologico-para-el-sector-de-restaurantes-en-colombia/))
- **Fudo:** no encontré documentación pública sobre las alertas de pedidos online. Queda pendiente revisarlo con una cuenta de prueba.

**Conclusión:** en todo el rubro, la alerta de pedido nuevo es **repetitiva hasta que alguien acepta**, se **prueba durante el onboarding** y **no depende de la pestaña en que esté el usuario**. 8vobit no cumple ninguna de las tres.

### 2.3 Propuesta (en orden)

1. **(S, Crítica)** Consultar pedidos en **todas** las vistas. El costo de la consulta es mínimo y puede ser un endpoint liviano que solo cuente los nuevos.
2. **(S)** Mientras haya pedidos en "Nuevo": el sonido se repite cada 10 s, el título de la pestaña cambia a `(2) Pedidos nuevos`, y aparece una franja fija arriba con "2 pedidos nuevos — Ver" en cualquier pestaña.
3. **(S)** La campana pasa a ser el **primer paso** al entrar (el toque de "Entrar" se usa para habilitar el audio). Si está apagada, aparece una franja roja fija. Se agrega un botón "Probar sonido".
4. **(M)** `Notification` y *service worker* con **web push** para el dueño: avisa con la tablet bloqueada y en su celular. Funciona en Android/Chrome y, desde iOS 16.4, en las PWA instaladas en la pantalla de inicio.
5. **(M)** Para el cliente: un **"Avísame por WhatsApp cuando esté listo"**. Hoy puede ser el mismo botón manual, pero precargado y destacado como un único botón grande cuando el pedido pasa a "Listo". Más adelante, la API de WhatsApp Business o web push en la página de seguimiento ("¿Te avisamos?").
6. **(S)** Un pedido de prueba con un toque desde los primeros pasos: llega a la tablet, suena, se imprime la comanda y se borra solo.

---

## 3. ¿Usuarios o caché del navegador?

### 3.1 Qué se guarda hoy

| Quién | Mecanismo | Duración | Qué contiene | Observación |
|---|---|---|---|---|
| Cliente | `localStorage pedido:<slug>` | 12 h | Enlace de seguimiento, número de pedido y hora | Muestra "Tu pedido #N · Ver estado →" al volver. Es útil. |
| Cliente | — | — | Nombre, teléfono y dirección | **No se guardan.** Hay que escribirlos en cada pedido; el autocompletar del navegador ayuda solo en parte. |
| Dueño / equipo | Cookie `panel` (HttpOnly, SameSite Strict, Secure detrás de HTTPS) | 12 h | Sesión firmada (local y usuario) | Cumple las reglas de seguridad del proyecto. A las 12 h hay que volver a entrar: en un turno largo puede tocar en plena hora punta. |
| Tablet | Cookie `equipo` | 1 año | Marca la tablet como "del local" para entrar con PIN | Bien pensado: la tablet queda con el teclado de PIN. |
| Admin | Cookie `admin` | 8 h | — | Bien. |
| Panel | `localStorage ayuda-<vista>`, `inicio-min` | Indefinida | Si la ayuda está abierta o cerrada | No es sensible. |

### 3.2 Recomendación

- **No crear cuentas de cliente.** El rubro (y Baymard, para comercio electrónico en general) muestra que obligar a crear una cuenta hace perder ventas. Las fuentes secundarias hablan de un 19 a 25 % de los abandonos ([Amazon Pay sobre Baymard](https://pay.amazon.com/blog/the-baymard-report-series-how-forcing-sign-ups-drives-down-sales), [Corbado](https://corbado.com/blog/guest-checkout-vs-forced-login)).
- **Sí "recordarme en este teléfono"** (S): guardar en `localStorage` el nombre, el teléfono y la última dirección, con la casilla marcada por defecto y un enlace "Olvidar mis datos". No son credenciales ni tokens, así que no choca con la regla de no guardar JWT en localStorage. Hay que mencionarlo en la Política de privacidad.
- **"Repetir mi último pedido"** (M): guardar también los productos del último pedido y ofrecer arriba "Lo mismo de la otra vez ($8.980)". En comida rápida de barrio es la función de fidelización que más rinde y no necesita cuentas.
- **Identidad liviana por teléfono** (L, más adelante): el local ya ve "clientes que repitieron" por teléfono. Se puede sumar un programa de sellos ("6.º completo gratis") ligado al número, sin contraseña.
- **Sesión del panel:** subir de 12 a 16 h o renovarla mientras haya actividad, para que no expire en medio del turno.

---

## 4. Onboarding: recorrido real paso a paso

### 4.1 Del lado del creador (`/admin` → entrega al dueño)

| # | Qué pasó | Bien | Problema | Propuesta |
|---|---|---|---|---|
| A1 | Formulario "Nuevo local": nombre, código, plan, días de prueba, WhatsApp, dirección, carta en JSON y notas | Es corto | **La carta se pide en JSON crudo**, ni siquiera el creador lo usaría con gusto. | El código ya se sugiere a partir del nombre *(corregido)*. Reemplazar el JSON por "pegar planilla", el mismo importador del panel. |
| A2 | "Local creado. Entrégale al dueño estos datos (la clave no se vuelve a mostrar)" | Advierte que la clave se muestra una sola vez; el mensaje reemplaza al formulario *(corregido: en la primera pasada dije que el formulario seguía lleno)* | No hay botón **Copiar** ni **Enviar por WhatsApp**. | Reemplazar el formulario por una tarjeta de entrega con "Copiar todo", "Enviar por WhatsApp al dueño" (con el número ya ingresado) e "Imprimir hoja de bienvenida". |
| A3 | El WhatsApp se ingresó en admin | — | El paso 1 del dueño ("Datos de contacto") aparece **pendiente** aunque el WhatsApp ya está; falta solo la dirección. | Mostrar "1 de 2 datos listos" o dar el paso por cumplido si hay WhatsApp. |
| A4 | Enlace `panel?local=picada-test` | El código queda precargado | Hay que escribir la clave a mano. | Enlace mágico de un solo uso para la primera entrada, que luego pida crear una clave propia. |

### 4.2 Del lado del dueño (primeros pasos en el panel)

| Paso | Qué ve | Bien | Problema | Propuesta |
|---|---|---|---|---|
| Entrada | El panel completo con 10 pestañas y la tarjeta "Primeros pasos · 0 de 5" arriba de Pedidos | La tarjeta es protagonista; tiene barra de progreso y "Ocultar" | Se ven las 10 pestañas, Resultados y Equipo vacíos, y "Recibiendo pedidos web" encendido con la carta vacía. La pestaña Equipo muestra "95 horas abiertas sin personal" como alarma. | Mientras los pasos no estén completos: la carta queda **en pausa** ("Tu carta aún no es pública"), las pestañas de gestión se atenúan y los estados vacíos son amables en vez de alarmas. |
| 1 Contacto | Hoja con WhatsApp, teléfono, dirección e Instagram | Explica para qué sirve cada campo; toast "✓ Contacto guardado" | Los inputs no tienen `<label>` asociado: el lector de pantalla lee el placeholder ("+56 9 1234 5678") en vez de "WhatsApp para pedidos". | Agregar `for`/`id`. |
| 2 Horario | Tabla de 7 días **precargada de 12:00 a 22:00** | "Copiar el lunes a todos" y la nota sobre la medianoche | Se puede guardar sin mirar, y el paso queda "Listo" con un horario inventado. | No precargar las horas, o exigir un cambio, o mostrar "¿Abres todos los días de 12 a 22?" con Sí / Cambiar. |
| 3 Logo | "Elegir imagen" / "No tengo logo" | Hay salida sin logo y explica dónde aparece | — | Ofrecer "Te armamos uno con tu nombre", con la tipografía y el color de la marca. |
| 4 Transferencias | Titular, RUT, banco, tipo, número y correo | Valida el dígito del RUT ("Revisa el RUT: el dígito verificador no coincide") y tiene "No recibo transferencias" | — | Vista previa de cómo lo ve el cliente. |
| 5 Producto | Importar planilla o agregar uno a mano | **Excelente:** pegar desde Excel, vista previa, "Se usó la primera fila como títulos" y error por fila con un ejemplo de cómo corregir | Si una fila tiene error **no se puede importar el resto**: hay que corregir la planilla y pegarla de nuevo. No se puede corregir en la vista previa. | "Importar 3 y omitir 1", y celdas editables en la vista previa. |
| Final | "¡Tu local está listo para recibir pedidos!" con Ver mi carta, Cartel con QR y Terminar | Buen cierre y llamado a la acción | Faltan los pasos operativos. | Agregar una segunda etapa, "Antes del primer servicio", con 5 pasos (abajo). |

### 4.3 Segunda etapa propuesta: "Antes del primer servicio"

1. **Instala el panel en la tablet** y activa el sonido: detectar `display-mode: standalone`, mostrar "Agregar a pantalla de inicio" y el botón Probar sonido.
2. **Haz un pedido de prueba**: llega a la tablet, suena, se acepta, se imprime la comanda y se marca listo. Después se borra solo.
3. **Crea los PIN de tu equipo** (cocina y caja), o "Lo hago yo solo".
4. **Despacho**: "Solo retiro" o configurar el precio. Hoy la pestaña Despacho es la más densa del panel: necesita un asistente propio de 3 preguntas.
5. **Costo de tus productos** (opcional): "¿Cuánto te cuesta hacer cada uno?". Sin esto, Resultados se calcula con un estimado del 35 % (ver H-P3).

Medir el avance de esta etapa en `/admin` ("Primeros pasos 0 de 5" ya existe) y avisar al creador cuando un local lleva 3 días sin completarla.

---

## 5. Desglose del panel con un mes de datos (Gassuso, tablet de 1024 px)

| Pestaña | Qué muestra | Bien | Problemas con evidencia | Severidad |
|---|---|---|---|---|
| **Pedidos** | Tres columnas: Nuevos, En cocina y Listos, con un botón grande por estado | Flujo claro, con ayuda plegable | Ver la sección 2: el sonido se activa a mano, suena una vez y no hay alerta global. Los botones `.acc` son de 44 px con letra de 0,8 rem. | Crítica (alertas) |
| **Venta rápida** | Cuadrícula de productos por categoría y ticket a la derecha | Buscador, chips de categoría de 44 px y medios de pago de 64 px | "Limpiar" queda junto a "Cobrar" (usa `confirm()`). | Media |
| Caja del día | KPIs, efectivo esperado, conteo por billetes, cierre, tablas por medio de pago y por canal, y boletas por emitir | Muy completa; "Debería haber" y "Contar por billetes" son excelentes; ‹ › recorre los días anteriores | *(Corregido: en la primera pasada dije que solo mostraba hoy, pero tiene historial con ‹ ›.)* Al abrir el día todo aparece en $0 y el fondo como "anotar" en texto pequeño. | Baja |
| **Gastos** | Total del mes, comparación con el anterior, efectivo, por categoría y detalle | Comparación por categoría, el documento junto al detalle y "Sale de la caja del día" | "Anular" va en cada fila, al lado del monto, sin separación. No hay filtro por categoría ni búsqueda (23 filas en el mes; un local real tendrá más de 60). | Media |
| **Resumen** | Semana: pedidos, ticket, más vendido, hora peak, clientes que repiten, comisión ahorrada, gráficos, platos y "Enviar por WhatsApp" | Muy buena narrativa ("Hora valle 11:00 · buena para una promo") y gráficos con "Ver como tabla" (accesible) | **Compara la semana en curso (4 días) con la semana completa anterior: "▼ 57 % vs. semana anterior".** Hay que comparar los mismos días. El "Más vendido" (Bebida en lata) sale de la simulación aleatoria, no es un problema. | Alta |
| **Resultados** | Estado de resultados del mes contra el anterior | Lenguaje simple y la aclaración "Sin IVA… el balance lo hace el contador" | El resultado ($285.952) se muestra con precisión al peso aunque **45 de 45 productos no tienen costo** (Carta muestra "Sin costo 45"). El aviso solo está dentro de la tabla, no junto al resultado destacado. *(En la simulación las líneas traían costo, por eso no apareció.)* Los nombres "Resumen" y "Resultados" se confunden. | Alta |
| **Carta y precios** | Filtros (Todos, Sin precio, Sin costo, No disponibles, Sin foto), lista editable, Importar e interruptor "Disponible" | Los filtros que dicen qué falta son excelentes | Con 45 productos la lista es larga; hay un interruptor "Disponible" por fila; en tablet vertical, revisar. | Media |
| **Despacho** | Encendido, precio único o por zonas, vehículos, "¿Sale a cuenta?", condiciones, horario y mapa | Potente y único en el mercado | Es **una sola pantalla con 6 bloques**. Para un dueño nuevo es abrumador. | Alta (onboarding) |
| **Equipo** | Personas, costo de personal, cobertura por hora y parámetros legales | La cobertura por hora es valiosa | Vacío por defecto y con "95 horas abiertas sin personal" como alerta. Cita leyes (Ley 21.830…), lo que es jerga para el dueño. Los usuarios con PIN están en **otra** pestaña (Datos del local) aunque se trata de las mismas personas. | Media |
| **Datos del local** | Tu plan, Usuarios y PIN, contacto, horario, transferencias, legal y logo | "Tu plan" explica la tarifa con un ejemplo ("Un pedido de $12.000 paga $60") | Mezcla cuenta, equipo y vitrina. Es largo. | Media |

---

## 6. Prioridades sugeridas (onboarding y notificaciones primero)

| # | Qué | Severidad | Esfuerzo |
|---|---|---|---|
| 1 | Consultar pedidos en todas las pestañas, con aviso global y título con contador | Crítica | S |
| 2 | Sonido que se repite hasta aceptar, campana que se activa al entrar, franja si está apagada y "Probar sonido" | Crítica | S |
| 3 | Local nuevo en pausa hasta completar los primeros pasos | Alta | S |
| 4 | Tarjeta de entrega en `/admin` (Copiar / WhatsApp / Imprimir) y formulario que se limpia | Alta | S |
| 5 | "Recordarme en este teléfono" en la carta | Alta | S |
| 6 | Resumen comparando los mismos días; Resultados con aviso "costo estimado" | Alta | S |
| 7 | Segunda etapa "Antes del primer servicio" con pedido de prueba | Alta | M |
| 8 | Importar omitiendo las filas con error | Media | S |
| 9 | Horario sin precargar o con confirmación explícita | Media | S |
| 10 | Historial de cierres de caja | Alta | M |
| 11 | Web push para el dueño y el cliente | Alta | M/L |
| 12 | "Repetir mi último pedido" | Media | M |
| 13 | Asistente de Despacho en 3 preguntas | Media | M |

## 6 bis. Orden de entrega de los despachos (pedido del usuario)

**Necesidad:** si el repartidor sale con 3 pedidos, el panel debe decir a cuál ir primero, segundo y tercero, y abrir la navegación.

**Qué ya existe:**

- Cada pedido con despacho guarda `lat`, `lng`, `distancia_m` y `repartidor_id` (`server.mjs:624`).
- El local tiene sus propias `lat` y `lng`.
- La pestaña Despacho ya estima los viajes con la distancia en línea recta por un factor de calles (×1,25, ×1,35 o ×1,5).

**Opciones de herramientas:**

| Herramienta | ¿Ordena varias paradas? | Costo | Cómo se usaría |
|---|---|---|---|
| **Waze** | No. Su enlace (`waze.com/ul?ll=lat,lng&navigate=yes`) lleva a **un** destino; en la app solo se agrega una parada a mano. | Gratis | Botón "Ir" por cada parada, en el orden que calcule el panel. |
| **Google Maps (enlace)** | Lleva **varias paradas en el orden dado** (`google.com/maps/dir/?api=1&origin=…&destination=…&waypoints=a\|b`, hasta unas 9), **pero no las reordena**. | Gratis | Un botón "Abrir ruta completa" con las paradas ya ordenadas por el panel. |
| **Google Directions / Routes API** (`optimize:true`) | Sí, con tráfico real. | Pagado por consulta; requiere clave y tarjeta | Solo si más adelante hace falta tráfico en vivo. |
| **OSRM `/trip`** (OpenStreetMap) | Sí, por calles reales. | Gratis; se puede alojar en el mismo servidor | Mejor exactitud sin costo. Es coherente con Leaflet y OSM, que ya se usan. |
| **Cálculo propio en el panel** | Sí. Con 3 pedidos hay solo 6 órdenes posibles (con 5 son 120): se prueban todos con la distancia ya usada en Despacho. | Gratis; sin dependencias ni red | **Recomendado para partir.** |

**Diseño propuesto:**

1. En la columna "Listos" (o en un botón "Armar salida"), se eligen los pedidos con despacho que salen juntos; por defecto, los del mismo repartidor.
2. El panel calcula el mejor orden: el que **minimiza la hora de llegada respecto de la franja prometida** a cada cliente. Así, primero va el que tiene la franja más temprana, aunque quede un poco más lejos. Si hay empate, gana el recorrido más corto. Para un recorrido local → A → B → C, el criterio es: retraso total = Σ max(0, llegada_i − fin de la franja_i), y luego los kilómetros totales. La llegada se estima con la velocidad del vehículo cargado en Despacho.
3. Se muestra una lista numerada: **1. Barros Arana 450 · Camila · 2,1 km · llega ~21:12 (franja 21:00–21:30)**, y lo mismo para la 2 y la 3. Cada parada tiene un botón **Waze** y un botón **Llamar**. Abajo va **"Abrir ruta completa en Google Maps"**.
4. "Imprimir hoja de ruta": la comanda de 80 mm con el orden, las direcciones, los totales por cobrar y si el pedido ya está pagado.
5. Si no se usa el retorno al local en el cálculo, se marca "Contar la vuelta al local" (la opción ya existe en Despacho).

**Esfuerzo:** M. El orden con permutaciones y los enlaces de Waze y Maps es un cambio en `panel.html` más un endpoint o una función en `server.mjs`. OSRM, más adelante, sería L.

## 7. Lo que no se cubrió

- **Funciones:** no probé la impresión física de la comanda ni la PWA instalada en un Android real. Tampoco el envío por WhatsApp (abre una app externa), los roles con PIN (no creé usuarios), la reapertura de caja ni la exportación CSV.
- **Fudo:** no hay documentación pública sobre sus alertas. Se recomienda abrir una cuenta de prueba y comparar.
- **Rendimiento:** la red 3G y la tablet vertical quedan pendientes, como en `REVISION-UX.md`.
- **Iconos de pestañas:** para el desglose leí el texto de cada pestaña con JS y tomé capturas solo de Pedidos y del onboarding, así que no comparé los iconos con la vista.

## Fuentes

- [Toast — Get Started With Online Ordering](https://support.toasttab.com/en/article/Getting-Started-Online-Ordering)
- [Toast — Online Ordering Launch Best Practices Checklist](https://support.toasttab.com/en/article/Online-Ordering-Best-Practices)
- [Toast — Notificaciones en la aplicación](https://support.toasttab.com/es-US/article/Can-Toast-send-alerts-to-my-app-when-certain-things-occur-1493068611739)
- [Wibo — Activar el sonido en la tablet](https://intercom.help/wibo/es/articles/12824706-como-activar-el-sonido-en-la-tablet-o-pc-windows-en-el-app-de-pedidos-de-wibo)
- [Square Community — Notificaciones que no llegan a la tablet](https://community.squareup.com/t5/Online-Store/Help-Square-Online-Order-Notifications-Not-Working-on-Tablet/m-p/836136)
- [Amazon Pay — Baymard: forzar registro baja las ventas](https://pay.amazon.com/blog/the-baymard-report-series-how-forcing-sign-ups-drives-down-sales)
- [Corbado — Guest checkout vs forced login](https://corbado.com/blog/guest-checkout-vs-forced-login)
- [Forbes México — Justo](https://forbes.com.mx/?p=698687) · [El Espectador — Justo](https://www.elespectador.com/economia/empresas/justo-el-nuevo-jugador-tecnologico-para-el-sector-de-restaurantes-en-colombia/)
