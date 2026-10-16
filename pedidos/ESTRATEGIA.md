# Estrategia de producto: producto de entrada, planes, líneas de trabajo y licencias

Escrito el 2026-10-14. Complementa `PLAN-CONTROL.md` (etapas del sistema de control) y
`PENDIENTES.md` (estado del día a día). Los precios de la competencia se revisaron en sus sitios
ese día; cambian seguido, así que hay que volver a revisarlos antes de cada propuesta.

Objetivo inmediato: **venderle el producto de entrada a Gassuso**. Todo lo demás (planes, multi-local,
licencias) se prepara en paralelo, pero sin frenar esa venta.

---

## 1. La competencia

### Fudo (fu.do/es-cl): sistema de gestión con canal online como agregado

- Más de 35.000 negocios en AR, BR, CL, CO y MX. Funciona desde el navegador y pone el foco en la gestión
  del local: caja, stock, recetas, reportes, boleta SII directa y terminal de pago propia (Fudo Pagos).
- Planes (CLP + IVA, mensual): **Inicial $25.500 · Avanzado $34.500 · Pro $52.500**. Detalle en `PLAN-CONTROL.md`.
- Módulos: Delivery Apps $9.500 · Monitor de cocina $9.500 · Mesas $4.500 · Comensal $4.500 ·
  Recepcionista IA $42.500.
- **"Tu Delivery"**: tienda online propia (link único, colores y logo), pago con tarjeta vía Fudo Pagos,
  agente IA por WhatsApp, repartidores de Uber a pedido (Uber Direct) y envío fijo o por zonas.
  **Comisión: 1,9 % + IVA por venta** (las primeras 25 son gratis), que se puede traspasar al cliente.
- ⚠️ **Corrige lo que decía antes este repo**: Fudo *sí* tiene canal propio con despacho. "No tienen canal
  propio" ya no sirve como argumento principal.

### Justo (getjusto.com): canal online primero, con un modelo de comisión

- Startup chilena con más de 10.000 restaurantes en CL, CO, MX, PE, CR y EC. Su centro es el canal
  online: e-commerce con marca, app propia, logística, loyalty, marketing (Performance Lab), POS, reservas,
  Commander (pedidos por teléfono y WhatsApp) y agentes IA.
- Planes Chile (anuales por local, + IVA): **Plus UF 20/año** (≈ $67.000/mes con la UF a ~$40.000) y
  **Pro UF 70/año** (≈ $233.000/mes).
- Además cobra **comisión por venta en sus canales: 13 % (Plus) / 10 % (Pro)**, más **logística 7 % / 5 %**
  y pasarela de pago 1,8 % + fijo. Integrar una terminal de pago cuesta UF 1/mes. Los agentes IA se cobran por uso.
- Sigue cobrando un % de cada venta, menos que Uber, pero un local con buen volumen paga bastante.
- Anuncian "pronto" Payroll y planificación de turnos, algo que nosotros ya tenemos (Equipo).

### Dónde nos paramos

| | Uber / PedidosYa | Justo Plus | Fudo Avanzado + Tu Delivery | **Nosotros** |
|---|---|---|---|---|
| Costo fijo | 0 | ≈ $67.000/mes | $34.500 + IVA | **plan fijo, más bajo (ver §3)** |
| % por venta en canal propio | 25–30 % | 13 % + 7 % logística | 1,9 % | **1 % con tope de $200** |
| Despacho por zonas con costo real del viaje | — | logística propia | fijo o por zonas | **hexágonos + costeo por vehículo** |
| Costo de producto y margen | — | — | con recetas (Avanzado) | ✅ (sin recetas) |
| Sueldos y costo de personal según la ley | — | "pronto" | — | ✅ |
| Pago online con tarjeta | ✅ | ✅ | ✅ | ❌ **brecha** |
| Boleta SII directa | — | ? | ✅ | ❌ (modo asistido) |
| Inventario y recetas | — | ✅ | ✅ | ❌ |
| WhatsApp con IA | — | ✅ | ✅ | ❌ (enlace a WhatsApp) |
| Soporte local, en persona | — | comercial | remoto | **✅ Concepción, en terreno** |

**Argumento de venta (cierto y verificable):**
1. **La comisión más baja: 1 % por pedido con tope de $200, más un plan fijo.** Con $3.000.000 al mes
   por canal propio (≈ 250 pedidos de $12.000): Uber se lleva ~$750.000, Justo ~$600.000 y Fudo
   ~$57.000 + plan. Nosotros cobramos ~$15.000 + plan. El panel ya muestra cada mes la comisión que el
   local se ahorró.
