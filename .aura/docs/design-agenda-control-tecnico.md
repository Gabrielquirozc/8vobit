# Diseño: Agenda WordPress → Control técnico

**Estado:** diseño, sin endpoints ni despliegue. **Objetivo:** reflejar citas técnicas como pre-órdenes revisables, sin mezclar responsabilidades ni crear efectos financieros.

## Estado, ownership y enganche

| Área | Actual | Futuro |
|---|---|---|
| Agenda | Dueña de citas/recordatorios; sin webhooks | Mutación de cita + outbox atómicas; worker no bloqueante |
| Control | Node 22 + SQLite en `127.0.0.1:8110`; `/api/*` sin auth | Receptor privado HMAC, inbox, pre-órdenes y revisión |
| Finanzas | Orden/cotización/pagos/compra/DTE en control | Ningún cambio por eventos; correos/DTE siguen manuales |

No publicar el control ni cambiar su bind hasta implementar autenticación, HTTPS y restricción de red. No hay DB compartida. La agenda es autoridad de `appointment_id`, versión, tipo, estado, horario, contacto mínimo y recordatorios; el control lo es de orden, diagnóstico, cotización, estado técnico, movimientos, compras y DTE.

Los eventos se producen dentro de `Booking_Service` al crear/confirmar o actualizar la cita y en checkout cuando este confirma la reserva; no en callbacks REST, pues hay otros canales. Cita y outbox se escriben en la misma transacción WordPress. El worker entrega después y nunca bloquea la reserva.

## Modelo local mínimo

Migración SQLite aditiva y reversible:

- `agenda_citas(agenda_id INTEGER PRIMARY KEY, version INTEGER NOT NULL, last_event_id TEXT NOT NULL, tipo TEXT NOT NULL, estado TEXT NOT NULL, inicio TEXT, fin TEXT, timezone TEXT, cliente TEXT, correo TEXT, telefono TEXT, atencion TEXT, comentario TEXT, agenda_updated_at TEXT NOT NULL, received_at TEXT NOT NULL, review_required INTEGER NOT NULL DEFAULT 0, review_reason TEXT)`; índices `idx_agenda_citas_updated(agenda_updated_at, agenda_id)` y `idx_agenda_citas_review(review_required, received_at)`.
- `agenda_intakes(id INTEGER PRIMARY KEY, agenda_id INTEGER NOT NULL UNIQUE REFERENCES agenda_citas, intake_type TEXT NOT NULL, mapping_version INTEGER NOT NULL, control_service TEXT, control_category TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, promoted_order_id INTEGER UNIQUE REFERENCES ordenes, promoted_at TEXT, promoted_by TEXT)`.
- `integration_inbox(event_id TEXT PRIMARY KEY, payload_hash TEXT NOT NULL, agenda_id INTEGER NOT NULL, appointment_version INTEGER NOT NULL, event_type TEXT NOT NULL, schema_version INTEGER NOT NULL, mapping_version INTEGER NOT NULL, status TEXT NOT NULL, received_at TEXT NOT NULL, processing_started_at TEXT, processed_at TEXT, result TEXT, intake_id INTEGER, order_id INTEGER, error_code TEXT, error_detail TEXT)`; único adicional `(agenda_id, appointment_version, event_type)`.
- `integration_conflicts(id INTEGER PRIMARY KEY, event_id TEXT, agenda_id INTEGER, mapping_version INTEGER NOT NULL, reason TEXT, snapshot_json TEXT, status TEXT, created_at TEXT, resolved_at TEXT, resolved_by TEXT, resolution_note TEXT)`.
- `ordenes.agenda_id` sigue opcional y único como segunda barrera, pero un evento no crea orden.

Un intake es pre-orden: no exige cotización/equipo definitivo y no admite movimientos ni DTE. **Promover a orden** es manual y transaccional: valida campos y pertenencia de `control_service` y `control_category` a los catálogos `servicios` y `categorias` de `control-tecnico/lib.mjs` vigentes, crea `ordenes`, fija `promoted_order_id/promoted_at/promoted_by` y audita. Destino ausente, nulo o ajeno al catálogo bloquea promoción y abre revisión, sin fallback. No se promueve dos veces ni se vincula una orden asociada a otro `agenda_id`.

