import { DEFAULT_BLOCK_CONFIG, DEFAULT_TACTIC_CONFIG, DEFAULT_THRESHOLDS, LIVE_BLOCK_COUNTS, X01_DEFAULTS } from "./engine.ts";
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
  trailingPct: 1.4,
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
  volumeRatio: 0.08,
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
      tacticConfig: { ...LIVE_CFG, slAtr: 1.1, tpRatio: 1.6, trailingPct: 1.4 },
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
    blurb: "x01 · 50 · short TP 0.2–0.4 × SL 0.5–1.5 · Block 1–6 · min PF 1.8 · last-N 12 disable",
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
        enabled: true,
        overall: true,
        activeLive: true,
        relAdditive: true,
        relVolumeRatio: 0.08,
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
      enabledKinds: ["normal", "trend", "mean", "breakout", "volume", "hybrid", "active", "block", "short"],
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
