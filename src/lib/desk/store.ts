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
  StrategyToggles,
  TacticConfig,
  TacticKind,
  Thresholds,
  ShortProgressConfig,
  IntervalStrategyConfig,
  LastNProgressConfig,
  VstEngine,
} from "./types";
import type { CompleteComputeReport } from "./vst";
import type { ReplaySimBundle } from "./replay-run";
import {
  COST_STEPS,
  DEFAULT_BLOCK_CONFIG,
  DEFAULT_ENABLED_KINDS,
  DEFAULT_STRATEGY_TOGGLES,
  DEFAULT_LAST_N,
  DEFAULT_LAST_N_CONFIG,
  DEFAULT_TACTIC_CONFIG,
  DEFAULT_THRESHOLDS,
  DEFAULT_SHORT_PROGRESS,
  DEFAULT_INTERVAL_STRATEGY,
  DEFAULT_LAST_N_PROGRESS,
  DESK,
  LANE_EVAL_NS,
  LAST_N_OPTIONS,
  STAGE_HOURS,
  AUTO_EVAL_HOURS,
  STRATEGY_KINDS,
  clampLastN,
  clampBlockVol,
  sanitizeShortProgress,
  sanitizeIntervalStrategy,
  sanitizeLastNProgress,
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
  engageLiveBook,
  LIVE_RUN_CFG,
  liveRunBlock,
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
  DESK_CONN_IDS,
  mirrorEffectiveLanes,
} from "./vst";
import { completeHoursFor, replayHoursFor, runReplaySimulation } from "./replay-run";
import { autoValidateConfigs, evaluateStages, liveLastNEvals } from "./validate";
import {
  defaultBotsPersist,
  liveBotFloors,
  sanitizeArmed,
  sanitizeBotConfig,
  sanitizeBotsPersist,
  stepDeskBots,
  botLiveNotional,
  BOT_DEFAULT_VOLUME_FACTOR,
  BOT_TYPES,
  type BotConfig,
  type BotsPersist,
  type BotTypeId,
} from "./bots";
import {
  applyLiveTape,
  LIVE_SET,
  MAX_LIVE_NOTIONAL,
  makeClientOrderId,
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
  overlayLastN: 12 | 40 | 120 | 650;
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
  strategyToggles: StrategyToggles;
  shortProgress: ShortProgressConfig;
  intervalStrategy: IntervalStrategyConfig;
  lastNProgress: LastNProgressConfig;
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
  setOverlayLastN: (n: 12 | 40 | 120 | 650) => void;
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
  setStrategyToggles: (p: Partial<StrategyToggles>) => void;
  setShortProgress: (p: Partial<ShortProgressConfig>) => void;
  setIntervalStrategy: (p: Partial<IntervalStrategyConfig>) => void;
  setLastNProgress: (p: Partial<LastNProgressConfig>) => void;
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
  bots: BotsPersist;
  botByConn: Record<string, BotsPersist & { running: boolean; touched?: boolean }>;
  botsRunning: boolean;
  setBotsSelected: (t: BotTypeId) => void;
  setBotsHours: (h: number) => void;
  toggleBotArmed: (t: BotTypeId) => void;
  setBotsArmed: (t: BotTypeId[]) => void;
  patchBotConfig: (t: BotTypeId, p: Partial<BotConfig>) => void;
  startBot: () => void;
  stopBot: () => void;
  runLiveBots: () => void;
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
let tickStartedAt = 0;
const liveBotSent = new Set<string>();
const liveBotAt: Record<string, number> = {};
const liveLane = new Map<string, "bot" | "progress">();

function controlPrices(side: "long" | "short", entry: number, mark: number, slPct: number, tpPct: number) {
  const px = mark > 0 ? mark : entry;
  const slGap = Math.max(slPct, 0.004);
  const tpGap = Math.max(tpPct, 0.004);
  let sl = side === "long" ? entry * (1 - slPct) : entry * (1 + slPct);
  let tp = side === "long" ? entry * (1 + tpPct) : entry * (1 - tpPct);
  if (side === "long") {
    if (!(sl < px * 0.999)) sl = px * (1 - slGap);
    if (!(tp > px * 1.001)) tp = px * (1 + tpGap);
  } else {
    if (!(sl > px * 1.001)) sl = px * (1 + slGap);
    if (!(tp < px * 0.999)) tp = px * (1 - tpGap);
  }
  return { sl, tp };
}

function placeBotControls(
  network: "mainnet" | "testnet",
  connId: string,
  symbol: string,
  side: "long" | "short",
  entry: number,
  slPct: number,
  tpPct: number,
  mark = 0,
  which: "both" | "sl" | "tp" = "both",
  qty = 0,
) {
  if (!(entry > 0)) return;
  const { sl, tp } = controlPrices(side, entry, mark, slPct, tpPct);
  const closeSide = side === "long" ? "SELL" : "BUY";
  const positionSide = side === "long" ? "LONG" : "SHORT";
  const send = (type: "STOP_MARKET" | "TAKE_PROFIT_MARKET", stop: number, kind: "S" | "T") =>
    placeBingxOrder({
      data: {
        network,
        connId,
        symbol,
        side: closeSide,
        positionSide,
        quantity: qty > 0 ? qty : 0,
        type,
        stopPrice: stop,
        price: stop,
        notional: qty > 0 ? Math.max(2, qty * stop) : 1,
        confirmLive: true,
        closePosition: !(qty > 0),
        attachProtect: false,
        clientOrderId: makeClientOrderId(connId, kind),
      },
    });
  if (which !== "tp") void send("STOP_MARKET", sl, "S");
  if (which !== "sl") void send("TAKE_PROFIT_MARKET", tp, "T");
}

function queueBotControls(get: () => { activeConnId: string; connections: Connection[]; exchange: ExchangeBook | null }) {
  const id = get().activeConnId;
  const conn = get().connections.find((c) => c.id === id);
  const book = get().exchange;
  if (!conn || conn.network === "paper" || !book?.ok || book.connId !== id) return;
  if (Date.now() - (liveBotAt[`ctl:${id}`] ?? 0) < 8000) return;
  const pos = book.positions.find((p) => {
    const stop = book.orders.some((o) => o.symbol === p.symbol && /STOP/i.test(o.type) && !/TAKE_PROFIT/i.test(o.type));
    const tp = book.orders.some((o) => o.symbol === p.symbol && /TAKE_PROFIT/i.test(o.type));
    return !stop || !tp;
  });
  if (!pos) return;
  const entry = pos.entry > 0 ? pos.entry : pos.mark;
  if (!(entry > 0)) return;
  const stop = book.orders.some((o) => o.symbol === pos.symbol && /STOP/i.test(o.type) && !/TAKE_PROFIT/i.test(o.type));
  const tp = book.orders.some((o) => o.symbol === pos.symbol && /TAKE_PROFIT/i.test(o.type));
  liveBotAt[`ctl:${id}`] = Date.now();
  placeBotControls(
    conn.network === "testnet" ? "testnet" : "mainnet",
    id,
    pos.symbol,
    pos.side,
    entry,
    0.008,
    0.008,
    pos.mark,
    !stop && !tp ? "both" : stop ? "tp" : "sl",
    pos.qty,
  );
}

function queueExchangeOpen(get: () => { activeConnId: string; connections: Connection[]; exchange: ExchangeBook | null; vst: VstEngine; pullExchange: () => Promise<void> }, set: (partial: { ticketMsg?: string }) => void) {
  const id = get().activeConnId;
  if (!isDeskConn(id)) return;
  const conn = get().connections.find((c) => c.id === id);
  if (!conn || conn.network === "paper") return;
  const now = Date.now();
  if (now - (liveBotAt[`ex:${id}`] ?? 0) < 5000) return;
  const book = get().exchange;
  if (!book || !book.ok || book.connId !== id || now - book.at > 20000) {
    liveBotAt[`ex:${id}`] = now;
    void get().pullExchange();
    return;
  }
  if (book.positions.length >= 8) return;
  const held = new Set(book.positions.map((p) => p.symbol));
  const sym = universeSymbols(12).map((s) => s.id).find((s) => !held.has(s) && !liveBotSent.has(`ex:${id}:${s}`));
  if (!sym) return;
  liveBotAt[`ex:${id}`] = now;
  liveBotSent.add(`ex:${id}:${sym}`);
  const q = get().vst.quotes[sym];
  const px = q && q.px > 0 ? q.px : 1;
  const side = (q?.chg ?? 0) >= 0 ? "long" : "short";
  const notional = botLiveNotional(book.equity, BOT_DEFAULT_VOLUME_FACTOR);
  void placeBingxOrder({
    data: {
      network: conn.network === "testnet" ? "testnet" : "mainnet",
      symbol: sym,
      side: side === "long" ? "BUY" : "SELL",
      positionSide: side === "long" ? "LONG" : "SHORT",
      quantity: notional / px,
      type: "MARKET",
      price: px,
      notional,
      confirmLive: true,
      connId: conn.id,
      equity: book.equity,
      attachProtect: false,
      clientOrderId: makeClientOrderId(conn.id, "E"),
    },
  })
    .then((res) => {
      set({ ticketMsg: res.ok ? `LIVE ${id} ${sym} ${side}` : `LIVE rejected ${id}: ${res.error}` });
      if (res.ok) {
        void placeBotControls(conn.network === "testnet" ? "testnet" : "mainnet", conn.id, sym, side, px, 0.008, 0.008, px, "both", notional / px);
        void get().pullExchange();
      } else liveBotSent.delete(`ex:${id}:${sym}`);
    })
    .catch((err: unknown) => {
      liveBotSent.delete(`ex:${id}:${sym}`);
      set({ ticketMsg: `LIVE rejected ${id}: ${err instanceof Error ? err.message : "order failed"}` });
    });
}
let pulling = false;
let bookPulling = false;
let deskPulling = false;
let pullStartedAt = 0;
let bookPullStartedAt = 0;
let deskPullStartedAt = 0;
let lastLiveMarkAt = 0;
let lastSeenTick = 0;
let stallBeats = 0;
let persistTimer = 0;
let applyingRemote = false;

type ConnBots = BotsPersist & { running: boolean; touched?: boolean };

function freshConnBots(): ConnBots {
  return { ...defaultBotsPersist(), running: false };
}

function emptyBotByConn(): Record<string, ConnBots> {
  return Object.fromEntries(DESK_CONN_IDS.map((id) => [id, freshConnBots()]));
}

function withConnBots(s: { activeConnId: string; botByConn: Record<string, ConnBots> }, bots: BotsPersist, running?: boolean): Record<string, ConnBots> {
  const id = s.activeConnId;
  const prev = s.botByConn[id] ?? freshConnBots();
  return { ...s.botByConn, [id]: { ...bots, running: running ?? prev.running, touched: true } };
}

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

const boot = initVstEngine(DEFAULT_TACTIC_CONFIG, { warmup: 0, symbolCount: 12, arm: false, equity: 10 });
{
  const sess = freshConnBots();
  const armed = sanitizeArmed(sess.armed);
  for (const t of BOT_TYPES) {
    if (armed.length >= 3) break;
    if (!armed.includes(t)) armed.push(t);
  }
  boot.botMode = true;
  boot.x01Progress = true;
  boot.running = true;
  boot.phase = "running";
  boot.activeConnId = "bingx-x01";
  boot.symbolCount = 40;
  engageLiveBook(boot);
  const three = sanitizeArmed(armed);
  for (let i = 0; i < 6; i++) {
    stepDeskBots(boot, three, sess.configs);
    tickVst(boot, LIVE_RUN_CFG, "trailing", { symbolCount: 40, rangeType: "atr", block: liveRunBlock() });
  }
  const open = boot.positions.filter((p) => p.connId === "bingx-x01" && p.qty > 0).length;
  const progress = [...boot.queue, ...boot.orders].filter((o) => o.connId === "bingx-x01" && !String(o.playbook || "").startsWith("bot:") && (o.status === "queued" || o.status === "open" || o.status === "partial")).length;
  boot.lastMsg = `X01 progress · ${open} open · ${progress} orders`;
}

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
  lastNLinked: false,
  overlayLastN: 40 as const,
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
  activeConnId: "bingx-x01",
  validation: null,
  stageEval: null,
  evalHours: [...AUTO_EVAL_HOURS],
  evalLastNs: [...LANE_EVAL_NS],
  sessionPhase: "running" as const,
  hedgeMode: true,
  marginMode: "cross" as const,
  useMaxLeverage: true,
  leverage: 0,
  minSizeRatio: 1,
  activePresetId: "",
  userPresets: [] as SettingsPreset[],
  strategyToggles: { ...DEFAULT_STRATEGY_TOGGLES },
  shortProgress: sanitizeShortProgress(DEFAULT_SHORT_PROGRESS),
  intervalStrategy: sanitizeIntervalStrategy(DEFAULT_INTERVAL_STRATEGY),
  lastNProgress: sanitizeLastNProgress(DEFAULT_LAST_N_PROGRESS),
  bots: defaultBotsPersist(),
  botByConn: Object.fromEntries(DESK_CONN_IDS.map((id) => [id, { ...freshConnBots(), running: true, touched: true }])),
  botsRunning: true,
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
  setOverlayLastN: (overlayLastN) => set({ overlayLastN }),
  resetSettings: () => {
    set({
      lastN: DEFAULT_LAST_N,
      lastNs: { ...DEFAULT_LAST_N_CONFIG },
      lastNLinked: true,
      evalHours: [...AUTO_EVAL_HOURS],
      evalLastNs: [...LANE_EVAL_NS],
      stageEval: null,
      costStep: 10,
      rangeType: "atr",
      tactic: "hybrid",
      strategyId: "normal",
      thresholds: { ...DEFAULT_THRESHOLDS },
      tacticConfig: { ...DEFAULT_TACTIC_CONFIG },
      blockConfig: { ...DEFAULT_BLOCK_CONFIG },
      strategyToggles: { ...DEFAULT_STRATEGY_TOGGLES },
      shortProgress: sanitizeShortProgress(DEFAULT_SHORT_PROGRESS),
      intervalStrategy: sanitizeIntervalStrategy(DEFAULT_INTERVAL_STRATEGY),
      lastNProgress: sanitizeLastNProgress(DEFAULT_LAST_N_PROGRESS),
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
      leverage: 0,
      minSizeRatio: 1,
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
        symbolCount: Math.min(16, get().symbolCount || 16),
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
          symbolCount: Math.min(8, get().symbolCount || 8),
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
    const thresholds = { ...get().thresholds, ...p };
    const shortProgress = { ...get().shortProgress };
    if (p.shortPf != null) shortProgress.overallPf = p.shortPf;
    if (p.shortBasePf != null) shortProgress.basePf = p.shortBasePf;
    if (p.shortAxisPf != null) shortProgress.axisPf = p.shortAxisPf;
    if (p.shortBlockPf != null) shortProgress.blockPf = p.shortBlockPf;
    set({ thresholds, shortProgress });
    const e = get().vst;
    e.minPf = thresholds.minPf;
    e.basePf = thresholds.basePf;
    e.axisPf = thresholds.axisPf;
    e.blockPf = thresholds.blockPf;
    e.shortPf = thresholds.shortPf;
    e.shortBasePf = thresholds.shortBasePf;
    e.shortAxisPf = thresholds.shortAxisPf;
    e.shortBlockPf = thresholds.shortBlockPf;
    e.shortProgress = shortProgress;
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
    const e = get().vst;
    e.blockCfg = { ...e.blockCfg, ...get().blockConfig };
    get().syncSettings();
  },
  setStrategyToggles: (p) => {
    const strategyToggles = { ...get().strategyToggles, ...p };
    if (!strategyToggles.block) strategyToggles.block = false;
    set({ strategyToggles });
    const e = get().vst;
    e.strategyToggles = strategyToggles;
    if (strategyToggles.block === false) e.blockCfg = { ...get().blockConfig, enabled: false };
    else e.blockCfg = { ...get().blockConfig, enabled: true };
    get().syncSettings();
  },
  setShortProgress: (p) => {
    const shortProgress = sanitizeShortProgress({ ...get().shortProgress, ...p });
    set({ shortProgress });
    const e = get().vst;
    e.shortProgress = shortProgress;
    e.shortPf = shortProgress.overallPf;
    e.shortBasePf = shortProgress.basePf;
    e.shortAxisPf = shortProgress.axisPf;
    e.shortBlockPf = shortProgress.blockPf;
    get().setThresholds({
      shortPf: shortProgress.overallPf,
      shortBasePf: shortProgress.basePf,
      shortAxisPf: shortProgress.axisPf,
      shortBlockPf: shortProgress.blockPf,
    });
  },
  setIntervalStrategy: (p) => {
    const intervalStrategy = sanitizeIntervalStrategy({ ...get().intervalStrategy, ...p });
    set({ intervalStrategy });
    const e = get().vst;
    e.intervalStrategy = intervalStrategy;
    get().syncSettings();
  },
  setLastNProgress: (p) => {
    const lastNProgress = sanitizeLastNProgress({ ...get().lastNProgress, ...p });
    set({ lastNProgress });
    const e = get().vst;
    e.lastNProgress = lastNProgress;
    if (e.blockCfg) e.blockCfg = { ...e.blockCfg, lastNProgress };
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
    const sessions = get().botByConn;
    const runningIds = DESK_CONN_IDS.filter((id) => sessions[id]?.running);
    if (get().liveSession && !runningIds.length) return;
    const e = get().vst;
    if (ticking) {
      if (Date.now() - tickStartedAt > VST_TICK_MS * 4) {
        ticking = false;
        healEngine(e, get().tacticConfig, get().tactic, get().rangeType);
        e.lastMsg = "Heal · tick unstuck";
      } else return;
    }
    if ((!e.running || e.phase === "stopped" || e.phase === "paused" || e.phase === "idle") && !runningIds.length) return;
    ticking = true;
    tickStartedAt = Date.now();
    try {
      const view = get().activeConnId;
      const sampledAt = e.tick;
      const anyBots = runningIds.length > 0;
      e.activeConnId = view;
      if (!get().liveSession || anyBots) engageLiveBook(e);
      const viewSess = sessions[view];
      e.botMode = anyBots;
      e.x01Progress = view === "bingx-x01";
      const born: { id: string; connId: string; symbol: string; side: "long" | "short"; price: number; qty: number; sl: number; tp: number; bot: boolean }[] = [];
      const takeBorn = () => {
        for (const o of e.queue) {
          const play = String(o.playbook || "");
          const bot = play.startsWith("bot:");
          const progressOrder = e.x01Progress && o.connId === "bingx-x01" && !bot;
          if (!bot && !progressOrder) continue;
          if (born.some((b) => b.id === o.id) || liveBotSent.has(o.id)) continue;
          born.push({ id: o.id, connId: o.connId, symbol: o.symbol, side: o.side, price: o.price, qty: o.qty, sl: o.sl, tp: o.tp, bot });
        }
      };
      if (anyBots && !viewSess?.running) {
        try { stepDeskBots(e, [], viewSess?.configs); } catch { e.lastMsg = "Bot step recovered"; }
      }
      if (viewSess?.running) {
        try { stepDeskBots(e, viewSess.armed, viewSess.configs); } catch { e.lastMsg = "Bot step recovered"; }
      }
      takeBorn();
      const live = get().liveTape && get().feed.state === "live" && !anyBots;
      const progress = view === "bingx-x01";
      const tickOpts = {
        freezeIds: live ? LIVE_SET : undefined,
        rangeType: "atr" as const,
        symbolCount: progress ? 40 : get().symbolCount,
        orderType: progress ? "market" as const : get().orderType,
        block: progress ? liveRunBlock(get().blockConfig) : get().blockConfig,
      };
      const tickCfg = progress ? LIVE_RUN_CFG : get().tacticConfig;
      const tickTac = progress ? "trailing" as const : get().tactic;
      tickVst(e, tickCfg, tickTac, tickOpts);
      e.botHistTick = e.tick;
      for (const id of runningIds) {
        if (id === view) continue;
        e.activeConnId = id;
        e.botMode = true;
        const sess = sessions[id];
        if (sess) {
          try { stepDeskBots(e, sess.armed, sess.configs); } catch { e.lastMsg = "Bot step recovered"; }
        }
        takeBorn();
        tickVst(e, get().tacticConfig, get().tactic, { bookOnly: true, rangeType: tickOpts.rangeType, symbolCount: tickOpts.symbolCount, orderType: tickOpts.orderType, block: tickOpts.block });
      }
      const nowLive = Date.now();
      for (const o of born) {
        if (liveBotSent.has(o.id)) continue;
        const lane = o.bot ? `bot:${o.connId}` : `px:${o.connId}`;
        if (nowLive - (liveBotAt[lane] ?? 0) < 4000) continue;
        const conn = get().connections.find((c) => c.id === o.connId);
        if (!conn || conn.network === "paper") continue;
        const owner = liveLane.get(`${o.connId}:${o.symbol}`);
        const mine = o.bot ? "bot" : "progress";
        if (owner && owner !== mine) continue;
        const heldLive = get().exchange?.connId === o.connId && get().exchange.positions.some((p) => p.symbol === o.symbol && p.qty > 0);
        if (heldLive && owner !== mine) continue;
        liveBotSent.add(o.id);
        liveBotAt[lane] = nowLive;
        const px = o.price > 0 ? o.price : 1;
        const acct = get().exchange?.connId === o.connId && (get().exchange?.equity ?? 0) > 0 ? get().exchange!.equity : 0;
        const notional = botLiveNotional(acct, BOT_DEFAULT_VOLUME_FACTOR);
        const slPct = px > 0 && o.sl > 0 ? Math.abs(o.sl - px) / px : 0.008;
        const tpPct = px > 0 && o.tp > 0 ? Math.abs(o.tp - px) / px : 0.008;
        void placeBingxOrder({
          data: {
            network: conn.network === "testnet" ? "testnet" : "mainnet",
            symbol: o.symbol,
            side: o.side === "long" ? "BUY" : "SELL",
            positionSide: o.side === "long" ? "LONG" : "SHORT",
            quantity: notional / px,
            type: "MARKET",
            price: px,
            notional,
            confirmLive: true,
            connId: conn.id,
            equity: acct,
            slAtr: Math.max(0.8, slPct * 100),
            tpRatio: tpPct / Math.max(slPct, 1e-6),
            attachProtect: !o.bot,
            clientOrderId: makeClientOrderId(conn.id, "E"),
          },
        })
          .then((res) => {
            set({ ticketMsg: res.ok ? `LIVE ${conn.id} ${o.symbol} ${o.side}` : `LIVE rejected ${conn.id}: ${res.error}` });
            if (!res.ok) return;
            liveLane.set(`${conn.id}:${o.symbol}`, o.bot ? "bot" : "progress");
            if (o.bot) void placeBotControls(conn.network === "testnet" ? "testnet" : "mainnet", conn.id, o.symbol, o.side, px, Math.max(slPct, 0.008), Math.max(tpPct, 0.006), px, "both", notional / px);
            if (get().activeConnId === conn.id) void get().pullExchange();
          })
          .catch((err: unknown) => {
            set({ ticketMsg: `LIVE rejected ${conn.id}: ${err instanceof Error ? err.message : "order failed"}` });
          });
      }
      e.botHistTick = sampledAt;
      e.activeConnId = view;
      e.botMode = runningIds.length > 0;
      e.running = true;
      e.phase = "running";
      queueExchangeOpen(get, set);
      queueBotControls(get);
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
      queueExchangeOpen(get, set);
      queueBotControls(get);
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
    const anyBots = get().botsRunning || DESK_CONN_IDS.some((id) => get().botByConn[id]?.running);
    if (!get().liveSession && !anyBots) {
      set({
        tactic: "trailing",
        rangeType: "atr",
        tacticConfig: { ...LIVE_RUN_CFG },
        blockConfig: liveRunBlock(get().blockConfig),
        costStep: 3,
      });
    }
    const e = get().vst;
    const cfg = get().tacticConfig;
    const tactic = get().tactic;
    const rangeType = get().rangeType;
    e.symbolCount = get().symbolCount;
    e.orderType = get().orderType;
    e.activeConnId = get().activeConnId;
    if (!get().liveSession) {
      engageLiveBook(e);
      e.blockCfg = get().blockConfig;
      if (!e.botMode) requeueFree(e, cfg, tactic, rangeType, get().activeConnId);
    }
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
    if (!get().liveSession) {
      set({
        tactic: "trailing",
        rangeType: "atr",
        tacticConfig: { ...LIVE_RUN_CFG },
        blockConfig: liveRunBlock(get().blockConfig),
        costStep: 3,
      });
    }
    const e = get().vst;
    e.symbolCount = get().symbolCount;
    e.orderType = get().orderType;
    if (!get().liveSession) engageLiveBook(e);
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
    e.strategyToggles = get().strategyToggles;
    e.minPf = get().thresholds.minPf;
    e.basePf = get().thresholds.basePf;
    e.axisPf = get().thresholds.axisPf;
    e.blockPf = get().thresholds.blockPf;
    e.shortPf = get().thresholds.shortPf;
    e.shortBasePf = get().thresholds.shortBasePf;
    e.shortAxisPf = get().thresholds.shortAxisPf;
    e.shortBlockPf = get().thresholds.shortBlockPf;
    e.shortProgress = get().shortProgress;
    e.intervalStrategy = get().intervalStrategy;
    e.lastNProgress = get().lastNProgress;
    e.shortRange = Boolean(get().tacticConfig.shortRange);
    e.blockCfg = {
      ...get().blockConfig,
      enabled: get().strategyToggles.block && get().blockConfig.enabled,
      volumeRatio: clampBlockVol(get().blockConfig.volumeRatio),
      relVolumeRatio: clampBlockVol(get().blockConfig.relVolumeRatio ?? get().blockConfig.volumeRatio),
      minRelPf: get().thresholds.blockPf,
      liveDisableMinPf: get().thresholds.blockPf,
    };
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
      const complete = hours >= 12;
      const marks = hours >= 32 ? [2, 4, 8, 16, 32, 72].filter((h) => h <= hours) : undefined;
      const cfg = complete
        ? {
            ...get().tacticConfig,
            shortRange: true as const,
            tpAtr: 0.42,
            slOfTp: 1.7,
            slAtr: 0.714,
            tpRatio: 1 / 1.7,
            trailingPct: 1.5,
            maxHoldTicks: 8,
            maxHoldBars: 3,
            axisPartialRatio: 3,
          }
        : get().tacticConfig;
      const { report } = simulateHours(hours, cfg, complete ? "trailing" : get().tactic, {
        symbolCount: complete ? Math.max(80, get().symbolCount) : get().symbolCount,
        orderType: get().orderType,
        rangeType: complete ? "atr" : get().rangeType,
        marks,
        block: complete
          ? {
              ...DEFAULT_BLOCK_CONFIG,
              ...get().blockConfig,
              enabled: true,
              counts: [1, 2, 3, 4, 5, 6],
              volumeRatio: 0.4,
              relVolumeRatio: 0.4,
              sharedVolumeRatio: 3,
              overallVolumeRatio: 3,
              maxVolumeMultiplier: 8,
              minActiveLevel: 1,
              pauseCountRatio: 0,
              windows: true,
              stack: true,
              volumeMode: "parallel",
              overallMode: "parallel",
              liveDisable: false,
              autoEval: true,
            }
          : get().blockConfig,
        equity: complete ? 10 : undefined,
        costStep: complete ? 3 : undefined,
        complete,
        comboOnly: false,
        prehours: 0,
        shortPf: 0.95,
        shortBasePf: 0.7,
        blockPf: 1.15,
        minPf: 0.95,
        basePf: 0.7,
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
  setBotsSelected: (t) => set((s) => {
    const bots = { ...s.bots, selected: t };
    return { bots, botByConn: withConnBots(s, bots) };
  }),
  setBotsHours: (h) =>
    set((s) => {
      const hours = (h === 12 || h === 24 || h === 36 || h === 48 || h === 60 || h === 72 ? h : s.bots.hours) as BotsPersist["hours"];
      const bots = { ...s.bots, hours };
      return { bots, botByConn: withConnBots(s, bots) };
    }),
  toggleBotArmed: (t) =>
    set((s) => {
      const on = s.bots.armed.includes(t);
      const armed = sanitizeArmed(on ? s.bots.armed.filter((x) => x !== t) : [...s.bots.armed, t], s.bots.armed);
      const bots = { ...s.bots, armed };
      return { bots, botByConn: withConnBots(s, bots) };
    }),
  setBotsArmed: (t) => set((s) => {
    const bots = { ...s.bots, armed: sanitizeArmed(t, s.bots.armed) };
    return { bots, botByConn: withConnBots(s, bots) };
  }),
  patchBotConfig: (t, p) =>
    set((s) => {
      const bots = {
        ...s.bots,
        configs: { ...s.bots.configs, [t]: sanitizeBotConfig({ ...s.bots.configs[t], ...p, type: t }, t) },
      };
      return { bots, botByConn: withConnBots(s, bots) };
    }),
  startBot: () => {
    const snap = get();
    const id = snap.activeConnId;
    const focus = snap.bots.selected;
    const cfg = sanitizeBotConfig(snap.bots.configs[focus], focus);
    const floors = liveBotFloors(cfg);
    const armed = sanitizeArmed(snap.bots.armed.length ? snap.bots.armed : [focus]);
    const bots = { ...snap.bots, armed };
    const botByConn = { ...snap.botByConn, [id]: { ...bots, running: true } };
    const tactic = cfg.strategies.trailing ? "trailing" : cfg.strategies.axis ? "axis" : "hybrid";
    set({
      bots,
      botsRunning: true,
      botByConn,
      connections: snap.connections.map((c) => ({ ...c, armed: Boolean(botByConn[c.id]?.running) })),
      symbolCount: cfg.symbolCount,
      strategyToggles: { ...cfg.strategies },
      tactic,
      rangeType: "atr",
      orderType: "market",
      tacticConfig: {
        ...snap.tacticConfig,
        tpAtr: floors.tpAtr,
        slOfTp: floors.slOfTp,
        trailingPct: floors.trailPct,
        tpRatio: 1 / Math.max(0.5, floors.slOfTp),
        slAtr: Math.max(0.3, floors.tpAtr * Math.min(floors.slOfTp, 2)),
        shortRange: true,
        maxHoldTicks: 24,
      },
    });
    const e = get().vst;
    e.botMode = true;
    e.activeConnId = id;
    e.symbolCount = cfg.symbolCount;
    e.orderType = "market";
    e.strategyToggles = { ...cfg.strategies };
    if (!e.running || e.phase === "paused" || e.phase === "idle" || e.phase === "stopped") get().startEngine();
    e.botMode = true;
    e.activeConnId = id;
    e.lastMsg = `Bots live · ${armed.join(", ")} · ${id}`;
    set({ botsRunning: true, vst: snapshotVst(e), ticketMsg: e.lastMsg });
  },
  runLiveBots: () => {
    const botByConn = { ...get().botByConn };
    for (const id of DESK_CONN_IDS) {
      const base = botByConn[id] ?? freshConnBots();
      const armed = sanitizeArmed(base.armed);
      for (const t of BOT_TYPES) {
        if (armed.length >= 3) break;
        if (!armed.includes(t)) armed.push(t);
      }
      const three = sanitizeArmed(armed);
      botByConn[id] = { ...base, armed: three, selected: three[0] ?? base.selected, running: true, touched: true };
    }
    const view = get().activeConnId;
    const viewSess = botByConn[view];
    set({
      botByConn,
      botsRunning: Boolean(viewSess?.running),
      ...(viewSess
        ? { bots: { selected: viewSess.selected, armed: viewSess.armed, hours: viewSess.hours, configs: viewSess.configs } }
        : {}),
      connections: get().connections.map((c) => ({ ...c, armed: Boolean(botByConn[c.id]?.running) })),
    });
    const e = get().vst;
    e.botMode = true;
    e.activeConnId = view;
    if (!e.running || e.phase === "paused" || e.phase === "idle" || e.phase === "stopped") get().startEngine();
    e.botMode = true;
    e.running = true;
    e.phase = "running";
    const cfg = get().tacticConfig;
    const tactic = get().tactic;
    const range = get().rangeType;
    const n = 40;
    const order = ["bingx-x01", ...DESK_CONN_IDS.filter((id) => id !== "bingx-x01")];
    for (const id of order) {
      const sess = botByConn[id];
      if (!sess?.running) continue;
      e.activeConnId = id;
      e.botMode = true;
      e.x01Progress = id === "bingx-x01";
      const tickCfg = e.x01Progress ? LIVE_RUN_CFG : cfg;
      const tickTac = e.x01Progress ? "trailing" : tactic;
      for (let i = 0; i < 8; i++) {
        stepDeskBots(e, sess.armed, sess.configs);
        if (e.x01Progress) e.symbolCount = n;
        tickVst(e, tickCfg, tickTac, { symbolCount: e.x01Progress ? n : Math.min(12, get().symbolCount || 10), rangeType: range, block: e.x01Progress ? liveRunBlock(get().blockConfig) : get().blockConfig });
      }
    }
    e.activeConnId = "bingx-x01";
    e.botMode = true;
    e.x01Progress = true;
    const x01n = e.positions.filter((p) => p.connId === "bingx-x01" && p.qty > 0).length;
    const progressN = [...e.queue, ...e.orders].filter((o) => o.connId === "bingx-x01" && !String(o.playbook || "").startsWith("bot:") && (o.status === "queued" || o.status === "open" || o.status === "partial")).length;
    e.lastMsg = `X01 progress · ${x01n} open · ${progressN} orders`;
    set({ vst: snapshotVst(e), ticketMsg: e.lastMsg, activeConnId: "bingx-x01", sessionPhase: "running" });
    void get().connectActive();
  },
  stopBot: () => {
    const id = get().activeConnId;
    const e = get().vst;
    e.queue = e.queue.filter((o) => o.connId !== id || !String(o.playbook || "").startsWith("bot:"));
    for (const o of e.orders) {
      if (o.connId !== id || !String(o.playbook || "").startsWith("bot:")) continue;
      if (o.status === "open" || o.status === "partial" || o.status === "queued") o.status = "cancelled";
    }
    e.orders = e.orders.filter((o) => !(o.connId === id && String(o.playbook || "").startsWith("bot:") && o.status === "cancelled"));
    const botByConn = { ...get().botByConn, [id]: { ...(get().botByConn[id] ?? { ...get().bots, running: false }), ...get().bots, running: false } };
    const any = DESK_CONN_IDS.some((conn) => botByConn[conn]?.running);
    e.botMode = any;
    if (!any) get().pauseEngine();
    set({
      botsRunning: false,
      botByConn,
      connections: get().connections.map((c) => ({ ...c, armed: Boolean(botByConn[c.id]?.running) })),
      vst: snapshotVst(e),
      ticketMsg: `Bots stopped · ${id}`,
    });
  },
  autoValidate: () => {
    try {
    const result = autoValidateConfigs({
      lastN: get().lastNs.combos,
      th: get().thresholds,
      base: get().tacticConfig,
    });
    const applied = result.confirmOk;
    set({
      validation: { ...result, applied },
      ...(applied
        ? {
            tactic: result.tactic,
            rangeType: result.rangeType,
            tacticConfig: result.cfg,
            enabledKinds: result.enabledKinds,
          }
        : {}),
    });
    const e = get().vst;
    if (result.confirmReport) e.sim = result.confirmReport;
    if (applied) {
      e.lastMsg = `Auto-validate 3d · ${result.tactic} · ${result.rangeType} · trail ${result.cfg.trailingPct.toFixed(1)}% · SL ${result.cfg.slAtr.toFixed(1)} · TP/SL ${result.cfg.tpRatio.toFixed(2)}R`;
      get().applyLiveConfig();
    } else {
      e.lastMsg = `Auto-validate held · 3d PF ${(result.confirmReport?.pf ?? 0).toFixed(2)} · live unchanged`;
    }
    set({ ticketMsg: e.lastMsg, vst: snapshotVst(e) });
    return { ...result, applied };
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
      block: get().blockConfig,
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
    const next = AUTO_EVAL_HOURS.filter((h) => hours.includes(h));
    set({ evalHours: next.length ? [...next] : [...AUTO_EVAL_HOURS] });
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
      useMaxLeverage: true,
      leverage: 0,
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
      const ownBook = Boolean(e.x01Progress) || DESK_CONN_IDS.some((id) => get().botByConn[id]?.running);
      if (!ownBook && Number.isFinite(equity) && equity > 0) {
        e.stats.equity = equity;
        e.ledger.peak = Math.max(e.ledger.peak || 0, equity);
      }
      if (!ownBook && Number.isFinite(pf)) e.stats.pf = pf;
      if (!ownBook && Number.isFinite(wr)) e.stats.wr = wr;
      if (!ownBook && Number.isFinite(net)) e.stats.net = net;
      if (!ownBook && Number.isFinite(trades)) {
        e.stats.trades = trades;
        e.ledger.trades = trades;
      }
      if (!ownBook && Number.isFinite(mdd)) e.stats.mdd = mdd;
      const wins = Number(sess.wins);
      if (!ownBook && Number.isFinite(wins)) e.ledger.wins = wins;
      const botsOn = DESK_CONN_IDS.some((id) => get().botByConn[id]?.running);
      if (botsOn) {
        e.running = true;
        e.phase = "running";
        e.botMode = true;
      } else {
        const ph = String(sess.phase ?? sess.sessionPhase ?? "running");
        e.running = ph === "running";
        e.phase = ph === "paused" ? "paused" : ph === "stopped" ? "stopped" : "running";
        e.lastMsg = String(sess.lastMsg ?? e.lastMsg);
      }
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
      const prevOv = get().liveOverall;
      const ovAt = ov && typeof ov === "object" ? Number((ov as { at?: number }).at) : 0;
      const prevAt = prevOv && typeof prevOv === "object" ? Number((prevOv as { at?: number }).at) : 0;
      const ovChanged = Boolean(ov) && ovAt !== prevAt;
      if (ovChanged || Math.round(elapsed * 2) !== Math.round(Number(get().liveElapsed) * 2) || mark !== get().liveMark) {
        lastLiveMarkAt = Date.now();
        pinDeskScroll();
        set(ovChanged ? { liveElapsed: elapsed, liveMark: mark, liveOverall: ov } : { liveElapsed: elapsed, liveMark: mark });
      }
      return;
    }
    const prevOv = get().liveOverall;
    const keepOv = prevOv && ov && prevOv.at === ov.at ? prevOv : ov;
    const prevEx = get().exchange;
    const active = get().activeConnId;
    const incomingConn = String(book?.connId || (sess as { conn?: string } | null)?.conn || "");
    const incomingForActive = Boolean(book?.ok) && (!incomingConn || incomingConn === active);
    const heldForActive = Boolean(prevEx?.ok) && prevEx?.connId === active;
    const nextBook = incomingForActive ? book : heldForActive || prevEx?.connId === active ? prevEx : null;
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
      exchange: sameEx ? prevEx : nextBook && nextBook.ok ? nextBook : prevEx?.connId === active ? prevEx : null,
      feed:
        sess?.pingOk || book?.ok
          ? get().feed.state === "live"
            ? get().feed
            : { state: "live", venue: "bingx", latencyMs: book?.latencyMs ?? get().feed.latencyMs, at: Date.now(), count: get().feed.count, missing: get().feed.missing }
          : get().feed,
      connections: sameConn
        ? prevConn
        : prevConn.map((c) =>
            c.id === liveId
              ? {
                  ...c,
                  hasKeys: true,
                  armed: Boolean(get().botByConn[c.id]?.running) || c.armed,
                  testnet: liveNet !== "mainnet",
                  network: liveNet,
                  status: sess?.pingOk || book?.ok ? "connected" : c.status,
                  lastPingMs: book?.ok ? book.latencyMs : c.lastPingMs,
                  equity: equity > 0 ? equity : c.equity,
                  positionCount: nextPos || c.positionCount,
                  openOrderCount: nextOrd || c.openOrderCount,
                  apiKeyMasked: c.apiKeyMasked === "—" ? "env •••" : c.apiKeyMasked,
                }
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
      e.strategyToggles = snap.strategyToggles;
      e.blockCfg = { ...snap.blockConfig, enabled: snap.strategyToggles.block && snap.blockConfig.enabled };
      e.minPf = snap.thresholds.minPf;
      e.basePf = snap.thresholds.basePf;
      e.axisPf = snap.thresholds.axisPf;
      e.blockPf = snap.thresholds.blockPf;
      e.shortPf = snap.thresholds.shortPf;
      e.shortBasePf = snap.thresholds.shortBasePf;
      e.shortAxisPf = snap.thresholds.shortAxisPf;
      e.shortBlockPf = snap.thresholds.shortBlockPf;
      e.shortProgress = snap.shortProgress ?? sanitizeShortProgress(undefined);
      e.intervalStrategy = snap.intervalStrategy ?? sanitizeIntervalStrategy(undefined);
      e.lastNProgress = snap.lastNProgress ?? sanitizeLastNProgress(undefined);
      e.shortRange = Boolean(snap.tacticConfig.shortRange);
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
        strategyToggles: snap.strategyToggles,
        shortProgress: snap.shortProgress ?? sanitizeShortProgress(undefined),
        intervalStrategy: snap.intervalStrategy ?? sanitizeIntervalStrategy(undefined),
        lastNProgress: snap.lastNProgress ?? sanitizeLastNProgress(undefined),
        bots: (() => {
          const saved = get().botByConn[snap.activeConnId];
          const view = saved?.touched ? saved : sanitizeBotsPersist(snap.bots ?? get().bots);
          return { selected: view.selected, armed: view.armed, hours: view.hours, configs: view.configs };
        })(),
        botsRunning: Boolean(get().botByConn[snap.activeConnId]?.running),
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
    try {
      const local = readLocalSettings();
      if (local && (local.rev > 0 || local.at > 0)) {
        get().applySettingsSnap(local, "local");
      }
      const remote = await loadDeskSettings();
      if (remote) {
        const curAt = get().settingsAt;
        const curRev = get().settingsRev;
        if (remote.at > curAt || remote.rev > curRev) {
          get().applySettingsSnap(remote, "server");
          writeLocalSettings(sanitizeDeskSettings(remote));
        }
      }
    } catch {
      /* stay on local */
    } finally {
      if (!DESK_CONN_IDS.every((id) => get().botByConn[id]?.running)) get().runLiveBots();
      if (get().activeConnId !== "bingx-x01") get().setActiveConn("bingx-x01");
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
    const short = snap.tacticConfig?.shortRange ? " short" : "";
    const counts = (snap.blockConfig?.counts ?? []).join("-") || "off";
    const preset: SettingsPreset = {
      id,
      label: name,
      blurb: `${snap.tactic}/${snap.rangeType}${short} · Block ${counts} · PF ${snap.thresholds.minPf} · ${snap.symbolCount} sym`,
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
    if (!isDeskConn(id) || id === get().activeConnId) {
      if (id === get().activeConnId) void get().connectActive();
      return;
    }
    const curId = get().activeConnId;
    const botByConn = withConnBots(get(), get().bots, get().botByConn[curId]?.running);
    const next = botByConn[id] ?? freshConnBots();
    const e = get().vst;
    e.activeConnId = id;
    e.lastMsg = `Current session ${id}`;
    set({
      activeConnId: id,
      botByConn,
      bots: { selected: next.selected, armed: next.armed, hours: next.hours, configs: next.configs },
      botsRunning: next.running,
      connections: get().connections.map((c) => ({ ...c, armed: Boolean(botByConn[c.id]?.running) })),
      vst: snapshotVst(e),
      ticketMsg: e.lastMsg,
    });
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

if (typeof window !== "undefined") {
  window.setInterval(() => {
    const s = useDesk.getState();
    const on = s.botsRunning || DESK_CONN_IDS.some((id) => s.botByConn[id]?.running);
    if (!on) return;
    s.tickEngine();
  }, VST_TICK_MS);
}
