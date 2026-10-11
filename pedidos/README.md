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

**Caja del día**: cobrado total, por medio de pago, ticket promedio, por cobrar,
anulados, boletas por emitir (con registro de folio) y detalle imprimible.

## Rutas

| Ruta | Qué es |
|---|---|
| `/gassuso` | Carta pública (móvil primero) |
| `/panel` | Panel del local (clave `PANEL_PASSWORD`) |
| `/comanda?id=N` | Ticket 80 mm (`&auto` imprime solo) |
| `/carta-imprimible` | Carta A4 para imprimir o guardar como PDF |
| `/salud` | Healthcheck |

## Local

```bash
PANEL_PASSWORD=demo node server.mjs   # http://127.0.0.1:8099/gassuso
```

Los datos quedan en `./data/pedidos.db`. Para recargar la carta desde
`seed/gassuso.json`, borrar ese archivo (solo se siembra con la base vacía).

## Desplegar en lenovo-edge

Puerto 8099 (libre: 8096 Jellyfin, 8097 Boldus, 8098 chatbot). Sin comillas
anidadas ni heredoc en SSH.

```bash
# 1. Copiar y crear .env (chmod 600)
scp -r pedidos gabriel@lenovo-edge:/tmp/
ssh gabriel@lenovo-edge 'sudo mkdir -p /srv/docker/compose/pedidos && sudo cp -r /tmp/pedidos/. /srv/docker/compose/pedidos/'
ssh gabriel@lenovo-edge 'sudo cp /srv/docker/compose/pedidos/.env.example /srv/docker/compose/pedidos/.env && sudo chmod 600 /srv/docker/compose/pedidos/.env'
#    editar .env: PANEL_PASSWORD y SESSION_SECRET (openssl rand -hex 32)

# 2. Levantar
ssh gabriel@lenovo-edge 'cd /srv/docker/compose/pedidos && sudo docker compose up -d --build'

# 3. Túnel: en /etc/cloudflared/config.yml, ANTES de la regla final 404:
#      - hostname: pedidos.8vobit.xyz
#        service: http://127.0.0.1:8099
#    + registro DNS del hostname hacia el túnel
ssh gabriel@lenovo-edge 'sudo systemctl restart cloudflared.service'

# 4. Verificar
ssh gabriel@lenovo-edge 'curl -s http://127.0.0.1:8099/salud'
ssh gabriel@lenovo-edge 'sudo docker stats --no-stream pedidos'
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
