# Comparativa con Fudo y plan del sistema de control propio

Revisado el 2026-10-14 desde https://fu.do/es-cl/precios/ (precios en CLP, **sin IVA**, cobro mensual
adelantado; −10 % semestral, −15 % anual). Volver a revisar antes de la propuesta: cambian seguido.

## Planes de Fudo

| Plan | $/mes + IVA | Qué agrega |
|---|---|---|
| Inicial | 25.500 | Usuarios ilimitados y roles, arqueos y movimientos de caja, propinas, carga de gastos con categorías, venta de mostrador, carta QR (solo vista), comandas y precuentas, app de garzones, medios de pago, descuentos, cliente en la venta, categorías, modificadores, combos, terminal de pago (sin arriendo) y boleta/factura electrónica directa con el SII. |
| Avanzado | 34.500 | Reportes (ventas, productos, stock, compras, gastos), costos e inventario automáticos con recetas y subingredientes, alertas y bloqueo sin stock, mermas, proveedores y clientes con cuenta corriente, descuentos por cliente, **pedido desde la mesa con QR**, cierre parcial. |
| Pro | 52.500 | Varias cajas por usuario, arqueo ciego, PIN de autorización, API, **estado de resultados**, flujo de caja, cuentas por cobrar, conteo e inventario valorizado, facturas por foto, vencimiento de gastos, varios turnos, listas de precios, fichas técnicas. |

Módulos aparte ($/mes + IVA): Ventas por comensal 4.500 · Gestión de mesas 4.500 · **Delivery Apps 9.500**
(centraliza Uber/Rappi/PedidosYa) · **Monitor de cocina 9.500** · Recepcionista IA por WhatsApp 42.500.
Multi-sucursal: a cotizar.

Un local de delivery como Gassuso con Fudo pagaría al menos Avanzado + Delivery Apps + Monitor de cocina
= **$53.500 + IVA ≈ $63.665/mes**. Fudo ordena los pedidos de las apps, pero las apps siguen cobrando
su comisión (~25–30 %). **Corrección:** Fudo *sí* tiene canal propio ("Tu Delivery": tienda online,
pago con tarjeta, repartidores Uber a pedido) con **1,9 % + IVA por venta**. Ver `ESTRATEGIA.md`.

## Dónde estamos frente a Fudo

| Función | Nosotros | Nota |
|---|---|---|
| Canal propio: carta web, pedido, seguimiento | ✅ | Fudo lo tiene ("Tu Delivery", 1,9 % por venta); Justo cobra 10–13 %. Nuestro argumento: **1 % por pedido web, sin tope** (la más baja). |
| Despacho por zonas, costo por vehículo, mínimo y horario | ✅ | Fudo no lo tiene. |
| Venta de mostrador, comanda 80 mm, medios de pago | ✅ | |
| Pedidos en vivo para cocina (equivale al Monitor de cocina) | ✅ | Fudo lo cobra aparte (9.500). |
| Caja del día con folios de boleta, arqueo y movimientos de caja | ✅ | Arqueo con conteo por billetes, fondo, ingresos, retiros (2026-10-14). |
| Categorías, ingredientes, agregados, salsas | ✅ | |
| Costo de productos y margen | ✅ parcial | Costo a mano o %; sin recetas ni inventario. |
| Resumen semanal y exportar CSV por rango | ✅ | Ventas, productos, caja y gastos para el contador (2026-10-14). |
| Equipo: turnos, cobertura, sueldo legal estimado, costo por área | ✅ | Fudo no calcula sueldos. |
| Términos, privacidad, borrado de datos | ✅ | |
| Usuarios con PIN y roles | ✅ | Cocina, caja, encargado y dueño; entrada y salida con PIN (2026-10-14). |
| Gastos por categoría | ✅ | Pestaña Gastos con comparación mensual (2026-10-14). |
| Estado de resultados | ✅ | Pestaña Resultados, con el mes anterior (2026-10-14). Fudo lo da en Pro. |
| Inventario, recetas, proveedores, compras | ✅ | Pestaña Inventario: stock, alerta, compras con costo promedio, conteo y merma (2026-10-16). Fudo Avanzado. |
| Combos, descuentos, promociones | ✅ | Pestaña Promociones: automáticas por día y horario, códigos, por categoría, combos (2026-10-16). |
| Clientes y cupón de vuelta | ✅ | Pestaña Clientes: frecuentes, nuevos, dormidos, cupón de un solo uso para volver (2026-10-16). |
| Boleta electrónica directa con el SII | ❌ | Hoy modo asistido (el local emite en el SII y anota el folio). Requiere integrarse con un proveedor de DTE (costo por documento). |
| Pago con tarjeta integrado (terminal) | ❌ | No conviene construirlo: el local usa su máquina (SumUp, Getnet, etc.) y se registra el medio de pago. |
| Mesas, garzones, propinas | — | No aplica a un local de delivery. |

