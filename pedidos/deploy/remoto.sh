#!/usr/bin/env bash
# Corre EN lenovo-edge (lo invoca desplegar.ps1). Construye y levanta el
# contenedor `pedidos` sin tocar ningún otro stack del servidor.
set -euo pipefail
SRC=/tmp/pedidos-deploy
DEST=/srv/docker/compose/pedidos
PORT=8100
paso() { printf '\n== %s\n' "$*"; }

paso "1/7 Puerto $PORT libre o ya usado por pedidos"
if ss -ltn "sport = :$PORT" | grep -q LISTEN && ! docker ps --format '{{.Names}}' | grep -qx pedidos; then
  echo "ERROR: el puerto $PORT lo usa otro servicio. No se toca nada."; exit 1
fi

paso "2/7 Pruebas automáticas en este servidor (contenedor desechable, no toca producción)"
OUT=$(mktemp)
if ! docker run --rm -v "$SRC":/app:ro -w /app -e TMPDIR=/tmp node:22-alpine \
  sh -c 'node --version && cp -r /app /tmp/src && cd /tmp/src && node --test --test-reporter=spec test/*.test.mjs' > "$OUT" 2>&1; then
  echo "FALLARON PRUEBAS. No se cambio nada en el servidor. Detalle:"
  head -n 1 "$OUT" | sed 's/^/node /'
  grep -E '^(✔|✖)' "$OUT" | grep '✖' || true
  sed -n '/failing tests/,$p' "$OUT" | head -n 60
  echo "(salida completa en $OUT)"
  exit 1
fi
grep -E '^ℹ (tests|pass|fail)' "$OUT"

paso "3/7 Respaldo de la versión anterior (si existe)"
if [ -d "$DEST" ]; then
  B="/srv/docker/compose/pedidos.prev-$(date +%Y%m%d-%H%M%S)"
  cp -a "$DEST" "$B"; echo "Copia en $B (el volumen de datos no se toca)"
fi

paso "4/7 Copiar archivos (conserva .env)"
mkdir -p "$DEST"
find "$DEST" -mindepth 1 -maxdepth 1 ! -name .env -exec rm -rf {} +
cp -a "$SRC"/. "$DEST"/
rm -rf "$DEST/data"

paso "5/7 .env"
if [ ! -f "$DEST/.env" ]; then
  CLAVE=$(openssl rand -base64 12 | tr -d '/+=' | cut -c1-14)
  printf 'PANEL_PASSWORD=%s\nSESSION_SECRET=%s\n' "$CLAVE" "$(openssl rand -hex 32)" > "$DEST/.env"
  chmod 600 "$DEST/.env"
  echo ">>> Clave del panel (anótala, no se vuelve a mostrar): $CLAVE"
else
  echo ".env existente conservado"
fi

paso "6/7 Construir y levantar"
cd "$DEST"
docker compose up -d --build

paso "7/7 Verificaciones"
for i in $(seq 1 20); do curl -fsS "http://127.0.0.1:$PORT/salud" >/dev/null 2>&1 && break; sleep 1; done
echo "salud: $(curl -sS http://127.0.0.1:$PORT/salud)"
echo "carta: HTTP $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$PORT/gassuso)"
echo "fotos en el volumen: $(docker exec pedidos sh -c 'ls /data/img | wc -l')"
echo "hora del contenedor: $(docker exec pedidos date '+%H:%M %Z')  (debe ser hora de Chile)"
echo "escritura en /data: $(docker exec pedidos sh -c 'touch /data/.w && rm /data/.w && echo ok')"
echo "respaldo inicial: $(docker exec pedidos sh -c 'ls /data/backups')"
docker stats --no-stream --format 'memoria: {{.MemUsage}}  cpu: {{.CPUPerc}}' pedidos
echo "escucha solo en 127.0.0.1: $(ss -ltn "sport = :$PORT" | awk 'NR>1{print $4}')"
echo "errores en logs: $(docker logs --since 2m pedidos 2>&1 | grep -ci error || true)"
echo; echo "Listo. Falta la regla del túnel si es la primera vez: sudo bash $DEST/deploy/tunel.sh"
