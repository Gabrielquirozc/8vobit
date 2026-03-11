#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_NAME="${1:-staging}"
PORT="${2:-8000}"
TARGET_DIR="$ROOT_DIR/environments/$ENV_NAME"

if [[ ! -d "$TARGET_DIR" ]]; then
  printf 'Entorno invalido: %s\n' "$ENV_NAME" >&2
  printf 'Usa: staging o production\n' >&2
  exit 1
fi

printf 'Sirviendo %s en http://127.0.0.1:%s\n' "$ENV_NAME" "$PORT"
cd "$TARGET_DIR"
python3 -m http.server "$PORT"
