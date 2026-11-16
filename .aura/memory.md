# Memoria del proyecto (AuraKit)

Fuente principal: `CLAUDE.md` y `pedidos/PENDIENTES.md`. Esto solo resume decisiones de arquitectura.

- pedidos/: Node 22 sin dependencias (`node:sqlite`), tests con `cd pedidos && npm test`. Despliegue: `pedidos/deploy/desplegar.ps1` (corre tests en el servidor, respalda y verifica).
- El servidor de desarrollo calcula los hash de los estáticos al arrancar: reiniciarlo para ver cambios del panel.
- Caja: una sola función de suma por medio (`ventasMedio`) para caja y cierre; propinas (`propinasMedio`) y cobros de fiado van como líneas propias de "Debería haber en caja".
- Pago mixto en `pedido_pagos`; fiado en `pedidos.fiado_nombre` + `fiado_pagos`; propina en `pedidos.propina` y `propina_medio`; cortes de turno en `caja_cortes`. Todas con migración idempotente.
- Permisos centralizados por ruta (`permisoRuta`); campos de cobro en PATCH exigen `cobrar` (incluye `pagos`, `propina`, `fiado`).
- Reporte de la sesión 19–20 oct 2026: `.aura/docs/report-pedidos-caja-promos-2026-10-20.md`.
- Pago con tarjeta (2026-11-13 al 16, rama claude/pago-tarjeta): lib/pagos.mjs + adaptadores Flow/MP + lib/pagos-conciliar.mjs (aplicar() único punto que marca pagos; webhook y conciliación consultan a la pasarela). Credenciales cifradas con PAGOS_CLAVE; medio_pago=tarjeta (no pedido_pagos); devoluciones nunca se duplican (devolucion_pendiente ante duda). Cobros reales con PAGOS_PRODUCCION=1, bloqueado hasta verificar en sandbox real. Reporte: .aura/docs/report-pedidos-pagos-tarjeta-2026-11-16.md.
