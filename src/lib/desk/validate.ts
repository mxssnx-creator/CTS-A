import type {
  AutoValidateResult,
  AxisPick,
  BlockConfig,
  ClosedTrade,
  CoordValidate,
  HorizonMark,
  KindValidate,
  LaneEvalTrack,
  LastNEvalRow,
  RangeType,
  StageEval,
  StageEvalBundle,
  StrategyKind,
  TacticConfig,
  TacticKind,
  Thresholds,
} from "./types.ts";
import {
  DEFAULT_BLOCK_CONFIG,
  DEFAULT_TACTIC_CONFIG,
  DEFAULT_THRESHOLDS,
  LANE_EVAL_NS,
  RANGE_TYPES,
  SL_ATR_RATIOS,
  STAGE_HOURS,
  STRATEGY_KINDS,
  SYMBOLS,
  TACTICS,
  TP_SL_RATIOS,
  TRAIL_PCTS,
  combosFiltered,
  getBacktest,
  isPositive,
  lastNEval,
  pickBestCombo,
  snapSlAtr,
  snapTpRatio,
  profitFactor,
  strategiesForKinds,
} from "./engine.ts";
import { adjustActiveBlocks, completeConfigSampleKey, simulateHours } from "./vst.ts";

export const HIST_HOURS = [2, 4, 8, 16, 32] as const;
export const DAYS_HOURS = 72;
export const VALIDATE_MARKS = [...HIST_HOURS, DAYS_HOURS];

const VALIDATE_TACTICS: TacticKind[] = ["trailing", "axis", "hybrid"];
const VALIDATE_SL = SL_ATR_RATIOS.filter((n) => [0.8, 0.9, 1.0, 1.25, 1.4, 1.6].includes(n));
const SWEEP_SYMBOLS = 8;
const SWEEP_ORDER: "limit" = "limit";

export function historicSim(
  cfg: TacticConfig,
  tactic: TacticKind,
  rangeType: RangeType,
  hours = DAYS_HOURS,
) {
  return simulateHours(hours, cfg, tactic, {
    symbolCount: SWEEP_SYMBOLS,
    orderType: SWEEP_ORDER,
    rangeType,
    marks: VALIDATE_MARKS.filter((h) => h <= hours),
  });
}

function axisScore(marks: HorizonMark[]): { ok: boolean; score: number } {
  if (!marks.length) return { ok: false, score: -1e6 };
  const day = marks.find((m) => m.hours === DAYS_HOURS) ?? marks[marks.length - 1]!;
  const core = marks.filter((m) => m.hours >= 16);
  const hist = marks.filter((m) => m.hours < 16);
  const coreOk = core.length ? core.every((m) => m.ok) : day.ok;
  const ok = Boolean(day.ok && coreOk);
  const score =
    marks.reduce((s, m) => s + m.score * (m.hours >= 32 ? 1.45 : m.hours >= 16 ? 1.2 : 0.6), 0) +
    (ok ? 24 : -12) +
    hist.filter((m) => m.ok).length * 2;
  return { ok, score };
}

function runAxis<T extends string | number>(
  axis: string,
  value: T,
  label: string,
  cfg: TacticConfig,
  tactic: TacticKind,
  rangeType: RangeType,
): AxisPick<T> {
  const { report } = historicSim(cfg, tactic, rangeType);
  const marks = report.marks ?? [];
  const { ok, score } = axisScore(marks);
  return { axis, value, label, score, ok, marks };
}

function bestPick<T extends string | number>(rows: AxisPick<T>[], fallback: T): AxisPick<T> {
  const passing = rows.filter((r) => r.ok);
  const pool = passing.length ? passing : rows;
  return [...pool].sort((a, b) => b.score - a.score)[0] ?? rows[0] ?? {
    axis: "none",
    value: fallback,
    label: String(fallback),
    score: -1,
    ok: false,
    marks: [],
  };
}

