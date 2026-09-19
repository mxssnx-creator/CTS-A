import { useMemo, useState, useEffect } from "react";
import { FlaskConical } from "lucide-react";
import {
  comboBreakdown,
  combosFiltered,
  DEFAULT_THRESHOLDS,
  equitySeries,
  RANGE_META,
  TACTIC_META,
} from "@/lib/desk/engine";
import { useDesk } from "@/lib/desk/store";
import { useLiveSnapshot, usePreserveScroll } from "@/lib/desk/live-ctx";
import { bookCounts, overallLiveStats } from "@/lib/desk/vst";
import { clsPnl, fmtNum, fmtUsd } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  CostLineChart,
  DualEquityChart,
  HBarChart,
  HistChart,
  HourlyChart,
  MetricBarChart,
  MixChart,
  PfScatterChart,
} from "../charts";
import {
  Field,
  fmtMdd,
  fmtPf,
  fmtR,
  fmtWr,
  Kpi,
  Panel,
  pfTone,
  Pill,
  Segmented,
  signedTone,
  StatLine,
} from "../widgets";
import { LiveBookStrip } from "../live-book-strip";

function withDrawdown(eq: { i: number; eq: number }[]) {
  let peak = eq[0]?.eq ?? 10_000;
  return eq.map((p) => {
    if (p.eq > peak) peak = p.eq;
    return { t: p.i, eq: p.eq, dd: peak > 0 ? Math.max(0, (peak - p.eq) / peak) : 0 };
  });
}

