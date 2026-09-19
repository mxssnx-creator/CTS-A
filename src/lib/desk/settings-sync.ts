import { createServerFn } from "@tanstack/react-start";
import {
  DEFAULT_BLOCK_CONFIG,
  DEFAULT_ENABLED_KINDS,
  DEFAULT_LAST_N,
  DEFAULT_LAST_N_CONFIG,
  DEFAULT_TACTIC_CONFIG,
  DEFAULT_THRESHOLDS,
  LANE_EVAL_NS,
  MIN_VOLUME_FACTOR,
  snapTpRatio,
  snapSlAtr,
  STAGE_HOURS,
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
} from "./types";

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
}

function asNum(n: unknown, fallback: number) {
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
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
    lastNLinked: true,
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
    evalHours: [...STAGE_HOURS],
    evalLastNs: [...LANE_EVAL_NS],
    sessionPhase: "running",
    hedgeMode: true,
    marginMode: "cross",
    useMaxLeverage: true,
    leverage: 125,
    minSizeRatio: 1.08,
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
      minPf: Math.max(1.85, asNum(th.minPf, d.thresholds.minPf)),
      maxMdd: Math.min(0.45, Math.max(0.02, asNum(th.maxMdd, d.thresholds.maxMdd))),
      minWr: Math.min(0.8, Math.max(0.35, asNum(th.minWr, d.thresholds.minWr))),
      minVf: Math.max(MIN_VOLUME_FACTOR, asNum(th.minVf, d.thresholds.minVf)),
      maxDdt: Math.min(20, Math.max(8, asNum(th.maxDdt, d.thresholds.maxDdt))),
    },
    tacticConfig: {
      trailingPct: Math.max(0.4, asNum(cfg.trailingPct, d.tacticConfig.trailingPct)),
      dcaCount: 1,
      dcaDrawdown: Math.max(0.3, asNum(cfg.dcaDrawdown, d.tacticConfig.dcaDrawdown)),
      axisSpacing: Math.max(0.2, asNum(cfg.axisSpacing, d.tacticConfig.axisSpacing)),
      axisLevels: Math.max(2, Math.round(asNum(cfg.axisLevels, d.tacticConfig.axisLevels))),
      slAtr: snapSlAtr(asNum(cfg.slAtr, d.tacticConfig.slAtr)),
      tpRatio: snapTpRatio(asNum(cfg.tpRatio, d.tacticConfig.tpRatio)),
      maxHoldBars: Math.min(8, Math.max(1, Math.round(asNum(cfg.maxHoldBars, d.tacticConfig.maxHoldBars ?? 3)))),
      maxHoldTicks: Math.min(20_000, Math.max(4, Math.round(asNum(cfg.maxHoldTicks, d.tacticConfig.maxHoldTicks ?? 16)))),
    },
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
        counts: (() => {
          const rawCounts = Array.isArray(b.counts)
            ? [...new Set(b.counts.map((n) => Math.round(Number(n))).filter((n) => n >= 1 && n <= 16))].sort((a, c) => a - c)
            : [...(d.blockConfig.counts ?? [1, 2])];
          return rawCounts.length ? rawCounts.slice(0, 16) : [1, 2];
        })(),
        volumeRatio: Math.min(2.5, Math.max(1.25, asNum(b.volumeRatio, d.blockConfig.volumeRatio ?? 1.25))),
        maxVolumeMultiplier: Math.min(2.5, Math.max(2.25, asNum(b.maxVolumeMultiplier, d.blockConfig.maxVolumeMultiplier ?? 2.25))),
        pfRatio: Math.min(5, Math.max(1.25, asNum(b.pfRatio, d.blockConfig.pfRatio ?? 1.45))),
        pauseCountRatio: Math.min(6, Math.max(1, Math.round(asNum(b.pauseCountRatio, d.blockConfig.pauseCountRatio ?? 2)))),
        evalPosCount: Math.min(16, Math.max(1, Math.round(asNum(b.evalPosCount, d.blockConfig.evalPosCount ?? 16)))),
        activeLive: asBool(b.activeLive, d.blockConfig.activeLive ?? true),
        minActiveLevel: Math.min(16, Math.max(0, Math.round(asNum(b.minActiveLevel, d.blockConfig.minActiveLevel ?? 0)))),
        stack: asBool((b as { stack?: boolean }).stack, d.blockConfig.stack ?? true),
        windows: asBool((b as { windows?: boolean }).windows, d.blockConfig.windows ?? true),
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
      ? STAGE_HOURS.filter((h) => raw.evalHours!.includes(h))
      : [...STAGE_HOURS],
    evalLastNs: Array.isArray(raw.evalLastNs)
      ? LANE_EVAL_NS.filter((n) => raw.evalLastNs!.includes(n))
      : [...LANE_EVAL_NS],
    sessionPhase:
      raw.sessionPhase === "paused" || raw.sessionPhase === "stopped" || raw.sessionPhase === "idle" || raw.sessionPhase === "running"
        ? raw.sessionPhase
        : "running",
    hedgeMode: asBool((raw as { hedgeMode?: boolean }).hedgeMode, true),
    marginMode: (raw as { marginMode?: string }).marginMode === "isolated" ? "isolated" : "cross",
    useMaxLeverage: asBool((raw as { useMaxLeverage?: boolean }).useMaxLeverage, true),
    leverage: Math.min(150, Math.max(1, Math.round(asNum((raw as { leverage?: number }).leverage, 125)))),
    minSizeRatio: Math.min(2, Math.max(1, asNum((raw as { minSizeRatio?: number }).minSizeRatio, 1.08))),
  };
  if (!snap.evalHours.length) snap.evalHours = [...STAGE_HOURS];
  if (!snap.evalLastNs.length) snap.evalLastNs = [...LANE_EVAL_NS];
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
