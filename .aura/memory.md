# Memoria del proyecto (AuraKit)

Fuente principal: `CLAUDE.md` y `pedidos/PENDIENTES.md`. Esto solo resume decisiones de arquitectura.

- pedidos/: Node 22 sin dependencias (`node:sqlite`), tests con `cd pedidos && npm test`. Despliegue: `pedidos/deploy/desplegar.ps1` (corre tests en el servidor, respalda y verifica).
- El servidor de desarrollo calcula los hash de los estáticos al arrancar: reiniciarlo para ver cambios del panel.
- Caja: una sola función de suma por medio (`ventasMedio`) para caja y cierre; propinas (`propinasMedio`) y cobros de fiado van como líneas propias de "Debería haber en caja".
- Pago mixto en `pedido_pagos`; fiado en `pedidos.fiado_nombre` + `fiado_pagos`; propina en `pedidos.propina` y `propina_medio`; cortes de turno en `caja_cortes`. Todas con migración idempotente.
- Permisos centralizados por ruta (`permisoRuta`); campos de cobro en PATCH exigen `cobrar` (incluye `pagos`, `propina`, `fiado`).
- Reporte de la sesión 19–20 oct 2026: `.aura/docs/report-pedidos-caja-promos-2026-10-20.md`.
