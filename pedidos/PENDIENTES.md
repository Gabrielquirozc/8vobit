# Traspaso: estado del proyecto y cómo seguir desde local

Última actualización: 2026-10-16 (promociones y combos, inventario y recetas, clientes y cupón de vuelta; revisión UX en `REVISION-UX.md` y `ESTUDIO-UX.md`, con alertas de pedidos nuevos en todas las pestañas, sonido que se repite, local nuevo en pausa, recordar datos del cliente y orden de entrega de despachos; tarifa por pedido a 1 % sin tope; paquete legal en `legal/`; autoservicio: primeros pasos e importar carta; multi-local, PIN y roles, licencias, /admin, resultados; etapa 1 de control; estrategia: competencia Fudo/Justo, producto de entrada, planes,
líneas de trabajo y gestor de licencias en `ESTRATEGIA.md`). Rama de trabajo: `claude/compassionate-maxwell-hb826m`
(repo `gabrielquirozc/8vobit`, carpeta `pedidos/`). Este archivo es el punto de partida si se
sigue sin la sesión en la nube: con Claude Code en el PC (`claude` dentro de `D:\8vobit`) basta
decirle "lee pedidos/PENDIENTES.md y sigamos".

## Qué es y dónde corre

- Sistema de pedidos directos para locales (piloto: **Gassuso**, Janequeo 507, Concepción).
- Producción: https://pedidos.8vobit.xyz/gassuso (carta) y `/panel` (panel del local).
  La clave del panel está en `/srv/docker/compose/pedidos/.env` en lenovo-edge (no va al repo).
- Servidor: `lenovo-edge`, contenedor Docker `pedidos` (128 MB, puerto host 8100 → 8099),
  datos en el volumen `pedidos_pedidos-data` (`/data`: `pedidos.db`, `img/`, `backups/`).
  Túnel Cloudflare `pedidos.8vobit.xyz → 127.0.0.1:8100`.
- **Aún no es público**: `X-Robots-Tag: noindex` y `robots.txt` bloquean buscadores hasta poner
  `INDEXAR=1` en el `.env` del servidor.

## Cómo trabajar en local (Windows)

```powershell
cd D:\8vobit
git pull origin claude/compassionate-maxwell-hb826m
cd pedidos
$env:PANEL_PASSWORD="demo"; node server.mjs        # http://127.0.0.1:8099/gassuso y /panel (clave demo)
npm test                                           # 74 pruebas (API de punta a punta + orden de entrega), ~1-2 s
```

Requisitos: Node 22 (usa `node:sqlite`, sin dependencias npm). Los datos locales quedan en
`pedidos/data/` (borrar `data/pedidos.db` recarga la carta desde `seed/gassuso.json`).

Desplegar (corre las pruebas en el servidor antes de tocar nada):

```powershell
cd D:\8vobit
powershell -ExecutionPolicy Bypass -File .\pedidos\deploy\desplegar.ps1
```

Respaldo fuera del servidor (una vez; queda programado a diario):
`powershell -ExecutionPolicy Bypass -File .\pedidos\deploy\respaldo.ps1 -Instalar`

## Mapa del código

