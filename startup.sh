#!/bin/sh
set -eu
cd /workspace
if [ -r /tmp/cts-ssh/id_kex ] && [ ! -r /root/.ssh/id_cts_a ]; then
  install -m 600 /tmp/cts-ssh/id_kex /root/.ssh/id_cts_a
fi
# :8081 is QA-only — a revive must never inherit a stale built-output preview.
node scripts/preview.mjs stop || true
if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
  exit 0
fi
npm run dev >>/tmp/app-startup.log 2>&1 &
