# Bot de DM: flujo de onboarding para desarrollo web (propuesta)

Estado: **implementado y desplegado** el 18-oct-2026, en `bot/cerebro.js` → `flujoWeb()`, con 17 pruebas. Las respuestas de Gabriel de esa noche quedaron aplicadas:
- **Página web:** como no hay portafolio publicado, el cierre siempre pasa a Gabriel (aviso urgente) y ofrece la reunión.
- **Agenda online:** muestra la agenda de 8vobit funcionando (8vobit.xyz/#agendar) y deja el precio para la reunión, mientras no se apruebe `marketing/PRECIOS-AGENDA-ONLINE.md`.
- **Pedidos:** muestra Gassuso en vivo (pedidos.8vobit.xyz/gassuso), con 1% por pedido.
- La bienvenida y la respuesta nocturna ofrecen dos botones: **Reparación** y **Desarrollo web**.
- Como la agenda todavía no envía correos, el cierre dice "cuando agendes, te confirmo el link de Meet por aquí".
Complementa el bot de reparaciones (`bot/cerebro.js`). Este flujo se activa cuando alguien muestra interés en una plataforma web.

## Qué hace el mercado (resumen del estudio)

- Los flujos de calificación por DM (ManyChat, Inrō y similares) usan **2 a 4 preguntas con botones**, ramifican según la respuesta y terminan en **un link para agendar** o en **un humano**. Mientras más pasos, más gente abandona.
- Las preguntas más comunes son: **qué tipo de proyecto**, **para cuándo** y los datos de contacto. El presupuesto casi nunca se pregunta por DM. Lo que se hace es **mostrar un precio "desde"** y hablarlo en la reunión.
- Las preguntas fáciles van primero y las difíciles después. Siempre tiene que haber una **salida a una persona** visible.
- La velocidad de respuesta es lo que más pesa en la conversión (responder en los primeros minutos).
- Los leads "solo estoy mirando" **no se presionan**: se les deja material y la puerta abierta.
- Hay que respetar la ventana de 24 h de Meta y no mandar mensajes masivos.

Fuentes: [Inrō, calificación en Instagram 2026](https://www.inro.social/blog/instagram-lead-qualification-2026), [Inrō, guía](https://www.inro.social/guides/instagram-lead-qualification), [Hackceleration (agencia ManyChat)](https://hackceleration.com/es/agencia/manychat), [ManyChat, 4 automatizaciones de DM](https://manychat.com/blog/es/como-empezar-con-la-automatizacion-de-dms-de-instagram-4-automatizaciones-que-necesitas-%F0%9F%A4%A9/), [Spur, cómo califican los chatbots](https://www.spurnow.com/blogs/how-do-chatbots-qualify-leads), [guía de lógica de calificación](https://claudeskills.info/skills/louisblythe/Sales-Skills/lead-qualification-logic/). Son en su mayoría fuentes de proveedores: sus cifras de conversión no están verificadas.

## El flujo (3 preguntas con botones, sin IA)

**Cuándo se activa:** si escriben WEB, AGENDA PRO, DEMO, "página web", "agenda online", "pedidos" o "desarrollo web", o si eligen "Desarrollo web" en el menú de bienvenida.

```
0. Saludo + ¿qué quieres resolver?
   [Página web] [Agenda online] [Pedidos para mi local] [Quiero conversarlo]
        │
1. ¿A qué se dedica tu negocio?            (texto libre, una línea)
        │
2. ¿Cómo lo haces hoy?                     (botones según lo elegido en 0)
   Página web: [No tengo página] [Tengo, pero quiero mejorarla]
   Agenda:     [Por WhatsApp o cuaderno] [Uso otra app]
   Pedidos:    [Por WhatsApp] [Por apps (Uber, PedidosYa)] [Ambas]
        │
3. ¿Para cuándo lo necesitas?
   [Este mes] [En 1 a 3 meses] [Solo estoy mirando]
        │
4. Mostrar y cerrar
   ├─ Este mes / 1–3 meses → ejemplo real + precio "desde" + link a la reunión (8vobit.xyz/#reunion)
   │                          + aviso a Gabriel por ntfy con el resumen
   └─ Solo estoy mirando  → ejemplo real + "cuando quieras, escribe REUNIÓN"
                             (sin aviso urgente: queda registrado)
```

- **"Quiero conversarlo"** en el paso 0 salta directo al paso 4, con el link a la reunión.
- **Salida a una persona en cualquier momento:** si escriben "HABLAR" o "persona", el bot se calla y avisa a Gabriel.
- **Si Gabriel escribe a mano**, el bot se calla, igual que hoy.
- **Si no hay respuesta en 24 h**, el flujo queda pausado y no se insiste.
- Las respuestas de texto que no calzan con los botones se aceptan igual. Si no se entienden, se repite la pregunta una sola vez y después pasa a Gabriel.

## Qué se muestra en el paso 4 ("mostrar")

| Elección | Ejemplo | Precio que se menciona |
|---|---|---|
| Página web | un sitio hecho por 8vobit (por definir cuál) | desde $150.000 |
| Agenda online | 8vobit.xyz/#reparacion (la agenda propia funcionando) | por definir |
| Pedidos | demo de pedidos.8vobit.xyz (cuando esté lista) | 1 % por pedido |

## Aviso a Gabriel (ntfy)

> 🔥 Lead web · **Pedidos para mi local** · *Sushi en Lomas* · hoy por apps · **este mes** · ya tiene el link de la reunión

## Detalles técnicos

- **Botones:** la API de mensajes de Instagram acepta *quick replies* (hasta 13 botones), y el cliente toca en vez de escribir. Hay que probar que se vean bien en la app.
- **Estado por contacto** (paso actual y respuestas) en la misma memoria del flujo de n8n que ya usa el bot. Sin servidor nuevo.
- **Sin IA**, igual que el resto del bot. El paso 1 (texto libre) solo se guarda, no se interpreta.
- **Medición:** cuántos entran, cuántos llegan al paso 4 y cuántos agendan. Eso permite ajustar las preguntas con datos reales.

## Pendiente

- Armar un portafolio para que "Página web" pueda mostrar ejemplos sin pasar por Gabriel.
- Agregar el precio de la agenda al cierre cuando se apruebe la propuesta.
- Probar desde una cuenta real que los botones (quick replies) se vean bien en la app de Instagram.
