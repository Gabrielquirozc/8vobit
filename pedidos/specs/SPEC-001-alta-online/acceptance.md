# Criterios de aceptación: SPEC-001

Cada criterio se vuelve un test en `test/api.test.mjs` (Flow y WhatsApp simulados).

## AC-01 Solicitud válida (FR-01, FR-02)
- Dado el formulario con datos válidos
- Cuando se envía
- Entonces se crea una solicitud "esperando código", **no** un local, y sale un código por WhatsApp.

## AC-02 RUT inválido (FR-03)
- Dado un RUT con dígito verificador incorrecto
- Cuando se envía
- Entonces responde 400 con "Revisa el RUT" y no se envía código.

## AC-03 Código y tarjeta (FR-04, FR-05)
- Dado el código correcto
- Cuando Flow confirma la inscripción de tarjeta
- Entonces la solicitud queda "por aprobar", con la referencia de Flow y **ningún** pago registrado.

## AC-04 Abuso (NFR-02, FR-08)
- Dado más de 5 intentos de código o de formulario desde la misma IP o número en 15 minutos
- Entonces responde 429.
- Dado un RUT o WhatsApp que ya tuvo prueba, entonces la solicitud se marca "repetida".

## AC-05 Aprobación (FR-06, FR-07)
- Dado una solicitud por aprobar
- Cuando el gestor aprueba en /admin
- Entonces existe el local en prueba de 14 días, carta en pausa, y se envía su clave por WhatsApp.
- Sin sesión de admin, aprobar responde 401.

## AC-06 Avisos (FR-10, FR-15)
- Dado un local en prueba desde hace 0, 6, 12, 13 y 16 días
- Cuando corre el proceso diario
- Entonces se envía el aviso del día 1, 7, 13, 14 y 17 respectivamente, una sola vez cada uno,
  y el del día 7 incluye pedidos y ventas reales del local.
- Dado el día 18 o más, no se envía nada.

## AC-07 Fin de prueba sin cobro (FR-11)
- Dado un local cuya prueba terminó sin pago
- Entonces el panel queda en solo lectura, exportar funciona y **no existe ningún llamado de cobro a Flow**.

## AC-08 Seguir con mi plan (FR-12, FR-13)
- Dado un local en prueba o en pausa
- Cuando pulsa "Seguir con mi plan", elige ciclo y Flow confirma el pago con firma válida
- Entonces se registra el pago y la licencia queda activa hasta la fecha correcta.

## AC-09 Webhook falso (FR-14)
- Dado un webhook con firma inválida o monto distinto
- Entonces no cambia la licencia y queda en el historial.

## AC-10 Límites de prueba (FR-09)
- Dado un local en prueba que llegó al tope de pedidos web
- Entonces la carta muestra un mensaje amable y el panel sugiere "Seguir con mi plan".
