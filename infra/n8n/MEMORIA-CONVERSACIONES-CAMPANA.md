# Memoria de conversaciones de la campaña (reinicio nov-2026)

Para qué sirve: dejar por escrito qué conversaciones nuevas genera la campaña de OCTAVOBIT (reinicio del 16-nov-2026), de qué pieza vienen, qué respondió el bot y qué pasó después. Así cada domingo (revisión de las 20:00) se compara con datos y no con memoria. Complementa a `ANALISIS-CHATS.md` (histórico de 6 años) y a `OPERACION.md` (cómo operar el bot).

## Reglas de privacidad (no negociables)

- **Sin nombres, sin @usuarios, sin IDs de Meta, sin texto literal de mensajes** de clientes. Cada contacto se anota como `C-001`, `C-002`… La equivalencia con la persona real la lleva Gabriel aparte, fuera del repositorio.
- Del mensaje solo se guarda la **intención detectada** por el bot y, si Gabriel la conoce, la pieza de origen.
- Las pruebas internas se marcan `PRUEBA` y **no cuentan** como captación.
- Sin tokens ni secretos. Este archivo puede subirse al repo.

## Cómo se obtiene el dato (solo lectura)

La bandeja de Meta Business Suite **no muestra todo lo que atiende el bot** (el 17-nov omitió 2 chats de agenda). La fuente confiable son las ejecuciones de n8n (se guardan 14 días: copiar al registro antes de que se borren). Por SSH al servidor, solo metadatos (hora, estado, intención), sin leer el texto:

```bash
ssh gabriel@lenovo-edge "docker exec n8n node -e \"
const s=require('/usr/local/lib/node_modules/n8n/node_modules/sqlite3');
const {parse}=require('/usr/local/lib/node_modules/n8n/node_modules/flatted');
const d=new s.Database('/home/node/.n8n/database.sqlite',s.OPEN_READONLY);
d.all('select e.id,e.status,e.startedAt,x.data from execution_entity e join execution_data x on x.executionId=e.id where e.mode=\\'webhook\\' order by e.startedAt desc limit 60',(er,r)=>{
 for(const x of r){try{const rd=parse(x.data).resultData.runData;
  const dec=rd['Verificar firma y decidir'];const o=dec&&dec[0].data.main[0]&&dec[0].data.main[0][0]&&dec[0].data.main[0][0].json;
  const rr=rd['Responder DM'];const err=rr&&rr[0].error?(rr[0].error.description||'err').slice(0,50):'';
  console.log(x.id,x.startedAt,x.status,o?(o.intencion||'-'):'sin-decision',err);}catch(z){}}});
\""
```

- Las horas de n8n están en UTC; en Chile (noviembre) son **UTC-3**.
- `sin-decision`: el bot recibió el evento (reacción, mención de historia, lectura) y no tenía nada que responder.
- Un envío con error «No se puede encontrar al usuario solicitado» indica un remitente simulado (prueba interna), no un fallo del bot.

## Cómo leer una conversación

| Campo | Qué anotar |
|---|---|
| Contacto | `C-NNN` |
| Fecha y hora (Chile) | Del primer mensaje |
| Real o prueba | `REAL` o `PRUEBA` (confirmado por Gabriel) |
| Intención del bot | `agendar`, `agendo`, `revision`, `web_*`, `sin_intencion`… |
| Pieza de origen | Historia, carrusel o reel (si se sabe) |
| Respuesta | Enviada / falló (con motivo) / sin respuesta del bot |
| Siguiente paso | Demo, propuesta, primer mes pagado, nada |
| Aprendizaje | Qué cambiaría en la pieza, el bot o la oferta |

## Registro

