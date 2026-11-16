# Snapshot

Actualizado: 2026-11-16. Hay dos frentes abiertos en pedidos/, cada uno en su propia rama.

## Frente 1: pago con tarjeta en línea (rama claude/pago-tarjeta, PR número 1)

Modo: BUILD (completo) · 2026-11-13 al 16
Estado: desplegado en producción el 13-nov, con 118/118 pruebas. Los cobros reales siguen apagados (`PAGOS_PRODUCCION` no está en el .env). El .env del servidor está respaldado en `D:\Respaldos\pedidos\env\`.
Siguiente: prueba en el sandbox real de Flow y Mercado Pago, con la lista de verificación del README de pedidos. Es un bloqueo antes de activar `PAGOS_PRODUCCION=1`.
Reporte: `.aura/docs/report-pedidos-pagos-tarjeta-2026-11-16.md`

## Frente 2: reparto (rama claude/compassionate-maxwell-hb826m)

Modo: DESIGN · 2026-11-13. El diseño está aprobado y todavía no tiene código.
Ver `.aura/docs/design-reparto-pedidos.md`, que está en esa rama (commit f4af73b).

Al fusionar las ramas, este archivo debe conservar los dos frentes.
