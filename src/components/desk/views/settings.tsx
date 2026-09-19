import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import {
  BASE_EQUITY,
  bookStats,
  buildLanes,
  COST_STEPS,
  DEFAULT_THRESHOLDS,
  DESK,
  getBacktest,
  LAST_N_OPTIONS,
  LAST_N_STAGE_META,
  lastNEval,
  LANE_EVAL_NS,
  ORDER_TYPES,
  paramBounds,
  paramKey,
  posSliceStats,
  RANGE_META,
  RANGE_TYPES,
  REPLAY_RANGES,
  replayBarsFor,
  STAGE_HOURS,
  STAGE_META,
  STRATEGIES,
  STRATEGY_KINDS,
  TACTIC_META,
  TACTICS,
  UNIT_NOTIONAL,
  volumeCoord,
  WARMUP,
  orderTypesForVenue,
  strategyMatchesKinds,
} from "@/lib/desk/engine";
import { useDesk } from "@/lib/desk/store";
import type { LastNStage, OrderTypeId, RangeType, TacticKind } from "@/lib/desk/types";
import { MAX_LIVE_NOTIONAL } from "@/lib/desk/feed";
import {
  TICKS_PER_HOUR,
  VST_BATCH_SIZE,
  VST_MAX_POSITIONS,
  VST_MAX_SYMBOLS,
  VST_RATE_BURST,
  VST_RATE_PER_SEC,
  VST_RATE_WINDOW,
  VST_TICK_MS,
  exchangeAsPositions,
  liveDeskBook,
  positionsAsTrades,
} from "@/lib/desk/vst";
import { fmtUsd } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, fmtPf, fmtWr, LastNChips, Panel, Pill, Segmented, StatLine } from "../widgets";
import { LiveBookStrip } from "../live-book-strip";
import { SystemPanel } from "../system-panel";
import { usePreserveScroll } from "@/lib/desk/live-ctx";

const chip =
  "h-11 min-w-16 px-3 text-xs font-medium transition-colors duration-150 sm:h-8";
const chipOn = "bg-primary text-primary-fg";
const chipOff = "bg-surface-muted text-muted hover:text-fg";

const COST_SNAPS = [3, 6, 10, 15, 20, 25, 30] as const;

const SECTIONS = [
  { id: "system", label: "System" },
  { id: "last-n", label: "Last N pos" },
  { id: "stages", label: "Stages" },
  { id: "playbook", label: "Playbook" },
  { id: "gates", label: "Gates" },
  { id: "tactics", label: "Tactics" },
  { id: "block", label: "Block" },
  { id: "indicators", label: "Indicators" },
  { id: "universe", label: "Universe" },
  { id: "volume", label: "Volume" },
  { id: "combos", label: "Combos" },
  { id: "replay", label: "Replay" },
  { id: "execution", label: "Execution" },
] as const;

const LAST_N_PRESETS: { id: string; label: string; hint: string; values: Record<LastNStage, number> }[] = [
  {
    id: "linked-10",
    label: "Linked N10",
    hint: "One window on every stage",
    values: { picks: 10, lanes: 10, last: 10, ongoing: 10, next: 10, combos: 10 },
  },
  {
    id: "linked-15",
    label: "Linked N15",
    hint: "Stage-eval last-N window",
    values: { picks: 15, lanes: 15, last: 15, ongoing: 15, next: 15, combos: 15 },
  },
  {
    id: "linked-20",
    label: "Linked N20",
    hint: "Deeper shared window",
    values: { picks: 20, lanes: 20, last: 20, ongoing: 20, next: 20, combos: 20 },
  },
  {
    id: "few-pos",
    label: "Few last+next",
    hint: "Last 3 / next 3, rest N10",
    values: { picks: 10, lanes: 10, last: 3, ongoing: 10, next: 3, combos: 10 },
  },
  {
    id: "tight",
    label: "Tight N5",
    hint: "Short evals on every stage",
    values: { picks: 5, lanes: 5, last: 5, ongoing: 5, next: 5, combos: 5 },
  },
  {
    id: "deep-combos",
    label: "Deep combos",
    hint: "Combo N50, positions N10",
    values: { picks: 10, lanes: 10, last: 10, ongoing: 10, next: 10, combos: 50 },
  },
];

function RangeKnob({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  onCommit,
  ariaLabel,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (n: number) => string;
  onChange: (n: number) => void;
  onCommit?: () => void;
  ariaLabel: string;
}) {
  return (
    <Field label={`${label} ${format(value)}`}>
      <input
        aria-label={ariaLabel}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        className="h-11 sm:h-8"
      />
    </Field>
  );
}