| Archivo | Qué hace |
|---|---|
| `server.mjs` | Todo el backend: base SQLite y migraciones idempotentes, API pública y del panel, CSP, límites, respaldos |
| `public/carta.html` + `carta.css` | Carta del cliente: categorías, ficha de producto (ingredientes, salsas, nota), carro, sugeridos, despacho con mapa, confirmación |
| `public/panel.html` | Panel del local: Pedidos, Venta rápida, Caja del día, Resumen, Carta y precios, Despacho, Equipo, Datos del local |
| `public/hex.js` | Zonas de despacho en hexágonos y costo del viaje por vehículo (compartido servidor/navegador) |
| `public/laboral.js` | Sueldo estimado del repartidor según la ley chilena (compartido servidor/navegador) |
| `lib/caja.mjs` + `public/panel-caja.js` | Gastos, movimientos de caja, arqueo, exportar y resultados (panel) |
| `lib/exportar.mjs`, `lib/resultados.mjs` | CSV para el contador y estado de resultados |
| `lib/licencias.mjs`, `lib/usuarios.mjs`, `lib/admin.mjs` | Planes y licencias, usuarios con PIN y roles, consola de administración |
| `public/panel-cuenta.js`, `public/admin.html` | Entrada con clave o PIN, permisos en el panel, Tu plan, Usuarios; consola `/admin` |
| `lib/promos.mjs` + `public/panel-promos.js` | Promociones (automáticas por día y horario, por código, por categoría), combos y cupón de vuelta (plan Pro; el cupón, Gestión) |
| `lib/inventario.mjs` + `public/panel-inventario.js` | Insumos, recetas, compras (costo promedio, opcional como gasto), conteo y merma; la venta descuenta y la anulación devuelve (plan Pro) |
| `lib/clientes.mjs` + `public/panel-clientes.js` | Clientes de la carta online: frecuentes, nuevos, dormidos, historial (plan Gestión) |
| `lib/autoservicio.mjs` + `public/panel-inicio.js` | Primeros pasos del local nuevo, importar la carta desde planilla, ayudas por pestaña |
| `deploy/probar-respaldo.mjs`, `deploy/MONITOREO.md` | Prueba de restauración de respaldos y guía de monitoreo |
| `public/comun.js` | Utilidades del navegador (api, clp, esc, emojis, fmtTel) |
| `public/seguimiento.html`, `comanda.html`, `carta-imprimible.html`, `cartel.html` | Seguimiento del cliente, ticket 80 mm, carta PDF, cartel/tarjetas con QR |
| `test/api.test.mjs` | Pruebas contra el servidor real con una base temporal |
| `deploy/` | Despliegue (ps1 + remoto.sh), túnel, exportar/respaldo |
| `README.md` | Descripción completa de cada función |
| `legal/` | Borradores: contrato de servicio + encargo de datos, aviso a trabajadores, acuerdo piloto Gassuso |

Convenciones: sin dependencias externas; textos y comentarios en español; migraciones con
`ALTER TABLE` idempotente (nunca borrar columnas); todo lo del cliente se valida de nuevo en el
servidor; datos sensibles (sueldos, RUT) solo en `/api/panel/*`; antes de desplegar, `npm test`.

## Pendiente con el dueño (antes de mostrar/lanzar)

1. **Datos de transferencia** (titular, RUT, banco, tipo y n° de cuenta, correo) → Datos del local.
2. **Precios** de *Pollo + 1 ingr.* y *Vegetariano* (siguen "sin precio"). Confirmar los 15 precios
   calculados desde Uber ÷ 1,25 (ver `PRECIOS-UBER.md`).
3. **Despacho real**: costo, mínimo, días/horas y zona. Hoy hay una configuración de demo por zonas
   (tramos 1 km $1.500 · 1,8 km $2.000 · 2,3 km $2.500, 6 sectores bloqueados al S/SE y 4 al E a
   $2.000 a mano; uno de esos 4 pierde plata según el costeo con moto).
4. **Vehículo y repartidor reales** (km/l, bencina, cómo se le paga) → pestañas Despacho y Equipo.
5. **Costo de insumos por producto** → Carta y precios, filtro *Sin costo* (mientras tanto se estima 35 %).
6. Confirmar con el contador: si el local cae en el art. 38 N°7 o N°2 (recargo dominical 30 %) y la
   tasa del aporte patronal Ley 21.735 (marcados ⚠️ en Equipo → Parámetros laborales).
7. **Prueba en el local**: tablet con el panel instalado, impresora 80 mm, pedido completo (retiro y
   despacho) hasta la Caja del día.
8. Revisar si el contrato con Uber exige paridad de precios antes de imprimir "precio de local" en
   el cartel.

## Pendiente técnico / próximos pasos sugeridos

- **/admin como tablero del gestor (2026-10-20, `lib/gestion.mjs`)**: imagen 8vobit, escalones 5/10/20/42/50 locales
  con bolsillo estimado (fórmula de VIABILIDAD.md, usa el ingreso real por local), ritmo de altas y meses a la meta,
  hitos con semáforo, cobranza de la semana y riesgo de baja. Falta: **embudo de prospectos** (contactado → demo →
  prueba → pagando) y **horas de soporte por local**; ambos necesitan tablas nuevas. Las bajas se cuentan como
  canceladas que alguna vez pagaron (no hay fecha de baja).

- [x] Costo de productos y margen por pedido (hecho el 2026-10-14). Falta que el dueño cargue los
      costos reales de insumos (filtro *Sin costo* en Carta y precios).
