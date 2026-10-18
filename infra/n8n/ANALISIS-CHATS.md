# Análisis de 6 años de DM de @8vobit (nov-2020 a oct-2026)

Fuente: export de Instagram del 17-oct-2026, solo mensajes, en `infra/n8n/chats/`. **No se sube al repo** porque tiene datos personales; aquí no hay nombres.
Scripts de análisis: clasificación por expresiones regulares sobre el texto. Los audios y las fotos no se pueden leer, así que los números son **mínimos**.

## 1. Panorama

| | |
|---|---|
| Conversaciones | 308, de las cuales 290 son de personas reales (7 de spam y el resto son grupos o avisos) |
| Mensajes | ~14.100 (mediana: 19 por conversación) |
| Conversaciones nuevas por año | 2021: 96 · 2022: 21 · 2023: 40 · 2024: 53 · 2025: 65 · 2026 (hasta oct): 21 |
| Clientes que vuelven en otro año | 49 (17%) |
| Conversaciones sin ninguna respuesta | 21 |
| Mensajes que llegan entre 21:00 y 09:00 | 599, de los cuales **198 se respondieron después de 4 h** |
| Días con más mensajes | miércoles y jueves; el sábado y el domingo bajan a la mitad |
| Horas punta | 11:00 a 20:00, casi planas; siguen llegando bastantes a las 22:00 y 23:00 |

**Respuesta humana** (sin contar la bienvenida automática de Instagram):

| Año | Mediana | 75% responde antes de | Más de 1 h |
|---|---|---|---|
| 2021 | 4 min | 1,6 h | 29% |
| 2023 | 11 min | 3,4 h | 36% |
| 2024 | 2 min | 3,3 h | 31% |
| 2025 | 8 min | **7,1 h** | 38% |
| 2026 | 2 min | 2,7 h | 29% |

Cuando Gabriel está, responde muy rápido. El problema es la cola: **1 de cada 3 consultas espera más de una hora**, y en 2025, el año de más trabajo, empeoró.

## 2. Catálogo de intenciones

Columnas: cantidad de conversaciones donde aparece la intención, cuántas veces es el **primer** mensaje, y la tendencia.

