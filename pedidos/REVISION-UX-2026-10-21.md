# Revisión UI/UX — carta y panel (2026-10-21)

Hecha con los marcos `ui-ux-pro-max` (checklist de 10 prioridades) y `apple-design`
(estándar de Apple para Safari/iOS: materiales, gestos, reduce-motion, tipografía).
Objetivos: Chrome de gama baja (Nokia 3.1 Plus, ~411px) y iPhone/Safari.
Código en `public/`: `carta.html`, `carta.css`, `panel.html`, `panel*.js`.

## Veredicto

El código ya cumple casi todo lo crítico. No hay bugs de accesibilidad ni de táctil
graves. Lo que sigue son mejoras de alcance (iPhones viejos), rendimiento en gama
baja y pulido tipo Apple.

### Lo que ya está bien (verificado)
- **Táctil:** objetivos ≥ 44px en toda la carta y el panel (barra Cobrar 56px, pasos 60px,
  medios de pago 64px). `touch-action: manipulation` para matar el delay de 300ms.
- **iOS sin zoom:** todos los inputs a `font-size: 16px` (incluye montos de cobro y caja).
- **Teclado correcto:** `inputmode="numeric"` en montos, `type="tel"` + `inputmode="tel"` en celular.
- **Safe-area inferior:** `env(safe-area-inset-bottom)` en barras fijas y hojas.
- **Viewport dinámico:** `dvh` (92dvh en hojas, `calc(100dvh - 100px)` en el ticket), no `100vh`.
- **Reduce-motion:** reset global en `carta.css:239` y reglas específicas en el panel.
- **Dark mode:** `prefers-color-scheme: dark` con tokens, no colores invertidos.
- **Hover solo en punteros:** `@media (hover: hover)`, no depende de hover en táctil.
- **ARIA:** `aria-label` en inputs de dinero y acciones de la cartola.

## Hallazgos (orden por valor)

### 1. `<dialog>` / `showModal()` no existe en Safari < 15.4 — ALTA (alcance)
La carta y el panel abren casi todo con `<dialog>` + `showModal()` (producto, cobro,
promos). Safari lo soporta recién desde **iOS 15.4** (marzo 2022). Un iPhone en iOS 15.3
o anterior **no abre ninguna hoja**: el cliente no puede pedir. Es el mismo rango de
antigüedad que el `await` de nivel superior que ya arreglamos para Chrome.
- **Acción:** detectar `typeof HTMLDialogElement.prototype.showModal === 'function'` y cargar
  un polyfill liviano (o un fallback a overlay). Prioridad en la **carta**, que es la que vende.

### 2. Rendimiento en gama baja — MEDIA (observado en el Nokia)
Al scrollear o cambiar de pestaña en el panel, queda en blanco con spinner un instante
antes de re-renderizar. En 1,8 GB de RAM se nota. Probable causa: se arma `innerHTML`
grande de forma síncrona en cada vista.
- **Acción:** medir con el panel en el Nokia; si una lista pasa de ~50 filas, virtualizar
  o paginar; mostrar skeleton en vez de blanco mientras rinde (ui-ux §3 `progressive-loading`).

### 3. Safe-area superior (notch) al instalar como PWA — MEDIA (iPhone)
Está `viewport-fit=cover` pero no hay `safe-area-inset-top` en ningún lado. En Safari normal
no molesta (la barra del navegador cubre el notch), pero **instalado como app (standalone)**
en un iPhone con notch, la barra superior del panel (`position: sticky; top: 0`) queda
bajo el notch/Dynamic Island.
- **Acción:** sumar `padding-top: env(safe-area-inset-top)` a `.bar` del panel y al header de la carta.
  Para el terminal Nokia (Android, sin notch) no aplica; sí para clientes iPhone.

### 4. Hoja inferior sin deslizar-para-cerrar — BAJA (pulido Apple)
Las hojas (`dialog.sheet`) entran con transición CSS y se cierran solo por botón. En iOS lo
nativo es **arrastrar hacia abajo para cerrar**, con seguimiento 1:1 e interrumpible
(apple-design §3, §6). Hoy no se puede agarrar la hoja a mitad de camino.
- **Acción (opcional):** gesto de arrastre con `setPointerCapture`, resorte al soltar y
  proyección de velocidad. Es mejora de "feel", no bug.

### 5. Emojis decorativos — INFO
El pin del mapa (📍 34px) y los emojis de producto/categoría son emojis. Los íconos
**estructurales** (reloj, pin, teléfono, tienda) ya son SVG vía `ico()`, así que esto
es decorativo y aceptable. Solo tenerlo presente para consistencia entre plataformas.

### 6. Duración de transición del chip de categoría — TRIVIAL
El indicador de categoría usa `.45s`; la guía sugiere ≤ 400ms para micro-interacciones.
Bajar a `.3s` si se quiere alinear. Irrelevante en la práctica.

## Qué NO tocar
La base de tokens, el sistema táctil, los 16px de inputs y el manejo de safe-area inferior
están correctos. No reescribir la hoja de estilos: los cambios son quirúrgicos.
