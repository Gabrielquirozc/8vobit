# SPEC-002: Embudo de prospectos y horas de soporte en /admin

## Estado
- [x] Borrador (2026-10-20) · [ ] Aprobado · [ ] Implementado

## Resumen
Completa el tablero del gestor (`lib/gestion.mjs`) con lo que falta para escalar de 5 a 20 o 50 locales:
saber cuántos contactos hacen falta por cada local que paga, y cuánto soporte consume cada local.

## Alcance
- Dentro: prospectos con etapa, nota y próxima acción; conversión entre etapas; horas de soporte por local.
- Fuera: CRM completo, correos masivos, integración con Instagram (los DM de n8n siguen aparte).

## Requisitos funcionales
- FR-01: El gestor podrá crear prospectos con nombre del local, contacto, comuna, origen (Instagram, referido,
  visita, web) y nota.
- FR-02: Cada prospecto tendrá una etapa: contactado → demo → prueba → pagando, o perdido con motivo.
- FR-03: Cada prospecto podrá tener una **próxima acción con fecha**; /admin mostrará primero las vencidas.
- FR-04: CUANDO una solicitud de SPEC-001 se aprueba, se creará o moverá el prospecto a "prueba" solo.
- FR-05: CUANDO un local registra su primer pago, su prospecto pasará a "pagando" solo.
- FR-06: El tablero mostrará la conversión por etapa (últimos 90 días) y cuántos contactos hacen falta para la
  meta elegida (meta − pagando) ÷ conversión contactado→pagando.
- FR-07: El gestor podrá anotar horas de soporte por local (fecha, minutos, motivo).
- FR-08: El tablero mostrará horas de soporte por local al mes y el promedio contra la meta (≤ 1,5 h y luego
  ≤ 0,5 h, VIABILIDAD.md).

## Requisitos no funcionales
- NFR-01: Solo con sesión de admin (401 sin ella). Input validado y acotado en el servidor.

## Preguntas abiertas
- [ ] ¿Importar los prospectos que hoy llegan por los DM de Instagram (n8n) o se anotan a mano?
