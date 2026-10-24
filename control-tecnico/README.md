# Control Técnico OctavoBit

Primera versión local del control interno del servicio técnico. Abre en `http://127.0.0.1:8110` y no se publica en internet. Requiere Node 22 o superior; no instala paquetes.

```powershell
cd D:\8vobit\control-tecnico
npm test
npm start
```

Los datos se guardan en `data/control.db`, excluido de Git. Respaldar ese directorio con el servidor detenido. El libro `D:\COSTANERA SUR\FICHA CAJA.xlsx` es histórico y no se importa como ventas de la sociedad.

## Flujo de uso

1. El cliente reserva una cita en la agenda de 8vobit. Crear la orden con el ID de cita, cliente y equipo. El ID es único para evitar duplicados.
2. Seleccionar servicio oficial y categoría de pieza. Anotar proveedor, enlace, plazo y vigencia. Los importes de la pieza son estimaciones para esa cotización; la orden conserva una copia del cálculo.
3. Registrar el anticipo recibido. Al comprar, registrar cada salida por rubro: pieza, flete, arancel, IVA de importación o gestión, con su documento.
4. Actualizar estado de la orden. Al entregar, anotar el folio, fecha y total del documento tributario efectivamente emitido mediante el sistema autorizado.
5. Revisar el resumen del mes y descargar CSV compatibles con Excel. Conciliar contra cartola, Registro de Compras y Ventas y contador/a.

Al registrar un DTE, ingresar por separado el monto bruto de servicio y el monto bruto de pieza tal como se emitieron. El sistema propone los importes cotizados, pero hay que corregirlos si la venta final cambió. Un movimiento de caja erróneo se anula con motivo y se registra uno nuevo; el anulado permanece en la exportación para trazabilidad.

Los precios de servicios provienen de `marketing/PRECIOS-SERVICIO-TECNICO.md` (aprobados el 17-10-2026). Los recargos de pieza son **valores iniciales para evaluar**, no tarifas aprobadas. Se pueden reemplazar tras medir encargos reales. El precio de la pieza no queda fijo para otra orden.

## Qué calcula y qué falta

- La cotización estima costo comercial, precio neto de pieza, precio público del servicio, IVA de venta y total al cliente.
- El IVA recuperable **estimado** se resta del costo comercial solo si tú lo ingresas. Si no hay certeza, se deja en cero.
- El resumen mensual toma IVA débito aproximado de documentos registrados y suma IVA crédito solo de compras con número de respaldo y casilla de revisión manual. Muestra aparte arancel e IVA de importación pagados. La diferencia no es una declaración F29 ni certifica el derecho a crédito.
- Los anticipos y saldos son caja según fecha de pago. Las ventas son documentos según fecha de emisión. No se confunden los dos calendarios.
- No genera asientos contables oficiales, no emite DTE y no envía correos. El diario contable requiere un mapa de cuentas validado por el contador y el tratamiento de anticipos y devengo.
- En esta versión se vincula la cita por ID manual. La agenda, su base WordPress y sus correos siguen siendo dueños de reservas y recordatorios; la integración automática se aborda después de probar el flujo interno.

## Próxima fase, tras 10 encargos reales

Comparar costo cotizado y costo final por categoría, observar cuándo se pierde margen y ajustar los recargos. Con esa evidencia, añadir sincronización unidireccional de citas confirmadas, aviso de cancelaciones y plantillas de correo de cotización/aprobación/retiro. La sincronización deberá tener autenticación entre servicios, idempotencia por ID de cita y registro de errores. No se deben compartir bases de datos entre la agenda y este control.
