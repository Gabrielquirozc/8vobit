# Pedidos — demo Gassuso

Demo del PRD "Sistema de pedidos para locales delivery": carta pública con la
carta real de Gassuso, selector de agregados ("+N ingr."), carro con franja
horaria, panel por estados con sonido, comanda de 80 mm, editor de carta con
historial de precios y carta imprimible. Boleta en **modo 2 (asistida)**: cada
pedido muestra "boleta por emitir" y el local registra el folio de la e-Boleta.

## Por qué así y no Next.js + Supabase

- `lenovo-edge` tiene 7,5 GB de RAM y Immich ya reserva ~5 GB. Un solo
  contenedor Node **sin dependencias** (`http` + `node:sqlite`) acotado a 128 MB.
- Mismo patrón que el resto del servidor: contenedor en `127.0.0.1`, entrada
  solo por el túnel, despliegue manual por SSH.
- Multi-local desde el inicio: toda tabla lleva `local_id`; el panel solo ve
  su local (sesión firmada, cookie httpOnly + SameSite=Strict).

## Cómo trabaja el local (panel en tablet)

Cada pedido avanza con **un solo botón grande por paso**:

1. **Nuevo** → *Aceptar e imprimir comanda* (suena al llegar; la comanda se imprime).
2. **En cocina** → *Listo para entregar* (botón WhatsApp con aviso "tu pedido está listo").
3. **Listo** → *Cobrar*: efectivo (con montos rápidos y vuelto), transferencia,
   tarjeta (POS propio del local) u otro; folio de boleta opcional. Cobrar = entregar.
   Si ya pagó antes (transferencia), *Ya pagó* registra el pago sin entregar.

**Venta rápida** (mostrador): la carta en fichas con foto, ticket a la derecha
(abajo en tablet vertical), cobro con vuelto y opción de mandarla a cocina con
comanda y nombre para llamar. Así la caja cuadra con todo el negocio, no solo
con los pedidos web.

**Caja del día**: cobrado total, efectivo en caja, por medio de pago, por canal
(web / mostrador), ticket promedio, por cobrar, anulados, boletas por emitir
(con registro de folio) y detalle imprimible.

**Datos del local**: nombre, WhatsApp, Instagram, dirección, horario por día (días
cerrados; misma hora de apertura y cierre = 24 h), cupo de pedidos por franja y datos
para transferencia, que el cliente ve al pagar y en el seguimiento.

**Pausar pedidos web** (botón en la barra superior): la carta avisa "Pedidos en línea
pausados" y no deja agregar; el mostrador sigue funcionando.

**Observaciones**: por producto ("sin cebolla", 140 caracteres) y un comentario general
del pedido (300). Se guardan sin caracteres de control y se muestran siempre escapadas;
en la comanda la observación sale en mayúsculas para que la cocina no la pase por alto.

**Productos sin foto**: muestran un emoji según lo que son (🌭 🍔 🥤 🍓 …).

**Seguimiento**: cada pedido web tiene un link `/seguimiento?p=…` que el cliente
recibe al confirmar y en el WhatsApp del local; muestra el estado en vivo.

## Rutas

| Ruta | Qué es |
|---|---|
| `/gassuso` | Carta pública (móvil primero) |
| `/panel` | Panel del local (clave `PANEL_PASSWORD`) |
| `/comanda?id=N` | Ticket 80 mm (`&auto` imprime solo) |
| `/carta-imprimible` | Carta A4 para imprimir o guardar como PDF |
| `/salud` | Healthcheck |

## Seguridad y respaldos

- **Límites de uso**: 8 intentos de clave y 15 pedidos por IP cada 15 minutos
  (responde 429). La IP real viene en `cf-connecting-ip`, que pone Cloudflare; por
  eso el contenedor **solo** debe escuchar en `127.0.0.1` (si se expusiera directo,
  esa cabecera se podría falsificar; `TRUST_PROXY=0` la ignora).
- **Cabeceras**: CSP con el hash de cada script de cada página (sin
  `unsafe-inline` para scripts), `frame-ancestors 'none'`, `nosniff`.
