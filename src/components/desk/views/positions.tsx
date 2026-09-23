import { useState } from "react";
import {
  buildBlocks,
  coordinate,
  posSliceStats,
  RANGE_META,
  TACTIC_META,
  volumeCoord,
} from "@/lib/desk/engine";
import { liveDeskBook, positionsAsTrades } from "@/lib/desk/vst";
import type { Position } from "@/lib/desk/types";
import { useDesk } from "@/lib/desk/store";
import { useLiveSnapshot, usePreserveScroll } from "@/lib/desk/live-ctx";
import { clsPnl, fmtNum, fmtPct, fmtPx, fmtUsd } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { fmtPf, fmtWr, Panel, Pill, Segmented, StatLine } from "../widgets";
import { LiveBookStrip } from "../live-book-strip";

type Tab = "closed" | "open" | "next";

export function PositionsView() {
  usePreserveScroll();
  const symbol = useDesk((s) => s.symbol);
  const strategyId = useDesk((s) => s.strategyId);
  const lastNs = useDesk((s) => s.lastNs);
  const costStep = useDesk((s) => s.costStep);
  const rangeType = useDesk((s) => s.rangeType);
  const tactic = useDesk((s) => s.tactic);
  const setRangeType = useDesk((s) => s.setRangeType);
  const setTactic = useDesk((s) => s.setTactic);
  const connections = useDesk((s) => s.connections);
  const activeConnId = useDesk((s) => s.activeConnId);
  const vst = useDesk((s) => s.vst);
  const liveSnap = useLiveSnapshot();
  useDesk((s) => s.liveMark);
  const exchange = liveSnap.exchange;
  const session = liveSnap.session;
  const place = useDesk((s) => s.placePaperOrder);
  const rearm = useDesk((s) => s.rearmsUniverse);
  const ticketMsg = useDesk((s) => s.ticketMsg);
  const [tab, setTab] = useState<Tab>("open");

  const live = liveDeskBook(vst, activeConnId, lastNs.last);
  const closed = live.last;
  const open = live.ongoing;
  const next = live.ongoing.slice(0, lastNs.next);
  const lastSlicePos = closed.slice(-lastNs.last);
  const ongoingSlice = open.slice(-lastNs.ongoing);
  const nextSlice = next.slice(-lastNs.next);
  const vf = volumeCoord(positionsAsTrades(closed.length ? closed : open)).vf;
  const coordLast = closed;
  const coordOngoing = open;
  const coord = coordinate(coordLast, coordOngoing, nextSlice, vf, symbol);
  const blocks = buildBlocks([...coordLast, ...coordOngoing]);
  const rows = tab === "closed" ? lastSlicePos : tab === "open" ? ongoingSlice : nextSlice;
  const lastEval = posSliceStats(coordLast);
  const openEval = posSliceStats(coordOngoing);
  const vol = volumeCoord(positionsAsTrades(closed.length ? closed : open));
  const venue = connections.find((c) => c.id === activeConnId) ?? connections.find((c) => c.status === "connected") ?? connections[0];
  const livePos = vst.positions.filter((p) => p.connId === activeConnId && p.qty > 0);
  const liveOrders = vst.orders.filter(
    (o) => o.connId === activeConnId && (o.status === "open" || o.status === "partial" || o.status === "queued"),
  );
  const slotKeys = new Set(livePos.map((p) => `${p.symbol}:${p.side}:${p.playbook || ""}`));
  const exchRows = (exchange?.positions ?? []).filter((p) => {
    const cid = (p as { connId?: string }).connId;
    return !cid || cid === activeConnId;
  });
  const exchOrders = (exchange?.orders ?? []).filter((o) => {
    const cid = (o as { connId?: string }).connId;
    return !cid || cid === activeConnId;
  });
  const x01 = activeConnId === "bingx-x01";

  const sendNext = () => {
    if (liveSnap.hasLive) {
      rearm();
      return;
    }
    if (!venue) return;
    if (!next.length) {
      rearm();
      return;
    }
    next.forEach((p) => {
      place({
        connId: venue.id,
        symbol: p.symbol,
        side: p.side,
        type: p.orderType ?? "market",
        cost: Math.max(p.cost || costStep, 8),
        price: p.entry || p.mark,
        note: `Next grid ${p.id}`,
      });
    });
  };

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-subtle">Book</p>
        <h1 className="text-2xl font-semibold tracking-tight">Positions</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          {livePos.length} open on {x01 ? "live mainnet x01" : activeConnId}. Last N{lastNs.last} closed, ongoing N{lastNs.ongoing}. Other connections stay on their own books.
        </p>
      </div>

      <LiveBookStrip title="Exchange book" />

      <Panel title={x01 ? "Live mainnet x01" : `BingX ${activeConnId}`}>
        <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-4">
          <StatLine k="Equity" v={exchange?.connId === activeConnId && exchange.equity ? fmtUsd(exchange.equity) : "—"} />
          <StatLine k="Exchange pos" v={String(exchange?.connId === activeConnId ? exchRows.length : 0)} />
          <StatLine k="Exchange orders" v={String(exchange?.connId === activeConnId ? exchOrders.length : 0)} />
          <StatLine k="Desk open" v={String(livePos.length)} />
        </div>
        {livePos.length === 0 && exchRows.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No open positions on {x01 ? "live mainnet x01" : activeConnId} yet.</p>
        ) : (
          <ul className="mt-3 max-h-[32rem] divide-y divide-border overflow-auto text-sm">
            {exchRows.map((p) => (
              <li key={`ex-${p.symbol}-${p.side}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-mono text-xs">{p.symbol.replace("USDT", "")}</span>
                <span className="capitalize">{p.side}</span>
                <span className="text-muted">exchange</span>
                <span className="text-muted">{p.qty}</span>
                <span className={clsPnl(p.pnl)}>{fmtUsd(p.pnl)}</span>
              </li>
            ))}
            {livePos.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-mono text-xs">{p.symbol.replace("USDT", "")}</span>
                <span className="capitalize">{p.side}</span>
                <span className="text-muted">{String(p.playbook || "").replace("bot:", "")}</span>
                <span className="text-muted">{p.qty.toPrecision(3)}</span>
                <span className={clsPnl(p.unrealized)}>{fmtUsd(p.unrealized)}</span>
              </li>
            ))}
            {exchOrders.map((o, i) => (
              <li key={`${o.id}:${o.type}:${i}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-muted">
                <span className="font-mono text-xs">{o.symbol.replace("USDT", "")}</span>
                <span>{o.type}</span>
                <span className="capitalize">{o.side}</span>
                <span>{o.status}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {exchange?.ok && exchange.positions.length > 0 ? null : liveSnap.livePos > 0 ? (
        <p className="text-sm text-muted">{liveSnap.livePos} BingX positions · {liveSnap.liveOrd} orders on {liveSnap.venueLabel}.</p>
      ) : null}

      <Panel title={`Session book · ${activeConnId}`}>
        <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-4">
          <StatLine k="Slots" v={`${slotKeys.size}`} />
          <StatLine k="Legs" v={`${livePos.length}`} />
          <StatLine k="Working" v={`${liveOrders.length}`} />
          <StatLine k="Partials" v={`${livePos.filter((p) => p.status === "partial").length}`} />
        </div>
        {livePos.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No open positions on {activeConnId} yet. Bots fill this book on the desk clock.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border text-sm">
            {livePos.slice(0, 24).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-mono text-xs">{p.symbol.replace("USDT", "")}</span>
                <span className="capitalize">{p.side}</span>
                <span className="text-muted">{String(p.playbook || "").replace("bot:", "") || p.status}</span>
                <span className="text-muted">{p.qty.toPrecision(3)}</span>
                <span className={clsPnl(p.unrealized)}>{fmtUsd(p.unrealized)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="flex flex-wrap gap-2">
        <Segmented
          value={tactic}
          onChange={setTactic}
          options={Object.entries(TACTIC_META).map(([id, m]) => ({ id: id as typeof tactic, label: m.label }))}
        />
        <Segmented
          value={rangeType}
          onChange={setRangeType}
          options={Object.entries(RANGE_META).map(([id, m]) => ({ id: id as typeof rangeType, label: m.label }))}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Panel title={`Last ${lastNs.last}`}>
          <StatLine k="Count" v={String(lastEval.n)} />
          <StatLine k="PF" v={fmtPf(lastEval.pf)} tone={lastEval.pf >= 1.2 ? "up" : lastEval.pf < 1 ? "down" : "neutral"} />
          <StatLine k="WR" v={fmtWr(lastEval.wr)} />
          <StatLine k="Net" v={fmtUsd(coord.lastNet)} tone={coord.lastNet >= 0 ? "up" : "down"} />
        </Panel>
        <Panel title={`Ongoing · N${lastNs.ongoing}`}>
          <StatLine k="Open" v={String(openEval.n)} />
          <StatLine k="Mark PF" v={fmtPf(openEval.pf)} />
          <StatLine k="WR" v={fmtWr(openEval.wr)} />
          <StatLine k="Unrealized" v={fmtUsd(coord.ongoingNet)} tone={coord.ongoingNet >= 0 ? "up" : "down"} />
        </Panel>
        <Panel
          title={`Next · N${lastNs.next}`}
          action={
            <Button size="sm" onClick={sendNext} disabled={!venue}>
              {next.length ? `Send next ${next.length}` : "Rearm next"}
            </Button>
          }
        >
          <StatLine k="Projected" v={String(next.length)} />
          <StatLine k="Notional bias" v={fmtUsd(coord.nextNet)} />
          <StatLine k="Venue" v={venue?.label ?? "—"} />
          {ticketMsg ? <p className="mt-2 text-xs text-muted">{ticketMsg}</p> : null}
        </Panel>
      </div>

      <Panel title="Coordination">
        <div className="flex flex-wrap gap-2">
          <Pill tone={coord.aligned ? "up" : "neutral"}>{coord.aligned ? "Aligned" : "Mixed"}</Pill>
          <Pill tone={coord.conflict ? "down" : "neutral"}>{coord.conflict ? "Conflict" : "Clean"}</Pill>
          <Pill tone="accent">{coord.recommend}</Pill>
          <Pill>Heat {fmtPct(coord.heat, 0).replace("+", "")}</Pill>
          <Pill tone={coord.hf ? "accent" : "neutral"}>{coord.hf ? "HF" : "calm"} · act {fmtNum(coord.activity, 2)}</Pill>
          <Pill tone={coord.agree ? "up" : "neutral"}>{coord.agree ? "Indications agree" : "Mixed indications"}</Pill>
          <Pill>Trend {fmtNum(coord.indications.trend, 2)}</Pill>
          <Pill>Break {fmtNum(coord.indications.break, 2)}</Pill>
          <Pill>Active {fmtNum(coord.indications.active, 2)}</Pill>
          <Pill>Dir {fmtNum(coord.indications.direction, 2)}</Pill>
          <Pill>T {fmtNum(coord.timing ?? 0, 2)}</Pill>
          <Pill>Rel {fmtNum(coord.activityAgree ?? 0, 2)}</Pill>
          <Pill tone={vol.confirm === "confirm" ? "up" : vol.confirm === "diverge" ? "down" : "neutral"}>
            Vol {vol.confirm} · confirm {fmtNum(vol.vf, 2)}
          </Pill>
        </div>
        <p className="mt-3 text-sm">{coord.reason}</p>
        <p className="mt-1 text-sm text-muted">{vol.reason}</p>
      </Panel>

      <Panel
        title="Blocks"
        action={<span className="text-xs text-muted">{blocks.length} blocks · multiples of cost {costStep}</span>}
      >
        {blocks.length === 0 ? (
          <p className="text-sm text-muted">No blocks on this slice.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {blocks.map((b) => (
              <div key={b.id} className="border border-border bg-bg px-3 py-2">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>{b.id}</span>
                  <span className="capitalize">{b.side}</span>
                </div>
                <div className="mt-1 font-mono text-sm tabular">
                  ×{b.multiple} · {fmtUsd(b.net)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        padded={false}
        title="Ledger"
        action={
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { id: "closed", label: `Last ${lastNs.last}` },
              { id: "open", label: `Ongoing ${lastNs.ongoing}` },
              { id: "next", label: `Next ${lastNs.next}` },
            ]}
          />
        }
      >
        <PosTable rows={rows} />
      </Panel>
    </div>
  );
}

function PosTable({ rows }: { rows: Position[] }) {
  if (!rows.length) {
    return <p className="px-4 py-8 text-sm text-muted">No positions in this slice.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-3xl text-left text-sm">
        <thead className="bg-bg text-xs font-medium uppercase tracking-wide text-subtle">
          <tr>
            <th className="px-4 py-2">Symbol</th>
            <th className="px-2 py-2">Side</th>
            <th className="px-2 py-2">Entry</th>
            <th className="px-2 py-2">Mark</th>
            <th className="px-2 py-2">Cost</th>
            <th className="px-2 py-2">PnL</th>
            <th className="px-2 py-2">Venue</th>
            <th className="px-2 py-2">Order</th>
            <th className="px-2 py-2">Block</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-t border-border">
              <td className="px-4 py-2 font-mono text-xs">{p.symbol.replace("USDT", "")}</td>
              <td className="px-2 py-2 capitalize">{p.side}</td>
              <td className="px-2 py-2 font-mono tabular">{fmtPx(p.entry)}</td>
              <td className="px-2 py-2 font-mono tabular">{fmtPx(p.mark)}</td>
              <td className="px-2 py-2 font-mono tabular">{p.cost}</td>
              <td className={`px-2 py-2 font-mono tabular ${clsPnl(p.pnl)}`}>
                {fmtUsd(p.pnl)} {fmtPct(p.pnlPct, 1)}
              </td>
              <td className="px-2 py-2 uppercase">{p.venue}</td>
              <td className="px-2 py-2">{p.orderType.replace("_", " ")}</td>
              <td className="px-2 py-2">{(p.strategyId || "").replace("bot:", "") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
