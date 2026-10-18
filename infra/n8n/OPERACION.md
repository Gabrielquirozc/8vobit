# n8n · DM automáticos de Instagram (@8vobit): cómo funciona y cómo revisarlo

Este archivo vive en el servidor en `/srv/docker/compose/n8n/OPERACION.md` y en el repo en `infra/n8n/OPERACION.md`.
Cualquier sesión puede leerlo para saber qué hay y cómo verificarlo. **Aquí no hay secretos**: los secretos están solo en `.env` (root, 600).

## Qué hace

1. Alguien escribe un DM a @8vobit en Instagram.
2. Meta avisa con un POST a `https://n8n.8vobit.xyz/webhook/instagram` (túnel de Cloudflare → `127.0.0.1:5678`).
3. El flujo **"DM Instagram · bot 8vobit"** (ID `GOhImTsPA0GizMPu`) es un **bot sin IA que suena humano**. El diseño está en `D:\VPS\infra\bot-8vobit\DISENO.md`. Lo que hace:
   - Verifica la firma `X-Hub-Signature-256` con `IG_APP_SECRET`; si es inválida, ignora el mensaje.
   - Clasifica el mensaje por **intención**, con unas 35 reglas: precio por servicio, llegada, estado del equipo, pago, horario, ubicación, spam… También reconoce DEMO, WEB y AGENDA PRO. Responde con la lista de precios oficial (`marketing/PRECIOS-SERVICIO-TECNICO.md`).
   - Para parecer humano, muestra "escribiendo…", espera entre 6 y 25 s y elige entre varias versiones de cada respuesta.
   - **Se calla** en tres casos:
     - si Gabriel escribió a mano a esa persona en las últimas 12 h;
     - si ya mandó esa misma respuesta en las últimas 24 h, o ya mandó 3 en la última hora;
     - si la conversación está en curso (hubo mensajes en las últimas 48 h) y no es logística (llegada, estado, pago, garantía, horario, ubicación).
   - A quien escribe entre las 21:00 y las 9:00 le dice que Gabriel contesta mañana.
   - Avisa al celular por ntfy (`NTFY_URL`, tema `8vobit-dm`). Los avisos llevan **prioridad 5** cuando son urgentes: llegada, "sigue igual", líquido derramado o pregunta por el estado del equipo.
4. Lo que el bot no entiende no lo contesta: llega a ntfy y lo responde Gabriel.
5. La memoria de cada contacto (cuándo escribió, qué se le respondió) vive en los *static data* del flujo dentro de n8n, y se borra a los 60 días sin movimiento.

**Cambiar textos o reglas:** se editan `infra/n8n/bot/cerebro.js` en el repo. Luego se corren `node --test infra/n8n/bot/` y `node infra/n8n/bot/construir-flujo.js`, y se reimporta el flujo (ver "Desplegar el flujo"). No se editan a mano dentro de n8n, porque el repo es la fuente.

## Desplegar el flujo (desde `D:\8vobit`, PowerShell)

```powershell
powershell -ExecutionPolicy Bypass -File .\infra\n8n\desplegar-bot.ps1
```

Corre las pruebas, arma el flujo, lo copia con `gabriel@lenovo-edge` (no con tu usuario de Windows) y lo importa y publica en n8n. Si da *Connection timed out*, revisa que Tailscale esté conectado en el PC.

Después: prueba de punta a punta desde otra cuenta ("hola, cuánto sale formatear?") y copia de esta guía en el servidor (`/srv/docker/compose/n8n/OPERACION.md`).
**Antes:** apagar la bienvenida automática nativa de Instagram (app de Instagram → Herramientas para empresas → Respuestas automáticas / Preguntas frecuentes), para que no se pise con el bot.

## Piezas