- [x] **Estrategia** (`ESTRATEGIA.md`): planes, formas de pago, piloto y facturación decididos el 2026-10-14.
- [ ] **Viabilidad** (`VIABILIDAD.md`): la meta de $2M/mes a medio tiempo pide ~42 locales (con tarifa 1 %) y bajar el
      soporte a ≤ 0,5 h por local. Medir en Gassuso los pedidos web y las horas de soporte, y actualizar
      los supuestos al mes 3. Hitos: mes 4 Gassuso paga; mes 6, 3 locales más; mes 12, ≥ 10 locales.
- [ ] **Siguiente**: propuesta de una página para Gassuso (planes, piloto, puesta en marcha
      bonificada) e inicio de actividades en el SII (persona natural de primera categoría) antes del mes 4.
- [x] Etapa 1 del control (2026-10-14): gastos, movimientos de caja (fondo, ingresos, retiros) y
      arqueo al cierre. Pestaña Gastos y bloque "Cuadre del efectivo" en Caja del día.
- [x] Review de caja (2026-10-19, `REVIEW-CAJA.md`): menú en dos líneas, pasos del turno en la ayuda,
      aviso "Caja sin abrir", arqueo ciego opcional (por dispositivo) y nombres unificados, nota obligatoria si la diferencia pasa de $5.000, voucher y cartola opcionales al cierre y "Entregar la caja" (corte de turno; en el código: cortes). Review completo. Siguiente: `REVIEW-UX-CAJERO.md` (hecho: gastos rápidos, renombre y pago mixto (tabla pedido_pagos); falta propina, fiado, Promociones en pasos).
- [x] Exportar a CSV para el contador (2026-10-14): ventas, productos, caja diaria y gastos.
- [x] Monitoreo (2026-10-14): `/salud/completo` (base, respaldo del día, disco) y guía de UptimeRobot en
      `deploy/MONITOREO.md`. **Falta que el dueño cree el monitor** (5 min).
- [x] Prueba de restauración: `deploy/probar-respaldo.mjs`; `respaldo.ps1` la corre después de cada
      descarga y `npm test` la corre siempre.
- [ ] Producto de entrada v1.0: solo falta la prueba en el local.
- [x] Multi-local (L3) y gestor de licencias (L4) (2026-10-14): clave por local, usuarios con PIN y roles,
      licencias con prueba/gracia/suspensión, tarifa por pedido, consola `/admin`.
- [x] Etapas 2 y 3 del control (2026-10-14): estado de resultados mensual (pestaña Resultados) y usuarios
      con PIN, con marcas de entrada y salida.
- [ ] **Al desplegar esto por primera vez**: el despliegue agrega `ADMIN_PASSWORD` al `.env` y la muestra
      una vez (anotarla). La licencia de Gassuso se crea sola: Gestión, prueba de 90 días desde ese día,
      50 % y sin tarifa por pedido el primer año pagado. Ajustar las fechas en `/admin` si el piloto
      partió otro día. Las sesiones abiertas se cierran (hay que volver a entrar).
- [x] **Autoservicio** (2026-10-14, palanca 1 de `VIABILIDAD.md`): primeros pasos con avance para cada
      local nuevo, importar la carta desde Excel/CSV con vista previa, ayudas en cada pestaña y avance de
      cada local en `/admin` (`lib/autoservicio.mjs`, `public/panel-inicio.js`). Medir con el 2º local
      cuánto soporte pide la puesta en marcha. Faltan: importar desde foto de la carta, videos cortos,
      grupo de WhatsApp de clientes y avisos automáticos cuando algo falla.
- [ ] Siguientes etapas del control: combos y promociones (etapa 6), inventario simple (5), SII directo (7).
      Cobro automático de licencias con Flow o Mercado Pago (fase 2), cuando haya ~10 locales.
- [ ] Combos/promociones (necesita precios del dueño).
- [ ] Al lanzar: `INDEXAR=1` en el `.env` del servidor y desplegar.
- [x] Borradores de Términos y Privacidad (`public/legal.html`, rutas `/terminos` y `/privacidad`,
      enlazados desde la carta). Faltan: razón social, RUT y correo del local (Datos del local →
      Datos legales). Servidor en Chile (ya declarado).
      Datos del cliente: se borran solos a los 24 meses y a pedido desde el panel.
