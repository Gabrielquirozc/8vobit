# Diseño por etapas: agenda y control técnico

## Decisión actual

El control técnico es una aplicación interna de OctavoBit, separada del sistema de pedidos de restaurantes. La agenda propia de 8vobit sigue gestionando disponibilidad, citas, reprogramaciones y recordatorios. La orden técnica gestiona equipo, diagnóstico, cotización, pieza por encargo, compra, cobro, documentos y rentabilidad.

El código actual constituye la fase 1 local. No se ha conectado a producción ni se ha importado el historial 2025–2026.

## Fase 1: captura y cálculo, entregada localmente

- Una orden por encargo; vínculo opcional y único con ID de cita.
- Precios públicos de servicios según la lista aprobada; pieza con costo del proveedor del día y recargo editable.
- Componentes separados: pieza, flete, arancel, gestión, contingencia e IVA recuperable estimado.
- Anticipos, saldos y egresos por fecha de caja. Anulación trazable de errores.
- Folio y fecha de DTE emitido externamente, con desglose bruto entre servicio y pieza.
- Resumen y movimientos mensuales en CSV para abrir en Excel. Alertas de entregas sin folio y compras sin respaldo o revisión.

## Fase 2: sincronización de agenda

La agenda de `8vobit.xyz/agenda` registra citas con ID, tipo de evento, cliente, correo, teléfono, notas, estado y hora. Tiene recordatorios de 24 h y 1 h. La versión de producción del plugin puede diferir del código local: comparar antes de tocarla.

1. Añadir a la instalación de 8vobit un adaptador específico, sin poner reglas de reparaciones en el plugin reutilizable.
2. Al confirmar una cita de diagnóstico o cambio de pieza, enviar un evento autenticado con ID y versión. El control crea o actualiza la orden preliminar por `agenda_id` de forma idempotente. No creará ingresos ni gastos por reservar.
3. Al reagendar o cancelar, actualizar solo los datos de cita; preservar diagnóstico, cotización, pagos y documentos. Mostrar los casos que requieran intervención humana.
4. Reintentar eventos fallidos y conciliar diariamente IDs de la agenda contra órdenes para recuperar avisos perdidos.
5. Control técnico enviará solicitudes de correo de estado a un módulo de notificaciones, con plantillas y consentimiento apropiados. Se registrarán envío, fallo y reintento. Los recordatorios de cita quedan en la agenda.

Antes de activar correos reales: verificar SMTP en producción, cron independiente de visitas, plantilla, remitente y una reserva de prueba de punta a punta.

## Fase 3: contabilidad preparada para revisión

Definir con contador/a un catálogo reducido de cuentas de OctavoBit y ejemplos de asientos para anticipo, compra de pieza, IVA crédito, arancel, venta, IVA débito y cierre del costo. Generar una propuesta de libro diario balanceada a partir de movimientos y DTE, con reversos y exportación, sin tratarla como asiento oficial hasta revisar el mapeo y el devengo. Conciliar mensualmente contra cartola bancaria y RCV del SII.

El IVA de importación pagado afecta caja; puede ser crédito fiscal si el respaldo y requisitos aplican. El arancel, flete y gestión se incorporan al costo comercial. Un IVA no acreditable permanece como costo. La cotización congela la estimación al aprobarla; la ficha compara luego estimación y costo real.

## Seguridad y continuidad antes de publicar

La app actual solo escucha en `127.0.0.1`. Para usarla desde teléfono o servidor hace falta autenticación, control de acceso, respaldo probado, política de adjuntos y transporte HTTPS. No se debe cambiar `CONTROL_HOST` a una interfaz pública sin completar esas condiciones. La base local SQLite y la agenda WordPress tienen dueños distintos y se conectarán por una interfaz autenticada.
