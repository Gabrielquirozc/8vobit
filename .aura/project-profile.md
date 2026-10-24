# Perfil del proyecto: 8vobit

## Alcance

8vobit opera una agenda WordPress y un control técnico local para servicios de notebooks y PC. Este perfil documenta la frontera entre ambos; no autoriza despliegue ni exposición pública del control.

## Componentes actuales

- **Agenda WordPress**: dueña de disponibilidad, citas, reprogramaciones, cancelaciones y recordatorios. API `agenda-interna/v1`: escritura pública protegida por el flujo/token en `/book`, `/reschedule/{token}` y `/cancel/{token}`; actualización privada en `/appointments/{id}`. No emite webhooks actualmente.
- **Control técnico**: Node.js 22 + SQLite, escucha en `127.0.0.1:8110`. Es dueño de órdenes, diagnóstico, cotización, pagos, compras, costos y referencias de DTE. Rutas actuales: `/api/datos`, `/api/cotizar`, `/api/ordenes`, `/api/movimientos` y `/api/resumen`. No tiene autenticación apta para exposición.
- **Vínculo disponible**: `ordenes.agenda_id` es opcional y único.

## Servicios técnicos sincronizables

`diagnostico`, `formateo`, `limpieza`, `formateo-limpieza`, `pieza` y `recuperar-datos`. Otros eventos de agenda quedan fuera hasta mapearlos explícitamente.

## Principios de integración

1. La agenda conserva autoridad sobre la cita y sus recordatorios.
2. El control conserva autoridad sobre orden, cotización, pagos, compra y DTE.
3. No se comparte base de datos: se intercambian contratos versionados y mínimos.
4. Repetir un evento no duplica una orden; `agenda_id` y `event_id` garantizan idempotencia.
5. No se automatizan correos ni emisión de DTE en esta etapa.
6. Todo conflicto financiero o cambio ambiguo se deriva a revisión humana.

## Restricciones operativas

- No cambiar `CONTROL_HOST` a una interfaz pública sin autenticación, HTTPS, autorización y respaldo probado.
- No copiar tokens de gestión de citas al control.
- Minimizar datos personales en payloads y logs; secretos solo en configuración segura.
- La especificación ejecutable de la integración está en `docs/design-agenda-control-tecnico.md`.
