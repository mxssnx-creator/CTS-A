#!/usr/bin/env bash
# Fresh CTS-A install on this host, BingX x02 VST only.
set -euo pipefail
ROOT="${CTS_A_ROOT:-/opt/cts-a}"
KEY_ENV=/etc/cts-a/credentials.env
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

echo "== backup $STAMP =="
if [[ -x "$ROOT/deploy/cts-a/backup-cts-a.sh" ]]; then
  bash "$ROOT/deploy/cts-a/backup-cts-a.sh" || true
fi

echo "== stop units =="
systemctl stop cts-a-vst.service cts-a-vst-x02.service cts-a-desk.service || true
systemctl disable cts-a-vst.service || true

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
install -m 644 "$ROOT/deploy/cts-a/cts-a-vst-x02.service" /etc/systemd/system/cts-a-vst-x02.service
install -m 644 "$ROOT/deploy/cts-a/cts-a-vst.service" /etc/systemd/system/cts-a-vst.service
install -m 644 "$ROOT/deploy/cts-a/cts-a-backup.service" /etc/systemd/system/cts-a-backup.service
install -m 644 "$ROOT/deploy/cts-a/cts-a-backup.timer" /etc/systemd/system/cts-a-backup.timer
if [[ ! -f /etc/cts-a/cts-a.env ]]; then
  install -m 600 "$ROOT/deploy/cts-a/cts-a.env.example" /etc/cts-a/cts-a.env
fi
python3 - << 'PY'
from pathlib import Path
p = Path("/etc/cts-a/cts-a.env")
cur = p.read_text() if p.exists() else ""
want = {
  "HOST": "0.0.0.0",
  "PORT": "3202",
  "CTS_A_NAME": "cts-a",
  "CTS_A_ROOT": "/opt/cts-a",
  "CTS_A_CONN": "bingx-vst-02",
  "CTS_A_NETWORK": "testnet",
  "CTS_A_STATUS": "/var/lib/cts-a/vst-session-x02.json",
  "CTS_A_SETTINGS": "/var/lib/cts-a/desk-settings-x02.json",
  "CTS_A_OVERALL": "/var/lib/cts-a/overall-stats-x02.json",
  "CTS_A_DISABLED": "/var/lib/cts-a/live-disabled-x02.json",
  "CTS_A_PROTECT": "/var/lib/cts-a/protect-grid-x02.json",
  "CTS_A_SYMBOLS": "50",
  "CTS_A_EVAL_SYMBOLS": "300",
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
chmod 600 "$KEY_ENV" /etc/cts-a/cts-a.env
# rotate empty/stale x01-shaped live files so the desk cannot prefer them
if [[ -f /var/lib/cts-a/vst-session.json ]]; then
  mv -f /var/lib/cts-a/vst-session.json "/var/lib/cts-a/vst-session.json.bak.$STAMP" || true
fi
systemctl daemon-reload
systemctl enable cts-a-desk.service cts-a-vst-x02.service cts-a-backup.timer
systemctl restart cts-a-backup.timer || true
systemctl start cts-a-desk.service
sleep 2
systemctl start cts-a-vst-x02.service
echo "== started =="
systemctl is-active cts-a-desk cts-a-vst-x02
echo "reinstall $STAMP $(git -C "$ROOT" rev-parse --short HEAD) x02"
