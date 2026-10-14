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

**Caja del día** (con ‹ › para revisar días anteriores; los folios de boleta se escriben en la misma tabla, Enter guarda y pasa al siguiente): cobrado total, efectivo en caja, por medio de pago, por canal
(web / mostrador), ticket promedio, por cobrar, anulados, boletas por emitir
(con registro de folio) y detalle imprimible.

**Carta y precios** (pensada para cargar datos rápido en la tablet): buscador, filtros *Sin precio /
No disponibles / Sin foto*, saltos por categoría y una fila por producto con foto (tocarla la
cambia), precio con formato `$4.990` que se guarda al salir del campo o con Enter (un cambio
grande, como un cero de más, pide confirmación), e interruptores *Disponible* y *Sugerir*. La ficha
del producto (⋯ o el nombre) edita nombre, descripción, categoría, ingredientes a elegir, destacado,
orden, y permite **crear productos y categorías** y quitarlos de la carta (se archivan: los pedidos
anteriores no cambian). Ingredientes y salsas se agregan, renombran, quitan o marcan agotados ahí mismo.

**Costo de productos**: cada producto puede tener su **costo de insumos** por unidad (ficha del
producto, con el margen en vivo: "deja $3.190 · 64%"); si falta, se estima con un % del precio
(*Costo estimado 35%* en Carta y precios, filtro *Sin costo*). Cada venta guarda el costo del momento
(si después cambia, las ventas viejas no se alteran). El Resumen muestra el **margen de la comida**
(ventas − insumos) y en Equipo, "Para cubrir el reparto" usa lo que deja cada despacho de verdad:
margen de la comida + tarifa − bencina − bono. Los costos solo se ven en el panel.

**Datos del local** (por secciones, con índice y una barra *Guardar* que aparece al haber cambios y
avisa si se sale sin guardar; RUT con dígito verificador, banco y tipo de cuenta a elegir): nombre, WhatsApp, teléfono para llamadas (botón "Llamar" en la carta
y el seguimiento), Instagram, dirección, horario por día (días
cerrados; misma hora de apertura y cierre = 24 h), cupo de pedidos por franja y datos
para transferencia, que el cliente ve al pagar y en el seguimiento.

**Despacho** (pestaña propia del panel): encendido/apagado, pedido mínimo, texto de zona, **horario
propio por día** y cómo se cobra:
- *Precio único*: el mismo costo a cualquier dirección.
- *Por zonas en el mapa* (como Uber): la comuna se divide en **hexágonos** (chicos ≈ 500 m, medianos
  ≈ 800 m, grandes ≈ 1,2 km). Cada hexágono toma el precio del **tramo de distancia** en que cae su
  centro (ej. hasta 1,5 km $1.500, hasta 3 km $2.000, hasta 5 km $2.800) y el dueño puede **tocar un
  hexágono** para darle otro precio o **bloquearlo**. El pin del local se arrastra si no está en su
  lugar, y "Probar una dirección" muestra cuánto pagaría un cliente.

**Vehículos y costo del viaje** (misma pestaña): se crean los vehículos con que se despacha (moto,
auto, bicicleta…) con su rendimiento (km/l), precio del litro, mantención por km, velocidad en ciudad,
pago al repartidor (por hora y/o fijo por viaje) y minutos por entrega. El costo de un despacho se
calcula con la distancia del mapa × un **factor de calles** (las calles no van en línea recta: ×1,25
centro con cuadras, ×1,35 ciudad mixta, ×1,5 con cerros, puentes o ríos) y, si se marca, **ida y
vuelta** al local. La tabla *¿Sale a cuenta?* muestra por tramo el recorrido, el costo, el precio
**sugerido** (costo + % de ganancia, redondeado) y lo que queda con el precio actual; *Usar precios
sugeridos* los aplica y *Proponer tramos para mi área* arma 3 tramos parejos hasta el borde del área
que hoy se despacha. En el mapa, la vista *¿Sale a cuenta?* pinta cada sector en verde (gana lo
pedido), amarillo (solo cubre el costo) o rojo (pierde). Cada pedido guarda su costo estimado y el
Resumen semanal compara lo cobrado por despacho con lo que costaron los viajes.

**Equipo** (pestaña propia): trabajadores (repartidor, cocina, caja) con contrato (plazo fijo o
indefinido), turno por día con colación, sueldo base, bono por entrega y si usan vehículo propio. El
cálculo (`public/laboral.js`, compartido con el servidor) es una **estimación** según la ley chilena:
mínimo proporcional a las horas (IMM $553.553 × horas / 42, Ley 21.830), valor hora ordinaria, recargo
dominical 30 % (art. 38), gratificación art. 50 (25 %, tope 4,75 IMM al año), cargas del empleador (SIS,
mutual, cesantía, aporte Ley 21.735) y descuentos del trabajador para estimar el líquido. Avisa si el
turno pasa de 10 h diarias, si sin colación pasa de 6 h, si deja de ser jornada parcial (más de 28 h) y
**no deja guardar** un sueldo bajo el mínimo o una jornada sobre la máxima. Los parámetros (IMM, tasas)
se editan al cambiar la ley. Cada vehículo puede tener su repartidor: entonces el viaje se costea con
su costo real por hora de turno más el bono, cada despacho queda asignado a quien lo entregó (se
puede cambiar en la tarjeta del pedido) y la pestaña muestra por mes entregas, km, costo empresa,
líquido estimado y **cuántos despachos al mes cubren el costo del reparto**. Los sueldos y RUT solo
se ven en el panel (no en la carta pública).

