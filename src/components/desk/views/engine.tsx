import { useMemo, useState } from "react";
import { Pause, Play, RotateCcw, Square } from "lucide-react";
import { LAST_N_PROGRESS_META } from "@/lib/desk/engine";
import { VST_MAX_SYMBOLS, universeSymbols } from "@/lib/desk/vst";
import { useDesk } from "@/lib/desk/store";
import { useLiveSnapshot, usePreserveScroll } from "@/lib/desk/live-ctx";
import { clsPnl, cn, fmtEquity, fmtNum, fmtPct, fmtPx, fmtUsd } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { fmtMdd, fmtPf, fmtWr, Kpi, Panel, pfTone, Pill, StatLine } from "../widgets";
import { SystemPanel } from "../system-panel";
import { LiveBookStrip } from "../live-book-strip";

export function EngineView() {
  usePreserveScroll();
  const running = useDesk((s) => s.vst.running);
  const phase = useDesk((s) => s.vst.phase);
  const tick = useDesk((s) => s.vst.tick);
  const lastMsg = useDesk((s) => s.vst.lastMsg);
  const batches = useDesk((s) => s.vst.batches);
  const sim = useDesk((s) => s.vst.sim);
  const quotesMap = useDesk((s) => s.vst.quotes);
  const startEngine = useDesk((s) => s.startEngine);
  const pauseEngine = useDesk((s) => s.pauseEngine);
  const stopEngine = useDesk((s) => s.stopEngine);
  const resetSession = useDesk((s) => s.resetSession);
  const rearm = useDesk((s) => s.rearmsUniverse);
  const runSim = useDesk((s) => s.runSimHours);
  const [simming, setSimming] = useState(false);
  const connections = useDesk((s) => s.connections);
  const feed = useDesk((s) => s.feed);
  const liveTape = useDesk((s) => s.liveTape);
  const symbolCount = useDesk((s) => s.symbolCount);
  const orderType = useDesk((s) => s.orderType);
  const activeConnId = useDesk((s) => s.activeConnId);
  const liveSnap = useLiveSnapshot();
  const exchange = liveSnap.exchange;
  const tpRatio = useDesk((s) => s.tacticConfig.tpRatio);
  const axisPartial = useDesk((s) => s.tacticConfig.axisPartialRatio ?? 1);
  const engineSize = useDesk((s) => s.vst.engineSizeFactor ?? 1);
  const blockExtra = useDesk((s) => s.vst.relVolumeFactor ?? 0);
  const coordVf = useDesk((s) => s.vst.coordVolumeFactor ?? 1);

  const quotes = useMemo(
    () =>
      universeSymbols(symbolCount)
        .map((s) => quotesMap[s.id])
        .filter((q): q is NonNullable<typeof q> => Boolean(q)),
    [quotesMap, tick, symbolCount],
  );
  const working = (exchange?.orders ?? []).filter((o) => o.status && o.status !== "FILLED" && o.status !== "CANCELLED");
  const pos = exchange?.positions ?? [];

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-subtle">{liveSnap.venueLabel}</p>
          <h1 className="text-2xl font-semibold tracking-tight">Live engine</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            {symbolCount}-symbol universe, 100-position cap, unlimited orders. Rate-limited batches of
            20. Stops stay tight — take-profit / stop-loss ratios 0.25–3.00 (step 0.25) are all processed;
            live uses the selected ratio. Ladders, halt and
            cancel apply only to {activeConnId}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={startEngine}>
            <Play className="size-4" />
            {phase === "paused" ? "Resume" : "Start"}
          </Button>
          <Button size="sm" variant="secondary" disabled={!running} onClick={pauseEngine}>
            <Pause className="size-4" />
            Pause
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={phase === "stopped" || phase === "idle"}
            onClick={stopEngine}
          >
            <Square className="size-4" />
            Stop
          </Button>
          <Button size="sm" variant="ghost" onClick={resetSession}>
            <RotateCcw className="size-4" />
            Reset
          </Button>
          <Button size="sm" variant="secondary" onClick={rearm}>
            Rearm
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={simming}
            onClick={() => {
              setSimming(true);
              window.setTimeout(() => {
                runSim(8);
                setSimming(false);
              }, 30);
            }}
          >
            {simming ? "Sim…" : "8h sim"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Kpi
          label="Equity"
          value={liveSnap.equity ? fmtEquity(liveSnap.equity) : "—"}
          tone={liveSnap.pingOk ? "up" : "neutral"}
          hint={liveSnap.venueLabel}
        />
        <Kpi label="PF" value={fmtPf(liveSnap.pf)} tone={pfTone(liveSnap.pf)} hint={`${liveSnap.trades} closed`} />
        <Kpi label="Win rate" value={fmtWr(liveSnap.wr)} />
        <Kpi label="Exchange pos" value={String(liveSnap.livePos)} hint={`${liveSnap.liveOrd} orders`} />
        <Kpi label="SL / TP" value={`${liveSnap.liveSl} / ${liveSnap.liveTp}`} hint={`${Number(tpRatio).toFixed(2)}R`} />
        <Kpi label="Ping" value={liveSnap.pingOk ? "ok" : "…"} hint={liveSnap.latencyMs ? `${liveSnap.latencyMs} ms` : "host"} />
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Kpi label="Engine size ×" value={fmtNum(engineSize, 2)} hint="avg notional / base" />
        <Kpi label="Axis extra" value={fmtNum(axisPartial, 2)} hint="rung vs base qty" />
        <Kpi label="Block extra" value={fmtNum(blockExtra, 2)} hint="winning relations" />
        <Kpi label="Vol confirm" value={fmtNum(coordVf, 2)} hint="PnL-weighted, not size" />
      </div>

      <LiveBookStrip />

      {(() => {
        const rows = ((liveSnap.overall as { byIndication?: { key: string; n: number; pf: number; wr?: number; openN?: number; net?: number }[] } | null)?.byIndication) ?? [];
        const mix = (liveSnap.session as { indMix?: Record<string, number> } | null)?.indMix;
        const kinds = ["trend", "break", "active", "direction"] as const;
        return (
          <Panel title="Indications · independent">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {kinds.map((k) => {
                const b = rows.find((r) => r.key === k);
                const open = mix?.[k] ?? b?.openN ?? 0;
                return (
                  <div key={k} className="border border-border bg-surface-muted/40 p-3">
                    <div className="text-xs uppercase tracking-widest text-subtle">{k}</div>
                    <div className="mt-1 text-lg font-semibold tabular">{fmtPf(b?.pf ?? 0)}</div>
                    <div className="text-xs text-muted">
                      open {open} · n {b?.n ?? 0}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-muted">
              Trend, Break, Active and Direction each score the live tape independently. Engine cycle {String(liveSnap.session?.tactic ?? liveSnap.tactic)} / {String(liveSnap.session?.range ?? liveSnap.range)}.
            </p>
          </Panel>
        );
      })()}

      {pos.length ? (
        <Panel title={`Open BingX positions · ${pos.length}`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-widest text-subtle">
                  <th className="py-2 pr-3">Symbol</th>
                  <th className="py-2 pr-3">Side</th>
                  <th className="py-2 pr-3">Qty</th>
                  <th className="py-2 pr-3">Entry</th>
                  <th className="py-2 pr-3">Mark</th>
                  <th className="py-2">PnL</th>
                </tr>
              </thead>
              <tbody>
                {pos.map((p) => (
                  <tr key={`${p.symbol}-${p.side}`} className="border-t border-border">
                    <td className="py-1 pr-3 font-medium">{p.symbol.replace("USDT", "")}</td>
                    <td className="py-1 pr-3 capitalize">{p.side}</td>
                    <td className="py-1 pr-3 font-mono tabular">{fmtNum(p.qty, 4)}</td>
                    <td className="py-1 pr-3 font-mono tabular">{fmtPx(p.entry)}</td>
                    <td className="py-1 pr-3 font-mono tabular">{fmtPx(p.mark)}</td>
                    <td className={`py-1 font-mono tabular ${clsPnl(p.pnl)}`}>{fmtUsd(p.pnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      <SystemPanel />

      <Panel title="Live tape">
        <div className="flex flex-wrap gap-2">
          <Pill tone={feed.state === "live" ? "up" : feed.state === "error" ? "down" : "accent"}>
            {liveTape ? feed.state : "paused"}
          </Pill>
          <Pill>{feed.count} BingX symbols</Pill>
          <Pill>{feed.latencyMs} ms</Pill>
          {feed.missing ? <Pill>{feed.missing} synthetic</Pill> : null}
        </div>
        <p className="mt-3 text-sm text-muted">
          {feed.error
            ? feed.error
            : `${liveSnap.venueLabel} last/bid/ask drive marks. Orders and positions are the live exchange book.`}
        </p>
      </Panel>

      {sim ? (
        <Panel
          title={`${sim.hours}h simulation · ${sim.passed ? "passed" : "issues"}`}
          action={<Pill tone={sim.passed ? "up" : "down"}>{sim.passed ? "Invariants ok" : "Check"}</Pill>}
        >
          <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-4">
            <StatLine k="Trades" v={String(sim.trades)} />
            <StatLine k="PF" v={fmtPf(sim.pf)} tone={pfTone(sim.pf)} />
            <StatLine k="Win rate" v={fmtWr(sim.wr)} />
            <StatLine k="Net" v={fmtUsd(sim.net)} tone={sim.net >= 0 ? "up" : "down"} />
            <StatLine k="Max DD" v={fmtMdd(sim.mdd)} />
            <StatLine k="SL / TP exits" v={`${sim.slExits} / ${sim.tpExits}`} />
            <StatLine k="Peak legs" v={`${sim.maxPositionsSeen}/100`} />
            <StatLine k="Rate skips" v={String(sim.rateSkips)} />
            <StatLine
              k="Pos slots"
              v={`${sim.book.positions.slots}/${sim.book.positions.maxSlots} · ${sim.book.positions.long}L/${sim.book.positions.short}S`}
            />
            <StatLine
              k="Orders"
              v={`${sim.book.orders.placed} · ${sim.book.orders.filled}f ${sim.book.orders.cancelled}x ${sim.book.orders.rejected}r`}
            />
          </div>
          {sim.lastN ? (
            <div className="mt-3 grid grid-cols-2 gap-x-6 sm:grid-cols-3">
              {LAST_N_PROGRESS_META.map((st) => {
                const snap = st.id === "eval" ? sim.lastN?.eval : st.id === "valid" ? sim.lastN?.valid ?? sim.lastN?.exec : sim.lastN?.disable;
                return (
                  <StatLine
                    key={st.id}
                    k={`${st.label} N${st.n}`}
                    v={`PF ${fmtPf(snap?.pf ?? 0)} · n ${snap?.n ?? 0}`}
                    tone={pfTone(snap?.pf ?? 0)}
                  />
                );
              })}
            </div>
          ) : null}
          {sim.issues.length ? (
            <ul className="mt-3 list-disc px-4 text-sm text-down">
              {sim.issues.map((msg, i) => (
                <li key={`${i}:${msg}`}>{msg}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">
              {sim.symbols} symbols, 1-minute bars, TP/SL {tpRatio.toFixed(2)}R. SL never wider than TP / {tpRatio.toFixed(2)}. Cap 100
              positions. Ladders: {orderType.replace("_", " ")}.
            </p>
          )}
        </Panel>
      ) : (
        <Panel title="Session ledger">
          <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-4">
            <StatLine k="Closed" v={String(liveSnap.trades)} />
            <StatLine k="SL exits" v={String(liveSnap.liveSl)} />
            <StatLine k="TP exits" v={String(liveSnap.liveTp)} />
            <StatLine k="Net" v={fmtUsd(liveSnap.net)} tone={liveSnap.net >= 0 ? "up" : "down"} />
          </div>
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {connections.map((c) => {
          const rate = c.rateLimitUsed / c.rateLimitMax;
          return (
            <Panel
              key={c.id}
              title={c.label}
              action={
                <Pill tone={c.status === "connected" ? "up" : "down"}>
                  {c.status} · {c.lastPingMs} ms
                </Pill>
              }
            >
              <StatLine k="Symbols" v={`${c.symbols.length}/${c.maxSymbols || VST_MAX_SYMBOLS}`} />
              <StatLine k="Positions" v={`${c.positionCount}/${c.maxPositions}`} />
              <StatLine k="Orders" v={`${c.openOrderCount} · unlimited cap`} />
              <StatLine k="Rate window" v={`${c.rateLimitUsed}/${c.rateLimitMax}`} />
              <div className="mt-3 h-2 w-full bg-surface-muted">
                <div
                  className={cn("h-2", rate > 0.85 ? "bg-down" : "bg-primary")}
                  style={{ width: `${Math.min(100, rate * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted">Batch 20 · 10 ops/s · burst 20</p>
            </Panel>
          );
        })}
      </div>

      <Panel title="Batches">
        {batches.length === 0 ? (
          <p className="text-sm text-muted">Waiting for the first batch window.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {batches.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-mono text-xs">{b.id}</span>
                <span className="text-muted">{b.connId.replace("bingx-", "")}</span>
                <span>
                  {b.accepted} accepted{b.rejected ? ` · ${b.rejected} rejected` : ""}
                </span>
                <span className="font-mono text-xs text-subtle">tick {b.tick}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted">{lastMsg}</p>
      </Panel>

      <Panel title={`Universe · ${quotes.length} symbols`} padded={false}>
        <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10">
          {quotes.map((q) => {
            const live = pos.some((p) => p.symbol === q.id);
            return (
              <div key={q.id} className={cn("border-b border-r border-border px-2 py-2", live && "bg-primary-soft")}>
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono text-[11px] font-medium">{q.base}</span>
                  <span className={cn("font-mono text-[10px] tabular", clsPnl(q.chg))}>
                    {fmtPct(q.chg, 1)}
                  </span>
                </div>
                <div className="font-mono text-xs tabular text-muted">{fmtPx(q.px)}</div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title={`Positions · ${activeConnId} · TP/SL ${tpRatio.toFixed(2)}R`} padded={false}>
        {pos.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">
            {liveSnap.livePos
              ? `${liveSnap.livePos} BingX positions live · waiting for book rows.`
              : `No live BingX inventory on ${liveSnap.venueLabel}.`}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-3xl text-left text-sm">
              <thead className="bg-bg text-xs font-medium uppercase tracking-wide text-subtle">
                <tr>
                  <th className="px-4 py-2">Sym</th>
                  <th className="px-2 py-2">Side</th>
                  <th className="px-2 py-2">Qty</th>
                  <th className="px-2 py-2">Entry</th>
                  <th className="px-2 py-2">Mark</th>
                  <th className="px-2 py-2">uPnL</th>
                </tr>
              </thead>
              <tbody>
                {pos.map((p) => (
                  <tr key={`${p.symbol}:${p.side}`} className="border-t border-border">
                    <td className="px-4 py-2 font-mono text-xs">{p.symbol.replace("USDT", "")}</td>
                    <td className="px-2 py-2 capitalize">{p.side}</td>
                    <td className="px-2 py-2 font-mono tabular">{fmtNum(p.qty, 4)}</td>
                    <td className="px-2 py-2 font-mono tabular">{fmtPx(p.entry)}</td>
                    <td className="px-2 py-2 font-mono tabular">{fmtPx(p.mark)}</td>
                    <td className={cn("px-2 py-2 font-mono tabular", clsPnl(p.pnl))}>{fmtUsd(p.pnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Working orders" padded={false}>
          {working.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">
              {liveSnap.liveOrd ? `${liveSnap.liveOrd} BingX orders live.` : "No resting BingX orders."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-lg text-left text-sm">
                <thead className="bg-bg text-xs font-medium uppercase tracking-wide text-subtle">
                  <tr>
                    <th className="px-4 py-2">Sym</th>
                    <th className="px-2 py-2">Side</th>
                    <th className="px-2 py-2">Type</th>
                    <th className="px-2 py-2">Px</th>
                    <th className="px-2 py-2">Qty</th>
                    <th className="px-2 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {working.slice(0, 24).map((o, i) => (
                    <tr key={`${o.id}:${o.type}:${i}`} className="border-t border-border">
                      <td className="px-4 py-2 font-mono text-xs">{o.symbol.replace("USDT", "")}</td>
                      <td className="px-2 py-2 capitalize">{o.side}</td>
                      <td className="px-2 py-2 font-mono text-xs">{o.type}</td>
                      <td className="px-2 py-2 font-mono tabular">{fmtPx(o.price)}</td>
                      <td className="px-2 py-2 font-mono tabular">{fmtNum(o.qty, 4)}</td>
                      <td className="px-2 py-2">
                        <Pill tone="neutral">{o.status}</Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel title="Session ledger" padded={false}>
          <div className="grid grid-cols-2 gap-x-6 px-4 py-3 sm:grid-cols-3">
            <StatLine k="Closed" v={String(liveSnap.trades)} />
            <StatLine k="SL exits" v={String(liveSnap.liveSl)} />
            <StatLine k="TP exits" v={String(liveSnap.liveTp)} />
            <StatLine k="Net" v={fmtUsd(liveSnap.net)} tone={liveSnap.net >= 0 ? "up" : "down"} />
            <StatLine k="PF" v={fmtPf(liveSnap.pf)} tone={pfTone(liveSnap.pf)} />
            <StatLine k="WR" v={fmtWr(liveSnap.wr)} />
          </div>
        </Panel>
      </div>
    </div>
  );
}
