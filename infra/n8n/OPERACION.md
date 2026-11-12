# n8n · DM automáticos de Instagram (@octavobit.cl): cómo funciona y cómo revisarlo

Este archivo vive en el servidor en `/srv/docker/compose/n8n/OPERACION.md` y en el repo en `infra/n8n/OPERACION.md`.
Cualquier sesión puede leerlo para saber qué hay y cómo verificarlo. **Aquí no hay secretos**: los secretos están solo en `.env` (root, 600).

## Qué hace

1. Alguien escribe un DM a @octavobit.cl en Instagram.
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
| App de Meta | "8vobit DM", ID `1009509995498920`, **publicada (Live)** el 17-oct-2026, cuenta @octavobit.cl suscrita a `messages` |
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

Prueba de punta a punta: desde otra cuenta de Instagram escribir "quiero una demo" a @octavobit.cl. Debe llegar la respuesta DEMO y un aviso ntfy. Probado OK el 17-oct-2026 desde @gabq.c.

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

## Registro de despliegues

- **11-nov-2026** · Diálogos A y B de `centro-negocios-marketing/DIALOGOS-BOT-V2-2026-11.md`.
  - **«Memoria» no siempre es RAM.** Se separó en síntoma, duda (pregunta 1/2), RAM explícita (pregunta cotizar/diagnóstico), SSD, pieza propia, compatibilidad y miedo. Las preguntas 1/2 se recuerdan 24 h; si la respuesta no se entiende, el bot repregunta una vez y a la segunda pasa a Gabriel con aviso urgente.
  - **Aviso «fuera de Concepción».** Se activa con `MODO_FUERA=AAAA-MM-DD` (último día fuera) en `.env` y se apaga solo después de esa fecha. Hoy no está definido, así que está apagado. Para activarlo: agregar la línea al `.env` y correr `up -d --force-recreate`.
  - **Verificación.** 59 pruebas OK, flujo activo con el código nuevo, 0 errores en el log y webhook vivo. Falta la prueba de punta a punta desde otra cuenta.
- **11-nov-2026** · Diálogo C («página con agenda», palabra clave AGENDA) de `DIALOGOS-BOT-V2-2026-11.md`.
  - **Flujo.** Ya no hay menú de 4 botones, ni «¿para cuándo?», ni precio, ni reunión de 45 min por Meet. El bot guarda rubro, marca, cómo agenda hoy, qué quiere y las señales (pidió precio, viene recomendado, compara, teléfono), y pregunta solo lo que falta. Después muestra `8vobit.xyz/#agendar` y ofrece una llamada de 15 min por WhatsApp (`#reunion`).
  - **Avisos.** AG-3 manda un aviso normal y AG-4a uno urgente, ambos con un resumen «Lead agenda · …». LLAMADA lleva a la reunión en cualquier momento. Si piden precio por segunda vez, va aviso urgente.
  - **Entradas.** Siempre entran AGENDA, «página web», «sitio web», «landing», «desarrollo web», «web» suelto y el botón. Las frases libres («tienda online», «quiero una web/página para…», «vender por internet»…) entran solo si el mensaje no trae un síntoma o servicio de reparación.
  - **DEMO (Pedidos).** Sin cambios; sigue ofreciendo su reunión de 45 min por Meet.
  - **Verificación.** 104 pruebas OK, flujo activo, webhook vivo. Los 3 errores del log son del catálogo de api.n8n.io (timeout), no del bot.
  - **Pendiente menor.** «web» suelto en una frase puede abrir el flujo con mensajes como «la web del SII no abre».
- **11-nov-2026 (noche)** · Diálogos D (seguimiento) y E (respuestas fuera de norma) de `DIALOGOS-BOT-V2-2026-11.md`.
  - **Seguimiento automático.** Nodo nuevo «Cada 15 minutos» → «Seguimientos» → «Responder seguimiento». Manda **un solo mensaje** por episodio, a las 5 h del último mensaje del cliente, solo entre 10:00 y 20:00 (hora de Chile), nunca después de 23 h (ventana de 24 h de Meta). Tipos: SEG-1 (recibió el link de la llamada y no agendó), SEG-2 (quedó a medias en las preguntas), SEG-3 (reparación: dijo «voy» o «agendé» y no llegó). Se cancela si el cliente posterga, dice que agendó, dice «ahora no», si escribe después, o si Gabriel responde a mano. Un «ok» o «jaja» como respuesta no escala; un «sí» tras SEG-1 manda el link de la llamada.
  - **Respuestas fuera de norma.** Audios, fotos y videos; «no sé el modelo»; objeción de precio; claves; «¿eres un bot?»; urgencia; dos temas; mensaje para otra persona; spam ampliado; insulto o sin sentido; acuses sueltos («ok», «jaja») sin bienvenida.
  - **Claves.** Si el cliente manda una clave, el bot responde que no se mande por chat y el aviso a ntfy dice `[mensaje con clave, oculto]`. **Ojo:** n8n guarda el mensaje original en el registro de ejecuciones (14 días); revisar esa retención si importa.
  - **Garantía.** `GARANTIA_ACTIVA = false` en `cerebro.js`: el bot dice que existe y que Gabriel la detalla. Para activar el texto con el mínimo legal (30 días hábiles, art. 41 Ley 19.496), confirmar el plazo en la fuente oficial y escribirlo en la boleta.
  - **Limitación conocida.** La memoria de contactos vive en el static data de n8n: dos ejecuciones simultáneas (el cron y un mensaje) pueden pisarse. El arreglo real es una base externa. Tampoco hay espera de ráfagas (el cliente que manda 3 mensajes seguidos recibe una respuesta por mensaje).
  - **Verificación.** 146 pruebas OK, flujo con 13 nodos, importado y activo, webhook vivo, sin errores del bot en el log. Falta ver la primera ejecución real del cron.

- **12-nov-2026 · Plazo de piezas y usuario nuevo.** `cerebro.js`: respuesta de tiempos ahora dice que una pantalla importada demora 7 a 14 días hábiles (otras piezas importadas, 2 a 4 semanas; con stock en Santiago, 2 a 7 días). Comentarios y documentación pasan a @octavobit.cl. **Verificación:** 146 pruebas OK, flujo de 13 nodos importado y publicado (`GOhImTsPA0GizMPu`), n8n reiniciado, webhook vivo (responde «token invalido» con token falso tras unos segundos de arranque). Falta la prueba de punta a punta desde otra cuenta de Instagram a @octavobit.cl.