| Intención | Conv. | 1er msg | Tendencia | Qué pide la gente | ¿Automatizable? |
|---|---|---|---|---|---|
| **Saludo a secas** ("Hola", "Buenas") | 123 | **76** | ↑ | Nada todavía: espera que le pregunten | ✅ Bienvenida corta más un menú |
| **Precio / cotizar** | 96 | 27 | estable | "¿Cuánto sale formatear / limpieza / pantalla?" | ✅ Lámina de precios más "el diagnóstico de $5.000 se abona" |
| **Agendar / disponibilidad** | 73 | 17 | ↑↑ | "¿Tienes hora?", "¿hay que agendar?", "¿es para ir a dejarlo?" | ✅ Link de Calendly más cómo funciona la entrega |
| **Llegada** ("llegué", "estoy afuera / en el hall") | 73 | 2 | ↑↑ | Que alguien baje | ⚠️ Aviso urgente a Gabriel más "voy bajando" |
| **Estado / retiro** ("¿está listo?") | 59 | 3 | ↑↑ | Saber cuándo retirar | ⚠️ Respuesta de espera más aviso a Gabriel |
| **Pago** (transferencia, abono, comprobante) | 54 | 2 | ↑ | Datos para transferir, confirmar pago | ✅ Datos desde la configuración, más aviso a Gabriel |
| **Horario** | 56 | 4 | estable | "¿Atienden hoy / sábado / hasta qué hora?" | ✅ Texto fijo |
| **Ubicación** | 37 | 5 | ↑ | "¿Dónde están?", "¿qué depto?", "es un edificio" | ✅ Texto fijo: Freire 1458, se recibe en el lobby |
| **Tiempo de reparación** | 29 | 2 | ↑ | "¿Cuánto se demora?" | ✅ Tabla de tiempos por servicio |
| **Upgrade RAM / SSD** | 60 | 12 | ↑ | "¿Le puedo poner más RAM?", "¿qué SSD compro?" | 🟡 Pedir el modelo exacto y luego Gabriel cotiza |
| **Limpieza / temperatura / ruido** | 60 | 16 | estable | "El ventilador suena como avión" | ✅ Precio más agenda |
| **Formateo / Windows / Office** | 57 | 14 | estable | "Está lento, quiero formatear", "Office se venció" | ✅ Precio, con o sin respaldo |
| **Pantalla** | 57 | 11 | ↑ | Pantalla rota, parpadea, bisagras | 🟡 Pedir modelo y foto; rango de precio |
| **Lento** | 31 | 7 | ↓ | "Se pega, demora en prender" | ✅ Diagnóstico |
| **Batería / cargador / jack** | 33 | 4 | estable | "No carga", "la batería murió" | 🟡 Pedir modelo |
| **No enciende / líquido** | 28 | 5 | estable | "Se le cayó té", "murió" | ⚠️ Urgente: apagarlo y traerlo |
| **Recuperar datos** | 35 | 4 | ↑ | "Se me borró todo", tarjeta SD | ✅ Precio ($20.000) más diagnóstico |
| **Virus / claves / bloqueo** | 29 | 1 | estable | "Mi hijo le puso clave al Mac" | 🟡 Diagnóstico |
| **Garantía / "sigue igual"** | 24 | 0 | estable | Algo volvió a fallar después del servicio | ❌ Siempre humano y con prioridad |
| **Armar PC / qué comprar** | 31 | 4 | ↓ | "Recomiéndame un PC gamer" | 🟡 Formulario: presupuesto y uso; armado $50.000 |
| **Otros dispositivos** (celular, Mac, consola) | 34 | 3 | estable | "¿Arreglan celulares?" | ✅ Decir qué sí y qué no se hace |
| **Web / software / correos** | 34 | 3 | estable | "Cotizar página web" | ✅ Derivar a la línea 8vobit web / pedidos (palabra WEB) |
| **Remoto / a domicilio** | 8 | 1 | ↑ | "¿Puede ser vía remota?" | ✅ Explicar que existe atención telemática y retiro a $5.000 |
| **Descuento estudiante** | 8 | 4 | ↑ | "¿Cuánto es el descuento?" | ✅ Texto fijo |
| **Viene recomendado** | 51 | 9 | estable | "Me dieron tu dato" | 📈 Oportunidad: programa de referidos |
| **Agradecimiento** | 119 | 9 | | "Gracias, te pasaste" | 📈 Pedir reseña de Google en ese momento |

Leyenda: ✅ respuesta automática segura · 🟡 automatizar la pregunta, y la cotización la hace Gabriel · ⚠️ automatizar el aviso, no la solución · ❌ siempre humano.

## 3. Embudo

| Año | Conv. | Se habló de agendar | Llegó o dejó el equipo* | Pagó por transferencia* |
|---|---|---|---|---|
| 2021 | 96 | 21 | 21 | 15 |
| 2024 | 53 | 45 | 15 | 11 |
| 2025 | 65 | 57 | 28 | 17 |
| 2026 | 21 | 21 | 6 | 4 |

\* Es un mínimo: mucha gente llega o paga sin escribirlo.

Desde 2024 casi todas las conversaciones pasan por Calendly, pero **menos de la mitad deja rastro de haber llegado**. Revisé a mano las 72 conversaciones de 2024-2026 que no tienen ni llegada ni pago. Las fugas típicas son:

1. **Preguntó un precio y recibió audio o "depende del modelo"**, y ahí murió (cambio de batería, teclado, pantalla, SSD, tornillos).
2. **Problema de Calendly**: agendó a las 13:00 y se lo movieron a las 14:00, o no entendió que es para ir a dejarlo.
3. **Pidió algo fuera de rubro** (celular, pantalla de Mac, web, optimizar FPS) y no tuvo un "no, pero…" claro.
4. **Lo último que mandó 8vobit fue un audio**: el cliente no lo escuchó o no le quedó claro, y no hubo seguimiento.
5. **Spam y proveedores** (pantallas, bots chinos, "too shy") se llevaron respuestas y la bienvenida automática.

## 4. Precios que se han dado por chat (2024-2026)

Hay **inconsistencias**: el mismo servicio aparece con precios distintos según la fecha y la conversación. Es lo primero que hay que ordenar antes de automatizar.

