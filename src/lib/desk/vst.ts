import type {
  BlockAdjustResult,
  BlockConfig,
  Connection,
  ExchangeBook,
  Fill,
  IndicationId,
  LiveOrder,
  LivePosition,
  OrderTypeId,
  Position,
  RangeType,
  Side,
  SimReport,
  HorizonMark,
  StrategyKind,
  SymbolTape,
  TacticConfig,
  TacticKind,
  VstBatch,
  VstEngine,
  VstLedger,
  VstQuote,
  VstSymbol,
  BlockLaneState,
  BlockPosWindow,
} from "./types.ts";
import {
  DEFAULT_BLOCK_CONFIG,
  BLOCK_POS_COUNTS,
  DEFAULT_MAX_HOLD_TICKS,
  MIN_QUOTE_VOL,
  blockMaxAdditionalRatio,
  blockMinimumProfitFactor,
  blockStepQty,
  positionNotional,
  RANGE_TYPES,
  sharedBlockVolumeRatio,
  snapTpRatio,
  symbolIndications,
  STAGE_HOURS,
} from "./engine.ts";

const DEFAULT_CFG: TacticConfig = {
  trailingPct: 0.8,
  dcaCount: 1,
  dcaDrawdown: 0.8,
  axisSpacing: 0.55,
  axisLevels: 4,
  slAtr: 1.05,
  tpRatio: 3,
  maxHoldBars: 3,
  maxHoldTicks: 16,
};

export const TP_SL_RATIO = 2.5;
export const SL_ATR_MULT = 0.45;
export const VST_MAX_SYMBOLS = 50;
export const VST_MAX_POSITIONS = 100;
export const VST_BATCH_SIZE = 20;
export const VST_RATE_PER_SEC = 10;
export const VST_RATE_BURST = 20;
export const VST_RATE_WINDOW = 100;
export const VST_TICK_MS = 400;
export const VST_MINUTES_PER_TICK = 1;
export const TICKS_PER_HOUR = 60;
export const VST_MAX_WORKING_ORDERS = 400;
export const VST_MAX_QUEUE = 250;
export const VST_MAX_BATCHES = 12;
export const VST_CONN_IDS = ["bingx-vst-01", "bingx-vst-02"] as const;
export const LIVE_CONN_ID = "bingx-x01";
export const DESK_CONN_IDS = [...VST_CONN_IDS, LIVE_CONN_ID] as const;
export const VST_DEFAULT_CONN = VST_CONN_IDS[1];

export function isDeskConn(id: string | undefined | null): boolean {
  return Boolean(id && (DESK_CONN_IDS as readonly string[]).includes(id));
}

export function ownedByDesk<T extends { connId: string }>(row: T, connId?: string): boolean {
  if (!isDeskConn(row.connId)) return false;
  return connId ? row.connId === connId : true;
}


export const VST_SYMBOLS: VstSymbol[] = [
  [
    "BTCUSDT",
    "BTC",
    64250,
    .007
  ],
  [
    "ETHUSDT",
    "ETH",
    3412,
    .01
  ],
  [
    "SOLUSDT",
    "SOL",
    148.4,
    .014
  ],
  [
    "BNBUSDT",
    "BNB",
    582,
    .009
  ],
  [
    "XRPUSDT",
    "XRP",
    .624,
    .016
  ],
  [
    "DOGEUSDT",
    "DOGE",
    .158,
    .02
  ],
  [
    "AVAXUSDT",
    "AVAX",
    38.2,
    .015
  ],
  [
    "LINKUSDT",
    "LINK",
    14.35,
    .013
  ],
  [
    "ADAUSDT",
    "ADA",
    .452,
    .018
  ],
  [
    "DOTUSDT",
    "DOT",
    6.84,
    .016
  ],
  [
    "MATICUSDT",
    "MATIC",
    .538,
    .019
  ],
  [
    "ATOMUSDT",
    "ATOM",
    7.12,
    .015
  ],
  [
    "NEARUSDT",
    "NEAR",
    5.41,
    .018
  ],
  [
    "APTUSDT",
    "APT",
    9.22,
    .017
  ],
  [
    "SUIUSDT",
    "SUI",
    1.84,
    .02
  ],
  [
    "SEIUSDT",
    "SEI",
    .412,
    .022
  ],
  [
    "TIAUSDT",
    "TIA",
    6.05,
    .019
  ],
  [
    "INJUSDT",
    "INJ",
    23.4,
    .018
  ],
  [
    "FETUSDT",
    "FET",
    1.52,
    .021
  ],
  [
    "RENDERUSDT",
    "RENDER",
    7.88,
    .017
  ],
  [
    "OPUSDT",
    "OP",
    1.74,
    .018
  ],
  [
    "ARBUSDT",
    "ARB",
    .812,
    .019
  ],
  [
    "PEPEUSDT",
    "PEPE",
    98e-7,
    .028
  ],
  [
    "SHIBUSDT",
    "SHIB",
    174e-7,
    .024
  ],
  [
    "LTCUSDT",
    "LTC",
    84.2,
    .012
  ],
  [
    "BCHUSDT",
    "BCH",
    428,
    .013
  ],
  [
    "ETCUSDT",
    "ETC",
    24.6,
    .016
  ],
  [
    "FILUSDT",
    "FIL",
    4.18,
    .018
  ],
  [
    "UNIUSDT",
    "UNI",
    8.64,
    .016
  ],
  [
    "AAVEUSDT",
    "AAVE",
    148.2,
    .015
  ],
  [
    "MKRUSDT",
    "MKR",
    1680,
    .014
  ],
  [
    "CRVUSDT",
    "CRV",
    .392,
    .02
  ],
  [
    "LDOUSDT",
    "LDO",
    1.64,
    .019
  ],
  [
    "GRTUSDT",
    "GRT",
    .184,
    .018
  ],
  [
    "SANDUSDT",
    "SAND",
    .312,
    .021
  ],
  [
    "MANAUSDT",
    "MANA",
    .338,
    .02
  ],
  [
    "AXSUSDT",
    "AXS",
    5.72,
    .018
  ],
  [
    "IMXUSDT",
    "IMX",
    1.46,
    .019
  ],
  [
    "STXUSDT",
    "STX",
    1.72,
    .017
  ],
  [
    "RUNEUSDT",
    "RUNE",
    5.08,
    .018
  ],
  [
    "FTMUSDT",
    "FTM",
    .582,
    .02
  ],
  [
    "ALGOUSDT",
    "ALGO",
    .148,
    .019
  ],
  [
    "XLMUSDT",
    "XLM",
    .108,
    .016
  ],
  [
    "TRXUSDT",
    "TRX",
    .152,
    .012
  ],
  [
    "TONUSDT",
    "TON",
    5.42,
    .015
  ],
  [
    "WLDUSDT",
    "WLD",
    2.18,
    .021
  ],
  [
    "JUPUSDT",
    "JUP",
    .842,
    .022
  ],
  [
    "PYTHUSDT",
    "PYTH",
    .368,
    .02
  ],
  [
    "ONDOUSDT",
    "ONDO",
    .912,
    .019
  ],
  [
    "WIFUSDT",
    "WIF",
    2.24,
    .026
  ]
].map((row) => {
  const [id, base, start, vol] = row as [string, string, number, number];
  return { id, base, quote: "USDT", start, vol };
});
export function clampSymbolCount(n: number): number {
  return Math.min(VST_MAX_SYMBOLS, Math.max(8, Math.round(n)));
}
export function universeSymbols(count = VST_MAX_SYMBOLS): VstSymbol[] {
  return VST_SYMBOLS.slice(0, clampSymbolCount(count));
}

function symbolScore(e: VstEngine, id: string): number {
  const q = e.quotes[id];
  const closed = e.closed.filter((c) => c.symbol === id).slice(0, 12);
  let pf = 1;
  if (closed.length) {
    const profit = closed.filter((c) => c.pnl > 0).reduce((s, c) => s + c.pnl, 0);
    const loss = Math.abs(closed.filter((c) => c.pnl < 0).reduce((s, c) => s + c.pnl, 0));
    pf = loss < 1e-9 ? (profit > 0 ? 3 : 0) : profit / loss;
  }
  const net = closed.reduce((s, c) => s + c.pnl, 0);
  const vol = finiteOr(q?.vol, 0);
  const chg = Math.abs(q?.chg ?? 0);
  const majors = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", "AVAXUSDT", "LINKUSDT"];
  const mi = majors.indexOf(id);
  return pf * 28 + (net > 0 ? 14 : net < 0 ? -8 : 0) + vol * 50 + chg * 40 + (mi >= 0 ? (8 - mi) * 6 : 0);
}

export function rankUniverse(e: VstEngine): VstSymbol[] {
  return [...universeSymbols(e.symbolCount)].sort((a, b) => symbolScore(e, b.id) - symbolScore(e, a.id));
}
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rand(tick: number, salt: string): number {
  return hash(`${tick}:${salt}`) % 1e4 / 1e4;
}
function slDist(atr: number, spacing: number, slAtr: number): number {
  const raw = Math.min(atr * slAtr, spacing * .42);
  return Math.max(raw, atr * .35);
}
function tpDistFromSl(sl: number, ratio = TP_SL_RATIO): number {
  return sl * snapTpRatio(ratio);
}
function clampPx(n: number, floor: number): number {
  if (!Number.isFinite(n)) return floor;
  return Math.max(n, floor * .25);
}
function protectLevels(entry: number, side: Side, sl0: number, tp0: number, ratio = TP_SL_RATIO) {
  const r = snapTpRatio(ratio);
  const floor = Math.max(entry * 1e-6, 1e-12);
  let sl = side === "long" ? entry - sl0 : entry + sl0;
  let tp = side === "long" ? entry + tp0 : entry - tp0;
  sl = clampPx(sl, floor);
  tp = clampPx(tp, floor);
  if (side === "long" && sl >= entry) sl = entry * .995;
  if (side === "short" && sl <= entry) sl = entry * 1.005;
  if (side === "long" && tp <= entry) tp = entry * 1.005;
  if (side === "short" && tp >= entry) tp = entry * .995;
  const slD = Math.abs(entry - sl);
  let tpD = Math.abs(tp - entry);
  if (slD > tpD / r + 1e-12) {
    const cap = tpD / r;
    sl = side === "long" ? entry - cap : entry + cap;
  }
  tpD = Math.abs(tp - entry);
  return {
    sl,
    tp,
    slDist: Math.abs(entry - sl),
    tpDist: tpD
  };
}
function axisLadders(q: VstQuote, cfg: TacticConfig): { rangeType: RangeType; spacing: number; levels: number[] }[] {
  const n = Math.max(2, cfg.axisLevels);
  const atrStep = q.atr * cfg.axisSpacing;
  const lin = q.px * (cfg.axisSpacing / 100) * 1.8 + q.atr * .25;
  const geo = q.px * (cfg.axisSpacing / 80);
  const vol = q.atr * (1.15 - Math.min(q.vol * 8, .45));
  const fib = q.atr * .809;
  const steps: { rangeType: RangeType; spacing: number }[] = [
    { rangeType: "linear", spacing: lin },
    { rangeType: "geometric", spacing: geo },
    { rangeType: "atr", spacing: atrStep },
    { rangeType: "volume", spacing: vol },
    { rangeType: "fibonacci", spacing: fib },
  ];
  return steps.map((s) => {
    const levels: number[] = [];
    for (let i = 1; i <= n; i++) levels.push(s.spacing * i);
    return { ...s, levels };
  });
}
function highestRange(q: VstQuote, cfg: TacticConfig) {
  return axisLadders(q, cfg).reduce((a, b) => b.spacing > a.spacing ? b : a);
}
function pickRange(q: VstQuote, cfg: TacticConfig, rangeType?: RangeType) {
  const ladders = axisLadders(q, cfg);
  if (rangeType) return ladders.find((l) => l.rangeType === rangeType) ?? highestRange(q, cfg);
  return highestRange(q, cfg);
}
function direction(q: VstQuote): Side {
  const ind = symbolIndications(q.id);
  if (ind.hits > 0 && ind.agree && Math.abs(ind.direction) >= 0.18) {
    return ind.direction > 0 ? "long" : "short";
  }
  if (ind.hits > 0 && Math.abs(ind.trend) >= 0.32 && Math.sign(ind.trend) === Math.sign(ind.direction || ind.trend)) {
    return ind.trend > 0 ? "long" : "short";
  }
  return q.px >= q.axis ? "short" : "long";
}
function cooldownKey(connId: string, symbol: string) {
  return `${connId}:${symbol}`;
}
function mkQuotes(): Record<string, VstQuote> {
  const out: Record<string, VstQuote> = {};
  for (const s of VST_SYMBOLS) {
    const jitter = (hash(s.id) % 400 - 200) / 1e4;
    const px = s.start * (1 + jitter);
    const atr = px * s.vol * 1.6;
    out[s.id] = {
      id: s.id,
      base: s.base,
      px,
      hi: px,
      lo: px,
      atr,
      vol: s.vol,
      axis: px * (1 - jitter * .4),
      chg: jitter
    };
  }
  return out;
}
export function vstConnections(): Connection[] {
  return mkConns();
}
function mkConns(): Connection[] {
  const ids = VST_SYMBOLS.map((s) => s.id);
  const types: OrderTypeId[] = [
    "market",
    "limit",
    "stop",
    "stop_limit",
    "trailing_stop",
    "ioc",
    "fok",
  ];
  return [{
    id: "bingx-vst-01",
    venue: "bingx",
    label: "BingX VST-01",
    testnet: true,
    network: "paper",
    armed: false,
    hasKeys: false,
    status: "disconnected",
    apiKeyMasked: "—",
    permissions: ["read", "trade"],
    symbols: [...ids],
    orderTypesEnabled: types,
    rateLimitUsed: 0,
    rateLimitMax: VST_RATE_WINDOW,
    openOrderCount: 0,
    positionCount: 0,
    maxPositions: VST_MAX_POSITIONS,
    maxSymbols: VST_MAX_SYMBOLS,
    unlimitedOrders: true,
    lastPingMs: 0
  }, {
    id: "bingx-vst-02",
    venue: "bingx",
    label: "BingX VST-02",
    testnet: true,
    network: "testnet",
    armed: false,
    hasKeys: false,
    status: "disconnected",
    apiKeyMasked: "—",
    permissions: ["read", "trade"],
    symbols: [...ids],
    orderTypesEnabled: types,
    rateLimitUsed: 0,
    rateLimitMax: 100,
    openOrderCount: 0,
    positionCount: 0,
    maxPositions: 100,
    maxSymbols: 50,
    unlimitedOrders: true,
    lastPingMs: 0
  }, {
    id: "bingx-x01",
    venue: "bingx",
    label: "BingX Live-01",
    testnet: false,
    network: "mainnet",
    armed: false,
    hasKeys: false,
    status: "disconnected",
    apiKeyMasked: "—",
    permissions: ["read", "trade"],
    symbols: [...ids],
    orderTypesEnabled: types,
    rateLimitUsed: 0,
    rateLimitMax: VST_RATE_WINDOW,
    openOrderCount: 0,
    positionCount: 0,
    maxPositions: VST_MAX_POSITIONS,
    maxSymbols: VST_MAX_SYMBOLS,
    unlimitedOrders: true,
    lastPingMs: 0
  }];
}
function emptyStats() {
  return {
    pf: 0,
    wr: 0,
    net: 0,
    mdd: 0,
    trades: 0,
    wins: 0,
    openOrders: 0,
    queued: 0,
    positions: 0,
    partials: 0,
    equity: 1e4,
    ddt: 0,
  };
}
function emptyLedger(): VstLedger {
  return {
    trades: 0,
    wins: 0,
    profit: 0,
    loss: 0,
    slExits: 0,
    tpExits: 0,
    timeExits: 0,
    peak: 1e4,
    maxMdd: 0,
    capRejects: 0,
    rateSkips: 0,
    maxPositions: 0,
    maxOrders: 0,
    winStreak: 0,
    lossStreak: 0,
    maxWinStreak: 0,
    maxLossStreak: 0,
    ordersPlaced: 0,
    ordersFilled: 0,
    ordersCancelled: 0,
    ordersRejected: 0,
    ddTicks: 0,
    maxDdt: 0,
  };
}

