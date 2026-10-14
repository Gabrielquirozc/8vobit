# Traspaso: estado del proyecto y cómo seguir desde local

Última actualización: 2026-10-14. Rama de trabajo: `claude/compassionate-maxwell-hb826m`
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
npm test                                           # 45+ pruebas de punta a punta, ~1-2 s
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
| `public/comun.js` | Utilidades del navegador (api, clp, esc, emojis, fmtTel) |
| `public/seguimiento.html`, `comanda.html`, `carta-imprimible.html`, `cartel.html` | Seguimiento del cliente, ticket 80 mm, carta PDF, cartel/tarjetas con QR |
| `test/api.test.mjs` | Pruebas contra el servidor real con una base temporal |
| `deploy/` | Despliegue (ps1 + remoto.sh), túnel, exportar/respaldo |
| `README.md` | Descripción completa de cada función |

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
5. **Costo de insumos por producto** → Carta y precios (ver abajo).
6. Confirmar con el contador: si el local cae en el art. 38 N°7 o N°2 (recargo dominical 30 %) y la
   tasa del aporte patronal Ley 21.735 (marcados ⚠️ en Equipo → Parámetros laborales).
7. **Prueba en el local**: tablet con el panel instalado, impresora 80 mm, pedido completo (retiro y
   despacho) hasta la Caja del día.
8. Revisar si el contrato con Uber exige paridad de precios antes de imprimir "precio de local" en
   el cartel.

## Pendiente técnico / próximos pasos sugeridos

- [ ] Costo de productos y margen por pedido (en curso el 2026-10-14; si no quedó terminado, ver el
      último commit y `README.md`).
- [ ] Gastos fijos del local (arriendo, luz, gas, contador) para un estado de resultados mensual.
- [ ] Registro de turnos realmente trabajados (hoy el sueldo sale del turno pactado).
- [ ] Combos/promociones (necesita precios del dueño).
- [ ] Al lanzar: `INDEXAR=1` en el `.env` del servidor y desplegar.
- [ ] Legal al final: términos y condiciones, privacidad (se guardan nombre, teléfono, dirección y
      ubicación del cliente), acuerdo del piloto con autorización escrita de uso de fotos.
- [ ] Infra: copiar `docker-compose.yml` y la regla del túnel al espejo `D:\VPS`; anotar puertos
      8099/8100 en su `CLAUDE.md`.

## Decisiones ya tomadas (no volver a discutir)

- Infra propia (lenovo-edge), no Vercel/Supabase. Node sin dependencias + SQLite.
- Precio del canal propio = precio de pizarra (Uber cobra ~25 % más).
- Boleta modo 2 (asistida): el local emite la e-Boleta en el SII y registra el folio en Caja.
- Mapas: OpenStreetMap + Leaflet incluido en `public/`; direcciones con Nominatim vía servidor.
- Despacho por zonas con hexágonos (precio por tramo de distancia + ajustes a mano).
- Repartidor con contrato (no honorarios); cálculo laboral es estimación, la liquidación la hace
  el contador.
