# Despliega pedidos/ en lenovo-edge desde Windows (PowerShell).
# Uso, desde la carpeta del repo:
#   powershell -ExecutionPolicy Bypass -File .\pedidos\deploy\desplegar.ps1
# Patron del workspace: scp a /tmp + ssh con un solo nivel de comillas, sin heredoc
# y SIN comillas dobles dentro del comando ssh (PowerShell 5 las elimina al pasar
# argumentos a programas nativos).
# (Archivo solo en ASCII: PowerShell 5 lee mal las tildes en UTF-8 sin BOM.)
$ErrorActionPreference = 'Stop'
$srv = 'gabriel@lenovo-edge'
$raiz = Split-Path -Parent $PSScriptRoot          # ...\pedidos
$tgz = Join-Path $env:TEMP 'pedidos-deploy.tgz'

Write-Host '== Normalizando scripts .sh a saltos de linea LF'
# git en Windows puede dejarlos en CRLF y bash en el servidor falla con eso.
Get-ChildItem -Path $raiz -Recurse -Filter *.sh | ForEach-Object {
  $t = [IO.File]::ReadAllText($_.FullName)
  if ($t.Contains("`r")) {
    [IO.File]::WriteAllText($_.FullName, $t.Replace("`r", ''))
    Write-Host "   corregido: $($_.Name)"
  }
}

Write-Host '== Empaquetando (sin data/ ni .env)'
tar -czf $tgz -C $raiz --exclude=./data --exclude=./.env --exclude=./node_modules .

Write-Host '== Copiando a lenovo-edge'
scp $tgz "${srv}:/tmp/pedidos-deploy.tgz"

Write-Host '== Desplegando (pruebas, respaldo, build, verificacion)'
ssh $srv 'rm -rf /tmp/pedidos-deploy && mkdir /tmp/pedidos-deploy && tar -xzf /tmp/pedidos-deploy.tgz -C /tmp/pedidos-deploy && sudo bash /tmp/pedidos-deploy/deploy/remoto.sh'
