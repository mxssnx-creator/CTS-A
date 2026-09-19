import { create } from "zustand";
import type {
  AutoValidateResult,
  BlockConfig,
  Connection,
  ExchangeBook,
  FeedStatus,
  LastNConfig,
  LastNStage,
  NetworkMode,
  OrderTypeId,
  PaperOrder,
  RangeType,
  Side,
  StageEvalBundle,
  StrategyKind,
  TacticConfig,
  TacticKind,
  Thresholds,
  VstEngine,
} from "./types";
import type { CompleteComputeReport } from "./vst";
import type { ReplaySimBundle } from "./replay-run";
import {
  COST_STEPS,
  DEFAULT_BLOCK_CONFIG,
  DEFAULT_ENABLED_KINDS,
  DEFAULT_LAST_N,
  DEFAULT_LAST_N_CONFIG,
  DEFAULT_TACTIC_CONFIG,
  DEFAULT_THRESHOLDS,
  DESK,
  LANE_EVAL_NS,
  LAST_N_OPTIONS,
  STAGE_HOURS,
  STRATEGY_KINDS,
  clampLastN,
  combosFiltered,
  pickBestCombo,
  WARMUP,
  snapTpRatio,
  strategiesForKinds,
  type ReplayRangeId,
} from "./engine";
import {
  adjustActiveBlocks,
  applyUniverse,
  armUniverse,
  cancelLiveOrder,
  clampSymbolCount,
  enqueueManual,
  haltEngine,
  healEngine,
  initVstEngine,
  ensureEngine,
  isDeskConn,
  resetBook,
  resetSession as resetVstSession,
  requeueFree,
  simulateHours,
  completeComputations,
  completeComputationsAsync,
  syncConnections,
  tickVst,
  universeSymbols,
  vstConnections,
  VST_DEFAULT_CONN,
  VST_TICK_MS,
  mirrorEffectiveLanes,
} from "./vst";
import { completeHoursFor, replayHoursFor, runReplaySimulation } from "./replay-run";
import { autoValidateConfigs, evaluateStages, liveLastNEvals } from "./validate";
import {
  applyLiveTape,
  LIVE_SET,
  MAX_LIVE_NOTIONAL,
  pingBingxAccount,
  placeBingxOrder,
  pullLiveTape,
  pullExchangeBook,
  deskCredentialStatus,
  loadLiveDesk,
} from "./feed";
import { pinDeskScroll } from "./scroll-pane";

import {
  collectDeskSettings,
  loadDeskSettings,
  persistDeskSettings,
  readLocalSettings,
  sanitizeDeskSettings,
  settingsDiffer,
  writeLocalSettings,
  type DeskSettingsSnap,
} from "./settings-sync";
import { BUILTIN_PRESETS, findPreset, presetIdOf, type SettingsPreset } from "./presets";

const vault: Record<string, { apiKey: string; secret: string }> = {};

export type { TacticConfig, Thresholds };

interface DeskStore {
  symbol: string;
  strategyId: string;
  lastN: (typeof LAST_N_OPTIONS)[number];
  lastNs: LastNConfig;
  lastNLinked: boolean;
  costStep: number;
  rangeType: RangeType;
  tactic: TacticKind;
  replayIndex: number;
  replayPlaying: boolean;
  replaySpeed: 1 | 2 | 4;
  replayRangeId: ReplayRangeId;
  replaySim: ReplaySimBundle | null;
  replayComplete: CompleteComputeReport | null;
  thresholds: Thresholds;
  tacticConfig: TacticConfig;
  blockConfig: BlockConfig;
  connections: Connection[];
  comboOnlyPositive: boolean;
  comboTactic: TacticKind | "all";
  comboRange: RangeType | "all";
  tick: number;
  strategyParams: Record<string, number>;
  orders: PaperOrder[];
  ticketMsg: string;
  vst: VstEngine;
  liveTape: boolean;
  feed: FeedStatus;
  symbolCount: number;
  orderType: OrderTypeId;
  enabledKinds: StrategyKind[];
  activeConnId: string;
  validation: AutoValidateResult | null;
  stageEval: StageEvalBundle | null;
  evalHours: number[];
  evalLastNs: number[];
  sessionPhase: "idle" | "running" | "paused" | "stopped";
  hedgeMode: boolean;
  marginMode: "cross" | "isolated";
  useMaxLeverage: boolean;
  leverage: number;
  minSizeRatio: number;
  activePresetId: string;
  userPresets: import("./presets").SettingsPreset[];
  exchange: ExchangeBook | null;
  settingsRev: number;
  settingsAt: number;
  settingsSource: "boot" | "local" | "server";
  setSymbol: (symbol: string) => void;
  setStrategy: (id: string) => void;
  setLastN: (n: DeskStore["lastN"]) => void;
  setLastNStage: (stage: LastNStage, n: DeskStore["lastN"]) => void;
  setLastNLinked: (on: boolean) => void;
  setLastNConfig: (partial: Partial<LastNConfig>) => void;
  applyLastNAll: (n: DeskStore["lastN"]) => void;
  resetSettings: () => void;
  setCostStep: (n: number) => void;
  setRangeType: (r: RangeType) => void;
  setTactic: (t: TacticKind) => void;
  setReplayIndex: (i: number) => void;
  setReplayPlaying: (v: boolean) => void;
  setReplaySpeed: (s: 1 | 2 | 4) => void;
  setReplayRangeId: (id: ReplayRangeId) => void;
  runReplaySim: (hours?: number, withComplete?: boolean) => ReplaySimBundle | null;
  runReplayComplete: (hours?: number[]) => CompleteComputeReport | null;
  setThresholds: (p: Partial<Thresholds>) => void;
  setTacticConfig: (p: Partial<TacticConfig>) => void;
  setBlockConfig: (p: Partial<BlockConfig>) => void;
  setComboOnlyPositive: (v: boolean) => void;
  setComboTactic: (t: TacticKind | "all") => void;
  setComboRange: (r: RangeType | "all") => void;
  bumpTick: () => void;
  toggleOrderType: (connId: string, ot: OrderTypeId) => void;
  setConnectionStatus: (connId: string, status: Connection["status"]) => void;
  toggleSymbolOnConn: (connId: string, symbol: string) => void;
  testConnection: (connId: string) => void;
  setStrategyParam: (key: string, value: number) => void;
  resetStrategyParams: (strategyId: string) => void;
  placePaperOrder: (input: {
    connId: string;
    symbol: string;
    side: Side;
    type: OrderTypeId;
    cost: number;
    price?: number;
    note?: string;
  }) => boolean;
  cancelOrder: (id: string) => void;
  tickEngine: () => void;
  setEngineRunning: (v: boolean) => void;
  startEngine: () => void;
  pauseEngine: () => void;
  stopEngine: () => void;
  resetSession: () => void;
  rearmsUniverse: () => void;
  applyLiveConfig: () => void;
  applyBestCombo: () => void;
  runSimHours: (hours: number) => void;
  autoValidate: () => AutoValidateResult;
  runStageEval: () => StageEvalBundle;
  setEvalHours: (hours: number[]) => void;
  setEvalLastNs: (ns: number[]) => void;
  setLiveTape: (v: boolean) => void;
  pullTape: () => Promise<void>;
  setNetwork: (connId: string, network: NetworkMode) => void;
  setConnKeys: (connId: string, apiKey: string, secret: string) => void;
  armMainnet: (connId: string, on: boolean) => void;
  setLiveExec: (p: Partial<{ hedgeMode: boolean; marginMode: "cross" | "isolated"; useMaxLeverage: boolean; leverage: number; minSizeRatio: number }>) => void;
  pingLive: (connId: string) => Promise<void>;
  hydrateCredentials: () => Promise<void>;
  pullExchange: () => Promise<void>;
  connectActive: () => Promise<void>;
  applyLiveDesk: (live: Awaited<ReturnType<typeof loadLiveDesk>> | null) => void;
  pullLiveDesk: () => Promise<void>;
  liveSession: Record<string, unknown> | null;
  liveOverall: Record<string, unknown> | null;
  liveElapsed: number;
  liveMark: number;
  hydrateSettings: () => Promise<void>;
  pullRemoteSettings: () => Promise<void>;
  applySettingsSnap: (snap: DeskSettingsSnap, source: "local" | "server") => void;
  applyPreset: (id: string) => void;
  savePreset: (label: string) => string;
  deletePreset: (id: string) => void;
  setSymbolCount: (n: number) => void;
  setOrderType: (t: OrderTypeId) => void;
  toggleKind: (k: StrategyKind) => void;
  setActiveConn: (id: string) => void;
  watchdog: () => void;
  syncSettings: () => void;
}

