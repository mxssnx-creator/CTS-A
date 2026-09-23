import { useLiveSnapshot } from "@/lib/desk/live-ctx";
import { useDesk } from "@/lib/desk/store";
import { fmtEquity, fmtUsd } from "@/lib/utils";
import { fmtWr, Panel, pfTone, StatLine } from "./widgets";

export function LiveBookStrip({ title }: { title?: string }) {
  const live = useLiveSnapshot();
  const activeConnId = useDesk((s) => s.activeConnId);
  const openN = useDesk((s) => s.vst.positions.filter((p) => p.connId === s.activeConnId && p.qty > 0).length);
  const workN = useDesk((s) => s.vst.orders.filter((o) => o.connId === s.activeConnId && (o.status === "open" || o.status === "partial" || o.status === "queued")).length);
  const x01 = activeConnId === "bingx-x01";
  const pf = useDesk((s) => s.vst.stats.pf);
  const trades = useDesk((s) => s.vst.stats.trades);
  const wr = useDesk((s) => s.vst.stats.wr);
  const gp = useDesk((s) => s.vst.ledger.ratioProfit ?? 0);
  const gl = useDesk((s) => s.vst.ledger.ratioLoss ?? 0);
  const wins = useDesk((s) => s.vst.ledger.ratioWins ?? 0);
  const real = wins > 0 || gl > 1e-12;
  const shownPf = real ? pf : live.pf;
  const compute = !real
    ? "waiting for closes"
    : gl > 1e-12
      ? `${gp.toFixed(4)} / ${gl.toFixed(4)} · ${wins} positive ratios`
      : `1 + ${gp.toFixed(4)} / (${wins} × 0.0012)`;
  const exBook = useDesk((s) => (s.exchange?.ok && s.exchange.connId === s.activeConnId ? s.exchange : null));
  const posN = exBook ? exBook.positions.length : openN;
  const ordN = exBook ? exBook.orders.length : workN;
  return (
    <Panel title={title ?? (x01 ? "Live mainnet x01" : `${live.venueLabel} live`)}>
      <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-4">
        <StatLine k="Equity" v={exBook?.equity ? fmtEquity(exBook.equity) : "—"} tone={exBook ? "up" : "neutral"} />
        <StatLine k="Live PF" v={Number.isFinite(shownPf) ? shownPf.toFixed(4) : "—"} tone={pfTone(shownPf)} />
        <StatLine k="Win rate" v={fmtWr(real ? wr : live.wr)} />
        <StatLine k="System Net" v={fmtUsd(live.systemNet)} tone={live.systemNet >= 0 ? "up" : "down"} />
        <StatLine k="Closed / open" v={`${fmtUsd(live.closedNet)} / ${fmtUsd(live.openNet)}`} />
        <StatLine k="Positions" v={String(posN)} />
        <StatLine k="Orders" v={String(ordN)} />
        <StatLine k="Foreign held" v={`${live.foreignPos}p / ${live.foreignOrd}o`} />
        <StatLine k="Leverage" v={live.liveLevMax ? `${Math.round(live.liveLevMin)}–${Math.round(live.liveLevMax)}x` : "max / contract"} />
        <StatLine k="Closed" v={String(real ? trades : live.trades)} />
        <StatLine
          k="Ping"
          v={live.pingOk ? (live.latencyMs ? `${live.latencyMs} ms` : "ok") : "connecting"}
          tone={live.pingOk ? "up" : "neutral"}
        />
      </div>
      <p className="mt-3 text-xs text-muted">
        {x01 ? "live mainnet x01" : activeConnId} · {posN} exchange open · {trades} closes · {compute}
      </p>
    </Panel>
  );
}