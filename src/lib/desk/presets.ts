import { DEFAULT_BLOCK_CONFIG, DEFAULT_TACTIC_CONFIG, DEFAULT_THRESHOLDS, DEFAULT_STRATEGY_TOGGLES, DEFAULT_ENABLED_KINDS, LIVE_BLOCK_COUNTS, LIVE_ENABLED_KINDS, X01_DEFAULTS } from "./engine.ts";
import type { DeskSettingsSnap } from "./settings-sync.ts";

export interface SettingsPreset {
  id: string;
  label: string;
  blurb: string;
  builtin: boolean;
  patch: Partial<DeskSettingsSnap>;
}

const LIVE_CFG = {
  ...DEFAULT_TACTIC_CONFIG,
  trailingPct: 1.5,
  slAtr: 0.9,
  tpRatio: 1.6,
  dcaCount: 1,
  maxHoldBars: 8,
  maxHoldTicks: 20000,
};

const BLOCK_LIVE = {
  ...DEFAULT_BLOCK_CONFIG,
  counts: [...LIVE_BLOCK_COUNTS],
  maxMultiple: 6,
  evalPosCount: 6,
  evalLastNs: [1, 2, 3, 4, 5, 6],
  volumeMode: "parallel" as const,
  sides: "both" as const,
  volumeRatio: 0.4,
  pauseCountRatio: 0,
  keepAdjusted: true,
};