2. **Hecho para un local de delivery chico**, no para un restaurante con mesas: zonas que no pierden plata,
   costo real de cada despacho y sueldo del repartidor según la ley.
3. **Cercanía**: puesta en marcha en el local, carga de la carta y las fotos, cartel QR y capacitación.
   Ni Fudo ni Justo van al local.

**Lo que no vamos a perseguir** (aquí perdemos sin sentido): mesas y garzones, terminal de pago propia,
marketplace propio, app nativa, marketing pagado.

---

## 2. Producto de entrada: qué le vendemos a Gassuso y hasta dónde llegar

**Definición:** "Canal propio de pedidos con despacho, más la caja del día cuadrada". Debe reemplazar el
WhatsApp y el cuaderno, y quitarle ventas a Uber.

### Ya está hecho
Carta web con fotos, sugeridos y ficha de producto · pedido con retiro o despacho por zonas y mapa ·
seguimiento del cliente · panel en vivo (equivale al Monitor de cocina) · venta rápida en mostrador ·
comanda de 80 mm · caja del día con folios · resumen semanal con comisión ahorrada · carta y precios con
costo y margen · costeo de despacho por vehículo · equipo y sueldos · términos, privacidad y borrado de
datos · cartel QR y carta para imprimir · respaldos diarios fuera del servidor.

### Falta para declararlo "listo para vender" (v1.0)

| # | Qué | Tipo | Por qué |
|---|---|---|---|
| 1 | Datos del dueño: transferencia, precios faltantes, despacho real, vehículo, insumos | dueño | Sin esto no se puede abrir al público |
| 2 | **Gastos, movimientos de caja y arqueo** (etapa 1 de `PLAN-CONTROL.md`) | desarrollo | Es lo mínimo que Fudo Inicial tiene y lo primero que un dueño pide: "¿cuadra la caja?" |
| 3 | **Exportar a CSV** las ventas y la caja por rango de fechas | desarrollo, chico | El contador lo va a pedir el primer mes |
| 4 | Prueba completa en el local: tablet, impresora, retiro, despacho y cierre de caja | terreno | |
| 5 | Monitoreo de caída (ping externo + aviso a nuestro celular) | infra | Si se cae un viernes a las 21:00, tenemos que saberlo antes que el local |
| 6 | Probar la restauración de un respaldo (no solo hacerlo) | infra | |
| 7 | Acuerdo del piloto por escrito: precio, plazo, uso de fotos y marca, soporte | comercial | |
| 8 | Datos legales del local en Términos y Privacidad | dueño | |

**Fuera de la v1.0** (se agregan después, sin bloquear la venta): usuarios con PIN, estado de resultados,
inventario, combos, pago online, SII directo y multi-local.

**Criterio de éxito del piloto (3 meses):** % de los pedidos totales que pasan por el canal propio,
comisión ahorrada acumulada, caja cuadrada todos los días y el dueño usándolo sin llamarnos.

---

## 3. Planes (decididos el 2026-10-14)

Precios en CLP + IVA. Se reajustan una vez al año por IPC.

**Tarifa por pedido (decidida el 2026-10-14, subida a 1 % el 2026-10-16): 1 % + IVA de cada pedido de la carta online, con tope de
$200 por pedido.** La paga el local de su venta, **no se le suma al precio del cliente**. Es tan baja que
no justifica subir los precios de la carta (en un pedido de $12.000 son $120). La venta de mostrador no
paga tarifa. Se cobra a mes vencido, junto con el plan, según los pedidos web no anulados del mes.

**Formas de pago** (siempre por adelantado): mensual, **semestral −10 %** o **anual −15 %**.

| + IVA | Mensual | Semestral (6 meses) | Anual (12 meses) |
|---|---|---|---|
| Canal | $19.900 | $107.460 (≈ $17.910/mes) | $202.980 (≈ $16.915/mes) |
| Gestión | $34.900 | $188.460 (≈ $31.410/mes) | $355.980 (≈ $29.665/mes) |
| Pro | $54.900 | $296.460 (≈ $49.410/mes) | $559.980 (≈ $46.665/mes) |

