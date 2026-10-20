# Reporte: Caja, cobro y Promociones (pedidos/) · 19–20 oct 2026

Sistema de pedidos para locales de comida (piloto Gassuso, Concepción). Producción: https://pedidos.8vobit.xyz
Método: `/code-loop` (coder ↔ reviewer, verificación en navegador local antes de cada aprobación).
Rama: `claude/compassionate-maxwell-hb826m`. Tests al cierre: **79/79**.

## Qué se hizo

| # | Cambio | Commit | En producción |
|---|--------|--------|---------------|
| 1 | Menú del panel en dos líneas (las 13 pestañas se montaban sobre las acciones) | 5890078 | Sí |
| 2 | Review de caja frente a Fudo (`pedidos/REVIEW-CAJA.md`) y pasos del turno en la ayuda | 5890078 | Sí |
| 3 | Aviso "Caja sin abrir" (hay movimientos y falta el fondo inicial) | b1eb8be | Sí |
| 4 | Arqueo ciego opcional, por dispositivo (contar sin ver lo esperado) | 0c5a53a | Sí |
| 5 | Nombres unificados: "Debería haber en caja", "Cuadre del efectivo", "Anotar …" | e0a7fd8 | Sí |
| 6 | Diferencia > $5.000 exige nota al cerrar (servidor + panel) | a2cd8d4 | Sí |
| 7 | Voucher de tarjeta y cartola opcionales al cierre, con su diferencia | 748756b | Sí |
| 8 | "Entregar la caja" (corte de turno: cuenta y quién entrega, sin cerrar el día) | 4bd528d, 1cd385b | Sí |
| 9 | Análisis de un turno real en caja y de Promociones (`pedidos/REVIEW-UX-CAJERO.md`) | 3385b5d | — |
| 10 | Gastos rápidos de un toque (Bolsas, Guantes, Gas, Hielo, Súper, Pago repartidor) | 1cd385b | Sí |
| 11 | Pago mixto (tabla `pedido_pagos`; caja, cierre y CSV cuadran por medio) | 4a5d6c8 (+ server en 024d27c) | Sí |
| 12 | Promociones en dos pasos (elegir tipo con ejemplo → formulario corto con resumen en vivo) | 50a8314 | Sí |
| 13 | Propina (no es venta; la de efectivo entra a la caja hasta "Retiro de propinas") | 5b5839a | Sí |
| 14 | Fiado con nombre, abonos parciales y saldo (el abono entra a la caja del día en que se cobra) | 3ffe747 | Sí |
| 15 | Caja del día rediseñada (Apple HIG + ui-ux-pro-max): hero "En caja ahora" con la ecuación, columna Anotar + Cerrar caja, resumen de ventas abajo | 4dab060 | Sí |
| 16 | Combos con precio propio desde Promociones (ahorro y margen en vivo) e "Ideas según tus ventas" (días flojos y pares frecuentes, 60 días) | 81202b8 | **No (pendiente)** |

Despliegues: 2026-10-20 00:22 y 01:23 (respaldo previo en `/srv/docker/compose/pedidos.prev-20261020-012339`). El ítem 16 está en la rama, sin desplegar.

## Decisiones de diseño (no volver a discutir)

- **Propina**: no es venta (no suma a total, Resumen, Resultados, ticket ni boleta). Va a un solo medio. La de efectivo entra a "Debería haber en caja" y se reparte con un retiro de categoría `propinas`.
- **Fiado**: pedido con `pagado=0` y `fiado_nombre`. Es venta del día en que se entrega (Resultados lo cuenta), pero no entra a la caja de ese día. Cada abono (`fiado_pagos`) entra a la caja del día en que se cobra. No se anula un pedido fiado con abonos vigentes.
- **Pago mixto**: `medio_pago='mixto'` solo con más de un medio; las sumas por medio pasan por `ventasMedio`. Los pedidos de un solo medio no cambiaron.
- **Corte de turno**: no cierra el día; el cierre sigue siendo uno por día.
- **Arqueo ciego**: ayuda de honestidad, no control antifraude (quien cuenta puede apagarlo).
- **Combos**: el producto de la carta (categoría "Combos") se crea/edita desde Promociones; quitar archiva el producto (los pedidos históricos no se rompen).
- **Nota obligatoria**: umbral fijo de $5.000 en `lib/caja.mjs` (`UMBRAL_NOTA`).

## Hallazgos del loop que se corrigieron

- Pago mixto: "Justo" ponía el total y mostraba un vuelto falso; PATCH con `pagos[]` permitía cobrar sin permiso `cobrar` (bypass, corregido con test 403); guardado del pedido y sus pagos no era atómico.
- Promociones: una promo "Código" sin código se guardaba como descuento para todos.
- Combos: el precio no se podía cambiar porque el combo heredaba el de un producto existente.
- Otra sesión commiteó cambios de `server.mjs` del pago mixto dentro de 024d27c; la rama quedó rota hasta el commit siguiente (verificado en copia limpia).

## Pendientes

1. Desplegar el ítem 16 (combos con precio propio e ideas).
2. Prueba en el local con tablet e impresora: pedido completo, pago mixto, propina, fiado, entregar la caja y cierre con voucher.
3. Datos del dueño: transferencia, 2 precios faltantes, despacho real, costos de insumos (sin ellos el margen se estima en 35 %).
4. (hecho 2026-10-20) Mejoras menores: quitar promociones (archiva si tiene usos), umbral de nota por local (Datos del local → Caja), entregas de caja en el CSV y costos en bloque en GET promos.

Detalle completo en `pedidos/PENDIENTES.md`, `pedidos/REVIEW-CAJA.md` y `pedidos/REVIEW-UX-CAJERO.md`.
