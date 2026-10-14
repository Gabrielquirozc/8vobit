# Respaldo de pedidos FUERA del servidor: trae a este PC una copia consistente de la
# base y las fotos de lenovo-edge. Los respaldos diarios del servidor viven en el mismo
# disco; si ese disco falla, esta copia es la que salva los pedidos.
#
# Uso (PowerShell, desde la carpeta del repo):
#   powershell -ExecutionPolicy Bypass -File .\pedidos\deploy\respaldo.ps1              # respalda ahora
#   powershell -ExecutionPolicy Bypass -File .\pedidos\deploy\respaldo.ps1 -Instalar    # y todos los dias a las 13:00
#   powershell -ExecutionPolicy Bypass -File .\pedidos\deploy\respaldo.ps1 -Restaurar   # muestra como volver atras
#
# (Archivo solo en ASCII: PowerShell 5 lee mal las tildes en UTF-8 sin BOM.)
param([switch]$Instalar, [switch]$Restaurar, [string]$Destino = 'D:\Respaldos\pedidos', [int]$Conservar = 30)
$ErrorActionPreference = 'Stop'
$srv = 'gabriel@lenovo-edge'
$remoto = '/tmp/pedidos-respaldo.tgz'

if ($Restaurar) {
  Write-Host 'Para restaurar un respaldo (detiene el servicio unos segundos):'
  Write-Host '  1. scp D:\Respaldos\pedidos\pedidos-FECHA.tgz gabriel@lenovo-edge:/tmp/r.tgz'
  Write-Host '  2. ssh gabriel@lenovo-edge'
  Write-Host '  3. mkdir /tmp/r ; tar -xzf /tmp/r.tgz -C /tmp/r'
  Write-Host '  4. sudo docker stop pedidos'
  Write-Host '  5. sudo docker cp /tmp/r/backups/externo.db pedidos:/data/pedidos.db'
  Write-Host '  6. sudo docker cp /tmp/r/img/. pedidos:/data/img/'
  Write-Host '  7. sudo docker start pedidos'
  Write-Host '  (borrar /data/pedidos.db-wal y -shm si existen, antes del paso 7)'
  exit 0
}

if ($Instalar) {
  # Register-ScheduledTask y no schtasks: PowerShell 5 rompe las comillas al pasar argumentos
  # a programas nativos. StartWhenAvailable: si el PC estaba apagado a la hora, corre al prender.
  $script = $MyInvocation.MyCommand.Path
  $accion = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -File "' + $script + '" -Destino "' + $Destino + '"')
  $cuando = New-ScheduledTaskTrigger -Daily -At '13:00'
  $ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
  Register-ScheduledTask -TaskName 'Respaldo pedidos Gassuso' -Action $accion -Trigger $cuando -Settings $ajustes -Force | Out-Null
  Write-Host '== Tarea programada: todos los dias a las 13:00 (o al prender el PC si estaba apagado).'
  Write-Host '   Requiere entrar a lenovo-edge por SSH sin clave (llave SSH), como el despliegue.'
}

New-Item -ItemType Directory -Force -Path $Destino | Out-Null
$archivo = Join-Path $Destino ('pedidos-' + (Get-Date -Format 'yyyy-MM-dd_HHmm') + '.tgz')

Write-Host '== Generando copia en el servidor'
ssh $srv "sudo -n bash /srv/docker/compose/pedidos/deploy/exportar.sh $remoto"
if ($LASTEXITCODE -ne 0) { throw 'No se pudo generar la copia en el servidor.' }

Write-Host '== Descargando'
scp "${srv}:$remoto" $archivo
if ($LASTEXITCODE -ne 0) { throw 'No se pudo descargar la copia.' }
ssh $srv "rm -f $remoto" | Out-Null

Write-Host '== Verificando'
$lista = tar -tzf $archivo
if ($LASTEXITCODE -ne 0 -or -not ($lista -match 'externo.db')) { Remove-Item $archivo; throw 'La copia descargada esta danada; se borro.' }
$kb = [math]::Round((Get-Item $archivo).Length / 1KB)
Write-Host "   OK: $archivo ($kb KB, $(($lista | Where-Object { $_ -like 'img/*.webp' }).Count) fotos)"

# Un respaldo sirve solo si se puede volver a el: se restaura en una carpeta temporal y se
# levanta el servidor con esa copia (no toca nada real). Requiere Node 22+ en este PC.
Write-Host '== Probando que se puede restaurar'
if (Get-Command node -ErrorAction SilentlyContinue) {
  & node --disable-warning=ExperimentalWarning (Join-Path $PSScriptRoot 'probar-respaldo.mjs') $archivo
  if ($LASTEXITCODE -ne 0) { throw 'El respaldo se descargo, pero NO se pudo restaurar en la prueba. Revisar.' }
} else { Write-Host '   (Node no esta instalado en este PC: se omite la prueba)' }

# Conserva los ultimos $Conservar respaldos.
Get-ChildItem $Destino -Filter 'pedidos-*.tgz' | Sort-Object Name -Descending | Select-Object -Skip $Conservar | Remove-Item
Write-Host "== Listo. Respaldos guardados: $((Get-ChildItem $Destino -Filter 'pedidos-*.tgz').Count) (se conservan $Conservar)"
