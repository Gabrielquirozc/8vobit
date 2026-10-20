# Plan y dimensionamiento: alta online (SPEC-001) y gestor (SPEC-002)

Escrito el 2026-10-20. Supuesto: una persona a medio tiempo, ~20 h/semana (VIABILIDAD.md: ~80 h/mes),
con Claude Code. Las horas incluyen tests y pruebas en local; no incluyen esperas externas (Flow, abogado).

## Ya hecho (base que se reutiliza)
- Licencias con prueba, gracia, suspensión, pagos manuales e historial (`lib/licencias.mjs`).
- Alta de local con clave y carta en pausa (`lib/admin.mjs`), primeros pasos (`lib/autoservicio.mjs`).
- Panel en solo lectura al vencer, exportar siempre permitido.
- Tablero del gestor: escalones 5/10/20/42/50, hitos, cobranza, riesgo (`lib/gestion.mjs`).

## Dimensionamiento

| # | Bloque | Spec | Horas | Riesgo |
|---|--------|------|------:|--------|
| 0 | Cuenta Flow de 8vobit (sandbox) y canal de WhatsApp definido | — | 2 + espera | **Alto**: bloquea 3, 6 y 7 |
| 1 | Solicitudes: tabla, endpoint público, validación de RUT, límites por IP/número | 001 | 6 | Bajo |
| 2 | Código por WhatsApp (envío vía n8n, verificación, expiración) | 001 | 6 | Medio |
| 3 | Flow: firma HMAC, registro de tarjeta sin cobro, retorno y webhook | 001 | 10 | **Alto** (FR-04 sin confirmar) |
| 4 | /admin: solicitudes por aprobar, aprobar/rechazar, repetidas | 001 | 4 | Bajo |
| 5 | Formulario "Contratar" en 8vobit.xyz (minimalista, una acción) | 001 | 4 | Bajo |
| 6 | "Seguir con mi plan": pago Flow iniciado por el cliente + webhook → licencia | 001 | 8 | Medio |
| 7 | Avisos días 1/7/13/14/17: proceso diario, registro de envíos, banner en panel | 001 | 8 | Medio (WhatsApp) |
| 8 | Límites durante la prueba (pedidos web, productos, exportar) | 001 | 3 | Bajo |
| 9 | Términos y privacidad actualizados, `legal-version.js` | 001 | 3 + abogado | Medio |
| 10 | Pruebas de punta a punta en sandbox, despliegue y paso a producción | 001 | 5 | Medio |
| | **Subtotal SPEC-001** | | **≈ 59 h** | |
| 11 | Prospectos, etapas, próxima acción, conversión | 002 | 6 | Bajo |
| 12 | Horas de soporte por local | 002 | 3 | Bajo |
| | **Subtotal SPEC-002** | | **≈ 9 h** | |
| | **Total** | | **≈ 68 h** | |

Con margen de imprevistos (+25 %): **≈ 85 h ≈ 4 a 5 semanas a medio tiempo**.

## Orden recomendado (entregas que sirven solas)
1. **Semana 1 — sin Flow:** bloques 1, 2, 4 y 5. Ya se puede recibir solicitudes reales desde la web y aprobarlas
   a mano. Mientras, pedir la cuenta Flow (bloque 0).
2. **Semana 2 — prueba buena onda:** bloques 7 y 8. Los avisos y los límites funcionan también para los locales
   que das de alta a mano hoy.
3. **Semanas 3 y 4 — Flow:** bloques 3 y 6 en sandbox, luego 9 y 10.
4. **Cuando haya más de ~10 prospectos a la vez:** SPEC-002 (bloques 11 y 12).

## Cuándo conviene hacerlo (VIABILIDAD.md)
- Antes del 5º local, el alta a mano basta; el valor de la semana 1 es **captar** solicitudes desde la web.
- El pago con Flow (semanas 3–4) se vuelve necesario entre el 5º y el 10º local, cuando cobrar a mano empieza a
  costar horas. Coincide con el punto 7 de ESTRATEGIA.md.

## Borradores de los avisos (FR-10)
- Día 1: ¡Bienvenido a 8vobit, [nombre]! 🙌 Tu carta ya está lista para armarla. Te dejamos los primeros pasos
  en el panel: en 15 minutos puedes recibir tu primer pedido. Cualquier duda, nos escribes por acá.
- Día 7: ¡Vamos en la mitad! Esta semana llevas [N pedidos y $X en ventas] por tu carta. ¿Te ayudamos con algo?
- Día 13: Mañana termina tu prueba de 14 días. Si te gustó, puedes seguir desde aquí 👉 [Seguir con mi plan].
  Y si no es para ti, tranqui: no se te cobra nada.
- Día 14: Tu prueba terminó y dejamos tu carta en pausa. Tus productos y ventas quedan guardados; cuando quieras
  seguir, partes justo donde quedaste 👉 [Seguir con mi plan]
- Día 17: ¡Hola de nuevo! Tu carta sigue guardada por si la quieres retomar. Si algo no te acomodó, nos encantaría
  saber qué fue. Gracias por probar 8vobit 🙏
