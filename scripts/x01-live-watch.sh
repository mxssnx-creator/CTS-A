#!/bin/bash
# Minute samples of x01 mainnet for 6 hours. No secrets.
set -u
KEY="${CTS_SSH_KEY:-/root/.ssh/id_cts_a}"
HOST="${CTS_HOST:-152.53.114.112}"
OUT="${1:-/workspace/artifacts/x01-live-6h.log}"
mkdir -p "$(dirname "$OUT")"
end=$((SECONDS + 6 * 3600))
echo "start $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$OUT"
while (( SECONDS < end )); do
  ssh -i "$KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=12 "root@${HOST}" 'python3 - << "PY"
import json, time
try:
    d=json.load(open("/var/lib/cts-a/vst-session.json"))
except Exception as e:
    print("read-fail", type(e).__name__)
    raise SystemExit
pos=d.get("bookPos") or []
tacs={}
rngs={}
for p in pos:
    tacs[p.get("tactic") or "?"]=tacs.get(p.get("tactic") or "?",0)+1
    rngs[p.get("rangeType") or "?"]=rngs.get(p.get("rangeType") or "?",0)+1
note=""
for a in (d.get("adjustments") or [])[::-1]:
    s=str(a)
    if any(w in s.lower() for w in ("skip ","live ","one side","flat ","rearm","error","fail")):
        note=s.replace("\n"," ")[:160]
        break
print(" ".join([
    time.strftime("%H:%M:%S"),
    "phase="+str(d.get("phase")),
    "tick="+str(d.get("tick")),
    "sym="+str(d.get("symbols")),
    "pos="+str(d.get("livePos")),
    "ord="+str(d.get("liveOrd")),
    "eq="+str(round(float(d.get("equity") or 0), 2)),
    "pnl="+str(round(float(d.get("livePnl") or 0), 4)),
    "pf="+str(round(float(d.get("livePf") or 0), 3)),
    "gap="+str(d.get("controlGap")),
    "ping="+str(d.get("pingOk")),
    "tac="+",".join(f"{k}:{v}" for k,v in sorted(tacs.items())),
    "rng="+",".join(f"{k}:{v}" for k,v in sorted(rngs.items())),
    "note="+note,
]))
PY' >> "$OUT" 2>> "$OUT" || echo "$(date -u +%H:%M:%S) ssh-fail" >> "$OUT"
  sleep 300
done
echo "end $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$OUT"
