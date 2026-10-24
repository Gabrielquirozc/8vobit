# Control Técnico · OctavoBit

## Flujo del taller

En móvil la cabecera, navegación y franja de métricas reducen su espaciado; los controles mantienen objetivos táctiles de 44 px. A 390×844 la primera etapa comienza aproximadamente en y700, visible en la primera pantalla junto con la pista de desplazamiento.

La primera vista es un tablero operativo: Cotizar (cotizando y esperando_anticipo), Pieza en camino (pieza_pedida), En taller (pieza_recibida y reparando) y Listo (listo). Cuatro columnas en escritorio, dos en tablet y recorrido horizontal con scroll-snap y pista visible en móvil. Los conteos reflejan el filtro de búsqueda; las métricas superiores conservan los totales reales. Entregadas y canceladas permanecen en Archivo del taller, plegable y también buscable.

Tarjetas con OT, equipo, cliente, estado exacto, servicio, total y próximo paso orientativo según estado. Gestionar orden despliega antecedentes, costos y formulario completo de Estado/DTE; guardar es una acción explícita. No hay arrastre ni cambios de estado implícitos. La búsqueda conserva las tarjetas desplegadas mientras siguen presentes. Cabecera compacta, métricas en una franja y tres accesos a cotización, caja y mes permiten ver el flujo pronto. Las etapas usan lavanda, ámbar, cian y verde apagados; el morado OctavoBit y el isotipo oficial en navegación mantienen la identidad.

Aura DESIGN. Fuente oficial: marketing/MARCA-8VOBIT.md e ISOTIPO.png.

## Tokens

| Rol | Valor |
|---|---|
| Marca y acciones | #120136 |
| Acento sobre morado | #40BAD5 |
| Fondo | #F5F4F8 |
| Superficie | #FFFFFF |
| Texto | #241A3D |
| Texto secundario | #655E75 |
| Texto sobre morado | #D8D0E8 |
| Borde | #E1DDEA |
| Foco | #087C96 |
| Error | #9D2D34 sobre #FFF0F0 |

Montserrat / Segoe UI / sans-serif en interfaz. JetBrains Mono / Consolas / monospace en etiquetas y cifras. Fuentes WOFF2 servidas localmente desde public/fonts, obtenidas de los repositorios oficiales JulietaUla/Montserrat y JetBrains/JetBrainsMono, con sus licencias OFL incluidas. Montserrat: Regular, Medium, SemiBold y Bold; JetBrains Mono: Regular, Medium y SemiBold. @font-face con font-display:swap y rutas allowlisted del mismo origen; CSP font-src 'self'. No se hacen conexiones externas en tiempo de uso. Isotipo oficial servido desde el mismo origen.

Espaciado: 4, 8, 12, 16, 20, 24, 32, 40 px. Radios: controles 8 px, tarjetas 14 px, presentación 18 px. Navegación lateral de 250 px en escritorio y cuadrícula 2×2 en móvil (hasta 750 px), con etiquetas completas y controles de al menos 44 px. Inicio con métricas, accesos rápidos y órdenes. Formularios de dos columnas, una en móvil. Tablas con desplazamiento propio.

Métricas reales de /api/datos: en curso excluye listo, entregado y cancelado; esperando pieza cuenta pieza_pedida; listos cuenta listo; citas vinculadas cuenta agenda_id. Los grupos pueden superponerse. No se afirma sincronización automática con agenda ni período temporal.

Accesibilidad: texto con contraste AA, cian reservado a fondos oscuros o botones con texto morado; controles de al menos 44 px, foco visible de 3 px, enlace para saltar contenido, aria-current y respeto a prefers-reduced-motion. No se alteran cálculos, endpoints ni esquema.