## Sistema de control propio: plan por etapas

Orden pensado para lo que más le sirve a un local de delivery y lo que más pesa en la propuesta.
Cada etapa se puede desplegar sola.

Estado al 2026-10-16: etapas 1 a 6 y 8 ✅ hechas; falta 7 (SII).

1. ✅ **Gastos y movimientos de caja** — registrar gastos con categoría (insumos, arriendo, luz, gas,
   sueldos, contador…), retiros y aportes de caja; **arqueo** al cierre (contado vs. esperado, con
   diferencia). Base para todo lo demás.
2. ✅ **Estado de resultados mensual** — ventas − costo de productos − personal (ya calculado en Equipo)
   − gastos = resultado; comparado con el mes anterior y con lo que se habría pagado en comisiones de
   apps. Es lo que Fudo cobra en el plan Pro.
3. ✅ **Usuarios con PIN y roles** — cada trabajador de Equipo entra con su PIN; permisos por rol
   (cocina y caja ve pedidos y caja; el dueño ve todo, sueldos y costos). Registro de quién cobró,
   anuló o cerró caja. Marcar entrada y salida → **turnos reales** para el sueldo.
4. ✅ **Exportar** — ventas, caja, gastos y pedidos a CSV/Excel por rango de fechas (para el contador).
5. ✅ **Inventario simple** — insumos con unidad y costo; receta de cada producto (cuánto pan, carne,
   palta…); cada venta descuenta stock; alerta de stock bajo; compras a proveedor que actualizan el
   costo. Reemplaza el costo estimado por el real.
6. ✅ **Combos y promociones** — combos con precio propio y descuentos por horario o por código.
7. **Boleta electrónica directa** — integrar un proveedor de DTE autorizado por el SII.
   Evaluar costo por boleta vs. seguir en modo asistido.
8. ✅ **Multi-local / producto** — alta de locales, licencias y cobro manual hechos el 2026-10-14
   (ver `ESTRATEGIA.md` L3 y L4). Falta el cobro automático.

## Cómo cobrarlo (propuesta para discutir)

Propuesta vigente de planes y precios en `ESTRATEGIA.md` §3. Referencia: Fudo cobra $34.500–52.500 + IVA (+1,9 % en su tienda online), y Uber se lleva ~25–30 % de cada venta.

- **Pedidos** (carta web, despacho por zonas, panel de pedidos y caja): debajo de Fudo Inicial.
- **Control** (Pedidos + gastos, estado de resultados, usuarios con PIN, exportar, equipo): a la altura
  de Fudo Avanzado, pero incluyendo lo que Fudo da en Pro y su Monitor de cocina.
- Piloto con Gassuso sin costo o a precio reducido a cambio de testimonio y uso de fotos/marca.
- Medir y mostrar cada mes la **comisión ahorrada** (ya está en el Resumen) como prueba del valor.
