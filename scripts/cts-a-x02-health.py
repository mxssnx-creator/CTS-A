#!/usr/bin/env python3
"""Print BingX x02 VST live health: SL width, PF, book, gaps."""
import json
from pathlib import Path

p = Path("/var/lib/cts-a/vst-session-x02.json")
d = json.loads(p.read_text())
pos = d.get("bookPos") or []
ords = d.get("bookOrd") or []
by = {}
for o in ords:
    by.setdefault("%s:%s" % (o.get("symbol"), o.get("side")), []).append(o)
wide = []
for row in pos:
    k = "%s:%s" % (row.get("symbol"), row.get("side"))
    sl = 0.0
    for o in by.get(k, []):
        t = str(o.get("type") or "").upper()
        if "STOP" in t and "TAKE_PROFIT" not in t:
            sl = float(o.get("stopPrice") or o.get("price") or 0)
    entry = float(row.get("entry") or 0)
    slpct = abs(sl - entry) / entry * 100 if sl and entry else 0
    if slpct > 2.2:
        wide.append((slpct, row.get("symbol"), row.get("side"), float(row.get("pnl") or 0)))
print(
    "x02",
    d.get("conn"),
    "ping",
    bool(d.get("pingOk")),
    "eq",
    round(float(d.get("equity") or 0), 2),
    "pos",
    d.get("livePos"),
    "occ",
    d.get("occupied"),
    "ord",
    d.get("liveOrd"),
    "sl/tp",
    d.get("liveSl"),
    d.get("liveTp"),
    "gap",
    d.get("controlGap"),
    "pf",
    round(float(d.get("livePf") or d.get("pf") or 0), 3),
    "n",
    d.get("trades"),
    "pnl",
    round(float(d.get("livePnl") or 0), 2),
    "closed",
    round(float(d.get("closedNet") or 0), 2),
    "trail",
    d.get("trailN"),
    "msg",
    d.get("lastMsg"),
)
print("wide SL>", 2.2, sorted(wide, reverse=True)[:8] or "none")
print("issues", d.get("issues") or [], "lastApi", d.get("lastApi") or "")
