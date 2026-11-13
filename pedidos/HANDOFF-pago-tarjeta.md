# Handoff: Pago con tarjeta (Flow + Mercado Pago, capa abstracta)

Creado 2026-11-13. Para una **sesión nueva** que implemente pago online con tarjeta en el sistema de Pedidos. Autocontenido: lee también `pedidos/PENDIENTES.md` (estado y mapa de código), `pedidos/ESTRATEGIA.md` (§5 licencias, decisiones) y `pedidos/specs/` (SPEC-001 ya usa Flow para inscribir tarjeta en el alta).

## Objetivo

Que un cliente de la carta web pueda **pagar su pedido con tarjeta** al confirmar, con el dinero yendo **a la cuenta propia del local** (no a 8vobit). Es la brecha Alta de `ESTRATEGIA.md`: "sin esto se pierde al cliente que no quiere transferir". 8vobit no cobra por este medio; el local paga la comisión de su pasarela.

## Decisiones ya tomadas (del usuario, 2026-11-13)

1. **Dos pasarelas con capa de abstracción:** Flow **y** Mercado Pago, detrás de una interfaz común; se arranca con una pero el código no queda atado a ninguna.
2. **Alcance de esta tanda:** flujo **sandbox/test de punta a punta** + **dejar documentado y preparado para producción** (cómo el local conecta su cuenta real), **sin activar cobros reales** esta noche.
3. Trabajo en **sesión nueva** sobre el repo `D:\8vobit\pedidos`, en su propia rama.

## Reglas del proyecto que NO se negocian (vienen de PENDIENTES.md / CLAUDE.md)

- **Sin dependencias npm.** Node 22, `node:sqlite`, `node:crypto`, `fetch` nativo. Nada de SDK de Flow/Mercado Pago: se llama su REST API con `fetch`.
- **Secretos solo por variable de entorno** (`.env` del servidor, nunca al repo). Regla de seguridad del kit: ninguna API key hardcodeada.
- **Todo se valida en el servidor.** El monto a cobrar se calcula en el servidor desde el pedido guardado, **nunca** se confía en el navegador.
- **Migraciones idempotentes** con `ALTER TABLE` (nunca borrar columnas).
- **Aislamiento por `local_id`** en cada consulta; agregar prueba que intente cruzar locales y espere 403.
- **CSP con hash por script** (sin `unsafe-inline`); si se agrega JS nuevo a una página, recalcular su hash como ya hace el servidor.
- Textos y comentarios **en español**.
- Antes de desplegar: `npm test` (hoy 87/87). Agregar pruebas nuevas, no romper las existentes.

## Diseño propuesto (capa abstracta)

Crear `lib/pagos.mjs` con una interfaz común y un adaptador por pasarela:

```
lib/pagos.mjs           // orquestador: elige adaptador según config del local, estados, verificación de firma
lib/pagos-flow.mjs      // adaptador Flow: crear pago, firmar params (HMAC-SHA256), leer confirmación
lib/pagos-mercadopago.mjs // adaptador Mercado Pago: crear preferencia, validar webhook
```

Interfaz mínima que cada adaptador implementa:

```
crearPago({ local, pedido, monto, urlRetorno, urlConfirmacion }) -> { url, referencia }
verificarCallback(req, local) -> { referencia, estado: 'pagado'|'rechazado'|'pendiente', raw }
```

El orquestador `lib/pagos.mjs`:
- `pasarelaDelLocal(localId)` lee de config qué pasarela y credenciales usa ese local.
- `iniciarPago(localId, pedidoId)`: toma el pedido real, calcula el monto en el servidor, llama al adaptador, guarda `intento_pago` y devuelve la URL de redirección.
- `confirmar(localId, cuerpo)`: verifica la **firma** del webhook con el adaptador, marca el pedido `pagado` (idempotente: si ya estaba pagado, no duplica), registra en `pedido_pagos` (ya existe la tabla para pago mixto).

### Modelo de datos (tablas/columnas nuevas, ALTER idempotente)

```
local_pagos_config   local_id, pasarela ('flow'|'mercadopago'|null), modo ('sandbox'|'produccion'),
                     activo, creado, actualizado
                     -- las CREDENCIALES del local NO van en texto plano:
                     -- opción A (recomendada esta tanda): referencia a secreto en .env por local;
                     -- opción B (futuro): cifradas con clave en .env. Decidir y dejar documentado.
pago_intentos        id, local_id, pedido_id, pasarela, referencia UNIQUE, monto,
                     estado ('creado'|'pagado'|'rechazado'|'expirado'), raw JSON, creado, actualizado
```
Reutilizar `pedido_pagos` (pago mixto, ya existe) para registrar el pago confirmado. El pedido web ya tiene su flujo de estados; "pagado online" entra como medio `tarjeta` sin romper la caja.