| | **Canal** | **Gestión** | **Pro** |
|---|---|---|---|
| Precio sugerido | **$19.900** | **$34.900** | **$54.900** |
| Frente a | Fudo Inicial $25.500 (sin canal propio) | Fudo Avanzado + KDS + Tu Delivery ≈ $44.000 + 1,9 % | Fudo Pro + módulos ≈ $72.000 |
| Carta web, pedidos, seguimiento, cartel QR | ✅ | ✅ | ✅ |
| Despacho por zonas, horarios, mínimo | ✅ | ✅ | ✅ |
| Panel en vivo, venta rápida, comanda | ✅ | ✅ | ✅ |
| Caja del día con folios, arqueo, gastos | ✅ | ✅ | ✅ |
| Resumen semanal y comisión ahorrada | ✅ | ✅ | ✅ |
| Costo de productos y margen | — | ✅ | ✅ |
| Costeo de despacho por vehículo | — | ✅ | ✅ |
| Equipo, turnos y sueldos estimados | — | ✅ | ✅ |
| Estado de resultados mensual | — | ✅ | ✅ |
| Usuarios con PIN y roles | 2 usuarios | ilimitados | ilimitados |
| Exportar a CSV/Excel | — | ✅ | ✅ |
| Inventario, recetas y proveedores | — | — | ✅ |
| Combos y promociones | — | — | ✅ |
| Varios locales con una sola cuenta | — | — | ✅ |

**Adicionales** (aparte del plan):
- **Puesta en marcha**: $49.900 una vez. Incluye carga de la carta, sesión de fotos básica, cartel y
  tarjetas QR impresas, y capacitación en el local. Es nuestra ventaja de cercanía: se cobra, no se regala.
- **Pago online con tarjeta**: sin cargo nuestro. El local conecta su propia cuenta (Mercado Pago o Flow)
  y paga directo la comisión de esa pasarela.
- **Boleta SII directa**: se traspasa el costo por documento del proveedor de DTE, más un margen chico.
- **Dominio propio** (pide.gassuso.cl): $2.900/mes.

**Gassuso (cliente fundador):**

| Período | Condición | Gestión + IVA |
|---|---|---|
| Meses 1–3 | Piloto sin costo, plan **Gestión** completo | $0 |
| Meses 4–15 | **50 % de descuento durante el primer año pagado**, con cualquier forma de pago | $17.450/mes · $94.230 semestral · $177.990 anual |
| Mes 16 en adelante | Precio normal | $34.900/mes · $188.460 semestral · $355.980 anual |

- **Exento de la tarifa por pedido** (1 %) durante los meses 1 a 15; paga desde el mes 16.
- A cambio: testimonio, uso de marca y fotos en nuestro material, y feedback mensual.
- **Puesta en marcha**: aparece en la propuesta con su valor ($49.900), *bonificada 100 % por ser
  cliente fundador*. Así queda claro que tiene precio para los próximos clientes.
- Avisar con 30 días de anticipación que termina el descuento.

**Cuentas de referencia** (con la UF a ~$40.000): un local que vende $3.000.000 al mes por canal propio paga
$34.900 + IVA con nosotros, contra ~$600.000 en Justo Plus o ~$92.000 en Fudo Avanzado + Tu Delivery.

---

## 4. Líneas de trabajo

Cada línea avanza sola. Están en orden de prioridad.

### L1. Cierre del producto de entrada (Gassuso). Ahora
Los puntos 1 a 8 de §2. Entregable: Gassuso operando con el canal propio y la caja cuadrada.

### L2. Sistema de control. Ahora y siguientes meses
Etapas de `PLAN-CONTROL.md`: 1 gastos y arqueo → 4 exportar → 3 usuarios con PIN → 2 estado de
resultados → 6 combos → 5 inventario → 7 SII. Es el contenido de los planes Gestión y Pro.

### L3. Plataforma multi-local. Antes del 2º cliente — ✅ hecho el 2026-10-14 (autoservicio v1 también: primeros pasos, importar planilla, ayudas)
Hoy la base ya separa por `local_id`, pero el sistema funciona como si hubiera un solo local:
- La clave del panel es **una sola, global** (`PANEL_PASSWORD`), y el login asume `gassuso` por defecto.
- Los locales solo se crean desde el seed, cuando la base está vacía. No hay forma de dar de alta otro.

Hay que hacer:
- Usuarios por local guardados en la base, con hash scrypt (`node:crypto`). Esto se hace junto con la etapa 3 de PIN.
- Alta de un local desde la consola de administración, con carta vacía o importada desde JSON.
- Revisar que **cada** consulta del panel filtre por el `local_id` de la sesión, y agregar una prueba que
  intente leer datos de otro local y espere 403.
- Respaldos y exportación por local, para entregarle sus datos a un cliente que se va.
- Separar `server.mjs` (1.100 líneas) en módulos: `lib/db.mjs`, `lib/panel.mjs`, `lib/licencias.mjs`, etc.
  Así ninguna pieza nueva crece dentro del archivo gigante.

### L4. Gestor de licencias y cobro. Junto con L3 (ver §5) — ✅ fase 1 hecha el 2026-10-14 (cobro manual)

