# ¿Es viable para mí? Análisis como creador

Escrito el 2026-10-14. Situación: **solo, a medio tiempo (~80 h/mes), meta de $2.000.000 líquidos al mes.**
Precios de `ESTRATEGIA.md` §3. Todas las cifras son estimaciones para decidir. Hay que **reemplazarlas por
datos reales** a medida que lleguen: pedidos web de Gassuso, horas de soporte, bajas.

## Respuesta corta

- **Como negocio, sí es viable.** Los costos fijos son muy bajos (servidor propio, sin dependencias) y cada
  local deja casi todo como margen.
- **La meta de $2.000.000 a medio tiempo y solo NO se alcanza el primer año.** Con un ritmo realista toma
  **~2 años** y pide **~42 locales pagando** (con la tarifa por pedido en 1 %, decidida el 2026-10-16). Lo que frena es el **tiempo de soporte**, no la plata: a
  medio tiempo y solo, el techo es de ~30–35 locales.
- Para llegar hay que mover al menos una de estas palancas: **subir el ingreso por local**, **bajar el
  soporte por local** (autoservicio), **pasar a tiempo completo** o **contratar soporte** desde los
  ~25 locales.

## 1. Cuánto deja un local (sin IVA)

| Concepto | Supuesto | $/mes |
|---|---|---|
| Plan | Mezcla 30 % Canal, 55 % Gestión, 15 % Pro, ~7 % de descuento promedio por pagos semestrales y anuales | ≈ 31.000 |
| Tarifa por pedido | 250 pedidos web/mes × $12.000 × 1 % = $120 c/u | ≈ 30.000 |
| **Ingreso por local** | | **≈ 61.000** |
| Costo variable | Servidor y respaldos prorrateados, pasarela de cobro (fase 2) | ≈ −3.000 |
| **Margen por local** | | **≈ 58.000** |

Además está la **puesta en marcha** ($49.900 una vez, ≈ $35.000 libres después de impresos y traslado).

Ojo: **la tarifa por pedido es ~½ del ingreso.** Vale tanto como empujar al local a vender por la web.
Un local que solo vende en mostrador deja ~$31.000.

## 2. Costos fijos tuyos

| Concepto | $/mes |
|---|---|
| Contador (persona natural de primera categoría) | 40.000 |
| Servidor: luz del lenovo-edge, dominio, respaldos. Pasar a un VPS (≈ $15–30 mil) a los ~10 locales | 25.000 |
| Teléfono, traslados a locales, impresos de demostración | 40.000 |
| Herramientas varias | 10.000 |
| **Total** | **≈ 115.000** |

**Impuestos:** el IVA (19 %) lo pagan los clientes y se traspasa al SII, así que no es ingreso tuyo. Para la
renta (PPM mensual + Global Complementario anual) conviene **reservar ~12 % de la utilidad**. Hay que
confirmarlo con el contador. Las cotizaciones de salud y pensión como independiente van aparte.

**Cuánto queda en el bolsillo ≈ (locales × 58.000 + puestas en marcha − 115.000) × 0,88**

| Locales pagando | En el bolsillo al mes (sin contar puestas en marcha) |
|---|---|
| 5 | ≈ $150.000 |
| 10 | ≈ $410.000 |
| 20 | ≈ $920.000 |
| 30 | ≈ $1.430.000 |
| 35 | ≈ $1.690.000 |
| **42** | **≈ $2.040.000** |

## 3. Cuánto tarda en crecer

Altas por mes y bajas mensuales (los locales de comida cierran seguido; 2–3 % al mes es normal).

| Escenario | Altas/mes | Bajas/mes | Mes 12 | Mes 24 | Mes 36 | En el bolsillo, mes 24 (con puestas en marcha) |
|---|---|---|---|---|---|---|
| Conservador | 1 | 3 % | 10 locales | 17 | 22 | ≈ $820.000 |
| Base | 2 | 2 % | 21 | 38 | 52 | ≈ $1.900.000 |
| Optimista | 3 | 1,5 % | 33 | 61 | 84 | ≈ $3.100.000 |

En el escenario base, **la meta llega cerca del mes 27**, y eso solo si el tiempo alcanza (punto 4).

## 4. El límite real: tus horas

| Tarea | Supuesto |
|---|---|
| Puesta en marcha de un local (carta, fotos, QR, capacitación) | ~10 h |
| Soporte mensual por local | ~1,5 h al principio; meta ≤ 0,5 h |
| Ventas (visitas, demos, seguimiento) | ~6 h por local cerrado |
| Desarrollo y mantención | ≥ 20 h/mes para no quedarse atrás frente a Fudo |