### Rutas

| Ruta | Qué es | Público |
|---|---|---|
| `POST /api/locales/:codigo/pedido/:id/pagar` | Inicia el pago, devuelve URL de la pasarela | público (cliente) |
| `GET /pago/retorno` | Página a la que vuelve el cliente; muestra estado y lleva a `/seguimiento` | público |
| `POST /api/pagos/webhook/:pasarela` | Confirmación servidor-a-servidor; **verifica firma** | público pero firmado |
| Panel → Datos del local → *Pagos* | El dueño elige pasarela, pega sus credenciales, modo sandbox/producción, botón "Probar" | panel (dueño) |

Notas:
- El webhook es la fuente de verdad del pago, **no** el retorno del navegador (el cliente puede cerrar la pestaña).
- Idempotencia por `referencia`: un webhook repetido no cobra ni marca dos veces.
- `TRUST_PROXY=0` y escuchar solo en `127.0.0.1` (igual que hoy); la IP real viene de Cloudflare.

## Variables de entorno (ejemplo, al `.env` del servidor — NO al repo)

```
# Flow (sandbox primero)
FLOW_API_URL=https://sandbox.flow.cl/api
FLOW_API_KEY=...
FLOW_SECRET=...
# Mercado Pago (sandbox)
MP_ACCESS_TOKEN=TEST-...
PAGOS_URL_BASE=https://pedidos.8vobit.xyz   # para armar retorno/webhook
```
Dejar un `.env.example` (sin valores reales) y documentar en el README cómo el local obtiene sus credenciales.

## Alcance de ESTA tanda

**Incluir:**
- `lib/pagos.mjs` + los dos adaptadores, con **sandbox funcionando de punta a punta** (crear pago, redirigir, webhook firmado, pedido marcado pagado).
- UI en el panel (Datos del local → Pagos) para configurar la pasarela del local.
- Botón "Pagar con tarjeta" en la confirmación de la carta (junto a transferencia, que sigue existiendo).
- Pruebas en `test/`: creación de pago, webhook válido/ inválido, idempotencia, aislamiento por local (403 cruzado), monto recalculado en servidor.
- Documentación de producción: cómo el local conecta su cuenta real y cómo se pasa de sandbox a producción (una variable/flag por local).

**Dejar FUERA (no activar esta noche):**
- Cobros reales en producción.
- Boleta SII automática (sigue en modo 2 asistido).
- Cobro automático de las **licencias de 8vobit** (eso es otra cosa, fase 2 de `ESTRATEGIA.md` §5; no confundir con el pago del pedido del cliente).
- Avisos por WhatsApp API (decidido: no se depende de mensajería pagada).

## Criterios de aceptación

1. Un pedido de prueba se paga en sandbox de Flow **y** de Mercado Pago, y queda `pagado` por el webhook, no por el retorno.
2. El monto cobrado se calcula en el servidor desde el pedido; alterar el precio en el navegador no cambia lo cobrado.
3. Webhook con firma inválida → rechazado y registrado; webhook repetido → no duplica.
4. Un local solo ve y usa su propia config de pagos (prueba de cruce da 403).
5. `npm test` verde (los 87 previos + los nuevos). CSP correcta (hashes recalculados).
6. `.env.example` y sección de README explican el paso a producción; ningún secreto en el repo.
7. Transferencia y efectivo siguen funcionando igual.

## Seguridad (recordatorio del kit)

- API keys solo en `.env`; `.env` en `.gitignore` (verificar antes del primer commit).
- Verificar **firma** de cada webhook (Flow: HMAC con el secret; Mercado Pago: validar contra su API el pago por id).
- No loguear tokens ni datos de tarjeta (el PAN nunca pasa por nuestro servidor: la tarjeta se ingresa en la pasarela).
- HTTPS siempre (ya está por Cloudflare).

## Arranque de la sesión nueva

```powershell
cd D:\8vobit
git pull origin claude/compassionate-maxwell-hb826m
cd pedidos
$env:PANEL_PASSWORD="demo"; node server.mjs    # http://127.0.0.1:8099/gassuso y /panel
npm test                                        # baseline 87/87
```
Rama base: `claude/compassionate-maxwell-hb826m`. Crear una rama nueva para esta feature. Un commit por cambio con el porqué en el cuerpo.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
