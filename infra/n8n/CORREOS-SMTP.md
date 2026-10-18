# Correos de la agenda: cómo hacer que salgan (gratis)

Problema (verificado el 18-oct-2026): la agenda **no envía correos**. El contenedor de WordPress no tiene programa de envío y el SMTP del plugin está apagado. Una reserva de prueba quedó con `email_status=failed`. Es muy probable que a la agenda de CÓDICE le pase lo mismo.

**No hace falta instalar otro plugin:** agenda-interna ya trae configuración SMTP propia, en *Agenda Interna → Pagos → sección SMTP*. Solo falta un servidor de correo que acepte enviar.

## Opciones gratuitas

| Opción | Remitente | Límite gratis | Llega a la bandeja | Qué hay que hacer |
|---|---|---|---|---|
| **Brevo** (recomendada) | `agenda@8vobit.xyz` | 300 correos al día | Sí, con el dominio verificado | Crear la cuenta, verificar 8vobit.xyz (registros DNS en Cloudflare) y copiar la clave SMTP |
| Gmail con contraseña de aplicación | `tucuenta@gmail.com` | ~500 al día | Sí | Activar verificación en 2 pasos, crear una "contraseña de aplicación" y copiarla |
| Servidor de correo propio en lenovo-edge | `@8vobit.xyz` | Sin límite | **No**: desde una IP de casa los correos llegan a spam o se bloquean (el puerto 25 suele estar cerrado) | No lo recomiendo |

300 al día alcanza de sobra: cada cita genera 2 o 3 correos (confirmación, aviso a Gabriel y recordatorio).

## Pasos con Brevo (los que dicen "Gabriel" son suyos porque usan su cuenta y sus claves)

1. **Gabriel**: crea la cuenta gratis en brevo.com con el correo de 8vobit.
2. **Gabriel**: en Brevo, *Remitentes y dominios → Agregar dominio → 8vobit.xyz*. Brevo muestra 3 o 4 registros DNS (código de verificación, DKIM y DMARC).
3. **Claude** (con OK): agrega esos registros en Cloudflare (DNS de 8vobit.xyz) y Gabriel pulsa "Verificar" en Brevo.
4. **Gabriel**: en Brevo, *SMTP y API → Generar clave SMTP*. Copia el usuario y la clave.
5. **Gabriel**: en la agenda, *Agenda Interna → Pagos → SMTP*, completa:
   - Servidor: `smtp-relay.brevo.com` · Puerto: `587` · Cifrado: `TLS`
   - Usuario y clave: los de Brevo
   - Remitente: `agenda@8vobit.xyz` · Nombre: `8vobit`
   - Pulsa "Enviar correo de prueba".
6. **Claude**: hace una reserva de prueba y verifica `email_status=sent` y que el correo llegue.

El SPF de 8vobit.xyz también hay que revisarlo: si ya existe un registro `v=spf1`, se agrega `include:spf.brevo.com` en vez de crear otro.