export function SettingsView() {
  usePreserveScroll();
  const lastN = useDesk((s) => s.lastN);
  const lastNs = useDesk((s) => s.lastNs);
  const lastNLinked = useDesk((s) => s.lastNLinked);
  const setLastN = useDesk((s) => s.setLastN);
  const setLastNStage = useDesk((s) => s.setLastNStage);
  const setLastNLinked = useDesk((s) => s.setLastNLinked);
  const setLastNConfig = useDesk((s) => s.setLastNConfig);
  const applyLastNAll = useDesk((s) => s.applyLastNAll);
  const symbol = useDesk((s) => s.symbol);
  const setSymbol = useDesk((s) => s.setSymbol);
  const strategyId = useDesk((s) => s.strategyId);
  const setStrategy = useDesk((s) => s.setStrategy);
  const tactic = useDesk((s) => s.tactic);
  const setTactic = useDesk((s) => s.setTactic);
  const rangeType = useDesk((s) => s.rangeType);
  const setRangeType = useDesk((s) => s.setRangeType);
  const setCostStep = useDesk((s) => s.setCostStep);
  const cost = useDesk((s) => s.costStep);
  const cfg = useDesk((s) => s.tacticConfig);
  const setCfg = useDesk((s) => s.setTacticConfig);
  const applyLive = useDesk((s) => s.applyLiveConfig);
  const th = useDesk((s) => s.thresholds);
  const setTh = useDesk((s) => s.setThresholds);
  const symbolCount = useDesk((s) => s.symbolCount);
  const setSymbolCount = useDesk((s) => s.setSymbolCount);
  const orderType = useDesk((s) => s.orderType);
  const setOrderType = useDesk((s) => s.setOrderType);
  const enabledKinds = useDesk((s) => s.enabledKinds);
  const toggleKind = useDesk((s) => s.toggleKind);
  const comboOnly = useDesk((s) => s.comboOnlyPositive);
  const setComboOnly = useDesk((s) => s.setComboOnlyPositive);
  const comboTactic = useDesk((s) => s.comboTactic);
  const setComboTactic = useDesk((s) => s.setComboTactic);
  const comboRange = useDesk((s) => s.comboRange);
  const setComboRange = useDesk((s) => s.setComboRange);
  const replaySpeed = useDesk((s) => s.replaySpeed);
  const setReplaySpeed = useDesk((s) => s.setReplaySpeed);
  const replayIndex = useDesk((s) => s.replayIndex);
  const setReplayIndex = useDesk((s) => s.setReplayIndex);
  const replayPlaying = useDesk((s) => s.replayPlaying);
  const setReplayPlaying = useDesk((s) => s.setReplayPlaying);
  const replayRangeId = useDesk((s) => s.replayRangeId);
  const setReplayRangeId = useDesk((s) => s.setReplayRangeId);
  const liveTape = useDesk((s) => s.liveTape);
  const setLiveTape = useDesk((s) => s.setLiveTape);
  const resetSettings = useDesk((s) => s.resetSettings);
  const connections = useDesk((s) => s.connections);
  const params = useDesk((s) => s.strategyParams);
  const setParam = useDesk((s) => s.setStrategyParam);
  const resetParams = useDesk((s) => s.resetStrategyParams);
  const phase = useDesk((s) => s.vst.phase);
  const settingsRev = useDesk((s) => s.settingsRev);
  const settingsSource = useDesk((s) => s.settingsSource);
  const evalHours = useDesk((s) => s.evalHours);
  const evalLastNs = useDesk((s) => s.evalLastNs);
  const setEvalHours = useDesk((s) => s.setEvalHours);
  const setEvalLastNs = useDesk((s) => s.setEvalLastNs);
  const hedgeMode = useDesk((s) => s.hedgeMode);
  const marginMode = useDesk((s) => s.marginMode);
  const useMaxLeverage = useDesk((s) => s.useMaxLeverage);
  const leverage = useDesk((s) => s.leverage);
  const minSizeRatio = useDesk((s) => s.minSizeRatio);
  const setLiveExec = useDesk((s) => s.setLiveExec);
  const runStageEval = useDesk((s) => s.runStageEval);
  const stageEval = useDesk((s) => s.stageEval);
  const blockCfg = useDesk((s) => s.blockConfig);
  const setBlockCfg = useDesk((s) => s.setBlockConfig);
  const exchange = useDesk((s) => s.exchange);
  const activeConnId = useDesk((s) => s.activeConnId);
  const venueTypes = orderTypesForVenue(connections[0]?.venue ?? "bingx", connections[0]?.orderTypesEnabled);

  const playbooks = DESK.strategies.filter((s) => strategyMatchesKinds(s, enabledKinds));
  const active = STRATEGIES.find((s) => s.id === strategyId) ?? STRATEGIES[0]!;
  const dirty = Object.keys(params).some((k) => k.startsWith(active.id + ":"));
  const candles = DESK.candles[symbol] ?? [];
  const replayHours = REPLAY_RANGES.find((r) => r.id === replayRangeId)?.hours ?? 48;
  const replayMax = Math.max(0, replayBarsFor(replayHours) - 1);

  const live = useMemo(() => {
    const bt = getBacktest(strategyId, symbol);
    const picks = lastNEval(bt, lastNs.picks);
    const bookLive = liveDeskBook(useDesk.getState().vst, activeConnId, lastNs.last);
    const exPos = exchangeAsPositions(exchange);
    const closedAll = bookLive.last;
    const openAll = exPos.length ? exPos : bookLive.ongoing;
    const nextAll = bookLive.ongoing.slice(0, lastNs.next);
    const lastSlice = closedAll.slice(-lastNs.last);
    const ongoingSlice = openAll.slice(-lastNs.ongoing);
    const nextSlice = nextAll.slice(-lastNs.next);
    const last = posSliceStats(lastSlice);
    const ongoing = posSliceStats(ongoingSlice);
    const next = posSliceStats(nextSlice);
    const lanes = buildLanes(lastNs.lanes, cfg, th, symbol, enabledKinds);
    const book = bookStats(lastNs.lanes, cfg, th, symbol, enabledKinds);
    const vol = volumeCoord(bookLive.last.length ? positionsAsTrades(bookLive.last) : bt.trades.slice(-lastNs.picks));
    return {
      picks,
      last,
      ongoing,
      next,
      closedAll,
      openAll,
      nextAll,
      lastSlice,
      ongoingSlice,
      nextSlice,
      lanes,
      book,
      vol,
    };
  }, [strategyId, symbol, lastNs, cfg, th, enabledKinds, activeConnId, exchange]);

  const stageLive: Record<LastNStage, { count: string; extra: string }> = {
    picks: { count: `${live.picks.trades} trades`, extra: `PF ${fmtPf(live.picks.pf)} · WR ${fmtWr(live.picks.wr)}` },
    lanes: {
      count: `${live.lanes.filter((l) => l.status === "validated").length} val`,
      extra: `${live.lanes.filter((l) => l.status === "candidate").length} cand · ${live.lanes.filter((l) => l.status === "rejected").length} rej`,
    },
    last: {
      count: `${live.last.n} of ${live.closedAll.length} closed`,
      extra: `PF ${fmtPf(live.last.pf)} · net ${fmtUsd(live.last.net)}`,
    },
    ongoing: {
      count: `${live.ongoing.n} of ${live.openAll.length} open`,
      extra: `PF ${fmtPf(live.ongoing.pf)} · ${fmtUsd(live.ongoing.net)}`,
    },
    next: {
      count: `${live.nextSlice.length} of ${live.nextAll.length} next`,
      extra: `bias ${fmtUsd(live.next.net)}`,
    },
    combos: {
      count: `${live.book.positiveCombos.toLocaleString()} pos`,
      extra: `${live.book.totalCombos.toLocaleString()} tracks`,
    },
  };

  const pickStage = (stage: LastNStage, n: number) => {
    if (lastNLinked) setLastN(n as typeof lastN);
    else setLastNStage(stage, n as typeof lastN);
  };

  const pickTactic = (t: TacticKind) => {
    setTactic(t);
    applyLive();
  };
  const pickRange = (r: RangeType) => {
    setRangeType(r);
    applyLive();
  };

  const presetActive = LAST_N_PRESETS.find((p) =>
    LAST_N_STAGE_META.every((st) => lastNs[st.id] === p.values[st.id]),
  );

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-subtle">Desk</p>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Every gate, window and execution value. Changes sync to the engine, all views, and the
            live VST session — last-N can share one N or split by stage.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Pill tone="up">synced · {settingsSource} · rev {settingsRev}</Pill>
          <Button size="sm" variant="secondary" className="h-11 sm:h-8" onClick={applyLive}>
            Apply to engine
          </Button>
          <Button size="sm" variant="secondary" className="h-11 sm:h-8" onClick={resetSettings}>
            Reset defaults
          </Button>
        </div>
      </div>

      <LiveBookStrip />

      <nav className="flex flex-wrap gap-1" aria-label="Settings sections">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="inline-flex h-11 items-center bg-surface-muted px-3 text-xs font-medium text-muted hover:text-fg sm:h-8"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            {s.label}
          </a>
        ))}
      </nav>

      <div id="system" className="scroll-mt-24">
        <SystemPanel
          combos={{ total: live.book.totalCombos, positive: live.book.positiveCombos }}
          lanes={{
            validated: live.lanes.filter((l) => l.status === "validated").length,
            candidates: live.lanes.filter((l) => l.status === "candidate").length,
          }}
        />
      </div>

      <Panel title="Desk values">
        <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-3 xl:grid-cols-4">
          <StatLine k="Settings sync" v={`${settingsSource} · rev ${settingsRev}`} />
          <StatLine k="Engine" v={phase} />
          <StatLine k="Strategy" v={active.name} />
          <StatLine k="Tactic" v={TACTIC_META[tactic].label} />
          <StatLine k="Range" v={RANGE_META[rangeType].label} />
          <StatLine k="Cost step" v={`${cost} · unit 0.1% eq`} />
          <StatLine k="Symbol" v={symbol} />
          <StatLine k="Symbol count" v={`${symbolCount} / ${VST_MAX_SYMBOLS}`} />
          <StatLine k="Order type" v={ORDER_TYPES.find((o) => o.id === orderType)?.label ?? orderType} />
          <StatLine k="Last N" v={lastNLinked ? `linked N${lastN}` : "independent"} />
          <StatLine k="Picks N" v={`N${lastNs.picks}`} />
          <StatLine k="Lane pos N" v={`N${lastNs.lanes}`} />
          <StatLine k="Last pos N" v={`N${lastNs.last}`} />
          <StatLine k="Ongoing pos N" v={`N${lastNs.ongoing}`} />
          <StatLine k="Next pos N" v={`N${lastNs.next}`} />
          <StatLine k="Combo N" v={`N${lastNs.combos}`} />
          <StatLine k="Min PF" v={th.minPf.toFixed(2)} />
          <StatLine k="Max DD" v={`${(th.maxMdd * 100).toFixed(0)}%`} />
          <StatLine k="Min WR" v={`${(th.minWr * 100).toFixed(0)}%`} />
          <StatLine k="Min VF" v={th.minVf.toFixed(2)} />
          <StatLine k="Max DDT" v={`${th.maxDdt} bars`} />
          <StatLine k="Trailing" v={`${cfg.trailingPct.toFixed(1)}%`} />
          <StatLine k="DCA" v={`${cfg.dcaCount} × ${cfg.dcaDrawdown.toFixed(1)}`} />
          <StatLine k="Axis" v={`${cfg.axisLevels} × ${cfg.axisSpacing.toFixed(1)}`} />
          <StatLine k="Stop ATR" v={`${cfg.slAtr.toFixed(2)} · TP/SL ${cfg.tpRatio.toFixed(2)}R`} />
          <StatLine k="Tape" v={liveTape ? "BingX live" : "Synthetic"} />
          <StatLine k="Types on" v={enabledKinds.map((k) => STRATEGY_KINDS.find((x) => x.id === k)?.label ?? k).join(" · ")} />
          <StatLine k="Combo filter" v={`${comboOnly ? "positive" : "all"} · ${comboTactic} · ${comboRange}`} />
          <StatLine k="Replay" v={`${replaySpeed}× · bar ${replayIndex}`} />
        </div>
      </Panel>

      <div id="last-n" className="scroll-mt-24">
        <Panel
          title="Last N pos evals"
          action={
            <Button size="sm" variant={lastNLinked ? "primary" : "secondary"} className="h-11 sm:h-8" onClick={() => setLastNLinked(!lastNLinked)}>
              {lastNLinked ? "Stages linked" : "Stages independent"}
            </Button>
          }
        >
          <p className="text-sm text-muted">
            {lastNLinked
              ? `One window (N${lastN}) for every stage. Unlink to set picks, lanes, last, ongoing, next and combos apart.`
              : "Each stage has its own closed-position window for evals and coordination. Header Last N still drives picks."}
          </p>

          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-subtle">Presets</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {LAST_N_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  title={p.hint}
                  aria-pressed={presetActive?.id === p.id}
                  onClick={() => setLastNConfig(p.values)}
                  className={`${chip} ${presetActive?.id === p.id ? chipOn : chipOff}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {lastNLinked ? (
            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-subtle">Shared window</p>
              <div className="mt-2">
                <LastNChips name="Shared last N" value={lastN} onChange={(n) => applyLastNAll(n)} />
              </div>
            </div>
          ) : null}

          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {LAST_N_STAGE_META.map((st) => {
              const liveRow = stageLive[st.id];
              return (
                <div key={st.id} className="min-w-0 border border-border bg-bg px-3 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold">{st.label}</p>
                    <span className="font-mono text-xs tabular text-muted">N{lastNs[st.id]}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">{st.blurb}</p>
                  <p className="mt-1 text-xs text-subtle">{st.usedFor}</p>
                  <div className="mt-2 font-mono text-xs tabular">
                    <span className="text-fg">{liveRow.count}</span>
                    <span className="text-muted"> · {liveRow.extra}</span>
                  </div>
                  <div className="mt-2">
                    <LastNChips name={st.label} value={lastNs[st.id]} onChange={(n) => pickStage(st.id, n)} />
                  </div>
                  {!lastNLinked ? (
                    <button
                      type="button"
                      className="mt-2 text-xs font-medium text-primary hover:underline"
                      onClick={() => applyLastNAll(lastNs[st.id] as typeof lastN)}
                    >
                      Apply N{lastNs[st.id]} to all stages
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>

          <p className="mt-4 text-xs text-muted">
            Last / ongoing / next slices feed coordination on{" "}
            <Link to="/positions" className="font-medium text-primary hover:underline">
              Positions
            </Link>
            . Picks rank{" "}
            <Link to="/strategies" className="font-medium text-primary hover:underline">
              Strategies
            </Link>
            . Lane windows drive{" "}
            <Link to="/lanes" className="font-medium text-primary hover:underline">
              Lanes
            </Link>
            . Combo N feeds{" "}
            <Link to="/performance" className="font-medium text-primary hover:underline">
              Performance
            </Link>
            .
          </p>
        </Panel>
      </div>

      <div id="stages" className="scroll-mt-24">
        <Panel
          title="Auto-eval stages"
          action={
            <Button size="sm" className="h-11 sm:h-8" onClick={() => runStageEval()}>
              Run stages
            </Button>
          }
        >
          <p className="text-sm text-muted">
            Pre-historic full compute at {STAGE_HOURS.join("/")}h. Independent coordinations per tactic, range,
            kind and last-N. End-stage PF average uses only active valid (effective) lanes. Passing end
            mirrors those symbols to the live book.
          </p>
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-subtle">Historic hours</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {STAGE_HOURS.map((h) => {
                const on = evalHours.includes(h);
                return (
                  <button
                    key={h}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setEvalHours(on ? evalHours.filter((x) => x !== h) : [...evalHours, h])
                    }
                    className={`${chip} ${on ? chipOn : chipOff}`}
                  >
                    {STAGE_META.find((s) => s.hours === h)?.label ?? h} {h}h
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-subtle">Lane last-N evals</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {LANE_EVAL_NS.map((n) => {
                const on = evalLastNs.includes(n);
                return (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setEvalLastNs(on ? evalLastNs.filter((x) => x !== n) : [...evalLastNs, n])
                    }
                    className={`${chip} ${on ? chipOn : chipOff}`}
                  >
                    N{n}
                  </button>
                );
              })}
            </div>
          </div>
          {stageEval ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {stageEval.stages.map((s) => (
                <Pill key={s.id} tone={s.ok ? "up" : "down"}>
                  {s.id} {s.hours}h · PF {s.pf.toFixed(2)}
                  {s.id === "end" ? ` · avg ${s.pfAvg?.toFixed(2) ?? "—"} · ${s.effective} eff` : ""}
                </Pill>
              ))}
              <Pill tone={stageEval.mirrored ? "up" : "neutral"}>
                {stageEval.mirrored ? "Mirrored live" : "Not mirrored"}
              </Pill>
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted">Run stages to compute pre / mid / end and last-N 5/10/15 tracks.</p>
          )}
        </Panel>
      </div>

      <div id="playbook" className="scroll-mt-24">
        <Panel title="Playbook">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Symbol">
              <select
                aria-label="Symbol"
                className="h-11 border border-border bg-surface px-2 text-sm sm:h-8"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
              >
                {DESK.symbols.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.base} · {s.id}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Strategy">
              <select
                aria-label="Strategy"
                className="h-11 border border-border bg-surface px-2 text-sm sm:h-8"
                value={strategyId}
                onChange={(e) => setStrategy(e.target.value)}
              >
                {playbooks.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`Cost step ${cost} · ${COST_STEPS[0]}–${COST_STEPS[COST_STEPS.length - 1]}`}>
              <input
                aria-label="Position cost step"
                type="range"
                min={COST_STEPS[0]}
                max={COST_STEPS[COST_STEPS.length - 1]}
                value={cost}
                onChange={(e) => setCostStep(Number(e.target.value))}
                className="h-11 sm:h-8"
              />
            </Field>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-xs font-medium text-muted">Cost snaps</span>
              <div className="flex flex-wrap gap-1">
                {COST_SNAPS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={cost === n}
                    onClick={() => setCostStep(n)}
                    className={`${chip} min-w-11 ${cost === n ? chipOn : chipOff}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-subtle">Tactic · live</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {TACTICS.filter((t) => t !== "dca").map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={tactic === t}
                    title={TACTIC_META[t].blurb}
                    onClick={() => pickTactic(t)}
                    className={`${chip} ${tactic === t ? chipOn : chipOff}`}
                  >
                    {TACTIC_META[t].label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">{TACTIC_META[tactic].blurb}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-subtle">Range type · {RANGE_TYPES.length}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {RANGE_TYPES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={rangeType === r}
                    title={RANGE_META[r].blurb}
                    onClick={() => pickRange(r)}
                    className={`${chip} ${rangeType === r ? chipOn : chipOff}`}
                  >
                    {RANGE_META[r].label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">{RANGE_META[rangeType].blurb}</p>
            </div>
          </div>
        </Panel>
      </div>

      <div id="gates" className="scroll-mt-24">
        <Panel
          title="Gates"
          action={
            <button
              type="button"
              className="h-11 border border-border px-3 text-xs font-medium hover:bg-surface-muted sm:h-8"
              onClick={() => setTh({ ...DEFAULT_THRESHOLDS })}
            >
              Reset gates
            </button>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <RangeKnob
              label="Min PF"
              value={th.minPf}
              min={1.5}
              max={3}
              step={0.05}
              format={(n) => n.toFixed(2)}
              onChange={(n) => setTh({ minPf: n })}
              ariaLabel="Minimum profit factor"
            />
            <RangeKnob
              label="Max DD"
              value={th.maxMdd}
              min={0.08}
              max={0.45}
              step={0.01}
              format={(n) => `${(n * 100).toFixed(0)}%`}
              onChange={(n) => setTh({ maxMdd: n })}
              ariaLabel="Maximum drawdown"
            />
            <RangeKnob
              label="Min WR"
              value={th.minWr}
              min={0.3}
              max={0.7}
              step={0.01}
              format={(n) => `${(n * 100).toFixed(0)}%`}
              onChange={(n) => setTh({ minWr: n })}
              ariaLabel="Minimum win rate"
            />
            <RangeKnob
              label="Min volume factor"
              value={th.minVf}
              min={1.05}
              max={1.4}
              step={0.01}
              format={(n) => n.toFixed(2)}
              onChange={(n) => setTh({ minVf: n })}
              ariaLabel="Minimum volume factor"
            />
            <RangeKnob
              label="Max DDT"
              value={th.maxDdt}
              min={8}
              max={36}
              step={1}
              format={(n) => `${n} bars`}
              onChange={(n) => setTh({ maxDdt: n })}
              ariaLabel="Maximal drawdown time"
            />
          </div>
          <p className="mt-3 text-xs text-muted">
            A lane or combo is positive only if PF, MDD, WR, volume factor (≥ 1.05 hard floor) and
            drawdown time all clear these gates. All cost × range × tactic × trail combinations are
            processed; Use best applies the top track. Position unit is 0.1% of equity.
          </p>
        </Panel>
      </div>

      <div id="tactics" className="scroll-mt-24">
        <Panel title="Tactic knobs">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <RangeKnob
              label="Trailing"
              value={cfg.trailingPct}
              min={0.6}
              max={4}
              step={0.1}
              format={(n) => `${n.toFixed(1)}%`}
              onChange={(n) => setCfg({ trailingPct: n })}
              onCommit={applyLive}
              ariaLabel="Trailing percent"
            />
            <RangeKnob
              label="TP / SL ratio"
              value={cfg.tpRatio}
              min={0.25}
              max={3}
              step={0.25}
              format={(n) => `${n.toFixed(2)}R`}
              onChange={(n) => setCfg({ tpRatio: n })}
              onCommit={applyLive}
              ariaLabel="Take-profit to stop-loss ratio"
            />
            <RangeKnob
              label="DCA count"
              value={cfg.dcaCount}
              min={2}
              max={8}
              step={1}
              format={(n) => String(n)}
              onChange={(n) => setCfg({ dcaCount: n })}
              onCommit={applyLive}
              ariaLabel="DCA count"
            />
            <RangeKnob
              label="DCA drawdown"
              value={cfg.dcaDrawdown}
              min={0.4}
              max={2.4}
              step={0.1}
              format={(n) => n.toFixed(1)}
              onChange={(n) => setCfg({ dcaDrawdown: n })}
              onCommit={applyLive}
              ariaLabel="DCA drawdown"
            />
            <RangeKnob
              label="Axis levels"
              value={cfg.axisLevels}
              min={2}
              max={8}
              step={1}
              format={(n) => String(n)}
              onChange={(n) => setCfg({ axisLevels: n })}
              onCommit={applyLive}
              ariaLabel="Axis levels"
            />
            <RangeKnob
              label="Axis spacing"
              value={cfg.axisSpacing}
              min={0.3}
              max={2}
              step={0.1}
              format={(n) => n.toFixed(1)}
              onChange={(n) => setCfg({ axisSpacing: n })}
              onCommit={applyLive}
              ariaLabel="Axis spacing"
            />
            <RangeKnob
              label={`Stop ATR · TP/SL ${cfg.tpRatio.toFixed(2)}R`}
              value={cfg.slAtr}
              min={0.25}
              max={1.2}
              step={0.05}
              format={(n) => n.toFixed(2)}
              onChange={(n) => setCfg({ slAtr: n })}
              onCommit={applyLive}
              ariaLabel="Stop ATR multiple"
            />
            <RangeKnob
              label="Max hold (bars)"
              value={cfg.maxHoldBars ?? 3}
              min={1}
              max={8}
              step={1}
              format={(n) => `${n} bar`}
              onChange={(n) => setCfg({ maxHoldBars: n })}
              onCommit={applyLive}
              ariaLabel="Max hold bars"
            />
            <RangeKnob
              label="Max hold (ticks)"
              value={cfg.maxHoldTicks ?? 16}
              min={4}
              max={40}
              step={1}
              format={(n) => `${n} min`}
              onChange={(n) => setCfg({ maxHoldTicks: n })}
              onCommit={applyLive}
              ariaLabel="Max hold ticks"
            />
          </div>
          <p className="mt-3 text-xs text-muted">
            Take-profit / stop-loss ratios 0.25–3.00 step 0.25 are all processed. Live uses the selected
            ratio (default 2.75R). Short-range holds default 3 bars / 16 ticks. Trailing, DCA and axis combine in Hybrid.
          </p>
        </Panel>
      </div>

      <div id="block" className="scroll-mt-24">
        <Panel title="Block strategy · overall active orders">
          <p className="text-sm text-muted">
            Stack uses counts <strong>1–2</strong>. Windows use last-N <strong>1,2,3,4,5,6</strong> (step 1)
            independently. <strong>Overall Block</strong> adds volume additively on every winning position,
            independent of lanes, indications, and strategies. Live last-N (default 12) disables
            non-performing configs/types from live results. Order ids, partials, and blockQty are tracked.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={blockCfg.enabled ? "primary" : "secondary"}
              className="h-11 sm:h-8"
              onClick={() => setBlockCfg({ enabled: !blockCfg.enabled })}
            >
              {blockCfg.enabled ? "Block on" : "Block off"}
            </Button>
            <Button
              size="sm"
              variant={blockCfg.stack !== false ? "primary" : "secondary"}
              className="h-11 sm:h-8"
              onClick={() => setBlockCfg({ stack: !(blockCfg.stack !== false) })}
            >
              {blockCfg.stack !== false ? "Stack 1–2" : "Stack off"}
            </Button>
            <Button
              size="sm"
              variant={blockCfg.windows !== false ? "primary" : "secondary"}
              className="h-11 sm:h-8"
              onClick={() => setBlockCfg({ windows: !(blockCfg.windows !== false) })}
            >
              {blockCfg.windows !== false ? "Windows 1–6" : "Windows off"}
            </Button>
            <Button
              size="sm"
              variant={blockCfg.endStageOnly ? "primary" : "secondary"}
              className="h-11 sm:h-8"
              onClick={() => setBlockCfg({ endStageOnly: !blockCfg.endStageOnly })}
            >
              {blockCfg.endStageOnly ? "End stage only" : "Live cadence"}
            </Button>
            <Button
              size="sm"
              variant={blockCfg.flattenConflict ? "primary" : "secondary"}
              className="h-11 sm:h-8"
              onClick={() => setBlockCfg({ flattenConflict: !blockCfg.flattenConflict })}
            >
              Flatten conflict
            </Button>
            <Button
              size="sm"
              variant={blockCfg.addOnWin ? "primary" : "secondary"}
              className="h-11 sm:h-8"
              onClick={() => setBlockCfg({ addOnWin: !blockCfg.addOnWin })}
            >
              Add on win
            </Button>
            <Button
              size="sm"
              variant={blockCfg.overall !== false ? "primary" : "secondary"}
              className="h-11 sm:h-8"
              onClick={() => setBlockCfg({ overall: !(blockCfg.overall !== false) })}
            >
              {blockCfg.overall !== false ? "Overall book" : "Per lane"}
            </Button>
            <Button
              size="sm"
              variant={blockCfg.activeLive !== false ? "primary" : "secondary"}
              className="h-11 sm:h-8"
              onClick={() => setBlockCfg({ activeLive: !(blockCfg.activeLive !== false) })}
            >
              {blockCfg.activeLive !== false ? "Active live" : "Active off"}
            </Button>
            <Button
              size="sm"
              variant={blockCfg.autoEval !== false ? "primary" : "secondary"}
              className="h-11 sm:h-8"
              onClick={() => setBlockCfg({ autoEval: !(blockCfg.autoEval !== false) })}
            >
              {blockCfg.autoEval !== false ? "Auto eval 2h" : "Auto eval off"}
            </Button>
            <Button
              size="sm"
              variant={blockCfg.relAdditive !== false ? "primary" : "secondary"}
              className="h-11 sm:h-8"
              onClick={() => setBlockCfg({ relAdditive: !(blockCfg.relAdditive !== false) })}
            >
              {blockCfg.relAdditive !== false ? "Rel vol additive" : "Rel vol off"}
            </Button>
            <Button
              size="sm"
              variant={blockCfg.liveDisable !== false ? "primary" : "secondary"}
              className="h-11 sm:h-8"
              onClick={() => setBlockCfg({ liveDisable: !(blockCfg.liveDisable !== false) })}
            >
              {blockCfg.liveDisable !== false ? "Live last-N disable" : "Live disable off"}
            </Button>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <RangeKnob
              label="Max block multiple"
              value={blockCfg.maxMultiple}
              min={1}
              max={16}
              step={1}
              format={(n) => String(n)}
              onChange={(n) => setBlockCfg({ maxMultiple: n })}
              ariaLabel="Max block multiple"
            />
            <RangeKnob
              label="Min block multiple"
              value={blockCfg.minMultiple}
              min={1}
              max={12}
              step={1}
              format={(n) => String(n)}
              onChange={(n) => setBlockCfg({ minMultiple: n })}
              ariaLabel="Min block multiple"
            />
            <RangeKnob
              label="Volume ratio"
              value={blockCfg.volumeRatio ?? 0.4}
              min={0.1}
              max={2.5}
              step={0.05}
              format={(n) => n.toFixed(2)}
              onChange={(n) => setBlockCfg({ volumeRatio: n })}
              ariaLabel="Block volume ratio"
            />
            <RangeKnob
              label="Relation vol ratio"
              value={blockCfg.relVolumeRatio ?? 0.4}
              min={0.1}
              max={2}
              step={0.05}
              format={(n) => n.toFixed(2)}
              onChange={(n) => setBlockCfg({ relVolumeRatio: n })}
              ariaLabel="Relation additive volume ratio"
            />
            <RangeKnob
              label="Live last N"
              value={blockCfg.liveLastN ?? 12}
              min={4}
              max={40}
              step={1}
              format={(n) => String(n)}
              onChange={(n) => setBlockCfg({ liveLastN: n })}
              ariaLabel="Live last N disable"
            />
            <RangeKnob
              label="Live disable min PF"
              value={blockCfg.liveDisableMinPf ?? 2}
              min={0.5}
              max={2}
              step={0.05}
              format={(n) => n.toFixed(2)}
              onChange={(n) => setBlockCfg({ liveDisableMinPf: n })}
              ariaLabel="Live disable min PF"
            />
            <RangeKnob
              label="Eval hours"
              value={blockCfg.evalHours ?? 2}
              min={1}
              max={12}
              step={1}
              format={(n) => `${n}h`}
              onChange={(n) => setBlockCfg({ evalHours: n })}
              ariaLabel="Block relation eval hours"
            />
            <RangeKnob
              label="Min relation PF"
              value={blockCfg.minRelPf ?? 2}
              min={1}
              max={3}
              step={0.05}
              format={(n) => n.toFixed(2)}
              onChange={(n) => setBlockCfg({ minRelPf: n })}
              ariaLabel="Min relation PF"
            />
            <RangeKnob
              label="PF ratio"
              value={blockCfg.pfRatio ?? 1.45}
              min={1.25}
              max={3}
              step={0.05}
              format={(n) => n.toFixed(2)}
              onChange={(n) => setBlockCfg({ pfRatio: n })}
              ariaLabel="Block PF ratio"
            />
            <RangeKnob
              label="Eval last N"
              value={blockCfg.evalPosCount ?? 6}
              min={1}
              max={6}
              step={1}
              format={(n) => String(n)}
              onChange={(n) => setBlockCfg({ evalPosCount: n })}
              ariaLabel="Block eval last N"
            />
            <RangeKnob
              label="Cadence"
              value={blockCfg.cadence}
              min={4}
              max={40}
              step={1}
              format={(n) => `${n} ticks`}
              onChange={(n) => setBlockCfg({ cadence: n })}
              ariaLabel="Block cadence"
            />
          </div>
          {stageEval?.blockAdjust ? (
            <p className="mt-3 text-xs text-muted">
              Last end-stage: {stageEval.blockAdjust.blocks} blocks · cancelled {stageEval.blockAdjust.cancelled} ·
              added {stageEval.blockAdjust.added} · flattened {stageEval.blockAdjust.flattened}
            </p>
          ) : null}
        </Panel>
      </div>

      <div id="indicators" className="scroll-mt-24">
        <Panel
          title={`Indicator stack · ${active.name}`}
          action={
            dirty ? (
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline"
                onClick={() => resetParams(active.id)}
              >
                Reset stack
              </button>
            ) : (
              <Pill>{active.kind === "normal" ? "Normal · no type adj" : active.kind}</Pill>
            )
          }
        >
          <p className="mb-3 text-sm text-muted">{active.thesis}</p>
          <ul className="divide-y divide-border">
            {active.indicators.map((ind) => (
              <li key={ind.label} className="py-3">
                <div className="text-sm font-medium">{ind.label}</div>
                <div className="text-xs uppercase tracking-wide text-subtle">{ind.id}</div>
                {Object.keys(ind.params).length === 0 ? (
                  <p className="mt-2 text-xs text-muted">Session default — no knobs</p>
                ) : (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {Object.entries(ind.params).map(([k, def]) => {
                      const key = paramKey(active.id, ind.label, k);
                      const bounds = paramBounds(k, def);
                      const value = params[key] ?? def;
                      return (
                        <RangeKnob
                          key={key}
                          label={k}
                          value={value}
                          min={bounds.min}
                          max={bounds.max}
                          step={bounds.step}
                          format={(n) => n.toFixed(bounds.step < 1 ? 1 : 0)}
                          onChange={(n) => setParam(key, n)}
                          ariaLabel={`${ind.label} ${k}`}
                        />
                      );
                    })}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div id="universe" className="scroll-mt-24">
        <Panel title="Universe">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <RangeKnob
              label="Symbol count"
              value={symbolCount}
              min={8}
              max={VST_MAX_SYMBOLS}
              step={1}
              format={(n) => String(n)}
              onChange={(n) => setSymbolCount(n)}
              ariaLabel="Symbol count"
            />
            <Field label="Order type">
              <select
                aria-label="Order type"
                className="h-11 border border-border bg-surface px-2 text-sm sm:h-8"
                value={orderType}
                onChange={(e) => {
                  setOrderType(e.target.value as OrderTypeId);
                  applyLive();
                }}
              >
                {(venueTypes.length ? venueTypes : ORDER_TYPES).map((ot) => (
                  <option key={ot.id} value={ot.id}>
                    {ot.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-xs font-medium text-muted">BingX tape</span>
              <Segmented
                value={liveTape ? "on" : "off"}
                onChange={(v) => setLiveTape(v === "on")}
                options={[
                  { id: "on", label: "Live tape" },
                  { id: "off", label: "Synthetic" },
                ]}
              />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-subtle">Strategy types · Normal first</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {STRATEGY_KINDS.map((k) => {
                const on = enabledKinds.includes(k.id);
                return (
                  <button
                    key={k.id}
                    type="button"
                    aria-pressed={on}
                    title={k.blurb}
                    onClick={() => toggleKind(k.id)}
                    className={on ? `${chip} ${chipOn}` : `${chip} ${chipOff}`}
                  >
                    {k.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted">
              Normal is general configs and lanes with no type adjustment. {STRATEGIES.length} playbooks total ·{" "}
              {playbooks.length} enabled.
            </p>
          </div>
        </Panel>
      </div>

      <div id="volume" className="scroll-mt-24">
        <Panel title="Volume coordination">
          <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-3 xl:grid-cols-4">
            <StatLine k="Window" v={`last ${lastNs.picks} picks`} />
            <StatLine k="Volume factor" v={live.vol.vf.toFixed(2)} />
            <StatLine k="Confirm" v={live.vol.confirm} />
            <StatLine k="High-vol WR" v={fmtWr(live.vol.highVolWr)} />
            <StatLine k="Low-vol WR" v={fmtWr(live.vol.lowVolWr)} />
            <StatLine k="High-vol net" v={fmtUsd(live.vol.highVolNet)} />
            <StatLine k="Low-vol net" v={fmtUsd(live.vol.lowVolNet)} />
            <StatLine k="Gate min VF" v={th.minVf.toFixed(2)} />
          </div>
          <p className="mt-3 text-sm text-muted">{live.vol.reason}</p>
        </Panel>
      </div>

      <div id="combos" className="scroll-mt-24">
        <Panel title="Combination filter">
          <div className="flex flex-wrap gap-3">
            <Segmented
              value={comboOnly ? "pos" : "all"}
              onChange={(v) => setComboOnly(v === "pos")}
              options={[
                { id: "pos", label: "Positive only" },
                { id: "all", label: "All tracks" },
              ]}
            />
            <Segmented
              value={comboTactic}
              onChange={(v) => setComboTactic(v as TacticKind | "all")}
              options={[{ id: "all", label: "All tactics" }, ...TACTICS.filter((t) => t !== "dca").map((t) => ({ id: t, label: TACTIC_META[t].label }))]}
            />
            <Segmented
              value={comboRange}
              onChange={(v) => setComboRange(v as RangeType | "all")}
              options={[{ id: "all", label: "All ranges" }, ...RANGE_TYPES.map((r) => ({ id: r, label: RANGE_META[r].label }))]}
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-6 sm:grid-cols-4">
            <StatLine k="Tracks" v={live.book.totalCombos.toLocaleString()} />
            <StatLine k="Positive" v={live.book.positiveCombos.toLocaleString()} />
            <StatLine k="Validated lanes" v={String(live.book.validated)} />
            <StatLine k="Combo last N" v={`N${lastNs.combos}`} />
          </div>
        </Panel>
      </div>

      <div id="replay" className="scroll-mt-24">
        <Panel title="Replay">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="flex min-w-0 flex-col gap-1 sm:col-span-2 xl:col-span-3">
              <span className="text-xs font-medium text-muted">Time range</span>
              <Segmented
                value={replayRangeId}
                onChange={(v) => setReplayRangeId(v as typeof replayRangeId)}
                options={REPLAY_RANGES.map((r) => ({ id: r.id, label: r.label }))}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-xs font-medium text-muted">Speed</span>
              <Segmented
                value={String(replaySpeed)}
                onChange={(v) => setReplaySpeed(Number(v) as 1 | 2 | 4)}
                options={[
                  { id: "1", label: "1×" },
                  { id: "2", label: "2×" },
                  { id: "4", label: "4×" },
                ]}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-xs font-medium text-muted">Transport</span>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" className="h-11 sm:h-8" variant={replayPlaying ? "secondary" : "primary"} onClick={() => setReplayPlaying(!replayPlaying)}>
                  {replayPlaying ? "Pause replay" : "Play replay"}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-11 sm:h-8"
                  onClick={() => {
                    setReplayPlaying(false);
                    setReplayIndex(WARMUP);
                  }}
                >
                  Rewind
                </Button>
              </div>
            </div>
            <RangeKnob
              label="Bar"
              value={replayIndex}
              min={WARMUP}
              max={replayMax}
              step={1}
              format={(n) => `${n} / ${replayMax}`}
              onChange={(n) => {
                setReplayPlaying(false);
                setReplayIndex(n);
              }}
              ariaLabel="Replay bar"
            />
          </div>
          <p className="mt-3 text-xs text-muted">
            {REPLAY_RANGES.find((r) => r.id === replayRangeId)?.hours ?? 48}h · 15m bars · warmup {WARMUP} · opens on{" "}
            <Link to="/replay" className="font-medium text-primary hover:underline">
              Replay
            </Link>
            .
          </p>
        </Panel>
      </div>

      <div id="execution" className="scroll-mt-24">
        <Panel title="Execution and caps">
          <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-3 xl:grid-cols-4">
            <StatLine k="Max symbols" v={String(VST_MAX_SYMBOLS)} />
            <StatLine k="Max position legs" v={String(VST_MAX_POSITIONS)} />
            <StatLine k="Position slots" v={`${symbolCount * 2} (L+S)`} />
            <StatLine k="Orders" v="Unlimited" />
            <StatLine k="Batch size" v={String(VST_BATCH_SIZE)} />
            <StatLine k="Rate" v={`${VST_RATE_PER_SEC}/s burst ${VST_RATE_BURST}`} />
            <StatLine k="Rate window" v={String(VST_RATE_WINDOW)} />
            <StatLine k="Tick" v={`${VST_TICK_MS} ms · ${TICKS_PER_HOUR}/h`} />
            <StatLine k="TP / SL" v={`${cfg.tpRatio.toFixed(2)}R · 0.25–3.00`} />
            <StatLine k="Live notional cap" v={fmtUsd(MAX_LIVE_NOTIONAL, 0)} />
            <StatLine k="Min size ratio" v={`${minSizeRatio.toFixed(2)}×`} />
            <StatLine k="Margin" v={marginMode} />
            <StatLine k="Position mode" v={hedgeMode ? "hedge L+S" : "one-way"} />
            <StatLine k="Leverage" v={useMaxLeverage ? "max / contract" : `${leverage}x`} />
            <StatLine k="Research unit base" v={fmtUsd(BASE_EQUITY, 0)} />
            <StatLine k="Unit notional" v={fmtUsd(UNIT_NOTIONAL, 0)} />
            <StatLine k="Cost steps" v={`${COST_STEPS.length} (${COST_STEPS[0]}–${COST_STEPS[COST_STEPS.length - 1]})`} />
            <StatLine k="Range types" v={String(RANGE_TYPES.length)} />
            <StatLine k="Tactics" v={String(TACTICS.length)} />
            <StatLine k="Last N options" v={LAST_N_OPTIONS.map((n) => `N${n}`).join(" ")} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Pill tone="accent">{VST_MAX_SYMBOLS} symbols max</Pill>
            <Pill>{VST_MAX_POSITIONS} position legs</Pill>
            <Pill>Unlimited orders</Pill>
            <Pill>TP/SL 0.25–3.00 step 0.25</Pill>
            <Pill>Slots = symbol + direction</Pill>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Margin">
              <Segmented
                value={marginMode}
                onChange={(v) => setLiveExec({ marginMode: v as "cross" | "isolated" })}
                options={[
                  { id: "cross", label: "Cross" },
                  { id: "isolated", label: "Isolated" },
                ]}
              />
            </Field>
            <Field label="Position mode">
              <Segmented
                value={hedgeMode ? "hedge" : "oneway"}
                onChange={(v) => setLiveExec({ hedgeMode: v === "hedge" })}
                options={[
                  { id: "hedge", label: "Hedge L+S" },
                  { id: "oneway", label: "One-way" },
                ]}
              />
            </Field>
            <Field label="Leverage">
              <Segmented
                value={useMaxLeverage ? "max" : "fixed"}
                onChange={(v) => setLiveExec({ useMaxLeverage: v === "max" })}
                options={[
                  { id: "max", label: "Max" },
                  { id: "fixed", label: "Fixed" },
                ]}
              />
            </Field>
            <Field label={useMaxLeverage ? "Max per contract" : "Fixed leverage"}>
              <input
                aria-label="Leverage"
                type="number"
                min={1}
                max={150}
                disabled={useMaxLeverage}
                className="h-10 border border-border bg-surface px-3 text-sm"
                value={leverage}
                onChange={(e) => setLiveExec({ leverage: Number(e.target.value) })}
              />
            </Field>
            <Field label="Min size ratio">
              <input
                aria-label="Min size ratio"
                type="number"
                min={1}
                max={2}
                step={0.01}
                className="h-10 border border-border bg-surface px-3 text-sm"
                value={minSizeRatio}
                onChange={(e) => setLiveExec({ minSizeRatio: Number(e.target.value) })}
              />
            </Field>
          </div>
          <p className="mt-3 text-sm text-muted">
            Entries always lift to the exchange min quantity / min USDT. Cross + hedge (both directions) and max leverage are applied on the live BingX account.
          </p>
        </Panel>
      </div>
    </div>
  );
}