export function ensureEngine(e: VstEngine): VstEngine {
  e.lastTactic = e.lastTactic ?? "hybrid";
  e.lastRange = e.lastRange ?? "atr";
  e.lastBlockAt = e.lastBlockAt ?? 0;
  if (!e.ledger) e.ledger = emptyLedger();
  e.ledger.ddTicks = e.ledger.ddTicks ?? 0;
  e.ledger.maxDdt = e.ledger.maxDdt ?? 0;
  if (!e.stats) e.stats = emptyStats();
  e.stats.ddt = e.stats.ddt ?? 0;
  e.closed = e.closed ?? [];
  e.fills = e.fills ?? [];
  e.orders = e.orders ?? [];
  e.queue = e.queue ?? [];
  e.positions = e.positions ?? [];
  e.symbolStats = e.symbolStats ?? {};
  e.tokens = e.tokens ?? {};
  e.cooldown = e.cooldown ?? {};
  e.blockLanes = e.blockLanes ?? {};
  e.blockWindows = e.blockWindows ?? {};
  e.blockWindowsBySymbol = e.blockWindowsBySymbol ?? {};
  for (const lane of Object.values(e.blockLanes)) {
    lane.active = lane.active ?? true;
    lane.pauseRemaining = lane.pauseRemaining ?? {};
    lane.heldFactor = lane.heldFactor ?? {};
    lane.baseEntry = lane.baseEntry ?? 0;
    lane.satisfied = lane.satisfied ?? {};
    lane.pfRing = lane.pfRing ?? {};
    lane.parentPf = lane.parentPf ?? [];
  }
  return e;
}

export function initVstEngine(cfg: TacticConfig = DEFAULT_CFG, opts: { warmup?: number; symbolCount?: number; orderType?: OrderTypeId; arm?: boolean } = {}): VstEngine {
  const engine: VstEngine = {
    quotes: mkQuotes(),
    queue: [],
    orders: [],
    positions: [],
    fills: [],
    closed: [],
    batches: [],
    tick: 0,
    running: true,
    phase: "running",
    lastMsg: `VST x02 armed · TP/SL ${snapTpRatio(cfg.tpRatio)}R`,
    seq: 1,
    tokens: {
      "bingx-vst-01": VST_RATE_BURST,
      "bingx-vst-02": VST_RATE_BURST,
      "bingx-x01": VST_RATE_BURST,
    },
    stats: emptyStats(),
    ledger: emptyLedger(),
    sim: null,
    cooldown: {},
    symbolCount: clampSymbolCount(opts.symbolCount ?? VST_MAX_SYMBOLS),
    orderType: opts.orderType ?? "limit",
    symbolStats: {},
    activeConnId: VST_DEFAULT_CONN,
    healCount: 0,
    lastHeal: "",
    tpRatio: snapTpRatio(cfg.tpRatio ?? TP_SL_RATIO),
    costStep: 10,
    lastTactic: "hybrid",
    lastRange: "atr",
    lastBlockAt: 0,
    blockLanes: {},
    blockWindows: {},
    blockWindowsBySymbol: {},
  };
  if (opts.arm !== false) armUniverse(engine, cfg, "hybrid");
  const warm = opts.arm === false ? 0 : (opts.warmup ?? 12);
  for (let i = 0; i < warm; i++) tickVst(engine, cfg, "hybrid");
  engine.lastMsg = opts.arm === false
    ? `Idle book · ${engine.symbolCount} symbols · waiting live tape`
    : `Warm book · ${engine.symbolCount} symbols · two BingX VST sessions`;
  return engine;
}
function nextId(e: VstEngine, pfx: string): string {
  e.seq += 1;
  return `${pfx}${e.tick}-${e.seq}`;
}
function occupiedSymbols(e: VstEngine, connId?: string): Set<string> {
  const s = new Set<string>();
  const on = (id: string) => (connId ? id === connId : isDeskConn(id));
  for (const p of e.positions) if (on(p.connId)) s.add(p.symbol);
  for (const o of e.orders) if (on(o.connId) && (o.status === "open" || o.status === "partial")) s.add(o.symbol);
  for (const o of e.queue) if (on(o.connId)) s.add(o.symbol);
  return s;
}
function isTerminal(status: LiveOrder['status']): boolean {
  return status === "filled" || status === "cancelled" || status === "rejected";
}
function countPlaced(e: VstEngine, n = 1) {
  e.ledger.ordersPlaced += n;
}
function markTerminal(e: VstEngine, o: LiveOrder, status: 'filled' | 'cancelled' | 'rejected') {
  if (isTerminal(o.status)) return;
  o.status = status;
  if (status !== "filled") o.remaining = 0;
  if (status === "filled") e.ledger.ordersFilled += 1;
  else if (status === "cancelled") e.ledger.ordersCancelled += 1;
  else e.ledger.ordersRejected += 1;
}
function cancelQueued(e: VstEngine, drop: (o: LiveOrder) => boolean) {
  const keep = [];
  for (const o of e.queue) if (drop(o)) markTerminal(e, o, "cancelled");
  else keep.push(o);
  e.queue = keep;
}
export function bookCounts(e: VstEngine) {
  const keys = new Set<string>();
  const symbols = new Set<string>();
  let long = 0;
  let short = 0;
  for (const p of e.positions) {
    symbols.add(p.symbol);
    const k = `${p.symbol}:${p.side}`;
    if (keys.has(k)) continue;
    keys.add(k);
    if (p.side === "long") long += 1;
    else short += 1;
  }
  let open = 0;
  let partial = 0;
  for (const o of e.orders) if (o.status === "open") open += 1;
  else if (o.status === "partial") partial += 1;
  const queued = e.queue.length;
  const working = open + partial;
  return {
    positions: {
      slots: keys.size,
      long,
      short,
      symbols: symbols.size,
      legs: e.positions.length,
      maxSlots: e.symbolCount * 2,
      maxLegs: VST_MAX_POSITIONS
    },
    orders: {
      queued,
      open,
      partial,
      filled: e.ledger.ordersFilled,
      cancelled: e.ledger.ordersCancelled,
      rejected: e.ledger.ordersRejected,
      working,
      live: queued + working,
      placed: e.ledger.ordersPlaced
    }
  };
}
export function armUniverse(e: VstEngine, cfg: TacticConfig, _tactic: TacticKind, rangeType?: RangeType) {
  if (!isDeskConn(e.activeConnId)) e.activeConnId = VST_DEFAULT_CONN;
  const connId = e.activeConnId;
  let qn = 0;
  let pn = 0;
  for (const o of e.queue) if (o.connId === connId) qn += 1;
  for (const p of e.positions) if (p.connId === connId) pn += 1;
  if (qn >= VST_MAX_QUEUE || pn >= VST_MAX_POSITIONS) return;
  const busy = occupiedSymbols(e, connId);
  const universe = rankUniverse(e);
  universe.forEach((s, rank) => {
    const q = e.quotes[s.id];
    if (!q || !(q.px > 0)) return;
    if (busy.has(s.id)) return;
    if ((e.cooldown[cooldownKey(connId, s.id)] ?? 0) > e.tick) return;
    if (pn >= VST_MAX_POSITIONS) return;
    const side = direction(q);
    const hi = pickRange(q, cfg, rangeType);
    const sl0 = slDist(q.atr, hi.spacing, cfg.slAtr ?? SL_ATR_MULT);
    const tp0 = tpDistFromSl(sl0, cfg.tpRatio);
    const volMul = Math.min(1.4, Math.max(0.7, finiteOr(q.vol, 0.012) / 0.014));
    if (rank > 24 && finiteOr(q.vol, 0) < MIN_QUOTE_VOL) return;
    const notional = positionNotional(e.stats.equity || 1e4, e.costStep || 10) * volMul;
    const depth = rank < 10 ? hi.levels.length : rank < 24 ? Math.min(3, hi.levels.length) : Math.min(2, hi.levels.length);
    hi.levels.slice(0, Math.max(1, depth)).forEach((offset, li) => {
      if (qn >= VST_MAX_QUEUE) return;
      const px = side === "long" ? q.axis - offset : q.axis + offset;
      if (px <= 0) return;
      const qty = notional / px;
      const lv = protectLevels(px, side, sl0, tp0, cfg.tpRatio);
      e.queue.push({
        id: nextId(e, "q"),
        connId,
        symbol: s.id,
        side,
        type: ladderOrderType(e.orderType, li),
        qty,
        filled: 0,
        price: px,
        remaining: qty,
        status: "queued",
        rangeType: hi.rangeType,
        level: li + 1,
        sl: lv.sl,
        tp: lv.tp,
        slDist: lv.slDist,
        tpDist: lv.tpDist,
        batchId: "",
        note: `${e.lastTactic} ${hi.rangeType} L${li + 1} · ${connId}`
      });
      qn += 1;
      countPlaced(e);
    });
    busy.add(s.id);
  });
  e.lastMsg = `Queued ${qn} ladder orders on ${connId} · ${universe.length} symbols best-first · ${e.orderType}`;
}
function ladderOrderType(orderType: OrderTypeId, level: number): OrderTypeId {
  if (orderType === "market") return "market";
  if (level === 0 && (orderType === "stop" || orderType === "stop_limit" || orderType === "trailing_stop")) return "market";
  return orderType;
}
function refill(e: VstEngine) {
  const add = 8;
  for (const id of Object.keys(e.tokens)) e.tokens[id] = Math.min(VST_RATE_BURST, (e.tokens[id] ?? 0) + add);
}
function processBatches(e: VstEngine) {
  const byConn: Record<string, LiveOrder[]> = {};
  for (const o of e.queue) {
    if (!ownedByDesk(o, e.activeConnId)) continue;
    (byConn[o.connId] ??= []).push(o);
  }
  const keep: LiveOrder[] = e.queue.filter((o) => !ownedByDesk(o, e.activeConnId));
  for (const [connId, list] of Object.entries(byConn)) {
    let rest = list;
    while (rest.length && (e.tokens[connId] ?? 0) >= 1) {
      if (e.orders.length >= VST_MAX_WORKING_ORDERS) {
        keep.push(...rest);
        rest = [];
        e.ledger.capRejects += 1;
        break;
      }
      const room = VST_MAX_WORKING_ORDERS - e.orders.length;
      const take = rest.slice(0, Math.min(VST_BATCH_SIZE, room));
      rest = rest.slice(take.length);
      e.tokens[connId] = (e.tokens[connId] ?? 0) - 1;
      const batchId = nextId(e, "b");
      take.forEach((o) => {
        o.status = "open";
        o.batchId = batchId;
        e.orders.push(o);
      });
      e.batches.unshift({
        id: batchId,
        connId,
        count: take.length,
        tick: e.tick,
        accepted: take.length,
        rejected: 0,
      });
      if (e.batches.length > VST_MAX_BATCHES) e.batches.length = VST_MAX_BATCHES;
    }
    if (rest.length) {
      e.ledger.rateSkips += 1;
      keep.push(...rest);
    }
  }
  if (keep.length > VST_MAX_QUEUE) {
    const drop = keep.splice(VST_MAX_QUEUE);
    for (const o of drop) markTerminal(e, o, "cancelled");
  }
  e.queue = keep;
}
function walkQuotes(e: VstEngine, freeze?: Set<string>) {
  const active = new Set(universeSymbols(e.symbolCount).map((s) => s.id));
  for (const q of Object.values(e.quotes)) {
    if (active.size && !active.has(q.id)) continue;
    const frozen = freeze?.has(q.id);
    const scale = (frozen ? 0.18 : 1) / Math.sqrt(15);
    const n = rand(e.tick, q.id) - .5;
    const shock = frozen ? 0 : rand(e.tick, q.id + "s") > .992 ? (rand(e.tick, q.id + "k") - .5) * 3 : 0;
    const sigma = Math.max(q.vol * scale, 1e-8);
    const ret = (n * 1.8 + shock) * sigma;
    const open = q.px;
    const close = Math.max(open * (1 + ret), open * 1e-8);
    const span = q.atr * (frozen ? 0.02 : .06 + rand(e.tick, q.id + "w") * .14);
    q.lo = Math.min(open, close) - span * rand(e.tick, q.id + "lo");
    q.hi = Math.max(open, close) + span * rand(e.tick, q.id + "hi");
    if (q.lo <= 0) q.lo = close * .5;
    if (q.hi < q.lo) q.hi = q.lo * 1.0001;
    q.px = close;
    q.atr = q.atr * .98 + (q.hi - q.lo) * .02;
    q.axis = q.axis * .985 + q.px * .015;
    if (!frozen) q.chg = ret;
  }
}
export function classifyIndication(e: VstEngine, symbol: string): IndicationId {
  const pack = symbolIndications(symbol);
  const q = e.quotes[symbol];
  const rankedPack: [IndicationId, number][] = [
    ["trend", pack.trend],
    ["break", pack.break],
    ["active", pack.active],
    ["direction", pack.direction],
  ];
  rankedPack.sort((a, b) => b[1] - a[1]);
  if (!q) return Math.abs(rankedPack[0]?.[1] ?? 0) > 1e-9 ? rankedPack[0]![0] : "trend";
  const atr = Math.max(q.atr, q.px * 0.0008, 1e-9);
  const span = (q.hi - q.lo) / atr;
  const axisDist = Math.abs(q.px - q.axis) / atr;
  const chg = Number.isFinite(q.chg) ? q.chg : 0;
  const aligned = Math.sign(chg || 0) === Math.sign(q.px - q.axis || 0) || Math.abs(chg) < 1e-6;
  const scores: Record<IndicationId, number> = {
    trend: pack.trend * 2.2 + Math.abs(chg) * 40 + (aligned ? 0.35 : 0),
    break: pack.break * 2.2 + Math.max(0, span - 1.35) * 1.6 + Math.max(0, axisDist - 2.2) * 0.25,
    active: pack.active * 2.2 + Math.min(1.4, q.vol * 10) + span * 0.06,
    direction: pack.direction * 0.55 + (!aligned ? Math.abs(chg) * 8 : Math.abs(chg) * 1),
  };
  const ranked = (Object.entries(scores) as [IndicationId, number][]).sort((a, b) => b[1] - a[1]);
  return ranked[0]?.[0] ?? rankedPack[0]?.[0] ?? "trend";
}
function openPlaybook(tactic: TacticKind, indication: IndicationId): string {
  if (tactic === "dca") return "dca";
  if (tactic === "axis") return "axis";
  if (indication === "active" && tactic === "hybrid") return "normal";
  if (indication === "break") return "axis";
  if (indication === "direction") return "normal";
  if (indication === "active") return "block";
  return "normal";
}
export function kindFromIndication(id: IndicationId, playbook: string, tactic: TacticKind): StrategyKind {
  if (playbook === "block") return "block";
  if (id === "trend") return "trend";
  if (id === "break") return "breakout";
  if (id === "active") return "active";
  if (id === "direction") return "hybrid";
  if (tactic === "hybrid") return "hybrid";
  if (tactic === "axis") return "mean";
  if (tactic === "dca") return "volume";
  return "normal";
}
export function playbookOf(e: VstEngine, o: LiveOrder): string {
  if (/^Block/i.test(o.note || "")) return "block";
  if (/^DCA/i.test(o.note || "") || e.lastTactic === "dca") return "dca";
  if (e.lastTactic === "axis" || /^axis\b/i.test(o.note || "")) return "axis";
  return "normal";
}
function applyFill(e: VstEngine, o: LiveOrder, qty: number, px: number, kind: Fill['kind']) {
  if (!ownedByDesk(o)) return;
  if (qty <= 0 || !Number.isFinite(qty) || !Number.isFinite(px) || px <= 0) return;
  const unit = positionNotional(e.stats.equity || 1e4, e.costStep || 10);
  const want = Math.min(qty, o.remaining);
  const runaway = o.qty > 1000 || want * px > 2_000_000;
  const take = runaway ? Math.min(want, (unit * 4) / px) : want;
  if (take <= 0) return;
  o.filled += take;
  o.remaining = Math.max(0, o.qty - o.filled);
  const done = o.remaining <= 1e-12;
  let pos = e.positions.find((p) => p.connId === o.connId && p.symbol === o.symbol && p.side === o.side);
  const created = !pos;
  if (!pos) {
    if (e.positions.length >= VST_MAX_POSITIONS) {
      o.filled -= take;
      o.remaining = o.qty - o.filled;
      markTerminal(e, o, "rejected");
      e.ledger.capRejects += 1;
      e.lastMsg = "Position cap 100 — rejected new lane";
      return;
    }
    const lv = protectLevels(px, o.side, o.slDist, o.tpDist, e.tpRatio);
    pos = {
      id: nextId(e, "p"),
      connId: o.connId,
      symbol: o.symbol,
      side: o.side,
      qty: 0,
      plannedQty: o.qty,
      avgEntry: px,
      mark: px,
      sl: lv.sl,
      tp: lv.tp,
      slDist: lv.slDist,
      tpDist: lv.tpDist,
      realized: 0,
      unrealized: 0,
      legs: [],
      controllingRange: o.rangeType,
      rangeSpacing: Math.abs(o.price - (e.quotes[o.symbol]?.axis ?? o.price)),
      status: "partial",
      openedTick: e.tick,
      tactic: e.lastTactic,
      indication: classifyIndication(e, o.symbol),
      kind: kindFromIndication(classifyIndication(e, o.symbol), playbookOf(e, o), e.lastTactic),
      playbook: playbookOf(e, o),
      blockLevel: /^Block/i.test(o.note || "") ? Math.max(1, o.level || 1) : undefined,
    };
    e.positions.push(pos);
  } else if (!pos.legs.some((l) => l.orderId === o.id)) {
    pos.plannedQty += o.qty;
  }
  const newQty = pos.qty + take;
  pos.avgEntry = pos.qty <= 0 ? px : (pos.avgEntry * pos.qty + px * take) / newQty;
  pos.qty = newQty;
  pos.mark = px;
  pos.legs.push({
    orderId: o.id,
    qty: take,
    px
  });
  recordBlockFill(e, o, take);
  if (/^Block/i.test(o.note || "")) {
    pos.playbook = "block";
    pos.kind = "block";
    pos.blockLevel = Math.max(pos.blockLevel || 1, o.level || 1);
  } else if (/^DCA/i.test(o.note || "")) {
    pos.playbook = pos.playbook === "block" ? "block" : "dca";
  }
  if (!created) {
    const slUse = Math.max(o.slDist, pos.slDist, 1e-12);
    const tpUse = Math.max(o.tpDist, pos.tpDist, slUse * snapTpRatio(e.tpRatio));
    const lv = protectLevels(pos.avgEntry, pos.side, slUse, tpUse, e.tpRatio);
    if (pos.side === "long") {
      pos.sl = Math.max(pos.sl, lv.sl);
      pos.tp = Math.max(pos.tp, lv.tp);
    } else {
      pos.sl = Math.min(pos.sl, lv.sl);
      pos.tp = Math.min(pos.tp, lv.tp);
    }
    pos.slDist = Math.abs(pos.sl - pos.avgEntry);
    pos.tpDist = Math.abs(pos.tp - pos.avgEntry);
  }
  const otherWorking = e.orders.some(
    (x) =>
      x !== o &&
      x.symbol === o.symbol &&
      x.side === o.side &&
      x.connId === o.connId &&
      (x.status === "open" || x.status === "partial") &&
      x.remaining > 1e-12,
  );
  const unfilled = pos.qty + 1e-12 < pos.plannedQty * 0.98;
  pos.status = !done || otherWorking || unfilled ? "partial" : "open";
  const qFill = {
    id: nextId(e, "f"),
    orderId: o.id,
    connId: o.connId,
    symbol: o.symbol,
    side: o.side,
    qty: take,
    px,
    pnl: 0,
    kind,
    tick: e.tick
  };
  e.fills.unshift(qFill);
  if (e.fills.length > 200) e.fills.length = 200;
  if (done) markTerminal(e, o, "filled");
  else o.status = "partial";
}
function matchOrders(e: VstEngine) {
  for (const o of e.orders) {
    if (!ownedByDesk(o, e.activeConnId)) continue;
    if (o.status !== "open" && o.status !== "partial") continue;
    if (o.remaining <= 1e-12) {
      markTerminal(e, o, "filled");
      continue;
    }
    const q = e.quotes[o.symbol];
    if (!q || !(q.px > 0)) continue;
    const market = o.type === "market" || o.type === "ioc" || o.type === "fok";
    const vol = finiteOr(q.vol, 0);
    if (!market && vol < MIN_QUOTE_VOL * 0.35) continue;
    if (!(market || o.side === "long" && q.lo <= o.price || o.side === "short" && q.hi >= o.price)) continue;
    const vf = Math.min(1.55, Math.max(0.32, vol / 0.014));
    const frac = market ? 1 : Math.min(1, (0.38 + rand(e.tick, o.id) * 0.55) * vf);
    const qty = Math.min(o.remaining, o.qty * frac);
    if (qty <= 0) continue;
    const px = market ? q.px : o.side === "long" ? Math.min(o.price, q.px) : Math.max(o.price, q.px);
    applyFill(e, o, qty, px, o.filled > 0 ? "partial" : "entry");
  }
}
function cancelLane(e: VstEngine, p: LivePosition) {
  for (const o of e.orders) if (o.symbol === p.symbol && o.side === p.side && o.connId === p.connId && (o.status === "open" || o.status === "partial" || o.status === "queued")) markTerminal(e, o, "cancelled");
  cancelQueued(e, (o) => o.symbol === p.symbol && o.side === p.side && o.connId === p.connId);
}
function closePosition(e: VstEngine, p: LivePosition, exit: number, reason: "sl" | "tp" | "time") {
  if (!(p.qty > 0) || !Number.isFinite(p.qty) || !Number.isFinite(exit) || exit <= 0) {
    cancelLane(e, p);
    return;
  }
  const signed = p.side === "long" ? 1 : -1;
  let pnl = (exit - p.avgEntry) * p.qty * signed;
  const risk = Math.max(p.slDist * p.qty, positionNotional(e.stats.equity || 1e4, e.costStep || 10) * 0.25, 1e-9);
  if (Math.abs(pnl) > risk * 8) pnl = Math.sign(pnl) * risk * 8;
  if (!Number.isFinite(pnl)) pnl = 0;
  p.realized += pnl;
  e.ledger.trades += 1;
  if (pnl > 0) {
    e.ledger.wins += 1;
    e.ledger.profit += pnl;
  } else e.ledger.loss += Math.abs(pnl);
  if (reason === "sl") {
    e.ledger.slExits += 1;
    e.cooldown[cooldownKey(p.connId, p.symbol)] = e.tick + 20;
  } else if (reason === "time") {
    e.ledger.timeExits = (e.ledger.timeExits ?? 0) + 1;
    e.cooldown[cooldownKey(p.connId, p.symbol)] = e.tick + 6;
  } else {
    e.ledger.tpExits += 1;
    e.cooldown[cooldownKey(p.connId, p.symbol)] = e.tick + 8;
  }
  if (pnl > 0) {
    e.ledger.winStreak += 1;
    e.ledger.lossStreak = 0;
    if (e.ledger.winStreak > e.ledger.maxWinStreak) e.ledger.maxWinStreak = e.ledger.winStreak;
  } else {
    e.ledger.lossStreak += 1;
    e.ledger.winStreak = 0;
    if (e.ledger.lossStreak > e.ledger.maxLossStreak) e.ledger.maxLossStreak = e.ledger.lossStreak;
  }
  const r = pnl / Math.max(p.slDist * p.qty, 1e-9);
  const tape = e.symbolStats[p.symbol] ??= {
    id: p.symbol,
    trades: 0,
    wins: 0,
    profit: 0,
    loss: 0,
    sl: 0,
    tp: 0
  };
  tape.trades += 1;
  if (pnl > 0) {
    tape.wins += 1;
    tape.profit += pnl;
  } else tape.loss += Math.abs(pnl);
  if (reason === "sl") tape.sl += 1;
  else if (reason === "tp") tape.tp += 1;
  e.closed.unshift({
    id: p.id,
    connId: p.connId,
    symbol: p.symbol,
    side: p.side,
    pnl,
    qty: p.qty,
    entry: p.avgEntry,
    exit,
    reason,
    tick: e.tick,
    r,
    holdTicks: Math.max(0, e.tick - p.openedTick),
    at: Date.now(),
    tactic: p.tactic ?? e.lastTactic,
    rangeType: p.controllingRange ?? e.lastRange,
    kind: p.kind,
    indication: p.indication,
    playbook: p.playbook ?? "normal",
    level: p.blockLevel ?? (p.playbook === "block" ? Math.max(1, p.legs.length) : Math.max(1, p.legs.length)),
  });
  recordBlockClose(e, p, pnl);
  noteBlockPosClose(e, p.symbol, p.side, pnl);
  if (e.closed.length > 600) e.closed.length = 600;
  e.fills.unshift({
    id: nextId(e, "f"),
    orderId: p.id,
    connId: p.connId,
    symbol: p.symbol,
    side: p.side,
    qty: p.qty,
    px: exit,
    pnl,
    kind: reason,
    tick: e.tick
  });
  if (e.fills.length > 40) e.fills.length = 40;
  cancelLane(e, p);
}
function handleDca(e: VstEngine, p: LivePosition, cfg: TacticConfig) {
  if (p.legs.length < 1 || p.legs.length >= cfg.dcaCount) return;
  const q = e.quotes[p.symbol];
  if (!q) return;
  const signed = p.side === "long" ? 1 : -1;
  const ddPct = Math.max(0, (-signed * (q.px - p.avgEntry)) / Math.max(p.avgEntry, 1e-9) * 100);
  if (ddPct < cfg.dcaDrawdown * p.legs.length) return;
  const tag = `DCA L${p.legs.length + 1}`;
  const pending = [...e.queue, ...e.orders].some(
    (o) =>
      ownedByDesk(o, p.connId) &&
      o.symbol === p.symbol &&
      o.side === p.side &&
      o.note.includes(tag) &&
      !isTerminal(o.status),
  );
  if (pending) return;
  if (e.queue.filter((o) => o.connId === p.connId).length >= VST_MAX_QUEUE) return;
  const offset = p.avgEntry * (cfg.dcaDrawdown / 100);
  const px = p.side === "long" ? Math.max(q.px - offset, q.px * 0.5) : q.px + offset;
  if (!(px > 0)) return;
  const qty = Math.max(positionNotional(e.stats.equity || 1e4, e.costStep || 10) / px, 1e-8);
  const sl0 = slDist(q.atr, p.rangeSpacing || q.atr, cfg.slAtr ?? SL_ATR_MULT);
  const lv = protectLevels(px, p.side, sl0, tpDistFromSl(sl0, cfg.tpRatio), cfg.tpRatio);
  e.queue.push({
    id: nextId(e, "d"),
    connId: p.connId,
    symbol: p.symbol,
    side: p.side,
    type: e.orderType === "market" ? "market" : "limit",
    qty,
    filled: 0,
    price: px,
    remaining: qty,
    status: "queued",
    rangeType: p.controllingRange,
    level: p.legs.length + 1,
    sl: lv.sl,
    tp: lv.tp,
    slDist: lv.slDist,
    tpDist: lv.tpDist,
    batchId: "",
    note: tag,
  });
  countPlaced(e);
}