export function validateKindsIndependent(
  lastN: number,
  cfg: TacticConfig,
  th: Thresholds,
): KindValidate[] {
  return STRATEGY_KINDS.map((k) => {
    const rows = combosFiltered({
      lastN,
      cfg,
      th,
      tactic: "all",
      rangeType: "all",
      onlyPositive: false,
      enabledKinds: [k.id],
      trails: [cfg.trailingPct],
      tpRatios: [cfg.tpRatio],
      keepBest: true,
    });
    const pass = rows.filter((r) => r.positive && r.lastNPositive);
    const best = pickBestCombo(pass.length ? pass : rows);
    return {
      kind: k.id,
      total: rows.length,
      pass: pass.length,
      ok: pass.length > 0 && (best?.pf ?? 0) >= th.minPf * 0.9,
      bestPf: best?.pf ?? 0,
    };
  });
}

export function autoValidateConfigs(opts?: {
  lastN?: number;
  th?: Thresholds;
  base?: TacticConfig;
}): AutoValidateResult {
  const th = opts?.th ?? DEFAULT_THRESHOLDS;
  const base: TacticConfig = {
    ...DEFAULT_TACTIC_CONFIG,
    ...opts?.base,
    slAtr: snapSlAtr(opts?.base?.slAtr ?? DEFAULT_TACTIC_CONFIG.slAtr),
    tpRatio: snapTpRatio(opts?.base?.tpRatio ?? DEFAULT_TACTIC_CONFIG.tpRatio),
  };
  const lastN = opts?.lastN ?? 10;

  const tacticRows = VALIDATE_TACTICS.map((t) => runAxis("tactic", t, t, base, t, "atr"));
  const tacticPick = bestPick(tacticRows, "hybrid");

  const rangeRows = RANGE_TYPES.map((r) => runAxis("range", r, r, base, tacticPick.value, r));
  const rangePick = bestPick(rangeRows, "atr");

  const trailRows = TRAIL_PCTS.map((p) =>
    runAxis("trail", p, `${p.toFixed(1)}%`, { ...base, trailingPct: p }, tacticPick.value, rangePick.value),
  );
  const trailPick = bestPick(trailRows, base.trailingPct);

  const slRows = VALIDATE_SL.map((s) =>
    runAxis("slAtr", s, `${s.toFixed(1)} ATR`, { ...base, trailingPct: trailPick.value, slAtr: s }, tacticPick.value, rangePick.value),
  );
  const slPick = bestPick(slRows, base.slAtr);

  const ratioRows = TP_SL_RATIOS.map((r) =>
    runAxis(
      "tpRatio",
      r,
      `${r.toFixed(2)}R`,
      { ...base, trailingPct: trailPick.value, slAtr: slPick.value, tpRatio: r },
      tacticPick.value,
      rangePick.value,
    ),
  );
  const ratioPick = bestPick(ratioRows, base.tpRatio);

  const cfg: TacticConfig = {
    ...base,
    trailingPct: trailPick.value,
    slAtr: snapSlAtr(slPick.value),
    tpRatio: snapTpRatio(ratioPick.value),
    dcaCount: 1,
  };
  const kinds = validateKindsIndependent(lastN, cfg, th);
  const enabledKinds: StrategyKind[] = kinds.filter((k) => k.ok).map((k) => k.kind);
  if (!enabledKinds.includes("normal")) enabledKinds.unshift("normal");

  const confirmSim = historicSim(cfg, tacticPick.value, rangePick.value, DAYS_HOURS);
  const confirm = confirmSim.report.marks ?? [];
  const confirmOk = axisScore(confirm).ok && confirmSim.report.pf >= Math.min(th.minPf, 1.2);

  return {
    hours: DAYS_HOURS,
    histHours: [...HIST_HOURS],
    picks: {
      tactic: tacticPick,
      rangeType: rangePick,
      trailPct: trailPick,
      slAtr: slPick,
      tpRatio: ratioPick,
    },
    kinds,
    enabledKinds,
    cfg,
    tactic: tacticPick.value,
    rangeType: rangePick.value,
    confirm,
    confirmOk,
    confirmReport: confirmSim.report,
    applied: false,
    at: Date.now(),
  };
}

