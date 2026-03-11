#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
LABEL="${1:-manual}"
SAFE_LABEL="$(printf '%s' "$LABEL" | tr '[:space:]/' '--' | tr -cd '[:alnum:]_-')"
DEST_DIR="$ROOT_DIR/backups/snapshots/${STAMP}-${SAFE_LABEL}"

mkdir -p "$DEST_DIR"

cp "$ROOT_DIR/index.html" "$DEST_DIR/index.html"
cp "$ROOT_DIR/CNAME" "$DEST_DIR/CNAME"
cp "$ROOT_DIR/ISOTIPO.png" "$DEST_DIR/ISOTIPO.png"
cp -R "$ROOT_DIR/environments/staging" "$DEST_DIR/staging"
cp -R "$ROOT_DIR/environments/production" "$DEST_DIR/production"

printf 'Backup creado en %s\n' "$DEST_DIR"
