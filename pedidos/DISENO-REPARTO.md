# Reparto: acceso del repartidor, salidas, cobro y rendición

Diseño del 2026-11-13. **Aún no se programa.** Parte de "Armar salida" (ESTUDIO-UX §6 bis, ya hecho:
`public/ruta.js`) y lo convierte en una función del producto 8vobit Pedidos para todos los locales.

## Decisiones tomadas con el dueño (2026-11-13)

| Pregunta | Decisión |
|---|---|
| ¿Quién arma la salida? | **Las dos formas:** el repartidor elige sus pedidos y el dueño o encargado puede asignarlos o corregirlos. |
| ¿El repartidor cobra? | **Sí.** Recibe efectivo, transferencia o tarjeta al entregar y luego rinde en caja. |
| ¿Repartidores propios o compartidos? | **Propios del local.** Nada de "tipo Uber" entre locales por ahora. |
| ¿En qué plan va? | **Aprobado el 2026-11-13:** la propuesta de §7, sin adicional para Canal. |

Sin integración con apps externas: PedidosYa, Uber Eats y Rappi traen sus propios repartidores y quedan fuera.

## 1. Qué problema resuelve

Hoy el repartidor depende de que el local le diga qué llevar y a dónde. No sabe qué está por salir de
cocina ni a qué hora vence cada franja, y el local no sabe dónde va. El cliente llama preguntando por su
pedido. El efectivo que trae el repartidor se cuadra de memoria.

Con esta función, el repartidor ve en su teléfono solo los despachos y decide con información (esperar
3 minutos para llevar dos juntos o salir ya). El local ve en qué parada va cada repartidor. El cliente ve
"va en camino, eres la parada 2" y el efectivo se rinde contra lo que dice el sistema.

## 2. Acceso del repartidor

Hoy el PIN funciona solo en la tablet del local (`lib/usuarios.mjs`), que queda asociada cuando entra el
dueño. El repartidor usa **su propio teléfono en la calle**, así que necesita otra entrada.

**Dar acceso (lo hace el dueño, una vez):**
1. En Equipo, en la ficha del repartidor (que ya existe, con su vehículo), toca **"Dar acceso al teléfono"**.
2. El panel muestra un QR y un botón "Enviar por WhatsApp" con un enlace de un solo uso que vence en 24 h.
3. El repartidor lo abre en su teléfono, crea un PIN de 4 a 6 dígitos y el teléfono queda asociado a él.
   Se ofrece "Agregar a la pantalla de inicio" (la misma PWA del panel, entrando a `/reparto`).

**Entrar cada día:** abre el ícono y escribe su PIN. La sesión dura el turno (por ejemplo, 12 h).

**Quitar acceso:** "Quitar acceso" en la ficha, o desactivar al repartidor. El teléfono deja de entrar al
instante. Si cambia de teléfono, el dueño genera otro enlace y el anterior queda sin efecto.

**Seguridad** (reglas del proyecto):
- El enlace lleva un token aleatorio (`crypto.randomBytes`), se guarda solo su hash y sirve una vez.
- El teléfono queda asociado con una cookie httpOnly, `secure` y `sameSite: strict`. Nada en localStorage.
- El PIN se guarda con scrypt (como hoy) y se bloquea tras varios intentos fallidos.
- Toda ruta de reparto revisa que el pedido sea del local **y**, cuando corresponde, de ese repartidor: si
  no hay sesión responde 401, y si el pedido es de otro repartidor o local, 403.
- Las respuestas llevan solo lo necesario: dirección, teléfono, franja, total y si está pagado. Sin
  productos de la carta, caja, sueldos ni datos de otros repartidores.

**Rol nuevo, fuera de la escalera de niveles.** Los roles de hoy (`cocina` 1 → `dueno` 4) heredan
permisos hacia arriba. El repartidor **no** encaja ahí, porque no debe ver todos los pedidos ni la caja.
Se agrega como rol aparte, con permisos propios: `reparto_ver`, `reparto_tomar`, `reparto_entregar` y
`reparto_cobrar`.

## 3. Pantalla del repartidor (`/reparto`)

Pensada para el teléfono, con una mano y en la calle: botones de 56 px o más, letra grande y modo oscuro.

**Pestaña 1 · Por salir**
- Despachos en cocina o listos, ordenados por la hora en que vence la franja.
- Arriba van **"Míos"** (asignados a él). Debajo, **"Sin repartidor"**, con un botón "Lo llevo yo".
- Cada pedido muestra el número, la comuna o el sector, la franja, "en cocina" o "listo", y si va pagado
  o hay que cobrar.
- No ve los pedidos asignados a otro repartidor.

