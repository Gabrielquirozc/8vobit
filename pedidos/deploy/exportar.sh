#!/usr/bin/env bash
# Deja en $1 (por defecto /tmp/pedidos-respaldo.tgz) una copia consistente de la base
# (VACUUM INTO, sin detener el servicio) y de las fotos, para llevarla fuera del servidor.
# La usa deploy/respaldo.ps1 desde Windows:  sudo -n bash .../deploy/exportar.sh
set -euo pipefail
OUT="${1:-/tmp/pedidos-respaldo.tgz}"
docker exec pedidos rm -f /data/backups/externo.db
docker exec pedidos node --disable-warning=ExperimentalWarning -e \
  "const{DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('/data/pedidos.db');d.exec(\"VACUUM INTO '/data/backups/externo.db'\");d.close()"
docker exec pedidos tar -cz -C /data backups/externo.db img > "$OUT"
docker exec pedidos rm -f /data/backups/externo.db
chmod 644 "$OUT"
echo "$(du -h "$OUT" | cut -f1) $OUT"