| Servicio | Lo que se dijo |
|---|---|
| Diagnóstico | $4.000 (2025), luego $5.000; **se abona** si se toma el servicio |
| Formateo | $10.000, $15.000 o $20.000 según el chat; +$5.000 con respaldo |
| Reparar Windows | $15.000 (igual que el formato) |
| Limpieza interna | $25.000 ("básica" y "completa" aparecen con el mismo precio) |
| Instalación de RAM, SSD o batería | $15.000 más la pieza |
| Pantalla | Pieza más $25.000 de instalación; rango general de reparaciones entre $80.000 y $200.000 |
| Recuperar datos | $20.000 |
| Armado de PC | $50.000 |
| Retiro o entrega en Concepción | $5.000 por tramo |
| Ventilador | $10.000 (2024) |

## 5. Todo lo que se puede mejorar

### A. Operación (sin tecnología)
1. **Una sola lista de precios oficial**, con fecha, en una lámina y en la web. El bot y Gabriel citan la misma.
2. **Responder por escrito lo esencial** (precio, fecha, total). El audio sirve para explicar, pero el número tiene que quedar escrito. Hoy el 18% de los mensajes de 8vobit son audios, y varias conversaciones perdidas terminan en un audio.
3. **Calendly**: no ofrecer horas que no se atienden (el caso de las 13:00) y poner en la confirmación "se recibe en el lobby de Freire 1458, escríbenos al llegar".
4. **Protocolo de llegada**: alguien tiene que bajar en menos de 5 minutos. Hay casos de clientes que se fueron después de esperar 15 a 20 minutos y de un "¿hola?" repetido.
5. **Garantía visible**: decir cuántos días cubre cada servicio. Los "sigue igual" se atienden primero.
6. **Pedir reseña en Google** cuando el cliente dice "gracias, quedó perfecto" (119 conversaciones con agradecimiento).
7. **Referidos**: 51 conversaciones parten con "me dieron tu dato". Un descuento para quien recomienda empujaría lo que ya funciona.
8. **Fuera de rubro**: tener una respuesta tipo "eso no lo hacemos, te recomiendo X", o derivarlo a la línea web.

### B. Automatización con n8n
1. **Reemplazar la bienvenida nativa de Instagram** (salió 275 veces en 2025-26, incluso encima de "llegué" o "¿está listo?") por una bienvenida de n8n **solo para alguien nuevo o que lleva más de 30 días sin escribir**, con un menú corto: *precios · agendar · dónde estamos · estado de mi equipo*.
2. **Clasificador por intención** con las reglas de la sección 2 (sinónimos y sin tildes). Cada intención ✅ responde con un texto escrito, la lámina si corresponde y el link de Calendly.
3. **Avisos urgentes** al celular (ntfy con prioridad alta): llegada, garantía o "sigue igual", líquido o no enciende, y pago enviado.
4. **Fuera de horario** (21:00 a 09:00, 599 mensajes): respuesta "te contesto mañana desde las 9; mientras, puedes agendar aquí", para que nadie quede con el visto.
5. **Pedir datos antes de cotizar** (🟡): "mándame el modelo exacto (etiqueta de abajo) y una foto del daño". Así Gabriel cotiza de una vez.
6. **Calendly → n8n**: aviso a Gabriel con cada cita nueva o cancelada. Recordatorio por DM solo si la persona escribió en las últimas 24 h, por la regla de Meta.
7. **Filtro de spam**: no responder links `app.link`, grupos, proveedores ni mensajes en otros idiomas con patrón de estafa.
8. **Registro de cada conversación** (intención, si agendó, si llegó) en una tabla. Así este análisis se actualiza solo cada mes.
9. **Fase 2 con IA**: borrador de respuesta que Gabriel aprueba desde el celular. Solo después de que las reglas funcionen.

### C. Límites
- Instagram solo deja responder dentro de 24 h del último mensaje del cliente: no se puede hacer seguimiento en frío.
- Sin transcripción no se pueden clasificar ni los audios ni las fotos del cliente; esos van directo a aviso.
- Los datos bancarios no van en el flujo exportado al repo: van en el `.env` del servidor.

## 6. Orden sugerido

1. Definir la lista de precios oficial y los tiempos por servicio (Gabriel).
2. n8n: aviso de llegada, bienvenida inteligente y filtro de spam.
3. n8n: intenciones ✅ y respuesta fuera de horario.
4. Calendly: horarios y texto de confirmación; webhook a n8n.
5. Reseñas y referidos.
6. Registro y reporte mensual; después, la IA.