function handleAxis(e: VstEngine, p: LivePosition, cfg: TacticConfig) {
  const q = e.quotes[p.symbol];
  if (!q) return;
  const spacing = Math.max(p.rangeSpacing, q.atr * Math.max(cfg.axisSpacing, 0.2) * 0.01);
  const sl0 = slDist(q.atr, spacing, cfg.slAtr ?? SL_ATR_MULT);
  const lv = protectLevels(p.avgEntry, p.side, sl0, tpDistFromSl(sl0, cfg.tpRatio), cfg.tpRatio);
  if (p.side === "long") {
    if (lv.sl > p.sl) p.sl = lv.sl;
    p.tp = Math.max(lv.tp, p.tp);
  } else {
    if (lv.sl < p.sl) p.sl = lv.sl;
    p.tp = Math.min(lv.tp, p.tp);
  }
  p.slDist = Math.abs(p.sl - p.avgEntry);
  p.tpDist = Math.abs(p.tp - p.avgEntry);
  if (p.slDist > p.tpDist / snapTpRatio(cfg.tpRatio || e.tpRatio || TP_SL_RATIO) + 1e-12) {
    p.slDist = p.tpDist / snapTpRatio(cfg.tpRatio || e.tpRatio || TP_SL_RATIO);
    p.sl = p.side === "long" ? p.avgEntry - p.slDist : p.avgEntry + p.slDist;
  }
}

function applySessionCoord(e: VstEngine) {
  try {
    const conn = e.activeConnId;
    if (!isDeskConn(conn)) return;
    const last = e.closed.filter((c) => c.connId === conn).slice(0, 8);
    const ongoing = e.positions.filter((p) => p.connId === conn);
    if (!last.length || !ongoing.length) return;
    const lastScore = last.reduce((s, c) => s + (c.side === "long" ? 1 : -1), 0);
    const onScore = ongoing.reduce((s, p) => s + (p.side === "long" ? 1 : -1), 0);
    let activity = 0;
    let n = 0;
    for (const p of ongoing) {
      const q = e.quotes[p.symbol];
      if (!q) continue;
      const px = Math.max(finiteOr(q.px, 1), 1e-9);
      const atr = Math.max(finiteOr(q.atr, px * 0.004), 1e-9);
      activity += Math.abs(finiteOr(q.chg, 0)) / Math.max(atr / px, 1e-6) + finiteOr(q.vol, 1) * 0.4;
      n += 1;
    }
    activity = n ? activity / n : 0;
    if (!Number.isFinite(activity)) activity = 0;
    const hf = activity >= 1.1;
    if (!lastScore || !onScore) return;
    if (Math.sign(lastScore) === Math.sign(onScore) && !hf) return;
    if (Math.sign(lastScore) === Math.sign(onScore)) return;
    const want: Side = onScore > 0 ? "long" : "short";
    const drop = e.queue.filter((o) => o.connId === conn && o.side !== want).length;
    const keep = e.queue.length - drop;
    if (keep < 2 && ongoing.length < 2) return;
    const before = e.queue.length;
    cancelQueued(e, (o) => o.connId === conn && o.side !== want);
    if (e.queue.length < before) {
      e.lastMsg = hf
        ? `HF coord reduce · ${conn} opposite ladders cancelled`
        : `Coord reduce · ${conn} opposite ladders cancelled`;
    }
  } catch {
    noteHeal(e, "coord recovered");
  }
}

