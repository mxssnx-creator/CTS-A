import type { FeeModel } from "./fees.ts";
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
  LastNProgressConfig,
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
  SHORT_EVAL_HOURS,
  RANGE_TYPES,
  SL_ATR_RATIOS,
  STAGE_HOURS,
  STRATEGY_KINDS,
  SYMBOLS,
  TACTICS,
  TP_SL_RATIOS,
  TRAIL_PCTS,
  combosFiltered,
  coordinateLastN,
  decideLastN,
  edgePnl,
  getBacktest,
  isPositive,
  lastNEval,
  pickBestCombo,
  snapSlAtr,
  snapTpRatio,
  profitFactor,
  strategiesForKinds,
} from "./engine.ts";
import { adjustActiveBlocks, simulateHours } from "./vst.ts";

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
  feeModel?: FeeModel,
) {
  return simulateHours(hours, cfg, tactic, {
    symbolCount: SWEEP_SYMBOLS,
    orderType: SWEEP_ORDER,
    rangeType,
    marks: VALIDATE_MARKS.filter((h) => h <= hours),
    feeModel,
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
  feeModel?: FeeModel,
): AxisPick<T> {
  const { report } = historicSim(cfg, tactic, rangeType, DAYS_HOURS, feeModel);
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
  multiProgress?: LastNProgressConfig,
  feeModel?: FeeModel,
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
      multiProgress,
      feeModel,
    });
    const pass = rows.filter((r) => r.positive && r.lastNPositive);
    const best = pickBestCombo(pass.length ? pass : rows);
    return {
      kind: k.id,
      total: rows.length,
      pass: pass.length,
      ok: pass.length > 0 && (best?.pf ?? 0) >= th.minPf,
      bestPf: best?.pf ?? 0,
    };
  });
}

