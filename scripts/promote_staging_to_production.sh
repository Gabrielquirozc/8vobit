#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$ROOT_DIR/scripts/create_backup.sh" "before-promote"

cp "$ROOT_DIR/environments/staging/index.html" "$ROOT_DIR/environments/production/index.html"
cp "$ROOT_DIR/environments/staging/ISOTIPO.png" "$ROOT_DIR/environments/production/ISOTIPO.png"

cp "$ROOT_DIR/environments/production/index.html" "$ROOT_DIR/index.html"
cp "$ROOT_DIR/environments/production/ISOTIPO.png" "$ROOT_DIR/ISOTIPO.png"

if [[ -f "$ROOT_DIR/environments/production/CNAME" ]]; then
  cp "$ROOT_DIR/environments/production/CNAME" "$ROOT_DIR/CNAME"
fi

printf 'Staging promovido a production y sincronizado a la raiz del repo\n'