### L5. Integraciones. Después de la v1.0, según demanda
Pago online (Mercado Pago o Flow, con la cuenta del local) → boleta SII directa (proveedor de DTE) →
WhatsApp (avisos automáticos de estado; la IA no por ahora).

### L6. Comercial y empresa. En paralelo, sin código
- **Facturación** (decidido): inicio de actividades como **persona natural de primera categoría**
  (giro de servicios informáticos/software) y factura electrónica con el sistema gratuito del SII.
  Pasar a **SpA** al llegar a 3–5 clientes. Confirmarlo con un contador. Tiene que estar listo antes de
  que termine el piloto de Gassuso (mes 4).
- Contrato de servicio (SaaS) con disponibilidad, soporte, propiedad y devolución de los datos, plazo y término.
- Política de soporte: horario, canal (WhatsApp), tiempo de respuesta y qué cubre cada plan.
- **Local de demostración** (`/demo`) con datos ficticios para mostrar sin tocar Gassuso.
- Propuesta de una página para Gassuso, landing con planes en 8vobit.xyz y caso de éxito al terminar el piloto.
- Lista de locales objetivo en Concepción: delivery chico, que hoy depende de Uber o PedidosYa.

### Fases

| Fase | Meta | Líneas |
|---|---|---|
| 0. Piloto | Gassuso operando y cuadrando caja | L1, L2 etapas 1 y 4, L6 (empresa, demo, acuerdo) |
| 1. Segundo a quinto local | Vender sin reescribir nada | L3, L4 con cobro manual, L2 etapa 3, L6 (landing, contrato) |
| 2. Escala | Cobro automático, integraciones | L4 con cobro automático, L5, L2 etapas 2, 5 a 7 |

---

## 5. Gestor de licencias propio

### Principio
Todo corre en **nuestro** servidor, así que una licencia no es una "clave" que se instala: es un
**registro en nuestra base** que el servidor revisa en cada petición. No hay nada que piratear del lado
del cliente. Si algún día se vende una instalación en el servidor del local, se agrega una licencia
firmada (ver al final).

### Modelo de datos (tablas nuevas, en la misma base SQLite)

```
planes        id, codigo ('canal'|'gestion'|'pro'), nombre, precio_mes, precio_anual,
              funciones JSON (['pedidos','despacho','costos','equipo','gastos','resultados',
              'exportar','inventario','combos','multilocal']),
              limites JSON ({usuarios: 2, locales: 1}), activo, creado
licencias     id, local_id UNIQUE, plan_id, estado ('prueba'|'activa'|'gracia'|'suspendida'|'cancelada'),
              ciclo ('mensual'|'semestral'|'anual'), descuento_pct, descuento_hasta
              (precio fundador: 50 % hasta completar 12 meses pagados),
              tarifa_pct (1), tarifa_tope (200), tarifa_exenta_hasta (Gassuso: fin del mes 15),
              inicio, vence, prueba_hasta, notas, creado, actualizado
licencia_extras  licencia_id, codigo ('dominio'|'sii'|...), precio, desde, hasta
pagos         id, licencia_id, periodo_desde, periodo_hasta, monto, medio ('transferencia'|'flow'|...),
              referencia, factura_folio, estado ('pendiente'|'pagado'|'anulado'), fecha
licencia_eventos  id, licencia_id, fecha, tipo ('alta'|'cambio_plan'|'pago'|'gracia'|'suspension'|...),
              detalle JSON, quien
```

Los planes tienen **versión**: si mañana se cambia el precio de Gestión, los clientes actuales mantienen
el precio que pactaron hasta el reajuste anual. Las funciones se leen del plan vigente.

El precio de cada cobro se calcula así: `precio del plan según el ciclo` (mensual, semestral −10 %,
anual −15 %) × (1 − `descuento_pct`, si el período cae antes de `descuento_hasta`). Cada pago cubre
1, 6 o 12 meses (`periodo_desde`/`periodo_hasta`). Si un pago semestral o anual cruza
`descuento_hasta`, se prorratea por mes.

La **tarifa por pedido** se calcula a mes vencido: Σ min(total × `tarifa_pct`/100, `tarifa_tope`) de
los pedidos con `canal='web'` y `estado!='anulado'` del mes, salvo los que caen antes de
`tarifa_exenta_hasta`. Queda como una línea del cobro del mes siguiente. El local la ve en el panel
mientras el mes avanza, para que nunca lo tome por sorpresa.

### Cómo se aplica

