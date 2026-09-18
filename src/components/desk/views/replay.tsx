import { useEffect, useMemo, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import {
  DESK,
  INDICATION_KINDS,
  RANGE_TYPES,
  REPLAY_RANGES,
  STRATEGIES,
  TACTIC_META,
  WARMUP,
  getReplayTape,
  type ReplayRangeId,
} from "@/lib/desk/engine";
import { LIVE_TACTICS } from "@/lib/desk/vst";
import { replayHoursFor } from "@/lib/desk/replay-run";
import type { RangeType, TacticKind } from "@/lib/desk/types";
import { useDesk } from "@/lib/desk/store";
import { useLiveSnapshot, usePreserveScroll } from "@/lib/desk/live-ctx";
import { fmtNum, fmtPx, fmtUsd } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EquityChart, MetricBarChart, OccupancyChart, PriceChart } from "../charts";
import { fmtMdd, fmtPf, fmtWr, Kpi, Panel, Pill, Segmented, StatLine, pfTone } from "../widgets";
import { LiveBookStrip } from "../live-book-strip";

function downsample<T>(rows: T[], max = 360): T[] {
  if (rows.length <= max) return rows;
  const step = rows.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(rows[Math.min(rows.length - 1, Math.round(i * step))]!);
  return out;
}

function barTime(t: number) {
  try {
    return new Date(t).toISOString().replace("T", " ").slice(0, 16);
  } catch {
    return "—";
  }
}

