#!/usr/bin/env bash
# Reinstall CTS-A on this host and start BingX x01 mainnet only.
set -euo pipefail
ROOT="${CTS_A_ROOT:-/opt/cts-a}"
KEY_ENV=/etc/cts-a/credentials.env
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

echo "== backup $STAMP =="
if [[ -x "$ROOT/deploy/cts-a/backup-cts-a.sh" ]]; then
  bash "$ROOT/deploy/cts-a/backup-cts-a.sh" || true
fi

echo "== stop units =="
systemctl stop cts-a-vst-x02.service cts-a-vst.service cts-a-desk.service || true
systemctl disable cts-a-vst-x02.service || true

echo "== checkout =="
mkdir -p /var/lib/cts-a /var/log/cts-a /etc/cts-a
cd "$ROOT"
git fetch origin
git reset --hard origin/main
git submodule update --init --recursive || true

echo "== npm =="
if [[ -f package-lock.json ]]; then
  npm ci --no-audit --no-fund
else
  npm install --no-audit --no-fund
fi

echo "== units + env =="
install -m 644 "$ROOT/deploy/cts-a/cts-a-desk.service" /etc/systemd/system/cts-a-desk.service
install -m 644 "$ROOT/deploy/cts-a/cts-a-vst.service" /etc/systemd/system/cts-a-vst.service
install -m 644 "$ROOT/deploy/cts-a/cts-a-vst-x02.service" /etc/systemd/system/cts-a-vst-x02.service
install -m 644 "$ROOT/deploy/cts-a/cts-a-x01.env" /etc/cts-a/cts-a-x01.env
install -m 644 "$ROOT/deploy/cts-a/cts-a-backup.service" /etc/systemd/system/cts-a-backup.service
install -m 644 "$ROOT/deploy/cts-a/cts-a-backup.timer" /etc/systemd/system/cts-a-backup.timer
python3 - << 'PY'
from pathlib import Path
p = Path("/etc/cts-a/cts-a.env")
cur = p.read_text() if p.exists() else ""
want = {
  "HOST": "0.0.0.0",
  "PORT": "3202",
  "CTS_A_NAME": "cts-a",
  "CTS_A_ROOT": "/opt/cts-a",
  "CTS_A_CONN": "bingx-x01",
  "CTS_A_NETWORK": "mainnet",
  "CTS_A_STATUS": "/var/lib/cts-a/vst-session.json",
  "CTS_A_SETTINGS": "/var/lib/cts-a/desk-settings.json",
  "CTS_A_OVERALL": "/var/lib/cts-a/overall-stats.json",
  "CTS_A_DISABLED": "/var/lib/cts-a/live-disabled.json",
  "CTS_A_PROTECT": "/var/lib/cts-a/protect-grid.json",
  "CTS_A_SYMBOLS": "35",
  "CTS_A_EVAL_SYMBOLS": "300",
  "CTS_A_LIVE_MAX_POS": "100",
  "CTS_A_TICK_MS": "1000",
}
lines = []
seen = set()
for line in cur.splitlines():
    if not line.strip() or line.strip().startswith("#") or "=" not in line:
        lines.append(line)
        continue
    k = line.split("=", 1)[0].strip()
    if k in want:
        lines.append(f"{k}={want[k]}")
        seen.add(k)
    else:
        lines.append(line)
for k, v in want.items():
    if k not in seen:
        lines.append(f"{k}={v}")
p.write_text("\n".join(lines).rstrip() + "\n")
print("env", p)
PY
if [[ ! -s "$KEY_ENV" ]]; then
  echo "missing $KEY_ENV" >&2
  exit 2
fi
chmod 600 "$KEY_ENV" /etc/cts-a/cts-a.env /etc/cts-a/cts-a-x01.env
systemctl daemon-reload
systemctl enable cts-a-desk.service cts-a-vst.service cts-a-backup.timer
systemctl restart cts-a-backup.timer || true
systemctl start cts-a-desk.service
sleep 2
systemctl start cts-a-vst.service
echo "== started =="
systemctl is-active cts-a-desk cts-a-vst
echo "reinstall $STAMP $(git -C "$ROOT" rev-parse --short HEAD) x01 35 symbols"
