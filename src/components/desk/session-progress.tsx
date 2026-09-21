import { Link } from "@tanstack/react-router";
import { Pause, Play, RotateCcw, Square } from "lucide-react";
import {
  COST_STEPS,
  DESK,
  LAST_N_OPTIONS,
  LAST_N_STAGE_META,
  LAST_N_PROGRESS_META,
  ORDER_TYPES,
  RANGE_META,
  RANGE_TYPES,
  STRATEGIES,
  STRATEGY_KINDS,
  TACTIC_META,
  TACTICS,
  orderTypesForVenue,
  strategyMatchesKinds,
} from "@/lib/desk/engine";
import { useDesk } from "@/lib/desk/store";
import { useLiveSnapshot } from "@/lib/desk/live-ctx";
import {
  TICKS_PER_HOUR,
  VST_MAX_POSITIONS,
  VST_MAX_SYMBOLS,
  VST_RATE_WINDOW,
  VST_TICK_MS,
  bookCounts,
  formatTickClock,
  systemSnapshot,
} from "@/lib/desk/vst";
import type { EnginePhase, OrderTypeId, RangeType, TacticKind } from "@/lib/desk/types";
import { cn, fmtUsd, fmtEquity } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { fmtMdd, fmtPf, fmtWr, Meter, Panel, pfTone, Pill, StatLine } from "./widgets";

const PHASE_TONE: Record<EnginePhase, "up" | "down" | "accent" | "warn"> = {
  running: "up",
  paused: "warn",
  stopped: "down",
  idle: "accent",
};

function formatElapsed(tick: number) {
  return formatTickClock(tick);
}

const chip =
  "h-11 min-w-16 px-3 text-xs font-medium transition-colors duration-150 sm:h-8";
const chipOn = "bg-primary text-primary-fg";
const chipOff = "bg-surface-muted text-muted hover:text-fg";