export function ReplayView() {
  usePreserveScroll();
  const symbol = useDesk((s) => s.symbol);
  const setSymbol = useDesk((s) => s.setSymbol);
  const strategyId = useDesk((s) => s.strategyId);
  const setStrategy = useDesk((s) => s.setStrategy);
  const replayIndex = useDesk((s) => s.replayIndex);
  const setReplayIndex = useDesk((s) => s.setReplayIndex);
  const playing = useDesk((s) => s.replayPlaying);
  const setPlaying = useDesk((s) => s.setReplayPlaying);
  const speed = useDesk((s) => s.replaySpeed);
  const setSpeed = useDesk((s) => s.setReplaySpeed);
  const rangeId = useDesk((s) => s.replayRangeId);
  const setRangeId = useDesk((s) => s.setReplayRangeId);
  const tactic = useDesk((s) => s.tactic);
  const setTactic = useDesk((s) => s.setTactic);
  const rangeType = useDesk((s) => s.rangeType);
  const setRangeType = useDesk((s) => s.setRangeType);
  const replaySim = useDesk((s) => s.replaySim);
  const replayComplete = useDesk((s) => s.replayComplete);
  const runReplaySim = useDesk((s) => s.runReplaySim);
  const ticketMsg = useDesk((s) => s.ticketMsg);
  const live = useLiveSnapshot();
  const [busy, setBusy] = useState<"sim" | "all" | null>(null);

  const hours = REPLAY_RANGES.find((r) => r.id === rangeId)?.hours ?? 48;
  const simHours = replayHoursFor(rangeId);
  const tape = useMemo(() => getReplayTape(symbol, hours), [symbol, hours]);
  const max = Math.max(0, tape.bars - 1);
  const idx = Math.min(max, Math.max(WARMUP, replayIndex));
  const bt = tape.backtests[strategyId] ?? tape.backtests.normal;
  const occSel = useMemo(() => {
    const row = tape.strategies.find((s) => s.id === strategyId);
    return row ?? { avgPos: tape.occupancy.avgPos, avgOrd: tape.occupancy.avgOrd };
  }, [tape, strategyId]);

  const chartData = useMemo(
    () =>
      downsample(
        tape.candles.map((c, i) => ({
          i,
          c: c.c,
          signal: bt?.signals[i] ?? 0,
        })),
        420,
      ),
    [tape, bt],
  );
  const eqCurve = useMemo(() => {
    if (replaySim?.report.curve?.length) {
      return downsample(
        replaySim.report.curve.map((p) => ({ i: p.t, eq: p.eq })),
        360,
      );
    }
    const raw = (bt?.equity ?? []).map((eq, i) => ({ i, eq }));
    return downsample(raw.slice(0, Math.max(1, idx - WARMUP + 1)), 360);
  }, [bt, idx, replaySim]);
  const loadCurve = useMemo(() => downsample(tape.load.filter((r) => r.i <= idx), 240), [tape.load, idx]);

  const tradesToNow = (bt?.trades ?? []).filter((t) => t.exitBar <= idx);
  const winsTape = tradesToNow.filter((t) => t.pnl > 0).length;
  const netTape = tradesToNow.reduce((s, t) => s + t.pnl, 0);
  const gp = tradesToNow.filter((t) => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
  const gl = Math.abs(tradesToNow.filter((t) => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
  const pfTape = gl === 0 ? (gp > 0 ? 4 : 0) : gp / gl;
  const wrTape = tradesToNow.length ? winsTape / tradesToNow.length : 0;
  const signalNow = bt?.signals[idx] ?? 0;
  const candle = tape.candles[idx];
  const kindBars = tape.kinds.map((k) => ({ label: k.key, value: k.pf }));
  const stratBars = [...tape.strategies].sort((a, b) => b.pf - a.pf).slice(0, 8).map((s) => ({ label: s.name.replace(/\s.*/, "").slice(0, 10), value: s.pf }));

  const report = replaySim?.report;
  const stats = replaySim?.stats;
  const liveComplete = (live.overall as { complete?: typeof replayComplete } | null)?.complete ?? null;
  const complete = replayComplete ?? liveComplete;
  const simPf = report?.pf ?? complete?.winner?.pf ?? pfTape;
  const simWr = report?.wr ?? complete?.winner?.wr ?? wrTape;
  const simNet = report?.net ?? complete?.winner?.net ?? netTape;
  const simTrades = report?.trades ?? complete?.winner?.trades ?? tradesToNow.length;
  const simMdd = report?.mdd ?? complete?.winner?.mdd ?? 0;

  const cells = complete?.cells ?? [];
  const byHours = complete?.byHours ?? {};
  const hourKeys = Object.keys(byHours).sort((a, b) => Number(a) - Number(b));
  const matrixHours = hourKeys.length ? Number(hourKeys[hourKeys.length - 1]) : simHours;
  const matrix = cells.filter((c) => c.hours === matrixHours);
  const winner = complete?.winner ?? null;

  const hourBars = hourKeys.map((h) => ({
    label: `${h}h`,
    value: Number(byHours[h]?.winner?.pf ?? 0),
  }));
  const tacticBars = (stats?.byTactic ?? []).map((b) => ({ label: b.key, value: b.pf }));
  const rangeBars = (stats?.byRange ?? []).map((b) => ({ label: b.key, value: b.pf }));
  const indicationBars = (stats?.byIndication ?? []).map((b) => ({ label: b.key, value: b.pf }));

  const runSim = (withComplete: boolean) => {
    setBusy(withComplete ? "all" : "sim");
    window.setTimeout(() => {
      runReplaySim(simHours, withComplete);
      setBusy(withComplete ? "all" : null);
      if (!withComplete) setBusy(null);
    }, 30);
  };

  useEffect(() => {
    if (replaySim || busy) return;
    const t = window.setTimeout(() => {
      runReplaySim(Math.min(8, simHours), false);
    }, 60);
    return () => window.clearTimeout(t);
    // first visit only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (busy !== "all") return;
    if (replayComplete && String(ticketMsg ?? "").startsWith("Complete")) setBusy(null);
  }, [busy, replayComplete, ticketMsg]);

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-subtle">History · simulation</p>
          <h1 className="text-2xl font-semibold tracking-tight">Replay</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Full VST trade simulations for the selected range: every live tactic × range, indications, playbooks, last-N and hour stats. Tape play is independent.
          </p>
        </div>
        <select
          aria-label="Symbol"
          className="h-8 border border-border bg-surface px-2 text-xs"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
        >
          {DESK.symbols.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id}
            </option>
          ))}
        </select>
      </div>

      <LiveBookStrip />

      <Panel
        title="Trade simulation"
        action={
          <span className="font-mono text-xs tabular text-muted">
            {simHours}h · {LIVE_TACTICS.length}×{RANGE_TYPES.length} lanes
          </span>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={rangeId}
            onChange={(v) => setRangeId(v as ReplayRangeId)}
            options={REPLAY_RANGES.map((r) => ({ id: r.id, label: r.label }))}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            aria-label="Tactic"
            className="h-8 border border-border bg-surface px-2 text-xs"
            value={tactic}
            onChange={(e) => setTactic(e.target.value as TacticKind)}
          >
            {LIVE_TACTICS.map((t) => (
              <option key={t} value={t}>
                {TACTIC_META[t]?.label ?? t}
              </option>
            ))}
          </select>
          <select
            aria-label="Range type"
            className="h-8 border border-border bg-surface px-2 text-xs"
            value={rangeType}
            onChange={(e) => setRangeType(e.target.value as RangeType)}
          >
            {RANGE_TYPES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={busy !== null}
            onClick={() => runSim(false)}
          >
            {busy === "sim" ? "Sim…" : `Run ${simHours}h`}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy !== null}
            onClick={() => runSim(true)}
          >
            {busy === "all" ? "Computing…" : "Run all configs"}
          </Button>
          {winner ? (
            <Pill tone={winner.ok ? "up" : "down"}>
              winner {winner.tactic}×{winner.range} {winner.hours}h PF {fmtPf(winner.pf)}
            </Pill>
          ) : null}
        </div>
        {ticketMsg ? <p className="mt-2 text-xs text-muted">{ticketMsg}</p> : null}
      </Panel>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Sim PF" value={fmtPf(simPf)} tone={pfTone(simPf)} hint={`${simTrades} closed`} />
        <Kpi label="Win rate" value={fmtWr(simWr)} hint={report ? `${report.wins} wins` : `${winsTape} tape`} />
        <Kpi label="Net" value={fmtUsd(simNet)} tone={simNet >= 0 ? "up" : "down"} />
        <Kpi label="Max DD" value={fmtMdd(simMdd)} />
        <Kpi
          label="SL / TP"
          value={report ? `${report.slExits} / ${report.tpExits}` : "—"}
          hint={report ? `${report.avgR.toFixed(2)}R avg` : "run sim"}
        />
        <Kpi
          label="Peak legs"
          value={report ? String(report.maxPositionsSeen) : fmtNum(tape.occupancy.peak, 0)}
          hint={report ? `${report.maxOrdersSeen} orders` : "tape peak"}
        />
      </div>

      {report ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title="Simulation detail">
            <StatLine k="Hours" v={`${report.hours}h · ${report.ticks} ticks`} />
            <StatLine k="Config" v={`${replaySim?.tactic} × ${replaySim?.range}`} />
            <StatLine k="Symbols" v={String(report.symbols)} />
            <StatLine k="Equity" v={fmtUsd(report.equity)} />
            <StatLine k="Expectancy" v={fmtUsd(report.expectancy)} />
            <StatLine k="Avg win / loss" v={`${fmtUsd(report.avgWin)} / ${fmtUsd(report.avgLoss)}`} />
            <StatLine k="Streak W/L" v={`${report.maxWinStreak} / ${report.maxLossStreak}`} />
            <StatLine k="Passed" v={report.passed ? "yes" : report.issues[0] ?? "issues"} tone={report.passed ? "up" : "down"} />
          </Panel>
          <Panel title="Book at end">
            <StatLine k="Open pos" v={`${report.openPositions}`} />
            <StatLine k="Open orders" v={String(report.openOrders)} />
            <StatLine k="Slots" v={`${report.book.positions.slots}/${report.book.positions.maxSlots}`} />
            <StatLine k="Long / short" v={`${report.book.positions.long} / ${report.book.positions.short}`} />
            <StatLine k="Placed / filled" v={`${report.book.orders.placed} / ${report.book.orders.filled}`} />
            <StatLine k="Cancelled / reject" v={`${report.book.orders.cancelled} / ${report.book.orders.rejected}`} />
            <StatLine k="Cap rejects" v={String(report.capRejects)} />
            <StatLine k="Rate skips" v={String(report.rateSkips)} />
          </Panel>
          <Panel title="R distribution">
            {(report.rHist ?? []).map((b) => (
              <StatLine key={b.bin} k={b.bin} v={String(b.n)} />
            ))}
          </Panel>
        </div>
      ) : (
        <p className="text-sm text-muted">Run a simulation to fill PF, occupancy, SL/TP and config matrix from the VST engine.</p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Sim equity">
          <EquityChart data={eqCurve} />
        </Panel>
        <Panel title={report ? "Hourly net" : "Tape occupancy"}>
          {report?.hourly?.length ? (
            <MetricBarChart
              data={report.hourly.filter((_, i) => i % Math.max(1, Math.floor(report.hourly.length / 24)) === 0 || i === report.hourly.length - 1).map((h) => ({
                label: `${h.h}h`,
                value: h.net,
              }))}
              yLabel="Net"
            />
          ) : (
            <>
              <OccupancyChart data={loadCurve} />
              <div className="mt-2 grid grid-cols-2 gap-x-4">
                <StatLine k="Avg positions" v={fmtNum(occSel.avgPos, 2)} />
                <StatLine k="Avg orders" v={fmtNum(occSel.avgOrd, 2)} />
              </div>
            </>
          )}
        </Panel>
      </div>

      {hourBars.length ? (
        <Panel title="Stage hours · best PF">
          <MetricBarChart data={hourBars} yLabel="PF" />
          <div className="mt-3 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-subtle">
                <tr>
                  <th className="py-2">Hours</th>
                  <th className="py-2">Winner</th>
                  <th className="py-2">PF</th>
                  <th className="py-2">WR</th>
                  <th className="py-2">n</th>
                  <th className="py-2">OK lanes</th>
                </tr>
              </thead>
              <tbody>
                {hourKeys.map((h) => {
                  const row = byHours[h];
                  const w = row?.winner;
                  return (
                    <tr key={h} className="border-t border-border">
                      <td className="py-2">{h}h</td>
                      <td className="py-2">{w ? `${w.tactic} × ${w.range}` : "—"}</td>
                      <td className="py-2 font-mono tabular">{w ? fmtPf(w.pf) : "—"}</td>
                      <td className="py-2 font-mono tabular">{w ? fmtWr(w.wr) : "—"}</td>
                      <td className="py-2 font-mono tabular">{w?.trades ?? "—"}</td>
                      <td className="py-2 font-mono tabular">{row ? `${row.ok}/${row.n}` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      {matrix.length ? (
        <Panel title={`All configs · ${matrixHours}h`} padded={false}>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-bg text-xs uppercase tracking-wide text-subtle">
                <tr>
                  <th className="px-4 py-2">Tactic</th>
                  <th className="px-2 py-2">Range</th>
                  <th className="px-2 py-2">PF</th>
                  <th className="px-2 py-2">WR</th>
                  <th className="px-2 py-2">Net</th>
                  <th className="px-2 py-2">n</th>
                  <th className="px-2 py-2">OK</th>
                </tr>
              </thead>
              <tbody>
                {[...matrix]
                  .sort((a, b) => b.pf - a.pf)
                  .map((c) => (
                    <tr
                      key={`${c.tactic}-${c.range}-${c.hours}`}
                      className={`border-t border-border ${c.tactic === tactic && c.range === rangeType ? "bg-primary-soft" : ""}`}
                    >
                      <td className="px-4 py-2">{c.tactic}</td>
                      <td className="px-2 py-2">{c.range}</td>
                      <td className="px-2 py-2 font-mono tabular">{fmtPf(c.pf)}</td>
                      <td className="px-2 py-2 font-mono tabular">{fmtWr(c.wr)}</td>
                      <td className="px-2 py-2 font-mono tabular">{fmtUsd(c.net)}</td>
                      <td className="px-2 py-2 font-mono tabular">{c.trades}</td>
                      <td className="px-2 py-2">{c.ok ? "yes" : "no"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      {stats ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Indications">
            {indicationBars.length ? <MetricBarChart data={indicationBars} yLabel="PF" /> : null}
            <div className="mt-2 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-subtle">
                  <tr>
                    <th className="py-2">Kind</th>
                    <th className="py-2">n</th>
                    <th className="py-2">PF</th>
                    <th className="py-2">WR</th>
                    <th className="py-2">Net</th>
                    <th className="py-2">DDT</th>
                  </tr>
                </thead>
                <tbody>
                  {(stats.byIndication ?? []).map((b) => (
                    <tr key={b.key} className="border-t border-border">
                      <td className="py-2 capitalize">{b.key}</td>
                      <td className="py-2 font-mono tabular">{b.n}</td>
                      <td className="py-2 font-mono tabular">{fmtPf(b.pf)}</td>
                      <td className="py-2 font-mono tabular">{fmtWr(b.wr)}</td>
                      <td className="py-2 font-mono tabular">{fmtUsd(b.net)}</td>
                      <td className="py-2 font-mono tabular">{b.ddt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel title="Playbooks">
            <div className="overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-subtle">
                  <tr>
                    <th className="py-2">Book</th>
                    <th className="py-2">n</th>
                    <th className="py-2">PF</th>
                    <th className="py-2">WR</th>
                    <th className="py-2">Net</th>
                    <th className="py-2">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {(stats.byPlaybook ?? []).map((b) => (
                    <tr key={b.key} className="border-t border-border">
                      <td className="py-2 capitalize">{b.key}</td>
                      <td className="py-2 font-mono tabular">{b.n}</td>
                      <td className="py-2 font-mono tabular">{fmtPf(b.pf)}</td>
                      <td className="py-2 font-mono tabular">{fmtWr(b.wr)}</td>
                      <td className="py-2 font-mono tabular">{fmtUsd(b.net)}</td>
                      <td className="py-2 font-mono tabular">{b.openN ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {tacticBars.length ? (
              <div className="mt-4">
                <MetricBarChart data={tacticBars} yLabel="Tactic PF" />
              </div>
            ) : null}
            {rangeBars.length ? (
              <div className="mt-4">
                <MetricBarChart data={rangeBars} yLabel="Range PF" />
              </div>
            ) : null}
          </Panel>
        </div>
      ) : null}

      {stats ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Last N" padded={false}>
            <div className="overflow-auto p-4">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-subtle">
                  <tr>
                    <th className="py-2">N</th>
                    <th className="py-2">n</th>
                    <th className="py-2">PF</th>
                    <th className="py-2">WR</th>
                    <th className="py-2">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(stats.lastN ?? {}).map(([k, b]) => (
                    <tr key={k} className="border-t border-border">
                      <td className="py-2">{k}</td>
                      <td className="py-2 font-mono tabular">{b.n}</td>
                      <td className="py-2 font-mono tabular">{fmtPf(b.pf)}</td>
                      <td className="py-2 font-mono tabular">{fmtWr(b.wr)}</td>
                      <td className="py-2 font-mono tabular">{fmtUsd(b.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel title="Hours (engine)" padded={false}>
            <div className="overflow-auto p-4">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-subtle">
                  <tr>
                    <th className="py-2">H</th>
                    <th className="py-2">n</th>
                    <th className="py-2">PF</th>
                    <th className="py-2">WR</th>
                    <th className="py-2">Net</th>
                    <th className="py-2">DDT</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(stats.hours ?? {}).map(([k, b]) => (
                    <tr key={k} className="border-t border-border">
                      <td className="py-2">{k}h</td>
                      <td className="py-2 font-mono tabular">{b.n}</td>
                      <td className="py-2 font-mono tabular">{fmtPf(b.pf)}</td>
                      <td className="py-2 font-mono tabular">{fmtWr(b.wr)}</td>
                      <td className="py-2 font-mono tabular">{fmtUsd(b.net)}</td>
                      <td className="py-2 font-mono tabular">{b.ddt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      ) : null}

      {report?.bySymbol?.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Best symbols" padded={false}>
            <div className="overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-subtle">
                  <tr>
                    <th className="px-4 py-2">Symbol</th>
                    <th className="px-2 py-2">PF</th>
                    <th className="px-2 py-2">WR</th>
                    <th className="px-2 py-2">Net</th>
                    <th className="px-2 py-2">n</th>
                  </tr>
                </thead>
                <tbody>
                  {report.bySymbol.slice(0, 8).map((s) => (
                    <tr key={s.id} className="border-t border-border">
                      <td className="px-4 py-2">{s.id}</td>
                      <td className="px-2 py-2 font-mono tabular">{fmtPf(s.pf)}</td>
                      <td className="px-2 py-2 font-mono tabular">{fmtWr(s.wr)}</td>
                      <td className="px-2 py-2 font-mono tabular">{fmtUsd(s.net)}</td>
                      <td className="px-2 py-2 font-mono tabular">{s.trades}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel title="Worst symbols" padded={false}>
            <div className="overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-subtle">
                  <tr>
                    <th className="px-4 py-2">Symbol</th>
                    <th className="px-2 py-2">PF</th>
                    <th className="px-2 py-2">WR</th>
                    <th className="px-2 py-2">Net</th>
                    <th className="px-2 py-2">n</th>
                  </tr>
                </thead>
                <tbody>
                  {[...report.bySymbol].reverse().slice(0, 8).map((s) => (
                    <tr key={s.id} className="border-t border-border">
                      <td className="px-4 py-2">{s.id}</td>
                      <td className="px-2 py-2 font-mono tabular">{fmtPf(s.pf)}</td>
                      <td className="px-2 py-2 font-mono tabular">{fmtWr(s.wr)}</td>
                      <td className="px-2 py-2 font-mono tabular">{fmtUsd(s.net)}</td>
                      <td className="px-2 py-2 font-mono tabular">{s.trades}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      ) : null}

      {replaySim?.fills?.length ? (
        <Panel title="Sim fills" padded={false}>
          <div className="max-h-64 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-bg text-xs uppercase tracking-wide text-subtle">
                <tr>
                  <th className="px-4 py-2">Symbol</th>
                  <th className="px-2 py-2">Side</th>
                  <th className="px-2 py-2">Reason</th>
                  <th className="px-2 py-2">Tick</th>
                  <th className="px-2 py-2">PnL</th>
                </tr>
              </thead>
              <tbody>
                {replaySim.fills.slice(0, 24).map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="px-4 py-2">{t.symbol}</td>
                    <td className="px-2 py-2 capitalize">{t.side}</td>
                    <td className="px-2 py-2">{t.reason}</td>
                    <td className="px-2 py-2 font-mono tabular">{t.tick}</td>
                    <td className="px-2 py-2 font-mono tabular">{fmtUsd(t.pnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      <Panel
        title="Time range tape"
        action={
          <span className="font-mono text-xs tabular text-muted">
            {tape.bars} bars · {hours}h · 15m
          </span>
        }
      >
        <Segmented
          value={rangeId}
          onChange={(v) => setRangeId(v as ReplayRangeId)}
          options={REPLAY_RANGES.map((r) => ({ id: r.id, label: r.label }))}
        />
      </Panel>

      <Panel
        title="Tape"
        action={
          <select
            aria-label="Strategy"
            className="h-8 border border-border bg-surface px-2 text-xs"
            value={strategyId}
            onChange={(e) => setStrategy(e.target.value)}
          >
            {STRATEGIES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        }
      >
        <PriceChart data={chartData} replayIndex={Math.min(chartData.length - 1, Math.round((idx / max) * (chartData.length - 1)))} />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button size="sm" variant={playing ? "secondary" : "primary"} onClick={() => {
            if (!playing && idx >= max) setReplayIndex(WARMUP);
            setPlaying(!playing);
          }}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            {playing ? "Pause" : "Play"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setPlaying(false);
              setReplayIndex(WARMUP);
            }}
          >
            <RotateCcw className="size-4" />
            Reset
          </Button>
          <Segmented
            value={String(speed)}
            onChange={(v) => setSpeed(Number(v) as 1 | 2 | 4)}
            options={[
              { id: "1", label: "1×" },
              { id: "2", label: "2×" },
              { id: "4", label: "4×" },
            ]}
          />
          <Pill tone={signalNow > 0 ? "up" : signalNow < 0 ? "down" : "neutral"}>
            {signalNow > 0 ? "Long signal" : signalNow < 0 ? "Short signal" : "Flat"}
          </Pill>
          <span className="ml-auto font-mono text-xs tabular text-muted">
            {barTime(candle?.t ?? 0)} · {idx} / {max}
          </span>
        </div>
        <input
          aria-label="Replay position"
          type="range"
          className="mt-4 w-full"
          min={WARMUP}
          max={max}
          value={idx}
          onChange={(e) => {
            setPlaying(false);
            setReplayIndex(Number(e.target.value));
          }}
        />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Tape equity">
          <EquityChart
            data={downsample(
              (bt?.equity ?? []).map((eq, i) => ({ i, eq })).slice(0, Math.max(1, idx - WARMUP + 1)),
              360,
            )}
          />
        </Panel>
        <Panel title="Active positions / orders">
          <OccupancyChart data={loadCurve} />
          <div className="mt-2 grid grid-cols-2 gap-x-4">
            <StatLine k="Avg positions" v={fmtNum(occSel.avgPos, 2)} />
            <StatLine k="Avg orders" v={fmtNum(occSel.avgOrd, 2)} />
          </div>
        </Panel>
      </div>

      <Panel title="Indication overview">
        <MetricBarChart data={kindBars} yLabel="PF" />
        <div className="mt-3 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-subtle">
              <tr>
                <th className="py-2">Kind</th>
                <th className="py-2">Hits</th>
                <th className="py-2">Strength</th>
                <th className="py-2">Trades</th>
                <th className="py-2">PF</th>
                <th className="py-2">WR</th>
                <th className="py-2">Net</th>
              </tr>
            </thead>
            <tbody>
              {tape.kinds.map((k) => (
                <tr key={k.key} className="border-t border-border">
                  <td className="py-2 capitalize">{INDICATION_KINDS.find((x) => x.id === k.key)?.label ?? k.key}</td>
                  <td className="py-2 font-mono tabular">{k.hits}</td>
                  <td className="py-2 font-mono tabular">{fmtNum(k.avgStrength, 2)}</td>
                  <td className="py-2 font-mono tabular">{k.trades}</td>
                  <td className="py-2 font-mono tabular">{fmtPf(k.pf)}</td>
                  <td className="py-2 font-mono tabular">{fmtWr(k.wr)}</td>
                  <td className="py-2 font-mono tabular">{fmtUsd(k.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {tape.configs.map((c) => (
            <div key={c.id} className="border border-border px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-subtle">{c.kind}</div>
              <div className="text-sm font-medium">{c.label}</div>
              <div className="mt-1 font-mono text-xs tabular text-muted">
                hits {c.hits} · str {fmtNum(c.avgStrength, 2)}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Strategy overview" padded={false}>
        <div className="p-4">
          <MetricBarChart data={stratBars} yLabel="PF" />
        </div>
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-bg text-xs uppercase tracking-wide text-subtle">
              <tr>
                <th className="px-4 py-2">Strategy</th>
                <th className="px-2 py-2">Kind</th>
                <th className="px-2 py-2">PF</th>
                <th className="px-2 py-2">WR</th>
                <th className="px-2 py-2">Net</th>
                <th className="px-2 py-2">n</th>
                <th className="px-2 py-2">MDD</th>
                <th className="px-2 py-2">Avg pos</th>
                <th className="px-2 py-2">Avg ord</th>
              </tr>
            </thead>
            <tbody>
              {[...tape.strategies]
                .sort((a, b) => b.pf - a.pf)
                .map((s) => (
                  <tr
                    key={s.id}
                    className={`border-t border-border ${s.id === strategyId ? "bg-primary-soft" : ""}`}
                    onClick={() => setStrategy(s.id)}
                  >
                    <td className="px-4 py-2">{s.name}</td>
                    <td className="px-2 py-2 capitalize">{s.kind}</td>
                    <td className="px-2 py-2 font-mono tabular">{fmtPf(s.pf)}</td>
                    <td className="px-2 py-2 font-mono tabular">{fmtWr(s.wr)}</td>
                    <td className="px-2 py-2 font-mono tabular">{fmtUsd(s.net)}</td>
                    <td className="px-2 py-2 font-mono tabular">{s.trades}</td>
                    <td className="px-2 py-2 font-mono tabular">{fmtMdd(s.mdd)}</td>
                    <td className="px-2 py-2 font-mono tabular">{fmtNum(s.avgPos, 2)}</td>
                    <td className="px-2 py-2 font-mono tabular">{fmtNum(s.avgOrd, 2)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="To this bar">
          <StatLine k="Close" v={fmtPx(candle?.c ?? 0)} />
          <StatLine k="Closed trades" v={String(tradesToNow.length)} />
          <StatLine k="Wins" v={String(winsTape)} />
          <StatLine k="PF" v={fmtPf(pfTape)} />
          <StatLine k="WR" v={fmtWr(wrTape)} />
          <StatLine k="Net" v={fmtUsd(netTape)} tone={netTape >= 0 ? "up" : "down"} />
          <StatLine k="Avg positions" v={fmtNum(occSel.avgPos, 2)} />
          <StatLine k="Avg orders" v={fmtNum(occSel.avgOrd, 2)} />
        </Panel>
        <Panel className="lg:col-span-2" title="Tape fills" padded={false}>
          <div className="max-h-64 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-bg text-xs uppercase tracking-wide text-subtle">
                <tr>
                  <th className="px-4 py-2">Bar</th>
                  <th className="px-2 py-2">Side</th>
                  <th className="px-2 py-2">Entry</th>
                  <th className="px-2 py-2">Exit</th>
                  <th className="px-2 py-2">PnL</th>
                </tr>
              </thead>
              <tbody>
                {tradesToNow
                  .slice(-16)
                  .reverse()
                  .map((t) => (
                    <tr key={t.id} className="border-t border-border">
                      <td className="px-4 py-2 font-mono text-xs tabular">
                        {t.entryBar}→{t.exitBar}
                      </td>
                      <td className="px-2 py-2 capitalize">{t.side}</td>
                      <td className="px-2 py-2 font-mono tabular">{fmtPx(t.entry)}</td>
                      <td className="px-2 py-2 font-mono tabular">{fmtPx(t.exit)}</td>
                      <td className="px-2 py-2 font-mono tabular">{fmtUsd(t.pnl)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {tradesToNow.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted">No fills yet — play forward from warmup.</p>
            ) : null}
          </div>
        </Panel>
      </div>
    </div>
  );
}