Guarda de promoción: dentro del mismo `BEGIN IMMEDIATE` que crea la OT, releer intake, `agenda_citas` y conflictos vigentes. Solo permitir `intake.status='pending'`, `agenda_citas.estado='confirmed'`, ausencia de cancelación aplicada y ausencia de `review_blocking` sin resolver; cualquier otro estado falla sin crear OT ni fijar promoción. `review_blocking` es una clasificación explícita de conflicto que impide promover; toda revisión pendiente se considera bloqueante por defecto hasta resolución humana auditada. Resolver una revisión no reactiva automáticamente un intake cancelado ni convierte una cita cancelada en confirmada.

Promoción y aplicación de cancelación se serializan mediante `BEGIN IMMEDIATE` sobre la misma SQLite. Si la cancelación confirma primero, la promoción relee el estado cancelado y falla. Si la promoción confirma primero, la cancelación detecta `promoted_order_id`, actualiza solo la cita y abre revisión; preserva la OT y todos sus efectos. La precedencia la determina el commit local, nunca la lectura previa de la interfaz ni el instante de inicio de las solicitudes.

## Mapeo versionado (`mapping_version: 1`)

| `agenda_slug` | `intake_type` | `control_service` |
|---|---|---|
| `diagnostico` | `diagnostico` | `diagnostico` |
| `formateo` | `servicio_directo` | `formateo` |
| `limpieza` | `servicio_directo` | `limpieza` |
| `formateo-limpieza` | `servicio_directo` | `combo` |
| `pieza` | `cotizacion_pieza` | `NULL` (selección humana pendiente) |
| `recuperar-datos` | `diagnostico` | `recuperar_datos` |

Slug no mapeado, versión desconocida o cambio posterior va a revisión; jamás se infiere. Cambiar la tabla exige nueva versión y fixtures.

`pieza` crea únicamente intake: conserva `control_service=NULL` y `control_category=NULL` hasta que un operador elija un servicio real y una categoría del catálogo; registrar operador, fecha y selección. No existe un servicio sintético `pieza`. Persistir la versión recibida en inbox/receipt y conflictos, incluso si es desconocida; el intake conserva la versión usada para mapearlo. El resultado del receipt incluye `mapping_version`; una revisión posterior registra versión anterior/nueva y decisión, sin reinterpretar ni sobrescribir receipts históricos.

Fixtures obligatorios para los seis slugs: `diagnostico→diagnostico`, `formateo→formateo`, `limpieza→limpieza`, `formateo-limpieza→combo`, `pieza→NULL`, `recuperar-datos→recuperar_datos`, verificando también `intake_type` y `mapping_version=1`. La validación carga los catálogos exportados por `lib.mjs` y exige que cada destino no nulo exista; `pieza` es la única excepción de intake y debe fallar promoción hasta selección válida. Añadir casos negativos para slug/versión desconocidos, destino retirado del catálogo y categoría inválida; ninguno crea orden.

## Contrato JSON cerrado v1

Eventos: `appointment.confirmed.v1`, `appointment.rescheduled.v1`, `appointment.cancelled.v1`. JSON Schema con `additionalProperties: false` en cada objeto:

```json
{"schema_version":1,"mapping_version":1,"event_id":"550e8400-e29b-41d4-a716-446655440000","event_type":"appointment.confirmed.v1","occurred_at":"2026-10-24T15:00:00Z","appointment":{"id":123,"version":4,"updated_at":"2026-10-24T14:59:58Z","event_slug":"diagnostico","status":"confirmed","starts_at":"2026-10-26T10:00:00-03:00","ends_at":"2026-10-26T10:15:00-03:00","timezone":"America/Santiago","client":{"name":"…","email":"…","phone":"…"},"answers":{"atencion":"presencial","comentario":"…"}}}
```

Allowlist: IDs/versiones positivos; UUID canónico; fechas RFC 3339; zona `America/Santiago`; slug máximo 40 y `[a-z0-9-]`. PII únicamente `name` (120), `email` (190) y `phone` (40), con formato validado. `answers` solo `atencion` (`presencial|remota`, 20) y `comentario` (500). Cuerpo máximo 8 KiB. Prohibidos `form_payload`, notas completas/internas, tokens, contraseñas, cookies, documentos de identidad y pago. Logs/errores guardan IDs, hash y códigos, nunca cuerpos/email/teléfono/comentario; snapshots se redactan.

## API e inbox transaccional

