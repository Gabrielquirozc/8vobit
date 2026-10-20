# Review UX: cajero de un local chico y pestaña Promociones

Solo análisis (sin cambios de código). Se leyó panel.html, panel-caja.js, panel-inicio.js, lib/caja.mjs, Gastos y Promociones.

## 1. Un turno completo en Caja

Lo que hay: fondo inicial, ingreso, retiro, gasto (11 categorías, efectivo u otro medio), corte de turno, cierre con billetes, nota obligatoria sobre $5.000, voucher y cartola opcionales. Cada pedido se cobra con UN medio de pago.

| Situación | ¿Se puede? | ¿Es obvio? | Qué falta o confunde |
|---|---|---|---|
| Abrir con sencillo | Sí | Sí (aviso "Caja sin abrir") | Bien. |
| Guantes, bolsas, hielo, gas | Sí, como Gasto | Medio | Hay que abrir el diálogo, elegir categoría de 11 y escribir monto: son 4 toques por un gasto de $2.000. Sin atajos de "los de siempre". |
| Propina | No | No | No hay propina. Si entra en efectivo y no se anota, la caja "sobra"; si va al personal, hay que anotar un Retiro "propina". |
| Vuelto que falta | Parcial | No | No hay forma de decir "faltaron $500 de vuelto": queda como diferencia al cierre. |
| Dueño saca plata | Sí, Retiro | Sí | Exige motivo escrito cada vez; pide teclear. |
| Proveedor cobra en efectivo | Sí, Gasto en efectivo | Medio | "Insumos" no distingue el proveedor; sin foto de boleta. Funciona. |
| Pago mitad efectivo, mitad tarjeta | No | No | Un pedido = un medio. Hay que inventar dos ventas o elegir uno, y el efectivo esperado queda mal. Es el caso que más descuadra. |
| Cliente paga después / fía | Parcial | No | Existe "Por cobrar", pero sin nombre de deudor, sin saldo ni "cobrar fiado" aparte. El total de "Por cobrar" se mezcla con los pedidos abiertos del día. |
| Error de cobro (cobré de más / medio equivocado) | No | No | No hay "corregir el medio de pago"; solo Anular y rehacer. |
| Anulación | Sí | Sí | Anular un pedido ya cobrado en efectivo: no queda claro si la plata sale de la caja ni hay devolución. |
| Pago a repartidor | Sí, Gasto "Bencina y despacho" | Medio | No hay categoría "Repartidores/propinas de reparto". |
| Súper con boleta perdida | Sí | Sí | El N° de documento es opcional: bien. Falta saber que "sin boleta" está permitido. |
| Cambio de turno | Sí, Corte de turno | Medio | Nombre técnico ("corte"); cuesta saber cuándo usarlo. Una línea de ayuda ayuda, pero está escondida en un recuadro plegable. |
| Cierre | Sí | Sí | Pide billetes, nota, voucher/cartola: está completo pero largo; para quien cierra cansado son muchos campos juntos. |

Lo más grave para el cajero: **pago mixto**, **propina** y **fiado**. Son frecuentes en un local chico y hoy obligan a "inventar" registros que descuadran la caja.

## 2. Pestaña Promociones

- **Cuánto ve de golpe:** el formulario nuevo tiene 11 campos en 6 filas (nombre, código, tipo, valor, días, hora desde/hasta, categoría, mínimo, termina, máx. usos, activa). Abajo, además, la sección Combos y dos textos de ayuda largos.
- **¿Entiende qué tipo elegir?** No se elige "tipo de promo": la diferencia (automática o con código) está escondida en el campo opcional "Código: vacío = se aplica sola". Quien llega nuevo no sabe que hay promos de día/hora, de monto mínimo o por categoría; tiene que deducirlo combinando campos.
- **Ayuda:** hay un párrafo de reglas y un estado vacío con ideas ("Martes de churrasco"); no hay ejemplos clicables.
- **Combos** vive en la misma pestaña y funciona distinto (otro formulario, otro concepto): confunde.
- **Cómo dividirlo:** paso 1, elegir un tipo con ejemplo y botón ("Un día flojo con descuento", "Código para Instagram", "Descuento por compra mínima", "Combo"); paso 2, un formulario corto con solo los campos de ese tipo y un resumen en lenguaje natural arriba ("15 % los martes de 12:00 a 15:00"); "Más opciones" plegado con categoría, vence y máx. usos.

### ¿Pasa lo mismo en otras pestañas?
- **Datos del local** (`pintarLocal`) y **Despacho** (tramos, vehículos, costos, cobertura, ~350 líneas): muchas secciones apiladas sin índice al principio; Local ya tiene salto por secciones pero sigue siendo largo.
- **Equipo** y **Resumen**: densas, con muchos números a la vez; el Resumen mezcla KPIs, gráficos y exportaciones.
- **Carta y precios**: la más cuidada (buscador, filtros, ficha), el modelo a copiar.
- **Caja del día**: 6 tarjetas + bloque de efectivo + 2 tablas + detalle; es la segunda más cargada.

## 3. Mejoras priorizadas

| # | Mejora | Esfuerzo | Impacto |
|---|---|---|---|
| 1 | Pago mixto en el cobro: dividir el total en dos medios (efectivo + tarjeta) | Grande | Muy alto para cajero: hoy descuadra la caja |
| 2 | Gastos rápidos: botones "Bolsas, Gas, Hielo, Pan, Verduras…" con monto en un paso (categoría ya puesta; los últimos 5 gastos como atajo) | Medio | Alto: baja de 4 toques a 2 |
| 3 | Propina en el cobro (botón +5/10/% o monto) que no cuente como venta pero sí como efectivo | Medio | Alto: evita sobrantes y Retiros falsos |
| 4 | Fiado: "Por cobrar" con nombre del cliente, saldo y botón "Cobrar deuda" aparte de los pedidos abiertos | Grande | Alto para el dueño |
| 5 | Promociones en dos pasos (elegir tipo con ejemplo, luego formulario corto + "Más opciones" y resumen en una frase) | Medio | Alto para dueño nuevo |
| 6 | Corregir medio de pago de una venta ya cobrada (con registro de quién) | Medio | Medio: hoy hay que anular y rehacer |
| 7 | Retiros y gastos frecuentes con motivo en un toque ("Dueño", "Depósito banco", "Repartidor") | Chico | Medio |
| 8 | Aclarar anulación de pedido cobrado en efectivo (¿devolvió plata?) con una pregunta al anular | Chico | Medio |
| 9 | Renombrar "Corte de turno" a "Entregar la caja" y dejar la ayuda visible junto al botón | Chico | Medio |
| 10 | Cierre en dos pasos: primero contar efectivo; "Voucher y cartola" y nota solo si hay diferencia o si se quiere | Chico | Medio |

## Resumen (10 líneas)
1. La caja cubre bien abrir, retirar, gastar y cerrar; falla en lo mixto.
2. Pago mixto no existe: es el descuadre más probable.
3. Propina no existe: genera sobrantes o retiros inventados.
4. Fiado existe a medias ("Por cobrar" sin nombre ni saldo).
5. Registrar un gasto menor toma 4 toques; faltan atajos de gastos frecuentes.
6. No se puede corregir el medio de pago: solo anular y rehacer.
7. El nombre "Corte de turno" es técnico; conviene "Entregar la caja".
8. Promociones muestra 11 campos juntos y esconde el tipo de promo en un campo opcional.
9. Proponemos dos pasos: tipo con ejemplo, luego formulario corto y un resumen en frase.
10. Despacho, Local, Resumen y Caja del día también cargan mucha información de una; Carta y precios es el modelo a seguir.
