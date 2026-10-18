# Agenda online de 8vobit: cuánto cobrar (propuesta)

Estado: **propuesta para que Gabriel la apruebe** (18-oct-2026). Nada de esto está publicado.

## Qué se vende

Es la misma agenda que usa 8vobit (agenda-interna sobre WordPress), instalada **para el profesional, con su marca**:
- Página de reservas con su nombre, colores y servicios. Se puede incrustar en su página web.
- Se conecta a su Google Calendar: no ofrece horas en las que está ocupado y crea la cita con link de Meet.
- Formularios propios por servicio, feriados de Chile, horario por día y anticipación mínima.
- Panel para ver, confirmar, mover o cancelar citas.
- Correos de confirmación y recordatorio (cuando el SMTP esté configurado).
- Cobro en línea con Transbank (opcional; el plugin ya lo trae).
- **Sin marketplace ni comisión**: la agenda es del profesional, no de una plataforma.

## Referencia del mercado

| Competidor | Plan | Precio mensual | Notas |
|---|---|---|---|
| AgendaPro | Individual (1 profesional) | $15.900 + IVA (≈ $18.900) | Marketplace, sitio de reservas, recordatorios, pago en línea, 50 confirmaciones por WhatsApp |
| AgendaPro | Básico (2–20) | $34.900 + IVA | Más correos, inventario y comisiones |
| AgendaPro | Premium (2–20) | $54.900 + IVA | Sitio con URL y colores propios, fichas, giftcards |

Fuente: [AgendaPro, planes Chile](https://agendapro.com/cl/planes), consultado el 18-oct-2026. No encontré precios públicos de Reservo ni de Encuadrado.

**Lectura:** el profesional chileno ya está acostumbrado a pagar entre **$15.000 y $35.000 al mes** por una agenda. AgendaPro no cobra implementación, pero tener **marca y URL propias** recién viene en Premium ($54.900 + IVA).

## Propuesta de precios

| | Precio | Qué incluye |
|---|---|---|
| **Implementación** (una vez) | **$120.000** | Instalación, marca, servicios y formularios, horarios, conexión a Google Calendar, correo de envío y una capacitación de 30 min |
| **Mensualidad** | **$14.990** | Servidor, actualizaciones, respaldo y soporte por WhatsApp o Instagram |
| Pago anual | **$149.900** | 2 meses gratis |
| **Con página web** | Implementación **$60.000** | Si contrata la página web (desde $150.000), la agenda se integra a la misma página |
| Cobro en línea (Transbank) | +$30.000 la configuración | Las comisiones de Transbank son aparte |

**Por qué estos números:**
- La mensualidad queda **bajo AgendaPro Individual** ($18.900 con IVA), con marca propia y sin marketplace, que en AgendaPro requiere Premium ($65.300 con IVA).
- La implementación paga el trabajo real: unas 3 a 4 horas de configuración más la capacitación. Así la mensualidad cubre solo la mantención (≈ 1 h al mes por cliente).
- Para el negocio: **10 clientes = $149.900 al mes** recurrentes, con la misma instalación replicada.

## Antes de vender (pendientes técnicos)

1. **Correos**: sin SMTP no salen las confirmaciones (ver `infra/n8n/CORREOS-SMTP.md`).
2. **Una instalación por cliente** (como la de 8vobit) o varias marcas en una sola: definir según la memoria del servidor (hoy cada WordPress + MariaDB usa ≈ 200 MB).
3. **Contrato o condiciones simples**: qué incluye la mensualidad y qué pasa si se deja de pagar (se entrega un respaldo de sus citas).

## Decisiones pendientes (Gabriel)

- ☐ ¿Implementación de $120.000 y mensualidad de $14.990?
- ☐ ¿Ofrecer el plan anual?
- ☐ ¿Cobro en línea como extra o incluido?