Ruta nueva `POST /api/integrations/agenda/events`; no reutiliza `/api/ordenes` ni su PATCH.

Tras validar HMAC/esquema y calcular `SHA256(raw_body)`, ejecutar `BEGIN IMMEDIATE`:

1. Insertar receipt `processing`. Mismo `event_id`+hash devuelve resultado almacenado; hash distinto da `409 event_id_hash_mismatch` y alerta.
2. Duplicado `(agenda_id, version, type)` devuelve receipt. Versión ≤ aplicada queda `ignored_stale` sin mutar; si diverge abre revisión. Salto de versión se acepta con `review` y conciliación.
3. Aplicar matriz; actualizar cita/intake/conflicto. Cerrar receipt `processed`, `ignored`, `review` o `failed_permanent` con resultado, IDs y timestamps; `COMMIT`.
4. Error transitorio hace `ROLLBACK`+`5xx`, sin receipt parcial.

Al inicio y periódicamente, `processing` de más de 10 min se recupera: si efectos existen, se finaliza desde la proyección; si no, se reprocesa transaccionalmente. Nunca se borran receipts. Respuestas: `202 created|updated|ignored|review`, `400/422` permanente, `401/403`, `409`, `429/5xx` reintentable.

## Matriz sin contradicciones

| Evento | Sin cita/intake | Repetido | Fuera de orden | Ya promovido |
|---|---|---|---|---|
| confirmed | Upsert cita + intake mapeado | ignored/mismo receipt | ignored_stale; review si diverge | Solo cita; cambio de slug a review |
| rescheduled | Upsert cita + review `missing_confirmation`; no inventa intake | ignored | ignored_stale; review si diverge | Solo horario/estado de cita |
| cancelled | Upsert cancelada; intake existente → `cancelled` | ignored | ignored_stale; review si diverge | Solo cita + review; jamás orden/pagos/compra/DTE |

También requieren revisión: vínculo duplicado, movimiento/DTE, estado técnico avanzado o datos inválidos. Los eventos no crean movimientos ni alteran `/api/resumen`.

## Outbox WordPress

Estados `pending`, `delivering`, `delivered`, `dead_lettered`; guarda ID, cita/versión/tipo, cuerpo canónico, hash, intentos, próximo intento, lease, respuesta redactada y timestamps.

- Mutación+outbox en una transacción. Si no puede garantizarse, falla la mutación antes de confirmar; nunca se acepta para “emitir después”. Un reconciliador local detecta versiones sin outbox y repara determinística/auditadamente como defensa, no como mecanismo principal.
- Worker reclama lease. Timeout/`429/5xx` vuelve a `pending` con jitter (1, 5, 15, 60 min; luego 6 h); `4xx` permanente/máximo intentos → `dead_lettered`.
- Cada intento conserva exactamente los bytes del cuerpo, hash y `event_id` del outbox, pero genera un timestamp UTC actual y recalcula HMAC con la clave activa sobre `timestamp + "." + raw_body` inmediatamente antes de enviar. No reutilizar timestamp/firma de un intento anterior ni firmar al encolar; un reintento usa su propio registro de transporte.
- Reencolar exige operador, motivo y timestamp; conserva ID/cuerpo si fue transporte. Corregir payload crea evento nuevo/versionado.

## HMAC y secretos

HTTPS obligatorio, idealmente VPN/firewall. Cabeceras: `X-8vobit-Key-Id`, `X-8vobit-Timestamp` (Unix decimal UTC), `X-8vobit-Event-Id` (igual al cuerpo), `X-8vobit-Signature: v1=<64 hex minúsculas>`. Mensaje exacto `timestamp + "." + raw_body`; `HMAC-SHA256(secret, mensaje)` sobre bytes recibidos y comparación constante. Rechazar desfase >±300 s, firma mal formada, IDs discordantes o key desconocida.

Secretos aleatorios ≥32 bytes fuera de DB/repo/logs. Rotación: admitir clave anterior+nueva, publicar `key_id` nueva, cambiar emisor, verificar, retirar anterior tras ventana máxima de reintentos; auditar y permitir revocación inmediata.

## Reconciliación cursorizada

Canal separado del webhook Agenda→Control: el consumidor `control-reconciler` de Control consulta `GET /wp-json/8vobit/v1/integrations/control/appointments?cursor=...&limit=...` en Agenda. Su credencial exclusiva tiene alcance read-only `technical_appointments:read`, solo citas técnicas y la misma allowlist mínima de PII; no permite mutaciones, acceso administrativo ni reutiliza las claves del webhook.

