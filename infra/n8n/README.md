# Respuestas automáticas de DM en Instagram (n8n en lenovo-edge)

Cuando alguien escribe **AGENDA**, **DEMO**, **WEB** o **AGENDA PRO** por DM a @8vobit:
1. Meta avisa a `https://n8n.8vobit.xyz/webhook/instagram`.
2. n8n verifica la firma (App Secret), reconoce la palabra clave y responde el DM con la API de Instagram.
3. Te llega un aviso al celular por ntfy (tema `8vobit-dm`).

Los mensajes sin palabra clave no se tocan: los contestas tú.

**Costo:** según lo que se encontró, Meta no cobra por mensaje en la API de Instagram (sí cobra en WhatsApp, que aquí no se usa). n8n corre en el servidor propio. Confirmar en la documentación oficial de Meta.

Archivos: `docker-compose.yml`, `.env.example` y `flujo-dm-instagram.json` (se importa en n8n).

---

## Estado (2026-10-17)

- ✅ n8n corriendo en lenovo-edge (`/srv/docker/compose/n8n`, puerto 127.0.0.1:5678) y publicado en `https://n8n.8vobit.xyz` por el túnel.
- ✅ `.env` creado en el servidor con `N8N_ENCRYPTION_KEY` e `IG_VERIFY_TOKEN` generados allí. Faltan `IG_APP_SECRET` e `IG_ACCESS_TOKEN` (parte 2).
- ✅ Flujo importado y **publicado/activo** (ID `GOhImTsPA0GizMPu`). En n8n 2.x se activa con `docker exec n8n n8n publish:workflow --id=GOhImTsPA0GizMPu` y luego `docker compose restart n8n`. Verificación GET probada: devuelve el challenge con el token correcto y rechaza los falsos.
- ✅ @8vobit agregada como evaluadora de Instagram y conectada en la app. URL del webhook escrita en Meta.
- ✅ App de Meta **"8vobit DM"** creada (ID `1009509995498920`, caso de uso *Administrar mensajes y contenido en Instagram*, sin portfolio comercial por ahora; modo desarrollo).
- ✅ Cuenta de dueño de n8n creada por Gabriel.
- ✅ Token y App Secret cargados en el `.env` (17-oct). El token responde como @8vobit. **Vence en 60 días: renovar antes del 16-dic-2026.**
- ✅ Webhook verificado en Meta y @8vobit suscrita al campo `messages` (vía API: `POST /me/subscribed_apps?subscribed_fields=messages`).
- ✅ App **publicada** (modo Live, 17-oct) con política en https://8vobit.xyz/privacidad/ y categoría Negocios y páginas.
- ✅ Prueba real OK (17-oct): DM "quiero una demo" desde @gabq.c respondido automáticamente.
- (antes) Falta crear la cuenta de dueño en `https://n8n.8vobit.xyz`: hacerlo cuanto antes, porque mientras no exista, cualquiera que entre puede reclamarla.

## Parte 1 · Servidor (hecha)

1. Crear `/srv/docker/compose/n8n/` con `docker-compose.yml` y `.env` (a partir de `.env.example`). Generar en el servidor `N8N_ENCRYPTION_KEY` e `IG_VERIFY_TOKEN` con `openssl rand -hex`.
2. Agregar al túnel (en `/etc/cloudflared/config.yml`, antes de la regla 404):
   ```yaml
   - hostname: n8n.8vobit.xyz
     service: http://127.0.0.1:5678
   ```
   Y crear el DNS: `cloudflared tunnel route dns <túnel> n8n.8vobit.xyz`. Después: `sudo systemctl restart cloudflared`.
3. `docker compose up -d` y abrir `https://n8n.8vobit.xyz`: **tú** creas la cuenta de dueño de n8n (correo y clave, que solo tú conoces).
4. En n8n: *Workflows → Import from file →* `flujo-dm-instagram.json`. Dejarlo **inactivo** hasta terminar la parte 2.

## Parte 2 · Meta (la haces tú: son tus cuentas y tus claves)

Requisitos: @8vobit tiene que ser una **cuenta profesional** (empresa o creador). Ya lo es.

1. Entra a **developers.facebook.com → Mis apps → Crear app**. Tipo: *Empresa*. Nombre: "8vobit DM".
2. Agrega el producto **Instagram → API con inicio de sesión de Instagram**.
3. En *Generar tokens de acceso*, conecta la cuenta **@8vobit** y copia el **token** (va en `IG_ACCESS_TOKEN`). Activa los permisos `instagram_business_basic` e `instagram_business_manage_messages`.
4. En *Configuración → Básica*, copia el **App Secret** (va en `IG_APP_SECRET`).
5. En *Configurar webhooks*:
   - URL de devolución: `https://n8n.8vobit.xyz/webhook/instagram`
   - Token de verificación: el `IG_VERIFY_TOKEN` del `.env`.
   - Suscríbete al campo **messages**.
   (Antes de verificar, activa el flujo en n8n para que responda el "challenge").
6. En la app de Instagram de @8vobit: *Configuración → Privacidad → Mensajes → Herramientas conectadas*: permitir el acceso a mensajes.
7. Mientras la app está en **modo desarrollo**, solo responde a cuentas que agregues como probadoras. Para que funcione con cualquier persona hay que pedir **acceso avanzado** a `instagram_business_manage_messages` en la *Revisión de la app* (Meta pide un video corto mostrando el uso y la política de privacidad: se puede usar la de 8vobit.xyz).

Los tres valores (token, App Secret y verify token) se pegan en el `.env` del servidor, nunca en el repo ni en el chat.

## Mantención

- **El token dura 60 días.** Renovarlo antes del vencimiento (desde el panel de Meta o con el endpoint `refresh_access_token`) y actualizar el `.env` (`docker compose up -d`). Anotar en el calendario la fecha de vencimiento.
- Las ejecuciones se guardan 14 días (`EXECUTIONS_DATA_MAX_AGE=336`).
- Para cambiar los textos de respuesta: en n8n, nodo *Verificar firma y clasificar*, objeto `RESPUESTAS`.
- Instagram solo permite responder dentro de las **24 horas** después del último mensaje de la persona. El flujo responde al instante, así que no hay problema.

## Prueba

1. Con el flujo activo, desde una cuenta probadora escribe "quiero una demo" a @8vobit.
2. Debería llegar la respuesta de DEMO y un aviso ntfy "DM Instagram: DEMO".
3. Si no llega: en n8n, *Executions* muestra cada aviso de Meta y el error del nodo que falló.
