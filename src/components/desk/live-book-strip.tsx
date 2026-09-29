import { deskLivePf, LIVE_MAX_POSITIONS, useLiveSnapshot } from "@/lib/desk/live-ctx";
import { countPositionSlots, countWorkingOrders } from "@/lib/desk/feed";
import { useDesk } from "@/lib/desk/store";
import { fmtEquity, fmtUsd } from "@/lib/utils";
import { fmtWr, Panel, pfTone, StatLine } from "./widgets";

export function LiveBookStrip({ title }: { title?: string }) {
  const live = useLiveSnapshot();
  const activeConnId = useDesk((s) => s.activeConnId);
  const openRows = useDesk((s) => s.vst.positions.filter((p) => p.connId === s.activeConnId && p.qty > 0));
  const workRows = useDesk((s) => s.vst.orders.filter((o) => o.connId === s.activeConnId && (o.status === "open" || o.status === "partial" || o.status === "queued")));
  const openN = countPositionSlots(openRows).slots;
  const workN = countWorkingOrders(workRows).n;
  const x01 = activeConnId === "bingx-x01";
  const pf = useDesk((s) => s.vst.stats.pf);
  const trades = useDesk((s) => s.vst.stats.trades);
  const wr = useDesk((s) => s.vst.stats.wr);
  const gp = useDesk((s) => s.vst.ledger.ratioProfit ?? 0);
  const gl = useDesk((s) => s.vst.ledger.ratioLoss ?? 0);
  const wins = useDesk((s) => s.vst.ledger.ratioWins ?? 0);
  const real = wins > 0 || gl > 1e-12;
  const host = live.hasLive && live.conn === "bingx-x01";
  const shownPf = host ? deskLivePf(live) : real ? pf : live.pf;
  const shownWr = host ? live.wr : real ? wr : live.wr;
  const shownTrades = host ? live.trades : real ? trades : live.trades;
  const compute = host
    ? live.trades >= 4
      ? `${live.trades} live closes`
      : "progression PF · host has no scored closes yet"
    : !real
    ? "waiting for closes"
    : gl > 1e-12
      ? `${gp.toFixed(4)} / ${gl.toFixed(4)} · ${wins} positive ratios`
      : `1 + ${gp.toFixed(4)} / (${wins} × 0.0012)`;
  const exBook = useDesk((s) => (s.exchange?.ok && s.exchange.connId === s.activeConnId ? s.exchange : null));
  const posN = host ? live.livePos : exBook ? countPositionSlots(exBook.positions).slots : openN;
  const ordN = host ? live.liveOrd : exBook ? countWorkingOrders(exBook.orders).n : workN;
  const longN = host ? live.liveLong : exBook ? countPositionSlots(exBook.positions).long : countPositionSlots(openRows).long;
  const shortN = host ? live.liveShort : exBook ? countPositionSlots(exBook.positions).short : countPositionSlots(openRows).short;
  const partialN = host ? live.livePartials : countWorkingOrders(exBook ? exBook.orders : workRows).partial;
  return (
    <Panel title={title ?? (x01 ? "Live mainnet x01" : `${live.venueLabel} live`)}>
      <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-4">
        <StatLine k="Equity" v={exBook?.equity ? fmtEquity(exBook.equity) : host && live.equity ? fmtEquity(live.equity) : "—"} tone={exBook || host ? "up" : "neutral"} />
        <StatLine k="Live PF" v={Number.isFinite(shownPf) ? shownPf.toFixed(4) : "—"} tone={pfTone(shownPf)} />
        <StatLine k="Win rate" v={fmtWr(shownWr)} />
        <StatLine k="System Net" v={fmtUsd(live.systemNet)} tone={live.systemNet >= 0 ? "up" : "down"} />
        <StatLine k="Closed / open" v={`${fmtUsd(live.closedNet)} / ${fmtUsd(live.openNet)}`} />
        <StatLine k="Positions/Orders" v={`${posN}/${ordN}`} />
        <StatLine k="Long / Short" v={`${longN}L ${shortN}S`} />
        <StatLine k="Partials" v={String(partialN)} />
        <StatLine k="Max" v={`${LIVE_MAX_POSITIONS} / ∞`} />
        <StatLine k="Foreign held" v={`${live.foreignPos}p / ${live.foreignOrd}o`} />
        <StatLine k="Control gap" v={String(live.controlGap)} tone={live.controlGap > 0 ? "down" : "up"} />
        <StatLine k="Leverage" v={live.liveLevMax ? `${Math.round(live.liveLevMin)}–${Math.round(live.liveLevMax)}x` : "max / contract"} />
        <StatLine k="Closed" v={String(shownTrades)} />
        <StatLine
          k="Ping"
          v={live.pingOk ? (live.latencyMs ? `${live.latencyMs} ms` : "ok") : "connecting"}
          tone={live.pingOk ? "up" : "neutral"}
        />
      </div>
      <p className="mt-3 text-xs text-muted">
        {x01 ? "live mainnet x01" : activeConnId} · {host ? live.livePos + live.foreignPos : posN} exchange open · {shownTrades} closes · {compute}
      </p>
    </Panel>
  );
}