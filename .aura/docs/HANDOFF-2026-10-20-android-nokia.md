# Handoff · 20 oct 2026 · Panel de pedidos en teléfono (Nokia 3.1 Plus)

Para retomar en otra sesión. Lee primero `CLAUDE.md`, `pedidos/PENDIENTES.md` y `.aura/docs/report-pedidos-caja-promos-2026-10-20.md`.
El usuario escribe en español de Chile; responder en español.

## 1. Dónde quedó todo

- Rama `claude/compassionate-maxwell-hb826m`, al día con origin. Último commit: `f1c0f47`. `npm test`: **87/87**.
- **Producción (https://pedidos.8vobit.xyz) está al día** hasta los cupos de unidades (desplegado 2026-10-20 19:51; respaldo en `/srv/docker/compose/pedidos.prev-20261020-195157`). Nada pendiente de desplegar.
- Sin commitear (ajenos a este trabajo, no tocar): `marketing/REVISION-WEB-2026-10-18.md`, `marketing/VALORIZACION-WEB.md`, `pedidos/REVISION-UX-PROMPT.md`.
- Hecho en esta sesión (detalle en el reporte): caja rediseñada, gastos rápidos, pago mixto, propina, fiado, entregar la caja, voucher/cartola, nota obligatoria por umbral (ajustable por local), arqueo ciego, combos con precio propio, ideas según ventas, quitar promociones, cupos de unidades.

## 2. Lo que se estaba haciendo: probar el panel en un teléfono real

Objetivo del usuario: que el panel se use en un **teléfono** (no solo tablet), probarlo en el Android que está **conectado por USB al VPS** y dejarlo **ultra liviano**.

### El teléfono
- **Nokia 3.1 Plus** (HMD, MediaTek), serial adb `ROOGAGH933000180`, Android 10 (SDK 29), parche de seguridad 2021-01-05.
- Pantalla 720x1440, densidad 280 (≈ 411 px CSS de ancho). RAM total ~1,8 GB (MemAvailable ~500 MB), `/data` 7 GB (1,6 usados), batería ~78 %.
- Al medirlo traía **Chrome y WebView 81.0.4044.138** (muy viejos); Play Store estaba actualizando cosas. **Volver a leer la versión** antes de concluir nada.
- 271 paquetes, solo 2 de terceros.
- Se le hizo reset de fábrica (el usuario no recordaba el patrón). Muestra "NVRAM WARNING Err=0x10" en Wi-Fi (normal en MediaTek tras el reset). Wi-Fi ya conectado. **Tiene bloqueo de pantalla**: hay que pedirle al usuario que lo desbloquee; no intentar saltarlo.
- Se dejó puesto: `screen_off_timeout` = 30 min y `svc power stayon usb` (la pantalla no se apaga mientras esté en USB). Eso es lo único que se cambió en el teléfono.

### Cómo se llega
- Está en USB al servidor **`lenovo-edge`** (`ssh gabriel@lenovo-edge`). Se instaló `adb` ahí con `sudo apt-get install adb` (1.0.41). Desde ese servidor: `adb devices -l`, `adb shell ...`, `adb exec-out screencap -p > /tmp/x.png`, luego `scp` para traer la imagen al PC y leerla con Read.
- El adb de REA (`mcp__rea__*`) busca `adb` en este PC y no lo encuentra; no sirve salvo que se configure `REA_ADB_PATH` o se instale adb en Windows.
- El teléfono se puede abrir en el panel por Wi-Fi/Internet (https://pedidos.8vobit.xyz/panel). Alternativa sin red: `adb reverse` por el cable.

### Último paso: se detuvo
El usuario **rechazó** el último comando (abrir `https://pedidos.8vobit.xyz/gassuso` en Chrome del Nokia por ssh + captura) y pidió este handoff. No sé por qué lo rechazó. **No volver a tocar el teléfono hasta que el usuario lo confirme.** Preguntar primero.

## 3. Plan para el teléfono (pendiente)

1. Con permiso del usuario: leer versión de Chrome/WebView, RAM libre, espacio. Abrir la carta y el panel en Chrome y recorrerlos con capturas.
2. Revisar en el panel (pantalla de ~411 px): menú de pestañas, Venta rápida, diálogo de cobro (pago dividido, propina, fiar), Caja del día (hero + cerrar caja), Promociones/Combos, teclado tapando campos, botones táctiles ≥ 44 px, velocidad (refresco automático en un gama baja), sonido de pedido nuevo, instalar como app (PWA) y fijar pantalla. Leer `adb logcat` por errores de JS.
3. Corregir lo que falle con el mismo `/code-loop` de siempre.
4. **Debloat ultra liviano por adb, sin root ni bootloader**: `adb shell pm uninstall --user 0 <paquete>` (reversible: `cmd package install-existing`). **Mostrar la lista al usuario antes de quitar nada.** Referencias: [Nokia-Debloater](https://github.com/thanuj10/Nokia-Debloater), [UAD-ng](https://cdn.jsdelivr.net/gh/universal-debloater-alliance/universal-android-debloater-next-generation@main/README.md). Quitar apps de Google que no se usan (YouTube, Gmail, Maps, Duo, Fotos, música, películas, asistente), apps evenwell/telemetría; **dejar Chrome y WebView**. Apagar las 3 escalas de animación (`settings put global window_animation_scale 0` y equivalentes), desactivar actualizaciones automáticas. Medir RAM libre y tiempo de carga antes y después.
5. Instalar el panel como app y fijar pantalla (pinning) para dejarlo como terminal del local.

## 4. Límites que me pusieron (no insistir ni rodear)

- El permiso de la sesión **bloqueó** mostrar claves (`PANEL_PASSWORD` / `ADMIN_PASSWORD`) en una terminal y **escanear el Wi-Fi** desde el servidor. Las claves viven en `/srv/docker/compose/pedidos/.env` (solo root): el usuario las lee él mismo con `sudo grep -E '^(PANEL_PASSWORD|ADMIN_PASSWORD)=' /srv/docker/compose/pedidos/.env` por ssh. No guardar claves en archivos ni en memoria.
- No ayudar a saltarse el bloqueo de pantalla ni la cuenta de Google (FRP) del teléfono.
- La clave de cada local se guarda cifrada: solo se reemplaza desde `/admin`.

## 5. Cómo trabajar (lo que aprendimos)

- **Local**: `.claude/launch.json` tiene `pedidos` (puerto 8099, plan Gestión) y `pedidos-pro` (8123, plan Pro; sirve para Promociones/Inventario). Entrar con código de local `gassuso` y clave `demo`. El servidor de desarrollo **cachea los estáticos al arrancar**: reiniciarlo (`preview_stop` + `preview_start`) para ver cambios en `panel*.js` o `panel.html`.
- **Datos de prueba locales**: "Combo prueba" (combo con cupo diario 1, ya agotado), promos "Martes de prueba", "Prueba código", un fiado de "Vecino Juan", una propina, etc. Solo en la base de desarrollo.
- **Tests**: `cd pedidos && npm test`. **Hacer commit solo si `fail 0`.** En Windows hubo un EPERM intermitente al borrar la carpeta temporal; ya está corregido (`f1c0f47`).
- **Despliegue** lo corre quien tiene permiso: `powershell -ExecutionPolicy Bypass -File .\pedidos\deploy\desplegar.ps1` desde `D:\8vobit`. Pide confirmación del usuario cada vez (dijo "no despliegues aún" varias veces: respetarlo).
- **`/code-loop`**: los agentes coder (`af68076700f4459c5`) y reviewer (`adb2a334b6184d6bd`) son de esta sesión y **no se podrán reanudar**; en la sesión nueva, lanzar uno nuevo con la brief del skill (`~/.claude/skills/code-loop/{coder,reviewer}/AGENT.md`). Verificar siempre en el navegador antes de pasar al reviewer.
- Commits con la línea `Co-Authored-By` del recordatorio de atribución vigente. Rama de trabajo: la de arriba; commit y push al terminar cada cambio.
- Al terminar algo importante, actualizar `pedidos/PENDIENTES.md` y este tipo de registro en `.aura/docs/`.

## 6. Pendientes que no son del teléfono (resumen)

- **Del dueño de Gassuso**: datos de transferencia; precios de *Pollo + 1 ingr.* y *Vegetariano*; despacho real; vehículo/repartidor; costos de insumos (sin ellos el margen se estima al 35 %); y **confirmar dos criterios de los cupos**: el descuento parcial va primero a las unidades **más caras** y el monto fijo con cupo se **prorratea** por unidades.
- **Del usuario**: probar todo en el local (tablet + impresora 80 mm); crear el monitor UptimeRobot (`pedidos/deploy/MONITOREO.md`); poner `INDEXAR=1` al lanzar; completar el paquete legal y firmarlo con Gassuso antes del **1-dic-2026** (Ley 21.719).
- **Técnico, por valor**: embudo de prospectos y horas de soporte por local en `/admin`; contratar online desde 8vobit.xyz (prueba de 14 días, ya decidido en PENDIENTES); importar carta desde foto; inventario simple; SII directo; cobro automático de licencias.
- Una sesión paralela agregó `c8444ce` (entrega del local, plantillas legales) y `05a8821` (mensajes del pedido); ver `PENDIENTES.md`.
