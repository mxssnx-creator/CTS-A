import { createServerFn } from "@tanstack/react-start";
import {
  DEFAULT_BLOCK_CONFIG,
  DEFAULT_ENABLED_KINDS,
  DEFAULT_LAST_N,
  DEFAULT_LAST_N_CONFIG,
  DEFAULT_TACTIC_CONFIG,
  DEFAULT_THRESHOLDS,
  DEFAULT_MIN_PF,
  DEFAULT_BASE_PF,
  DEFAULT_AXIS_PF,
  DEFAULT_BLOCK_PF,
  DEFAULT_SHORT_PF,
  DEFAULT_SHORT_BASE_PF,
  DEFAULT_SHORT_AXIS_PF,
  DEFAULT_SHORT_BLOCK_PF,
  DEFAULT_SHORT_PROGRESS,
  sanitizeShortProgress,
  DEFAULT_INTERVAL_STRATEGY,
  sanitizeIntervalStrategy,
  DEFAULT_LAST_N_PROGRESS,
  sanitizeLastNProgress,
  DEFAULT_STRATEGY_TOGGLES,
  LANE_EVAL_NS,
  MIN_VOLUME_FACTOR,
  sanitizeStrategyToggles,
  snapTpRatio,
  snapSlAtr,
  snapTpAtr,
  snapSlOfTp,
  snapTrailPct,
  slAtrOf,
  snapShortTpAtr,
  snapShortSlOfTp,
  shortSlAtrOf,
  shortTpRatioOf,
  cfgUsesShortRange,
  clampBlockVol,
  clampSharedVol,
  clampOverallVol,
  clampMaxVolumeMul,
  clampAxisPartial,
  DEFAULT_BLOCK_VOLUME_RATIO,
  DEFAULT_OVERALL_BLOCK_VOLUME_RATIO,
  DEFAULT_SHARED_BLOCK_VOLUME_RATIO,
  DEFAULT_MAX_VOLUME_MULTIPLIER,
  tpRatioOf,
  STAGE_HOURS,
  AUTO_EVAL_HOURS,
  STRATEGY_KINDS,
  clampLastN,
} from "./engine.ts";
import { clampSymbolCount } from "./vst.ts";
import type {
  BlockConfig,
  LastNConfig,
  OrderTypeId,
  RangeType,
  StrategyKind,
  TacticConfig,
  TacticKind,
  Thresholds,
  StrategyToggles,
} from "./types";
import { sanitizeUserPresets } from "./presets.ts";

export const SETTINGS_STORAGE_KEY = "cts-a-desk-settings";
export const SETTINGS_VERSION = 1;

const RANGES: RangeType[] = ["linear", "geometric", "atr", "volume", "fibonacci"];
const TACTICS: TacticKind[] = ["trailing", "dca", "axis", "hybrid"];
const KINDS = STRATEGY_KINDS.map((k) => k.id);
const ORDER_TYPES: OrderTypeId[] = [
  "market",
  "limit",
  "stop",
  "stop_limit",
  "trailing_stop",
  "post_only",
  "ioc",
  "fok",
];

export interface DeskSettingsSnap {
  v: number;
  at: number;
  rev: number;
  lastN: number;
  lastNs: LastNConfig;
  lastNLinked: boolean;
  costStep: number;
  rangeType: RangeType;
  tactic: TacticKind;
  thresholds: Thresholds;
  tacticConfig: TacticConfig;
  blockConfig: BlockConfig;
  symbolCount: number;
  orderType: OrderTypeId;
  enabledKinds: StrategyKind[];
  strategyId: string;
  liveTape: boolean;
  comboOnlyPositive: boolean;
  comboTactic: TacticKind | "all";
  comboRange: RangeType | "all";
  activeConnId: string;
  evalHours: number[];
  evalLastNs: number[];
  sessionPhase: "idle" | "running" | "paused" | "stopped";
  hedgeMode: boolean;
  marginMode: "cross" | "isolated";
  useMaxLeverage: boolean;
  leverage: number;
  minSizeRatio: number;
  activePresetId: string;
  userPresets: import("./presets.ts").SettingsPreset[];
  strategyToggles: StrategyToggles;
  shortProgress: import("./types").ShortProgressConfig;
  intervalStrategy: import("./types").IntervalStrategyConfig;
  lastNProgress: import("./types").LastNProgressConfig;
}

