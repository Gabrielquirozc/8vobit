---
name: canva-posts
description: Reglas de diseño para crear o editar publicaciones de Instagram en Canva para 8vobit y resuelve.cl (tamaños de letra, márgenes, espaciado y disposición). Úsala siempre antes de generate-design, edit-design o copy-design de una pieza para redes, y para revisar una pieza antes de guardarla.
---

# Publicaciones en Canva sin errores de tamaño ni de disposición

Los errores que ya pasaron y que esta skill evita:
- Pie de página a 17 px y descripciones a 21 px: no se leen en el celular.
- Titular que choca con la imagen o que corta "30 / %" en dos líneas.
- Textos de ancho fijo angosto que parten frases en tres líneas.
- Reusar las fotos viejas y frases flojas como "cotiza gratis".
- Poner el enlace "8vobit.xyz" en el afiche.

## 1. Lienzo y retícula

- Formato por defecto: **1080 × 1350** (4:5). Las historias van en 1080 × 1920.
- **Margen de seguridad: 96 px** por lado. Nada de texto fuera de x 96–984, y 96–1254.
  En historias, deja libres además los 220 px de arriba y los 260 px de abajo (ahí van los botones de Instagram).
- Todo se alinea a una **retícula de 8 px**: posiciones, anchos y separaciones múltiplos de 8.
- Un solo eje de alineación por pieza: todo a la izquierda (x = 96) o todo centrado. No se mezclan.

## 2. Escala tipográfica (en un lienzo de 1080 px de ancho)

| Nivel | Tamaño | Peso | Interlineado | Uso |
|---|---|---|---|---|
| Titular | **96–128 px** | Extra negrita | 1.0–1.1 | 2 a 4 líneas, máximo 6 palabras por línea |
| Dato destacado | 72–96 px | Negrita | 1.0 | Precio o cifra ("Desde $15.000", "1 %") |
| Subtítulo | **40–48 px** | Regular o medio | 1.25 | Una o dos líneas |
| Cuerpo y viñetas | **32–36 px** | Regular | 1.3 | Máximo 3 viñetas, 1 línea cada una idealmente |
| Etiqueta o rótulo | 26–28 px | Semi negrita, mayúsculas, interletrado +0.08 | 1.2 | Categoría ("SERVICIO TÉCNICO") |
| Pie (dirección, CTA) | **28 px mínimo** | Semi negrita | 1.2 | Una sola línea |

Reglas duras:
- **Nada bajo 26 px.** Si no cabe a 26 px, sobra texto: se corta el texto, no la letra.
- Entre un nivel y el siguiente debe haber al menos 1,4 veces de diferencia (titular 112 → subtítulo 44 → cuerpo 34).
- Máximo **3 niveles de tamaño** por pieza, más el pie.
- Máximo **2 familias tipográficas**.
- Máximo **35 palabras** en total por pieza (sin contar el pie). Lo demás va en el texto de la publicación.

## 3. Espaciado vertical

- Titular → subtítulo: 32–48 px.
- Subtítulo → bloque de viñetas: 64–80 px.
- Entre viñetas: 24–32 px.
- Bloque de contenido → pie: al menos 80 px.
- Cualquier imagen y texto: al menos **48 px de aire**. Nunca se superponen, salvo que el texto vaya sobre una zona plana con contraste ≥ 4.5:1.

## 4. Saltos de línea

- Usar espacio no separable (` `) entre una cifra y su unidad o símbolo: `30 %`, `$19.900 + IVA`, `1 %`.
- También en las frases cortas que no deben partirse: `a las apps`.
- En los titulares, forzar los saltos con `\n` donde se lee mejor, no dejarlos al ancho de la caja.
- Las cajas de texto ocupan el ancho útil completo (888 px = 1080 − 2 × 96), salvo en diseños a dos columnas (cada columna de 420 px con 48 px de separación).
- Al cambiar el texto de una caja, **redimensionar el ancho** (`resize_element`) y volver a revisar la altura en el documento devuelto.

## 5. Disposición

- Jerarquía de arriba hacia abajo: marca pequeña (opcional) → titular → apoyo (imagen o viñetas) → dato o CTA → pie.
- La imagen principal ocupa entre el 35 % y el 50 % del lienzo. Tiene que ser propia del tema (local de comida, celular con la carta, componentes, taller). **No reusar las fotos de notebook de la plantilla antigua.**
- Un solo punto focal por pieza. Si hay foto potente, el texto se reduce a titular + una línea.
- Una sola llamada a la acción, al final: "Agenda por DM", "Pide una demo por DM", "Freire 1458, Concepción".
- **No poner URLs en la pieza** (ni 8vobit.xyz ni otras). El enlace va en la bio.
- Prohibido: "cotiza gratis", "precios increíbles", signos de exclamación en cadena y emojis dentro de la pieza.

## 6. Paleta

| Marca | Fondo | Acento | Texto |
|---|---|---|---|
| 8vobit | #120136 (morado profundo) | #40bad5 (cian) | #ffffff, y #cbd5e1 para el texto secundario |
| resuelve.cl | Un color plano por área: azul noche (datos o deudas), turquesa (propiedades), naranjo (laboral), burdeo (familia) | Blanco | Blanco |

Solo un color de acento por pieza, y únicamente para la palabra o cifra clave.

## 7. Flujo de trabajo obligatorio

1. **Antes de generar**: escribir el texto final de cada pieza (titular, subtítulo, viñetas, CTA) y contar las palabras. Si pasa de 35, recortar.
2. **Generar** con `generate-design` (instagram_post) y una consulta que incluya: los textos exactos, la paleta en hexadecimal, "sin URLs", "sin fotos de notebook", el estilo ("moderno, premium, mucho aire") y la imagen pedida.
3. **Revisar cada candidato** (`create-design-from-candidate` + `read-design` con thumbnails) y descartar los que tengan texto inventado o mal escrito (por ejemplo "3° GJOT" o "botines").
4. **Abrir una transacción** y leer `design_content`. Revisar los tamaños de letra contra la tabla de la sección 2 y corregir con `format_text` (font_size) todo lo que esté bajo el mínimo.
5. Corregir anchos (`resize_element`) y posiciones (`position_element`) según las secciones 1, 3 y 4.
   Cada vez que se agranda una letra, la caja crece hacia abajo. Hay que calcular `top + height` de cada texto en el documento devuelto y comprobar que queden **al menos 48 px** antes del `top` del siguiente elemento. Si no alcanza, se sube el bloque de arriba (marca, titular) o se baja el de abajo, sin pasar el margen de 96 px.
6. **Verificar en la miniatura devuelta**:
   - [ ] ¿Algún texto bajo 26 px?
   - [ ] ¿Algo fuera del margen de 96 px?
   - [ ] ¿Algún texto encima de una imagen sin contraste?
   - [ ] ¿Alguna cifra separada de su símbolo?
   - [ ] ¿Algún texto mal escrito o inventado por la IA?
   - [ ] ¿Una sola CTA y sin URL?
7. Mostrar la miniatura al usuario (SendUserFile) y **guardar (`commit`) solo cuando apruebe**.

## 8. Producción en serie (calendario)

- Cada serie usa **un mismo diseño base** aprobado: se copia (`copy-design`) y solo cambian los textos y la imagen. Así la grilla se ve coherente.
- Las series se nombran en Canva como `8VB · AAAA-MM-DD · tema` o `RES · AAAA-MM-DD · tema`, para encontrarlas.
- Antes de producir una serie, validar la primera pieza con el usuario. Las siguientes repiten la estructura.