**Pestaña 2 · Mi salida** (es "Armar salida", ya hecho, en versión teléfono)
- Marca lo que lleva y el sistema le da el orden: lista numerada con Waze, Llamar y ruta completa en Maps.
- Botón **"Salí"**: los pedidos pasan a *en camino* y queda registrada la hora de salida.
- En cada parada:
  - **"Entregado"**. Si había que cobrar, pregunta cómo pagó: efectivo (con "pagó con $…", para calcular
    el vuelto), transferencia o tarjeta. Si el cliente agrega propina, se registra (la caja ya la maneja).
  - **"No pude entregar"**, con motivo (no estaba, no contesta, dirección mala, rechazó). El pedido vuelve
    al local como *devuelto* y el dueño decide qué hacer.
- Cuando todas las paradas quedan resueltas, aparece **"Volví al local"**.

**Pestaña 3 · Mi efectivo**
- Lo que trae en la mano en este momento: el fondo de cambio que le dieron más el efectivo cobrado.
- Detalle por pedido. Es lo que debe entregar en caja.

## 4. Lo que ve el local (panel del dueño y caja)

- **Pedidos:** cada despacho muestra su estado de reparto ("Juan · salió 21:05 · parada 2 de 3"). La
  columna "Listos" se divide en *por salir* y *en camino*.
- **Asignar:** el selector de repartidor que ya existe en cada tarjeta. Si el dueño cambia el repartidor
  de un pedido que otro ya tomó, a ese repartidor le aparece el aviso "Te quitaron el #45".
- **Armar salida** (ya hecho) le sirve al dueño para dejar la salida armada. El repartidor la ve en
  "Mi salida" lista para tocar "Salí".
- **Conflictos:** si dos personas toman el mismo pedido, gana la primera y la segunda recibe "Ya lo tomó
  Pedro". El dueño siempre puede reasignar, salvo que el pedido ya esté *en camino*: en ese caso primero
  hay que marcarlo como devuelto.

## 5. Cobro y rendición

Es lo que más cuidado necesita, porque se mueve plata.

- **Fondo de cambio:** al salir, caja puede entregarle sencillo, por ejemplo $10.000. Queda registrado como
  salida de caja *hacia el repartidor*, no como gasto.
- **Al cobrar:** el pago queda en el pedido (medio, monto, vuelto y propina) con el usuario que cobró.
  El efectivo **no entra a la caja todavía**: queda "en mano de Juan".
- **Rendición** (al volver o al final del turno, la hace caja o el dueño):
  - El sistema muestra cuánto debería entregar: fondo + efectivo cobrado.
  - Caja anota lo que recibió. Si hay diferencia, pide una nota sobre el umbral que ya existe
    (`UMBRAL_NOTA`, $5.000).
  - Recién ahí el efectivo entra a la caja del día, como un solo movimiento "Rendición de Juan", y el
    arqueo cuadra.
- **Transferencias:** el repartidor marca "transferencia" al entregar. Caja la confirma contra la cuenta
  bancaria, igual que hoy con los pedidos pagados por transferencia.
- **Tarjeta en la puerta:** solo si el local tiene un POS móvil. Se registra el medio "tarjeta" y el
  repartidor no trae nada en efectivo por ese pedido.
- **Pago online:** en los pedidos pagados en la carta (Flow o Mercado Pago, en desarrollo en otra rama), el
  repartidor ve "PAGADO" y no cobra.
- **Si el repartidor no rinde:** la caja del día queda con "Pendiente de rendir: $X de Juan" y no se
  puede cerrar sin rendir o sin dejarlo anotado.

## 6. Lo que ve el cliente (seguimiento)

- *En camino* (con hora de salida): "Tu pedido va en camino con Juan. Eres la parada 2 de 3. Llega
  cerca de las 21:20". Solo el nombre de pila del repartidor, sin su teléfono.
- La hora estimada sale del mismo cálculo de `ruta.js` (línea recta × factor de calles, velocidad del
  vehículo). Se muestra como "cerca de", nunca como una hora exacta.
- *Entregado:* gracias y cupón de vuelta, si el local lo tiene activo.
- **Sin GPS en vivo** en esta etapa: gasta batería, exige permisos y abre un tema de privacidad del
  trabajador. Queda para más adelante si los clientes lo piden.

## 7. Planes (aprobados el 2026-11-13)

Hoy (`lib/licencias.mjs`): Canal $19.900 (2 usuarios, sin Equipo), Gestión $34.900 (con Equipo y
costeo de despacho por vehículo) y Pro $54.900. La ficha del repartidor vive en **Equipo**, que es de Gestión.

