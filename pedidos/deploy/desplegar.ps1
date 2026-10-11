# Despliega pedidos/ en lenovo-edge desde Windows (PowerShell).
# Uso, desde la carpeta del repo:
#   powershell -ExecutionPolicy Bypass -File .\pedidos\deploy\desplegar.ps1
# Patron del workspace: scp a /tmp + ssh con un solo nivel de comillas, sin heredoc.
# (Archivo solo en ASCII: PowerShell 5 lee mal las tildes en UTF-8 sin BOM.)
$ErrorActionPreference = 'Stop'
$srv = 'gabriel@lenovo-edge'
$raiz = Split-Path -Parent $PSScriptRoot          # ...\pedidos
$tgz = Join-Path $env:TEMP 'pedidos-deploy.tgz'

Write-Host '== Empaquetando (sin data/ ni .env)'
tar -czf $tgz -C $raiz --exclude=./data --exclude=./.env --exclude=./node_modules .

Write-Host '== Copiando a lenovo-edge'
scp $tgz "${srv}:/tmp/pedidos-deploy.tgz"

Write-Host '== Desplegando (pruebas, respaldo, build, verificacion)'
# Se quitan los CR de los .sh por si git en Windows los convirtio a CRLF.
ssh $srv 'rm -rf /tmp/pedidos-deploy && mkdir /tmp/pedidos-deploy && tar -xzf /tmp/pedidos-deploy.tgz -C /tmp/pedidos-deploy && find /tmp/pedidos-deploy -name "*.sh" -exec sed -i "s/\r$//" {} + && sudo bash /tmp/pedidos-deploy/deploy/remoto.sh'
