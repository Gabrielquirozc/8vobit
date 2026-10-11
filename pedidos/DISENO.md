# Diseño de la carta pública

## Crítica del estado anterior

Revisado con la lista de prioridades de UI/UX (accesibilidad → interacción →
estilo → layout → tipografía → animación → formularios → navegación):

| # | Problema | Regla |
|---|---|---|
| 1 | Sin identidad: solo el texto "Gassuso". Sin logo, sin estado abierto/cerrado, sin horario ni Instagram. | Estilo / jerarquía |
| 2 | Sin imágenes. La comida se vende por la vista; 30 filas de texto iguales. | Estilo |
| 3 | Todo pesa lo mismo: no hay "más pedidos", ni ayuda para elegir. | Jerarquía visual |
| 4 | 30 botones naranjos "Agregar" compitiendo: ninguno es el principal. | Un CTA primario por pantalla |
| 5 | Productos sin precio en gris tenue ("Consultar"), bajo contraste y mezclados con los vendibles. | Contraste 4.5:1 |
| 6 | Sin búsqueda en una carta de 30+ productos. | Navegación |
| 7 | Modales centrados en vez de hojas inferiores; el selector de agregados no dice si es obligatorio ni cuántos faltan. | Patrón móvil / progressive disclosure |
| 8 | Checkout: un formulario largo, errores solo al final, sin foco en el campo con error. | Formularios |
| 9 | Fuente del sistema, sin escala tipográfica; precios sin cifras tabulares. | Tipografía |
| 10 | Sin modo oscuro, sin `prefers-reduced-motion`, sin `aria-live` en el aviso. | Accesibilidad |

## Estado deseado (implementado)

Patrón de las apps de delivery que el cliente ya conoce (Uber Eats, PedidosYa,
Rappi), con la identidad de un local de completos:

- **Portada** con logo, tipo de local, estado *Abierto · cierra 00:15* (calculado
  del horario), "Retiro sin fila" e Instagram.
- **Barra fija** con búsqueda (sin tildes: "aleman" encuentra "Alemán") y pestañas
  de categoría que siguen el scroll.
- **Los más pedidos**: carrusel con *scroll-snap*. Se calcula con las ventas reales
  de 30 días; mientras no haya, usa los destacados del seed.
- **Lista agrupada** por categoría: nombre, ingredientes (2 líneas máx.), precio,
  etiquetas ("Elige 2 ingredientes", "Vegano") y miniatura con "+". Toda la fila
  es el botón (44 px+). Los sin precio van al final con una etiqueta legible.
- **Hoja de producto** (bottom sheet): imagen, descripción, grupo obligatorio con
  contador *0/2 → Listo*, cantidad y botón con el total.
- **Checkout en una hoja**: líneas con stepper, Retiro/Despacho, horario, datos con
  validación al salir del campo y foco en el primer error, aviso de pago.
- **Confirmación** con número grande y botón de WhatsApp.
- Paleta "completo": crema, carbón, mostaza y rojo ketchup; modo oscuro; tokens
  semánticos; Bricolage Grotesque (títulos) + Inter (texto); íconos SVG trazo 2px.

## Librerías evaluadas

Restricciones: sin build, servidor con 128 MB, clientes que abren el link desde
Instagram/WhatsApp (webviews) en Android de gama baja.

| Opción | Qué aporta | Decisión |
|---|---|---|
| Tailwind (CDN) | Utilidades rápidas | No: el CDN de Tailwind no es para producción y sin build no hay purga |
| Pico.css / Water.css | Estilos base sin clases | No: dan look de formulario genérico, justo lo que queremos dejar |
| Shoelace / Web Awesome | Componentes web (drawer, dialog) | No por ahora: ~100 KB para lo que `<dialog>` nativo ya hace |
| Swiper | Carruseles | No: `scroll-snap` de CSS hace lo mismo con 0 KB |
| Open Props | Tokens de diseño | Se adoptó la idea (tokens propios en `:root`), no la dependencia |
| Lucide | Íconos | Sí, como `<symbol>` SVG en línea (sin CDN) |
| Google Fonts | Tipografía | Sí, con `display=swap` y respaldo del sistema |

Resultado: CSS propio de ~10 KB, cero JS de terceros.

## Siguiente paso de mayor impacto: fotos

Las ilustraciones por categoría son un reemplazo digno, pero **la foto real de cada
plato es lo que más vende**. Panel → *Carta y precios* → *Subir foto* en cada
producto: el navegador la recorta a 4:3, la achica a 1000 × 750 y la convierte a
WebP (<600 KB) antes de subirla; queda en el volumen `/data/img` con caché larga.

Fuentes válidas: fotos que el dueño tenga (si las tomó él, son suyas) o una sesión
en la visita (luz natural, fondo neutro, misma toma para todos). **No** se extraen
de Uber Eats: bloquea el acceso automatizado y parte de esas fotos son de Uber.

Pendiente también: aplicar la misma línea visual al panel del local (hoy usa emojis
como íconos).