function pfClosed(closed: ClosedTrade[], n: number): LastNEvalRow {
  const xs = closed.slice(0, Math.max(1, n));
  const trades = xs.length;
  const values = xs.map((c) => {
    if (c.ratio !== undefined) return Number.isFinite(c.ratio) ? c.ratio : NaN;
    const notional = c.entry * c.qty;
    return Number.isFinite(c.pnl) && Number.isFinite(notional) && notional > 0 ? c.pnl / notional : NaN;
  });
  const unknown = values.filter((value) => !Number.isFinite(value)).length;
  const wins = values.filter((value) => value > 0);
  const profit = wins.reduce((sum, value) => sum + value, 0);
  const loss = Math.abs(values.filter((value) => value < 0).reduce((sum, value) => sum + value, 0));
  const net = unknown ? NaN : values.reduce((sum, value) => sum + value, 0);
  const pf = profitFactor(profit, loss);
  const wr = unknown ? NaN : trades ? wins.length / trades : 0;
  return {
    n,
    pf: unknown ? 0 : Number.isFinite(pf) ? pf : 0,
    wr,
    net,
    trades,
    ok: !unknown && pf >= 1 && net > 0 && trades >= n,
    ...(unknown ? { unknown } : {}),
  };
}

export function trackLaneEvals(
  th: Thresholds,
  kinds: readonly StrategyKind[] = STRATEGY_KINDS.map((k) => k.id),
  lastNs: readonly number[] = LANE_EVAL_NS,
): LaneEvalTrack[] {
  const playbooks = strategiesForKinds(kinds);
  const tracks: LaneEvalTrack[] = [];
  const now = Date.now();
  for (const st of playbooks) {
    for (const sym of SYMBOLS) {
      const bt = getBacktest(st.id, sym.id);
      const ns: LastNEvalRow[] = lastNs.map((n) => {
        const s = lastNEval(bt, n);
        return {
          n,
          pf: s.pf,
          wr: s.wr,
          net: s.net,
          trades: s.trades,
          ok: s.trades >= n && s.net > 0 && (isPositive(s, th) || (s.pf >= th.minPf * 0.92 && s.volumeFactor >= th.minVf)),
        };
      });
      const end = ns.find((r) => r.n === (lastNs[lastNs.length - 1] ?? 15)) ?? ns[ns.length - 1];
      const passing = ns.filter((r) => r.ok).length;
      const fullOk = isPositive(bt.stats, th) || bt.stats.pf >= th.minPf;
      for (const tactic of TACTICS) {
        tracks.push({
          laneId: `${st.id}:${sym.id}:${tactic}`,
          strategyId: st.id,
          symbol: sym.id,
          tactic,
          kind: st.kind,
          ns,
          evidence: "source-model",
          effective: Boolean(fullOk && end?.ok && passing >= Math.max(2, lastNs.length - 1)),
          lastAt: now,
        });
      }
    }
  }
  return tracks;
}

export function liveLastNEvals(closed: ClosedTrade[], lastNs: readonly number[] = LANE_EVAL_NS, minPf = 1): LastNEvalRow[] {
  return lastNs.map((n) => {
    const row = pfClosed(closed, n);
    return { ...row, ok: row.ok && row.pf >= minPf };
  });
}

