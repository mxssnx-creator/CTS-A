import { useLiveSnapshot, usePreserveScroll } from "@/lib/desk/live-ctx";
import { clsPnl, fmtPx, fmtUsd } from "@/lib/utils";
import { Panel, Pill, StatLine } from "../widgets";
import { LiveBookStrip } from "../live-book-strip";

export function OrdersView() {
  usePreserveScroll();
  const live = useLiveSnapshot();
  const orders = live.exchange?.orders ?? [];
  const pos = live.exchange?.positions ?? [];
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-subtle">Exchange</p>
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Open BingX {live.network} orders for {live.venueLabel}. Counts are the live book, not paper.
        </p>
      </div>
      <LiveBookStrip />
      <Panel title={`Open orders · ${orders.length}`}>
        <div className="mb-3 grid grid-cols-2 gap-x-6 sm:grid-cols-4">
          <StatLine k="Orders" v={String(live.liveOrd)} />
          <StatLine k="SL" v={String(live.liveSl)} />
          <StatLine k="TP" v={String(live.liveTp)} />
          <StatLine k="Positions" v={String(live.livePos)} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-subtle">
              <tr>
                <th className="py-2 pr-3 font-medium">Symbol</th>
                <th className="py-2 pr-3 font-medium">Side</th>
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 pr-3 font-medium">Qty</th>
                <th className="py-2 pr-3 font-medium">Stop</th>
                <th className="py-2 pr-3 font-medium">Status</th>
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
                    <td className="py-2 pr-3">{o.stopPrice ? fmtPx(o.stopPrice) : o.price ? fmtPx(o.price) : "—"}</td>
                    <td className="py-2 pr-3">{o.status || "NEW"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="py-6 text-muted" colSpan={6}>
                    No open orders on {live.venueLabel}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title={`Positions covering orders · ${pos.length}`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-subtle">
              <tr>
                <th className="py-2 pr-3 font-medium">Symbol</th>
                <th className="py-2 pr-3 font-medium">Side</th>
                <th className="py-2 pr-3 font-medium">Qty</th>
                <th className="py-2 pr-3 font-medium">Entry</th>
                <th className="py-2 pr-3 font-medium">Mark</th>
                <th className="py-2 pr-3 font-medium">PnL</th>
              </tr>
            </thead>
            <tbody>
              {pos.map((p) => (
                <tr key={`${p.symbol}-${p.side}`} className="border-t border-border">
                  <td className="py-2 pr-3 font-medium">{p.symbol}</td>
                  <td className="py-2 pr-3">{p.side}</td>
                  <td className="py-2 pr-3">{p.qty}</td>
                  <td className="py-2 pr-3">{fmtPx(p.entry)}</td>
                  <td className="py-2 pr-3">{fmtPx(p.mark)}</td>
                  <td className={clsPnl(p.pnl)}>{fmtUsd(p.pnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
