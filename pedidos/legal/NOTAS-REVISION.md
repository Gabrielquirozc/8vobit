# Notas para la revisión jurídica

Versión 2026-10-16. Fuentes consultadas en el Centro de Conocimiento (`Documents\Centro de Conocimiento`,
`python rag.py search`). El disco `E:` con los textos completos de BCN no estaba conectado; los fragmentos
salen del índice.

## Verificado contra fuente primaria

- **Ley 21.719**: publicada el 13-12-2024 y vigente desde el **01-12-2026** (BCN, idNorma 1209272). El
  Anexo A del contrato de servicio tiene que firmarse con Gassuso antes de esa fecha.
- **Ley 19.496, art. 3 bis b)**: retracto de 10 días en los contratos electrónicos, salvo que el
  proveedor lo excluya expresamente. Los Términos de la carta (§7) lo excluyen por tratarse de alimentos
  perecibles preparados a pedido.

## Puntos que hay que decidir (no verificados en el índice)

1. **Art. 12 A, Ley 19.496** (contratos electrónicos): confirmar si basta con la confirmación que da
   hoy la carta (número de pedido, enlace de seguimiento y Términos imprimibles) o si se exige
   confirmación escrita, por ejemplo por correo. La carta no pide correo.
2. **Exclusión del retracto**: ¿es suficiente el aviso junto al botón "Enviar pedido" o hay que destacarlo
   más (casilla o texto en el resumen del pedido)? Cada pedido ya guarda `legal_version`.
3. **Ley 21.719, roles**: el local es el responsable y 8vobit el encargado. Revisar el contenido mínimo
   del contrato de encargo, el plazo de 48 h para avisar incidentes y el régimen de subencargados
   (Cloudflare y OSM, fuera de Chile = transferencia internacional).
4. **Base de licitud de las estadísticas internas**: hoy se invoca el interés legítimo (Privacidad §3).
5. **Registro de asistencia (art. 33 del Código del Trabajo)**: las marcas con PIN están rotuladas como
   "control interno". Confirmar que el rótulo basta y que no se requiere certificación de la DT mientras
   no se usen como registro oficial.
6. **Contrato de servicio**: límite de responsabilidad a 12 meses de pagos; tribunales de Concepción;
   prohibición de trasladar la tarifa del 1 % al cliente final.
7. **Plazo de conservación de los datos laborales** en el aviso a trabajadores (dice "en general 5
   años"; confirmarlo).