Con 2 altas al mes: 20 h de puesta en marcha + 12 h de ventas + 20 h de desarrollo = **52 h fijas**. Te
quedan ~28 h para soporte, o sea **~19 locales con 1,5 h** o **~55 locales con 0,5 h**.

**Conclusión:** el negocio solo escala si el soporte por local baja a menos de 1 hora al mes. Eso se logra
con producto, no con esfuerzo: que el dueño se arregle solo.

## 5. Palancas, ordenadas por impacto

1. **Bajar el soporte por local** (lo más importante): alta del local y carga de la carta por el propio
   dueño (importar desde foto o planilla), ayudas dentro del panel, videos cortos, un grupo de WhatsApp
   de clientes y avisos automáticos cuando algo falla. Va en la línea L3 de `ESTRATEGIA.md`.
2. **Subir el ingreso por local** sin perder el argumento de precio:
   - Empujar a Gestión y Pro, que son los que traen el control que el dueño valora.
   - Cobrar extras: dominio propio, boleta SII directa, sesión de fotos, impresos (cartel, carta, tarjetas).
   - Tarifa por pedido subida a 1 % con tope de $200 (2026-10-16): sigue siendo bastante menos que
     Fudo (1,9 %) y muchísimo menos que las apps (25–30 %).
3. **Vender sin ir uno mismo:** contadores y proveedores de los locales que recomienden el sistema, con
   1–2 meses de comisión por cada local que traigan. Testimonio y números de Gassuso (comisión ahorrada).
4. **Contratar soporte por horas** al pasar los ~25 locales (≈ $250–350 mil/mes por medio tiempo). Ahí
   ya hay margen para pagarlo y te libera para vender y desarrollar.
5. **Salir de Concepción** cuando el autoservicio funcione: la puesta en marcha remota abre todo Chile.

Con las palancas 1, 2 y 4 aplicadas (ingreso ≈ $70.000 por local y 0,5 h de soporte), la meta baja a
**~36 locales**, alcanzable en ~22 meses en el escenario base, o en ~15 meses con 3 altas al mes.

## 6. Riesgos

| Riesgo | Mitigación |
|---|---|
| Servidor en casa: corte de luz o internet = locales sin pedidos un viernes | Monitoreo (pendiente de la v1.0) y pasar a un VPS a los ~10 locales |
| Dependes de ti: si te enfermas, nadie da soporte | Documentación (ya existe), respaldos fuera del servidor, un soporte de reemplazo |
| Fudo o Justo bajan precios o regalan la tienda | Diferenciación local: despacho por zonas, costeo, sueldos, soporte en persona, tarifa casi cero |
| Los locales cierran (bajas altas) | Contratos semestrales y anuales con descuento; elegir locales con años funcionando |
| Responsabilidad por datos de clientes | Términos y privacidad (hechos), contrato SaaS (pendiente), revisión de un abogado |

## 7. Hitos para decidir (seguir, ajustar o parar)

| Cuándo | Hito | Si no se cumple |
|---|---|---|
| Mes 4 | Gassuso empieza a pagar y vende ≥ 20 % de sus pedidos por la web | Revisar el producto con el dueño antes de salir a vender |
| Mes 6 | 3 locales pagando, además de Gassuso | Revisar precio y mensaje de venta |
| Mes 9 | Soporte ≤ 1,5 h por local al mes; bajas < 3 %/mes | Invertir en autoservicio antes de vender más |
| Mes 12 | ≥ 10 locales pagando (≈ $300 mil en el bolsillo) | Decidir: tiempo completo, socio comercial, o dejarlo como ingreso complementario |
| Mes 18–24 | ≥ 25 locales: contratar soporte por horas | |

## 8. Recomendación

Seguir, pero con dos ajustes de expectativa y de foco:

- Durante el primer año, verlo como **ingreso complementario que crece** ($300–800 mil), no como los
  $2.000.000.
- Priorizar en el desarrollo **lo que baja el soporte** (multi-local con autoservicio y alta del local por el
  propio dueño) por sobre más funciones de control. Cada hora de soporte que se ahorra por local vale
  más que una función nueva.

Siguiente paso concreto: medir en Gassuso los pedidos web reales por mes y las horas de soporte, y
reemplazar los supuestos de este documento con esos datos al mes 3.