- [x] **Paquete legal** (2026-10-16, borradores en `legal/`; el creador es abogado y los revisa): contrato de servicio 8vobit ↔ local
      con anexo de encargo de tratamiento (Ley 21.719, vigente desde el 1-dic-2026: firmarlo antes con
      Gassuso), aviso de privacidad para trabajadores y acuerdo de cliente fundador de Gassuso (con
      autorización de fotos, marca y testimonio). En código: cada pedido web guarda `legal_version`
      (`public/legal-version.js`, cambiarla al editar `legal.html`); sin Google Fonts (tipografías del
      sistema); privacidad dice servidor en Chile; marcas de PIN rotuladas "control interno, no reemplaza
      el registro de asistencia de la DT".
- [ ] **Legal, falta**: completar [corchetes] (nombre y RUT del prestador, datos de Gassuso), revisión jurídica
      de los 4 documentos (ver `legal/NOTAS-REVISION.md`), firma con Gassuso, y que el
      local lleve el registro oficial de asistencia aparte.
- [ ] Infra: copiar `docker-compose.yml` y la regla del túnel al espejo `D:\VPS`; anotar puertos
      8099/8100 en su `CLAUDE.md`.

## Decisiones ya tomadas (no volver a discutir)

- Infra propia (lenovo-edge), no Vercel/Supabase. Node sin dependencias + SQLite.
- Precio del canal propio = precio de pizarra (Uber cobra ~25 % más).
- Boleta modo 2 (asistida): el local emite la e-Boleta en el SII y registra el folio en Caja.
- Mapas: OpenStreetMap + Leaflet incluido en `public/`; direcciones con Nominatim vía servidor.
- Despacho por zonas con hexágonos (precio por tramo de distancia + ajustes a mano).
- Planes: Canal $19.900, Gestión $34.900, Pro $54.900 + IVA/mes; semestral −10 %, anual −15 %, más una
  tarifa de 1 % por pedido web, sin tope (subida desde 0,5 % el 2026-10-16), absorbida por el local (`ESTRATEGIA.md` §3).
  Gassuso está exento de la tarifa el primer año.
- Gassuso: 3 meses gratis con Gestión, luego 50 % el primer año pagado; la puesta en marcha se le
  bonifica, pero se muestra con su valor.
- Facturamos como persona natural de primera categoría (factura SII) y pasamos a SpA con 3–5 clientes.
- Repartidor con contrato (no honorarios); cálculo laboral es estimación, la liquidación la hace
  el contador.


## Revisión UX (2026-10-16)

Detalle en `REVISION-UX.md` (primera pasada) y `ESTUDIO-UX.md` (mes simulado, onboarding, notificaciones, caché, competencia y orden de entrega).
Hecho en esta tanda:
- Panel: consulta pedidos en **todas** las pestañas (antes se saltaba Carta, Datos, Resumen, Resultados y Gastos). Hay una franja "Hay N pedidos nuevos", el título muestra el contador y el sonido se repite cada 10 s hasta aceptar. La preferencia de sonido se recuerda, el primer toque lo reactiva y una franja roja avisa si está apagado. Botones de cocina más grandes (60 y 52 px).
- Onboarding: un local creado en `/admin` parte **en pausa** y el dueño lo abre al terminar los primeros pasos ("Abrir mi carta a los clientes"). El horario de ejemplo hay que confirmarlo con una casilla. En `/admin` hay "Copiar todo" y "Enviar por WhatsApp al dueño".
- Carta: "Recordar mis datos en este teléfono" (nombre y celular, más la última dirección por local, en localStorage; "Olvidar" los borra; agregado a Privacidad). Etiqueta en dirRef, chips y enlaces legales de 44 px y fuentes del sistema (ya no se nombran Bricolage ni Inter). Se borró `estilo.css`, que no se usaba.
- Resumen: la semana en curso se compara con los mismos días de la anterior. Resultados avisa cuando más del 20 % del costo de la comida es estimado.
- Despacho: "Ordenar entregas de despacho" en Pedidos (`public/ruta.js`). Prueba todos los órdenes y minimiza el retraso contra la franja y luego los km. Tiene Waze por parada y la ruta completa en Google Maps.
Pendiente de la revisión: reemplazar `alert`, `confirm` y `prompt` por diálogos propios; agrupar las pestañas en tablet; importar omitiendo filas con error; web push para el dueño y el cliente; "Repetir mi último pedido"; asistente de Despacho; hoja de ruta imprimible; reemplazar el JSON de carta en `/admin` por una planilla.