export function SessionProgress({
  book,
}: {
  book: { validated: number; candidates: number; totalCombos: number; positiveCombos: number };
}) {
  const enginePhase = useDesk((s) => s.vst.phase);
  const running = useDesk((s) => s.vst.running);
  const tick = useDesk((s) => s.vst.tick);
  const st = useDesk((s) => s.vst.stats);
  const ledger = useDesk((s) => s.vst.ledger);
  const msg = useDesk((s) => s.vst.lastMsg);
  const liveElapsed = useDesk((s) => s.liveElapsed);
  const liveSnap = useLiveSnapshot();
  const phase: EnginePhase = liveSnap.hasLive && liveSnap.pingOk ? "running" : enginePhase;
  const feed = useDesk((s) => s.feed);
  const connections = useDesk((s) => s.connections);
  const activeConnId = useDesk((s) => s.activeConnId);
  const strategyId = useDesk((s) => s.strategyId);
  const tactic = useDesk((s) => s.tactic);
  const rangeType = useDesk((s) => s.rangeType);
  const costStep = useDesk((s) => s.costStep);
  const lastN = useDesk((s) => s.lastN);
  const lastNs = useDesk((s) => s.lastNs);
  const lastNLinked = useDesk((s) => s.lastNLinked);
  const cfg = useDesk((s) => s.tacticConfig);
  const th = useDesk((s) => s.thresholds);
  const setTactic = useDesk((s) => s.setTactic);
  const setRangeType = useDesk((s) => s.setRangeType);
  const setStrategy = useDesk((s) => s.setStrategy);
  const setLastN = useDesk((s) => s.setLastN);
  const setCostStep = useDesk((s) => s.setCostStep);
  const setTacticConfig = useDesk((s) => s.setTacticConfig);
  const startEngine = useDesk((s) => s.startEngine);
  const pauseEngine = useDesk((s) => s.pauseEngine);
  const stopEngine = useDesk((s) => s.stopEngine);
  const resetSession = useDesk((s) => s.resetSession);
  const applyLiveConfig = useDesk((s) => s.applyLiveConfig);
  const setTh = useDesk((s) => s.setThresholds);
  const symbolCount = useDesk((s) => s.symbolCount);
  const setSymbolCount = useDesk((s) => s.setSymbolCount);
  const orderType = useDesk((s) => s.orderType);
  const setOrderType = useDesk((s) => s.setOrderType);
  const enabledKinds = useDesk((s) => s.enabledKinds);
  const toggleKind = useDesk((s) => s.toggleKind);

  const tape = bookCounts(useDesk.getState().vst);
  const sys = systemSnapshot(useDesk.getState().vst, {
    combos: { total: book.totalCombos, positive: book.positiveCombos },
    feed,
    connections,
  });
  const occupiedN = liveSnap.hasLive
    ? liveSnap.occupied
    : tape.positions.symbols;
  const rateUsed = connections.reduce((a, c) => a + c.rateLimitUsed, 0);
  const rateMax = connections.reduce((a, c) => a + c.rateLimitMax, 0) || VST_RATE_WINDOW;
  const orderTypesOn = new Set(connections.flatMap((c) => c.orderTypesEnabled)).size;
  const venueTypes = orderTypesForVenue(connections[0]?.venue ?? "bingx", connections[0]?.orderTypesEnabled);
  const hourTick = liveSnap.hasLive
    ? Math.min(TICKS_PER_HOUR, Math.round(((Number(liveElapsed || liveSnap.elapsedMin) || 0) % 60) * (TICKS_PER_HOUR / 60)))
    : tick % TICKS_PER_HOUR;
  const hourPct = Math.round((hourTick / TICKS_PER_HOUR) * 100);
  const liveRunning = liveSnap.hasLive && (String(liveSnap.session?.phase ?? liveSnap.session?.sessionPhase ?? "running") !== "paused") && String(liveSnap.session?.phase ?? "") !== "stopped";
  const shownPhase = liveSnap.hasLive ? (liveRunning ? "running" : String(liveSnap.session?.phase ?? "running")) : phase;
  const canPause = (running && phase === "running") || liveRunning;
  const canStop = phase === "running" || phase === "paused" || liveSnap.hasLive;
  const startLabel = phase === "paused" || String(liveSnap.session?.phase ?? "") === "paused" ? "Resume" : "Start";

  const pickRange = (r: RangeType) => {
    setRangeType(r);
    applyLiveConfig();
  };
  const pickTactic = (t: TacticKind) => {
    setTactic(t);
    applyLiveConfig();
  };

  return (
    <Panel
      title="Session progress"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={PHASE_TONE[liveSnap.hasLive ? (liveRunning ? "running" : "paused") : phase]}>{liveSnap.hasLive ? (liveRunning ? "live" : shownPhase) : phase}</Pill>
          <Pill tone={liveSnap.pingOk || feed.state === "live" ? "up" : feed.state === "error" ? "down" : "accent"}>
            {liveSnap.hasLive ? liveSnap.venueLabel : `tape ${feed.state}`}
          </Pill>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Button size="sm" className="h-11 sm:h-8" onClick={startEngine} aria-label={startLabel}>
          <Play className="size-4" />
          {startLabel}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="h-11 sm:h-8"
          disabled={!canPause}
          onClick={pauseEngine}
          aria-label="Pause"
        >
          <Pause className="size-4" />
          Pause
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="h-11 sm:h-8"
          disabled={!canStop}
          onClick={stopEngine}
          aria-label="Stop"
        >
          <Square className="size-4" />
          Stop
        </Button>
        <Button size="sm" variant="ghost" className="h-11 sm:h-8" onClick={resetSession} aria-label="Reset">
          <RotateCcw className="size-4" />
          Reset
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted">
        Stop / Reset / Rearm cancel only {activeConnId} orders and positions. Other exchange sessions stay.
      </p>
      {liveSnap.hasLive && Array.isArray(liveSnap.session?.adjustments) && (liveSnap.session?.adjustments as string[]).length ? (
        <p className="mt-2 font-mono text-[11px] text-muted">
          {(liveSnap.session?.adjustments as string[]).slice(-3).join(" · ")}
        </p>
      ) : null}
      {liveSnap.lastMsg ? <p className="mt-1 text-xs text-muted">{liveSnap.lastMsg}</p> : null}

      <div className="mt-4">
        <Meter
          label="Session hour"
          value={hourTick}
          max={TICKS_PER_HOUR}
          hint={
            liveSnap.hasLive
              ? `${hourPct}% · ${Number(liveElapsed || liveSnap.elapsedMin || 0).toFixed(1)} min · ${liveSnap.livePos} pos`
              : `${hourPct}% · tick ${tick} · ${formatElapsed(tick)}`
          }
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Meter
          label="Positions"
          value={liveSnap.hasLive ? liveSnap.livePos : tape.positions.slots}
          max={tape.positions.maxSlots}
          hint={
            liveSnap.hasLive
              ? `${liveSnap.livePos} BingX · ${liveSnap.occupied} occupied`
              : `${tape.positions.slots}/${tape.positions.maxSlots} · ${tape.positions.long}L ${tape.positions.short}S`
          }
        />
        <Meter
          label="Orders"
          value={liveSnap.hasLive ? liveSnap.liveOrd : tape.orders.live}
          max={Math.max(liveSnap.hasLive ? liveSnap.liveOrd : tape.orders.placed, tape.orders.live, 1)}
          hint={
            liveSnap.hasLive
              ? `${liveSnap.liveOrd} open · SL ${liveSnap.liveSl} TP ${liveSnap.liveTp}`
              : `${tape.orders.queued}q ${tape.orders.open}o ${tape.orders.partial}p · ${tape.orders.filled}f ${tape.orders.cancelled}x ${tape.orders.rejected}r`
          }
        />
        <Meter
          label="Occupied symbols"
          value={occupiedN}
          max={symbolCount}
          hint={`${occupiedN}/${liveSnap.hasLive ? (Number(liveSnap.session?.symbols) || symbolCount) : symbolCount}`}
        />
        <Meter
          label="Positive combos"
          value={book.positiveCombos}
          max={Math.max(book.totalCombos, 1)}
          hint={`${book.positiveCombos.toLocaleString()}/${book.totalCombos.toLocaleString()}`}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {sys.loads
          .filter((row) => ["queue", "rate", "legs", "batch"].includes(row.id))
          .map((row) => {
            if (liveSnap.hasLive && row.id === "legs") {
              const n = liveSnap.livePos;
              return (
                <Meter
                  key={row.id}
                  label="Position legs"
                  value={n}
                  max={VST_MAX_POSITIONS}
                  hint={`${n}/${VST_MAX_POSITIONS} · ${liveSnap.liveLong}L ${liveSnap.liveShort}S`}
                />
              );
            }
            return <Meter key={row.id} label={row.label} value={row.value} max={row.max} hint={row.hint} />;
          })}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 sm:grid-cols-4 xl:grid-cols-8">
        <StatLine k="Equity" v={fmtEquity(liveSnap.hasLive ? liveSnap.equity : st.equity)} tone={(liveSnap.hasLive ? liveSnap.net : st.net) >= 0 ? "up" : "down"} />
        <StatLine k="Live PF" v={fmtPf(liveSnap.hasLive ? liveSnap.pf : st.pf)} tone={pfTone(liveSnap.hasLive ? liveSnap.pf : st.pf)} />
        <StatLine k="Net" v={fmtUsd(liveSnap.hasLive ? liveSnap.net : st.net)} tone={(liveSnap.hasLive ? liveSnap.net : st.net) >= 0 ? "up" : "down"} />
        <StatLine k="Win rate" v={fmtWr(liveSnap.hasLive ? liveSnap.wr : st.wr)} />
        <StatLine k="Max DD" v={fmtMdd(liveSnap.hasLive ? liveSnap.mdd : st.mdd)} />
        <StatLine k="Vol factor" v={th.minVf.toFixed(2)} />
        <StatLine k="Max DDT" v={`${th.maxDdt}`} />
        <StatLine k="SL / TP" v={`${liveSnap.hasLive ? liveSnap.liveSl : ledger.slExits} / ${liveSnap.hasLive ? liveSnap.liveTp : ledger.tpExits}`} />
        <StatLine k="Rate" v={`${Math.round((rateUsed / rateMax) * 100)}%`} />
        <StatLine k="Lanes" v={`${book.validated} val · ${book.candidates} cand`} />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-subtle">Strategy</span>
          <select
            aria-label="Strategy"
            className="h-11 border border-border bg-surface px-2 text-sm sm:h-8"
            value={strategyId}
            onChange={(e) => setStrategy(e.target.value)}
          >
            {DESK.strategies
              .filter((s) => strategyMatchesKinds(s, enabledKinds))
              .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-subtle">Last N</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {LAST_N_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={lastN === n}
                onClick={() => setLastN(n)}
                className={cn(chip, lastN === n ? chipOn : chipOff)}
              >
                N{n}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            {lastNLinked ? (
              <>Linked · all stages N{lastN}</>
            ) : (
              LAST_N_STAGE_META.map((s, i) => (
                <span key={s.id}>
                  {i ? " · " : null}
                  {s.label} N{lastNs[s.id]}
                </span>
              ))
            )}{" "}
            <Link to="/settings" className="font-medium text-primary hover:underline">
              Settings
            </Link>
          </p>
          <p className="mt-1 text-xs text-muted">
            Progress {LAST_N_PROGRESS_META.map((s) => `${s.label} N${s.n}`).join(" · ")}. Real counted and Live
            exchange run from coordinated Valid windows, types and combinations.
          </p>
        </div>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-subtle">
            Cost step {costStep} · {COST_STEPS[0]}–{COST_STEPS[COST_STEPS.length - 1]}
          </span>
          <input
            aria-label="Position cost step"
            type="range"
            min={COST_STEPS[0]}
            max={COST_STEPS[COST_STEPS.length - 1]}
            value={costStep}
            onChange={(e) => setCostStep(Number(e.target.value))}
            className="h-11 sm:h-8"
          />
        </label>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-subtle">
            Range type · {RANGE_TYPES.length}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {RANGE_TYPES.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={rangeType === r}
                title={RANGE_META[r].blurb}
                onClick={() => pickRange(r)}
                className={cn(chip, rangeType === r ? chipOn : chipOff)}
              >
                {RANGE_META[r].label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-subtle">
            Tactic · live
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {TACTICS.filter((t) => t !== "dca").map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tactic === t}
                title={TACTIC_META[t].blurb}
                onClick={() => pickTactic(t)}
                className={cn(chip, tactic === t ? chipOn : chipOff)}
              >
                {TACTIC_META[t].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium text-muted">Axis levels {cfg.axisLevels}</span>
          <input
            aria-label="Axis levels"
            type="range"
            min={2}
            max={8}
            step={1}
            value={cfg.axisLevels}
            onChange={(e) => {
              setTacticConfig({ axisLevels: Number(e.target.value) });
            }}
            onPointerUp={() => applyLiveConfig()}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium text-muted">Axis spacing {cfg.axisSpacing.toFixed(1)}</span>
          <input
            aria-label="Axis spacing"
            type="range"
            min={0.3}
            max={2}
            step={0.1}
            value={cfg.axisSpacing}
            onChange={(e) => {
              setTacticConfig({ axisSpacing: Number(e.target.value) });
            }}
            onPointerUp={() => applyLiveConfig()}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium text-muted">DCA off</span>
          <input aria-label="DCA disabled" type="range" min={1} max={1} value={1} disabled />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium text-muted">
            Trail {cfg.trailingPct.toFixed(1)}% · SL {cfg.slAtr.toFixed(2)} ATR
          </span>
          <input
            aria-label="Trailing percent"
            type="range"
            min={0.6}
            max={4}
            step={0.1}
            value={cfg.trailingPct}
            onChange={(e) => {
              setTacticConfig({ trailingPct: Number(e.target.value) });
            }}
            onPointerUp={() => applyLiveConfig()}
          />
        </label>
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-subtle">
          Strategy types · Normal first
        </p>
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
                className={cn(chip, on ? chipOn : chipOff)}
              >
                {k.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">
          Normal runs general configs and lanes without strategy-type adjustment. Other types add their
          own playbooks.
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium text-muted">Overall PF {th.minPf.toFixed(2)}</span>
          <input
            aria-label="Overall profit factor"
            type="range"
            min={1.1}
            max={3}
            step={0.05}
            value={th.minPf}
            onChange={(e) => setTh({ minPf: Number(e.target.value) })}
            className="h-11 sm:h-8"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium text-muted">Axis PF {(th.axisPf ?? 1.15).toFixed(2)}</span>
          <input
            aria-label="Axis profit factor"
            type="range"
            min={1.1}
            max={3}
            step={0.05}
            value={th.axisPf ?? 1.15}
            onChange={(e) => setTh({ axisPf: Number(e.target.value) })}
            className="h-11 sm:h-8"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium text-muted">Block PF {(th.blockPf ?? 1.2).toFixed(2)}</span>
          <input
            aria-label="Block profit factor"
            type="range"
            min={1.1}
            max={3}
            step={0.05}
            value={th.blockPf ?? 1.2}
            onChange={(e) => setTh({ blockPf: Number(e.target.value) })}
            className="h-11 sm:h-8"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium text-muted">Volume factor {th.minVf.toFixed(2)}</span>
          <input
            aria-label="Minimum volume factor"
            type="range"
            min={1.05}
            max={1.4}
            step={0.01}
            value={th.minVf}
            onChange={(e) => setTh({ minVf: Number(e.target.value) })}
            className="h-11 sm:h-8"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium text-muted">Max DDT {th.maxDdt} bars</span>
          <input
            aria-label="Maximal drawdown time"
            type="range"
            min={8}
            max={36}
            step={1}
            value={th.maxDdt}
            onChange={(e) => setTh({ maxDdt: Number(e.target.value) })}
            className="h-11 sm:h-8"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium text-muted">
            Symbol count {symbolCount}
          </span>
          <input
            aria-label="Symbol count"
            type="range"
            min={8}
            max={VST_MAX_SYMBOLS}
            step={1}
            value={symbolCount}
            onChange={(e) => setSymbolCount(Number(e.target.value))}
            className="h-11 sm:h-8"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-subtle">Order type</span>
          <select
            aria-label="Order type"
            className="h-11 border border-border bg-surface px-2 text-sm sm:h-8"
            value={orderType}
            onChange={(e) => {
              setOrderType(e.target.value as OrderTypeId);
              applyLiveConfig();
            }}
          >
            {(venueTypes.length ? venueTypes : ORDER_TYPES).map((ot) => (
              <option key={ot.id} value={ot.id}>
                {ot.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-subtle">Counts</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Pill tone="accent">{STRATEGIES.length} strategies</Pill>
          <Pill>{enabledKinds.length} types on</Pill>
          <Pill>{COST_STEPS.length} cost steps</Pill>
          <Pill>{RANGE_TYPES.length} range types</Pill>
          <Pill>{TACTICS.length} tactics</Pill>
          <Pill>
            {orderTypesOn}/{ORDER_TYPES.length} order types
          </Pill>
          <Pill>
            {symbolCount}/{VST_MAX_SYMBOLS} symbols
          </Pill>
          <Pill>{connections.length} BingX sessions</Pill>
          <Pill>
            {liveSnap.hasLive
              ? `${liveSnap.occupied}/${symbolCount} occupied · ${liveSnap.liveLong}L/${liveSnap.liveShort}S`
              : `${tape.positions.slots}/${tape.positions.maxSlots} pos slots · ${tape.positions.long}L/${tape.positions.short}S`}
          </Pill>
          <Pill>
            {liveSnap.hasLive ? liveSnap.livePos : tape.positions.legs}/{VST_MAX_POSITIONS} legs
          </Pill>
          <Pill>
            {liveSnap.hasLive
              ? `${liveSnap.liveOrd} orders · SL ${liveSnap.liveSl} TP ${liveSnap.liveTp}`
              : `${tape.orders.placed} orders · ${tape.orders.live} live · ${tape.orders.filled} filled · ${tape.orders.cancelled} x · ${tape.orders.rejected} rej`}
          </Pill>
          <Pill>
            {st.trades} closed · {st.partials} partial
          </Pill>
          <Pill>
            TP/SL {cfg.tpRatio.toFixed(2)}R · PF {th.minPf}/{th.axisPf ?? 1.15}/{th.blockPf ?? 1.2} · VF≥{th.minVf} · DDT≤{th.maxDdt}
          </Pill>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">{msg}</p>
    </Panel>
  );
}