export function overlayLiveTracks(
  tracks: LaneEvalTrack[],
  closed: ClosedTrade[],
  minPf: number,
): LaneEvalTrack[] {
  const byLane = new Map<string, ClosedTrade[]>();
  for (const c of closed) {
    if (!c.strategyId || !c.tactic || !c.kind || c.validExec !== true || c.protect || c.examFlat) continue;
    const executionKey = completeConfigSampleKey(c);
    if (!executionKey) continue;
    const key = JSON.stringify([c.strategyId, executionKey]);
    const arr = byLane.get(key);
    if (arr) arr.push(c);
    else byLane.set(key, [c]);
  }
  return tracks.map((t) => {
    const laneNs = t.ns.map((row) => row.n);
    const need = Math.max(1, ...laneNs);
    if (!t.executionKey) return t;
    const xs = byLane.get(JSON.stringify([t.strategyId, t.executionKey]));
    if (!xs || xs.length < need) return t;
    const ns = laneNs.map((n) => {
      const row = pfClosed(xs, n);
      return { ...row, ok: row.ok && row.pf >= minPf };
    });
    const end = ns[ns.length - 1];
    const passing = ns.filter((r) => r.ok).length;
    return {
      ...t,
      ns,
      evidence: "settled-identity",
      effective: t.effective && Boolean(end?.ok) && passing >= Math.min(laneNs.length, Math.max(2, laneNs.length - 1)),
      lastAt: Date.now(),
    };
  });
}

/** Keep every requested horizon; missing marks are not replaced by another period. */
export function stageMarkers(
  hours: readonly number[],
  marks: readonly HorizonMark[],
  end: { samples: number; pf: number; minPf: number; effective: number; valid: number },
): StageEval[] {
  const ordered = [...new Set(hours.filter((hour) => Number.isFinite(hour) && hour > 0))].sort((a, b) => a - b);
  return ordered.map((hour, index) => {
    const mark = marks.find((row) => row.hours === hour);
    const isEnd = index === ordered.length - 1;
    return {
      id: isEnd ? "end" : index === 0 ? "pre" : "mid",
      hours: hour,
      pf: isEnd ? end.pf : mark?.pf ?? 0,
      wr: mark?.wr ?? 0,
      net: mark?.net ?? 0,
      mdd: mark?.mdd ?? 0,
      trades: mark?.trades ?? 0,
      ok: isEnd ? end.samples > 0 && end.pf >= end.minPf && Boolean(mark?.ok) : Boolean(mark?.ok),
      recorded: Boolean(mark) && (!isEnd || end.samples > 0),
      effective: isEnd ? end.effective : 0,
      valid: isEnd ? end.valid : 0,
      pfAvg: isEnd ? end.pf : undefined,
    };
  });
}