export function autoValidateConfigs(opts?: {
  lastN?: number;
  th?: Thresholds;
  base?: TacticConfig;
  feeModel?: FeeModel;
}): AutoValidateResult {
  const th = opts?.th ?? DEFAULT_THRESHOLDS;
  const base: TacticConfig = {
    ...DEFAULT_TACTIC_CONFIG,
    ...opts?.base,
    slAtr: snapSlAtr(opts?.base?.slAtr ?? DEFAULT_TACTIC_CONFIG.slAtr),
    tpRatio: snapTpRatio(opts?.base?.tpRatio ?? DEFAULT_TACTIC_CONFIG.tpRatio),
  };
  const lastN = opts?.lastN ?? 10;

  const tacticRows = VALIDATE_TACTICS.map((t) => runAxis("tactic", t, t, base, t, "atr", opts?.feeModel));
  const tacticPick = bestPick(tacticRows, "hybrid");

  const rangeRows = RANGE_TYPES.map((r) => runAxis("range", r, r, base, tacticPick.value, r, opts?.feeModel));
  const rangePick = bestPick(rangeRows, "atr");

  const trailRows = TRAIL_PCTS.map((p) =>
    runAxis("trail", p, `${p.toFixed(1)}%`, { ...base, trailingPct: p }, tacticPick.value, rangePick.value, opts?.feeModel),
  );
  const trailPick = bestPick(trailRows, base.trailingPct);

  const slRows = VALIDATE_SL.map((s) =>
    runAxis("slAtr", s, `${s.toFixed(1)} ATR`, { ...base, trailingPct: trailPick.value, slAtr: s }, tacticPick.value, rangePick.value, opts?.feeModel),
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
      opts?.feeModel,
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
  const kinds = validateKindsIndependent(lastN, cfg, th, undefined, opts?.feeModel);
  const enabledKinds: StrategyKind[] = kinds.filter((k) => k.ok).map((k) => k.kind);
  if (!enabledKinds.includes("normal")) enabledKinds.unshift("normal");

  const confirmSim = historicSim(cfg, tacticPick.value, rangePick.value, DAYS_HOURS, opts?.feeModel);
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

/** A dollar-only close needs its own known entry notional before it can be used in return PF. */
function closedNetReturn(c: ClosedTrade): number {
  if (c.ratio !== undefined) return edgePnl(c);
  if (!(c.entry > 0) || !(c.qty > 0) || !Number.isFinite(c.entry * c.qty) || !Number.isFinite(c.pnl)) return NaN;
  return c.pnl / (c.entry * c.qty);
}

function pfClosed(closed: ClosedTrade[], n: number): LastNEvalRow {
  const xs = closed.slice(0, Math.max(1, n));
  const trades = xs.length;
  const values = xs.map(closedNetReturn);
  const unknown = values.filter(v => !Number.isFinite(v)).length;
  const wins = values.filter(v => v > 0);
  const profit = wins.reduce((s, v) => s + v, 0);
  const loss = Math.abs(values.filter(v => v < 0).reduce((s, v) => s + v, 0));
  const net = unknown ? NaN : values.reduce((s, v) => s + v, 0);
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
  multiProgress?: LastNProgressConfig,
  feeModel?: FeeModel,
): LaneEvalTrack[] {
  const playbooks = strategiesForKinds(kinds);
  const tracks: LaneEvalTrack[] = [];
  const now = Date.now();
  for (const st of playbooks) {
    for (const sym of SYMBOLS) {
      const bt = getBacktest(st.id, sym.id, feeModel);
      const ownRows = multiProgress ? [...bt.trades].reverse() : [];
      const pick = multiProgress ? coordinateLastN(ownRows, multiProgress, th.minPf, th.minPf) : undefined;
      const activeNs = pick ? [...new Set([...pick.evalNs, ...pick.validNs, ...pick.disableNs])].sort((a,b)=>a-b) : lastNs;
      const multiPass = !multiProgress || (decideLastN(ownRows, multiProgress, th.minPf, th.minPf).pass &&
        pick!.validHits.some(h => h.samples >= h.n && h.pf >= th.minPf && h.net > 0));
      const ns: LastNEvalRow[] = activeNs.map((n) => {
        const s = lastNEval(bt, n);
        return {
          n,
          pf: s.pf,
          wr: s.wr,
          net: s.net,
          trades: s.trades,
          ok: s.trades >= n && s.net > 0 && isPositive(s, th),
        };
      });
      const end = ns[ns.length - 1];
      const passing = ns.filter((r) => r.ok).length;
      const fullOk = isPositive(bt.stats, th) && bt.stats.net > 0;
      for (const tactic of TACTICS) {
        tracks.push({
          laneId: `${st.id}:${sym.id}:${tactic}`,
          strategyId: st.id,
          symbol: sym.id,
          tactic,
          kind: st.kind,
          ns,
          evidence: "source-model",
          effective: Boolean(multiPass && fullOk && end?.ok && passing >= Math.min(activeNs.length, Math.max(2, activeNs.length - 1))),
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
    // Symbol alone does not establish that a close belongs to this strategy and tactic.
    if (!c.strategyId || !c.tactic || !c.kind || c.validExec !== true || c.protect || c.examFlat) continue;
    const key = JSON.stringify([c.symbol,c.strategyId,c.tactic,c.kind]);
    const arr = byLane.get(key);
    if (arr) arr.push(c);
    else byLane.set(key, [c]);
  }
  return tracks.map((t) => {
    const laneNs = t.ns.map(r => r.n);
    const need = Math.max(1, ...laneNs);
    const xs = byLane.get(JSON.stringify([t.symbol,t.strategyId,t.tactic,t.kind]));
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

/** Keep every requested horizon; only the latest is the end stage, and missing marks stay unrecorded. */
export function stageMarkers(hours: readonly number[], marks: readonly HorizonMark[], end: {
  samples: number; pf: number; minPf: number; effective: number; valid: number;
}): StageEval[] {
  const ordered = [...new Set(hours.filter(h => Number.isFinite(h) && h > 0))].sort((a,b)=>a-b);
  return ordered.map((hour,index) => {
    const m = marks.find(x => x.hours === hour);
    const isEnd = index === ordered.length - 1;
    return {
      id: isEnd ? "end" : index === 0 ? "pre" : "mid", hours: hour,
      pf: isEnd && end.samples ? end.pf : m?.pf ?? 0,
      wr: m?.wr ?? 0, net: m?.net ?? 0, mdd: m?.mdd ?? 0, trades: m?.trades ?? 0,
      ok: isEnd ? end.samples > 0 && end.pf >= end.minPf && Boolean(m?.ok) : Boolean(m?.ok),
      recorded: Boolean(m), effective: isEnd ? end.effective : 0, valid: isEnd ? end.valid : 0,
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
  multiProgress?: LastNProgressConfig;
  feeModel?: FeeModel;
}): StageEvalBundle {
  const th = opts?.th ?? DEFAULT_THRESHOLDS;
  const cfg = { ...DEFAULT_TACTIC_CONFIG, ...opts?.base };
  const requestedNs = [...(opts?.lastNs?.length ? opts.lastNs : LANE_EVAL_NS)];
  const hours = [...new Set(opts?.hours?.length ? opts.hours : STAGE_HOURS)].sort((a,b)=>a-b);
  const maxH = Math.max(...hours);
  const tactic = opts?.tactic ?? "hybrid";
  const rangeType = opts?.rangeType ?? "atr";
  const kinds = opts?.enabledKinds ?? STRATEGY_KINDS.map((k) => k.id);
  const block = opts?.multiProgress ? { ...(opts?.block ?? DEFAULT_BLOCK_CONFIG), lastNProgress: opts.multiProgress } : (opts?.block ?? DEFAULT_BLOCK_CONFIG);

  const { report, engine } = simulateHours(maxH, cfg, tactic, {
    symbolCount: SWEEP_SYMBOLS,
    orderType: SWEEP_ORDER,
    rangeType,
    marks: hours,
    block,
    prehours: SHORT_EVAL_HOURS,
    feeModel: opts?.feeModel,
  });
  const blockAdjust = adjustActiveBlocks(engine, cfg, tactic, block, rangeType, { endStage: true });
  const marks = report.marks ?? [];

  const settled = engine.closed.filter(c => c.validExec === true && !c.protect && !c.examFlat);
  const pick = opts?.multiProgress ? coordinateLastN(settled.map(c => ({ pnl: closedNetReturn(c) })), opts.multiProgress, th.minPf, th.minPf) : undefined;
  const lastNs = pick ? [...new Set([...pick.evalNs, ...pick.validNs, ...pick.disableNs])].sort((a,b)=>a-b) : requestedNs;
  const coordinatedN = pick?.bestValid ?? lastNs[1] ?? 10;
  const laneTracks = overlayLiveTracks(trackLaneEvals(th, kinds, lastNs, opts?.multiProgress, opts?.feeModel), settled, th.minPf);
  // A generated catalog estimate is useful for exploration but is not evidence for mirroring a lane.
  const effectiveTracks = laneTracks.filter((t) => t.evidence === "settled-identity" && t.effective);
  const valid = laneTracks.filter((t) => t.evidence === "settled-identity" && t.ns.some((r) => r.ok)).length;
  const endRows = effectiveTracks.map((t) => t.ns.find((r) => r.n === lastNs[lastNs.length - 1]) ?? t.ns[t.ns.length - 1]!);
  const endPfAvg = endRows.length ? endRows.reduce((s, r) => s + r.pf, 0) / endRows.length : 0;
  const liveNs = liveLastNEvals(settled, lastNs, th.minPf);

  const stages = stageMarkers(hours, marks, { samples: endRows.length, pf: endPfAvg, minPf: th.minPf,
    effective: effectiveTracks.length, valid });

  const coords: CoordValidate[] = [];
  for (const t of TACTICS) {
    const rows = combosFiltered({
      symbol: "BTCUSDT",
      lastN: coordinatedN,
      cfg,
      th,
      tactic: t,
      rangeType: "all",
      onlyPositive: false,
      enabledKinds: kinds,
      keepBest: true,
      multiProgress: opts?.multiProgress,
      feeModel: opts?.feeModel,
    });
    const best = pickBestCombo(rows);
    coords.push({
      axis: "tactic",
      value: t,
      ok: Boolean(best && best.positive && best.lastNPositive),
      pf: best?.pf ?? 0,
      wr: best?.wr ?? 0,
      lastN: best?.activeLastN ?? coordinatedN,
      recommend: t === tactic ? "live" : "independent",
    });
  }
  for (const r of RANGE_TYPES) {
    const rows = combosFiltered({
      symbol: "BTCUSDT",
      lastN: coordinatedN,
      cfg,
      th,
      tactic: "all",
      rangeType: r,
      onlyPositive: false,
      enabledKinds: kinds,
      keepBest: true,
      multiProgress: opts?.multiProgress,
      feeModel: opts?.feeModel,
    });
    const best = pickBestCombo(rows);
    coords.push({
      axis: "range",
      value: r,
      ok: Boolean(best && best.positive && best.lastNPositive),
      pf: best?.pf ?? 0,
      wr: best?.wr ?? 0,
      lastN: best?.activeLastN ?? coordinatedN,
      recommend: r === rangeType ? "live" : "independent",
    });
  }
  const kindRows = validateKindsIndependent(coordinatedN, cfg, th, opts?.multiProgress, opts?.feeModel);
  for (const k of STRATEGY_KINDS) {
    if (!kinds.includes(k.id) && k.id !== "normal") continue;
    const row = kindRows.find((x) => x.kind === k.id);
    coords.push({
      axis: "kind",
      value: k.id,
      ok: Boolean(row?.ok),
      pf: row?.bestPf ?? 0,
      wr: 0,
      lastN: coordinatedN,
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

