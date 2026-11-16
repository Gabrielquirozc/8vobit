# Pedidos — demo Gassuso

Demo del PRD "Sistema de pedidos para locales delivery": carta pública con la
carta real de Gassuso, selector de agregados ("+N ingr."), carro con franja
horaria, panel por estados con sonido, comanda de 80 mm, editor de carta con
historial de precios y carta imprimible. Boleta en **modo 2 (asistida)**: cada
pedido muestra "boleta por emitir" y el local registra el folio de la e-Boleta.

## Por qué así y no Next.js + Supabase

- `lenovo-edge` tiene 7,5 GB de RAM y Immich ya reserva ~5 GB. Un solo
  contenedor Node **sin dependencias** (`http` + `node:sqlite`) acotado a 128 MB.
- Mismo patrón que el resto del servidor: contenedor en `127.0.0.1`, entrada
  solo por el túnel, despliegue manual por SSH.
- Multi-local desde el inicio: toda tabla lleva `local_id`; el panel solo ve
  su local (sesión firmada, cookie httpOnly + SameSite=Strict).

## Cómo trabaja el local (panel en tablet)

Cada pedido avanza con **un solo botón grande por paso**:

1. **Nuevo** → *Aceptar e imprimir comanda* (suena al llegar; la comanda se imprime).
2. **En cocina** → *Listo para entregar* (botón WhatsApp con aviso "tu pedido está listo").
3. **Listo** → *Cobrar*: efectivo (con montos rápidos y vuelto), transferencia,
   tarjeta (POS propio del local) u otro; folio de boleta opcional. Cobrar = entregar.
   Si ya pagó antes (transferencia), *Ya pagó* registra el pago sin entregar.

**Venta rápida** (mostrador): la carta en fichas con foto, ticket a la derecha
(abajo en tablet vertical), cobro con vuelto y opción de mandarla a cocina con
comanda y nombre para llamar. Así la caja cuadra con todo el negocio, no solo
con los pedidos web.

**Caja del día** (con ‹ › para revisar días anteriores; los folios de boleta se escriben en la misma tabla, Enter guarda y pasa al siguiente): cobrado total, efectivo en caja, por medio de pago, por canal
(web / mostrador), ticket promedio, por cobrar, anulados, boletas por emitir
(con registro de folio) y detalle imprimible.

**Cuadre del efectivo y arqueo** (dentro de Caja del día): fondo inicial (sugiere lo contado en el cierre
anterior), ingresos y retiros de efectivo con motivo, y gastos. El panel calcula cuánto *debería haber en caja*
(fondo + ventas en efectivo + ingresos − retiros − gastos pagados en efectivo). Al cerrar se escribe lo
contado (o se cuenta por billetes y monedas) y queda la diferencia (cuadra, sobra o falta) con una nota.
Una caja cerrada no acepta movimientos en efectivo; se puede reabrir y el cierre anterior queda
registrado. Nada se borra: los movimientos se anulan. La caja se puede corregir hasta 7 días atrás.

**Gastos** (pestaña propia): gastos por mes con categoría (insumos, envases, sueldos, arriendo,
servicios, bencina, mantención, contador, publicidad, impuestos, otros), cómo se pagaron, N° de
documento y fecha (se pueden anotar con atraso). Muestra el total por categoría comparado con el mes
anterior. Solo los pagados en efectivo descuentan de la caja del día. Código: `lib/caja.mjs` (servidor)
y `public/panel-caja.js` (panel).

