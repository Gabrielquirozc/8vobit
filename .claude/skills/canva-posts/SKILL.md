---
name: canva-posts
description: Diseñador de marca para las redes de 8vobit y resuelve.cl. Úsala siempre antes de crear, editar o revisar una publicación o un carrusel en Canva (generate-design, copy-design, edit-design) y al planificar contenido. Fija el proceso, el sistema visual (tipografía, color, retícula, imágenes reales) y la revisión de calidad.
---

# Diseñar como agencia: carruseles para 8vobit y resuelve.cl

Datos oficiales del manual de marca de 8vobit: cian `#40BAD5`, morado `#120136`, logo en Clio y textos en Montserrat. El logo real se usa en la portada y en el cierre (versión original sobre morado).

Antes de nada, lee:
- `marketing/MARCA-8VOBIT.md`: el sistema de marca (color, tipografía, retícula, tipos de lámina, imágenes). **Manda sobre esta skill.**
- `marketing/ESTRATEGIA-CONTENIDO.md`: pilares, embudo y objetivo de cada pieza.
- `marketing/CALENDARIO-*.md`: qué toca publicar.

Errores que ya cometimos y que esta skill existe para evitar:
1. Letras de 17–21 px que no se leen en el celular.
2. Reusar las fotos de notebook de la plantilla vieja.
3. Frases flojas ("cotiza gratis") y la URL dentro de la pieza.
4. El titular chocando con los íconos después de agrandar la letra.
5. Mockups con una app inventada en vez de la nuestra.
6. Diseños con buena pinta pero sin objetivo: bonitos, pero no venden.

## Paso 0. Brief: sin brief no se diseña

Para cada carrusel, escribir esto antes de abrir Canva:

```
Pieza:        (fecha · cuenta · serie)
Objetivo:     alcance | guardados | envíos | mensajes (DM)    ← uno solo
Etapa:        descubrir | considerar | decidir
Público:      (uno de los tres de MARCA §1)
Gancho:       (6–9 palabras; problema, cifra o promesa)
Láminas:      (lista de 5–8 con tipo de MARCA §7 y texto final)
Prueba:       (qué captura o foto real se usa)
CTA:          (una sola acción, coherente con el objetivo)
Métrica:      (cómo sabremos si funcionó)
```

Reglas del texto:
- Una idea por lámina. Titular máximo de 9 palabras; cuerpo máximo de 25 palabras.
- La portada promete y las láminas cumplen. La última pide una sola cosa.
- La CTA sigue al objetivo: si buscamos guardados, "Guárdalo para cuando lo necesites"; si buscamos envíos, "Envíaselo a quien tenga un local"; si buscamos mensajes, "Escríbenos por DM con la palabra DEMO".
- Cifras con espacio no separable: `30 %`, `$19.900 + IVA`.

## Paso 1. Imagen real primero

- Si la pieza habla de Pedidos, usar las capturas de `marketing/capturas/` (son de la app real). Si faltan datos o la pantalla sale vacía, **no se diseña con una pantalla vacía**: se pide cargar datos de demostración y se captura de nuevo con el servidor local (`preview_start pedidos`, local `gassuso`, la clave de prueba de `.claude/launch.json`).
- Si habla del taller, pedirle al dueño fotos reales (lista en el calendario) o usar macros propios.
- Para subir una imagen a Canva: `create-upload-url` o `upload-asset-from-url`, y después `insert_fill` o `update_fill`.
- Si no hay imagen real, la lámina se resuelve con tipografía y una cifra, no con stock.

## Paso 2. Construir

**Camino preferido:** copiar el diseño base de la serie (`copy-design`) y cambiar solo textos e imágenes. Las bases están en la tabla de series del calendario.

**Si la base no existe:** crearla una vez, con mucho cuidado, y que el usuario la apruebe antes de producir la serie:
1. `generate-design` (instagram_post) con una consulta que incluya: paleta en hexadecimal (MARCA §2), "Space Grotesk para titulares, Inter para el cuerpo", "fondo #0B0820 casi negro", "mucho espacio negativo, composición editorial y alineada a la izquierda", el texto exacto, "sin URLs, sin fotos de stock, sin interfaces inventadas" y el tipo de lámina.
2. Revisar los 4 candidatos (`create-design-from-candidate` + `read-design` con thumbnails). Descartar los que traigan texto inventado o mal escrito.
3. Tomar el mejor y **corregirlo a mano** con `edit-design` contra MARCA §3 y §6:
   - `format_text` → tamaños, pesos y color.
   - `resize_element` → ancho de los textos (888 px, o 420 por columna).
   - `position_element` → x = 96, etiqueta en y = 96, pie en y = 1206.
4. Para un carrusel: `add_page` (1080×1350, fondo `#0B0820`) y repetir la estructura en cada lámina.

## Paso 3. Revisión de calidad (obligatoria, lámina por lámina)

Con el `document` devuelto por `edit-design`, revisar:

**Tamaños y texto**
- [ ] Ningún texto bajo 26 px. Titular de lámina ≥ 80 px y de portada ≥ 112 px.
- [ ] Máximo 3 tamaños y 2–3 fuentes del sistema (Space Grotesk, Inter, JetBrains Mono).
- [ ] Sin palabras inventadas ni faltas de ortografía. Leer cada texto letra por letra.
- [ ] Ninguna cifra separada de su símbolo. Ningún titular con una palabra sola en la última línea.

**Disposición**
- [ ] Todo dentro de x 96–984 e y 96–1254.
- [ ] Para cada texto, `top + height` + 48 ≤ `top` del elemento siguiente. Agrandar una letra hace crecer la caja hacia abajo: siempre recalcular.
- [ ] Etiqueta, titular y pie en la misma posición en todas las láminas.
- [ ] Una sola alineación (izquierda), salvo la portada o el cierre.

**Color e imagen**
- [ ] Acento cian en una sola palabra o cifra por lámina.
- [ ] Contraste suficiente (nada de cian sobre hueso).
- [ ] La imagen es real (nuestra app, nuestro taller) y está nítida.

**Mensaje**
- [ ] La portada se entiende en 1 segundo sin leer el resto.
- [ ] Hay una CTA, coherente con el objetivo del brief, y no hay URL.

Recién entonces: mostrar las miniaturas al usuario (SendUserFile) y hacer `commit` **solo con su aprobación**.

## Paso 4. Entregar

- Nombre en Canva: `8VB · 2026-11-03 · gancho-corto` o `RES · …`.
- Anotar en el calendario el ID de Canva de la pieza y el estado: borrador, aprobado o publicado.
- Escribir el texto de la publicación: la primera línea repite el gancho; luego 3–5 líneas de valor, la CTA y 3–5 hashtags locales (#Concepcion #ServicioTecnicoConcepcion…).