export function PerformanceView() {
  usePreserveScroll();
  const symbol = useDesk((s) => s.symbol);
  const strategyId = useDesk((s) => s.strategyId);
  const lastNs = useDesk((s) => s.lastNs);
  const cfg = useDesk((s) => s.tacticConfig);
  const th = useDesk((s) => s.thresholds);
  const setTh = useDesk((s) => s.setThresholds);
  const enabledKinds = useDesk((s) => s.enabledKinds);
  const tactic = useDesk((s) => s.tactic);
  const rangeType = useDesk((s) => s.rangeType);
  const symbolCount = useDesk((s) => s.symbolCount);
  const orderType = useDesk((s) => s.orderType);
  const vst = useDesk((s) => s.vst);
  const liveSnap = useLiveSnapshot();
  const runSim = useDesk((s) => s.runSimHours);
  const autoValidate = useDesk((s) => s.autoValidate);
  const validation = useDesk((s) => s.validation);
  const runStageEval = useDesk((s) => s.runStageEval);
  const stageEval = useDesk((s) => s.stageEval);
  const evalHours = useDesk((s) => s.evalHours);
  const evalLastNs = useDesk((s) => s.evalLastNs);
  const [validating, setValidating] = useState(false);
  const [simming, setSimming] = useState(false);
  const [staging, setStaging] = useState(false);

  const [scope, setScope] = useState<"symbol" | "desk">("desk");
  const [hours, setHours] = useState<1 | 2 | 4 | 8 | 16 | 32 | 24 | 72>(8);
  const [curveSrc, setCurveSrc] = useState<"sim" | "backtest">("backtest");

  const [rows, setRows] = useState<ReturnType<typeof combosFiltered>>([]);
  useEffect(() => {
    let dead = false;
    const t = window.setTimeout(() => {
      try {
        const next = combosFiltered({
        symbol: scope === "symbol" ? symbol : undefined,
        lastN: lastNs.combos,
        cfg,
        th,
        tactic: "all",
        rangeType: "all",
        onlyPositive: false,
        enabledKinds,
        keepBest: true,
      });
        if (!dead) setRows(next);
      } catch {
        if (!dead) setRows([]);
      }
    }, 180);
    return () => {
      dead = true;
      window.clearTimeout(t);
    };
  }, [symbol, lastNs.combos, cfg, th, enabledKinds, scope]);

  const bd = useMemo(() => comboBreakdown(rows), [rows]);
  const top = useMemo(() => rows.filter((r) => r.positive && r.lastNPositive).slice(0, 16), [rows]);
  const board = useMemo(() => (top.length ? top : rows.slice(0, 16)), [top, rows]);

  const btCurve = useMemo(() => withDrawdown(equitySeries(strategyId, symbol)), [strategyId, symbol]);
  const sim = vst.sim;
  const showSim = curveSrc === "sim" && sim && sim.curve.length > 1;
  const sessionClosed = vst.closed.slice(0, 12);

  const passRate = bd.total ? bd.both / bd.total : 0;
  const live = liveSnap.hasLive
    ? { equity: liveSnap.equity, pf: liveSnap.pf, wr: liveSnap.wr, net: liveSnap.net, trades: liveSnap.trades }
    : vst.stats;
  const book = useMemo(() => bookCounts(vst), [vst]);
  const pos = book.positions;
  const ord = book.orders;
  const overall = useMemo(() => {
    const fromSess = liveSnap.session?.overall as ReturnType<typeof overallLiveStats> | undefined;
    const fromFile = liveSnap.overall?.live as ReturnType<typeof overallLiveStats> | undefined;
    return fromSess ?? fromFile ?? (liveSnap.hasLive ? {
      pf: liveSnap.pf,
      wr: liveSnap.wr,
      net: liveSnap.net,
      trades: liveSnap.trades,
      symbols: 50,
      occupied: liveSnap.occupied,
      slots: liveSnap.slots,
      open: { net: 0 },
    } : overallLiveStats(vst));
  }, [vst, liveSnap]);

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-subtle">Statistics</p>
          <h1 className="text-2xl font-semibold tracking-tight">Performance</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Combination space, gates, and the live {liveSnap.venueLabel} tape. Auto-validate independently scores
            every tactic, range, trail and TP/SL ratio. Overall stats cover all armed symbols.
          </p>
        </div>
        <Segmented
          value={scope}
          onChange={setScope}
          options={[
            { id: "symbol", label: symbol },
            { id: "desk", label: "All desk" },
          ]}
        />
      </div>

      <LiveBookStrip />

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Combos" value={fmtNum(bd.total, 0)} hint={`${bd.uniquePf} PF values`} />
        <Kpi label="Avg PF" value={fmtPf(bd.avgPf)} tone={pfTone(bd.avgPf)} hint={`${bd.both} dual-pass`} />
        <Kpi label="Pass rate" value={fmtWr(passRate)} hint="Full + last N" />
        <Kpi label="Avg MDD" value={fmtMdd(bd.avgMdd)} hint={`${bd.uniqueMdd} distinct`} />
        <Kpi label="Avg WR" value={fmtWr(bd.avgWr)} />
        <Kpi label="Volume factor" value={fmtNum(bd.avgVf, 2)} hint={`DDT ${fmtNum(bd.avgDdt, 0)}`} />
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Live PF" value={fmtPf(Number(overall.pf ?? liveSnap.pf))} tone={pfTone(Number(overall.pf ?? liveSnap.pf))} hint={`${overall.trades ?? liveSnap.trades} closes`} />
        <Kpi label="Live WR" value={fmtWr(Number(overall.wr ?? liveSnap.wr))} />
        <Kpi label="Live net" value={fmtUsd(Number(overall.net ?? liveSnap.net))} tone={Number(overall.net ?? liveSnap.net) >= 0 ? "up" : "down"} />
        <Kpi label="Symbols" value={String(overall.symbols ?? 50)} hint={`${overall.occupied ?? liveSnap.occupied} occupied`} />
        <Kpi label="Open uPnL" value={fmtUsd(Number(overall.open?.net ?? 0))} />
        <Kpi label="Active slots" value={String(overall.slots ?? liveSnap.livePos)} />
      </div>

      <Panel title="Positions & orders">
        <p className="mb-3 text-sm text-muted">
          Positions are unique symbol + direction. Three names both ways is 6; if one is short-only, 5.
          Cap {pos.maxSlots} slots ({symbolCount} × 2) and {pos.maxLegs} legs. Orders list every status,
          including filled, cancelled and rejected for the session.
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <Kpi
            label="Position slots"
            value={liveSnap.hasLive ? `${liveSnap.occupied}/${symbolCount}` : `${pos.slots}/${pos.maxSlots}`}
            hint={liveSnap.hasLive ? `${liveSnap.liveLong} long · ${liveSnap.liveShort} short` : `${pos.long} long · ${pos.short} short`}
            tone="accent"
          />
          <Kpi label="Long" value={String(liveSnap.hasLive ? liveSnap.liveLong : pos.long)} hint={`${liveSnap.hasLive ? liveSnap.occupied : pos.symbols} symbols`} />
          <Kpi label="Short" value={String(liveSnap.hasLive ? liveSnap.liveShort : pos.short)} />
          <Kpi
            label="Legs"
            value={liveSnap.hasLive ? `${liveSnap.livePos}/${pos.maxLegs}` : `${pos.legs}/${pos.maxLegs}`}
            hint={liveSnap.hasLive ? liveSnap.venueLabel : `${vst.stats.partials} partial`}
          />
          <Kpi
            label="Orders placed"
            value={fmtNum(ord.placed, 0)}
            hint={`${ord.live} live`}
          />
          <Kpi
            label="Working"
            value={String(ord.working)}
            hint={`${ord.open} open · ${ord.partial} partial`}
          />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-subtle">Direction mix</p>
            <MixChart
              sl={pos.short}
              tp={pos.long}
              downLabel="Short"
              upLabel="Long"
              unit="Slots"
            />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-subtle">Order statuses</p>
            <MetricBarChart
              data={[
                { label: "Queued", value: ord.queued },
                { label: "Open", value: ord.open },
                { label: "Partial", value: ord.partial },
                { label: "Filled", value: ord.filled },
                { label: "Cancel", value: ord.cancelled },
                { label: "Reject", value: ord.rejected },
              ]}
              yLabel="Orders"
              formatY={(v) => fmtNum(v, 0)}
            />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-6 sm:grid-cols-4">
          <StatLine k="Queued" v={String(ord.queued)} />
          <StatLine k="Open" v={String(ord.open)} />
          <StatLine k="Partial" v={String(ord.partial)} />
          <StatLine k="Filled" v={String(ord.filled)} tone="up" />
          <StatLine k="Cancelled" v={String(ord.cancelled)} />
          <StatLine k="Rejected" v={String(ord.rejected)} tone={ord.rejected ? "down" : "neutral"} />
          <StatLine k="Working (open+partial)" v={String(ord.working)} />
          <StatLine k="Live (queued+working)" v={String(ord.live)} />
        </div>
      </Panel>

      <Panel
        title="Paper tape simulation"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              value={String(hours)}
              onChange={(v) => setHours(Number(v) as 1 | 2 | 4 | 8 | 16 | 32 | 24 | 72)}
              options={[
                { id: "1", label: "1h" },
                { id: "2", label: "2h" },
                { id: "4", label: "4h" },
                { id: "8", label: "8h" },
                { id: "16", label: "16h" },
                { id: "32", label: "32h" },
                { id: "24", label: "24h" },
                { id: "72", label: "3d" },
              ]}
            />
            <Button
              size="sm"
              disabled={simming}
              onClick={() => {
                setSimming(true);
                window.setTimeout(() => {
                  runSim(hours);
                  setSimming(false);
                }, 30);
              }}
            >
              <FlaskConical className="size-4" />
              {simming ? "Running…" : `Run ${hours === 72 ? "3d" : `${hours}h`}`}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={validating}
              onClick={() => {
                setValidating(true);
                window.setTimeout(() => {
                  autoValidate();
                  setHours(72);
                  setValidating(false);
                }, 30);
              }}
            >
              {validating ? "Validating…" : "Auto-validate 3d"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={staging}
              onClick={() => {
                setStaging(true);
                window.setTimeout(() => {
                  runStageEval();
                  setHours(16);
                  setStaging(false);
                }, 30);
              }}
            >
              {staging ? "Staging…" : `Stage-eval ${evalHours.join("/")}h`}
            </Button>
          </div>
        }
      >
        <p className="mb-3 text-sm text-muted">
          {symbolCount} symbols · {orderType.replace("_", " ")} ladders · {TACTIC_META[tactic].label} ·{" "}
          {RANGE_META[rangeType].label}. Session equity {fmtUsd(live.equity, 0)} · PF {fmtPf(live.pf)} ·{" "}
          {live.trades} live closes.
        </p>
        {sim ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
              <Kpi label="Sim PF" value={fmtPf(sim.pf)} tone={pfTone(sim.pf)} hint={sim.passed ? "Passed" : "Issues"} />
              <Kpi label="Net" value={fmtUsd(sim.net)} tone={signedTone(sim.net)} hint={`${sim.trades} trades`} />
              <Kpi label="Win rate" value={fmtWr(sim.wr)} />
              <Kpi label="Max DD" value={fmtMdd(sim.mdd)} />
              <Kpi label="Expectancy" value={fmtUsd(sim.expectancy)} />
              <Kpi label="Avg R" value={fmtR(sim.avgR)} tone={signedTone(sim.avgR)} />
              <Kpi label="SL / TP" value={`${sim.slExits} / ${sim.tpExits}`} />
              <Kpi
                label="Streaks"
                value={`${sim.maxWinStreak}W / ${sim.maxLossStreak}L`}
                hint={`Rec ${fmtNum(sim.recovery, 1)}`}
              />
            </div>
            {(sim.marks?.length ?? 0) > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {sim.marks!.map((m) => (
                  <Pill key={m.hours} tone={m.ok ? "up" : "down"}>
                    {m.hours}h · PF {m.pf.toFixed(2)} · {m.ok ? "ok" : "fail"}
                  </Pill>
                ))}
              </div>
            ) : null}
            <div className="mt-3 grid grid-cols-2 gap-x-6 sm:grid-cols-4">
              <StatLine
                k="Sim position slots"
                v={`${sim.book.positions.slots}/${sim.book.positions.maxSlots} · ${sim.book.positions.long}L/${sim.book.positions.short}S`}
              />
              <StatLine k="Sim legs" v={`${sim.book.positions.legs}/${sim.book.positions.maxLegs}`} />
              <StatLine
                k="Sim orders"
                v={`${sim.book.orders.placed} placed · ${sim.book.orders.live} live`}
              />
              <StatLine
                k="Filled / cancel / reject"
                v={`${sim.book.orders.filled} / ${sim.book.orders.cancelled} / ${sim.book.orders.rejected}`}
              />
            </div>
            {sim.issues.length ? (
              <ul className="mt-3 list-disc px-4 text-sm text-down">
                {sim.issues.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">
                {sim.hours}h · {sim.ticks} ticks · {sim.symbols} symbols · peak {sim.maxPositionsSeen}/100
                positions · {sim.rateSkips} rate skips · {sim.capRejects} cap rejects.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted">
            Run 1–72h (3d) on the current tactic, range, symbol count and order type. The live book stays
            intact; results attach as a report.
          </p>
        )}
      </Panel>

      {stageEval ? (
        <Panel title="Stage eval · pre / mid / end">
          <p className="mb-3 text-sm text-muted">
            Full historic compute at {stageEval.hours.join("/")}h. Last-N {stageEval.lastNs.join("/")} pos evals
            run independently on every lane. End-stage PF average is only effective (active + valid) processings.
            {stageEval.mirrored ? " Mirrored to live exchange execution." : " Live book held until end passes."}
          </p>
          <div className="flex flex-wrap gap-2">
            {stageEval.stages.map((s) => (
              <Pill key={s.id} tone={s.ok ? "up" : "down"}>
                {s.id} {s.hours}h · PF {s.pf.toFixed(2)}
                {s.id === "end" ? ` · avg ${s.pfAvg?.toFixed(2) ?? "—"} · ${s.effective} eff` : ""}
              </Pill>
            ))}
            <Pill tone={stageEval.endOk ? "up" : "down"}>
              End avg {stageEval.endPfAvg.toFixed(2)} · {stageEval.effective}/{stageEval.valid} effective
            </Pill>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {stageEval.liveNs.map((r) => (
              <Pill key={r.n} tone={r.ok ? "up" : "neutral"}>
                Live N{r.n} PF {r.pf.toFixed(2)} · {r.trades}
              </Pill>
            ))}
            {stageEval.coords
              .filter((c) => c.axis === "lastN" || c.recommend === "live")
              .map((c) => (
                <Pill key={`${c.axis}-${c.value}`} tone={c.ok ? "up" : "neutral"}>
                  {c.axis} {c.value} {c.pf.toFixed(2)}
                </Pill>
              ))}
          </div>
        </Panel>
      ) : null}

      {validation ? (
        <Panel title="Auto-validate · 3 days + historic ranges">
          <p className="mb-3 text-sm text-muted">
            Independent sweeps of tactic, range, trail, SL ATR and TP/SL. Performing kinds stay
            enabled. Live settings apply only when the 3-day confirm passes.
          </p>
          <div className="flex flex-wrap gap-2">
            <Pill tone={validation.confirmOk ? "up" : "down"}>
              3d {validation.applied ? "applied" : validation.confirmOk ? "pass" : "held"} · {validation.tactic} · {validation.rangeType}
            </Pill>
            <Pill>Trail {validation.cfg.trailingPct.toFixed(1)}%</Pill>
            <Pill>SL {validation.cfg.slAtr.toFixed(1)} ATR</Pill>
            <Pill>TP/SL {validation.cfg.tpRatio.toFixed(2)}R</Pill>
            {validation.kinds.map((k) => (
              <Pill key={k.kind} tone={k.ok ? "up" : "neutral"}>
                {k.kind} {k.pass}/{k.total}
              </Pill>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {validation.confirm.map((m) => (
              <Pill key={m.hours} tone={m.ok ? "up" : "down"}>
                {m.hours}h PF {m.pf.toFixed(2)} net {m.net.toFixed(0)} {m.ok ? "ok" : "fail"}
              </Pill>
            ))}
          </div>
        </Panel>
      ) : null}

      <Panel
        title={showSim ? `Simulated equity · ${sim!.hours}h` : `Backtest equity · ${strategyId} · ${symbol}`}
        action={
          sim ? (
            <Segmented
              value={curveSrc}
              onChange={setCurveSrc}
              options={[
                { id: "sim", label: "Sim" },
                { id: "backtest", label: "Backtest" },
              ]}
            />
          ) : undefined
        }
      >
        <DualEquityChart
          data={showSim ? sim!.curve : btCurve}
          xLabel={showSim ? "Hours" : "Bars"}
        />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Hourly net">
          <HourlyChart data={sim?.hourly ?? []} />
        </Panel>
        <Panel title="Stop vs take-profit">
          {sim ? (
            <MixChart sl={sim.slExits} tp={sim.tpExits} />
          ) : (
            <p className="text-sm text-muted">SL/TP mix appears after a simulation.</p>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="R-multiple mix">
          <HistChart data={sim?.rHist ?? []} yLabel="Exits" />
        </Panel>
        <Panel title="Profit factor distribution">
          <HistChart data={bd.pfHist} yLabel="Combos" />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="PF by strategy">
          <HBarChart data={bd.byStrategy.map((b) => ({ label: b.label, value: b.avgPf }))} />
        </Panel>
        <Panel title="PF by type">
          <HBarChart data={bd.byKind.map((b) => ({ label: b.label, value: b.avgPf }))} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="PF by tactic">
          <MetricBarChart data={bd.byTactic.map((b) => ({ label: b.label, value: b.avgPf }))} />
        </Panel>
        <Panel title="PF by range">
          <MetricBarChart data={bd.byRange.map((b) => ({ label: b.label, value: b.avgPf }))} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="PF vs cost step 3–30">
          <CostLineChart data={bd.byCost.map((b) => ({ label: b.label, value: b.avgPf }))} />
        </Panel>
        <Panel title="PF by trail range">
          <MetricBarChart data={bd.byTrail.map((b) => ({ label: b.label, value: b.avgPf }))} />
        </Panel>
        <Panel title="PF by TP/SL ratio">
          <MetricBarChart data={bd.byTpRatio.map((b) => ({ label: b.label, value: b.avgPf }))} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Last N vs full PF"
          action={
            <div className="flex flex-wrap gap-2 text-xs text-muted">
              <span className="inline-flex items-center gap-1">
                <span className="size-2 bg-primary" /> Trailing
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="size-2 bg-info" /> DCA
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="size-2 bg-muted" /> Axis
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="size-2 bg-up" /> Hybrid
              </span>
            </div>
          }
        >
          <PfScatterChart data={bd.scatter} />
        </Panel>
      </div>

      <Panel title={sim ? `By symbol · ${sim.hours}h sim` : "By symbol"} padded={false}>
        {sim && sim.bySymbol.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-2xl text-left text-sm">
              <thead className="bg-bg text-xs font-medium uppercase tracking-wide text-subtle">
                <tr>
                  <th className="px-4 py-2">Symbol</th>
                  <th className="px-2 py-2">Trades</th>
                  <th className="px-2 py-2">Net</th>
                  <th className="px-2 py-2">PF</th>
                  <th className="px-2 py-2">WR</th>
                  <th className="px-2 py-2">SL</th>
                  <th className="px-2 py-2">TP</th>
                </tr>
              </thead>
              <tbody>
                {sim.bySymbol.slice(0, 16).map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-4 py-2 font-medium">{s.id}</td>
                    <td className="px-2 py-2 font-mono tabular">{s.trades}</td>
                    <td className={`px-2 py-2 font-mono tabular ${clsPnl(s.net)}`}>{fmtUsd(s.net)}</td>
                    <td className="px-2 py-2 font-mono tabular">{fmtPf(s.pf)}</td>
                    <td className="px-2 py-2 font-mono tabular">{fmtWr(s.wr)}</td>
                    <td className="px-2 py-2 font-mono tabular">{s.sl}</td>
                    <td className="px-2 py-2 font-mono tabular">{s.tp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-4 text-sm text-muted">Run a simulation to rank symbols on the paper tape.</p>
        )}
      </Panel>

      <Panel title="Session tape · last closes" padded={false}>
        {sessionClosed.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-2xl text-left text-sm">
              <thead className="bg-bg text-xs font-medium uppercase tracking-wide text-subtle">
                <tr>
                  <th className="px-4 py-2">Symbol</th>
                  <th className="px-2 py-2">Side</th>
                  <th className="px-2 py-2">Reason</th>
                  <th className="px-2 py-2">R</th>
                  <th className="px-2 py-2">PnL</th>
                  <th className="px-2 py-2">Exit</th>
                </tr>
              </thead>
              <tbody>
                {sessionClosed.map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="px-4 py-2 font-medium">{t.symbol}</td>
                    <td className="px-2 py-2">{t.side}</td>
                    <td className="px-2 py-2">
                      <Pill tone={t.reason === "tp" ? "up" : "down"}>{t.reason.toUpperCase()}</Pill>
                    </td>
                    <td className={`px-2 py-2 font-mono tabular ${clsPnl(t.r)}`}>{fmtR(t.r)}</td>
                    <td className={`px-2 py-2 font-mono tabular ${clsPnl(t.pnl)}`}>{fmtUsd(t.pnl)}</td>
                    <td className="px-2 py-2 font-mono tabular text-xs">{fmtNum(t.exit, t.exit >= 1 ? 2 : 5)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-4 text-sm text-muted">No closed session trades yet. Start the engine or run a sim.</p>
        )}
      </Panel>

      <Panel title="Thresholds">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <Field label={`Overall PF ${th.minPf.toFixed(2)}`}>
            <input
              type="range"
              min={1.1}
              max={3}
              step={0.05}
              value={th.minPf}
              onChange={(e) => setTh({ minPf: Number(e.target.value) })}
            />
          </Field>
          <Field label={`Base PF ${(th.basePf ?? 1.1).toFixed(2)}`}>
            <input
              type="range"
              min={1}
              max={2}
              step={0.05}
              value={th.basePf ?? 1.1}
              onChange={(e) => setTh({ basePf: Number(e.target.value) })}
            />
          </Field>
          <Field label={`Axis PF ${(th.axisPf ?? 1.5).toFixed(2)}`}>
            <input
              type="range"
              min={1.1}
              max={3}
              step={0.05}
              value={th.axisPf ?? 1.5}
              onChange={(e) => setTh({ axisPf: Number(e.target.value) })}
            />
          </Field>
          <Field label={`Block PF ${(th.blockPf ?? 1.6).toFixed(2)}`}>
            <input
              type="range"
              min={1.1}
              max={3}
              step={0.05}
              value={th.blockPf ?? 1.6}
              onChange={(e) => setTh({ blockPf: Number(e.target.value) })}
            />
          </Field>
          <Field label={`Max DD ${(th.maxMdd * 100).toFixed(0)}%`}>
            <input
              type="range"
              min={0.08}
              max={0.45}
              step={0.01}
              value={th.maxMdd}
              onChange={(e) => setTh({ maxMdd: Number(e.target.value) })}
            />
          </Field>
          <Field label={`Max DDT ${th.maxDdt} bars`}>
            <input
              type="range"
              min={12}
              max={120}
              step={2}
              value={th.maxDdt}
              onChange={(e) => setTh({ maxDdt: Number(e.target.value) })}
            />
          </Field>
          <Field label={`Min WR ${(th.minWr * 100).toFixed(0)}%`}>
            <input
              type="range"
              min={0.3}
              max={0.7}
              step={0.01}
              value={th.minWr}
              onChange={(e) => setTh({ minWr: Number(e.target.value) })}
            />
          </Field>
          <Field label={`Min volume factor ${th.minVf.toFixed(2)}`}>
            <input
              type="range"
              min={1.05}
              max={1.4}
              step={0.01}
              value={th.minVf}
              onChange={(e) => setTh({ minVf: Number(e.target.value) })}
            />
          </Field>
        </div>
        <button
          type="button"
          className="mt-4 h-11 border border-border px-3 text-xs font-medium hover:bg-surface-muted sm:h-8"
          onClick={() => setTh({ ...DEFAULT_THRESHOLDS })}
        >
          Reset gates
        </button>
        <p className="mt-3 text-sm text-muted">
          {bd.both} of {bd.total} tracks pass both full-sample and last N under current gates.
        </p>
      </Panel>

      <Panel title={`Leaderboard · ${scope === "symbol" ? symbol : "desk"}`} padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-3xl text-left text-sm">
            <thead className="bg-bg text-xs font-medium uppercase tracking-wide text-subtle">
              <tr>
                <th className="px-4 py-2">Rank</th>
                <th className="px-2 py-2">Strategy</th>
                <th className="px-2 py-2">Setup</th>
                <th className="px-2 py-2">PF</th>
                <th className="px-2 py-2">Last N</th>
                <th className="px-2 py-2">WR</th>
                <th className="px-2 py-2">MDD</th>
                <th className="px-2 py-2">VF</th>
                <th className="px-2 py-2">DDT</th>
                <th className="px-2 py-2">Net</th>
                <th className="px-2 py-2">Gate</th>
              </tr>
            </thead>
            <tbody>
              {board.map((r, i) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-2 font-mono text-xs tabular">{i + 1}</td>
                  <td className="px-2 py-2">{r.strategyName}</td>
                  <td className="px-2 py-2 text-xs text-muted">
                    {r.tactic} · {r.rangeType} · {r.costStep}
                    {scope === "desk" ? ` · ${r.symbol}` : ""}
                  </td>
                  <td className="px-2 py-2 font-mono tabular">{fmtPf(r.pf)}</td>
                  <td className="px-2 py-2 font-mono tabular">{fmtPf(r.lastNPf)}</td>
                  <td className="px-2 py-2 font-mono tabular">{fmtWr(r.wr)}</td>
                  <td className="px-2 py-2 font-mono tabular">{fmtMdd(r.mdd)}</td>
                  <td className="px-2 py-2 font-mono tabular">{fmtNum(r.volumeFactor, 2)}</td>
                  <td className="px-2 py-2 font-mono tabular">{fmtNum(r.ddt, 0)}</td>
                  <td className={`px-2 py-2 font-mono tabular ${clsPnl(r.net)}`}>{fmtUsd(r.net, 0)}</td>
                  <td className="px-2 py-2">
                    {r.positive && r.lastNPositive ? (
                      <Pill tone="up">Pass</Pill>
                    ) : (
                      <Pill>Hold</Pill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
