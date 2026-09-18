#!/usr/bin/env bash
# systemd ExecStart for CTS-A desk (Vite on 0.0.0.0:3202).
set -euo pipefail
ROOT="${CTS_A_ROOT:-/opt/cts-a}"
LOG_DIR="${LOG_DIR:-/var/log/cts-a}"
cd "$ROOT"

export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-3202}"
export PATH="${ROOT}/node_modules/.bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=640 --expose-gc}"

mkdir -p "$LOG_DIR" /var/lib/cts-a

VITE="${ROOT}/node_modules/.bin/vite"
if [[ ! -e "$VITE" ]]; then
  echo "vite missing in $ROOT — run npm ci" >&2
  exit 127
fi
exec node scripts/with-app-env.mjs "$VITE" dev --host "$HOST" --port "$PORT" --strictPort