let ticking = false;
let pulling = false;
let bookPulling = false;
let deskPulling = false;
let tickStartedAt = 0;
let pullStartedAt = 0;
let bookPullStartedAt = 0;
let deskPullStartedAt = 0;
let lastLiveMarkAt = 0;
let lastSeenTick = 0;
let stallBeats = 0;
let persistTimer = 0;
let applyingRemote = false;

function snapshotVst(e: VstEngine): VstEngine {
  ensureEngine(e);
  return {
    ...e,
    tokens: { ...e.tokens },
    stats: { ...e.stats },
    ledger: { ...e.ledger },
  };
}

function alignConnOrders(conns: Connection[], orderType: OrderTypeId): Connection[] {
  return conns.map((c) =>
    isDeskConn(c.id) && !c.orderTypesEnabled.includes(orderType)
      ? { ...c, orderTypesEnabled: [...c.orderTypesEnabled, orderType] }
      : c,
  );
}

function queuePersist(snap: DeskSettingsSnap) {
  writeLocalSettings(snap);
  if (typeof window === "undefined") return;
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    void persistDeskSettings({ data: snap }).catch(() => undefined);
    void fetch("/desk-settings.json", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(snap),
    }).catch(() => undefined);
  }, 280);
}

const boot = initVstEngine(DEFAULT_TACTIC_CONFIG, { warmup: 0, symbolCount: 12 });
boot.activeConnId = "bingx-vst-02";
boot.running = false;
boot.phase = "idle";
boot.sim = null;
boot.queue = [];
boot.orders = [];
boot.lastMsg = `Ready · BingX VST-02 · ${boot.symbolCount} symbols`;

function trimConnSymbols(conns: Connection[], count: number): Connection[] {
  const ids = universeSymbols(count).map((s) => s.id);
  return conns.map((c) => {
    const kept = c.symbols.filter((id) => ids.includes(id));
    return {
      ...c,
      maxSymbols: count,
      symbols: kept.length ? kept : ids,
    };
  });
}

