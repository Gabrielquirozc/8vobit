# Diseño: Reparto en 8vobit Pedidos (acceso del repartidor, cobro y rendición)

**Estado:** diseño aprobado, sin código. **Fecha:** 2026-11-13. **Fuente completa:** `pedidos/DISENO-REPARTO.md`.
Ya hecho y en la rama de trabajo (sin desplegar): "Armar salida" en el panel (`pedidos/public/ruta.js`,
`public/hoja-ruta.html`, commit `c0f093a`).

## Decisiones (ADR)

| # | Decisión | Por qué | Rechazado |
|---|---|---|---|
| R-1 | Es una función del producto 8vobit Pedidos para todos los locales, no algo solo de Gassuso. | El usuario lo quiere en "nuestra app de pedidos". | App aparte; integración con PedidosYa, Uber Eats o Rappi. |
| R-2 | El repartidor entra a la misma plataforma web con un rol propio y solo ve despachos. | No hay que instalar nada ni integrar con terceros. | App nativa; "tipo Uber". |
| R-3 | La salida la arman **las dos partes**: el repartidor toma pedidos ("Lo llevo yo") y el dueño o encargado asigna y corrige. | Decisión del dueño. Si dos toman el mismo pedido, gana el primero; un pedido *en camino* hay que devolverlo antes de reasignarlo. | Solo el repartidor; solo el dueño. |
| R-4 | **El repartidor cobra** (efectivo, transferencia o tarjeta con POS móvil). | Decisión del dueño. | Solo pedidos pagados. |
| R-5 | Repartidores **propios** del local. | Decisión del dueño. Compartir entre locales solo dentro de una cuenta Pro. | Repartidores independientes o de varios locales. |
| R-6 | Planes: Canal = Armar salida en el panel. **Gestión y Pro** = acceso del repartidor, cobro con rendición y "en camino, parada N" para el cliente. **Solo Pro** = historial por repartidor y repartidores compartidos. | La ficha del repartidor vive en Equipo, que es de Gestión, y así se compite con Fudo Avanzado + Tu Delivery. | Adicional "Reparto" para Canal ($5.900): por ahora no. |
| R-7 | Repartidores ilimitados en Gestión y Pro, y **no cuentan** en el límite de usuarios. | Nadie tiene que elegir entre darle acceso al cajero o al repartidor. | — |
| R-8 | Sin GPS en vivo en esta etapa. | Gasta batería, exige permisos y abre un tema de privacidad del trabajador. La hora estimada sale de `ruta.js`. | Seguimiento por GPS. |

## Restricciones de seguridad (obligatorias al programar)

- Enlace o QR de alta de un solo uso, que vence en 24 h. Token aleatorio con `crypto.randomBytes`; se guarda solo su hash.
- Teléfono asociado con una cookie httpOnly, `secure` y `sameSite: strict`. Nada en localStorage.
- PIN con scrypt y bloqueo tras varios intentos fallidos.
- Sin sesión responde 401. Pedido de otro local o de otro repartidor: 403. Respuestas con solo los campos necesarios.
- Rol `repartidor` **fuera** de la escalera de niveles de `lib/usuarios.mjs`, con permisos propios: `reparto_ver`, `reparto_tomar`, `reparto_entregar` y `reparto_cobrar`.

## Flujo del dinero

Fondo de cambio (salida de caja hacia el repartidor, no es gasto) → cobro en la puerta, registrado en el pedido con
`cobrado_por` → el efectivo queda "en mano del repartidor" → **rendición** en caja: esperado contra recibido, con nota
si la diferencia pasa `UMBRAL_NOTA` → un movimiento "Rendición de X" en la caja del día. La caja no cierra con
plata sin rendir.

## Datos (borrador)

`usuarios.rol='repartidor'` + `trabajador_id` · `dispositivos_reparto` · `salidas` (`armada` → `en_ruta` → `cerrada`) ·
`pedidos` + `salida_id`, `orden_parada`, `en_camino_at`, `entregado_at`, `no_entregado_motivo`, `cobrado_por`, `pago_detalle` ·
`rendiciones`. Estados nuevos: `en_camino` (entre `listo` y `entregado`) y `devuelto`.
En licencias: funciones `reparto` (en `gestion` y `pro`) y `reparto_historial` (solo en `pro`).

## Etapas

1. Acceso (M) → 2. Por salir y Mi salida (M) → probar unos días con Gassuso → 3. Cobro y rendición (M–L) →
4. Seguimiento del cliente (S) → 5. Candados por plan (S) → 6. Después: historial, repartidores compartidos, GPS, OSRM.

**Siguiente:** etapa 1, solo cuando el usuario dé el visto bueno para programar.
