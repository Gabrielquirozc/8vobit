# SPEC-001: Alta online desde 8vobit.xyz con prueba de 14 días

## Estado
- [x] Borrador (2026-10-20) · [ ] Revisado · [ ] Aprobado · [ ] Implementado · [ ] Listo

## Resumen
Un local de comida puede pedir su sistema desde 8vobit.xyz. Antes de crearle nada se valida que es real
(tarjeta inscrita en Flow **sin cobro**, código por WhatsApp y RUT) y el gestor lo aprueba en /admin.
Recibe una prueba de 14 días con avisos buena onda. Al terminar la prueba **nunca se cobra solo**: el local queda
en pausa con sus datos guardados y se le ofrece seguir con el botón "Seguir con mi plan", que paga con Flow.

## Alcance
- Dentro: formulario público, solicitudes, código por WhatsApp, validación de RUT, registro de tarjeta en Flow,
  aprobación en /admin, prueba de 14 días con límites, avisos días 1/7/13/14/17, pausa al terminar,
  pago iniciado por el cliente con Flow y renovación de la licencia al confirmarse el pago.
- Fuera: cobro automático o recurrente sin acción del cliente (prohibido por decisión del dueño),
  facturación electrónica (L5), alta sin aprobación del gestor, Mercado Pago.

## Requisitos funcionales
- FR-01: El sitio 8vobit.xyz mostrará un botón "Contratar" con los planes Canal, Gestión y Pro y un formulario
  con nombre del local, nombre de contacto, WhatsApp, RUT, comuna y plan.
- FR-02: CUANDO se envía el formulario, el sistema creará una **solicitud** (no un local) y enviará un código de
  6 dígitos por WhatsApp al número indicado.
- FR-03: SI el RUT no tiene dígito verificador válido, el sistema rechazará la solicitud con un mensaje claro.
- FR-04: CUANDO el código es correcto, el sistema llevará al contacto a inscribir su tarjeta en Flow.
  La inscripción **no cobra nada**; el sistema guarda solo la referencia de cliente que entrega Flow, nunca datos
  de la tarjeta.
- FR-05: CUANDO Flow confirma la inscripción, la solicitud quedará "por aprobar" y el gestor recibirá un aviso.
- FR-06: /admin mostrará las solicitudes por aprobar con sus validaciones (WhatsApp ✓, RUT ✓, tarjeta ✓) y
  botones Aprobar / Rechazar con motivo.
- FR-07: CUANDO el gestor aprueba, el sistema creará el local con la misma alta de hoy (prueba de 14 días, carta
  en pausa, clave nueva) y enviará la clave y el link al panel por WhatsApp.
- FR-08: SI el mismo RUT, WhatsApp o cliente Flow ya tuvo una prueba, el sistema marcará la solicitud como
  repetida y el gestor decidirá.
- FR-09: MIENTRAS la licencia está en prueba, el sistema aplicará límites: tope de pedidos web, tope de
  productos y sin exportación masiva (valores por definir).
- FR-10: El sistema enviará avisos por WhatsApp y en el panel: día 1 bienvenida, día 7 mitad de la prueba con
  pedidos y ventas del local, día 13 "mañana termina", día 14 pausa con datos guardados, día 17 último saludo.
  Cada aviso se envía una sola vez y se registra.
- FR-11: CUANDO termina la prueba sin pago, la licencia pasará a pausa (solo lectura, exportar permitido) y
  **no se hará ningún cobro**.
- FR-12: El panel mostrará "Seguir con mi plan" durante la prueba y en la pausa. Al pulsarlo el cliente elige ciclo
  (mensual, semestral, anual) y paga en Flow.
- FR-13: CUANDO Flow confirma el pago (webhook con firma válida), el sistema registrará el pago y extenderá la
  licencia igual que "Registrar pago" del admin.
- FR-14: SI el webhook de Flow no tiene firma válida o el monto no coincide, el sistema lo ignorará y lo
  registrará en el historial.
- FR-15: Después del día 17 el sistema no enviará más mensajes de la prueba.

## Requisitos no funcionales
- NFR-01: Las llaves de Flow viven solo en el `.env` del servidor. Primero sandbox, luego producción.
- NFR-02: Formulario y código con límite de intentos por IP y por número (anti-scraping y anti-spam).
- NFR-03: Todo el input se valida en el servidor; las respuestas de error no exponen detalles internos.
- NFR-04: Tono de los mensajes cercano y nunca amenazante (ver borradores en `plan.md`).
- NFR-05: Términos y Política de privacidad actualizados antes de abrir (tarjeta inscrita, avisos por WhatsApp).
- NFR-06: Sin dependencias npm nuevas (firma HMAC de Flow con `node:crypto`).

## Dependencias
- Externas: cuenta Flow de 8vobit (sandbox y producción), canal de envío por WhatsApp (n8n ya existe en el
  servidor, ver `infra/n8n/OPERACION.md`).
- Internas: `lib/licencias.mjs` (estados, pagos), `lib/admin.mjs` (alta), `lib/gestion.mjs` (tablero).

## Preguntas abiertas
- [ ] ¿Flow permite inscribir tarjeta sin cobro? Si no: cobro de verificación de $100 con devolución inmediata.
- [ ] ¿Qué cuesta en Flow la inscripción y cada pago? (afecta el precio neto por local).
- [ ] Límites de la prueba: ¿cuántos pedidos web y productos?
- [ ] ¿Por dónde sale el WhatsApp: número de 8vobit vía n8n o WhatsApp Business API oficial?
- [ ] ¿Qué pasa con un local en pausa después de N meses sin pagar? (hoy: cancelada a los `CANCELA_DIAS`).
