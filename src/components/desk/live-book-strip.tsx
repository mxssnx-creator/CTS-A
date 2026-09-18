import { useLiveSnapshot } from "@/lib/desk/live-ctx";
import { fmtEquity, fmtUsd } from "@/lib/utils";
import { fmtPf, fmtWr, Panel, pfTone, StatLine } from "./widgets";

export function LiveBookStrip({ title }: { title?: string }) {
  const live = useLiveSnapshot();
  return (
    <Panel title={title ?? `${live.venueLabel} live`}>
      <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-4">
        <StatLine k="Equity" v={live.equity ? fmtEquity(live.equity) : "—"} tone={live.pingOk ? "up" : "neutral"} />
        <StatLine k="Live PF" v={fmtPf(live.pf)} tone={pfTone(live.pf)} />
        <StatLine k="Win rate" v={fmtWr(live.wr)} />
        <StatLine k="Net" v={fmtUsd(live.net)} tone={live.net >= 0 ? "up" : "down"} />
        <StatLine k="Positions" v={String(live.livePos)} />
        <StatLine k="Orders" v={String(live.liveOrd)} />
        <StatLine k="Closed" v={String(live.trades)} />
        <StatLine
          k="Ping"
          v={live.pingOk ? (live.latencyMs ? `${live.latencyMs} ms` : "ok") : "connecting"}
          tone={live.pingOk ? "up" : "neutral"}
        />
      </div>
      <p className="mt-3 text-xs text-muted">
        {live.tactic} · {live.range} · {live.elapsedMin ? `${live.elapsedMin.toFixed(1)} min` : "host"} · {live.lastMsg}
      </p>
    </Panel>
  );
}