function asNum(n: unknown, fallback: number) {
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

function migratePf(n: number, oldDefault: number, next: number) {
  if (!Number.isFinite(n) || n <= 0) return next;
  if (Math.abs(n - oldDefault) < 1e-6) return next;
  return n;
}

function asBool(n: unknown, fallback: boolean) {
  return typeof n === "boolean" ? n : fallback;
}

function migrateKind(k: unknown): StrategyKind | null {
  if (k === "nirmal") return "normal";
  if (typeof k === "string" && (KINDS as string[]).includes(k)) return k as StrategyKind;
  return null;
}

function migrateStrategyId(id: unknown): string {
  if (id === "nirmal") return "normal";
  return typeof id === "string" && id ? id : "normal";
}

export function defaultDeskSettings(): DeskSettingsSnap {
  return {
    v: SETTINGS_VERSION,
    at: 0,
    rev: 0,
    lastN: DEFAULT_LAST_N,
    lastNs: { ...DEFAULT_LAST_N_CONFIG },
    lastNLinked: false,
    costStep: 10,
    rangeType: "atr",
    tactic: "hybrid",
    thresholds: { ...DEFAULT_THRESHOLDS },
    tacticConfig: { ...DEFAULT_TACTIC_CONFIG },
    blockConfig: { ...DEFAULT_BLOCK_CONFIG },
    symbolCount: 50,
    orderType: "limit",
    enabledKinds: [...DEFAULT_ENABLED_KINDS],
    strategyId: "normal",
    liveTape: true,
    comboOnlyPositive: true,
    comboTactic: "all",
    comboRange: "all",
    activeConnId: "bingx-vst-02",
    evalHours: [...AUTO_EVAL_HOURS],
    evalLastNs: [...LANE_EVAL_NS],
    sessionPhase: "running",
    hedgeMode: true,
    marginMode: "cross",
    useMaxLeverage: true,
    leverage: 0,
    minSizeRatio: 1,
    activePresetId: "",
    userPresets: [],
    strategyToggles: { ...DEFAULT_STRATEGY_TOGGLES },
    shortProgress: { ...DEFAULT_SHORT_PROGRESS, indications: [...DEFAULT_SHORT_PROGRESS.indications], lastParts: [...DEFAULT_SHORT_PROGRESS.lastParts], activityWindows: [...DEFAULT_SHORT_PROGRESS.activityWindows] },
    intervalStrategy: { ...DEFAULT_INTERVAL_STRATEGY },
    lastNProgress: { ...DEFAULT_LAST_N_PROGRESS, evalNs: [...DEFAULT_LAST_N_PROGRESS.evalNs], validNs: [...DEFAULT_LAST_N_PROGRESS.validNs], disableNs: [...DEFAULT_LAST_N_PROGRESS.disableNs] },
  };
}

export function sanitizeDeskSettings(raw: Partial<DeskSettingsSnap> | null | undefined): DeskSettingsSnap {
  const d = defaultDeskSettings();
  if (!raw || typeof raw !== "object") return d;
  const lastN = clampLastN(asNum(raw.lastN, d.lastN)) as DeskSettingsSnap["lastN"];
  const srcNs = raw.lastNs ?? d.lastNs;
  const lastNs: LastNConfig = {
    picks: clampLastN(asNum(srcNs.picks, lastN)),
    lanes: clampLastN(asNum(srcNs.lanes, lastN)),
    last: clampLastN(asNum(srcNs.last, lastN)),
    ongoing: clampLastN(asNum(srcNs.ongoing, lastN)),
    next: clampLastN(asNum(srcNs.next, lastN)),
    combos: clampLastN(asNum(srcNs.combos, lastN)),
  };
  const linked = asBool(raw.lastNLinked, true);
  const kinds = Array.isArray(raw.enabledKinds)
    ? KINDS.filter((k) => raw.enabledKinds!.map(migrateKind).includes(k))
    : d.enabledKinds;
  const th = raw.thresholds ?? d.thresholds;
  const cfg = raw.tacticConfig ?? d.tacticConfig;
  const snap: DeskSettingsSnap = {
    v: SETTINGS_VERSION,
    at: asNum(raw.at, 0),
    rev: Math.max(0, Math.round(asNum(raw.rev, 0))),
    lastN: linked ? lastN : clampLastN(lastNs.picks),
    lastNs: linked
      ? { picks: lastN, lanes: lastN, last: lastN, ongoing: lastN, next: lastN, combos: lastN }
      : lastNs,
    lastNLinked: linked,
    costStep: Math.min(30, Math.max(3, Math.round(asNum(raw.costStep, d.costStep)))),
    rangeType: RANGES.includes(raw.rangeType as RangeType) ? (raw.rangeType as RangeType) : d.rangeType,
    tactic: raw.tactic === "dca" ? "hybrid" : TACTICS.includes(raw.tactic as TacticKind) ? (raw.tactic as TacticKind) : d.tactic,
    thresholds: {
      minPf: Math.min(5, Math.max(1, migratePf(asNum(th.minPf, d.thresholds.minPf), 1.8, DEFAULT_MIN_PF))),
      basePf: Math.min(3, Math.max(0.8, migratePf(asNum(th.basePf, d.thresholds.basePf ?? DEFAULT_BASE_PF), 1.1, DEFAULT_BASE_PF))),
      axisPf: Math.min(3, Math.max(0.9, migratePf(asNum(th.axisPf, d.thresholds.axisPf ?? DEFAULT_AXIS_PF), 1.5, DEFAULT_AXIS_PF))),
      blockPf: Math.min(3, Math.max(0.9, migratePf(asNum(th.blockPf, d.thresholds.blockPf ?? DEFAULT_BLOCK_PF), 1.6, DEFAULT_BLOCK_PF))),
      shortPf: Math.min(3, Math.max(0.4, migratePf(asNum(th.shortPf, d.thresholds.shortPf ?? DEFAULT_SHORT_PF), 1.2, DEFAULT_SHORT_PF))),
      shortBasePf: Math.min(2, Math.max(0.4, migratePf(asNum(th.shortBasePf, d.thresholds.shortBasePf ?? DEFAULT_SHORT_BASE_PF), 0.8, DEFAULT_SHORT_BASE_PF))),
      shortAxisPf: Math.min(2, Math.max(0.5, asNum(th.shortAxisPf, d.thresholds.shortAxisPf ?? DEFAULT_SHORT_AXIS_PF))),
      shortBlockPf: Math.min(2.5, Math.max(0.7, asNum(th.shortBlockPf, d.thresholds.shortBlockPf ?? DEFAULT_SHORT_BLOCK_PF))),
      maxMdd: Math.min(0.45, Math.max(0.02, asNum(th.maxMdd, d.thresholds.maxMdd))),
      minWr: Math.min(0.8, Math.max(0.35, asNum(th.minWr, d.thresholds.minWr))),
      minVf: Math.max(MIN_VOLUME_FACTOR, asNum(th.minVf, d.thresholds.minVf)),
      maxDdt: Math.min(20, Math.max(8, asNum(th.maxDdt, d.thresholds.maxDdt))),
    },
    tacticConfig: (() => {
      const hasPair = cfg.tpAtr != null || cfg.slOfTp != null;
      const short = asBool(cfg.shortRange, false) || cfgUsesShortRange(cfg);
      if (short) {
        const slOfTp = snapShortSlOfTp(asNum(cfg.slOfTp, 1));
        const tpAtr = snapShortTpAtr(asNum(cfg.tpAtr, 0.3));
        return {
          trailingPct: snapTrailPct(asNum(cfg.trailingPct, 1.5)),
          dcaCount: 1,
          dcaDrawdown: Math.max(0.3, asNum(cfg.dcaDrawdown, d.tacticConfig.dcaDrawdown)),
          axisSpacing: Math.max(0.2, asNum(cfg.axisSpacing, d.tacticConfig.axisSpacing)),
          axisLevels: Math.max(2, Math.round(asNum(cfg.axisLevels, d.tacticConfig.axisLevels))),
          axisPartialRatio: clampAxisPartial(cfg.axisPartialRatio, d.tacticConfig.axisPartialRatio ?? 1),
          slAtr: shortSlAtrOf(tpAtr, slOfTp),
          tpRatio: shortTpRatioOf(slOfTp),
          tpAtr,
          slOfTp,
          shortRange: true,
          maxHoldBars: Math.min(8, Math.max(1, Math.round(asNum(cfg.maxHoldBars, 2)))),
          maxHoldTicks: Math.min(20_000, Math.max(4, Math.round(asNum(cfg.maxHoldTicks, 12)))),
        };
      }
      const slOfTp = snapSlOfTp(asNum(cfg.slOfTp, hasPair ? 1 : 1 / Math.max(0.5, asNum(cfg.tpRatio, d.tacticConfig.tpRatio))));
      const tpAtr = snapTpAtr(
        asNum(cfg.tpAtr, hasPair ? 1 : asNum(cfg.slAtr, d.tacticConfig.slAtr) / Math.max(0.5, slOfTp)),
      );
      return {
      trailingPct: snapTrailPct(asNum(cfg.trailingPct, 1.5)),
      dcaCount: 1,
      dcaDrawdown: Math.max(0.3, asNum(cfg.dcaDrawdown, d.tacticConfig.dcaDrawdown)),
      axisSpacing: Math.max(0.2, asNum(cfg.axisSpacing, d.tacticConfig.axisSpacing)),
      axisLevels: Math.max(2, Math.round(asNum(cfg.axisLevels, d.tacticConfig.axisLevels))),
      axisPartialRatio: clampAxisPartial(cfg.axisPartialRatio, d.tacticConfig.axisPartialRatio ?? 1),
      slAtr: slAtrOf(tpAtr, slOfTp),
      tpRatio: tpRatioOf(slOfTp),
      tpAtr,
      slOfTp,
      shortRange: false,
      maxHoldBars: Math.min(8, Math.max(1, Math.round(asNum(cfg.maxHoldBars, d.tacticConfig.maxHoldBars ?? 3)))),
      maxHoldTicks: Math.min(20_000, Math.max(4, Math.round(asNum(cfg.maxHoldTicks, d.tacticConfig.maxHoldTicks ?? 16)))),
      };
    })(),
    blockConfig: (() => {
      const b = (raw as { blockConfig?: Partial<BlockConfig> }).blockConfig ?? d.blockConfig;
      return {
        enabled: asBool(b.enabled, d.blockConfig.enabled),
        maxMultiple: Math.min(16, Math.max(1, Math.round(asNum(b.maxMultiple, d.blockConfig.maxMultiple)))),
        minMultiple: Math.min(16, Math.max(1, Math.round(asNum(b.minMultiple, d.blockConfig.minMultiple)))),
        addOnWin: asBool(b.addOnWin, d.blockConfig.addOnWin),
        flattenConflict: asBool(b.flattenConflict, d.blockConfig.flattenConflict),
        endStageOnly: asBool(b.endStageOnly, d.blockConfig.endStageOnly),
        cadence: Math.min(16, Math.max(4, Math.round(asNum(b.cadence, d.blockConfig.cadence)))),
        overall: asBool(b.overall, d.blockConfig.overall ?? true),
        overallSymbol: asBool((b as { overallSymbol?: boolean }).overallSymbol, d.blockConfig.overallSymbol ?? true),
        overallDirection: asBool((b as { overallDirection?: boolean }).overallDirection, d.blockConfig.overallDirection ?? true),
        overallSharedStack:
          (b as { overallSharedStack?: string }).overallSharedStack === "split" ? "split" : "additive",
        counts: (() => {
          const rawCounts = Array.isArray(b.counts)
            ? [...new Set(b.counts.map((n) => Math.round(Number(n))).filter((n) => n >= 1 && n <= 16))].sort((a, c) => a - c)
            : [...(d.blockConfig.counts ?? [1, 2])];
          return rawCounts.length ? rawCounts.slice(0, 16) : [1, 2];
        })(),
        volumeRatio: clampBlockVol(asNum(b.volumeRatio, d.blockConfig.volumeRatio ?? DEFAULT_BLOCK_VOLUME_RATIO)),
        overallVolumeRatio: clampOverallVol(asNum((b as { overallVolumeRatio?: number }).overallVolumeRatio, d.blockConfig.overallVolumeRatio ?? DEFAULT_OVERALL_BLOCK_VOLUME_RATIO)),
        sharedVolumeRatio: clampSharedVol(asNum((b as { sharedVolumeRatio?: number }).sharedVolumeRatio, d.blockConfig.sharedVolumeRatio ?? DEFAULT_SHARED_BLOCK_VOLUME_RATIO)),
        maxVolumeMultiplier: clampMaxVolumeMul(asNum(b.maxVolumeMultiplier, d.blockConfig.maxVolumeMultiplier ?? DEFAULT_MAX_VOLUME_MULTIPLIER)),
        pfRatio: Math.min(5, Math.max(1.25, asNum(b.pfRatio, d.blockConfig.pfRatio ?? 1.3))),
        pauseCountRatio: Math.min(6, Math.max(0, Math.round(asNum(b.pauseCountRatio, d.blockConfig.pauseCountRatio ?? 1)))),
        evalPosCount: Math.min(16, Math.max(1, Math.round(asNum(b.evalPosCount, d.blockConfig.evalPosCount ?? 6)))),
        activeLive: asBool(b.activeLive, d.blockConfig.activeLive ?? true),
        minActiveLevel: Math.min(6, Math.max(1, Math.round(asNum(b.minActiveLevel, d.blockConfig.minActiveLevel ?? 1)))),
        keepAdjusted: asBool((b as { keepAdjusted?: boolean }).keepAdjusted, d.blockConfig.keepAdjusted ?? true),
        stack: asBool((b as { stack?: boolean }).stack, d.blockConfig.stack ?? true),
        windows: asBool((b as { windows?: boolean }).windows, d.blockConfig.windows ?? true),
        volumeMode: b.volumeMode === "additive" || b.volumeMode === "parallel" || b.volumeMode === "shared" ? b.volumeMode : d.blockConfig.volumeMode,
        overallMode:
          (b as { overallMode?: string }).overallMode === "additive" ||
          (b as { overallMode?: string }).overallMode === "parallel" ||
          (b as { overallMode?: string }).overallMode === "shared"
            ? ((b as { overallMode?: "shared" | "additive" | "parallel" }).overallMode as "shared" | "additive" | "parallel")
            : (d.blockConfig.overallMode ?? "shared"),
        sides: b.sides === "long" || b.sides === "short" || b.sides === "both" || b.sides === "mixed" || b.sides === "one" ? b.sides : d.blockConfig.sides,
        evalHours: Math.min(12, Math.max(1, Math.round(asNum(b.evalHours, d.blockConfig.evalHours ?? 2)))),
        autoEval: asBool(b.autoEval, d.blockConfig.autoEval ?? true),
        relAdditive: asBool(b.relAdditive, d.blockConfig.relAdditive ?? true),
        relVolumeRatio: clampBlockVol(asNum(b.relVolumeRatio, d.blockConfig.relVolumeRatio ?? DEFAULT_BLOCK_VOLUME_RATIO)),
        minRelPf: Math.min(5, Math.max(1, asNum(b.minRelPf, asNum(th.blockPf, d.blockConfig.minRelPf ?? DEFAULT_BLOCK_PF)))),
        evalLastNs: Array.isArray(b.evalLastNs)
          ? [...new Set(b.evalLastNs.map((n) => Math.round(Number(n))).filter((n) => n >= 1 && n <= 6))].sort((a, c) => a - c)
          : [...(d.blockConfig.evalLastNs ?? [1, 2, 3, 4, 5, 6])],
        liveLastN: Math.min(40, Math.max(4, Math.round(asNum(b.liveLastN, d.blockConfig.liveLastN ?? 12)))),
        validExecN: Math.min(40, Math.max(8, Math.round(asNum(b.validExecN ?? b.liveExecN, d.blockConfig.validExecN ?? d.blockConfig.liveExecN ?? 15)))),
        liveExecN: Math.min(40, Math.max(8, Math.round(asNum(b.validExecN ?? b.liveExecN, d.blockConfig.validExecN ?? d.blockConfig.liveExecN ?? 15)))),
        liveDisable: asBool(b.liveDisable, d.blockConfig.liveDisable ?? true),
        liveDisableMinPf: Math.min(5, Math.max(1, asNum(b.liveDisableMinPf, asNum(th.blockPf, d.blockConfig.liveDisableMinPf ?? DEFAULT_BLOCK_PF)))),
        liveDisableMinSamples: Math.min(12, Math.max(3, Math.round(asNum(b.liveDisableMinSamples, d.blockConfig.liveDisableMinSamples ?? 4)))),
        symbolEvalHours: Math.min(168, Math.max(24, Math.round(asNum(b.symbolEvalHours, d.blockConfig.symbolEvalHours ?? 100)))),
        hourCoord: asBool(b.hourCoord, d.blockConfig.hourCoord ?? true),
        lastNProgress: sanitizeLastNProgress((b as { lastNProgress?: Partial<import("./types").LastNProgressConfig> }).lastNProgress ?? d.blockConfig.lastNProgress),
      };
    })(),
    symbolCount: clampSymbolCount(asNum(raw.symbolCount, d.symbolCount)),
    orderType: ORDER_TYPES.includes(raw.orderType as OrderTypeId) ? (raw.orderType as OrderTypeId) : d.orderType,
    enabledKinds: kinds.length ? kinds : [...DEFAULT_ENABLED_KINDS],
    strategyId: migrateStrategyId(raw.strategyId),
    liveTape: asBool(raw.liveTape, true),
    comboOnlyPositive: asBool(raw.comboOnlyPositive, true),
    comboTactic:
      raw.comboTactic === "all" || TACTICS.includes(raw.comboTactic as TacticKind)
        ? (raw.comboTactic as DeskSettingsSnap["comboTactic"])
        : "all",
    comboRange:
      raw.comboRange === "all" || RANGES.includes(raw.comboRange as RangeType)
        ? (raw.comboRange as DeskSettingsSnap["comboRange"])
        : "all",
    activeConnId:
      raw.activeConnId === "bingx-x01" || raw.activeConnId === "bingx-vst-02" || raw.activeConnId === "bingx-vst-01"
        ? raw.activeConnId
        : "bingx-vst-02",
    evalHours: Array.isArray(raw.evalHours)
      ? AUTO_EVAL_HOURS.filter((h) => raw.evalHours!.includes(h))
      : [...AUTO_EVAL_HOURS],
    evalLastNs: Array.isArray(raw.evalLastNs)
      ? LANE_EVAL_NS.filter((n) => raw.evalLastNs!.map((x) => (Number(x) === 30 ? 50 : Number(x))).includes(n))
      : [...LANE_EVAL_NS],
    sessionPhase:
      raw.sessionPhase === "paused" || raw.sessionPhase === "stopped" || raw.sessionPhase === "idle" || raw.sessionPhase === "running"
        ? raw.sessionPhase
        : "running",
    hedgeMode: asBool((raw as { hedgeMode?: boolean }).hedgeMode, true),
    marginMode: (raw as { marginMode?: string }).marginMode === "isolated" ? "isolated" : "cross",
    useMaxLeverage: true,
    leverage: 0,
    minSizeRatio: Math.min(2, Math.max(1, asNum((raw as { minSizeRatio?: number }).minSizeRatio, 1))),
    activePresetId: typeof (raw as { activePresetId?: string }).activePresetId === "string" ? String((raw as { activePresetId?: string }).activePresetId).slice(0, 48) : "",
    userPresets: sanitizeUserPresets((raw as { userPresets?: unknown }).userPresets),
    strategyToggles: sanitizeStrategyToggles((raw as { strategyToggles?: Partial<StrategyToggles> }).strategyToggles),
    shortProgress: sanitizeShortProgress((raw as { shortProgress?: Partial<import("./types").ShortProgressConfig> }).shortProgress),
    intervalStrategy: sanitizeIntervalStrategy((raw as { intervalStrategy?: Partial<import("./types").IntervalStrategyConfig> }).intervalStrategy),
    lastNProgress: sanitizeLastNProgress((raw as { lastNProgress?: Partial<import("./types").LastNProgressConfig> }).lastNProgress),
  };
  if (!snap.evalHours.length) snap.evalHours = [...AUTO_EVAL_HOURS];
  if (!snap.evalLastNs.length) snap.evalLastNs = [...LANE_EVAL_NS];
  snap.lastNProgress = sanitizeLastNProgress(snap.lastNProgress ?? snap.blockConfig.lastNProgress);
  snap.blockConfig.lastNProgress = snap.lastNProgress;
  return snap;
}

export function collectDeskSettings(s: {
  lastN: number;
  lastNs: LastNConfig;
  lastNLinked: boolean;
  costStep: number;
  rangeType: RangeType;
  tactic: TacticKind;
  thresholds: Thresholds;
  tacticConfig: TacticConfig;
  blockConfig?: BlockConfig;
  symbolCount: number;
  orderType: OrderTypeId;
  enabledKinds: StrategyKind[];
  strategyId: string;
  liveTape: boolean;
  comboOnlyPositive: boolean;
  comboTactic: TacticKind | "all";
  comboRange: RangeType | "all";
  activeConnId: string;
  evalHours?: number[];
  evalLastNs?: number[];
  sessionPhase?: "idle" | "running" | "paused" | "stopped";
  settingsRev?: number;
  settingsAt?: number;
  hedgeMode?: boolean;
  marginMode?: "cross" | "isolated";
  useMaxLeverage?: boolean;
  leverage?: number;
  minSizeRatio?: number;
  activePresetId?: string;
  userPresets?: import("./presets.ts").SettingsPreset[];
  strategyToggles?: StrategyToggles;
  shortProgress?: import("./types").ShortProgressConfig;
  intervalStrategy?: import("./types").IntervalStrategyConfig;
  lastNProgress?: import("./types").LastNProgressConfig;
}): DeskSettingsSnap {
  return sanitizeDeskSettings({
    v: SETTINGS_VERSION,
    at: s.settingsAt ?? Date.now(),
    rev: (s.settingsRev ?? 0) + 1,
    lastN: s.lastN,
    lastNs: s.lastNs,
    lastNLinked: s.lastNLinked,
    costStep: s.costStep,
    rangeType: s.rangeType,
    tactic: s.tactic,
    thresholds: s.thresholds,
    tacticConfig: s.tacticConfig,
    blockConfig: s.blockConfig,
    symbolCount: s.symbolCount,
    orderType: s.orderType,
    enabledKinds: s.enabledKinds,
    strategyId: s.strategyId,
    liveTape: s.liveTape,
    comboOnlyPositive: s.comboOnlyPositive,
    comboTactic: s.comboTactic,
    comboRange: s.comboRange,
    activeConnId: s.activeConnId,
    evalHours: s.evalHours,
    evalLastNs: s.evalLastNs,
    sessionPhase: s.sessionPhase,
    hedgeMode: s.hedgeMode,
    marginMode: s.marginMode,
    useMaxLeverage: s.useMaxLeverage,
    leverage: s.leverage,
    minSizeRatio: s.minSizeRatio,
    activePresetId: s.activePresetId,
    userPresets: s.userPresets,
    strategyToggles: s.strategyToggles,
    shortProgress: sanitizeShortProgress((s as { shortProgress?: Partial<import("./types").ShortProgressConfig> }).shortProgress),
    intervalStrategy: sanitizeIntervalStrategy((s as { intervalStrategy?: Partial<import("./types").IntervalStrategyConfig> }).intervalStrategy),
    lastNProgress: sanitizeLastNProgress((s as { lastNProgress?: Partial<import("./types").LastNProgressConfig> }).lastNProgress),
  });
}

export function settingsDiffer(a: DeskSettingsSnap, b: DeskSettingsSnap): boolean {
  const skip = new Set(["at", "rev"]);
  for (const k of Object.keys(a) as (keyof DeskSettingsSnap)[]) {
    if (skip.has(k)) continue;
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) return true;
  }
  return false;
}

export function readLocalSettings(): DeskSettingsSnap | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    return sanitizeDeskSettings(JSON.parse(raw) as Partial<DeskSettingsSnap>);
  } catch {
    return null;
  }
}

export function writeLocalSettings(snap: DeskSettingsSnap) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(snap));
  } catch {
    /* quota */
  }
}

export const persistDeskSettings = createServerFn({ method: "POST" })
  .validator((d: DeskSettingsSnap) => sanitizeDeskSettings(d))
  .handler(async ({ data }) => {
    const { writeSettingsFile } = await import("./settings.server.ts");
    writeSettingsFile(data);
    return { ok: true, at: data.at, rev: data.rev };
  });

export const loadDeskSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { readSettingsFile } = await import("./settings.server.ts");
  return readSettingsFile();
});
