#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$ROOT_DIR/scripts/create_backup.sh" "before-restore-original"

cp "$ROOT_DIR/backups/original-main/index.html" "$ROOT_DIR/environments/staging/index.html"
cp "$ROOT_DIR/backups/original-main/ISOTIPO.png" "$ROOT_DIR/environments/staging/ISOTIPO.png"

printf 'Staging restaurado desde backups/original-main\n'
