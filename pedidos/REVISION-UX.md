# Revisión UX/UI — 8vobit Pedidos (16-10-2026)

Revisión parcial hecha en local (servidor propio en el puerto 8123 con datos en un scratchpad, sin tocar `data/`), con el navegador integrado y lectura de código. Es solo diagnóstico: no se cambió código.

> **Actualización:** la revisión completa del panel con un mes simulado, el onboarding, las notificaciones, las sesiones y la caché, la competencia y el orden de entrega de los despachos están en `ESTUDIO-UX.md`. Ahí hay un hallazgo **Crítico** nuevo: el panel deja de buscar pedidos en 5 de sus 10 pestañas (`panel.html:2037`).

## 1. Resumen

- La carta pública está sólida: no hay errores en la consola ni scroll horizontal en 375 px, la validación tiene mensajes claros en español, y el aviso de Términos y el "Pagas al retirar" se ven antes de enviar.
- El panel funciona y tiene estados vacíos, pero en la tablet de cocina y caja hay roce.
- **Grave 1:** el sonido de pedidos nuevos parte apagado y depende de que alguien toque la campana. Si nadie la toca, se pierden pedidos.
- **Grave 2:** en tablet (1024 px) hay 10 pestañas y 3 quedan fuera de la pantalla sin ninguna señal (Despacho, Equipo, Datos del local).
- **Grave 3:** los errores y las confirmaciones del panel usan `alert` / `confirm` / `prompt` nativos con el mensaje crudo del servidor. Además, los títulos todavía piden "Bricolage Grotesque" e "Inter", que ya no se cargan.

## 2. Hallazgos

| ID | Pantalla / recorrido | Usuario | Problema | Evidencia | Severidad | Propuesta concreta | Esfuerzo | Archivo probable |
|---|---|---|---|---|---|---|---|---|
| H1 | Panel › Pedidos | Cocina | El sonido parte apagado (`aria-pressed="false"`, ícono campana tachada). Solo hay un texto de ayuda que dice "Activa la campana". Al recargar o reiniciar la tablet vuelve a quedar mudo. | Al entrar a `/panel`: `#sonido` está en `aria-pressed=false` | Alta (cercana a Crítica: un pedido perdido es plata) | Mostrar un banner fijo y llamativo "🔕 Sonido apagado: toca para activar" mientras esté apagado, y recordar la preferencia. El navegador exige un toque para el audio: aprovechar el toque de "Entrar". | S | `public/panel.html` |
| H2 | Panel › barra de pestañas | Dueño, Caja | Hay 10 pestañas y en 1024 px solo se ven 7. Despacho, Equipo y Datos del local quedan ocultas sin flecha ni degradado. | JS: `tabs.length=10`, `visibles=7` con `innerWidth=1024`. Captura: "Carta y precios" aparece cortada. | Alta | Agrupar en "Operación" (Pedidos, Venta rápida, Caja) y "Gestión" (menú "Más ▾"), o agregar un degradado con flecha al final del scroll. | M | `public/panel.html` (`.tab`, línea ~20) |
| H3 | Panel (todas las acciones) | Todos | Los errores se muestran con `alert(err.message)` y las acciones destructivas con `confirm()`. El renombrar usa `prompt()`. En una tablet esto bloquea la pantalla, se ve "técnico" y no tiene estilo. | `panel.html:696, 711, 714, 929, 1066, 1084, 1089, 1102, 1130, 1141, 1183, 1218…` | Alta | Crear una hoja de confirmación con `<dialog>` y un toast de error reutilizables, con botón peligroso en rojo y separado. Para "Anular pedido", dar "Deshacer" 5 s en vez de confirmar. | M | `public/panel.html`, `public/comun.js` |
| H4 | Panel › tarjeta de pedido | Cocina | El botón de avance (`.paso`) mide 54 px y los secundarios (`.acc`) 44 px con letra de 0,8 rem. La meta para cocina es ≥ 56 px y legible de lejos. | `panel.html:50` y `:53` | Media | `.paso` a 60 px; `.acc` a 52 px con texto de 0,9 rem; dejar "Anular" aparte y al final. | S | `public/panel.html` |
| H5 | Títulos en todas las pantallas | Todos | `--font-display` sigue pidiendo "Bricolage Grotesque" y `--font-body` "Inter", que ya no se descargan. En los equipos sin esas fuentes se usa system-ui (Segoe en Windows, Roboto en Android, SF en iOS). En `cartel.html` y `legal.html` el respaldo es solo `sans-serif`, así que en Windows imprime en Arial. Si alguien tiene Inter instalada, la carta se ve distinta según el equipo. | JS: `h1 fontFamily = "Bricolage Grotesque", system-ui…`; `cartel.html:26,38,80`; `legal.html:14,21` | Media | Definir una sola pila de fuentes: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`, con peso 800 y `letter-spacing: -.02em` para los títulos. Usarla también en el cartel y en Legal. | S | `public/carta.css:13-14`, `cartel.html`, `legal.html` |
| H6 | Código / sistema visual | — | `estilo.css` no se usa en ninguna página y trae otra paleta (`--accent #d9480f`, Roboto). Es un riesgo: alguien puede editarlo creyendo que afecta algo. | `grep stylesheet`: todas las páginas cargan `carta.css` | Baja | Borrarlo, o fusionar en `carta.css` lo que sirva. | S | `public/estilo.css` |
| H7 | Carta › portada | Cliente | Los chips de dirección, llamar, WhatsApp e Instagram miden 35 px de alto y "Términos" / "Privacidad" 18 px. Son menos de 44 px y cuesta tocarlos con una mano. | JS en 375×812: `.fact` 35 px de alto, enlaces legales 18 px | Media | `.fact { min-height: 44px }` y padding vertical en los enlaces del pie. | S | `public/carta.css` (`.fact`), `carta.html` |
| H8 | Carta › carro › despacho | Cliente | El campo `dirRef` ("Depto, block o referencia") no tiene `<label>`, solo placeholder, que desaparece al escribir. | JS: `dirRef lbl0`; `carta.html:90` | Media | Agregar una etiqueta visible o `aria-label`. | S | `public/carta.html:90` |
| H9 | Carta › carro | Cliente | Con el despacho no disponible, el botón dice "Despacho no disponible ahora", pero no explica hasta cuándo ni por qué. | Texto del carro en local, de noche | Baja | Agregar el motivo y la hora ("Despacho desde las 19:00" / "Fuera de horario"). | S | `public/carta.html` |
| H10 | Panel › Cambiar usuario | Caja | El botón "Cambiar usuario" mide 42 px, menos de los 44 px mínimos. | JS: único elemento < 44 px en el panel | Baja | Llevar `min-height` a 44 px. | S | `public/panel.html` |
| H11 | Carta › fotos | Cliente (3G) | Las fotos de producto miden 1000 a 1125 px de ancho (~35 KB cada una en webp) y se muestran en miniaturas de ~160 px. Son 31 imágenes, con `loading=lazy`. | JS `naturalWidth`; `data/img/1-seed-italiano.webp` pesa 34 KB | Baja | Generar una variante de 400 px al subir la foto y servirla con `srcset`. | M | `lib/` (subida de fotos), `carta.html` |