**Exportar para el contador** (al final del Resumen): rango de fechas (atajos "Este mes" y "Mes
anterior", máximo un año) y cuatro CSV que abren en Excel (separador `;`, con BOM): ventas, productos
vendidos (con costo), caja diaria (esperado, contado, diferencia) y gastos. No incluyen teléfonos ni
direcciones, y los textos van protegidos contra fórmulas. Código: `lib/exportar.mjs`.

**Resultados** (pestaña propia, dueño, plan Gestión o superior): estado de resultados del mes con el
mes anterior al lado: ventas cobradas − costo de la comida = margen; − personal (los sueldos anotados
en Gastos o, si no hay, la estimación de Equipo); − gastos de operación por categoría = resultado. Las
compras de insumos se muestran aparte (no se restan dos veces) y la comisión que el local no pagó a
las apps queda como referencia. Código: `lib/resultados.mjs`.

**Usuarios con PIN y roles** (Datos del local → *Usuarios y PIN*): el dueño entra con la **clave del
local**, y con eso la tablet queda asociada al local por un año. Desde ahí el equipo entra con su
**PIN** (4 a 6 números, no repetido, no obvio): **Cocina** (pedidos y agotados), **Caja** (además
vende, cobra, caja y gastos), **Encargado** (además carta, despacho, resumen y reabrir la caja). El
dueño ve todo: sueldos, costos, resultados, datos del local, usuarios y plan. Las pestañas y botones se
ajustan al rol, y el servidor revisa el permiso en cada ruta. Queda registrado quién cobró, anuló,
movió la caja o la cerró. En el teclado de PIN también se **marca entrada y salida**: las horas reales
del mes aparecen en Equipo. Botón con el nombre arriba a la derecha = cambiar de usuario.

**Tu plan** (Datos del local, solo el dueño): plan, estado (prueba, activa, pago pendiente,
suspendida), precio, descuento vigente, tarifa por pedido del mes (1 % sin tope, con los
pedidos exentos aparte) y pagos registrados. Las pestañas que el plan no incluye se ven con 🔒.

**Carta y precios** (pensada para cargar datos rápido en la tablet): buscador, filtros *Sin precio /
No disponibles / Sin foto*, saltos por categoría y una fila por producto con foto (tocarla la
cambia), precio con formato `$4.990` que se guarda al salir del campo o con Enter (un cambio
grande, como un cero de más, pide confirmación), e interruptores *Disponible* y *Sugerir*. La ficha
del producto (⋯ o el nombre) edita nombre, descripción, categoría, ingredientes a elegir, destacado,
orden, y permite **crear productos y categorías** y quitarlos de la carta (se archivan: los pedidos
anteriores no cambian). Ingredientes y salsas se agregan, renombran, quitan o marcan agotados ahí mismo.

**Costo de productos**: cada producto puede tener su **costo de insumos** por unidad (ficha del
producto, con el margen en vivo: "deja $3.190 · 64%"); si falta, se estima con un % del precio
(*Costo estimado 35%* en Carta y precios, filtro *Sin costo*). Cada venta guarda el costo del momento
(si después cambia, las ventas viejas no se alteran). El Resumen muestra el **margen de la comida**
(ventas − insumos) y en Equipo, "Para cubrir el reparto" usa lo que deja cada despacho de verdad:
margen de la comida + tarifa − bencina − bono. Los costos solo se ven en el panel.

**Datos del local** (por secciones, con índice y una barra *Guardar* que aparece al haber cambios y
avisa si se sale sin guardar; RUT con dígito verificador, banco y tipo de cuenta a elegir): nombre, WhatsApp, teléfono para llamadas (botón "Llamar" en la carta
y el seguimiento), Instagram, dirección, horario por día (días
cerrados; misma hora de apertura y cierre = 24 h), cupo de pedidos por franja y datos
para transferencia, que el cliente ve al pagar y en el seguimiento.

**Despacho** (pestaña propia del panel): encendido/apagado, pedido mínimo, texto de zona, **horario
propio por día** y cómo se cobra:
- *Precio único*: el mismo costo a cualquier dirección.
- *Por zonas en el mapa* (como Uber): la comuna se divide en **hexágonos** (chicos ≈ 500 m, medianos
  ≈ 800 m, grandes ≈ 1,2 km). Cada hexágono toma el precio del **tramo de distancia** en que cae su
  centro (ej. hasta 1,5 km $1.500, hasta 3 km $2.000, hasta 5 km $2.800) y el dueño puede **tocar un
  hexágono** para darle otro precio o **bloquearlo**. El pin del local se arrastra si no está en su
  lugar, y "Probar una dirección" muestra cuánto pagaría un cliente.

**Vehículos y costo del viaje** (misma pestaña): se crean los vehículos con que se despacha (moto,
auto, bicicleta…) con su rendimiento (km/l), precio del litro, mantención por km, velocidad en ciudad,
pago al repartidor (por hora y/o fijo por viaje) y minutos por entrega. El costo de un despacho se
calcula con la distancia del mapa × un **factor de calles** (las calles no van en línea recta: ×1,25
centro con cuadras, ×1,35 ciudad mixta, ×1,5 con cerros, puentes o ríos) y, si se marca, **ida y
vuelta** al local. La tabla *¿Sale a cuenta?* muestra por tramo el recorrido, el costo, el precio
**sugerido** (costo + % de ganancia, redondeado) y lo que queda con el precio actual; *Usar precios
sugeridos* los aplica y *Proponer tramos para mi área* arma 3 tramos parejos hasta el borde del área
que hoy se despacha. En el mapa, la vista *¿Sale a cuenta?* pinta cada sector en verde (gana lo
pedido), amarillo (solo cubre el costo) o rojo (pierde). Cada pedido guarda su costo estimado y el
Resumen semanal compara lo cobrado por despacho con lo que costaron los viajes.

**Equipo** (pestaña propia, vista de gestión del local): arriba el **costo de personal del mes**, su
**peso sobre las ventas** (alerta sobre 35 %), las **horas abiertas sin personal** y el costo por área
(cocina, caja, reparto); luego la **cobertura de turnos** (cuadro día × hora del horario de atención con
cuántas personas hay de turno, en rojo las horas abiertas sin nadie), el equipo agrupado por área y
una sección **Reparto** con sus números. Cada persona: (repartidor, cocina, caja) con contrato (plazo fijo o
indefinido), turno por día con colación, sueldo base, bono por entrega y si usan vehículo propio. El
cálculo (`public/laboral.js`, compartido con el servidor) es una **estimación** según la ley chilena:
mínimo proporcional a las horas (IMM $553.553 × horas / 42, Ley 21.830), valor hora ordinaria, recargo
dominical 30 % (art. 38), gratificación art. 50 (25 %, tope 4,75 IMM al año), cargas del empleador (SIS,
mutual, cesantía, aporte Ley 21.735) y descuentos del trabajador para estimar el líquido. Avisa si el
turno pasa de 10 h diarias, si sin colación pasa de 6 h, si deja de ser jornada parcial (más de 28 h) y
**no deja guardar** un sueldo bajo el mínimo o una jornada sobre la máxima. Los parámetros (IMM, tasas)
se editan al cambiar la ley. Cada vehículo puede tener su repartidor: entonces el viaje se costea con
su costo real por hora de turno más el bono, cada despacho queda asignado a quien lo entregó (se
puede cambiar en la tarjeta del pedido) y la pestaña muestra por mes entregas, km, costo empresa,
líquido estimado y **cuántos despachos al mes cubren el costo del reparto**. Los sueldos y RUT solo
se ven en el panel (no en la carta pública).

En la carta, con despacho por zonas, el cliente escribe su dirección y toca *Buscar* (o *Usar mi
ubicación*), ajusta el pin moviendo el mapa y ve al tiro el costo o "No despachamos a este punto".
El servidor recalcula el costo con la ubicación (no confía en el navegador) y guarda las coordenadas:
la tarjeta del pedido trae *Ver en el mapa* (Google Maps, para el repartidor) y la distancia.

Mapa: OpenStreetMap con [Leaflet](https://leafletjs.com) incluido en `public/` (BSD-2). Las
direcciones se buscan con Nominatim (OpenStreetMap) **a través del servidor**: con caché de 30 días,
una consulta por segundo como pide su política, búsqueda por calle + número + comuna y resultados de
la comuna del local primero. Si no responde, el cliente igual puede marcar su ubicación en el mapa.
La grilla de hexágonos es propia (`public/hex.js`), la misma en el servidor y en el navegador.

**Pausar pedidos web** (botón en la barra superior): la carta avisa "Pedidos en línea
pausados" y no deja agregar; el mostrador sigue funcionando.

**Observaciones**: por producto ("sin cebolla", 140 caracteres) y un comentario general
del pedido (300). Se guardan sin caracteres de control y se muestran siempre escapadas;
en la comanda la observación sale en mayúsculas para que la cocina no la pase por alto.

**Resumen semanal** (pestaña Resumen): los 6 números del plan con la semana anterior
como comparación: pedidos, ticket promedio, plato más y menos vendido, hora peak y hora
valle (solo horas centrales, por día abierto, para que sirva como hora de promo),
clientes que repitieron y **comisión ahorrada** (ventas web × % de la app, configurable
en Datos del local). Ventas por día y pedidos por hora con tabla equivalente, por canal,
ranking de platos y botón **Enviar por WhatsApp** con el texto listo.

**Salsas** (Mostaza, Ketchup, Ají receta Gassuso): opcionales y sin costo, aparte de los
ingredientes obligatorios de los "+N ingr."; se ofrecen en todas las categorías salvo bebidas y
jugos, en la carta y en la venta rápida. Se agotan desde Carta y precios y salen en la comanda.

**Venta sugerida** (productos con "Sugerir" en Carta y precios; por defecto Papas, Bebida en
lata, Jugo natural y Batido de frutilla), en tres momentos:
1. Al agregar un plato, un aviso "¿Le sumas Papas por $2.990?" con botón Agregar: una sola vez
   por visita y solo de categorías que no estén en el carro.
2. En el carro, "¿Lo acompañas con algo?" con hasta 4 acompañamientos de un toque.
3. En la venta rápida, una línea "Ofrece:" como guion para quien atiende.
Cada línea agregada desde una sugerencia queda marcada y el Resumen muestra cuánto vendió.

**Material impreso** (Carta y precios → *Cartel y tarjetas con QR*): cartel A4 para el mostrador
y 8 tarjetas por hoja para las bolsas, con el logo, el QR a la carta y los datos de contacto.

**Tablet del local**: el panel se puede instalar como app (menú del navegador → *Instalar* o
*Agregar a pantalla de inicio*) y mantiene la pantalla encendida mientras está abierto.

**Antes del lanzamiento** nada se indexa en buscadores (`X-Robots-Tag` y `robots.txt`). Al lanzar,
agregar `INDEXAR=1` al `.env` del servidor y volver a desplegar.

**Productos sin foto**: muestran un emoji según lo que son (🌭 🍔 🥤 🍓 …).

**Seguimiento**: cada pedido web tiene un link `/seguimiento?p=…` que el cliente
recibe al confirmar y en el WhatsApp del local; muestra el estado en vivo.

## Varios locales, licencias y administración

- Cada local tiene su código (`/codigo` es su carta), su **clave propia** (scrypt) y sus datos
  separados por `local_id`. Gassuso, anterior a esto, sigue entrando con `PANEL_PASSWORD`.
- **Licencias** (`lib/licencias.mjs`): plan (Canal, Gestión, Pro), ciclo (mensual, semestral −10 %,
  anual −15 %), prueba, vencimiento, descuento con fecha de término y exención de la tarifa por
  pedido. El estado sale de las fechas: *prueba* → *activa* → *pago pendiente* (7 días, todo
  funciona) → *suspendida* (panel en solo lectura, la carta no recibe pedidos, **exportar sí**) →
  *cancelada* (90 días). Nada se borra.
- **Consola `/admin`** (solo nosotros, con `ADMIN_PASSWORD` en el `.env`; sin ella no existe): locales
  con plan, estado, ingreso mensual, pedidos y tarifa del mes. Desde ahí se crea un local (con carta
  vacía o importada en JSON; la clave se muestra una sola vez), se edita la licencia, se registran pagos
  (extienden el plazo desde donde termina lo pagado), se genera una clave nueva y se ve el historial.
  La columna *Primeros pasos* muestra cuánto le falta a cada local nuevo para quedar andando.

## Promociones, inventario y clientes

- **Promociones** (plan Pro): % o monto fijo, automáticas (por días y horario; se anuncian en la carta) o con
  código; pueden limitarse a una categoría, a un pedido mínimo, a una fecha de término o a un número de usos.
  Cada pedido lleva la que más descuenta, nunca sobre el despacho, y siempre calculada en el servidor. Anular
  el pedido devuelve el uso.
- **Combos** (plan Pro): un producto de la carta con su precio y los productos que incluye; la carta lo muestra
  y el inventario descuenta lo de cada componente.
- **Inventario** (plan Pro): insumos con unidad, costo, stock y mínimo; receta por producto. Cada venta descuenta
  (sin bloquearla) y una anulación devuelve; compras con costo promedio ponderado (y opcionalmente como gasto de
  insumos en la caja); conteo y merma. Con receta, el costo del producto en el pedido es el real.
- **Clientes** (plan Gestión): clientes de la carta online por celular (frecuentes, nuevos, dormidos, una vez),
  historial y lo que más piden. **Cupón de vuelta**: tras cada pedido web, el cliente recibe un código de un solo
  uso, atado a su celular, para el próximo pedido. Borrar los datos del cliente borra sus cupones.

## Autoservicio: el local se pone en marcha solo

Para que cada local nuevo necesite poca ayuda (meta: ≤ 0,5 h de soporte al mes, `VIABILIDAD.md` §4–5).
Código: `lib/autoservicio.mjs` (servidor) y `public/panel-inicio.js` (panel).

- **Primeros pasos**: un local creado desde `/admin` ve, arriba del panel, una lista con su avance
  (*2 de 5*): datos de contacto (WhatsApp o teléfono + dirección), horario, logo, datos para
  transferencias y primer producto con precio. Cada paso abre un formulario corto; el logo y las
  transferencias se pueden omitir ("No tengo logo", "No recibo transferencias"). El avance se calcula
  de los datos reales (completarlo en *Datos del local* también cuenta); el horario cuenta al guardarlo.
  Al terminar ofrece ver la carta y el cartel con QR, y *Terminar* lo cierra (se reabre desde la ayuda
  de *Datos del local*). Solo lo ve el dueño. Los locales que existían antes (Gassuso) no lo ven.
- **Importar la carta desde una planilla** (*Carta y precios → Importar planilla*, o desde el paso
  "Primer producto"): se pegan las celdas copiadas de Excel o Google Sheets, o se elige un CSV (`;` o `,`).
  Columnas *Categoría · Producto · Precio · Descripción*, en ese orden o con títulos en la primera fila;
  una categoría vacía repite la de arriba. Precios como `4500`, `4.500` o `$4.500`; sin precio queda
  "sin precio". Primero se **revisa** (vista previa con lo que pasará en cada fila y los errores por
  número de fila) y solo sin errores se importa. *Agregar*: los productos que ya existen (misma categoría
  y nombre) solo cambian precio y descripción, conservando foto y costo, y el cambio queda en el
  historial de precios. *Reemplazar*: lo que no está en la planilla se archiva (los pedidos antiguos no
  cambian). Hasta 500 filas por vez. Un `.xlsx` no se lee directo: se copian sus celdas o se guarda como CSV.
- **Ayudas por pestaña**: cada pestaña del panel abre con un recuadro "Cómo funciona esta pestaña" de
  2–3 líneas; al cerrarlo queda cerrado en esa tablet.

## Rutas

| Ruta | Qué es |
|---|---|
| `/gassuso` | Carta pública (móvil primero) |
| `/panel` | Panel del local (clave `PANEL_PASSWORD`) |
| `/comanda?id=N` | Ticket 80 mm (`&auto` imprime solo) |
| `/carta-imprimible` | Carta A4 para imprimir o guardar como PDF |
| `/salud` | Healthcheck |

Pago con tarjeta en línea (ver la sección de abajo):

| Ruta | Qué es |
|---|---|
| `POST /api/locales/:codigo/pedido/:id/pagar` | Inicia el pago (cuerpo: `token` del pedido y `email`); responde la URL de la pasarela. Público |
| `POST /api/seguimiento/:token/pagar` | Lo mismo desde el seguimiento del pedido. Público |
| `GET\|POST /pago/retorno?ref=` | Donde vuelve el cliente; solo muestra el estado. Público |
| `GET /api/pagos/estado/:ref` | Estado del pago para esa página. Público (la referencia es aleatoria) |
| `POST /api/pagos/webhook/flow\|mercadopago?ref=` | Aviso servidor a servidor de la pasarela: **la fuente de verdad** |
| `GET\|PUT /api/panel/pagos`, `POST /api/panel/pagos/probar` | Configuración del local (solo el dueño) |
| `POST /api/panel/pedidos/:id/devolver-pago` | Devolución total de un pago en línea (solo el dueño; cuerpo `{ confirmar_monto, email? }`) |
| `POST /api/pagos/devolucion/flow?ref=` | Aviso de Flow por una devolución: solo dispara la consulta a su API |

## Pago con tarjeta en línea (Flow o Mercado Pago)

El cliente puede pagar su pedido con tarjeta al confirmarlo (o después, desde el seguimiento). El
dinero va a la **cuenta de la pasarela del local**; 8vobit no cobra por esto y el local paga la
comisión de su pasarela. Efectivo y transferencia siguen igual. Código: `lib/pagos.mjs` (capa
común) + `lib/pagos-flow.mjs` y `lib/pagos-mercadopago.mjs` (adaptadores, REST con `fetch`, sin SDK).

Cómo funciona:

1. El servidor calcula el monto desde el pedido guardado (`pedidos.total`); lo que mande el
   navegador no se usa. Crea un intento (`pago_intentos`, referencia aleatoria única) y pide a la
   pasarela la URL de pago.
2. El cliente paga en la página de la pasarela (la tarjeta nunca pasa por nuestro servidor).
3. La pasarela avisa a `/api/pagos/webhook/...`. El servidor **le pregunta el estado a la pasarela**
   con las credenciales del local (Flow: `payment/getStatus` firmado con HMAC-SHA256; Mercado Pago:
   `GET /v1/payments/:id`, y si el local configuró la clave secreta de webhooks, también se exige la
   firma `x-signature`). Solo si la referencia, el monto y la moneda (CLP) coinciden, el pedido queda
   pagado con medio `tarjeta` y `cobrado_por = "Pago en línea (Flow)"`. Un aviso repetido no hace
   nada (idempotente por referencia). Un aviso falso, de otro monto o de otra referencia se rechaza
   (400) y queda en `pago_eventos`, visible en el panel.
4. `/pago/retorno` solo muestra el estado: si el cliente cierra la pestaña, el aviso igual llega.
   Si llega un pago de un pedido ya cobrado o anulado, queda como "Pago a revisar" (devolver en la pasarela).

### Si el webhook no llega (conciliación)

El webhook puede perderse (túnel caído, reinicio). Por eso cada adaptador sabe **preguntarle a la
pasarela** por una referencia (`consultar`: Flow `payment/getStatusByCommerceId`; Mercado Pago
`GET /v1/payments/search?external_reference=`, tomando el pago aprobado), y se aplica con la misma
validación que el webhook (referencia, monto, CLP, idempotente, transacción). La verdad la sigue dando la
API de la pasarela, nunca el navegador. Se usa en dos lugares:

- **Barrido** cada 5 minutos (`setInterval` con `unref`): intentos `creado`, `rechazado` o `expirado` de las
  últimas 48 h (un pago tardío o reintentado con otra tarjeta entra aunque no llegue el webhook), hasta 40
  por pasada; si la pasarela no responde se corta la pasada, y un error raro queda como evento sin tumbar el servidor.
  Los eventos repetidos (error de la pasarela, monto distinto) se registran una sola vez.
- **Página de retorno**: `GET /api/pagos/estado/:ref` concilia si el intento sigue abierto pasados
  ~20 s, con un tope de una consulta a la pasarela cada 15 s por referencia.

### Expiración

Un intento `creado` con más de 24 h se concilia una última vez y, si sigue sin pago, pasa a `expirado`
(el pedido queda por cobrar). Si la pasarela confirma después, **igual se acepta** (el dinero entró):
`creado`, `rechazado` o `expirado` pasan a `pagado`; desde `pagado` en adelante solo cambia por una
devolución. Para pruebas los plazos se pueden bajar con `PAGOS_ESPERA_S`, `PAGOS_LIMITE_S`,
`PAGOS_EXPIRA_S` y `PAGOS_CONCILIAR_MS` (0 apaga el barrido); no hay que tocarlos en producción.

### Devoluciones (totales)

En el panel, el dueño ve en cada pedido "Pagado en línea · Flow/Mercado Pago" y el botón *Devolver pago
en línea* (confirma el monto). `POST /api/panel/pedidos/:id/devolver-pago` (solo dueño, solo pedidos de
su local, solo devolución total):

- El intento se reserva (`devolucion_pendiente`) antes de llamar a la pasarela: un doble clic no devuelve dos veces.
- Solo un rechazo explícito de la pasarela (4xx) vuelve el pago a `pagado`. Si no hay respuesta, hay un 5xx o la
  respuesta es rara, la devolución pudo haberse creado: queda `devolucion_pendiente` (evento `devolucion_incierta`) y se
  resuelve consultando a la pasarela (barrido, aviso de Flow o un nuevo clic del dueño). **Un reintento sobre una
  devolución en curso solo consulta; nunca crea otra.** Si Flow nunca la deja consultar, se revisa en el panel de Flow.
- **Mercado Pago**: `POST /v1/payments/:id/refunds` con `X-Idempotency-Key` = referencia; la devolución
  suele quedar confirmada al tiro (`devuelto`).
- **Flow**: `refund/create` (necesita `receiverEmail`: el correo del cuerpo o el correo legal del local;
  `refundCommerceOrder` único por pago). Queda `devolucion_pendiente` hasta que Flow la confirme: avisa a
  `/api/pagos/devolucion/flow?ref=` (el contenido del aviso no cuenta, solo dispara `refund/getStatus`) y
  el barrido también la consulta.
- Al confirmarse, el intento pasa a `devuelto` y el pedido vuelve a `pagado = 0` (por cobrar). Queda un evento
  en `pago_eventos`. Si la pasarela la rechaza, el pago sigue vigente y se puede reintentar.
- Anular un pedido pagado en línea **no** devuelve la plata sola: la respuesta del anulado trae
  `aviso_devolucion` y el panel lo muestra; el pedido anulado queda marcado "Pago a revisar: devolver".
- **Cierre manual** (`POST /api/panel/pedidos/:id/devolucion-manual`, solo dueño, pasados ~10 min en `devolucion_pendiente`):
  el dueño declara "devuelto" o "pagado" tras mirar la pasarela. **Desviación consciente**: el sistema no puede
  comprobarlo, así que ese cierre se basa en lo que afirma el dueño; queda el evento `devolucion_manual` con su nombre.
- Tras un 4xx al crear la devolución, el pago solo vuelve a `pagado` si la pasarela confirma que no existe ninguna
  devolución (o la rechazó); con una en proceso o ante cualquier duda queda en curso.
- Si alguien cobra a mano un pedido con un pago en línea iniciado y sin terminar, el panel avisa (y dice hace cuánto
  se inició) antes de registrar; la API no lo impide.
- Si el total del pedido cambió respecto de lo cobrado, el pago queda `pagado` (el dinero entró) pero el pedido no se
  marca y aparece "Pago a revisar". Un contracargo de Mercado Pago queda como evento visible para el dueño.

**BLOQUEO: antes de `PAGOS_PRODUCCION=1`, correr esta lista de verificación en el sandbox real** (los formatos
siguientes se escribieron sin poder leer la documentación oficial; están marcados "verificar en sandbox" en el código):

- [ ] Flow `payment/create`: responde `url` + `token` + `flowOrder`, y el pago abre en `url?token=`.
- [ ] Flow `payment/getStatusByCommerceId` (param `commerceId` = nuestra referencia): mismo formato que `getStatus`, y qué
      responde (código HTTP y `code`) cuando el cliente aún no pagó. El código asume 400/404 = "aún nada".
- [ ] Flow `refund/create`: nombres de los campos (`refundCommerceOrder`, `commerceTrxId`, `receiverEmail`, `amount`,
      `urlCallBack`), que `refundCommerceOrder` repetido se rechace, y que el aviso a `urlCallBack` llegue (POST con `token`).
- [ ] Flow `refund/getStatus`: estados (`created`, `accepted`, `refunded`, `rejected`, `canceled`) y que acepte
      `refundCommerceOrder` además de `token` (se usa si se perdió la respuesta de `refund/create`).
- [ ] Flow: monto mínimo de un pago en CLP (hoy 350 en `MONTO_MINIMO`).
- [ ] Mercado Pago `POST /checkout/preferences`: responde 201 con `init_point` / `sandbox_init_point`; el webhook llega con
      `data.id` en la URL y la firma `x-signature` coincide con el manifiesto `id:..;request-id:..;ts:..;`.
- [ ] Mercado Pago `GET /v1/payments/search?external_reference=`: `results` con `status` y `transaction_amount`.
- [ ] Mercado Pago `POST /v1/payments/:id/refunds` sin cuerpo = devolución total, con `X-Idempotency-Key`; y
      `GET /v1/payments/:id/refunds` lista las devoluciones con su `status`.
- [ ] Un pago de prueba de punta a punta por cada pasarela, con webhook, sin webhook (apagar el aviso y esperar al barrido)
      y una devolución.

El pago en línea **no** se guarda en `pedido_pagos` (esa tabla es el detalle del pago mixto): el
pedido queda con `medio_pago = 'tarjeta'` y la caja lo cuenta como tarjeta, igual que un cobro con POS.

**Credenciales**: el dueño las pega en *Datos del local → Pago con tarjeta*. Se guardan cifradas
(AES-256-GCM con `PAGOS_CLAVE` del `.env`; tabla `local_pagos_config`), nunca vuelven completas al
navegador y nunca se escriben en el registro. Se eligió cifrarlas en la base (y no una variable de
entorno por local) para que cada dueño conecte su cuenta sin tocar el servidor.

### Variables de entorno (`.env` del servidor; ver `.env.example`)

- `PAGOS_CLAVE` (obligatoria para guardar credenciales): `openssl rand -hex 32`.
- `PAGOS_URL_BASE` (obligatoria): `https://pedidos.8vobit.xyz`.
- En el servidor real, `deploy/remoto.sh` agrega solo `PAGOS_CLAVE` (aleatoria, no se muestra; **respalda el
  `.env`**: sin esa clave las credenciales guardadas no se pueden leer) y `PAGOS_URL_BASE` si faltan. No toca `PAGOS_PRODUCCION`.
- `PAGOS_PRODUCCION=1` habilita los cobros reales en el servidor. Sin ella, solo modo de prueba.

### Probar en sandbox

- **Flow**: crear una cuenta en https://sandbox.flow.cl, copiar API Key y Secret Key (Mis datos →
  Integración) al panel, modo *Prueba*. Pagar con las tarjetas de prueba que publica Flow.
- **Mercado Pago**: en Mercado Pago Developers crear una aplicación (Checkout Pro), usar el Access
  Token de prueba (`TEST-…`) y, opcional, la clave secreta de Webhooks. Pagar con un usuario
  comprador de prueba y las tarjetas de prueba de Mercado Pago.
- En el panel, *Probar con un pago de prueba* abre un pago de $1.000 sin pedido (solo sandbox).
- El aviso de la pasarela tiene que llegar a `PAGOS_URL_BASE`: en un PC sin túnel el pago queda
  "Confirmando…" (es lo esperado; las pruebas automáticas usan una pasarela simulada).

### Pasar a cobros reales (un local)

1. El local abre su cuenta real en Flow (www.flow.cl, con su RUT y cuenta bancaria) o en Mercado
   Pago, y obtiene las credenciales **de producción** (Mercado Pago: `APP_USR-…`).
2. En el servidor: `PAGOS_PRODUCCION=1` en el `.env` y desplegar (es el interruptor general).
3. El dueño pega las credenciales de producción, elige *Cobros reales*, guarda y hace un pedido real
   pequeño para comprobar que el aviso llega y el pedido queda pagado. Luego, si quiere, lo devuelve
   desde su pasarela.

## Seguridad y respaldos

- **Límites de uso**: 8 intentos de clave y 15 pedidos por IP cada 15 minutos
  (responde 429). La IP real viene en `cf-connecting-ip`, que pone Cloudflare; por
  eso el contenedor **solo** debe escuchar en `127.0.0.1` (si se expusiera directo,
  esa cabecera se podría falsificar; `TRUST_PROXY=0` la ignora).
- **Cabeceras**: CSP con el hash de cada script de cada página (sin
  `unsafe-inline` para scripts), `frame-ancestors 'none'`, `nosniff`.
- **Respaldos**: una copia diaria consistente de la base (`VACUUM INTO`) en
  `/data/backups`, se conservan `BACKUP_DIAS` (14). **Están en el mismo disco**:
  para sobrevivir a una falla de disco hay que copiar `/data` fuera del servidor,
  por ejemplo con un `rsync` nocturno a otra máquina por Tailscale.
- **Respaldo fuera del servidor** (desde Windows, en la carpeta del repo):
  `powershell -ExecutionPolicy Bypass -File .\pedidos\deploy\respaldo.ps1 -Instalar`.
  Pide al servidor una copia consistente (base + fotos, [`deploy/exportar.sh`](deploy/exportar.sh)),
  la descarga a `D:\Respaldos\pedidos`, verifica que se pueda abrir y conserva las últimas 30.
  `-Instalar` además la programa todos los días a las 13:00 (o al prender el PC). `-Restaurar`
  muestra los pasos para volver a una copia.
- **Caché**: Cloudflare impone 4 h de caché de navegador a `.js` y `.css`. Por eso las
  páginas referencian `comun.js?v=<hash>` y `carta.css?v=<hash>` (el servidor los agrega
  al servir): cada despliegue cambia la URL y nadie queda con una versión vieja. Esas
  URLs versionadas se sirven con caché de un año (`immutable`).
- `docker stop` cierra limpio (termina respuestas en curso y cierra la base).

## Pruebas

```bash
npm test   # 118 pruebas de punta a punta, sin dependencias, ~6 s (test/pagos.test.mjs usa una pasarela simulada)
```

Corren contra el servidor real con una base temporal y horario de 24 h.

## Local

```bash
PANEL_PASSWORD=demo node server.mjs   # http://127.0.0.1:8099/gassuso
```

Los datos quedan en `./data/pedidos.db`. Para recargar la carta desde
`seed/gassuso.json`, borrar ese archivo (solo se siembra con la base vacía).

## Desplegar en lenovo-edge

**Puerto del host: 8100** (dentro del contenedor sigue siendo 8099). Puertos ocupados
en `lenovo-edge` al 2026-10-12: 8089 gabriel-profile-link, 8092 radio, 8093 codice,
8094 home-8vobit, 8095 agenda, 8097 boldus, 8098 chatbot, **8099
completapp-dev-wordpress** (no figura en el espejo `D:\VPS`); reservados aunque no
escuchaban: 8091 ongtapitas, 8096 Jellyfin.

Desde Windows, en la carpeta del repo (PowerShell):

```powershell
.\pedidos\deploy\desplegar.ps1
```

Empaqueta `pedidos/` (sin `data/` ni `.env`), lo copia a `/tmp` del servidor y corre
[`deploy/remoto.sh`](deploy/remoto.sh), que:

1. Verifica que el puerto 8100 del host esté libre (o sea del propio `pedidos`).
2. **Corre las pruebas en el servidor**, en un contenedor desechable; si alguna
   falla, se detiene sin tocar nada.
3. Respalda la versión anterior en `/srv/docker/compose/pedidos.prev-FECHA`.
4. Copia los archivos conservando `.env`; la primera vez crea `.env` con una clave
   del panel aleatoria y **la muestra una sola vez**.
5. `docker compose up -d --build` (solo este stack).
6. Verifica: `/salud`, carta HTTP 200, fotos en el volumen, **hora de Chile en el
   contenedor**, escritura en `/data`, respaldo inicial, memoria, que escuche solo en
   `127.0.0.1` y errores en logs.

La **primera vez**, agregar el hostname al túnel (una sola vez, a mano):

```bash
ssh gabriel@lenovo-edge 'sudo bash /srv/docker/compose/pedidos/deploy/tunel.sh'
```

Respalda `/etc/cloudflared/config.yml`, inserta `pedidos.8vobit.xyz → 127.0.0.1:8100`
antes de la regla final 404, **valida con `cloudflared` antes de reemplazar** y reinicia
`cloudflared.service`. Luego indica el comando de DNS si el registro aún no existe.

Verificación externa:

```bash
curl -sS -o /dev/null -w "HTTP %{http_code}\n" https://pedidos.8vobit.xyz/gassuso
```

Después, copiar `docker-compose.yml` a `infra/docker-compose.pedidos.yml` y la
regla nueva a `infra/cloudflared-config.yml` en el espejo `D:\VPS`.

Opcional: proteger `/panel` y `/api/panel/*` también con Cloudflare Access,
igual que wp-admin. **Nunca** `/gassuso` ni `/api/locales/*`: son públicos.

## Pendiente (ver plan maestro)

- Datos que faltan: precios de *Pollo + 1 ingr.*, *Vegetariano*, papas y
  recargos de agregados; ingrediente del Diplomático; bebidas.
- Modo 3 (boleta integrada con SimpleAPI), promociones, métricas semanales.
