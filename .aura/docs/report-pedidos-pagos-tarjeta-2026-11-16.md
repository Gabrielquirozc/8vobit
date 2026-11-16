# Reporte: pago con tarjeta en línea (Pedidos)

Sesión PAGOS, 13 al 16 de noviembre de 2026. Rama `claude/pago-tarjeta`, PR https://github.com/Gabrielquirozc/8vobit/pull/1 (base `claude/compassionate-maxwell-hb826m`). Commits `4ddc890` (primera versión) y `499f92a` (versión completa).

## Estado

- **Desplegado en producción** el 13-nov (07:34) con `desplegar.ps1`: 118/118 pruebas en el servidor, verificaciones OK y 0 errores en logs.
- **Cobros reales apagados**: `PAGOS_PRODUCCION` no está en el `.env`. Ningún local lo tiene configurado aún (la carta de Gassuso responde `pago_online: null`).
- El despliegue generó `PAGOS_CLAVE` y agregó `PAGOS_URL_BASE` al `.env` del servidor.
- **Respaldo del `.env`**: `D:\Respaldos\pedidos\env\pedidos-env-20261113-0849.env`, con permisos solo para el usuario hpvictus. Trae las claves de producción: no compartirlo. Sin `PAGOS_CLAVE`, las credenciales guardadas por los locales no se pueden leer.
- **Recordatorio**: la tarea programada `recordatorio-pagos-sandbox` (13-nov 18:00) con los pasos de la prueba en sandbox.

## Qué hay

- `lib/pagos.mjs`: capa común. Config por local con credenciales cifradas (AES-256-GCM con `PAGOS_CLAVE`), iniciar, webhook y estado.
- `lib/pagos-flow.mjs` y `lib/pagos-mercadopago.mjs`: adaptadores REST con `fetch`, sin SDK.
- `lib/pagos-conciliar.mjs`: `aplicar()` es el único punto que marca pagos.
  - Conciliación sin webhook: barrido cada 5 min y consulta desde `/api/pagos/estado/:ref`. Cubre intentos `creado`, `rechazado` y `expirado` dentro de 48 h; los intentos vencen a las 24 h.
  - Devolución total, con su consulta y el cierre manual.
- **Carta y seguimiento**: botón "Pagar con tarjeta". `/pago/retorno` solo muestra el estado.
- **Panel**:
  - *Datos del local → Pago con tarjeta* (solo el dueño): pasarela, credenciales, modo, activar y un pago de prueba de $1.000.
  - En el pedido: estado del pago en línea, "Devolver pago" y "Ya la resolví en la pasarela". Aviso al cobrar a mano si hay un pago en línea iniciado.
- **Tablas nuevas**: `local_pagos_config`, `pago_intentos` (incluye la columna `devolucion_externo`) y `pago_eventos`.
- **Pruebas**: `test/pagos.test.mjs` y `test/pagos-conciliar.test.mjs`, con la pasarela simulada en `test/_sim.mjs`.

## Decisiones

- Credenciales cifradas en la base (opción B del handoff), no una variable de entorno por local: así cada dueño conecta su cuenta sin tocar el servidor.
- El pago en línea queda como `medio_pago='tarjeta'`, no en `pedido_pagos` (esa tabla es solo para el pago mixto).
- El webhook nunca se cree solo: el estado siempre se le pregunta a la API de la pasarela. Se exigen referencia, monto y CLP iguales; si no, el evento queda registrado y el pedido no se marca.
- Las devoluciones no se duplican nunca:
  - Se reserva el pago antes de llamar a la pasarela.
  - Ante red, 5xx o una respuesta ambigua queda `devolucion_pendiente` y solo se consulta.
  - Vuelve a `pagado` solo si la pasarela rechaza explícitamente o si confirma que no existe ninguna devolución. En Mercado Pago eso exige `refunds: []` explícito; Flow nunca responde "ninguna".
- El cierre manual "devuelto" se basa en lo que dice el dueño, y el evento queda a su nombre. Es una desviación consciente.
- Una devolución pedida desde otro local responde 404, la convención del panel.
- Variables solo para pruebas: `PAGOS_ESPERA_S`, `PAGOS_LIMITE_S`, `PAGOS_EXPIRA_S`, `PAGOS_CONCILIAR_MS`, `PAGOS_MANUAL_S` y `PAGOS_DEVOLVER_MAX`.

## Bloqueo antes de `PAGOS_PRODUCCION=1`

Los formatos de Flow y Mercado Pago no se verificaron contra la API real, porque las documentaciones no se pudieron leer automáticamente. Hay que correr la lista de verificación en sandbox de `pedidos/README.md` (sección "Pago con tarjeta en línea"):

- Flow: `getStatusByCommerceId`, `refund/create`, `refund/getStatus` y el monto mínimo de 350.
- Mercado Pago: `payments/search`, los refunds y el campo `refunds` de `/v1/payments/:id`.

## Siguiente

1. Crear cuentas de prueba en Flow y en Mercado Pago, configurar en el panel en modo Prueba, hacer un pedido, pagarlo, devolverlo y recorrer la lista del README.
2. Corregir lo que no calce, con pruebas.
3. Con el primer local real: `PAGOS_PRODUCCION=1` y pasos de producción del README.
4. Revisar y fusionar el PR número 1.