export function evaluateStages(opts?: {
  lastNs?: readonly number[];
  hours?: readonly number[];
  th?: Thresholds;
  base?: TacticConfig;
  tactic?: TacticKind;
  rangeType?: RangeType;
  enabledKinds?: readonly StrategyKind[];
  block?: BlockConfig;
}): StageEvalBundle {
  const th = opts?.th ?? DEFAULT_THRESHOLDS;
  const cfg = { ...DEFAULT_TACTIC_CONFIG, ...opts?.base };
  const lastNs = [...(opts?.lastNs?.length ? opts.lastNs : LANE_EVAL_NS)];
  const hours = [...new Set(opts?.hours?.length ? opts.hours : STAGE_HOURS)].sort((a, b) => a - b);
  const maxH = Math.max(...hours);
  const tactic = opts?.tactic ?? "hybrid";
  const rangeType = opts?.rangeType ?? "atr";
  const kinds = opts?.enabledKinds ?? STRATEGY_KINDS.map((k) => k.id);
  const block = opts?.block ?? DEFAULT_BLOCK_CONFIG;

  const { report, engine } = simulateHours(maxH, cfg, tactic, {
    symbolCount: SWEEP_SYMBOLS,
    orderType: SWEEP_ORDER,
    rangeType,
    marks: hours,
    block,
  });
  const blockAdjust = adjustActiveBlocks(engine, cfg, tactic, block, rangeType, { endStage: true });
  const marks = report.marks ?? [];

  const settled = engine.closed.filter((row) => row.connId === engine.activeConnId && row.validExec === true && !row.protect && !row.examFlat);
  const laneTracks = overlayLiveTracks(trackLaneEvals(th, kinds, lastNs), settled, th.minPf);
  const effectiveTracks = laneTracks.filter((t) => t.evidence === "settled-identity" && t.effective);
  const valid = laneTracks.filter((t) => t.evidence === "settled-identity" && t.ns.some((r) => r.ok)).length;
  const endRows = effectiveTracks.map((t) => t.ns.find((r) => r.n === lastNs[lastNs.length - 1]) ?? t.ns[t.ns.length - 1]!);
  const endPfAvg = endRows.length ? endRows.reduce((s, r) => s + r.pf, 0) / endRows.length : 0;
  const liveNs = liveLastNEvals(settled, lastNs, th.minPf);
  const stages = stageMarkers(hours, marks, {
    samples: endRows.length,
    pf: endPfAvg,
    minPf: th.minPf,
    effective: effectiveTracks.length,
    valid,
  });

  const coords: CoordValidate[] = [];
  for (const t of TACTICS) {
    const rows = combosFiltered({
      symbol: "BTCUSDT",
      lastN: lastNs[1] ?? 10,
      cfg,
      th,
      tactic: t,
      rangeType: "all",
      onlyPositive: false,
      enabledKinds: kinds,
      keepBest: true,
    });
    const best = pickBestCombo(rows);
    coords.push({
      axis: "tactic",
      value: t,
      ok: Boolean(best && (best.positive || best.pf >= th.minPf)),
      pf: best?.pf ?? 0,
      wr: best?.wr ?? 0,
      lastN: lastNs[1] ?? 10,
      recommend: t === tactic ? "live" : "independent",
    });
  }
  for (const r of RANGE_TYPES) {
    const rows = combosFiltered({
      symbol: "BTCUSDT",
      lastN: lastNs[1] ?? 10,
      cfg,
      th,
      tactic: "all",
      rangeType: r,
      onlyPositive: false,
      enabledKinds: kinds,
      keepBest: true,
    });
    const best = pickBestCombo(rows);
    coords.push({
      axis: "range",
      value: r,
      ok: Boolean(best && (best.positive || best.pf >= th.minPf)),
      pf: best?.pf ?? 0,
      wr: best?.wr ?? 0,
      lastN: lastNs[1] ?? 10,
      recommend: r === rangeType ? "live" : "independent",
    });
  }
  const kindRows = validateKindsIndependent(lastNs[1] ?? 10, cfg, th);
  for (const k of STRATEGY_KINDS) {
    if (!kinds.includes(k.id) && k.id !== "normal") continue;
    const row = kindRows.find((x) => x.kind === k.id);
    coords.push({
      axis: "kind",
      value: k.id,
      ok: Boolean(row?.ok),
      pf: row?.bestPf ?? 0,
      wr: 0,
      lastN: lastNs[1] ?? 10,
      recommend: "independent",
    });
  }
  for (const n of lastNs) {
    const row = liveNs.find((x) => x.n === n) ?? pfClosed(settled, n);
    const laneOk = laneTracks.filter((t) => t.ns.some((r) => r.n === n && r.ok)).length;
    coords.push({
      axis: "lastN",
      value: `N${n}`,
      ok: row.ok,
      pf: row.pf,
      wr: row.wr,
      lastN: n,
      recommend: row.ok ? "add" : "wait",
      lanePassing: laneOk,
    });
  }

  const end = stages.find((s) => s.id === "end") ?? stages[stages.length - 1];
  const endOk = Boolean(end?.ok && effectiveTracks.length > 0);

  return {
    hours,
    lastNs,
    stages,
    coords,
    laneTracks,
    liveNs,
    endPfAvg,
    endEvidence: endRows.length ? "settled-identity" : "unavailable",
    effective: effectiveTracks.length,
    valid,
    endOk,
    mirrored: false,
    blockAdjust,
    cfg,
    tactic,
    rangeType,
    at: Date.now(),
  };
}