| Pieza | Dónde |
|---|---|
| Contenedor | `n8n` (imagen `n8nio/n8n:stable`, 2.x), `/srv/docker/compose/n8n/docker-compose.yml` |
| Datos (flujos, cuenta, ejecuciones) | volumen Docker `n8n_n8n-data` → `/home/node/.n8n` |
| Secretos | `/srv/docker/compose/n8n/.env` (N8N_ENCRYPTION_KEY, IG_VERIFY_TOKEN, IG_APP_SECRET, IG_ACCESS_TOKEN, NTFY_URL, LINK_*) |
| Túnel | `/etc/cloudflared/config.yml`, regla `n8n.8vobit.xyz → http://127.0.0.1:5678` |
| App de Meta | "8vobit DM", ID `1009509995498920`, **publicada (Live)** el 17-oct-2026, cuenta @8vobit suscrita a `messages` |
| Política de privacidad | https://8vobit.xyz/privacidad/ (`/srv/docker/compose/home-8vobit/site/privacidad/`) |
| Flujo exportable | `infra/n8n/flujo-dm-instagram.json` en el repo |

## Revisar que funciona (sin tocar nada)

```bash
# 1. Contenedor arriba
docker ps --filter name=n8n --format '{{.Names}} {{.Status}}'

# 2. Webhook vivo: con un token falso debe responder "token invalido"
curl -s 'https://n8n.8vobit.xyz/webhook/instagram?hub.mode=subscribe&hub.verify_token=x&hub.challenge=ok'

# 3. Flujo activo
docker exec n8n n8n list:workflow --active=true

# 4. Últimas ejecuciones (se guardan 14 días)
docker exec n8n n8n export:workflow --id=GOhImTsPA0GizMPu --output=/tmp/f.json >/dev/null && echo flujo-ok
docker logs --since 24h n8n 2>&1 | tail -n 50

# 5. Token de Instagram válido (lee el token del .env sin mostrarlo)
sudo sh -c '. /srv/docker/compose/n8n/.env; curl -s "https://graph.instagram.com/v21.0/me?fields=username&access_token=$IG_ACCESS_TOKEN"'
#   → {"username":"8vobit",...}. Si da error 190, el token venció.

# 6. Suscripción de la cuenta a mensajes
sudo sh -c '. /srv/docker/compose/n8n/.env; curl -s "https://graph.instagram.com/v21.0/me/subscribed_apps?access_token=$IG_ACCESS_TOKEN"'
```

Prueba de punta a punta: desde otra cuenta de Instagram escribir "quiero una demo" a @8vobit. Debe llegar la respuesta DEMO y un aviso ntfy. Probado OK el 17-oct-2026 desde @gabq.c.

## Mantención

- **El token vence a los 60 días: renovar antes del 16-dic-2026.**
  `curl "https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=<TOKEN>"`, pegar el nuevo en `.env` y luego `cd /srv/docker/compose/n8n && sudo docker compose up -d --force-recreate`.
- Cambios en `.env` → siempre `up -d --force-recreate` (un `restart` no relee el `.env`).
- Activar un flujo en n8n 2.x: `docker exec n8n n8n publish:workflow --id=<ID>` y luego `docker compose restart n8n` (`update:workflow` está obsoleto).
- Textos de respuesta: en n8n, nodo *Verificar firma y clasificar*, objeto `RESPUESTAS`. Actualizar también `flujo-dm-instagram.json` en el repo.
- Memoria acotada: 512 MB (el servidor tiene 7,5 GB y Immich usa ~5 GB).
- Instagram solo permite responder dentro de 24 h del último mensaje de la persona.

## Si deja de responder

1. ¿Contenedor arriba? (paso 1). Si no: `cd /srv/docker/compose/n8n && sudo docker compose up -d`.
2. ¿Webhook responde? (paso 2). Si no: `sudo systemctl status cloudflared`.
3. ¿Token válido? (paso 5). Error 190 → renovarlo.
4. ¿Suscripción activa? (paso 6). Si no aparece `messages`: `POST /me/subscribed_apps?subscribed_fields=messages` con el token.
5. En la interfaz de n8n (`https://n8n.8vobit.xyz`, cuenta de Gabriel), *Executions* muestra cada aviso y el nodo que falló.
