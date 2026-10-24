# Control Técnico · OctavoBit

## Flujo del taller

En móvil la cabecera, navegación y franja de métricas reducen su espaciado; los controles mantienen objetivos táctiles de 44 px. A 390×844 la primera etapa comienza aproximadamente en y700, visible en la primera pantalla junto con la pista de desplazamiento.

La primera vista es un tablero operativo: Cotizar (cotizando y esperando_anticipo), Pieza en camino (pieza_pedida), En taller (pieza_recibida y reparando) y Listo (listo). Cuatro columnas en escritorio, dos en tablet y recorrido horizontal con scroll-snap y pista visible en móvil. Los conteos reflejan el filtro de búsqueda; las métricas superiores conservan los totales reales. Entregadas y canceladas permanecen en Archivo del taller, plegable y también buscable.

Tarjetas con OT, equipo, cliente, estado exacto, servicio, total y próximo paso orientativo según estado. Gestionar orden despliega antecedentes, costos y formulario completo de Estado/DTE; guardar es una acción explícita. No hay arrastre ni cambios de estado implícitos. La búsqueda conserva las tarjetas desplegadas mientras siguen presentes. Cabecera compacta, métricas en una franja y tres accesos a cotización, caja y mes permiten ver el flujo pronto. Las etapas usan lavanda, ámbar, cian y verde apagados; el morado OctavoBit y el isotipo oficial en navegación mantienen la identidad.

## Cotización guiada y referencia visual

La consola adopta el estilo oscuro de `pedidos/public/admin.html`: fondo morado, superficies elevadas, acciones cian y botones redondeados. Los estados del tablero conservan acentos suaves sobre superficies oscuras. El isotipo oficial y las fuentes locales permanecen disponibles.

Nueva cotización tiene tres pestañas accesibles: Cliente y equipo, Servicio y pieza, Revisar precio. Selección con teclado (flechas, Inicio/Fin), controles de 44 px y valores conservados al cambiar de paso. Se puede recuperar explícitamente el cliente, contacto y equipo de una orden anterior; no se copian los costos antiguos. Los servicios frecuentes son accesos al catálogo real; el selector completo mantiene todos los servicios. Contacto, cita, proveedor y notas se despliegan cuando se requieren. Para Sin pieza se omiten los campos de costo del envío sin borrar lo escrito; para piezas se muestra compra y se despliegan flete, tributos y ajustes. El resumen usa el cálculo vigente de `/api/cotizar`. Al guardar se valida todo el formulario y se abre el paso y detalle del primer campo inválido. La referencia de agenda sigue siendo manual.

Aura DESIGN. Fuentes: `pedidos/public/admin.html`, marketing/MARCA-8VOBIT.md e ISOTIPO.png.

## Tokens

| Rol | Valor |
|---|---|
| Acciones | #4BB8D4, texto #120136 |
| Acento sobre morado | #7DD4E8 |
| Fondo | #120136 |
| Superficie | #1E0258, elevada #2A0375 |
| Texto | #F4F0FF |
| Texto secundario | #B6A7CE |
| Texto sobre morado | #D8D0E8 |
| Borde | #3A1590 |
| Foco | #7DD4E8 |
| Error | #FF8A7A sobre #3A1D35 |

Montserrat / Segoe UI / sans-serif en interfaz. JetBrains Mono / Consolas / monospace en etiquetas y cifras. Fuentes WOFF2 servidas localmente desde public/fonts, obtenidas de los repositorios oficiales JulietaUla/Montserrat y JetBrains/JetBrainsMono, con sus licencias OFL incluidas. Montserrat: Regular, Medium, SemiBold y Bold; JetBrains Mono: Regular, Medium y SemiBold. @font-face con font-display:swap y rutas allowlisted del mismo origen; CSP font-src 'self'. No se hacen conexiones externas en tiempo de uso. Isotipo oficial servido desde el mismo origen.

Espaciado: 4, 8, 12, 16, 20, 24, 32, 40 px. Radios: controles 8 px, tarjetas 14 px, presentación 18 px. Navegación lateral de 250 px en escritorio y cuadrícula 2×2 en móvil (hasta 750 px), con etiquetas completas y controles de al menos 44 px. Inicio con métricas, accesos rápidos y órdenes. Formularios de dos columnas, una en móvil. Tablas con desplazamiento propio.

Métricas reales de /api/datos: en curso excluye listo, entregado y cancelado; esperando pieza cuenta pieza_pedida; listos cuenta listo; citas vinculadas cuenta agenda_id. Los grupos pueden superponerse. No se afirma sincronización automática con agenda ni período temporal.

Accesibilidad: texto con contraste AA, cian reservado a fondos oscuros o botones con texto morado; controles de al menos 44 px, foco visible de 3 px, enlace para saltar contenido, aria-current y respeto a prefers-reduced-motion. No se alteran cálculos, endpoints ni esquema.
