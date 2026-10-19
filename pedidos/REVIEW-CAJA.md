# Review: Caja del día y Gastos

Referencia: guía de arqueos de Fudo (abrir con monto inicial en efectivo, chip de estado, contar al cerrar) y el procedimiento de arqueo/cuadratura chileno (Buk: fondo fijo inicial, recuento físico vs sistema, acta firmada por cajero y supervisor). Retiros = "alivio de caja" en otros POS.

## Qué hay
- Fondo inicial (sugerido desde el último cierre), ingresos, retiros y gastos en efectivo, con motivo y usuario.
- Efectivo esperado calculado en el servidor; arqueo con conteo por billetes; diferencia en vivo; cierre con nota; reabrir (con permiso); anular sin borrar.
- Gastos por categoría, mes contra mes, medio de pago y N° de documento. Exportables al contador.

## Qué falta frente al estándar
- Arqueo ciego (no mostrar "Debería haber" hasta contar): hoy el cajero ve el esperado antes de contar.
- Arqueo por medio de pago: solo se cuadra efectivo; tarjeta/transferencia no se comparan con el voucher/cartola.
- Turnos: un cierre por día, no por turno ni por cajero; no hay apertura explícita (el fondo es opcional).
- Cierre sin firma/acta ni límite de diferencia que pida aprobación del dueño.
- Sin aviso de "caja sin abrir" (el chip de estado de Fudo).

## Problemas de claridad
- No explicaba los pasos del turno ni qué significa sobra/falta (resuelto con la guía plegable).
- "Ingreso" y "Retiro" no se distinguen para quien no es contador; el motivo de ejemplo ayuda, pero falta el para-qué.
- El KPI "Efectivo en caja" y "Debería haber" repiten la misma cifra con nombres distintos.
- Gastos en transferencia aparecen en Caja del día solo si se mira el detalle; el título "Pagado en efectivo" no dice que ya está restado de la caja.

## Mejoras chicas, por prioridad
1. (hecho) Pasos del turno en la ayuda de pestaña (AYUDAS.cierre/gastos).
2. Aviso "Caja sin abrir: anota el fondo inicial" al haber ventas en efectivo y fondo 0.
3. Arqueo ciego opcional (ocultar esperado hasta escribir lo contado).
4. Unificar nombre "Efectivo en caja" / "Debería haber".
5. Pedir confirmación reforzada si la diferencia pasa de un umbral (ej. $5.000) y exigir nota.
6. Conteo de tarjeta/transferencia contra voucher o cartola en el cierre.
7. Cierre por turno con nombre de cajero.