| | **Canal** | **Gestión** | **Pro** |
|---|---|---|---|
| Armar salida en el panel: orden, Waze, Maps y hoja de ruta 80 mm | ✅ | ✅ | ✅ |
| Repartidor asignado por pedido | ✅ | ✅ | ✅ |
| **Acceso del repartidor en su teléfono** (por salir, mi salida, entregar) | — | ✅ | ✅ |
| **Cobro por el repartidor, fondo de cambio y rendición en caja** | — | ✅ | ✅ |
| **Seguimiento "en camino, parada N"** para el cliente | — | ✅ | ✅ |
| Historial por repartidor: entregas, a tiempo o atrasadas, km, efectivo rendido | — | — | ✅ |
| Repartidores compartidos entre los locales de la misma cuenta | — | — | ✅ |

**Por qué así:**
- **Canal** conserva lo que ya está hecho, que no cuesta nada mantener y le muestra al local el valor
  del orden de entrega. El salto natural es "dale el acceso a tu repartidor", que lleva a Gestión.
- **Gestión** es el plan que compite con Fudo *Avanzado + Tu Delivery* (≈ $44.000 + 1,9 %). Con el acceso
  del repartidor, el cobro y la rendición, la comparación queda clara a nuestro favor.
- **Pro** suma lo que sirve a quien tiene varios repartidores o locales: métricas y repartidores compartidos.
- **Los repartidores no cuentan como usuarios del límite** (Canal tiene 2). Así nadie tiene que elegir
  entre darle acceso al cajero o al repartidor.

**Alternativa, si se quiere vender a Canal:** un adicional **"Reparto" a $5.900/mes** que activa las filas
de Gestión en Canal. Es más ingreso, pero complica la oferta. Recomiendo partir sin adicional y medir.

**Decidido (2026-11-13, el dueño aprobó la propuesta):**
1. Acceso del repartidor, cobro con rendición y seguimiento "en camino" van en **Gestión y Pro**. Canal
   se queda con Armar salida en el panel.
2. Repartidores **ilimitados** en Gestión y Pro, y **no cuentan** en el límite de usuarios del plan.
3. **Sin adicional** "Reparto" para Canal por ahora. Se revisa si varios locales Canal lo piden.

En código (etapa 5): una función `reparto` en `gestion` y `pro` (`lib/licencias.mjs`), y otra
`reparto_historial` solo en `pro`.

## 8. Datos (borrador)

- `usuarios`: rol `repartidor`, `trabajador_id` (enlace a la ficha de Equipo).
- `dispositivos_reparto`: usuario, hash del token del teléfono, creado, último uso, revocado.
- `salidas`: id, local, repartidor, estado (`armada` → `en_ruta` → `cerrada`), armada por, hora de
  salida y de vuelta, km estimados, orden calculado y fondo de cambio.
- `pedidos`: + `salida_id`, `orden_parada`, `en_camino_at`, `entregado_at`, `no_entregado_motivo`,
  `cobrado_por` y `pago_detalle` (medio, monto, vuelto).
- `rendiciones`: salida o turno, esperado, recibido, diferencia, nota y quién recibió. Al confirmar, se
  crea un movimiento en la caja del día.
- Estados del pedido: se agrega `en_camino` entre `listo` y `entregado`, y `devuelto` como salida de
  `en_camino`. Hay que revisar cada lugar donde hoy se pregunta `estado === 'listo'`.

## 9. Etapas

| # | Etapa | Qué incluye | Tamaño |
|---|---|---|---|
| 1 | Acceso | Rol repartidor, enlace o QR de un solo uso, teléfono asociado, PIN, quitar acceso y pruebas de aislamiento (401/403) | M |
| 2 | Por salir y Mi salida | `/reparto` en el teléfono, tomar o asignar, conflictos, "Salí", Entregado y No pude entregar | M |
| 3 | Cobro y rendición | Medio de pago al entregar, vuelto, fondo de cambio, Mi efectivo, rendición en caja y bloqueo del cierre | M–L |
| 4 | Seguimiento del cliente | "En camino, parada N, cerca de las 21:20" | S |
| 5 | Planes | Candados por plan según §7, textos de "Quiero este plan" y pruebas por plan | S |
| 6 | Más adelante | Historial por repartidor, repartidores compartidos (Pro), GPS en vivo, OSRM | — |

Antes de la etapa 3 conviene probar las etapas 1 y 2 con Gassuso unos días: ver si el repartidor la usa
de verdad y qué le estorba en la calle.

## 10. Qué queda fuera, a propósito

- Plataforma tipo Uber con repartidores de varios locales o independientes. Implica pagos a terceros,
  calificaciones y temas laborales. Solo tendría sentido con varios clientes en la misma zona.
- Integración con PedidosYa, Uber Eats o Rappi.
- Cálculo de sueldo o bono del repartidor desde las entregas. Equipo ya tiene `bonoEntrega`; conectarlo
  es una etapa posterior.