- Una sola función, `puede(localId, 'gastos')`, mira el plan, el estado y los extras. Cada ruta
  `/api/panel/*` que pertenece a una función la llama. Si no tiene acceso, responde **403** con
  `{ error: 'Disponible en el plan Gestión', plan_requerido: 'gestion' }`.
- `GET /api/panel/licencia` devuelve plan, estado, fecha de vencimiento y funciones. El panel **muestra con
  candado** las pestañas que no incluye el plan (no las esconde), con un botón "Quiero este plan".
- Los límites (usuarios, locales) se revisan al crear el recurso.
- Hay pruebas automáticas para cada plan: lo que sí puede, lo que no, y que nunca filtre datos de otro local.

### Ciclo de vida

```
prueba (14 días) ──pago──▶ activa ──vence sin pago──▶ gracia (7 días) ──▶ suspendida ──90 días──▶ cancelada
                              ▲                          │                    │
                              └──────── pago ────────────┴────────────────────┘
```

- **Aviso** 30 días antes de que termine un descuento (fundador u otro).
- **Aviso** 7 días y 1 día antes de vencer: banner en el panel y, más adelante, correo o WhatsApp.
- **Gracia**: todo funciona, pero con un banner rojo.
- **Suspendida**: el panel queda **en solo lectura** y la carta pública muestra "pedidos en pausa"
  con el WhatsApp del local. **Nunca se borran datos y siempre se puede exportar.** Le cuidamos el
  negocio al local aunque nos deba.
- **Cancelada**: se ofrece la exportación completa. Los datos se borran pasado el plazo del contrato,
  según la política de privacidad.

### Consola de administración (`/admin`, solo nosotros)
- Login aparte con su propia clave en `.env` (`ADMIN_PASSWORD`). Más adelante, segundo factor (TOTP con
  `node:crypto`, sin dependencias). Se puede limitar por IP o ponerla detrás de Cloudflare Access.
- Lista de locales: plan, estado, vence, último uso, pedidos de los últimos 30 días y comisión ahorrada.
- Acciones: crear local, cambiar plan, registrar pago (a mano), extender la prueba, suspender o reactivar,
  y exportar datos. Todo queda en `licencia_eventos`.
- Números del negocio: ingresos mensuales recurrentes (MRR), clientes por plan, pagos atrasados y
  bajas (churn).

### Cobro, en dos pasos
1. **Fase 1, manual**: el cliente paga por transferencia, nosotros emitimos la factura en el SII y la
   registramos en `/admin`, lo que extiende `vence`. Alcanza para los primeros 10 locales.
2. **Fase 2, automático**: suscripción con **Flow** o **Mercado Pago** (cargo recurrente a tarjeta).
   Un webhook firmado (`/api/pagos/webhook`, con verificación de firma) registra el pago y extiende la
   licencia. La factura sigue siendo nuestra, de forma manual o con el mismo proveedor de DTE de L5.

### Si algún día se instala en el servidor del local
Un archivo de licencia JSON (`local`, `plan`, `funciones`, `vence`) firmado con **Ed25519**
(`node:crypto`, sin dependencias). La clave privada queda solo en nuestra consola y el servidor del
local trae la pública. Por ahora **no se hace**: hoy no hay ningún caso que lo pida.

### Orden de implementación
1. Tablas, `puede()`, plan por defecto para Gassuso (`gestion`, precio fundador) y pruebas.
2. Candados y banner de licencia en el panel.
3. Consola `/admin`: lista, crear local, registrar pago y cambiar estado.
4. Avisos de vencimiento y cambio automático de estado (tarea diaria dentro del servidor).
5. Cobro automático con Flow o Mercado Pago.

---

## Decisiones tomadas (2026-10-14)

1. **Planes**: Canal $19.900, Gestión $34.900 y Pro $54.900 + IVA al mes (§3).
2. **Formas de pago**: mensual, semestral −10 % o anual −15 %, por adelantado.
3. **Piloto de Gassuso**: 3 meses gratis con Gestión, después 50 % solo durante el primer año pagado,
   a cambio de testimonio, marca, fotos y feedback. Exento de la tarifa por pedido hasta el mes 15.
6. **Tarifa por pedido**: 1 % + IVA por pedido web con tope de $200, absorbida por el local (no se le
   traspasa al cliente). La venta de mostrador no paga.
4. **Puesta en marcha**: bonificada a Gassuso, pero mostrada con su valor ($49.900).
5. **Facturación**: persona natural de primera categoría con factura del SII; SpA al tener 3–5 clientes.

## Decisiones abiertas

1. Pasarela para el cobro automático (fase 2): Flow (chilena, buena para suscripciones) o Mercado Pago
   (ya conocido por los locales). No hace falta decidirlo antes del segundo local.
