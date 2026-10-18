# Despliega el flujo del bot de DM en n8n (lenovo-edge), desde D:\8vobit en PowerShell:
#   powershell -ExecutionPolicy Bypass -File .\infra\n8n\desplegar-bot.ps1
# Mismo patrón que pedidos/deploy/desplegar.ps1: usuario gabriel, scp a /tmp y un ssh
# sin comillas dobles adentro (PowerShell 5 las elimina al pasarlas a ssh).
$ErrorActionPreference = 'Stop'
$srv = 'gabriel@lenovo-edge'
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host '== Pruebas del cerebro'
node --test "$raiz\bot\cerebro.test.js"
if ($LASTEXITCODE -ne 0) { throw 'Fallaron las pruebas: no se despliega.' }

Write-Host '== Armando el flujo'
node "$raiz\bot\construir-flujo.js"
if ($LASTEXITCODE -ne 0) { throw 'No se pudo armar el flujo.' }

Write-Host '== Copiando a lenovo-edge'
scp "$raiz\flujo-dm-instagram.json" "${srv}:/tmp/flujo-bot.json"
if ($LASTEXITCODE -ne 0) { throw 'No se pudo copiar (revisa Tailscale o la red).' }

Write-Host '== Importando y publicando en n8n'
ssh -t $srv 'sudo docker cp /tmp/flujo-bot.json n8n:/tmp/flujo-bot.json && sudo docker exec n8n n8n import:workflow --input=/tmp/flujo-bot.json && sudo docker exec n8n n8n publish:workflow --id=GOhImTsPA0GizMPu && cd /srv/docker/compose/n8n && sudo docker compose restart n8n && rm /tmp/flujo-bot.json'
if ($LASTEXITCODE -ne 0) { throw 'Falló la importación en el servidor.' }

Write-Host '== Listo. Prueba desde otra cuenta: "hola, cuánto sale formatear?"'