HTTPS y restricción de red obligatorios. Cada petición lleva `X-8vobit-Consumer: control-reconciler`, `X-8vobit-Key-Id`, `X-8vobit-Timestamp` (Unix UTC actual), `X-8vobit-Request-Id` (UUID nuevo por intento) y `X-8vobit-Signature: v1=<hex>`. Firma HMAC-SHA256 con clave propia sobre bytes UTF-8 de `timestamp + "\n" + request_id + "\nGET\n" + canonical_target + "\n" + SHA256(empty_body)`; `canonical_target` es path y query con claves ordenadas y codificación RFC 3986, incluye cursor/limit y se valida sin parámetros duplicados. Agenda comprueba formato, consumidor/alcance, comparación constante, desfase ±300 s y unicidad persistida de `(consumer, request_id)` durante al menos 10 min; replay se rechaza. Reintentos generan ID, timestamp y firma nuevos, manteniendo cursor.

Secretos de al menos 32 bytes fuera de DB/repo/logs; rotación independiente por consumidor con key IDs anterior/nuevo, solapamiento acotado, cambio de Control, verificación y retiro; revocación inmediata disponible. Auditar consumidor, key ID, request ID, timestamp, resultado, cursor/hash de cursor y cantidad, sin claves, firmas ni PII. Auditar rechazos, replay, rotaciones y avances/fallos de watermark.

La ruta lista citas técnicas por `(updated_at,id)`, orden estable, páginas acotadas y `next_cursor`. Control avanza watermark solo al procesar toda la página por el inbox, conservando `mapping_version` en receipts/conflictos y usando el mismo mapeo versionado para intake. Consulta inclusiva alrededor del watermark y deduplica por ID/versión para evitar empates/relojes. Corre diaria y manualmente; compara versión/estado/horario/slug, genera reparación o review, nunca escribe DB directa. Alertar si no avanza en 24 h.

## Fases, aceptación y rollback

1. Backups restaurables, migraciones, schemas/mapeo v1 y fixtures.
2. Receptor HMAC/inbox/intake detrás de red privada; probar replay, reloj, body alterado, receipt abandonado y SQLite caído.
3. Outbox en sombra y reconciliación, sin promoción.
4. Piloto `diagnostico`, promoción manual.
5. Habilitar cada slug, bandeja/badges; correos/DTE manuales.

Migraciones transaccionales, `PRAGMA integrity_check`, snapshot WAL y backup WordPress; restauración probada. Aceptación: duplicados producen un receipt/intake; confirmación no crea finanzas; promoción es única/auditada; reagenda solo cita; cancelación jamás anula orden; allowlist no filtra PII a logs; se recuperan leases/receipts y conciliación no duplica.

Prueba de transporte obligatoria: entregar un evento, simular pérdida de respuesta y reintentar después de más de 5 minutos con el mismo cuerpo/event_id y timestamp/firma nuevos; debe autenticarse y devolver el receipt existente sin otro intake. Reutilizar la firma antigua debe fallar por reloj. Probar también los seis fixtures, persistencia de `mapping_version` y el canal read-only de reconciliación (scope inválido, cursor alterado, replay, rotación y página fallida sin avance de watermark).

Fixtures de promoción: (a) intake `pending` y cita `confirmed` sin revisión bloqueante permiten una única OT; (b) cancelación aplicada antes de promover rechaza la operación, aunque la interfaz conserve una vista anterior, y mantiene cero OT; (c) `review_blocking` pendiente o intake fuera de `pending` impiden promover. En dos conexiones concurrentes, forzar ambos órdenes de commit entre cancelación y promoción: cancelación primero produce cero OT y promoción rechazada; promoción primero produce exactamente una OT preservada, cita cancelada y revisión abierta. Verificar atomicidad, ausencia de promociones parciales y que reintentos no creen otra OT ni reviertan la cancelación.

Flags `emit_events`, `deliver_events`, `apply_events` y allowlist de slugs; avanzar tras 48 h sin pérdida/conflictos inexplicados. Rollback: desactivar aplicación y luego entrega, conservar outbox/inbox/intakes y operar manualmente. No borrar receipts ni deshacer órdenes promovidas; la agenda sigue autónoma.