export const BUILTIN_PRESETS: SettingsPreset[] = [
  {
    id: "x01-live",
    label: "x01 live",
    blurb: "Mainnet · 50 symbols · trail 1.4 · SL 0.9 · TP 1.6 · Block 1–6 positive",
    builtin: true,
    patch: {
      activeConnId: "bingx-x01",
      symbolCount: 50,
      tactic: "trailing",
      rangeType: "geometric",
      tacticConfig: { ...LIVE_CFG },
      blockConfig: { ...BLOCK_LIVE, minRelPf: X01_DEFAULTS.minPf },
      thresholds: { ...DEFAULT_THRESHOLDS, minPf: X01_DEFAULTS.minPf },
      liveTape: true,
      hedgeMode: true,
      marginMode: "cross",
      useMaxLeverage: true,
      leverage: 0,
      sessionPhase: "running",
      comboOnlyPositive: true,
    },
  },
  {
    id: "vst-paper",
    label: "VST paper",
    blurb: "Demo VST-02 · hybrid / geometric · 50 symbols",
    builtin: true,
    patch: {
      activeConnId: "bingx-vst-02",
      symbolCount: 50,
      tactic: "hybrid",
      rangeType: "geometric",
      tacticConfig: { ...LIVE_CFG },
      blockConfig: { ...BLOCK_LIVE },
      liveTape: true,
      sessionPhase: "running",
    },
  },
  {
    id: "strict-pf",
    label: "Strict PF",
    blurb: "Min PF 2.0 · last-N 12 disable at 2.0 · Block 1–3",
    builtin: true,
    patch: {
      tactic: "trailing",
      rangeType: "geometric",
      tacticConfig: { ...LIVE_CFG },
      thresholds: { ...DEFAULT_THRESHOLDS, minPf: 2 },
      blockConfig: {
        ...BLOCK_LIVE,
        counts: [1, 2, 3],
        evalLastNs: [1, 2, 3],
        maxMultiple: 3,
        minRelPf: 2,
        liveDisableMinPf: 2,
      },
      lastN: 12,
    },
  },
  {
    id: "conservative",
    label: "Conservative",
    blurb: "25 symbols · one side · Block 1–2 · higher SL",
    builtin: true,
    patch: {
      symbolCount: 25,
      tactic: "trailing",
      rangeType: "geometric",
      tacticConfig: { ...LIVE_CFG, slAtr: 1.1, tpRatio: 1.6, trailingPct: 1.5 },
      blockConfig: { ...BLOCK_LIVE, counts: [1, 2], maxMultiple: 2, evalLastNs: [1, 2, 3], sides: "one" },
      thresholds: { ...DEFAULT_THRESHOLDS, minPf: X01_DEFAULTS.minPf },
    },
  },
  {
    id: "block-core",
    label: "Block 1–3",
    blurb: "Only proven Block windows · stack + windows · parallel",
    builtin: true,
    patch: {
      blockConfig: {
        ...BLOCK_LIVE,
        counts: [1, 2, 3],
        maxMultiple: 3,
        evalLastNs: [1, 2, 3],
        evalPosCount: 6,
      },
    },
  },
  {
    id: "short-block-live",
    label: "Short + Block",
    blurb: "x01 · 50 · indications only · short TP/SL · Block Active 1-step · min PF 1.8",
    builtin: true,
    patch: {
      activeConnId: "bingx-x01",
      symbolCount: 50,
      tactic: "trailing",
      rangeType: "atr",
      orderType: "limit",
      tacticConfig: {
        ...LIVE_CFG,
        shortRange: true,
        tpAtr: 0.2,
        slOfTp: 0.5,
        slAtr: 0.1,
        tpRatio: 2,
        axisLevels: 5,
        maxHoldBars: 8,
        maxHoldTicks: 16,
      },
      blockConfig: {
        ...BLOCK_LIVE,
        counts: [1],
        maxMultiple: 1,
        minMultiple: 1,
        evalLastNs: [1],
        evalPosCount: 1,
        minActiveLevel: 1,
        activeLive: true,
        relAdditive: true,
        relVolumeRatio: 0.4,
        minRelPf: 1.8,
        liveLastN: 12,
        liveDisable: true,
        liveDisableMinPf: 1.8,
        liveDisableMinSamples: 4,
        symbolEvalHours: 100,
        hourCoord: true,
        autoEval: true,
      },
      thresholds: { ...DEFAULT_THRESHOLDS, minPf: 1.8, maxMdd: 0.12, minWr: 0.55, minVf: 1.12, maxDdt: 18 },
      enabledKinds: [...DEFAULT_ENABLED_KINDS],
      liveTape: true,
      comboOnlyPositive: true,
      comboTactic: "all",
      comboRange: "all",
      evalHours: [4, 8, 16],
      evalLastNs: [5, 10, 15],
      lastN: 12,
      lastNs: { picks: 12, lanes: 12, last: 12, ongoing: 12, next: 12, combos: 12 },
      lastNLinked: true,
      hedgeMode: true,
      marginMode: "cross",
      useMaxLeverage: true,
      leverage: 0,
      minSizeRatio: 1.08,
      sessionPhase: "running",
      strategyToggles: { ...DEFAULT_STRATEGY_TOGGLES, normal: false, trailing: true, axis: true, block: true, dca: false },
    },
  },
  {
    id: "stable-01",
    label: "Stable 01",
    blurb: "x01 live snapshot · 50 · trailing/atr · short 0.35/1.5 · Block 1–6 parallel Active · min PF 1.8",
    builtin: true,
    patch: {
      activeConnId: "bingx-x01",
      symbolCount: 50,
      tactic: "trailing",
      rangeType: "atr",
      orderType: "limit",
      costStep: 10,
      strategyId: "normal",
      tacticConfig: {
        trailingPct: 1.5,
        dcaCount: 1,
        dcaDrawdown: 0.8,
        axisSpacing: 0.7,
        axisLevels: 5,
        slAtr: 0.525,
        tpRatio: 0.667,
        tpAtr: 0.35,
        slOfTp: 1.5,
        shortRange: true,
        maxHoldBars: 8,
        maxHoldTicks: 16,
      },
      blockConfig: {
        ...BLOCK_LIVE,
        enabled: true,
        counts: [1, 2, 3, 4, 5, 6],
        maxMultiple: 6,
        minMultiple: 1,
        addOnWin: false,
        flattenConflict: false,
        endStageOnly: false,
        cadence: 4,
        overall: true,
        volumeRatio: 0.4,
        maxVolumeMultiplier: 1.8,
        pfRatio: 1.45,
        pauseCountRatio: 0,
        evalPosCount: 6,
        activeLive: true,
        minActiveLevel: 1,
        keepAdjusted: true,
        stack: true,
        windows: true,
        volumeMode: "parallel",
        sides: "both",
        evalHours: 2,
        autoEval: true,
        relAdditive: true,
        relVolumeRatio: 0.4,
        minRelPf: 1.05,
        evalLastNs: [1, 2, 3, 4, 5, 6],
        liveLastN: 12,
        liveDisable: true,
        liveDisableMinPf: 1.8,
        liveDisableMinSamples: 4,
        symbolEvalHours: 100,
        hourCoord: true,
      },
      thresholds: { ...DEFAULT_THRESHOLDS, minPf: 1.8, basePf: 1.1, axisPf: 1.5, blockPf: 1.6, shortPf: 1.2, shortBasePf: 0.8, maxMdd: 0.12, minWr: 0.55, minVf: 1.12, maxDdt: 18 },
      enabledKinds: [...DEFAULT_ENABLED_KINDS],
      liveTape: true,
      comboOnlyPositive: true,
      comboTactic: "all",
      comboRange: "all",
      evalHours: [4, 8, 16],
      evalLastNs: [5, 10, 15],
      lastN: 10,
      lastNs: { picks: 10, lanes: 10, last: 10, ongoing: 10, next: 10, combos: 10 },
      lastNLinked: true,
      hedgeMode: true,
      marginMode: "cross",
      useMaxLeverage: true,
      leverage: 0,
      minSizeRatio: 1.08,
      sessionPhase: "running",
      strategyToggles: { normal: false, trailing: true, axis: true, block: true, dca: false },
    },
  },
  {
    id: "stable-02",
    label: "Stable 02",
    blurb: "x01 · 50 · short 0.35/1.5 · Axis full rungs · Block 1–6 0.4 · PF 1.35/1.0/1.15/1.2 · short 0.95/0.7",
    builtin: true,
    patch: {
      activeConnId: "bingx-x01",
      symbolCount: 50,
      tactic: "trailing",
      rangeType: "atr",
      orderType: "limit",
      costStep: 10,
      strategyId: "normal",
      tacticConfig: {
        trailingPct: 1.5,
        dcaCount: 1,
        dcaDrawdown: 0.8,
        axisSpacing: 0.7,
        axisLevels: 5,
        axisPartialRatio: 1,
        slAtr: 0.525,
        tpRatio: 0.667,
        tpAtr: 0.35,
        slOfTp: 1.5,
        shortRange: true,
        maxHoldBars: 8,
        maxHoldTicks: 16,
      },
      blockConfig: {
        ...BLOCK_LIVE,
        enabled: true,
        counts: [1, 2, 3, 4, 5, 6],
        maxMultiple: 6,
        minMultiple: 1,
        addOnWin: false,
        flattenConflict: false,
        endStageOnly: false,
        cadence: 4,
        overall: true,
        volumeRatio: 0.4,
        maxVolumeMultiplier: 1.8,
        pfRatio: 1.45,
        pauseCountRatio: 0,
        evalPosCount: 6,
        activeLive: true,
        minActiveLevel: 1,
        keepAdjusted: true,
        stack: true,
        windows: true,
        volumeMode: "parallel",
        sides: "both",
        evalHours: 2,
        autoEval: true,
        relAdditive: true,
        relVolumeRatio: 0.4,
        minRelPf: 1.2,
        evalLastNs: [1, 2, 3, 4, 5, 6],
        liveLastN: 12,
        liveDisable: true,
        liveDisableMinPf: 1.2,
        liveDisableMinSamples: 4,
        symbolEvalHours: 100,
        hourCoord: true,
      },
      thresholds: {
        ...DEFAULT_THRESHOLDS,
        minPf: 1.35,
        basePf: 1,
        axisPf: 1.15,
        blockPf: 1.2,
        shortPf: 0.95,
        shortBasePf: 0.7,
        maxMdd: 0.12,
        minWr: 0.55,
        minVf: 1.12,
        maxDdt: 18,
      },
      enabledKinds: [...DEFAULT_ENABLED_KINDS],
      liveTape: true,
      comboOnlyPositive: true,
      comboTactic: "all",
      comboRange: "all",
      evalHours: [4, 8, 16],
      evalLastNs: [5, 10, 15],
      lastN: 10,
      lastNs: { picks: 10, lanes: 10, last: 10, ongoing: 10, next: 10, combos: 10 },
      lastNLinked: true,
      hedgeMode: true,
      marginMode: "cross",
      useMaxLeverage: true,
      leverage: 0,
      minSizeRatio: 1.08,
      sessionPhase: "running",
      strategyToggles: { normal: false, trailing: true, axis: true, block: true, dca: false },
    },
  },
];