export const useDesk = create<DeskStore>((set, get) => ({
  symbol: "BTCUSDT",
  strategyId: "normal",
  lastN: DEFAULT_LAST_N,
  lastNs: { ...DEFAULT_LAST_N_CONFIG },
  lastNLinked: true,
  costStep: 10,
  rangeType: "atr",
  tactic: "hybrid",
  replayIndex: WARMUP,
  replayPlaying: false,
  replaySpeed: 1,
  replayRangeId: "2d" as ReplayRangeId,
  replaySim: null,
  replayComplete: null,
  thresholds: { ...DEFAULT_THRESHOLDS },
  tacticConfig: { ...DEFAULT_TACTIC_CONFIG },
  blockConfig: { ...DEFAULT_BLOCK_CONFIG },
  connections: syncConnections(vstConnections(), boot),
  comboOnlyPositive: true,
  comboTactic: "all",
  comboRange: "all",
  tick: 0,
  strategyParams: {},
  orders: [],
  ticketMsg: boot.lastMsg,
  vst: snapshotVst(boot),
  liveTape: true,
  feed: { state: "idle", venue: "bingx", latencyMs: 0, at: 0, count: 0, missing: 0 },
  symbolCount: 50,
  orderType: "limit",
  enabledKinds: [...DEFAULT_ENABLED_KINDS],
  activeConnId: "bingx-vst-02",
  validation: null,
  stageEval: null,
  evalHours: [...STAGE_HOURS],
  evalLastNs: [...LANE_EVAL_NS],
  sessionPhase: "idle" as const,
  hedgeMode: true,
  marginMode: "cross" as const,
  useMaxLeverage: true,
  leverage: 125,
  minSizeRatio: 1.08,
  activePresetId: "",
  userPresets: [] as SettingsPreset[],
  exchange: null,
  liveSession: null,
  liveOverall: null,
  liveElapsed: 0,
  liveMark: 0,
  settingsRev: 0,
  settingsAt: 0,
  settingsSource: "boot",
  setSymbol: (symbol) =>
    set({
      symbol,
      replayIndex: (DESK.candles[symbol]?.length ?? 1) - 1,
      replayPlaying: false,
    }),
  setStrategy: (strategyId) => {
    set({ strategyId });
    get().syncSettings();
  },
  setLastN: (lastN) => {
    const n = clampLastN(lastN);
    set({
      lastN: n,
      lastNs: get().lastNLinked
        ? { picks: n, lanes: n, last: n, ongoing: n, next: n, combos: n }
        : { ...get().lastNs, picks: n },
    });
    get().syncSettings();
  },
  setLastNStage: (stage, lastN) => {
    const n = clampLastN(lastN);
    const lastNs = { ...get().lastNs, [stage]: n };
    const vals = Object.values(lastNs);
    const linked = vals.every((v) => v === vals[0]);
    set({
      lastNs,
      lastNLinked: linked,
      lastN: stage === "picks" ? n : get().lastN,
    });
    get().syncSettings();
  },
  setLastNLinked: (on) => {
    if (on) {
      const n = get().lastN;
      set({
        lastNLinked: true,
        lastNs: { picks: n, lanes: n, last: n, ongoing: n, next: n, combos: n },
      });
      get().syncSettings();
      return;
    }
    set({ lastNLinked: false });
    get().syncSettings();
  },
  setLastNConfig: (partial) => {
    const lastNs = { ...get().lastNs };
    for (const stage of Object.keys(lastNs) as LastNStage[]) {
      const next = partial[stage];
      if (typeof next === "number") lastNs[stage] = clampLastN(next);
    }
    const vals = Object.values(lastNs);
    const linked = vals.every((v) => v === vals[0]);
    set({
      lastNs,
      lastNLinked: linked,
      lastN: clampLastN(lastNs.picks),
    });
    get().syncSettings();
  },
  applyLastNAll: (lastN) => {
    const n = clampLastN(lastN);
    set({
      lastN: n,
      lastNLinked: true,
      lastNs: { picks: n, lanes: n, last: n, ongoing: n, next: n, combos: n },
    });
    get().syncSettings();
  },
  resetSettings: () => {
    set({
      lastN: DEFAULT_LAST_N,
      lastNs: { ...DEFAULT_LAST_N_CONFIG },
      lastNLinked: true,
      evalHours: [...STAGE_HOURS],
      evalLastNs: [...LANE_EVAL_NS],
      stageEval: null,
      costStep: 10,
      rangeType: "atr",
      tactic: "hybrid",
      strategyId: "normal",
      thresholds: { ...DEFAULT_THRESHOLDS },
      tacticConfig: { ...DEFAULT_TACTIC_CONFIG },
      blockConfig: { ...DEFAULT_BLOCK_CONFIG },
      comboOnlyPositive: true,
      comboTactic: "all",
      comboRange: "all",
      replaySpeed: 1,
      strategyParams: {},
      symbolCount: 50,
      orderType: "limit",
      enabledKinds: [...DEFAULT_ENABLED_KINDS],
      validation: null,
      hedgeMode: true,
      marginMode: "cross" as const,
      useMaxLeverage: true,
      leverage: 125,
      minSizeRatio: 1.08,
      activePresetId: "",
    });
    get().applyLiveConfig();
  },
  setCostStep: (costStep) => {
    set({ costStep: Math.min(30, Math.max(3, costStep)) });
    get().syncSettings();
  },
  setRangeType: (rangeType) => {
    set({ rangeType });
    get().applyLiveConfig();
  },
  setTactic: (tactic) => {
    set({ tactic });
    get().applyLiveConfig();
  },
  setReplayIndex: (replayIndex) => set({ replayIndex }),
  setReplayPlaying: (replayPlaying) => set({ replayPlaying }),
  setReplaySpeed: (replaySpeed) => {
    set({ replaySpeed });
    get().syncSettings();
  },
  setReplayRangeId: (replayRangeId) => {
    set({ replayRangeId, replayIndex: WARMUP, replayPlaying: false });
    get().syncSettings();
  },
  runReplaySim: (hours, withComplete = true) => {
    try {
      const h = hours ?? replayHoursFor(get().replayRangeId);
      const bundle = runReplaySimulation(h, get().tacticConfig, get().tactic, get().rangeType, {
        symbolCount: Math.min(8, get().symbolCount || 8),
        complete: false,
      });
      const e = get().vst;
      e.sim = bundle.report;
      e.lastMsg = bundle.report.passed
        ? `Replay ${bundle.hours}h · ${bundle.tactic}/${bundle.range} · PF ${bundle.report.pf.toFixed(2)} · ${bundle.report.trades} trades`
        : `Replay ${bundle.hours}h · ${bundle.report.issues[0] ?? "check"}`;
      set({
        replaySim: bundle,
        replayComplete: bundle.complete ?? get().replayComplete,
        vst: { ...e },
        ticketMsg: e.lastMsg,
      });
      if (withComplete && typeof window !== "undefined") {
        const hoursList = completeHoursFor(h, { cap: 48 });
        void completeComputationsAsync(get().tacticConfig, {
          symbolCount: Math.min(6, get().symbolCount || 6),
          hours: hoursList,
          yieldFn: () => new Promise((r) => window.setTimeout(r, 0)),
          onCell: (cell, i, total) => {
            if (i === 1 || i === total || i % 5 === 0) {
              set({
                ticketMsg: `Compute ${i}/${total} ${cell.tactic}/${cell.range} ${cell.hours}h PF ${cell.pf.toFixed(2)}`,
              });
            }
          },
        })
          .then((complete) => {
            const prev = get().replaySim;
            const w = complete.winner;
            set({
              replayComplete: complete,
              replaySim: prev ? { ...prev, complete } : prev,
              ticketMsg: w
                ? `Complete ${complete.cells.length} cells · ${w.tactic}/${w.range} ${w.hours}h PF ${w.pf.toFixed(2)}`
                : "Complete compute empty",
            });
          })
          .catch((err) => {
            set({ ticketMsg: err instanceof Error ? err.message : "complete compute failed" });
          });
      }
      return bundle;
    } catch (err) {
      set({ ticketMsg: err instanceof Error ? err.message : "replay sim failed" });
      return null;
    }
  },
  runReplayComplete: (hours) => {
    try {
      const h = hours ?? completeHoursFor(replayHoursFor(get().replayRangeId));
      const complete = completeComputations(get().tacticConfig, {
        symbolCount: Math.min(8, get().symbolCount || 8),
        hours: h,
      });
      const e = get().vst;
      const w = complete.winner;
      e.lastMsg = w
        ? `Complete ${complete.cells.length} cells · ${w.tactic}/${w.range} ${w.hours}h PF ${w.pf.toFixed(2)}`
        : "Complete compute empty";
      set({ replayComplete: complete, vst: { ...e }, ticketMsg: e.lastMsg });
      return complete;
    } catch (err) {
      set({ ticketMsg: err instanceof Error ? err.message : "complete compute failed" });
      return null;
    }
  },
  setThresholds: (p) => {
    set({ thresholds: { ...get().thresholds, ...p } });
    get().syncSettings();
  },
  setTacticConfig: (p) => {
    set({
      tacticConfig: { ...get().tacticConfig, ...p, tpRatio: snapTpRatio(p.tpRatio ?? get().tacticConfig.tpRatio) },
    });
    get().applyLiveConfig();
  },
  setBlockConfig: (p) => {
    set({ blockConfig: { ...get().blockConfig, ...p } });
    get().syncSettings();
  },
  setComboOnlyPositive: (comboOnlyPositive) => {
    set({ comboOnlyPositive });
    get().syncSettings();
  },
  setComboTactic: (comboTactic) => {
    set({ comboTactic });
    get().syncSettings();
  },
  setComboRange: (comboRange) => {
    set({ comboRange });
    get().syncSettings();
  },
  bumpTick: () => set({ tick: get().tick + 1 }),
  toggleOrderType: (connId, ot) =>
    set({
      connections: get().connections.map((c) => {
        if (c.id !== connId) return c;
        const has = c.orderTypesEnabled.includes(ot);
        const next = has
          ? c.orderTypesEnabled.filter((x) => x !== ot)
          : [...c.orderTypesEnabled, ot];
        return {
          ...c,
          orderTypesEnabled: next.length ? next : [ot],
        };
      }),
    }),
  setConnectionStatus: (connId, status) =>
    set({
      connections: get().connections.map((c) => (c.id === connId ? { ...c, status } : c)),
    }),
  toggleSymbolOnConn: (connId, symbol) =>
    set({
      connections: get().connections.map((c) => {
        if (c.id !== connId) return c;
        if (c.symbols.includes(symbol)) {
          return { ...c, symbols: c.symbols.filter((x) => x !== symbol) };
        }
        if (c.symbols.length >= (c.maxSymbols || 50)) return c;
        return { ...c, symbols: [...c.symbols, symbol] };
      }),
    }),
  testConnection: (connId) => {
    void get().pingLive(connId).then(() => get().pullExchange());
  },
  setStrategyParam: (key, value) =>
    set({ strategyParams: { ...get().strategyParams, [key]: value } }),
  resetStrategyParams: (strategyId) => {
    const next = { ...get().strategyParams };
    for (const k of Object.keys(next)) {
      if (k.startsWith(strategyId + ":")) delete next[k];
    }
    set({ strategyParams: next });
  },
  placePaperOrder: (input) => {
    try {
    const conn = get().connections.find((c) => c.id === input.connId);
    if (!conn || !isDeskConn(conn.id)) {
      set({ ticketMsg: "Unknown desk connection." });
      return false;
    }
    const e = get().vst;
    const msg = enqueueManual(e, {
      connId: input.connId,
      symbol: input.symbol,
      side: input.side,
      type: input.type,
      cost: input.cost,
      price: input.price,
    });
    const order: PaperOrder = {
      id: `ord-${e.seq}`,
      connId: conn.id,
      venue: conn.venue,
      symbol: input.symbol,
      side: input.side,
      type: input.type,
      qty: input.cost / (input.price ?? 1),
      price: input.price ?? 0,
      cost: input.cost,
      status: "open",
      note: input.note ?? "Paper ticket",
    };
    set({
      vst: snapshotVst(e),
      orders: [order, ...get().orders].slice(0, 40),
      ticketMsg: msg,
      connections: syncConnections(get().connections, e),
    });
    if (conn.armed && conn.network !== "paper") {
      const keys = vault[conn.id] ?? { apiKey: "", secret: "" };
      if (!keys.apiKey && !conn.hasKeys) {
        set({ ticketMsg: `${msg} · live skipped (no keys)` });
        return true;
      }
      const px = input.price ?? 1;
      const notional = Math.min(input.cost, MAX_LIVE_NOTIONAL);
      void placeBingxOrder({
        data: {
          apiKey: keys.apiKey,
          secret: keys.secret,
          network: conn.network === "testnet" ? "testnet" : "mainnet",
          symbol: input.symbol,
          side: input.side === "long" ? "BUY" : "SELL",
          positionSide: input.side === "long" ? "LONG" : "SHORT",
          quantity: notional / px,
          type: input.type === "limit" && input.price ? "LIMIT" : "MARKET",
          price: input.price,
          notional,
          confirmLive: true,
          connId: conn.id,
          slAtr: get().tacticConfig.slAtr,
          tpRatio: get().tacticConfig.tpRatio,
          attachProtect: true,
        },
      })
        .then((res) => {
          set({
            ticketMsg: res.ok
              ? `LIVE ${conn.network} fill ${res.orderId ?? ""} · ${input.symbol}`
              : `LIVE rejected: ${res.error}`,
          });
        })
        .catch((err: unknown) => {
          set({
            ticketMsg: `LIVE rejected: ${err instanceof Error ? err.message : "order failed"}`,
          });
        });
    }
    return true;
    } catch (err) {
      set({ ticketMsg: err instanceof Error ? err.message : "ticket failed" });
      return false;
    }
  },
  cancelOrder: (id) => {
    const e = get().vst;
    const live = e.orders.find((o) => o.id === id) ?? e.queue.find((o) => o.id === id);
    const paper = get().orders.find((o) => o.id === id);
    const connId = live?.connId ?? paper?.connId;
    if (connId && !isDeskConn(connId)) {
      set({ ticketMsg: "Skipped — order is not on this desk session." });
      return;
    }
    cancelLiveOrder(e, id);
    set({
      vst: snapshotVst(e),
      orders: get().orders.map((o) => (o.id === id && isDeskConn(o.connId) ? { ...o, status: "cancelled" } : o)),
      ticketMsg: e.lastMsg,
    });
  },
  tickEngine: () => {
    if (get().liveSession) return;
    const e = get().vst;
    if (ticking) {
      if (Date.now() - tickStartedAt > VST_TICK_MS * 4) {
        ticking = false;
        healEngine(e, get().tacticConfig, get().tactic, get().rangeType);
        e.lastMsg = "Heal · tick unstuck";
      } else return;
    }
    if (!e.running || e.phase === "stopped" || e.phase === "paused" || e.phase === "idle") return;
    ticking = true;
    tickStartedAt = Date.now();
    try {
      e.activeConnId = get().activeConnId;
      const live = get().liveTape && get().feed.state === "live";
      tickVst(e, get().tacticConfig, get().tactic, {
        freezeIds: live ? LIVE_SET : undefined,
        rangeType: get().rangeType,
        symbolCount: get().symbolCount,
        orderType: get().orderType,
        block: get().blockConfig,
      });
      e.phase = "running";
      lastSeenTick = e.tick;
      stallBeats = 0;
      const patch: Partial<DeskStore> = {
        vst: snapshotVst(e),
      };
      if (e.tick % 4 === 0) {
        patch.connections = syncConnections(get().connections, e);
      }
      if (e.tick % 30 === 0) {
        const prev = get().stageEval;
        if (prev) {
          patch.stageEval = {
            ...prev,
            liveNs: liveLastNEvals(e.closed, get().evalLastNs, get().thresholds.minPf),
            at: Date.now(),
          };
        }
      }
      set(patch);
    } catch {
      healEngine(e, get().tacticConfig, get().tactic, get().rangeType);
      e.running = true;
      e.phase = "running";
      e.lastMsg = e.lastHeal || "Tick recovered · book held";
      set({ vst: snapshotVst(e), ticketMsg: e.lastMsg });
    } finally {
      ticking = false;
    }
  },
  setEngineRunning: (v) => {
    if (v) get().startEngine();
    else get().pauseEngine();
  },
  startEngine: () => {
    const e = get().vst;
    const cfg = get().tacticConfig;
    const tactic = get().tactic;
    const rangeType = get().rangeType;
    e.symbolCount = get().symbolCount;
    e.orderType = get().orderType;
    e.activeConnId = get().activeConnId;
    if (!get().liveSession) requeueFree(e, cfg, tactic, rangeType, get().activeConnId);
    const from = e.phase;
    e.running = true;
    e.phase = "running";
    e.lastMsg = get().liveSession
      ? `Host ${get().activeConnId} resume · ${tactic} · ${rangeType}`
      : from === "paused"
        ? `Resumed · ${tactic} · ${rangeType}`
        : from === "stopped"
          ? `Restarted · ${tactic} · ${rangeType}`
          : `Engine running · ${tactic} · ${rangeType}`;
    set({
      vst: snapshotVst(e),
      ticketMsg: e.lastMsg,
      sessionPhase: "running",
      connections: syncConnections(get().connections, e),
    });
    get().syncSettings();
  },
  pauseEngine: () => {
    const e = get().vst;
    if (e.phase !== "running" && !get().liveSession) return;
    e.running = false;
    e.phase = "paused";
    e.lastMsg = get().liveSession ? `Host pause requested · ${get().activeConnId}` : "Paused · book frozen, press Start to resume";
    set({ vst: snapshotVst(e), ticketMsg: e.lastMsg, sessionPhase: "paused" });
    get().syncSettings();
  },
  stopEngine: () => {
    const e = get().vst;
    if (!get().liveSession && (e.phase === "stopped" || e.phase === "idle")) return;
    haltEngine(e, get().activeConnId);
    e.lastMsg = get().liveSession ? `Host stop · flatten ${get().activeConnId}` : e.lastMsg;
    set({
      vst: snapshotVst(e),
      ticketMsg: e.lastMsg,
      sessionPhase: "stopped",
      connections: syncConnections(get().connections, e),
    });
    get().syncSettings();
  },
  resetSession: () => {
    const e = get().vst;
    e.symbolCount = get().symbolCount;
    e.orderType = get().orderType;
    resetVstSession(e, get().tacticConfig, get().tactic, get().rangeType);
    e.lastMsg = get().liveSession ? `Host reset · rearm ${get().activeConnId}` : e.lastMsg;
    set({
      vst: snapshotVst(e),
      ticketMsg: e.lastMsg,
      sessionPhase: "running",
      connections: syncConnections(get().connections, e),
      orders: [],
    });
    get().syncSettings();
  },
  rearmsUniverse: () => {
    const e = get().vst;
    e.symbolCount = get().symbolCount;
    e.orderType = get().orderType;
    e.activeConnId = get().activeConnId;
    armUniverse(e, get().tacticConfig, get().tactic, get().rangeType);
    e.lastMsg = `Rearmed ${e.activeConnId} · ${get().tactic} · ${get().rangeType} · ${get().symbolCount} sym · ${get().orderType}`;
    set({ vst: snapshotVst(e), ticketMsg: e.lastMsg, connections: syncConnections(get().connections, e) });
  },
  applyLiveConfig: () => {
    const e = get().vst;
    const cfg = get().tacticConfig;
    const tactic = get().tactic;
    const rangeType = get().rangeType;
    e.symbolCount = get().symbolCount;
    e.orderType = get().orderType;
    e.activeConnId = get().activeConnId;
    e.costStep = get().costStep;
    if (!get().liveSession) requeueFree(e, cfg, tactic, rangeType, get().activeConnId);
    e.lastMsg = get().liveSession
      ? `Host BingX VST-02 · ${tactic} · ${rangeType}`
      : `Config live · ${tactic} · ${rangeType} · cost ${e.costStep} · ${e.symbolCount} · ${e.orderType}`;
    set({
      vst: snapshotVst(e),
      ticketMsg: e.lastMsg,
      connections: alignConnOrders(syncConnections(get().connections, e), e.orderType),
    });
    get().syncSettings();
  },
  applyBestCombo: () => {
    const rows = combosFiltered({
      symbol: get().symbol,
      lastN: get().lastNs.combos,
      cfg: get().tacticConfig,
      th: get().thresholds,
      tactic: "all",
      rangeType: "all",
      onlyPositive: false,
      enabledKinds: get().enabledKinds,
      keepBest: true,
    });
    const best = pickBestCombo(rows);
    if (!best) return;
    set({
      tactic: best.tactic,
      rangeType: best.rangeType,
      costStep: best.costStep,
      tacticConfig: { ...get().tacticConfig, trailingPct: best.trailPct, tpRatio: snapTpRatio(best.tpRatio) },
    });
    const e = get().vst;
    e.lastMsg = `Best combo · ${best.tactic} · ${best.rangeType} · trail ${best.trailPct.toFixed(1)}% · cost ${best.costStep} · PF ${best.pf.toFixed(2)}`;
    get().applyLiveConfig();
  },
  runSimHours: (hours) => {
    try {
      const marks = hours >= 32 ? [2, 4, 8, 16, 32, 72].filter((h) => h <= hours) : undefined;
      const { report } = simulateHours(hours, get().tacticConfig, get().tactic, {
        symbolCount: get().symbolCount,
        orderType: get().orderType,
        rangeType: get().rangeType,
        marks,
      });
      const e = get().vst;
      e.sim = report;
      e.lastMsg = report.passed
        ? `${hours}h sim passed · ${report.trades} trades · PF ${report.pf.toFixed(2)}`
        : `${hours}h sim · ${report.issues[0] ?? "check report"}`;
      set({
        vst: snapshotVst(e),
        ticketMsg: e.lastMsg,
      });
    } catch (err) {
      set({ ticketMsg: err instanceof Error ? err.message : "sim failed" });
    }
  },
  autoValidate: () => {
    try {
    const result = autoValidateConfigs({
      lastN: get().lastNs.combos,
      th: get().thresholds,
      base: get().tacticConfig,
    });
    const applied = { ...result, applied: true };
    set({
      tactic: applied.tactic,
      rangeType: applied.rangeType,
      tacticConfig: applied.cfg,
      enabledKinds: applied.enabledKinds,
      validation: applied,
    });
    const e = get().vst;
    if (applied.confirmReport) e.sim = applied.confirmReport;
    e.lastMsg = applied.confirmOk
      ? `Auto-validate 3d · ${applied.tactic} · ${applied.rangeType} · trail ${applied.cfg.trailingPct.toFixed(1)}% · TP/SL ${applied.cfg.tpRatio.toFixed(2)}R`
      : `Auto-validate · check horizons`;
    get().applyLiveConfig();
    set({ ticketMsg: e.lastMsg, vst: snapshotVst(e) });
    return applied;
    } catch (err) {
      set({ ticketMsg: err instanceof Error ? err.message : "validate failed" });
      return get().validation as AutoValidateResult;
    }
  },
  runStageEval: () => {
    try {
    const bundle = evaluateStages({
      lastNs: get().evalLastNs,
      hours: get().evalHours,
      th: get().thresholds,
      base: get().tacticConfig,
      tactic: get().tactic,
      rangeType: get().rangeType,
      enabledKinds: get().enabledKinds,
    });
    let mirrored = false;
    const e = get().vst;
    if (bundle.endOk) {
      set({
        tactic: bundle.tactic,
        rangeType: bundle.rangeType,
        tacticConfig: bundle.cfg,
      });
      get().applyLiveConfig();
      const symbols = [...new Set(bundle.laneTracks.filter((t) => t.effective).map((t) => t.symbol))];
      mirrorEffectiveLanes(e, symbols, bundle.cfg, bundle.tactic, bundle.rangeType);
      adjustActiveBlocks(e, bundle.cfg, bundle.tactic, get().blockConfig, bundle.rangeType, { endStage: true });
      mirrored = true;
    }
    const next = { ...bundle, mirrored };
    e.lastMsg = next.endOk
      ? `Stage-eval ${next.hours.join("/")}h · end PF ${next.endPfAvg.toFixed(2)} · ${next.effective} effective · ${mirrored ? "mirrored" : "held"}`
      : `Stage-eval · end PF ${next.endPfAvg.toFixed(2)} · wait`;
    set({
      stageEval: next,
      vst: snapshotVst(e),
      ticketMsg: e.lastMsg,
    });
    get().syncSettings();
    return next;
    } catch (err) {
      set({ ticketMsg: err instanceof Error ? err.message : "stage-eval failed" });
      return get().stageEval as StageEvalBundle;
    }
  },
  setEvalHours: (hours) => {
    const next = STAGE_HOURS.filter((h) => hours.includes(h));
    set({ evalHours: next.length ? [...next] : [...STAGE_HOURS] });
    get().syncSettings();
  },
  setEvalLastNs: (ns) => {
    const next = LANE_EVAL_NS.filter((n) => ns.includes(n));
    set({ evalLastNs: next.length ? [...next] : [...LANE_EVAL_NS] });
    get().syncSettings();
  },
  setLiveExec: (p) => {
    set({
      hedgeMode: p.hedgeMode ?? get().hedgeMode,
      marginMode: p.marginMode ?? get().marginMode,
      useMaxLeverage: p.useMaxLeverage ?? get().useMaxLeverage,
      leverage: p.leverage != null ? Math.min(150, Math.max(1, Math.round(p.leverage))) : get().leverage,
      minSizeRatio: p.minSizeRatio != null ? Math.min(2, Math.max(1, p.minSizeRatio)) : get().minSizeRatio,
    });
    get().syncSettings();
  },
  setLiveTape: (liveTape) => {
    set({ liveTape });
    get().syncSettings();
  },
  pullTape: async () => {
    if (pulling) {
      if (Date.now() - pullStartedAt > 8000) pulling = false;
      else return;
    }
    pulling = true;
    pullStartedAt = Date.now();
    try {
      const conn = get().connections.find((c) => c.id === get().activeConnId);
      const network = conn?.network === "mainnet" ? "mainnet" : "testnet";
      const snap = await pullLiveTape({ data: { network } });
      if (!snap.ok) {
        set({
          feed: {
            state: get().feed.count ? "stale" : "error",
            venue: "bingx",
            latencyMs: snap.latencyMs,
            at: snap.fetchedAt,
            count: get().feed.count,
            missing: snap.missing.length,
            error: snap.error,
          },
        });
        return;
      }
      const e = get().vst;
      applyLiveTape(e, snap.tickers);
      set({
        vst: snapshotVst(e),
        feed: {
          state: "live",
          venue: "bingx",
          latencyMs: snap.latencyMs,
          at: snap.fetchedAt,
          count: snap.tickers.length,
          missing: snap.missing.length,
        },
        ticketMsg: e.lastMsg,
        connections: syncConnections(get().connections, e),
      });
    } catch (err) {
      set({
        feed: {
          ...get().feed,
          state: get().feed.count ? "stale" : "error",
          error: err instanceof Error ? err.message : "tape failed",
        },
      });
    } finally {
      pulling = false;
    }
  },
  setNetwork: (connId, network) =>
    set({
      connections: get().connections.map((c) =>
        c.id === connId
          ? {
              ...c,
              network,
              testnet: network !== "mainnet",
              armed: network === "paper" ? false : c.armed,
              label:
                c.id === "bingx-vst-01"
                  ? network === "mainnet"
                    ? "BingX Mainnet-01"
                    : network === "testnet"
                      ? "BingX VST-01"
                      : "BingX Paper-01"
                  : network === "mainnet"
                    ? "BingX Mainnet-02"
                    : network === "testnet"
                      ? "BingX VST-02"
                      : "BingX Paper-02",
            }
          : c,
      ),
    }),
  setConnKeys: (connId, apiKey, secret) => {
    vault[connId] = { apiKey: apiKey.trim(), secret: secret.trim() };
    const masked =
      apiKey.trim().length < 6 ? "••••" : `${apiKey.trim().slice(0, 4)}•••${apiKey.trim().slice(-2)}`;
    set({
      connections: get().connections.map((c) =>
        c.id === connId ? { ...c, hasKeys: Boolean(apiKey && secret), apiKeyMasked: masked } : c,
      ),
    });
  },
  armMainnet: (connId, on) =>
    set({
      connections: get().connections.map((c) => {
        if (c.id !== connId) return c;
        if (on && c.network === "paper") return c;
        if (on && !c.hasKeys) return c;
        return { ...c, armed: on };
      }),
    }),
  pingLive: async (connId) => {
    const conn = get().connections.find((c) => c.id === connId);
    const keys = vault[connId] ?? { apiKey: "", secret: "" };
    if (!conn) return;
    if (!keys.apiKey && !conn.hasKeys) {
      set({ ticketMsg: "Save API key and secret first." });
      return;
    }
    set({
      connections: get().connections.map((c) => (c.id === connId ? { ...c, status: "testing" } : c)),
    });
    const res = await pingBingxAccount({
      data: {
        apiKey: keys.apiKey,
        secret: keys.secret,
        network: conn.network === "paper" ? "testnet" : conn.network,
        connId,
      },
    });
    set({
      connections: get().connections.map((c) =>
        c.id === connId
          ? { ...c, status: res.ok ? "connected" : "error", lastPingMs: res.latencyMs || c.lastPingMs }
          : c,
      ),
      ticketMsg: res.ok
        ? `Account ping ok${res.equity ? ` · equity ${res.equity}` : ""} · ${res.latencyMs} ms`
        : `Ping failed: ${res.error}`,
    });
    if (res.ok) void get().pullExchange();
  },
  hydrateCredentials: async () => {
    try {
      const status = await deskCredentialStatus();
      set({
        connections: get().connections.map((c) =>
          status[c.id]
            ? { ...c, hasKeys: true, apiKeyMasked: c.apiKeyMasked === "—" ? "env •••" : c.apiKeyMasked }
            : c,
        ),
      });
      if (status[get().activeConnId] || status["bingx-vst-02"]) {
        await get().connectActive();
      }
    } catch {
      /* keep current flags */
    }
  },
  pullExchange: async () => {
    if (bookPulling) {
      if (Date.now() - bookPullStartedAt > 8000) bookPulling = false;
      else return;
    }
    bookPulling = true;
    bookPullStartedAt = Date.now();
    const connId = get().activeConnId || "bingx-vst-02";
    const conn = get().connections.find((c) => c.id === connId);
    const keys = vault[connId] ?? { apiKey: "", secret: "" };
    try {
      const book = await pullExchangeBook({
        data: {
          apiKey: keys.apiKey,
          secret: keys.secret,
          network: conn?.network === "mainnet" ? "mainnet" : "testnet",
          connId,
        },
      });
      set({
        exchange: book,
        connections: get().connections.map((c) =>
          c.id === connId
            ? {
                ...c,
                status: book.ok ? "connected" : "error",
                lastPingMs: book.latencyMs || c.lastPingMs,
                equity: book.ok ? book.equity : c.equity,
                positionCount: book.ok ? book.positions.length : c.positionCount,
                openOrderCount: book.ok ? book.orders.length : c.openOrderCount,
              }
            : c,
        ),
        ticketMsg: book.ok
          ? `BingX ${connId} · equity ${book.equity.toFixed(2)} · ${book.positions.length} pos · ${book.orders.length} orders · ${book.latencyMs} ms`
          : `BingX ${connId}: ${book.error ?? "book failed"}`,
      });
    } catch (err) {
      set({
        ticketMsg: err instanceof Error ? err.message : "Exchange book failed",
      });
    } finally {
      bookPulling = false;
    }
  },
  applyLiveDesk: (live) => {
    if (!live) return;
    const book = live.exchange;
    const sess = (live.session ?? null) as Record<string, unknown> | null;
    const incomingPos = Number(sess?.livePos ?? book?.positions?.length ?? 0);
    const curPos = Number(get().liveSession?.livePos ?? get().exchange?.positions.length ?? 0);
    const sessAt = Number(sess?.at ?? get().liveSession?.at ?? 0);
    if (incomingPos === 0 && curPos > 0 && Date.now() - sessAt < 8000) return;
    const ov = (live.overall ?? null) as Record<string, unknown> | null;
    const e = get().vst;
    const equity = Number(book?.ok && book.equity > 0 ? book.equity : sess?.equity ?? 0);
    const pf = Number(sess?.livePf ?? sess?.pf);
    const wr = Number(sess?.wr);
    const net = Number(sess?.net);
    const trades = Number(sess?.trades);
    const mdd = Number(sess?.mdd);
    if (sess) {
      if (Number.isFinite(equity) && equity > 0) {
        e.stats.equity = equity;
        e.ledger.peak = Math.max(e.ledger.peak || 0, equity);
      }
      if (Number.isFinite(pf)) e.stats.pf = pf;
      if (Number.isFinite(wr)) e.stats.wr = wr;
      if (Number.isFinite(net)) e.stats.net = net;
      if (Number.isFinite(trades)) {
        e.stats.trades = trades;
        e.ledger.trades = trades;
      }
      if (Number.isFinite(mdd)) e.stats.mdd = mdd;
      const wins = Number(sess.wins);
      if (Number.isFinite(wins)) e.ledger.wins = wins;
      e.running = true;
      e.phase = "running";
      e.lastMsg = String(sess.lastMsg ?? e.lastMsg);
    }
    const prevSess = get().liveSession;
    const sameShape =
      sess &&
      prevSess &&
      prevSess.livePos === sess.livePos &&
      prevSess.liveOrd === sess.liveOrd &&
      prevSess.pingOk === sess.pingOk;
    if (sameShape && prevSess && sess) {
      Object.assign(prevSess, sess);
      const heldEx = get().exchange;
      if (book?.ok && heldEx?.ok && heldEx.positions.length === book.positions.length) {
        for (let i = 0; i < heldEx.positions.length; i++) {
          const cur = heldEx.positions[i];
          const nxt = book.positions[i];
          if (!cur || !nxt) continue;
          if (cur.symbol === nxt.symbol && cur.side === nxt.side) {
            cur.pnl = nxt.pnl;
            cur.mark = nxt.mark;
            cur.qty = nxt.qty;
          }
        }
      }
      const elapsed = Number(sess.elapsedMin ?? 0);
      const mark = Math.round(Number(sess.livePnl ?? sess.net ?? 0) * 1000) + Number(sess.livePos ?? 0) * 17;
      if (Date.now() - lastLiveMarkAt < 4000) return;
      if (Math.round(elapsed * 2) !== Math.round(Number(get().liveElapsed) * 2) || mark !== get().liveMark) {
        lastLiveMarkAt = Date.now();
        pinDeskScroll();
        set({ liveElapsed: elapsed, liveMark: mark });
      }
      return;
    }
    const prevOv = get().liveOverall;
    const keepOv = prevOv && ov && prevOv.at === ov.at ? prevOv : ov;
    const prevEx = get().exchange;
    const nextBook = book && book.ok && (book.positions.length > 0 || book.equity > 0) ? book : prevEx;
    const sameEx =
      prevEx &&
      nextBook &&
      prevEx.positions.length === nextBook.positions.length &&
      prevEx.orders.length === nextBook.orders.length &&
      prevEx.equity === nextBook.equity;
    const liveId = String((sess as { conn?: string } | null)?.conn || get().activeConnId || "bingx-vst-02");
    const liveNet =
      String((sess as { network?: string } | null)?.network || "") === "mainnet" || liveId === "bingx-x01" ? "mainnet" : "testnet";
    const nextPos = Number(sess?.livePos ?? nextBook?.positions.length ?? 0);
    const nextOrd = Number(sess?.liveOrd ?? nextBook?.orders.length ?? 0);
    const prevConn = get().connections;
    const conn = prevConn.find((c) => c.id === liveId) ?? prevConn.find((c) => c.id === "bingx-vst-02");
    const sameConn = conn && conn.positionCount === nextPos && conn.openOrderCount === nextOrd && conn.equity === (equity > 0 ? equity : conn.equity) && conn.network === liveNet;
    pinDeskScroll();
    set({
      liveSession: sess,
      liveOverall: keepOv,
      liveElapsed: Number(sess?.elapsedMin ?? get().liveElapsed),
      liveMark: Math.round(Number(sess?.livePnl ?? 0) * 1000),
      exchange: sameEx ? prevEx : nextBook && nextBook.ok ? nextBook : book && book.ok ? book : prevEx,
      feed:
        sess?.pingOk || book?.ok
          ? get().feed.state === "live"
            ? get().feed
            : { state: "live", venue: "bingx", latencyMs: book?.latencyMs ?? get().feed.latencyMs, at: Date.now(), count: get().feed.count, missing: get().feed.missing }
          : get().feed,
      activeConnId: isDeskConn(liveId) ? liveId : get().activeConnId,
      connections: sameConn
        ? prevConn
        : prevConn.map((c) =>
            c.id === liveId
              ? {
                  ...c,
                  hasKeys: true,
                  armed: true,
                  testnet: liveNet !== "mainnet",
                  network: liveNet,
                  status: sess?.pingOk || book?.ok ? "connected" : c.status,
                  lastPingMs: book?.ok ? book.latencyMs : c.lastPingMs,
                  equity: equity > 0 ? equity : c.equity,
                  positionCount: nextPos || c.positionCount,
                  openOrderCount: nextOrd || c.openOrderCount,
                  apiKeyMasked: c.apiKeyMasked === "—" ? "env •••" : c.apiKeyMasked,
                }
              : c.armed || c.status === "connected"
                ? { ...c, armed: false, status: "disconnected" as const, positionCount: 0, openOrderCount: 0 }
                : c,
          ),
      ticketMsg:
        equity > 0
          ? `BingX ${liveId} · ${liveNet} · equity ${equity.toFixed(2)} · ${nextPos} pos · ${nextOrd} orders`
          : get().ticketMsg,
      vst:
        e.phase === "running" && e.running
          ? get().vst
          : { ...e, phase: "running" as const, running: true },
    });
  },
  pullLiveDesk: async () => {
    if (deskPulling) {
      if (Date.now() - deskPullStartedAt > 8000) deskPulling = false;
      else return;
    }
    deskPulling = true;
    deskPullStartedAt = Date.now();
    try {
      const ctrl = typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined;
      const [sess, overall] = await Promise.all([
        fetch("/live-session.json", { cache: "no-store", signal: ctrl })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetch("/overall-stats.json", { cache: "no-store", signal: ctrl })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);
      if (sess && typeof sess === "object") {
        const positions = Array.isArray(sess.bookPos) ? sess.bookPos : [];
        const orders = Array.isArray(sess.bookOrd) ? sess.bookOrd : [];
        const equity = Number(sess.equity ?? 0);
        const pingOk = Boolean(sess.pingOk || sess.liveOk);
        const ov = overall && typeof overall === "object" ? overall : get().liveOverall;
        get().applyLiveDesk({
          session: sess,
          overall: ov,
          exchange:
            pingOk || equity > 0
              ? {
                  connId: String(sess.conn || "bingx-vst-02"),
                  ok: true,
                  equity: Number.isFinite(equity) ? equity : 0,
                  positions,
                  orders,
                  at: Date.now(),
                  latencyMs: 0,
                }
              : null,
          at: Date.now(),
        });
        const complete = ov && typeof ov === "object" ? (ov as { complete?: CompleteComputeReport }).complete : null;
        if (complete?.cells?.length && !get().replayComplete) set({ replayComplete: complete });
        return;
      }
      const live = await loadLiveDesk();
      get().applyLiveDesk(live);
    } catch {
      /* keep last live snapshot */
    } finally {
      deskPulling = false;
    }
  },
  connectActive: async () => {
    const id = get().activeConnId;
    await get().pingLive(id);
    await get().pullExchange();
    if (get().liveTape) await get().pullTape();
  },
  applySettingsSnap: (raw, source) => {
    const snap = sanitizeDeskSettings(raw);
    applyingRemote = true;
    try {
      const playbooks = strategiesForKinds(snap.enabledKinds);
      const strategyId = playbooks.some((s) => s.id === snap.strategyId)
        ? snap.strategyId
        : (playbooks[0]?.id ?? "normal");
      const e = get().vst;
      e.symbolCount = snap.symbolCount;
      e.orderType = snap.orderType;
      e.activeConnId = snap.activeConnId;
      applyUniverse(e, snap.symbolCount, snap.orderType);
      if (!e.running && !get().liveSession) requeueFree(e, snap.tacticConfig, snap.tactic, snap.rangeType, snap.activeConnId);
      else e.lastMsg = `Settings synced · ${snap.tactic} · ${snap.rangeType} · ${snap.symbolCount}`;
      set({
        lastN: clampLastN(snap.lastN),
        lastNs: snap.lastNs,
        lastNLinked: snap.lastNLinked,
        costStep: snap.costStep,
        rangeType: snap.rangeType,
        tactic: snap.tactic,
        thresholds: snap.thresholds,
        tacticConfig: snap.tacticConfig,
        blockConfig: snap.blockConfig,
        symbolCount: snap.symbolCount,
        orderType: snap.orderType,
        enabledKinds: snap.enabledKinds,
        strategyId,
        liveTape: snap.liveTape,
        comboOnlyPositive: snap.comboOnlyPositive,
        comboTactic: snap.comboTactic,
        comboRange: snap.comboRange,
        activeConnId: snap.activeConnId,
        evalHours: snap.evalHours,
        evalLastNs: snap.evalLastNs,
        sessionPhase: snap.sessionPhase,
        hedgeMode: snap.hedgeMode,
        marginMode: snap.marginMode,
        useMaxLeverage: snap.useMaxLeverage,
        leverage: snap.leverage,
        minSizeRatio: snap.minSizeRatio,
        activePresetId: snap.activePresetId || get().activePresetId,
        userPresets: snap.userPresets?.length ? snap.userPresets : get().userPresets,
        settingsRev: snap.rev,
        settingsAt: snap.at,
        settingsSource: source,
        vst: snapshotVst(e),
        ticketMsg: e.lastMsg,
        connections: alignConnOrders(trimConnSymbols(syncConnections(get().connections, e), snap.symbolCount), snap.orderType),
      });
    } finally {
      applyingRemote = false;
    }
  },
  hydrateSettings: async () => {
    const local = readLocalSettings();
    if (local && (local.rev > 0 || local.at > 0)) {
      get().applySettingsSnap(local, "local");
    }
    try {
      const remote = await loadDeskSettings();
      if (!remote) return;
      const curAt = get().settingsAt;
      const curRev = get().settingsRev;
      if (remote.at > curAt || remote.rev > curRev) {
        get().applySettingsSnap(remote, "server");
        writeLocalSettings(sanitizeDeskSettings(remote));
      }
    } catch {
      /* stay on local */
    }
  },
  pullRemoteSettings: async () => {
    if (applyingRemote) return;
    try {
      const remote = await loadDeskSettings();
      if (!remote) return;
      const current = collectDeskSettings(get());
      current.rev = get().settingsRev;
      current.at = get().settingsAt;
      if (remote.at <= current.at && remote.rev <= current.rev) return;
      if (!settingsDiffer(sanitizeDeskSettings(current), remote) && remote.rev <= current.rev) return;
      get().applySettingsSnap(remote, "server");
      writeLocalSettings(sanitizeDeskSettings(remote));
    } catch {
      /* keep */
    }
  },
  syncSettings: () => {
    if (applyingRemote) return;
    const snap = collectDeskSettings(get());
    snap.at = Date.now();
    queuePersist(snap);
    const e = get().vst;
    e.symbolCount = snap.symbolCount;
    e.orderType = snap.orderType;
    e.activeConnId = snap.activeConnId;
    set({
      settingsRev: snap.rev,
      settingsAt: snap.at,
      settingsSource: "local",
      ...(get().liveSession ? {} : { vst: snapshotVst(e) }),
      connections: alignConnOrders(trimConnSymbols(get().connections, snap.symbolCount), snap.orderType),
    });
  },
  applyPreset: (id) => {
    const p = findPreset(id, get().userPresets);
    if (!p) return;
    const cur = collectDeskSettings(get());
    const merged = sanitizeDeskSettings({ ...cur, ...p.patch, activePresetId: id, userPresets: get().userPresets });
    get().applySettingsSnap(merged, "local");
    get().applyLiveConfig();
  },
  savePreset: (label) => {
    const name = label.trim().slice(0, 40) || "Saved";
    const id = presetIdOf(name);
    const snap = collectDeskSettings(get());
    const preset: SettingsPreset = {
      id,
      label: name,
      blurb: `${snap.tactic}/${snap.rangeType} · ${snap.symbolCount} sym`,
      builtin: false,
      patch: snap,
    };
    const userPresets = [...get().userPresets.filter((x) => x.id !== id), preset].slice(-24);
    set({ userPresets, activePresetId: id });
    get().syncSettings();
    return id;
  },
  deletePreset: (id) => {
    if (BUILTIN_PRESETS.some((p) => p.id === id)) return;
    const userPresets = get().userPresets.filter((p) => p.id !== id);
    set({ userPresets, activePresetId: get().activePresetId === id ? "" : get().activePresetId });
    get().syncSettings();
  },
  setSymbolCount: (n) => {
    const symbolCount = clampSymbolCount(n);
    const e = get().vst;
    applyUniverse(e, symbolCount, get().orderType);
    const connections = trimConnSymbols(get().connections, symbolCount);
    if (!e.running) {
      requeueFree(e, get().tacticConfig, get().tactic, get().rangeType, get().activeConnId);
    } else {
      e.lastMsg = `Symbol count ${symbolCount} · extra ladders dropped`;
    }
    set({
      symbolCount,
      vst: snapshotVst(e),
      connections: syncConnections(connections, e),
      ticketMsg: e.lastMsg,
    });
    get().syncSettings();
  },
  setOrderType: (orderType) => {
    const e = get().vst;
    e.orderType = orderType;
    if (!e.running) {
      requeueFree(e, get().tacticConfig, get().tactic, get().rangeType, get().activeConnId);
    } else {
      e.lastMsg = `Order type ${orderType} on next free ladder`;
    }
    set({ orderType, vst: snapshotVst(e), ticketMsg: e.lastMsg });
    get().syncSettings();
  },
  toggleKind: (k) => {
    const cur = get().enabledKinds;
    const has = cur.includes(k);
    const raw = has ? cur.filter((x) => x !== k) : [...cur, k];
    const next = STRATEGY_KINDS.map((x) => x.id).filter((id) => raw.includes(id));
    const enabledKinds = next.length ? next : (["normal"] as StrategyKind[]);
    const playbooks = strategiesForKinds(enabledKinds);
    const strategyId = playbooks.some((s) => s.id === get().strategyId)
      ? get().strategyId
      : (playbooks[0]?.id ?? "normal");
    set({ enabledKinds, strategyId });
    get().syncSettings();
  },
  setActiveConn: (id) => {
    if (!isDeskConn(id)) return;
    const e = get().vst;
    e.activeConnId = id;
    e.lastMsg = `Current session ${id}`;
    set({ activeConnId: id, vst: snapshotVst(e), ticketMsg: e.lastMsg });
    get().syncSettings();
    void get().connectActive();
  },
  watchdog: () => {
    if (ticking && Date.now() - tickStartedAt > VST_TICK_MS * 4) ticking = false;
    if (pulling && Date.now() - pullStartedAt > 8000) pulling = false;
    if (bookPulling && Date.now() - bookPullStartedAt > 8000) bookPulling = false;
    if (deskPulling && Date.now() - deskPullStartedAt > 8000) deskPulling = false;
    if (get().liveSession) {
      stallBeats = 0;
      return;
    }
    const e = get().vst;
    if (!e.running || e.phase === "paused" || e.phase === "stopped" || e.phase === "idle") {
      stallBeats = 0;
      return;
    }
    if (e.tick === lastSeenTick) stallBeats += 1;
    else {
      lastSeenTick = e.tick;
      stallBeats = 0;
    }
    if (stallBeats >= 3) {
      ticking = false;
      const result = healEngine(e, get().tacticConfig, get().tactic, get().rangeType);
      stallBeats = 0;
      e.running = true;
      e.phase = "running";
      if (!result.reason) noteStall(e);
      set({ vst: snapshotVst(e), ticketMsg: e.lastMsg, connections: syncConnections(get().connections, e) });
      get().tickEngine();
    }
  },
}));

function noteStall(e: ReturnType<typeof initVstEngine>) {
  e.healCount = (e.healCount ?? 0) + 1;
  e.lastHeal = "stalled tick resumed";
  e.lastMsg = "Heal · stalled tick resumed";
}

export { COST_STEPS, LAST_N_OPTIONS };