| Contacto | Fecha | Tipo | Intención | Origen | Respuesta | Siguiente paso | Nota |
|---|---|---|---|---|---|---|---|
| C-001 | lun 16-nov, ~19:37 | REAL | `agendar` | Por confirmar | Enviada | Por confirmar | Primer chat de agenda de la campaña |
| C-002 | lun 16-nov, ~19:52 | REAL | `agendo` | Por confirmar | Enviada | Por confirmar | Segundo chat de agenda. Gabriel confirmó el 17-nov que ambos son reales |
| T-001 a T-003 | mar 17-nov, 13:50 | PRUEBA | `revision` (×3: `REVISIÓN`, `revisión`, `Revision`) | Bot interno | Falló el envío (remitente simulado) | — | La decisión fue correcta ($5.000 descontable, link `8vobit.xyz/#agendar`). No prueba la entrega real |

Eventos sin intención (reacciones, menciones de historia, mensajes que el bot no responde) quedan fuera de este registro; se cuentan solo como total semanal.

## Resumen semanal

| Semana | DM con intención de captación (reales) | `agendar`/`agendo` | `revision` | Respondidos por el bot | Pasaron a demo | Primer mes pagado |
|---|---|---|---|---|---|---|
| 16–22 nov | 2 (hasta el 17-nov) | 2 | 0 | 2 | Por confirmar | 0 |

Línea base de Meta antes del registro (IG, 28 días al 16-nov): 2.249 visualizaciones, 500 de alcance, 43 interacciones, 56 visitas al perfil, +6 seguidores, 0 clics en el enlace. El lunes 16 concentró 744 visualizaciones y 33 interacciones.

## Lo aprendido hasta hoy (17-nov-2026)

1. **El primer día de campaña sí generó conversaciones reales:** 2 chats de agenda el lunes 16 por la tarde-noche, ambos respondidos por el bot sin error. Las 21 visitas al perfil del día no dejaron más que +1 seguidor, así que la conversión pasa por el DM, no por el seguimiento.
2. **No medir DM solo en la bandeja de Meta.** Omite conversaciones atendidas por el bot. Medir en n8n y copiar al registro cada semana (retención de 14 días).
3. **Separar pruebas de clientes reales.** Los bots internos de prueba generan ejecuciones que parecen DM. Sin esa marca se infla la captación.
4. **La entrega real de `REVISIÓN` sigue sin probarse.** La lógica está verificada con remitentes simulados; falta un mensaje desde una cuenta real distinta de @octavobit.cl. Hasta entonces M3 y J3 dependen de esa prueba.
5. **Los textos del bot ya no enlazan a Calendly** (usan `8vobit.xyz/#agendar`), pero la respuesta sugerida de Meta en la bandeja sí sigue enlazando a Calendly: corregirla en Meta.
6. **Una consulta por reacción no es captación.** Reacciones («le gustó un mensaje», comentarios a historias) no se cuentan como oportunidad.

## Cambios al bot durante la campaña

| Fecha | Cambio | Estado |
|---|---|---|
| mar 17-nov, ~13:50–14:00 | Se corrigieron y desplegaron 4 respuestas que fallaban con las historias del día (M2 a las 15:00, M3 a las 18:00). Reportado por Gabriel: pasan las 47.809 pruebas y el webhook está vivo. Coincide con lo visto en n8n: `cerebro.js` y `regresiones.json` modificados a las 13:57 y contenedor reiniciado esa tarde. Las 3 pruebas `REVISIÓN` de las 13:50 son de este ciclo | Desplegado. **Pendiente:** confirmar que Meta entrega a clientes reales y subir los cambios a git |

## Pendientes

- Subir a git los cambios de `cerebro.js`, `regresiones.json`, `historico.agregados.json` y `flujo-dm-instagram.json` (modificados el 17-nov).

- Confirmar la pieza de origen de C-001 y C-002 y qué pasó después (demo o propuesta).
- Enviar un `REVISIÓN` real y anotar hora, texto recibido y tiempo de respuesta.
- Copiar al registro las ejecuciones de n8n cada domingo antes de las 20:00.
- Cada lunes, anotar cuántos DM llegaron por palabra clave y de qué pieza vinieron (ver `AGENDA-OFERTA-CONTROL-Y-PROMOCION-2026-11-17.md`, §5).
