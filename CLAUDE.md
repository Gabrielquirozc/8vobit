# Memoria del proyecto (léela al empezar)

Este repo tiene dos cosas:

- La raíz (`index.html`, `environments/`, `scripts/`): el sitio de 8vobit (ver `WORKFLOW.md`).
- **`pedidos/`**: sistema de pedidos y control para locales de comida. Piloto: Gassuso (Concepción).
  Producción en https://pedidos.8vobit.xyz (servidor propio `lenovo-edge`, Docker + túnel Cloudflare).

Antes de trabajar en `pedidos/`, lee en este orden:

1. `pedidos/PENDIENTES.md`: estado, cómo correr, probar y desplegar, mapa del código, pendientes con el dueño y decisiones tomadas.
2. `pedidos/PLAN-CONTROL.md`: comparativa con Fudo (planes y precios) y plan por etapas del **sistema de control propio** (gastos, estado de resultados, usuarios con PIN, inventario…).
3. `pedidos/ESTRATEGIA.md`: competencia (Fudo, Justo), producto de entrada, planes, líneas de trabajo y diseño del gestor de licencias.
4. `pedidos/VIABILIDAD.md`: si es viable para el creador (solo, medio tiempo, meta $2M/mes): números, hitos y palancas.
5. `pedidos/README.md`: detalle de cada función.

## Reglas de trabajo

- El usuario escribe en español de Chile; responder en español.
- Rama de trabajo: `claude/compassionate-maxwell-hb826m`. Hacer commit y push al terminar cada cambio.
- Node 22, sin dependencias npm (`node:sqlite`). Antes de subir: `cd pedidos && npm test`.
- Desplegar lo hace el usuario: `powershell -ExecutionPolicy Bypass -File .\pedidos\deploy\desplegar.ps1` desde `D:\8vobit`.
- Al terminar algo importante, actualizar `pedidos/PENDIENTES.md`: es la memoria que sobrevive entre sesiones.
- Nunca subir claves: la del panel vive solo en `/srv/docker/compose/pedidos/.env` en el servidor.