En la carta, con despacho por zonas, el cliente escribe su dirección y toca *Buscar* (o *Usar mi
ubicación*), ajusta el pin moviendo el mapa y ve al tiro el costo o "No despachamos a este punto".
El servidor recalcula el costo con la ubicación (no confía en el navegador) y guarda las coordenadas:
la tarjeta del pedido trae *Ver en el mapa* (Google Maps, para el repartidor) y la distancia.

Mapa: OpenStreetMap con [Leaflet](https://leafletjs.com) incluido en `public/` (BSD-2). Las
direcciones se buscan con Nominatim (OpenStreetMap) **a través del servidor**: con caché de 30 días,
una consulta por segundo como pide su política, búsqueda por calle + número + comuna y resultados de
la comuna del local primero. Si no responde, el cliente igual puede marcar su ubicación en el mapa.
La grilla de hexágonos es propia (`public/hex.js`), la misma en el servidor y en el navegador.

**Pausar pedidos web** (botón en la barra superior): la carta avisa "Pedidos en línea
pausados" y no deja agregar; el mostrador sigue funcionando.

**Observaciones**: por producto ("sin cebolla", 140 caracteres) y un comentario general
del pedido (300). Se guardan sin caracteres de control y se muestran siempre escapadas;
en la comanda la observación sale en mayúsculas para que la cocina no la pase por alto.

**Resumen semanal** (pestaña Resumen): los 6 números del plan con la semana anterior
como comparación: pedidos, ticket promedio, plato más y menos vendido, hora peak y hora
valle (solo horas centrales, por día abierto, para que sirva como hora de promo),
clientes que repitieron y **comisión ahorrada** (ventas web × % de la app, configurable
en Datos del local). Ventas por día y pedidos por hora con tabla equivalente, por canal,
ranking de platos y botón **Enviar por WhatsApp** con el texto listo.

**Salsas** (Mostaza, Ketchup, Ají receta Gassuso): opcionales y sin costo, aparte de los
ingredientes obligatorios de los "+N ingr."; se ofrecen en todas las categorías salvo bebidas y
jugos, en la carta y en la venta rápida. Se agotan desde Carta y precios y salen en la comanda.

**Venta sugerida** (productos con "Sugerir" en Carta y precios; por defecto Papas, Bebida en
lata, Jugo natural y Batido de frutilla), en tres momentos:
1. Al agregar un plato, un aviso "¿Le sumas Papas por $2.990?" con botón Agregar: una sola vez
   por visita y solo de categorías que no estén en el carro.
2. En el carro, "¿Lo acompañas con algo?" con hasta 4 acompañamientos de un toque.
3. En la venta rápida, una línea "Ofrece:" como guion para quien atiende.
Cada línea agregada desde una sugerencia queda marcada y el Resumen muestra cuánto vendió.

**Material impreso** (Carta y precios → *Cartel y tarjetas con QR*): cartel A4 para el mostrador
y 8 tarjetas por hoja para las bolsas, con el logo, el QR a la carta y los datos de contacto.

**Tablet del local**: el panel se puede instalar como app (menú del navegador → *Instalar* o
*Agregar a pantalla de inicio*) y mantiene la pantalla encendida mientras está abierto.

**Antes del lanzamiento** nada se indexa en buscadores (`X-Robots-Tag` y `robots.txt`). Al lanzar,
agregar `INDEXAR=1` al `.env` del servidor y volver a desplegar.

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
- **Respaldo fuera del servidor** (desde Windows, en la carpeta del repo):
  `powershell -ExecutionPolicy Bypass -File .\pedidos\deploy\respaldo.ps1 -Instalar`.
  Pide al servidor una copia consistente (base + fotos, [`deploy/exportar.sh`](deploy/exportar.sh)),
  la descarga a `D:\Respaldos\pedidos`, verifica que se pueda abrir y conserva las últimas 30.
  `-Instalar` además la programa todos los días a las 13:00 (o al prender el PC). `-Restaurar`
  muestra los pasos para volver a una copia.
- **Caché**: Cloudflare impone 4 h de caché de navegador a `.js` y `.css`. Por eso las
  páginas referencian `comun.js?v=<hash>` y `carta.css?v=<hash>` (el servidor los agrega
  al servir): cada despliegue cambia la URL y nadie queda con una versión vieja. Esas
  URLs versionadas se sirven con caché de un año (`immutable`).
- `docker stop` cierra limpio (termina respuestas en curso y cierra la base).

## Pruebas

```bash
npm test   # 46 pruebas de punta a punta, sin dependencias, ~1 s
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
  recargos de agregados; ingrediente del Diplomático; bebidas.
- Modo 3 (boleta integrada con SimpleAPI), promociones, métricas semanales.