export const PRESET_STORAGE_KEY = "cts-a-settings-presets";

export function sanitizePreset(raw: unknown): SettingsPreset | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<SettingsPreset>;
  const id = typeof p.id === "string" ? p.id.trim().slice(0, 48) : "";
  const label = typeof p.label === "string" ? p.label.trim().slice(0, 40) : "";
  if (!id || !label) return null;
  return {
    id,
    label,
    blurb: typeof p.blurb === "string" ? p.blurb.trim().slice(0, 120) : "Saved preset",
    builtin: false,
    patch: p.patch && typeof p.patch === "object" ? (p.patch as Partial<DeskSettingsSnap>) : {},
  };
}

export function sanitizeUserPresets(raw: unknown): SettingsPreset[] {
  if (!Array.isArray(raw)) return [];
  const out: SettingsPreset[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    const p = sanitizePreset(row);
    if (!p || p.builtin || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
    if (out.length >= 24) break;
  }
  return out;
}

export function allPresets(user: SettingsPreset[]): SettingsPreset[] {
  const ids = new Set(BUILTIN_PRESETS.map((p) => p.id));
  return [...BUILTIN_PRESETS, ...user.filter((p) => !ids.has(p.id))];
}

export function findPreset(id: string, user: SettingsPreset[]): SettingsPreset | undefined {
  return allPresets(user).find((p) => p.id === id);
}

export function presetIdOf(label: string) {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  return `user-${slug || "preset"}-${Date.now().toString(36).slice(-6)}`;
}