- **Respaldos**: una copia diaria consistente de la base (`VACUUM INTO`) en
  `/data/backups`, se conservan `BACKUP_DIAS` (14). **Están en el mismo disco**:
  para sobrevivir a una falla de disco hay que copiar `/data` fuera del servidor,
  por ejemplo con un `rsync` nocturno a otra máquina por Tailscale.
- `docker stop` cierra limpio (termina respuestas en curso y cierra la base).

## Pruebas

```bash
npm test   # 31 pruebas de punta a punta, sin dependencias, ~1 s
```

Corren contra el servidor real con una base temporal y horario de 24 h.

## Local

```bash
PANEL_PASSWORD=demo node server.mjs   # http://127.0.0.1:8099/gassuso
```

Los datos quedan en `./data/pedidos.db`. Para recargar la carta desde
`seed/gassuso.json`, borrar ese archivo (solo se siembra con la base vacía).

## Desplegar en lenovo-edge

**Puerto del host: 8100** (dentro del contenedor sigue siendo 8099). Puertos ocupados
en `lenovo-edge` al 2026-10-12: 8089 gabriel-profile-link, 8092 radio, 8093 codice,
8094 home-8vobit, 8095 agenda, 8097 boldus, 8098 chatbot, **8099
completapp-dev-wordpress** (no figura en el espejo `D:\VPS`); reservados aunque no
escuchaban: 8091 ongtapitas, 8096 Jellyfin.

Desde Windows, en la carpeta del repo (PowerShell):

```powershell
.\pedidos\deploy\desplegar.ps1
```

Empaqueta `pedidos/` (sin `data/` ni `.env`), lo copia a `/tmp` del servidor y corre
[`deploy/remoto.sh`](deploy/remoto.sh), que:

1. Verifica que el puerto 8100 del host esté libre (o sea del propio `pedidos`).
2. **Corre las pruebas en el servidor**, en un contenedor desechable; si alguna
   falla, se detiene sin tocar nada.
3. Respalda la versión anterior en `/srv/docker/compose/pedidos.prev-FECHA`.
4. Copia los archivos conservando `.env`; la primera vez crea `.env` con una clave
   del panel aleatoria y **la muestra una sola vez**.
5. `docker compose up -d --build` (solo este stack).
6. Verifica: `/salud`, carta HTTP 200, fotos en el volumen, **hora de Chile en el
   contenedor**, escritura en `/data`, respaldo inicial, memoria, que escuche solo en
   `127.0.0.1` y errores en logs.

La **primera vez**, agregar el hostname al túnel (una sola vez, a mano):

```bash
ssh gabriel@lenovo-edge 'sudo bash /srv/docker/compose/pedidos/deploy/tunel.sh'
```

Respalda `/etc/cloudflared/config.yml`, inserta `pedidos.8vobit.xyz → 127.0.0.1:8100`
antes de la regla final 404, **valida con `cloudflared` antes de reemplazar** y reinicia
`cloudflared.service`. Luego indica el comando de DNS si el registro aún no existe.

Verificación externa:

```bash
curl -sS -o /dev/null -w "HTTP %{http_code}\n" https://pedidos.8vobit.xyz/gassuso
```

Después, copiar `docker-compose.yml` a `infra/docker-compose.pedidos.yml` y la
regla nueva a `infra/cloudflared-config.yml` en el espejo `D:\VPS`.

Opcional: proteger `/panel` y `/api/panel/*` también con Cloudflare Access,
igual que wp-admin. **Nunca** `/gassuso` ni `/api/locales/*`: son públicos.

## Pendiente (ver plan maestro)

- Datos que faltan: precios de *Pollo + 1 ingr.*, *Vegetariano*, papas y
  recargos de agregados; ingrediente del Diplomático; bebidas; WhatsApp del
  local (`whatsapp` en el seed, activa el botón "Avisar por WhatsApp").
- Modo 3 (boleta integrada con SimpleAPI), promociones, métricas semanales.