Lo que funciona bien (no requiere cambios): los mensajes de validación son claros y llevan `aria-invalid`; el foco se va al primer campo con error; hay `autocomplete` en nombre, teléfono y dirección; existen regiones `aria-live` para el toast y la cantidad; hay estados vacíos ("Nada por aquí") en las columnas de cocina; el aviso legal está junto al botón Enviar; el modo oscuro es coherente.

## 3. Victorias rápidas (< 30 min cada una)

1. H1: banner de "sonido apagado" y recordar la preferencia.
2. H5: unificar la pila de fuentes en `carta.css`, `cartel.html` y `legal.html`.
3. H6: borrar `estilo.css`.
4. H7 y H10: subir el `min-height` a 44 px.
5. H8: agregar la etiqueta a `dirRef`.
6. H4: agrandar `.paso` y `.acc`.
7. H9: mostrar el motivo del despacho no disponible.

## 4. Sistema visual propuesto (un solo `carta.css` para la carta, el panel y /admin)

- **Color:** `--bg #fbf6ee`, `--surface #fff`, `--surface-2 #f4ece0`, `--ink #1f1a17`, `--ink-2 #5c524a`, `--line #e8dccb`, `--brand` (color del local, por defecto `#c1121f`), `--ok #2f7d32`, `--warn #b26a00`, `--danger #b42318`, foco `--mustard #f2b33d`. Usar `--danger` solo en acciones destructivas.
- **Tipografía:** `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. Títulos en 800 con −0,02 em; texto en 16 px / 1,5; números con `tabular-nums`. Escala: 0,875 / 1 / 1,125 / 1,35 / 2 rem.
- **Espaciado:** 4 · 8 · 12 · 16 · 24 · 32.
- **Radios:** `--r-sm 10px` (botones e inputs), `--r 16px` (tarjetas), `--r-lg 22px` (hojas), `999px` (chips).
- **Botones:** primario (`--brand`), secundario (borde `--line`), fantasma y peligro (`--danger`, siempre separado). Alto mínimo de 44 px, 56 px en las vistas de cocina y caja. Foco de 3 px en mostaza.
- **Diálogos:** un único componente `<dialog>` de confirmación y un toast de error, en lugar de `alert` / `confirm` / `prompt`.

## 5. Lo que no se pudo probar

- **Completo:** el envío real del pedido, la confirmación, el seguimiento, la comanda de 80 mm y el aviso por WhatsApp; el cobro (efectivo, transferencia, venta rápida, folios, arqueo, cierre y reapertura); Gastos, Resultados, Despacho (mapa y tramos), Equipo, Usuarios y PIN, Tu plan y CSV; los primeros pasos en `/admin`; los impresos (carta, cartel, QR). Faltó tiempo de sesión. Quedan para una segunda pasada con pedidos de prueba en local.
- **Medición:** la red 3G limitada (el navegador integrado no expone throttling); el contraste AA medido (solo se revisó a ojo, en modo oscuro); el teclado del celular tapando campos, que requiere un dispositivo real.
- **Dispositivos:** cómo se ven las fuentes en Android e iOS reales (solo se revisó en Windows); la tablet vertical, porque el visor volvió a 1024 px y solo se revisó la horizontal.
- **Estados especiales:** la carta pausada, el local cerrado y un producto agotado.
