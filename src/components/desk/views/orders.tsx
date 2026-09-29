import { useLiveSnapshot, usePreserveScroll, LIVE_MAX_POSITIONS } from "@/lib/desk/live-ctx";
import { fmtPx } from "@/lib/utils";
import { Panel, Pill, StatLine } from "../widgets";
import { LiveBookStrip } from "../live-book-strip";

export function OrdersView() {
  usePreserveScroll();
  const live = useLiveSnapshot();
  const orders = [...(live.exchange?.orders ?? [])].sort((a, b) => {
    const rank = (t: string) => (t.includes("STOP") ? 0 : t.includes("TAKE_PROFIT") ? 1 : 2);
    return rank(a.type) - rank(b.type) || a.symbol.localeCompare(b.symbol);
  });
  const partials = orders.filter((o) => String(o.status || "").toLowerCase() === "partial").length;
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-subtle">Exchange</p>
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Positions/Orders {live.livePos}/{live.liveOrd}. Every partial counts. Positions max {LIVE_MAX_POSITIONS}, orders unlimited.
          {` ${live.liveLong}L ${live.liveShort}S · partials ${Math.max(partials, live.livePartials)} · SL ${live.liveSl} · TP ${live.liveTp} · gap ${live.controlGap}.`}
        </p>
      </div>
      <LiveBookStrip />
      <Panel title={`Orders · ${orders.length}`}>
        <div className="mb-3 grid grid-cols-2 gap-x-6 sm:grid-cols-4">
          <StatLine k="Positions/Orders" v={`${live.livePos}/${live.liveOrd}`} />
          <StatLine k="Partials" v={String(Math.max(partials, live.livePartials))} />
          <StatLine k="SL / TP" v={`${live.liveSl} / ${live.liveTp}`} />
          <StatLine k="Max" v={`${LIVE_MAX_POSITIONS} / ∞`} />
          <StatLine
            k="By id"
            v={`${Number((live.session as { orderTrack?: { tracked?: number; filled?: number; updated?: number } } | null)?.orderTrack?.tracked ?? 0)}`}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-subtle">
              <tr>
                <th className="py-2 pr-3 font-medium">Symbol</th>
                <th className="py-2 pr-3 font-medium">Side</th>
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 pr-3 font-medium">Qty</th>
                <th className="py-2 pr-3 font-medium">Left</th>
                <th className="py-2 pr-3 font-medium">Stop</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Id</th>
              </tr>
            </thead>
            <tbody>
              {orders.length ? (
                orders.map((o) => (
                  <tr key={`${o.id}-${o.symbol}-${o.type}`} className="border-t border-border">
                    <td className="py-2 pr-3 font-medium">{o.symbol}</td>
                    <td className="py-2 pr-3">
                      <Pill tone={o.side === "long" ? "up" : "down"}>{o.side}</Pill>
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{o.type}</td>
                    <td className="py-2 pr-3">{o.qty}</td>
                    <td className="py-2 pr-3">
                      {o.remaining != null ? o.remaining : "—"}
                    </td>
                    <td className="py-2 pr-3">{o.stopPrice ? fmtPx(o.stopPrice) : o.price ? fmtPx(o.price) : "—"}</td>
                    <td className="py-2 pr-3">{o.status || "NEW"}</td>
                    <td className="py-2 pr-3 font-mono text-[10px]">{o.id}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="py-6 text-muted" colSpan={8}>
                    No open orders on {live.venueLabel}.
                    {live.liveSl + live.liveTp > 0 ? ` Host still reports SL ${live.liveSl} · TP ${live.liveTp}.` : ""}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