function managePositions(e: VstEngine, tactic: TacticKind, cfg: TacticConfig, opts?: { minHold?: number; liveTape?: boolean }) {
  const keep = [];
  for (const p of e.positions) {
    if (!ownedByDesk(p, e.activeConnId)) {
      keep.push(p);
      continue;
    }
    const q = e.quotes[p.symbol];
    if (!q) {
      keep.push(p);
      continue;
    }
    p.mark = q.px;
    const signed = p.side === "long" ? 1 : -1;
    p.unrealized = (q.px - p.avgEntry) * p.qty * signed;
    const fillRatio = p.plannedQty > 0 ? p.qty / p.plannedQty : 1;
    const partial = p.status === "partial" || fillRatio < 0.55;
    if (tactic === "dca" && (cfg.dcaCount ?? 0) > 1) handleDca(e, p, cfg);
    if (tactic === "axis" || tactic === "hybrid") handleAxis(e, p, cfg);
    if (tactic === "trailing" || tactic === "hybrid") {
      const pct = Math.max(0.4, cfg.trailingPct) / 100;
      const trailGap = p.slDist * (1 + (pct - 0.008) * 6);
      if (signed * (q.px - p.avgEntry) >= p.slDist * 0.95) {
        if (p.side === "long") {
          const next = q.px - trailGap;
          if (next > p.sl) p.sl = next;
        } else {
          const next = q.px + trailGap;
          if (next < p.sl) p.sl = next;
        }
        const tpRoom = Math.abs(p.tp - p.avgEntry);
        const r = snapTpRatio(e.tpRatio || cfg.tpRatio || TP_SL_RATIO);
        if (Math.abs(p.sl - p.avgEntry) > tpRoom / r + 1e-12) p.sl = p.side === "long" ? p.avgEntry - tpRoom / r : p.avgEntry + tpRoom / r;
        p.slDist = Math.abs(p.sl - p.avgEntry);
      }
    }
    if (e.tick === p.openedTick || e.tick - p.openedTick < Math.max(1, opts?.minHold ?? 1)) {
      keep.push(p);
      continue;
    }
    const hitSl = p.side === "long" ? q.lo <= p.sl : q.hi >= p.sl;
    const hitTp = p.side === "long" ? q.hi >= p.tp : q.lo <= p.tp;
    if (opts?.liveTape) {
      if (hitTp && !partial) {
        closePosition(e, p, p.tp, "tp");
        continue;
      }
      keep.push(p);
      continue;
    }
    const holdTicks = e.tick - p.openedTick;
    const maxHold = Math.max(4, Math.round(cfg.maxHoldTicks ?? DEFAULT_MAX_HOLD_TICKS));
    const timed = holdTicks >= maxHold && !partial;
    if (timed && !hitSl && !hitTp) {
      if (p.unrealized <= 0) {
        closePosition(e, p, q.px, "time");
        continue;
      }
      if (p.side === "long") p.sl = Math.max(p.sl, p.avgEntry);
      else p.sl = Math.min(p.sl, p.avgEntry);
      p.slDist = Math.abs(p.sl - p.avgEntry);
    }
    if (hitSl || (hitTp && !partial)) {
      let reason: "sl" | "tp";
      if (hitSl && hitTp) reason = (p.side === "long" ? q.px >= p.avgEntry : q.px <= p.avgEntry) ? "tp" : "sl";
      else reason = hitSl ? "sl" : "tp";
      closePosition(e, p, reason === "sl" ? p.sl : p.tp, reason);
      continue;
    }
    keep.push(p);
  }
  e.positions = keep;
}
function compactOrders(e: VstEngine) {
  const foreign = e.orders.filter((o) => !isDeskConn(o.connId));
  e.orders = e.orders.filter((o) => ownedByDesk(o) && (o.status === "open" || o.status === "partial"));
  if (e.orders.length > VST_MAX_WORKING_ORDERS) {
    const extra = e.orders.splice(VST_MAX_WORKING_ORDERS);
    for (const o of extra) markTerminal(e, o, "cancelled");
  }
  const deskQueue = e.queue.filter((o) => ownedByDesk(o));
  const foreignQ = e.queue.filter((o) => !isDeskConn(o.connId));
  if (deskQueue.length > VST_MAX_QUEUE) {
    const drop = deskQueue.splice(VST_MAX_QUEUE);
    for (const o of drop) markTerminal(e, o, "cancelled");
  }
  e.queue = [...deskQueue, ...foreignQ];
  e.orders = [...e.orders, ...foreign];
  if (e.batches.length > VST_MAX_BATCHES) e.batches.length = VST_MAX_BATCHES;
  if (e.fills.length > 40) e.fills.length = 40;
  if (e.closed.length > 600) e.closed.length = 600;
  for (const id of Object.keys(e.cooldown)) {
    if ((e.cooldown[id] ?? 0) <= e.tick) delete e.cooldown[id];
  }
}
function recomputeStats(e: VstEngine) {
  const unreal = e.positions.reduce((s, p) => s + p.unrealized, 0);
  const net = e.ledger.profit - e.ledger.loss + unreal;
  const equity = 1e4 + net;
  if (equity > e.ledger.peak) e.ledger.peak = equity;
  const dd = e.ledger.peak > 0 ? Math.max(0, (e.ledger.peak - equity) / e.ledger.peak) : 0;
  if (dd > e.ledger.maxMdd) e.ledger.maxMdd = dd;
  if (dd > 1e-6) {
    e.ledger.ddTicks = (e.ledger.ddTicks || 0) + 1;
    if (e.ledger.ddTicks > (e.ledger.maxDdt || 0)) e.ledger.maxDdt = e.ledger.ddTicks;
  } else {
    e.ledger.ddTicks = 0;
  }
  const pf = e.ledger.loss < 1e-9 ? e.ledger.profit > 0 ? 99 : 0 : e.ledger.profit / e.ledger.loss;
  const working = e.orders.length;
  e.ledger.maxPositions = Math.max(e.ledger.maxPositions, e.positions.length);
  e.ledger.maxOrders = Math.max(e.ledger.maxOrders, working + e.queue.length);
  let partials = 0;
  for (const p of e.positions) if (p.status === "partial") partials += 1;
  e.stats = {
    pf,
    wr: e.ledger.trades ? e.ledger.wins / e.ledger.trades : 0,
    net,
    mdd: e.ledger.maxMdd,
    trades: e.ledger.trades,
    wins: e.ledger.wins,
    openOrders: working,
    queued: e.queue.length,
    positions: e.positions.length,
    partials,
    equity,
    ddt: e.ledger.maxDdt,
  };
}
function finiteOr(n: number | undefined, fallback: number) {
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

function noteHeal(e: VstEngine, reason: string) {
  e.healCount = (e.healCount ?? 0) + 1;
  e.lastHeal = reason;
  e.lastMsg = `Heal · ${reason}`;
}

function safeStage(e: VstEngine, name: string, fn: () => void) {
  try {
    fn();
  } catch {
    noteHeal(e, `${name} recovered`);
  }
}

function clampRatio(p: LivePosition, ratio = TP_SL_RATIO) {
  const r = snapTpRatio(ratio);
  const slD = Math.abs(p.sl - p.avgEntry);
  const tpD = Math.abs(p.tp - p.avgEntry);
  if (!(tpD > 0) || !Number.isFinite(slD) || !Number.isFinite(tpD)) return;
  if (slD > tpD / r + 1e-9) {
    const next = tpD / r;
    p.slDist = next;
    p.tpDist = tpD;
    p.sl = p.side === "long" ? p.avgEntry - next : p.avgEntry + next;
  }
}

export function sanitizeBook(e: VstEngine): number {
  let fixes = 0;
  if (!e.queue) e.queue = [];
  if (!e.orders) e.orders = [];
  if (!e.positions) e.positions = [];
  if (!e.fills) e.fills = [];
  if (!e.closed) e.closed = [];
  if (!e.batches) e.batches = [];
  if (!e.cooldown) e.cooldown = {};
  if (!e.tokens) e.tokens = {};
  if (!e.quotes) e.quotes = {};
  if (!e.symbolStats) e.symbolStats = {};
  if (!Number.isFinite(e.tick)) {
    e.tick = 0;
    fixes += 1;
  }
  if (!Number.isFinite(e.seq) || e.seq < 1) {
    e.seq = 1;
    fixes += 1;
  }
  if (!isDeskConn(e.activeConnId)) {
    e.activeConnId = VST_DEFAULT_CONN;
    fixes += 1;
  }
  for (const id of VST_CONN_IDS) {
    const t = e.tokens[id];
    if (!Number.isFinite(t) || t < 0) {
      e.tokens[id] = VST_RATE_BURST;
      fixes += 1;
    } else if (t > VST_RATE_BURST) {
      e.tokens[id] = VST_RATE_BURST;
      fixes += 1;
    }
  }
  for (const q of Object.values(e.quotes)) {
    if (!Number.isFinite(q.px) || q.px <= 0) {
      q.px = Math.max(finiteOr(q.axis, 1), 1);
      fixes += 1;
    }
    if (!Number.isFinite(q.hi) || q.hi < q.px) {
      q.hi = q.px * 1.001;
      fixes += 1;
    }
    if (!Number.isFinite(q.lo) || q.lo <= 0 || q.lo > q.px) {
      q.lo = q.px * 0.999;
      fixes += 1;
    }
    if (!Number.isFinite(q.atr) || q.atr <= 0) {
      q.atr = q.px * 0.004;
      fixes += 1;
    }
    if (!Number.isFinite(q.axis) || q.axis <= 0) q.axis = q.px;
    if (!Number.isFinite(q.vol) || q.vol < 0 || q.vol > 0.2) q.vol = MIN_QUOTE_VOL;
    if (!Number.isFinite(q.chg)) q.chg = 0;
  }
  const livePos = [];
  for (const p of e.positions) {
    if (!p || !Number.isFinite(p.qty) || p.qty <= 0 || !Number.isFinite(p.avgEntry) || p.avgEntry <= 0) {
      fixes += 1;
      continue;
    }
    p.mark = finiteOr(p.mark, p.avgEntry);
    p.unrealized = finiteOr(p.unrealized, 0);
    p.realized = finiteOr(p.realized, 0);
    p.sl = finiteOr(p.sl, p.side === "long" ? p.avgEntry * 0.99 : p.avgEntry * 1.01);
    p.tp = finiteOr(p.tp, p.side === "long" ? p.avgEntry * 1.025 : p.avgEntry * 0.975);
    p.slDist = finiteOr(p.slDist, Math.abs(p.avgEntry - p.sl));
    p.tpDist = finiteOr(p.tpDist, Math.abs(p.tp - p.avgEntry));
    if (!Array.isArray(p.legs)) p.legs = [];
    clampRatio(p, e.tpRatio || TP_SL_RATIO);
    livePos.push(p);
  }
  if (livePos.length !== e.positions.length) fixes += 1;
  e.positions = livePos;
  const liveOrd = [];
  for (const o of e.orders) {
    if (!o || !Number.isFinite(o.qty) || o.qty <= 0 || !Number.isFinite(o.price) || o.price <= 0) {
      fixes += 1;
      continue;
    }
    o.remaining = Math.max(0, finiteOr(o.remaining, o.qty));
    o.filled = finiteOr(o.filled, 0);
    liveOrd.push(o);
  }
  if (liveOrd.length !== e.orders.length) fixes += 1;
  e.orders = liveOrd;
  e.queue = e.queue.filter((o) => {
    if (!o || !Number.isFinite(o.qty) || o.qty <= 0 || !Number.isFinite(o.price) || o.price <= 0) {
      fixes += 1;
      return false;
    }
    return true;
  });
  if (e.queue.length > VST_MAX_QUEUE) {
    e.queue.length = VST_MAX_QUEUE;
    fixes += 1;
  }
  if (e.orders.length > VST_MAX_WORKING_ORDERS) {
    e.orders.length = VST_MAX_WORKING_ORDERS;
    fixes += 1;
  }
  if (e.positions.length > VST_MAX_POSITIONS) {
    e.positions.length = VST_MAX_POSITIONS;
    fixes += 1;
  }
  for (const id of Object.keys(e.cooldown)) {
    const t = e.cooldown[id] ?? 0;
    if (!Number.isFinite(t) || t > e.tick + 400) {
      delete e.cooldown[id];
      fixes += 1;
    }
  }
  if (e.ledger) {
    const led = e.ledger as unknown as Record<string, number>;
    for (const k of Object.keys(led)) {
      if (typeof led[k] === "number" && !Number.isFinite(led[k])) {
        led[k] = 0;
        fixes += 1;
      }
    }
  }
  return fixes;
}

export function healEngine(
  e: VstEngine,
  cfg: TacticConfig = DEFAULT_CFG,
  tactic: TacticKind = "hybrid",
  rangeType?: RangeType,
): { healed: boolean; reason: string; fixes: number } {
  const fixes = sanitizeBook(e);
  let reason = fixes ? `sanitized ${fixes}` : "";
  const deskQ = e.queue.filter((o) => ownedByDesk(o, e.activeConnId)).length;
  const deskO = e.orders.filter((o) => ownedByDesk(o, e.activeConnId) && (o.status === "open" || o.status === "partial")).length;
  const deskP = e.positions.filter((p) => ownedByDesk(p, e.activeConnId)).length;
  if (e.running && e.phase === "running" && deskQ + deskO + deskP === 0) {
    armUniverse(e, cfg, tactic, rangeType);
    reason = reason ? `${reason} · empty book rearmed` : "empty book rearmed";
  }
  const starved = (e.tokens[e.activeConnId] ?? 0) <= 0 && deskQ > 0;
  if (starved) {
    e.tokens[e.activeConnId] = Math.max(4, VST_RATE_BURST / 2);
    reason = reason ? `${reason} · rate refill` : "rate refill";
  }
  if (e.running && e.phase !== "running" && e.phase !== "paused" && e.phase !== "stopped") {
    e.phase = "running";
    reason = reason ? `${reason} · phase restored` : "phase restored";
  }
  if (reason) noteHeal(e, reason);
  return { healed: Boolean(reason), reason, fixes };
}

function blockLaneKey(symbol: string, side: Side) {
  return `${symbol}:${side}`;
}

function liveBlockCounts(block: BlockConfig) {
  const cap = Math.max(1, Math.min(16, Math.round(block.maxMultiple || 6)));
  const raw = Array.isArray(block.counts) && block.counts.length ? block.counts : [1, 2];
  return [...new Set(raw.map((n) => Math.round(n)).filter((n) => n >= 1 && n <= cap))].sort((a, b) => a - b);
}

function evalBlockNs(block?: BlockConfig) {
  if (block && block.windows === false) return [];
  const cap = Math.min(16, Math.max(1, Math.round(block?.evalPosCount || 16)));
  return Array.from({ length: cap }, (_, i) => i + 1);
}

function emptyBlockWindow(n: number): BlockPosWindow {
  return {
    n,
    ring: [],
    closed: 0,
    pauseLeft: 0,
    lastAvg: 0,
    lastNet: 0,
    lastPf: 0,
    windows: 0,
    lossWindows: 0,
    adjusted: 0,
    losers: [],
  };
}

function tickBlockWindow(w: BlockPosWindow, symbol: string, side: Side, pnl: number) {
  w.ring.push({ symbol, side, pnl });
  if (w.ring.length > w.n * 2) w.ring = w.ring.slice(-w.n * 2);
  w.closed += 1;
  if (w.pauseLeft > 0) {
    w.pauseLeft -= 1;
    w.adjusted += 1;
  }
  if (w.closed % w.n !== 0) return w;
  const last = w.ring.slice(-w.n);
  const net = last.reduce((s, x) => s + x.pnl, 0);
  const gp = last.filter((x) => x.pnl > 0).reduce((s, x) => s + x.pnl, 0);
  const gl = Math.abs(last.filter((x) => x.pnl < 0).reduce((s, x) => s + x.pnl, 0));
  w.lastNet = net;
  w.lastAvg = net / w.n;
  w.lastPf = gl < 1e-9 ? (gp > 0 ? 4 : 0) : gp / gl;
  w.windows += 1;
  w.losers = [...new Set(last.filter((x) => x.pnl < 0).map((x) => x.symbol))];
  if (w.lastAvg < 0 || w.lastPf < 1) {
    w.lossWindows += 1;
    w.pauseLeft = w.n;
  }
  return w;
}

export function noteBlockPosClose(e: VstEngine, symbol: string, side: Side, pnl: number, block: BlockConfig = DEFAULT_BLOCK_CONFIG) {
  e.blockWindows = e.blockWindows ?? {};
  e.blockWindowsBySymbol = e.blockWindowsBySymbol ?? {};
  for (const n of evalBlockNs(block)) {
    e.blockWindows[n] = tickBlockWindow(e.blockWindows[n] ?? emptyBlockWindow(n), symbol, side, pnl);
    const by = (e.blockWindowsBySymbol[symbol] ??= {});
    by[n] = tickBlockWindow(by[n] ?? emptyBlockWindow(n), symbol, side, pnl);
  }
}

/** Last-N overall window is in its "next N adjusted" pause. */
export function blockPosPaused(e: VstEngine, n = 16) {
  return (e.blockWindows?.[n]?.pauseLeft || 0) > 0;
}

/** This symbol's last-N average was a loss; next N of that symbol are adjusted. */
export function symbolBlockPaused(e: VstEngine, symbol: string, n = 16) {
  return (e.blockWindowsBySymbol?.[symbol]?.[n]?.pauseLeft || 0) > 0;
}

export function symbolTapePf(e: VstEngine, symbol: string) {
  const t = e.symbolStats?.[symbol];
  if (!t || t.trades < 2) return 99;
  const gl = Math.max(0, t.loss);
  const gp = Math.max(0, t.profit);
  return gl < 1e-9 ? (gp > 0 ? 4 : 0) : gp / gl;
}

/** Skip new entries on losing last-N windows, PF<1 symbols, or direction indication. */
export function skipLiveSymbol(e: VstEngine, symbol: string, evalN = 16) {
  if (symbolBlockPaused(e, symbol, evalN)) return true;
  if (symbolTapePf(e, symbol) + 1e-9 < 1) return true;
  if (classifyIndication(e, symbol) === "direction") return true;
  return false;
}

export function blockWindowSnapshot(e: VstEngine, n = 16) {
  const overall = e.blockWindows?.[n] ?? emptyBlockWindow(n);
  const symbols = Object.entries(e.blockWindowsBySymbol ?? {}).map(([symbol, map]) => {
    const w = map[n] ?? emptyBlockWindow(n);
    return {
      symbol,
      closed: w.closed,
      windows: w.windows,
      lossWindows: w.lossWindows,
      lastAvg: w.lastAvg,
      lastNet: w.lastNet,
      lastPf: w.lastPf,
      pauseLeft: w.pauseLeft,
      adjusted: w.adjusted,
      losers: w.losers,
    };
  }).sort((a, b) => a.lastAvg - b.lastAvg);
  return { n, overall, symbols };
}

function emptyBlockLane(symbol: string, side: Side, baseQty: number, baseEntry: number): BlockLaneState {
  return {
    symbol,
    side,
    baseQty: Math.max(0, baseQty),
    baseEntry: Math.max(0, baseEntry),
    confirmedAdd: 0,
    satisfied: {},
    pfRing: {},
    parentPf: [],
    active: true,
    pauseRemaining: {},
    heldFactor: {},
  };
}

function isBlockOrder(o: LiveOrder) {
  return /^Block/i.test(o.note || "");
}

function collectBlockOrders(e: VstEngine, conn: string) {
  return [
    ...e.queue.filter((o) => o.connId === conn && isBlockOrder(o)),
    ...e.orders.filter((o) => o.connId === conn && isBlockOrder(o) && (o.status === "open" || o.status === "partial" || o.status === "queued")),
  ];
}

function syncBlockParents(e: VstEngine, conn: string) {
  e.blockLanes = e.blockLanes ?? {};
  const live = new Set<string>();
  for (const p of e.positions) {
    if (p.connId !== conn || p.qty <= 0) continue;
    const k = blockLaneKey(p.symbol, p.side);
    live.add(k);
    const first = p.legs[0]?.qty || p.qty;
    let lane = e.blockLanes[k];
    if (!lane) {
      e.blockLanes[k] = emptyBlockLane(p.symbol, p.side, first, p.avgEntry);
      continue;
    }
    if (!lane.active || lane.baseQty <= 0) {
      lane.active = true;
      lane.baseQty = first;
      lane.baseEntry = p.avgEntry;
      lane.confirmedAdd = Math.max(0, p.qty - first);
      lane.satisfied = {};
      lane.pending = undefined;
      lane.pauseRemaining = {};
      continue;
    }
    const grown = p.qty - (lane.baseQty + lane.confirmedAdd);
    if (grown > lane.baseQty * 0.15 && !lane.pending) {
      const prev = lane.baseQty;
      lane.baseQty = prev + grown;
      if (p.avgEntry > 0 && prev > 0) {
        lane.baseEntry = (lane.baseEntry * prev + p.avgEntry * grown) / Math.max(lane.baseQty, 1e-9);
      }
    }
  }
  for (const k of Object.keys(e.blockLanes)) {
    if (!live.has(k)) e.blockLanes[k].active = false;
  }
}

function recordBlockFill(e: VstEngine, o: LiveOrder, take: number) {
  if (!isBlockOrder(o)) return;
  e.blockLanes = e.blockLanes ?? {};
  const k = blockLaneKey(o.symbol, o.side);
  const lane = e.blockLanes[k];
  if (!lane) return;
  lane.confirmedAdd += take;
  const n = Math.max(1, o.level || lane.pending || 1);
  const counts = liveBlockCounts({ ...DEFAULT_BLOCK_CONFIG, maxMultiple: Math.max(n, 1) });
  const vr = sharedBlockVolumeRatio(DEFAULT_BLOCK_CONFIG.volumeRatio, counts.length, Math.max(0, DEFAULT_BLOCK_CONFIG.maxVolumeMultiplier - 1));
  const target = lane.baseQty * blockMaxAdditionalRatio(n, vr, DEFAULT_BLOCK_CONFIG.maxVolumeMultiplier);
  if (lane.confirmedAdd + 1e-12 >= target) lane.satisfied[n] = true;
  lane.pending = undefined;
  e.lastBlockAt = e.tick;
}

function recordBlockClose(e: VstEngine, p: LivePosition, pnl: number) {
  const k = blockLaneKey(p.symbol, p.side);
  const lane = e.blockLanes?.[k];
  const cost = Math.max(p.avgEntry * p.qty, 1e-9);
  const frac = pnl / cost;
  if (!lane) return;
  const n = Math.max(1, p.blockLevel || lane.pending || 1);
  (lane.pfRing[n] ??= []).push(frac);
  if (lane.pfRing[n].length > 75) lane.pfRing[n] = lane.pfRing[n].slice(-75);
  lane.parentPf.push(frac);
  if (lane.parentPf.length > 75) lane.parentPf = lane.parentPf.slice(-75);
  const need = Math.max(5, Math.min(75, 12));
  const ring = (lane.pfRing[n] ?? []).slice(-need);
  if (ring.length >= need) {
    const gp = ring.filter((x) => x > 0).reduce((s, x) => s + x, 0);
    const gl = Math.abs(ring.filter((x) => x < 0).reduce((s, x) => s + x, 0));
    const pf = gl === 0 ? (gp > 0 ? 4 : 0) : gp / gl;
    if (pf < 1.05) lane.pauseRemaining[n] = Math.max(lane.pauseRemaining[n] || 0, n);
  }
  lane.active = false;
  lane.baseQty = 0;
  lane.confirmedAdd = 0;
  lane.pending = undefined;
  lane.satisfied = {};
}

function blockPfOk(lane: BlockLaneState, count: number, block: BlockConfig, minPf: number) {
  if ((lane.pauseRemaining[count] || 0) > 0) {
    lane.pauseRemaining[count] -= 1;
    return false;
  }
  const need = Math.max(5, Math.min(24, 8));
  const ring = (lane.pfRing[count] ?? []).slice(-need);
  if (ring.length < need) return true;
  const gp = ring.filter((x) => x > 0).reduce((s, x) => s + x, 0);
  const gl = Math.abs(ring.filter((x) => x < 0).reduce((s, x) => s + x, 0));
  const pf = gl === 0 ? (gp > 0 ? 4 : 0) : gp / gl;
  const vr = sharedBlockVolumeRatio(block.volumeRatio || 1.25, liveBlockCounts(block).length, Math.max(0, (block.maxVolumeMultiplier || 2.25) - 1));
  const inc = blockMaxAdditionalRatio(count, vr, block.maxVolumeMultiplier);
  const floor = Math.max(minPf, blockMinimumProfitFactor(minPf, block.pfRatio || 1.25, inc) || minPf);
  if (pf + 1e-9 < floor) {
    lane.pauseRemaining[count] = Math.max(0, Math.round((block.pauseCountRatio ?? 2) * count));
    if (lane.pauseRemaining[count] < 1) {
      lane.heldFactor[count] = 1;
      return true;
    }
    lane.heldFactor[count] = count;
    return false;
  }
  lane.heldFactor[count] = 1;
  return true;
}

export function collectActiveOrderBlocks(e: VstEngine, connId?: string) {
  const conn = connId && isDeskConn(connId) ? connId : e.activeConnId;
  const live = collectBlockOrders(e, conn);
  const map = new Map<string, LiveOrder[]>();
  for (const o of live) {
    const k = `${o.symbol}:${o.side}`;
    const arr = map.get(k);
    if (arr) arr.push(o);
    else map.set(k, [o]);
  }
  return [...map.entries()].map(([k, orders]) => {
    const [symbol, side] = k.split(":") as [string, Side];
    return { id: k, symbol, side, orders, multiple: orders.length };
  });
}

export function adjustActiveBlocks(
  e: VstEngine,
  cfg: TacticConfig,
  tactic: TacticKind,
  block: BlockConfig = DEFAULT_BLOCK_CONFIG,
  rangeType?: RangeType,
  opts?: { endStage?: boolean },
): BlockAdjustResult {
  const empty: BlockAdjustResult = { cancelled: 0, added: 0, flattened: 0, blocks: 0 };
  if (!block.enabled) return empty;
  if (block.endStageOnly && !opts?.endStage) return empty;
  const conn = isDeskConn(e.activeConnId) ? e.activeConnId : VST_DEFAULT_CONN;
  let cancelled = 0;
  let added = 0;
  let flattened = 0;
  const maxM = Math.max(1, Math.round(block.maxMultiple));
  const minM = Math.max(1, Math.round(block.minMultiple));
  let blocks = collectActiveOrderBlocks(e, conn);
  const queued = new Set(e.queue);

  const dropOrder = (o: LiveOrder) => {
    if (!isBlockOrder(o)) return;
    if (queued.has(o)) {
      queued.delete(o);
      e.queue = e.queue.filter((x) => x !== o);
      markTerminal(e, o, "cancelled");
      cancelled += 1;
      return;
    }
    if (o.status === "open" || o.status === "partial" || o.status === "queued") {
      markTerminal(e, o, "cancelled");
      cancelled += 1;
    }
  };

  if (block.flattenConflict) {
    const bySym = new Map<string, { long?: (typeof blocks)[0]; short?: (typeof blocks)[0] }>();
    for (const b of blocks) {
      const row = bySym.get(b.symbol) ?? {};
      if (b.side === "long") row.long = b;
      else row.short = b;
      bySym.set(b.symbol, row);
    }
    for (const [sym, sides] of bySym) {
      if (!sides.long || !sides.short) continue;
      let longU = 0;
      let shortU = 0;
      for (const p of e.positions) {
        if (p.connId !== conn || p.symbol !== sym) continue;
        if (p.side === "long") longU += p.unrealized;
        else shortU += p.unrealized;
      }
      const victim = longU <= shortU ? sides.long : sides.short;
      for (const o of victim.orders) dropOrder(o);
      flattened += 1;
    }
    if (flattened) blocks = collectActiveOrderBlocks(e, conn);
  }

  for (const b of blocks) {
    if (b.multiple <= maxM) continue;
    for (const o of b.orders.slice(maxM)) dropOrder(o);
  }

  syncBlockParents(e, conn);
  const counts = liveBlockCounts(block);
  const vr = sharedBlockVolumeRatio(block.volumeRatio || 1.25, counts.length, Math.max(0, (block.maxVolumeMultiplier || 2.25) - 1));
  const minPf = 1.85;
  const evalN = Math.min(16, Math.max(1, Math.round(block.evalPosCount || 16)));
  const overallPause = block.windows !== false && blockPosPaused(e, evalN);

  if (block.stack !== false && block.addOnWin && e.queue.filter((o) => o.connId === conn).length < VST_MAX_QUEUE - 2) {
    const byKey = new Map<string, number>();
    for (const b of collectActiveOrderBlocks(e, conn)) byKey.set(`${b.symbol}:${b.side}`, b.multiple);
    let adds = 0;
    for (const p of e.positions) {
      if (adds >= 2) break;
      if (!ownedByDesk(p, conn)) continue;
      if (p.qty <= 0) continue;
      const move = p.unrealized / Math.max(p.avgEntry * p.qty, 1e-9);
      if (block.addOnWin && move <= 0) continue;
      if (block.activeLive !== false && move < 0.004) continue;
      if (overallPause) continue;
      if (symbolBlockPaused(e, p.symbol, evalN)) continue;
      const k = blockLaneKey(p.symbol, p.side);
      const lane = e.blockLanes[k];
      if (!lane || !lane.active || lane.baseQty <= 0) continue;
      if (lane.pending) continue;
      const n = byKey.get(k) ?? 0;
      if (n >= maxM) continue;
      const next = counts.find(
        (c) =>
          c >= minM &&
          c > (block.minActiveLevel || 0) &&
          !lane.satisfied[c] &&
          lane.confirmedAdd + 1e-12 < lane.baseQty * blockMaxAdditionalRatio(c, vr, block.maxVolumeMultiplier || 2.25),
      );
      if (!next) continue;
      if (!blockPfOk(lane, next, block, minPf)) continue;
      if (next >= 3) {
        const recent = e.closed.slice(0, 40);
        if (recent.length >= 12) {
          const profit = recent.filter((c) => c.pnl > 0).reduce((s, c) => s + c.pnl, 0);
          const loss = Math.abs(recent.filter((c) => c.pnl < 0).reduce((s, c) => s + c.pnl, 0));
          const pf = loss === 0 ? (profit > 0 ? 3 : 0) : profit / loss;
          if (pf < 1.85) continue;
        }
      }
      if (next >= 4) {
        const deep = e.closed.filter((c) => c.playbook === "block" && (c.level ?? 1) >= 4).slice(0, 24);
        if (deep.length >= 6) {
          const profit = deep.filter((c) => c.pnl > 0).reduce((s, c) => s + c.pnl, 0);
          const loss = Math.abs(deep.filter((c) => c.pnl < 0).reduce((s, c) => s + c.pnl, 0));
          const pf = loss === 0 ? (profit > 0 ? 3 : 0) : profit / loss;
          if (pf < 1.85) continue;
        }
      }
      const q = e.quotes[p.symbol];
      if (!q || finiteOr(q.vol, 0) < MIN_QUOTE_VOL) continue;
      if ((e.cooldown[cooldownKey(conn, p.symbol)] ?? 0) > e.tick) continue;
      const qty = blockStepQty(lane.baseQty, next, block.volumeRatio || 1.25, block.maxVolumeMultiplier || 2.25, counts.length);
      if (!(qty > 0)) continue;
      const hi = pickRange(q, cfg, rangeType);
      const sl0 = slDist(q.atr, hi.spacing, cfg.slAtr ?? SL_ATR_MULT);
      const tp0 = tpDistFromSl(sl0, cfg.tpRatio);
      const px = p.side === "long" ? Math.min(q.px, q.axis) : Math.max(q.px, q.axis);
      if (px <= 0) continue;
      const lv = protectLevels(px, p.side, sl0, tp0, cfg.tpRatio);
      e.queue.push({
        id: nextId(e, "b"),
        connId: conn,
        symbol: p.symbol,
        side: p.side,
        type: e.orderType,
        qty,
        filled: 0,
        price: px,
        remaining: qty,
        status: "queued",
        rangeType: hi.rangeType,
        level: next,
        sl: lv.sl,
        tp: lv.tp,
        slDist: lv.slDist,
        tpDist: lv.tpDist,
        batchId: "",
        note: `Block #${next} ${p.symbol} ${p.side} · ${conn}`,
      });
      countPlaced(e);
      lane.pending = next;
      byKey.set(k, n + 1);
      added += 1;
      adds += 1;
      e.lastBlockAt = e.tick;
    }
  }

  const blockN = collectActiveOrderBlocks(e, conn).length;
  if (cancelled || added || flattened) {
    e.lastMsg = `Block adjust · ${blockN} blocks · −${cancelled} +${added} flatten ${flattened} · ${tactic}`;
    e.lastBlockAt = e.tick;
  }
  return { cancelled, added, flattened, blocks: blockN };
}

export function tickVst(e: VstEngine, cfg: TacticConfig, tactic: TacticKind, opts?: { freezeIds?: Set<string>; skipWalk?: boolean; rangeType?: RangeType; symbolCount?: number; orderType?: OrderTypeId; block?: BlockConfig; endStage?: boolean }) {
  ensureEngine(e);
  const t0 = Date.now();
  const over = () => Date.now() - t0 > 90;
  if (opts?.symbolCount != null) e.symbolCount = clampSymbolCount(opts.symbolCount);
  if (opts?.orderType) e.orderType = opts.orderType;
  e.tpRatio = snapTpRatio(cfg.tpRatio);
  e.lastTactic = tactic;
  e.lastRange = opts?.rangeType ?? e.lastRange ?? "atr";
  e.tick += 1;
  if (e.tick % 24 === 1) sanitizeBook(e);
  safeStage(e, "refill", () => refill(e));
  safeStage(e, "walk", () => {
    if (opts?.skipWalk) return;
    if (opts?.freezeIds) walkQuotes(e, opts.freezeIds);
    else walkQuotes(e);
  });
  safeStage(e, "batch", () => processBatches(e));
  safeStage(e, "match", () => matchOrders(e));
  safeStage(e, "positions", () => managePositions(e, tactic, cfg, { minHold: opts?.skipWalk ? 80 : 1, liveTape: Boolean(opts?.skipWalk) }));
  if (e.tick % 8 === 0 && !over()) safeStage(e, "coord", () => applySessionCoord(e));
  const block = opts?.block ?? DEFAULT_BLOCK_CONFIG;
  const cadence = Math.max(4, Math.round(block.cadence || 8));
  const endTick = 16 * TICKS_PER_HOUR;
  const blockDue =
    Boolean(opts?.endStage) ||
    (block.enabled &&
      (block.endStageOnly ? e.tick >= endTick && e.tick % cadence === 0 : e.tick % cadence === 0));
  if (blockDue && !over()) {
    safeStage(e, "block", () => {
      adjustActiveBlocks(e, cfg, tactic, block, opts?.rangeType, { endStage: opts?.endStage || e.tick >= endTick });
    });
  }
  if ((e.tick % 4 === 0 || (opts?.skipWalk && e.orders.length > 96)) && !over()) {
    safeStage(e, "compact", () => {
      compactOrders(e);
      if (opts?.skipWalk && e.orders.length > 96) {
        const extra = e.orders.splice(96);
        for (const o of extra) markTerminal(e, o, "cancelled");
      }
    });
  }
  if (
    e.tick % 24 === 0 &&
    !over() &&
    e.queue.filter((o) => o.connId === e.activeConnId).length < 30 &&
    e.orders.filter((o) => o.connId === e.activeConnId && (o.status === "open" || o.status === "partial")).length < VST_MAX_WORKING_ORDERS &&
    e.positions.filter((p) => p.connId === e.activeConnId).length < VST_MAX_POSITIONS
  ) {
    safeStage(e, "arm", () => armUniverse(e, cfg, tactic, opts?.rangeType));
  }
  if (e.tick % 40 === 0 && !over()) healEngine(e, cfg, tactic, opts?.rangeType);
  if (!opts?.skipWalk || e.tick % 2 === 0) safeStage(e, "stats", () => recomputeStats(e));
  return e;
}
export function resetBook(e: VstEngine, cfg: TacticConfig, tactic: TacticKind, rangeType?: RangeType, connId?: string) {
  const scope = connId && isDeskConn(connId) ? connId : undefined;
  if (scope) {
    cancelQueued(e, (o) => ownedByDesk(o, scope));
    e.orders = e.orders.filter((o) => {
      if (!ownedByDesk(o, scope)) return true;
      if (o.status === "open" || o.status === "partial" || o.status === "queued") markTerminal(e, o, "cancelled");
      return false;
    });
    e.positions = e.positions.filter((p) => !ownedByDesk(p, scope));
    e.fills = e.fills.filter((f) => f.connId !== scope);
    const prev = e.activeConnId;
    e.activeConnId = scope;
    armUniverse(e, cfg, tactic, rangeType);
    e.activeConnId = prev;
    e.lastMsg = `Session ${scope} rearmed · other connections held`;
    return;
  }
  e.queue = e.queue.filter((o) => !isDeskConn(o.connId));
  e.orders = e.orders.filter((o) => !isDeskConn(o.connId));
  e.positions = e.positions.filter((p) => !isDeskConn(p.connId));
  e.fills = e.fills.filter((f) => !isDeskConn(f.connId));
  e.closed = [];
  e.batches = [];
  e.cooldown = {};
  e.ledger = emptyLedger();
  e.stats = emptyStats();
  e.symbolStats = {};
  armUniverse(e, cfg, tactic, rangeType);
  e.lastMsg = "Desk book rearmed · foreign exchange orders untouched";
}

/** Drop paper legs that vanished on the live book (manual close / SL fill) so we keep arming. */
export function releaseVanished(e: VstEngine, occupied: Set<string>, connId?: string) {
  const conn = connId && isDeskConn(connId) ? connId : e.activeConnId;
  const keep = [];
  let n = 0;
  for (const p of e.positions) {
    if (!ownedByDesk(p, conn) || occupied.has(`${p.symbol}:${p.side}`)) {
      keep.push(p);
      continue;
    }
    cancelLane(e, p);
    e.cooldown[cooldownKey(p.connId, p.symbol)] = e.tick;
    n += 1;
  }
  if (n) {
    e.positions = keep;
    e.lastMsg = `Released ${n} vanished legs · keep processing`;
  }
  return n;
}

export function haltEngine(e: VstEngine, connId?: string) {
  e.running = false;
  e.phase = "stopped";
  const scope = connId && isDeskConn(connId) ? connId : undefined;
  for (const o of e.orders) {
    if (!ownedByDesk(o, scope)) continue;
    if (o.status === "open" || o.status === "partial" || o.status === "queued") markTerminal(e, o, "cancelled");
  }
  cancelQueued(e, (o) => ownedByDesk(o, scope));
  e.lastMsg = scope
    ? `Stopped ${scope} · pending cancelled, other sessions held`
    : "Stopped · desk pending cancelled, open positions frozen";
}
export function requeueFree(e: VstEngine, cfg: TacticConfig, tactic: TacticKind, rangeType?: RangeType, connId?: string) {
  const scope = connId && isDeskConn(connId) ? connId : e.activeConnId;
  const held = new Set(e.positions.filter((p) => ownedByDesk(p, scope)).map((p: LivePosition) => p.symbol));
  cancelQueued(e, (o) => ownedByDesk(o, scope) && !held.has(o.symbol));
  for (const o of e.orders) {
    if (!ownedByDesk(o, scope)) continue;
    if (held.has(o.symbol)) continue;
    if (o.status === "open" || o.status === "partial" || o.status === "queued") markTerminal(e, o, "cancelled");
  }
  const prev = e.activeConnId;
  if (isDeskConn(scope)) e.activeConnId = scope;
  armUniverse(e, cfg, tactic, rangeType);
  e.activeConnId = prev;
  e.lastMsg = `Ladders rebuilt on ${scope} · ${tactic} · ${rangeType ?? "auto"}`;
}

export function mirrorEffectiveLanes(
  e: VstEngine,
  symbols: string[],
  cfg: TacticConfig,
  tactic: TacticKind,
  rangeType?: RangeType,
) {
  const allow = new Set(symbols);
  requeueFree(e, cfg, tactic, rangeType);
  if (!allow.size) return;
  cancelQueued(e, (o) => ownedByDesk(o, e.activeConnId) && !allow.has(o.symbol));
  for (const o of e.orders) {
    if (!ownedByDesk(o, e.activeConnId)) continue;
    if (allow.has(o.symbol)) continue;
    if (o.status === "open" || o.status === "partial" || o.status === "queued") markTerminal(e, o, "cancelled");
  }
  e.lastMsg = `Stage-eval mirrored · ${allow.size} effective symbols · ${tactic} · ${rangeType ?? "auto"}`;
}
export function resetSession(e: VstEngine, cfg: TacticConfig, tactic: TacticKind, rangeType?: RangeType) {
  resetBook(e, cfg, tactic, rangeType);
  e.tick = 0;
  e.running = false;
  e.phase = "idle";
  e.seq = 1;
  e.tokens = {
    "bingx-vst-01": VST_RATE_BURST,
    "bingx-vst-02": VST_RATE_BURST,
    "bingx-x01": VST_RATE_BURST,
  };
  e.lastMsg = "Reset · ladders rearmed, press Start";
}
export function enqueueManual(e: VstEngine, input: { connId: string; symbol: string; side: Side; type: LiveOrder['type']; cost: number; price?: number }): string {
  if (!isDeskConn(input.connId)) return "Unknown desk connection — exchange orders on other sessions are not touched.";
  const q = e.quotes[input.symbol];
  if (!q) return "Unknown symbol on VST universe.";
  if (e.positions.filter((p) => p.connId === input.connId).length >= VST_MAX_POSITIONS) return "Position cap 100 reached on this session.";
  const px = input.price ?? q.px;
  const hi = highestRange(q, DEFAULT_CFG);
  const sl0 = slDist(q.atr, hi.spacing, SL_ATR_MULT);
  const tp0 = tpDistFromSl(sl0, e.tpRatio);
  const lv = protectLevels(px, input.side, sl0, tp0, e.tpRatio);
  const qty = input.cost / px;
  e.queue.push({
    id: nextId(e, "m"),
    connId: input.connId,
    symbol: input.symbol,
    side: input.side,
    type: input.type,
    qty,
    filled: 0,
    price: px,
    remaining: qty,
    status: "queued",
    rangeType: hi.rangeType,
    level: 1,
    sl: lv.sl,
    tp: lv.tp,
    slDist: lv.slDist,
    tpDist: lv.tpDist,
    batchId: "",
    note: "Manual ticket"
  });
  countPlaced(e);
  e.lastMsg = `Queued ${input.side} ${input.symbol} on ${input.connId}`;
  return e.lastMsg;
}
export function applyUniverse(e: VstEngine, count: number, orderType?: OrderTypeId) {
  e.symbolCount = clampSymbolCount(count);
  if (orderType) e.orderType = orderType;
  const keep = new Set(universeSymbols(e.symbolCount).map((s) => s.id));
  const scope = isDeskConn(e.activeConnId) ? e.activeConnId : undefined;
  cancelQueued(e, (o) => ownedByDesk(o, scope) && !keep.has(o.symbol));
  for (const o of e.orders) {
    if (!ownedByDesk(o, scope)) continue;
    if (keep.has(o.symbol)) continue;
    if (o.status === "open" || o.status === "partial" || o.status === "queued") markTerminal(e, o, "cancelled");
  }
}
export function cancelLiveOrder(e: VstEngine, id: string) {
  const o = e.orders.find((x) => x.id === id) ?? e.queue.find((x) => x.id === id);
  if (!o || !ownedByDesk(o)) return;
  markTerminal(e, o, "cancelled");
  e.queue = e.queue.filter((x) => x.id !== id);
  e.lastMsg = `Cancelled ${id} on ${o.connId}`;
}
export function syncConnections(conns: Connection[], e: VstEngine): Connection[] {
  return conns.map((c) => {
    const open = e.orders.filter((o) => o.connId === c.id && (o.status === "open" || o.status === "partial")).length;
    const pos = e.positions.filter((p) => p.connId === c.id).length;
    const used = Math.round(VST_RATE_WINDOW - ((e.tokens[c.id] ?? 0) / VST_RATE_BURST) * VST_RATE_WINDOW);
    return {
      ...c,
      openOrderCount: open + e.queue.filter((o) => o.connId === c.id).length,
      positionCount: pos,
      rateLimitUsed: Math.max(0, Math.min(VST_RATE_WINDOW, used)),
    };
  });
}
export function auditEngine(e: VstEngine) {
  const issues = [];
  let ratioViolations = 0;
  let negativePx = 0;
  let nanCount = 0;
  for (const q of Object.values(e.quotes)) {
    if (!Number.isFinite(q.px) || !Number.isFinite(q.hi) || !Number.isFinite(q.lo)) nanCount += 1;
    if (q.px <= 0 || q.lo <= 0) negativePx += 1;
  }
  for (const p of e.positions) {
    const slD = Math.abs(p.sl - p.avgEntry);
    const tpD = Math.abs(p.tp - p.avgEntry);
    if (tpD > 0 && slD > tpD / snapTpRatio(e.tpRatio || TP_SL_RATIO) + 1e-6) ratioViolations += 1;
    if (!Number.isFinite(p.avgEntry) || !Number.isFinite(p.unrealized)) nanCount += 1;
  }
  if (e.positions.length > VST_MAX_POSITIONS) issues.push("Position cap exceeded");
  if (Object.keys(e.quotes).length > VST_MAX_SYMBOLS) issues.push("Symbol cap exceeded");
  for (const id of Object.keys(e.tokens)) if ((e.tokens[id] ?? 0) < -1e-6) issues.push(`Negative rate tokens on ${id}`);
  if (nanCount) issues.push(`${nanCount} NaN values`);
  if (negativePx) issues.push(`${negativePx} non-positive prices`);
  if (ratioViolations) issues.push(`${ratioViolations} SL/TP ratio violations`);
  const counted = bookCounts(e);
  const accounted = counted.orders.queued + counted.orders.open + counted.orders.partial + counted.orders.filled + counted.orders.cancelled + counted.orders.rejected;
  if (counted.orders.placed !== accounted) issues.push(`Order count mismatch placed ${counted.orders.placed} vs ${accounted}`);
  if (counted.positions.slots !== counted.positions.long + counted.positions.short) issues.push("Position slot long/short mismatch");
  return {
    ratioViolations,
    negativePx,
    nanCount,
    issues
  };
}

export function scoreHorizon(hours: number, trades: number, pf: number, wr: number, net: number, mdd: number, slExits: number, tpExits: number, nanCount: number): { ok: boolean; score: number } {
  const pfN = Number.isFinite(pf) ? pf : 0;
  const wrN = Number.isFinite(wr) ? wr : 0;
  const netN = Number.isFinite(net) ? net : 0;
  const mddN = Number.isFinite(mdd) ? mdd : 1;
  let score = pfN * 36 + wrN * 18 + Math.tanh(netN / 40) * 16 + Math.max(0, 12 - mddN * 60);
  if (trades >= 1) score += 4;
  if (hours >= 8 && slExits >= 1) score += 3;
  if (hours >= 8 && tpExits >= 1) score += 3;
  const ok =
    nanCount === 0 &&
    trades >= 1 &&
    mddN <= (hours >= 32 ? 0.2 : 0.28) &&
    (hours < 16
      ? pfN >= 0.45
      : netN > 0 && pfN >= 1 && slExits >= 1 && tpExits >= 1);
  if (!ok) score -= 25;
  return { ok, score };
}

export function horizonFromEngine(e: VstEngine, hours: number, _peak?: number): HorizonMark {
  const audit = auditEngine(e);
  const { ok, score } = scoreHorizon(
    hours,
    e.ledger.trades,
    e.stats.pf,
    e.stats.wr,
    e.stats.net,
    e.stats.mdd,
    e.ledger.slExits,
    e.ledger.tpExits,
    audit.nanCount + audit.ratioViolations,
  );
  return {
    hours,
    trades: e.ledger.trades,
    pf: e.stats.pf,
    wr: e.stats.wr,
    net: e.stats.net,
    mdd: e.stats.mdd,
    equity: e.stats.equity,
    slExits: e.ledger.slExits,
    tpExits: e.ledger.tpExits,
    ok,
    score,
  };
}

export function simulateHours(hours: number, cfg: TacticConfig = DEFAULT_CFG, tactic: TacticKind = 'hybrid', opts?: { symbolCount?: number; orderType?: OrderTypeId; rangeType?: RangeType; marks?: number[]; block?: BlockConfig }) {
  const ticks = Math.max(1, Math.round(hours * TICKS_PER_HOUR));
  const rangeType = opts?.rangeType ?? "atr";
  const engine = initVstEngine(cfg, {
    warmup: 0,
    symbolCount: opts?.symbolCount,
    orderType: opts?.orderType,
  });
  let peak = 1e4;
  const curve = [{
    t: 0,
    eq: 1e4,
    dd: 0
  }];
  const sampleEvery = Math.max(1, Math.round(ticks / 24));
  const hourly = [];
  const markAt = new Set((opts?.marks ?? []).map((n) => Math.round(n)).filter((n) => n > 0 && n <= hours));
  const marks: HorizonMark[] = [];
  let hourTrades = 0;
  let prevClosed = 0;
  let prevNet = 0;
  const rSlots = [
    {
      bin: "< −1R",
      lo: -Infinity,
      hi: -1,
      n: 0
    },
    {
      bin: "−1–0R",
      lo: -1,
      hi: 0,
      n: 0
    },
    {
      bin: "0–1R",
      lo: 0,
      hi: 1,
      n: 0
    },
    {
      bin: "1–2R",
      lo: 1,
      hi: 2,
      n: 0
    },
    {
      bin: "2–2.5R",
      lo: 2,
      hi: 2.5,
      n: 0
    },
    {
      bin: "2.5R+",
      lo: 2.5,
      hi: Infinity,
      n: 0
    }
  ];
  let rSum = 0;
  let rN = 0;
  let seenClosed = 0;
  for (let i = 0; i < ticks; i++) {
    tickVst(engine, cfg, tactic, {
      rangeType,
      symbolCount: opts?.symbolCount,
      orderType: opts?.orderType,
      block: opts?.block,
    });
    if (engine.ledger.trades > seenClosed) {
      const added = engine.ledger.trades - seenClosed;
      for (let k = 0; k < added && k < engine.closed.length; k++) {
        const t = engine.closed[k];
        rSum += t.r;
        rN += 1;
        const slot = rSlots.find((b) => t.r >= b.lo && t.r < b.hi) ?? rSlots[rSlots.length - 1];
        slot.n += 1;
      }
      seenClosed = engine.ledger.trades;
    }
    const eq = engine.stats.equity;
    if (eq > peak) peak = eq;
    const dd = peak > 0 ? Math.max(0, (peak - eq) / peak) : 0;
    if ((i + 1) % sampleEvery === 0) curve.push({
      t: (i + 1) / TICKS_PER_HOUR,
      eq,
      dd
    });
    if ((i + 1) % TICKS_PER_HOUR === 0 || i === ticks - 1) {
      const h = Math.ceil((i + 1) / TICKS_PER_HOUR);
      hourTrades = engine.ledger.trades - prevClosed;
      prevClosed = engine.ledger.trades;
      const hourNet = engine.stats.net - prevNet;
      prevNet = engine.stats.net;
      hourly.push({
        h,
        net: hourNet,
        trades: hourTrades,
        eq
      });
      if (markAt.has(h)) marks.push(horizonFromEngine(engine, h, peak));
    }
  }
  const audit = auditEngine(engine);
  const issues = [...audit.issues];
  if (engine.ledger.trades < 1) issues.push("No closed trades");
  if (hours >= 8) {
    if (engine.ledger.slExits < 1) issues.push("No stop-loss exits");
    if (engine.ledger.tpExits < 1) issues.push("No take-profit exits");
  }
  const profit = engine.ledger.profit;
  const loss = engine.ledger.loss;
  const trades = engine.ledger.trades;
  const wins = engine.ledger.wins;
  const bySymbol = Object.values(engine.symbolStats).map((s) => ({
    id: s.id,
    trades: s.trades,
    net: s.profit - s.loss,
    wr: s.trades ? s.wins / s.trades : 0,
    pf: s.loss < 1e-9 ? s.profit > 0 ? 99 : 0 : s.profit / s.loss,
    sl: s.sl,
    tp: s.tp
  })).sort((a, b) => b.net - a.net);
  const avgR = rN ? rSum / rN : 0;
  const rHist = rSlots.map(({ bin, n }) => ({
    bin,
    n
  }));
  const report = {
    hours,
    ticks,
    symbols: engine.symbolCount,
    trades,
    wins,
    wr: engine.stats.wr,
    pf: engine.stats.pf,
    net: engine.stats.net,
    mdd: engine.stats.mdd,
    equity: engine.stats.equity,
    slExits: engine.ledger.slExits,
    tpExits: engine.ledger.tpExits,
    openPositions: engine.positions.length,
    openOrders: engine.stats.openOrders,
    maxPositionsSeen: engine.ledger.maxPositions,
    maxOrdersSeen: engine.ledger.maxOrders,
    capRejects: engine.ledger.capRejects,
    rateSkips: engine.ledger.rateSkips,
    ratioViolations: audit.ratioViolations,
    negativePx: audit.negativePx,
    nanCount: audit.nanCount,
    passed: issues.length === 0,
    issues,
    curve,
    expectancy: trades ? engine.stats.net / trades : 0,
    avgWin: wins ? profit / wins : 0,
    avgLoss: trades - wins ? loss / (trades - wins) : 0,
    recovery: engine.stats.mdd > 1e-9 ? engine.stats.net / (engine.stats.mdd * 1e4) : engine.stats.net > 0 ? 8 : 0,
    profit,
    loss,
    maxWinStreak: engine.ledger.maxWinStreak,
    maxLossStreak: engine.ledger.maxLossStreak,
    bySymbol,
    hourly,
    avgR,
    rHist,
    book: bookCounts(engine),
    marks
  };
  engine.sim = report;
  engine.lastMsg = report.passed ? `${hours}h sim passed · ${report.trades} trades · PF ${report.pf.toFixed(2)}` : `${hours}h sim issues: ${issues.slice(0, 3).join("; ")}`;
  return {
    engine,
    report
  };
}

export type OverallBucket = {
  key: string;
  n: number;
  wins: number;
  pf: number;
  wr: number;
  net: number;
  ddt: number;
  mdd: number;
  symbols?: number;
  orders?: number;
  avgOrders?: number;
  openN?: number;
};

export type ConfigCell = {
  tactic: TacticKind;
  range: RangeType;
  pf: number;
  wr: number;
  net: number;
  trades: number;
  ok: boolean;
};

function pnlBucket(rows: { pnl: number }[], key = "all"): OverallBucket {
  const n = rows.length;
  let wins = 0;
  let profit = 0;
  let loss = 0;
  let net = 0;
  for (let i = 0; i < n; i++) {
    const p = rows[i]!.pnl;
    net += p;
    if (p > 0) {
      wins += 1;
      profit += p;
    } else if (p < 0) {
      loss -= p;
    }
  }
  const pf = loss === 0 ? (profit > 0 ? 3.2 : 0) : profit / loss;
  let peak = 0;
  let eq = 0;
  let mdd = 0;
  let dd = 0;
  let maxDd = 0;
  for (let i = n - 1; i >= 0; i--) {
    eq += rows[i]!.pnl;
    if (eq > peak) peak = eq;
    const d = peak > 0 ? Math.min(1, Math.max(0, (peak - eq) / Math.max(peak, 1e-9))) : 0;
    if (d > mdd) mdd = d;
    if (d > 1e-9) {
      dd += 1;
      if (dd > maxDd) maxDd = dd;
    } else dd = 0;
  }
  return {
    key,
    n,
    wins,
    pf: Number.isFinite(pf) ? pf : 0,
    wr: n ? wins / n : 0,
    net,
    ddt: maxDd,
    mdd,
  };
}

export const LIVE_POS_NS = [12, 40, 120] as const;
export const LIVE_HOUR_NS = [1, 2, 4, 6, 8, 12, 50] as const;

export type PlaybookDetail = OverallBucket & {
  active: OverallBucket;
  steps: OverallBucket[];
};

function windowHours<T extends { tick: number; at?: number }>(rows: T[], nowTick: number, hours: number) {
  const dated = rows.filter((c) => typeof c.at === "number" && c.at > 0);
  let span = 0;
  if (dated.length >= 3) {
    let minAt = Infinity;
    let maxAt = 0;
    for (const c of dated) {
      const t = Number(c.at);
      if (t < minAt) minAt = t;
      if (t > maxAt) maxAt = t;
    }
    span = maxAt - minAt;
  }
  if (span >= hours * 3_600_000 * 0.25) {
    const cutoff = Date.now() - hours * 3_600_000;
    return rows.filter((c) => Number(c.at ?? 0) >= cutoff);
  }
  const minTick = nowTick - hours * TICKS_PER_HOUR;
  return rows.filter((c) => c.tick >= minTick);
}

function hourBucket(e: VstEngine, hours: number): OverallBucket {
  const rows = windowHours(e.closed, e.tick, hours);
  const base = pnlBucket(rows, `${hours}h`);
  const symbols = new Set(rows.map((c) => c.symbol)).size;
  const lived = Math.max(e.tick, 1);
  const windowTicks = Math.min(hours * TICKS_PER_HOUR, lived);
  const frac = windowTicks / lived;
  const orders = Math.round((e.ledger.ordersFilled || e.ledger.ordersPlaced || rows.length) * frac);
  const liveOrd = e.orders.filter((o) => o.status === "open" || o.status === "partial").length;
  const avgOrders = (liveOrd + (e.ledger.maxOrders || liveOrd)) / 2;
  return {
    ...base,
    symbols,
    orders,
    avgOrders: Number.isFinite(avgOrders) ? avgOrders : liveOrd,
  };
}

type SeedableStats = {
  hours?: Record<string, OverallBucket>;
  lastN?: Record<string, OverallBucket>;
  overall?: OverallBucket;
  trades?: number;
  pf?: number;
  wr?: number;
  net?: number;
  avgConfigPf?: number;
};

export function seedStatsFromComplete(stats: SeedableStats, e: VstEngine): SeedableStats {
  const winner = (e as { completeWinner?: CompleteCell }).completeWinner;
  const cells = (e as { completeCells?: CompleteCell[] }).completeCells ?? [];
  if (!winner && !cells.length) return stats;
  const byH = new Map<number, CompleteCell>();
  for (const c of cells) {
    const h = Number(c.hours);
    if (!Number.isFinite(h)) continue;
    const prev = byH.get(h);
    if (!prev || c.pf > prev.pf) byH.set(h, c);
  }
  const nearest = (h: number): CompleteCell | undefined => {
    if (byH.has(h)) return byH.get(h);
    let best: CompleteCell | undefined;
    let dist = Infinity;
    for (const [k, c] of byH) {
      const d = Math.abs(k - h);
      if (d < dist) {
        dist = d;
        best = c;
      }
    }
    return best ?? winner;
  };
  const fillBucket = (b: OverallBucket | undefined, cell: CompleteCell | undefined, take?: number) => {
    if (!b || !cell) return;
    if (b.n > 0 && b.pf > 0) return;
    const n = Math.max(1, take ?? cell.trades ?? 0);
    b.n = n;
    b.wins = Math.round((cell.wr || 0) * n);
    b.pf = cell.pf;
    b.wr = cell.wr;
    b.net = cell.net;
    b.mdd = cell.mdd ?? b.mdd;
  };
  if (stats.hours) {
    for (const key of Object.keys(stats.hours)) {
      fillBucket(stats.hours[key], nearest(Number(key)));
    }
  }
  if (stats.lastN && winner) {
    for (const key of Object.keys(stats.lastN)) {
      const take = Number(String(key).replace(/\D/g, "")) || winner.trades;
      fillBucket(stats.lastN[key], winner, Math.min(take, winner.trades || take));
    }
  }
  if (!(Number(stats.trades) > 0) && winner && winner.pf > 0) {
    stats.pf = winner.pf;
    stats.wr = winner.wr;
    stats.net = winner.net;
    stats.trades = winner.trades;
    stats.avgConfigPf = stats.avgConfigPf || winner.pf;
    if (stats.overall && !(stats.overall.n > 0 && stats.overall.pf > 0)) {
      fillBucket(stats.overall, winner);
    }
  }
  return stats;
}

export function overallLiveStats(e: VstEngine) {
  const closed = e.closed.filter((c) => isDeskConn(c.connId));
  const bySymbol: OverallBucket[] = Object.values(e.symbolStats)
    .map((s) => {
      const pf = s.loss === 0 ? (s.profit > 0 ? 3.2 : 0) : s.profit / s.loss;
      return {
        key: s.id,
        n: s.trades,
        wins: s.wins,
        pf: Number.isFinite(pf) ? pf : 0,
        wr: s.trades ? s.wins / s.trades : 0,
        net: s.profit - s.loss,
        ddt: 0,
        mdd: 0,
      };
    })
    .sort((a, b) => b.net - a.net);
  const rankedPf = [...bySymbol].filter((s) => s.n >= 2).sort((a, b) => b.pf - a.pf || b.net - a.net);
  const byReason = (["sl", "tp", "time"] as const).map((k) =>
    pnlBucket(closed.filter((c) => c.reason === k), k),
  );
  const bySide = (["long", "short"] as const).map((k) => pnlBucket(closed.filter((c) => c.side === k), k));
  const byIndication = (["trend", "break", "active", "direction"] as const).map((k) =>
    pnlBucket(closed.filter((c) => (c.indication ?? "trend") === k), k),
  );
  const byKind = (["normal", "trend", "mean", "breakout", "volume", "hybrid", "active", "block"] as const).map((k) =>
    pnlBucket(closed.filter((c) => (c.kind ?? "normal") === k), k),
  );
  const byTactic = (["trailing", "dca", "axis", "hybrid"] as const).map((k) =>
    pnlBucket(closed.filter((c) => (c.tactic ?? e.lastTactic) === k), k),
  );
  const byPlaybook = (["normal", "axis", "block", "dca"] as const).map((k) =>
    pnlBucket(closed.filter((c) => (c.playbook ?? "normal") === k), k),
  );
  const byRange = (["linear", "geometric", "atr", "volume", "fibonacci"] as const).map((k) =>
    pnlBucket(closed.filter((c) => (c.rangeType ?? e.lastRange) === k), k),
  );
  const playbooks: PlaybookDetail[] = (["normal", "axis", "block", "dca"] as const).map((k) => {
    const rows = closed.filter((c) => (c.playbook ?? "normal") === k);
    const active = rows.filter((c) => c.indication === "active" || c.kind === "active");
    const maxStep = k === "block" || k === "dca" || k === "axis" ? 6 : 0;
    const steps = maxStep
      ? Array.from({ length: maxStep }, (_, i) =>
          pnlBucket(
            rows.filter((c) => (c.level ?? 1) === i + 1),
            `${k}:${i + 1}`,
          ),
        )
      : [];
    return { ...pnlBucket(rows, k), active: pnlBucket(active, `${k}:active`), steps };
  });
  const lastN = Object.fromEntries(
    LIVE_POS_NS.map((n) => [String(n), pnlBucket(closed.slice(0, n), `n${n}`)]),
  ) as Record<string, OverallBucket>;
  const hours = Object.fromEntries(
    LIVE_HOUR_NS.map((h) => [String(h), hourBucket(e, h)]),
  ) as Record<string, OverallBucket>;
  const liveBuckets = [...byPlaybook, ...byIndication, ...byTactic, ...byRange].filter((b) => b.n > 0);
  const avgPf = liveBuckets.length ? liveBuckets.reduce((s, b) => s + b.pf, 0) / liveBuckets.length : 0;
  const open = pnlBucket(
    e.positions.map((p) => ({ pnl: p.unrealized + p.realized })),
    "open",
  );
  const ov = pnlBucket(closed, "closed");
  const working = e.orders.filter((o) => o.status === "open" || o.status === "partial").length;
  const stats = {
    overall: ov,
    open,
    bySymbol,
    byReason,
    bySide,
    byIndication,
    byKind,
    byTactic,
    byPlaybook,
    byRange,
    playbooks,
    lastN,
    hours,
    bestSymbols: rankedPf.slice(0, 6),
    worstSymbols: [...rankedPf].reverse().slice(0, 6),
    runningSymbols: new Set(e.positions.map((p) => p.symbol)).size,
    avgPositions: e.positions.length,
    avgOrders: working,
    maxPositions: e.ledger.maxPositions,
    maxOrders: e.ledger.maxOrders,
    configsLive: liveBuckets.length,
    configsActive: e.positions.length,
    avgConfigPf: avgPf,
    symbols: e.symbolCount,
    occupied: new Set(e.positions.map((p) => p.symbol)).size,
    slots: e.positions.length,
    trades: closed.length,
    pf: ov.pf || Number((e as { completeWinner?: { pf?: number } }).completeWinner?.pf) || 0,
    wr: ov.wr,
    net: ov.net,
    mdd: e.stats.mdd,
    ddt: e.stats.ddt ?? ov.ddt,
  };
  seedStatsFromComplete(stats, e);
  return stats;
}

export function overlayExchangeBook(
  stats: ReturnType<typeof overallLiveStats>,
  book: Pick<ExchangeBook, "positions" | "orders"> | { positions?: ExchangeBook["positions"]; orders?: ExchangeBook["orders"] } | null | undefined,
  e: VstEngine,
): ReturnType<typeof overallLiveStats> {
  if (!stats) return stats;
  const pos = book?.positions ?? [];
  const orders = book?.orders ?? [];
  const occ = new Set(pos.map((p) => p.symbol).filter(Boolean));
  if (occ.size) {
    stats.runningSymbols = occ.size;
    stats.occupied = occ.size;
  }
  if (pos.length) {
    stats.avgPositions = pos.length;
    stats.slots = pos.length;
    stats.configsActive = pos.length;
    stats.maxPositions = Math.max(Number(stats.maxPositions) || 0, pos.length);
  }
  if (orders.length) {
    stats.avgOrders = orders.length;
    stats.maxOrders = Math.max(Number(stats.maxOrders) || 0, orders.length);
  }
  const openRows = pos.map((p) => {
    const indication = classifyIndication(e, p.symbol);
    const playbook = openPlaybook(e.lastTactic ?? "hybrid", indication);
    return {
      indication,
      kind: kindFromIndication(indication, playbook, e.lastTactic),
      playbook,
      tactic: e.lastTactic,
      rangeType: e.lastRange,
      pnl: Number(p.pnl) || 0,
      symbol: p.symbol,
    };
  });
  const bump = (rows: OverallBucket[] | undefined, keyOf: (r: (typeof openRows)[number]) => string) => {
    if (!rows?.length) return;
    for (const b of rows) {
      const open = openRows.filter((r) => keyOf(r) === b.key);
      b.openN = open.length;
      if ((b.n || 0) === 0 && open.length) {
        const profit = open.filter((o) => o.pnl > 0).reduce((s, o) => s + o.pnl, 0);
        const loss = Math.abs(open.filter((o) => o.pnl < 0).reduce((s, o) => s + o.pnl, 0));
        b.net = open.reduce((s, o) => s + o.pnl, 0);
        b.wins = open.filter((o) => o.pnl > 0).length;
        b.wr = open.length ? b.wins / open.length : 0;
        b.pf = loss === 0 ? (profit > 0 ? 3.2 : 0) : profit / loss;
      }
    }
  };
  bump(stats.byIndication, (r) => r.indication);
  bump(stats.byKind, (r) => r.kind);
  bump(stats.byTactic, (r) => r.tactic);
  bump(stats.byPlaybook, (r) => r.playbook);
  bump(stats.byRange, (r) => r.rangeType);
  if (stats.playbooks?.length) {
    for (const pb of stats.playbooks) {
      const open = openRows.filter((r) => r.playbook === pb.key);
      const wins = open.filter((o) => o.pnl > 0).length;
      const profit = open.filter((o) => o.pnl > 0).reduce((s, o) => s + o.pnl, 0);
      const loss = Math.abs(open.filter((o) => o.pnl < 0).reduce((s, o) => s + o.pnl, 0));
      pb.active = {
        key: `${pb.key}:active`,
        n: open.length,
        wins,
        pf: loss === 0 ? (profit > 0 ? 3.2 : 0) : profit / loss,
        wr: open.length ? wins / open.length : 0,
        net: open.reduce((s, o) => s + o.pnl, 0),
        ddt: 0,
        mdd: 0,
        openN: open.length,
      };
      pb.openN = open.length;
    }
  }
  if (pos.length) {
    const map = new Map((stats.bySymbol ?? []).map((s) => [s.key, { ...s }]));
    for (const p of pos) {
      const cur = map.get(p.symbol) ?? { key: p.symbol, n: 0, wins: 0, pf: 0, wr: 0, net: 0, ddt: 0, mdd: 0 };
      cur.openN = (cur.openN ?? 0) + 1;
      cur.net += Number(p.pnl) || 0;
      map.set(p.symbol, cur);
    }
    const bySymbol = [...map.values()].sort((a, b) => b.net - a.net);
    stats.bySymbol = bySymbol;
    const ranked = [...bySymbol].filter((s) => (s.n ?? 0) + (s.openN ?? 0) > 0).sort((a, b) => b.net - a.net);
    stats.bestSymbols = ranked.slice(0, 6);
    stats.worstSymbols = [...ranked].reverse().slice(0, 6);
  }
  const liveBuckets = [...(stats.byPlaybook ?? []), ...(stats.byIndication ?? []), ...(stats.byTactic ?? []), ...(stats.byRange ?? [])].filter(
    (b) => b.n > 0 || (b.openN ?? 0) > 0,
  );
  stats.configsLive = liveBuckets.length;
  const winner = (e as { completeWinner?: { pf: number } }).completeWinner;
  if (winner && Number(winner.pf) > 0 && !(stats.trades > 0)) stats.avgConfigPf = Number(winner.pf);
  else if (liveBuckets.length) {
    const withPf = liveBuckets.filter((b) => b.n > 0 || (b.openN ?? 0) > 0);
    stats.avgConfigPf = withPf.length ? withPf.reduce((s, b) => s + b.pf, 0) / withPf.length : stats.pf;
  }
  if (stats.hours) {
    for (const b of Object.values(stats.hours)) {
      if (!b) continue;
      b.symbols = Math.max(b.symbols || 0, occ.size);
      b.orders = Math.max(b.orders || 0, orders.length);
      b.avgOrders = orders.length || b.avgOrders;
      b.openN = pos.length;
    }
  }
  if (stats.lastN) {
    for (const b of Object.values(stats.lastN)) {
      if (!b) continue;
      b.openN = pos.length;
    }
  }
  seedStatsFromComplete(stats, e);
  return stats;
}

export const LIVE_TACTICS: TacticKind[] = ["trailing", "axis", "hybrid"];

export function sweepAllConfigs(
  hours = 8,
  symbolCount = 12,
  cfg: TacticConfig = DEFAULT_CFG,
): { hours: number; symbolCount: number; at: number; cells: ConfigCell[]; winner: ConfigCell | null } {
  const cells: ConfigCell[] = [];
  for (const tactic of LIVE_TACTICS) {
    for (const range of RANGE_TYPES) {
      const { report } = simulateHours(hours, cfg, tactic, { symbolCount, rangeType: range });
      cells.push({
        tactic,
        range,
        pf: report.pf,
        wr: report.wr,
        net: report.net,
        trades: report.trades,
        ok: report.pf >= 1 && report.net > 0 && report.trades >= 8,
      });
    }
  }
  const winner = [...cells].sort((a, b) => b.pf - a.pf || b.net - a.net)[0] ?? null;
  return { hours, symbolCount, at: Date.now(), cells, winner };
}

export function sweepPlaybooks(
  hours = 8,
  symbolCount = 12,
  cfg: TacticConfig = DEFAULT_CFG,
): { hours: number; at: number; books: (OverallBucket & { tactic: TacticKind; range: RangeType })[] } {
  const specs: { key: string; tactic: TacticKind; range: RangeType; block?: boolean }[] = [
    { key: "normal", tactic: "hybrid", range: "volume" },
    { key: "axis", tactic: "axis", range: "atr" },
    { key: "block", tactic: "hybrid", range: "volume", block: true },
  ];
  const books = specs.map((s) => {
    const { engine, report } = simulateHours(hours, cfg, s.tactic, { symbolCount, rangeType: s.range });
    if (s.block) {
      for (let i = 0; i < 8; i++) {
        tickVst(engine, cfg, s.tactic, { rangeType: s.range, block: { ...DEFAULT_BLOCK_CONFIG, enabled: true, endStageOnly: false, cadence: 4 }, endStage: true });
      }
    }
    const live = overallLiveStats(engine);
    return {
      ...pnlBucket(engine.closed, s.key),
      tactic: s.tactic,
      range: s.range,
      pf: report.pf || live.pf,
      wr: report.wr || live.wr,
      net: report.net || live.net,
      n: report.trades || live.trades,
      mdd: report.mdd || live.mdd,
      ddt: live.ddt,
    };
  });
  return { hours, at: Date.now(), books };
}

export type CompleteCell = ConfigCell & { hours: number; mdd: number };

export type CompleteComputeReport = {
  at: number;
  hours: number[];
  symbolCount: number;
  cells: CompleteCell[];
  byHours: Record<string, { winner: CompleteCell | null; ok: number; n: number; avgPf: number }>;
  winner: CompleteCell | null;
  playbooks: ReturnType<typeof sweepPlaybooks>;
  indications: OverallBucket[];
  kinds: OverallBucket[];
  elapsedMs: number;
};

function cellFromRows(
  rows: { pnl: number }[],
  tactic: TacticKind,
  range: RangeType,
  hours: number,
  mdd: number,
): CompleteCell {
  const profit = rows.filter((t) => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
  const loss = Math.abs(rows.filter((t) => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
  const pf = loss === 0 ? (profit > 0 ? 3.2 : 0) : profit / loss;
  const wins = rows.filter((t) => t.pnl > 0).length;
  const net = profit - loss;
  return {
    tactic,
    range,
    hours,
    pf: Number.isFinite(pf) ? pf : 0,
    wr: rows.length ? wins / rows.length : 0,
    net,
    trades: rows.length,
    mdd,
    ok: pf >= 1 && net > 0 && rows.length >= 4,
  };
}

function oneCompleteCell(
  cfg: TacticConfig,
  tactic: TacticKind,
  range: RangeType,
  hours: number,
  symbolCount: number,
): CompleteCell {
  const span = hours < 8 ? 16 : hours;
  const { engine, report } = simulateHours(span, cfg, tactic, { symbolCount, rangeType: range });
  if (span === hours) {
    return {
      tactic,
      range,
      hours,
      pf: report.pf,
      wr: report.wr,
      net: report.net,
      trades: report.trades,
      mdd: report.mdd,
      ok: report.pf >= 1 && report.net > 0 && report.trades >= 4,
    };
  }
  const minTick = engine.tick - hours * TICKS_PER_HOUR;
  return cellFromRows(
    engine.closed.filter((c) => c.tick >= minTick),
    tactic,
    range,
    hours,
    report.mdd,
  );
}

function completeCellsForPair(
  cfg: TacticConfig,
  tactic: TacticKind,
  range: RangeType,
  hours: number[],
  symbolCount: number,
): CompleteCell[] {
  const need = Math.max(...hours, hours.some((h) => h < 8) ? 16 : 0);
  const { engine, report } = simulateHours(need, cfg, tactic, { symbolCount, rangeType: range });
  return hours.map((h) => {
    if (h >= need) {
      return {
        tactic,
        range,
        hours: h,
        pf: report.pf,
        wr: report.wr,
        net: report.net,
        trades: report.trades,
        mdd: report.mdd,
        ok: report.pf >= 1 && report.net > 0 && report.trades >= 4,
      };
    }
    const minTick = engine.tick - h * TICKS_PER_HOUR;
    return cellFromRows(
      engine.closed.filter((c) => c.tick >= minTick),
      tactic,
      range,
      h,
      report.mdd,
    );
  });
}

function foldComplete(cells: CompleteCell[], hours: number[], playbooks: ReturnType<typeof sweepPlaybooks>, t0: number, symbolCount: number, hint?: { indications: OverallBucket[]; kinds: OverallBucket[] }): CompleteComputeReport {
  const byHours: CompleteComputeReport["byHours"] = {};
  for (const h of hours) {
    const slice = cells.filter((c) => c.hours === h);
    const winner = [...slice].sort((a, b) => b.pf - a.pf || b.net - a.net)[0] ?? null;
    const ok = slice.filter((c) => c.ok).length;
    const avgPf = slice.length ? slice.reduce((s, c) => s + c.pf, 0) / slice.length : 0;
    byHours[String(h)] = { winner, ok, n: slice.length, avgPf };
  }
  const longest = Math.max(...hours);
  const longCells = cells.filter((c) => c.hours === longest);
  const winner = [...(longCells.length ? longCells : cells)].sort((a, b) => b.pf - a.pf || b.net - a.net)[0] ?? null;
  return {
    at: Date.now(),
    hours,
    symbolCount,
    cells,
    byHours,
    winner,
    playbooks,
    indications: hint?.indications ?? [],
    kinds: hint?.kinds ?? [],
    elapsedMs: Date.now() - t0,
  };
}

/** Independent full compute: every live tactic × range × stage hours. */
export function completeComputations(
  cfg: TacticConfig = DEFAULT_CFG,
  opts?: { symbolCount?: number; hours?: number[] },
): CompleteComputeReport {
  const hours = (opts?.hours ?? [...STAGE_HOURS]).map((n) => Math.max(1, Math.round(n)));
  const symbolCount = opts?.symbolCount ?? 8;
  const t0 = Date.now();
  const cells: CompleteCell[] = [];
  for (const tactic of LIVE_TACTICS) {
    for (const range of RANGE_TYPES) {
      cells.push(...completeCellsForPair(cfg, tactic, range, hours, symbolCount));
    }
  }
  const playbooks = sweepPlaybooks(hours.includes(8) ? 8 : hours[hours.length - 1]!, symbolCount, cfg);
  return foldComplete(cells, hours, playbooks, t0, symbolCount);
}

export async function completeComputationsAsync(
  cfg: TacticConfig = DEFAULT_CFG,
  opts?: {
    symbolCount?: number;
    hours?: number[];
    yieldFn?: () => Promise<void>;
    onCell?: (cell: CompleteCell, i: number, total: number) => void;
  },
): Promise<CompleteComputeReport> {
  const hours = (opts?.hours ?? [...STAGE_HOURS]).map((n) => Math.max(1, Math.round(n)));
  const symbolCount = opts?.symbolCount ?? 8;
  const yieldFn = opts?.yieldFn ?? (() => new Promise<void>((r) => setImmediate(r)));
  const t0 = Date.now();
  const cells: CompleteCell[] = [];
  const total = LIVE_TACTICS.length * RANGE_TYPES.length * hours.length;
  let i = 0;
  for (const tactic of LIVE_TACTICS) {
    for (const range of RANGE_TYPES) {
      const batch = completeCellsForPair(cfg, tactic, range, hours, symbolCount);
      for (const cell of batch) {
        cells.push(cell);
        i += 1;
        opts?.onCell?.(cell, i, total);
      }
      await yieldFn();
    }
  }
  const playbooks = sweepPlaybooks(hours.includes(8) ? 8 : hours[hours.length - 1]!, symbolCount, cfg);
  await yieldFn();
  return foldComplete(cells, hours, playbooks, t0, symbolCount);
}

export function formatTickClock(tick: number): string {
  const sec = Math.max(0, Math.floor((tick * VST_TICK_MS) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export interface SystemLoad {
  id: string;
  label: string;
  value: number;
  max: number;
  hint: string;
}

export function systemSnapshot(
  e: VstEngine,
  extra?: {
    combos?: { total: number; positive: number };
    feed?: { state: string; latencyMs: number; count: number; missing: number };
    connections?: { rateLimitUsed: number; rateLimitMax: number }[];
  },
) {
  const book = bookCounts(e);
  const sessions = Math.max(1, Object.keys(e.tokens).length);
  const tokenMax = sessions * VST_RATE_BURST;
  const tokenLeft = Object.values(e.tokens).reduce((a, n) => a + n, 0);
  const tokenUsed = Math.max(0, tokenMax - tokenLeft);
  const connRateUsed = extra?.connections?.reduce((a, c) => a + c.rateLimitUsed, 0) ?? tokenUsed;
  const connRateMax = extra?.connections?.reduce((a, c) => a + c.rateLimitMax, 0) || VST_RATE_WINDOW * sessions;
  const lastBatch = e.batches[0] ?? null;
  const cooldownN = Object.values(e.cooldown).filter((t) => t > e.tick).length;
  const hourTick = e.tick % TICKS_PER_HOUR;
  const queueCap = VST_BATCH_SIZE * sessions;
  const rateUsed = Math.max(connRateUsed, 0);
  const rateMax = Math.max(connRateMax, 1);

  const loads: SystemLoad[] = [
    {
      id: "slots",
      label: "Position slots",
      value: book.positions.slots,
      max: Math.max(book.positions.maxSlots, 1),
      hint: `${book.positions.slots}/${book.positions.maxSlots} · ${book.positions.long}L ${book.positions.short}S`,
    },
    {
      id: "legs",
      label: "Position legs",
      value: book.positions.legs,
      max: book.positions.maxLegs,
      hint: `${book.positions.legs}/${book.positions.maxLegs}`,
    },
    {
      id: "symbols",
      label: "Occupied symbols",
      value: book.positions.symbols,
      max: Math.max(e.symbolCount, 1),
      hint: `${book.positions.symbols}/${e.symbolCount}`,
    },
    {
      id: "orders",
      label: "Order pipeline",
      value: book.orders.live,
      max: Math.max(book.orders.live, queueCap, 1),
      hint: `${book.orders.queued}q ${book.orders.open}o ${book.orders.partial}p · ${book.orders.placed} placed`,
    },
    {
      id: "queue",
      label: "Queue load",
      value: book.orders.queued,
      max: Math.max(queueCap, book.orders.queued, 1),
      hint: `${book.orders.queued} waiting · batch ${VST_BATCH_SIZE}`,
    },
    {
      id: "rate",
      label: "Rate tokens",
      value: rateUsed,
      max: rateMax,
      hint: `${Math.round(rateUsed)}/${rateMax}`,
    },
    {
      id: "hour",
      label: "Session hour",
      value: hourTick,
      max: TICKS_PER_HOUR,
      hint: `${Math.round((hourTick / TICKS_PER_HOUR) * 100)}% · tick ${e.tick} · ${formatTickClock(e.tick)}`,
    },
    {
      id: "batch",
      label: "Last batch",
      value: lastBatch?.accepted ?? 0,
      max: Math.max(lastBatch?.count ?? VST_BATCH_SIZE, 1),
      hint: lastBatch ? `${lastBatch.accepted}/${lastBatch.count} acc · ${lastBatch.rejected} rej` : "none yet",
    },
    {
      id: "cooldown",
      label: "Cooldown",
      value: cooldownN,
      max: Math.max(e.symbolCount, 1),
      hint: `${cooldownN} symbols cooling`,
    },
  ];
  if (extra?.combos) {
    loads.push({
      id: "combos",
      label: "Positive combos",
      value: extra.combos.positive,
      max: Math.max(extra.combos.total, 1),
      hint: `${extra.combos.positive.toLocaleString()}/${extra.combos.total.toLocaleString()}`,
    });
  }
  if (extra?.feed) {
    const cover = extra.feed.count + extra.feed.missing;
    loads.push({
      id: "tape",
      label: "Tape coverage",
      value: extra.feed.count,
      max: Math.max(cover, 1),
      hint: `${extra.feed.count} live · ${extra.feed.missing} missing · ${extra.feed.latencyMs} ms`,
    });
  }

  return {
    book,
    loads,
    rateUsed,
    rateMax,
    lastBatch,
    cooldownN,
    hourTick,
    queueCap,
    fills: e.fills.length,
    closed: e.closed.length,
    batches: e.batches.length,
    clock: formatTickClock(e.tick),
    healCount: e.healCount ?? 0,
    lastHeal: e.lastHeal ?? "",
  };
}

export function liveDeskBook(
  e: VstEngine,
  connId: string,
  lastN: number,
): { last: Position[]; ongoing: Position[] } {
  const ongoing: Position[] = e.positions
    .filter((p) => p.connId === connId)
    .map((p) => ({
      id: p.id,
      symbol: p.symbol,
      strategyId: "live",
      side: p.side,
      status: "open" as const,
      entry: p.avgEntry,
      mark: p.mark,
      qty: p.qty,
      cost: Math.abs(p.qty * p.avgEntry),
      pnl: p.unrealized,
      pnlPct: p.avgEntry ? p.unrealized / Math.max(Math.abs(p.qty * p.avgEntry), 1e-9) : 0,
      openedBar: p.openedTick,
      closedBar: null,
      tactic: "hybrid" as const,
      rangeType: p.controllingRange,
      blockId: p.id,
      venue: "bingx" as const,
      orderType: "limit" as const,
    }));
  const last: Position[] = e.closed
    .filter((t) => t.connId === connId)
    .slice(0, lastN)
    .map((t) => ({
      id: t.id,
      symbol: t.symbol,
      strategyId: "live",
      side: t.side,
      status: "closed" as const,
      entry: t.entry,
      mark: t.exit,
      qty: t.qty,
      cost: Math.abs(t.qty * t.entry),
      pnl: t.pnl,
      pnlPct: t.entry ? ((t.exit - t.entry) / t.entry) * (t.side === "long" ? 1 : -1) : 0,
      openedBar: Math.max(0, t.tick - 1),
      closedBar: t.tick,
      tactic: "hybrid" as const,
      rangeType: "atr" as const,
      blockId: t.id,
      venue: "bingx" as const,
      orderType: "market" as const,
    }));
  return { last, ongoing };
}

export function exchangeAsPositions(book: ExchangeBook | null | undefined): Position[] {
  if (!book?.ok) return [];
  return book.positions.map((p, i) => ({
    id: `ex-${p.symbol}-${p.side}-${i}`,
    symbol: p.symbol,
    strategyId: "live",
    side: p.side,
    status: "open" as const,
    entry: p.entry,
    mark: p.mark,
    qty: p.qty,
    cost: Math.abs(p.qty * (p.entry || p.mark || 0)),
    pnl: p.pnl,
    pnlPct: p.entry ? p.pnl / Math.max(Math.abs(p.qty * p.entry), 1e-9) : 0,
    openedBar: 0,
    closedBar: null,
    tactic: "hybrid" as const,
    rangeType: "atr" as const,
    blockId: `${p.symbol}:${p.side}`,
    venue: "bingx" as const,
    orderType: "market" as const,
  }));
}

export function positionsAsTrades(pos: Position[]): import("./types.ts").Trade[] {
  return pos.map((p) => ({
    id: p.id,
    strategyId: p.strategyId,
    symbol: p.symbol,
    side: p.side,
    entryBar: p.openedBar,
    exitBar: p.closedBar ?? p.openedBar,
    entry: p.entry,
    exit: p.mark,
    pnl: p.pnl,
    volume: Math.max(Math.abs(p.qty * p.entry), p.cost || 0),
    cost: p.cost,
  }));
}
