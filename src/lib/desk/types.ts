export type Venue = "bingx" | "bybit";
export type RangeType = "linear" | "geometric" | "atr" | "volume" | "fibonacci";
export type TacticKind = "trailing" | "dca" | "axis" | "hybrid";
export type StrategyKind = "normal" | "trend" | "mean" | "breakout" | "volume" | "hybrid" | "active" | "block" | "short";

/** Independent live switches. Normal is always computed internally even when live is off. */
export interface StrategyToggles {
  /** Live-execute general/unadjusted lanes. Off = calc-only base for relations. */
  normal: boolean;
  /** Trailing as a base set and as overlay on Axis/Block. Off = unused everywhere. */
  trailing: boolean;
  axis: boolean;
  block: boolean;
  dca: boolean;
}
export type IndicationId =
  | "trend"
  | "break"
  | "active"
  | "direction"
  | "move"
  | "rsi"
  | "bollinger"
  | "sar"
  | "macd"
  | "ema";
export type Side = "long" | "short";
export type LaneStatus = "validated" | "candidate" | "rejected";
export type ConnStatus = "connected" | "disconnected" | "error" | "testing";
export type OrderTypeId =
  | "market"
  | "limit"
  | "stop"
  | "stop_limit"
  | "trailing_stop"
  | "post_only"
  | "ioc"
  | "fok";

export type ViewId =
  | "overview"
  | "strategies"
  | "positions"
  | "combinations"
  | "lanes"
  | "replay"
  | "tactics"
  | "performance"
  | "results"
  | "connections"
  | "engine"
  | "settings";

export interface SymbolInfo {
  id: string;
  base: string;
  quote: string;
  venues: Venue[];
  start: number;
  vol: number;
}

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface IndicatorPack {
  sma20: number[];
  ema9: number[];
  ema21: number[];
  ema55: number[];
  rsi14: number[];
  macd: number[];
  macdSignal: number[];
  macdHist: number[];
  bbMid: number[];
  bbUpper: number[];
  bbLower: number[];
  stochK: number[];
  stochD: number[];
  adx: number[];
  plusDI: number[];
  minusDI: number[];
  atr: number[];
  vwap: number[];
  supertrend: number[];
  stDir: number[];
  volSma: number[];
  cci: number[];
  activity: number[];
  rangeChange: number[];
}

export interface IndicatorDef {
  id: string;
  label: string;
  params: Record<string, number>;
}

export interface StrategyDef {
  id: string;
  name: string;
  thesis: string;
  indicators: IndicatorDef[];
  kind: StrategyKind;
}

export interface Trade {
  id: string;
  strategyId: string;
  symbol: string;
  side: Side;
  entryBar: number;
  exitBar: number;
  entry: number;
  exit: number;
  pnl: number;
  volume: number;
  cost: number;
}

export interface Stats {
  trades: number;
  wins: number;
  wr: number;
  pf: number;
  net: number;
  mdd: number;
  ddt: number;
  expectancy: number;
  volumeFactor: number;
  recovery: number;
  sqn: number;
  avgWin: number;
  avgLoss: number;
  profit: number;
  loss: number;
  avgHold: number;
}

export interface Backtest {
  strategyId: string;
  symbol: string;
  trades: Trade[];
  equity: number[];
  signals: number[];
  stats: Stats;
}

export interface ComboResult {
  id: string;
  strategyId: string;
  strategyName: string;
  symbol: string;
  costStep: number;
  rangeType: RangeType;
  tactic: TacticKind;
  trailPct: number;
  tpRatio: number;
  pf: number;
  mdd: number;
  ddt: number;
  wr: number;
  volumeFactor: number;
  net: number;
  trades: number;
  lastNPf: number;
  lastNWr: number;
  lastNNet: number;
  positive: boolean;
  lastNPositive: boolean;
  rank: number;
  sweet: boolean;
}

export interface ComboBucket {
  id: string;
  label: string;
  n: number;
  avgPf: number;
  avgWr: number;
  avgMdd: number;
  avgVf: number;
  avgDdt: number;
  pass: number;
  net: number;
}

export interface ComboPoint {
  pf: number;
  lastNPf: number;
  wr: number;
  mdd: number;
  tactic: TacticKind;
  rangeType: RangeType;
  strategyId: string;
}

export interface ComboHistBin {
  bin: string;
  lo: number;
  hi: number;
  n: number;
  pass: number;
}

export interface ComboBreakdown {
  total: number;
  positive: number;
  lastNPositive: number;
  both: number;
  avgPf: number;
  avgMdd: number;
  avgWr: number;
  avgVf: number;
  avgDdt: number;
  uniquePf: number;
  uniqueMdd: number;
  byStrategy: ComboBucket[];
  byTactic: ComboBucket[];
  byRange: ComboBucket[];
  byKind: ComboBucket[];
  byCost: ComboBucket[];
  byTrail: ComboBucket[];
  byTpRatio: ComboBucket[];
  pfHist: ComboHistBin[];
  scatter: ComboPoint[];
}

export interface Position {
  id: string;
  symbol: string;
  strategyId: string;
  side: Side;
  status: "closed" | "open" | "next";
  entry: number;
  mark: number;
  qty: number;
  cost: number;
  pnl: number;
  pnlPct: number;
  openedBar: number;
  closedBar: number | null;
  tactic: TacticKind;
  rangeType: RangeType;
  blockId: string;
  venue: Venue;
  orderType: OrderTypeId;
}

export interface PositionBlock {
  id: string;
  symbol: string;
  side: Side;
  count: number;
  multiple: number;
  net: number;
  tactic: TacticKind;
}

export interface BlockConfig {
  enabled: boolean;
  maxMultiple: number;
  minMultiple: number;
  addOnWin: boolean;
  flattenConflict: boolean;
  endStageOnly: boolean;
  cadence: number;
  overall: boolean;
  /** Lane/set Block adds. Off = Overall-only. Default true. */
  sets?: boolean;
  counts: number[];
  volumeRatio: number;
  /** Overall Block (all positions, independent of lanes). Default 1. */
  overallVolumeRatio?: number;
  /** Shared (old split) volume ratio. Default 1.5. */
  sharedVolumeRatio?: number;
  maxVolumeMultiplier: number;
  pfRatio: number;
  pauseCountRatio: number;
  evalPosCount: number;
  activeLive: boolean;
  minActiveLevel: number;
  /** Keep extra volume on until the relation PF is positive again. */
  keepAdjusted?: boolean;
  /** Old type: Block # rungs 1–2 (optimal). */
  stack: boolean;
  /** New type: last-N pos windows 1–16; a losing window adjusts the next N. */
  windows: boolean;
  /** additive: each count adds ratio×base. shared: old split/cap. parallel: both independent. */
  volumeMode?: "additive" | "shared" | "parallel";
  /** Overall Block volume strat. Live default shared. */
  overallMode?: "additive" | "shared" | "parallel";
  /** both = hedge same symbol L+S. one = force a single side. long/short = that side only. mixed = hash split. */
  sides?: "long" | "short" | "both" | "mixed" | "one";
  /** Recalc relation evals every N hours. */
  evalHours?: number;
  autoEval?: boolean;
  /** Additive extra = winningRelations × relVolumeRatio × base. */
  relAdditive?: boolean;
  relVolumeRatio?: number;
  minRelPf?: number;
  evalLastNs?: number[];
  liveLastN?: number;
  liveDisable?: boolean;
  liveDisableMinPf?: number;
  liveDisableMinSamples?: number;
  /** Per-symbol auto-validation lookback in hours. */
  symbolEvalHours?: number;
  /** Coordinate entries by UTC-hour / sim-hour situation. */
  hourCoord?: boolean;
}

export interface BlockAdjustResult {
  cancelled: number;
  added: number;
  flattened: number;
  blocks: number;
}

export interface BlockPosWindow {
  n: number;
  ring: { symbol: string; side: Side; pnl: number }[];
  closed: number;
  pauseLeft: number;
  lastAvg: number;
  lastNet: number;
  lastPf: number;
  windows: number;
  lossWindows: number;
  adjusted: number;
  losers: string[];
  /** Completed N-batch nets for independent PF (N=1 ≠ N=6). */
  batchNets?: number[];
}

export interface Lane {
  id: string;
  strategyId: string;
  strategyName: string;
  symbol: string;
  tactic: TacticKind;
  rangeType: RangeType;
  costStep: number;
  trailPct?: number;
  tpRatio?: number;
  status: LaneStatus;
  pf: number;
  lastNPf: number;
  mdd: number;
  wr: number;
  volumeFactor: number;
  blockCount: number;
  ongoing: number;
  next: number;
  ddt: number;
  net?: number;
  kind: StrategyKind;
  activity: number;
  hf: boolean;
  indications: { trend: number; break: number; active: number; direction: number };
  timing?: number;
  activityAgree?: number;
  evals?: LastNEvalRow[];
  effective?: boolean;
}

export interface Coordination {
  heat: number;
  aligned: boolean;
  conflict: boolean;
  netSide: Side | "flat";
  lastNet: number;
  ongoingNet: number;
  nextNet: number;
  volumeFactor: number;
  recommend: "add" | "wait" | "reduce" | "flip" | "hold";
  reason: string;
  lastCount: number;
  ongoingCount: number;
  nextCount: number;
  activity: number;
  hf: boolean;
  indications: { trend: number; break: number; active: number; direction: number };
  agree: boolean;
  timing?: number;
  activityAgree?: number;
}

export type NetworkMode = "paper" | "testnet" | "mainnet";

export interface Connection {
  id: string;
  venue: Venue;
  label: string;
  testnet: boolean;
  network: NetworkMode;
  armed: boolean;
  hasKeys: boolean;
  status: ConnStatus;
  apiKeyMasked: string;
  permissions: string[];
  symbols: string[];
  orderTypesEnabled: OrderTypeId[];
  rateLimitUsed: number;
  rateLimitMax: number;
  openOrderCount: number;
  positionCount: number;
  maxPositions: number;
  maxSymbols: number;
  unlimitedOrders: boolean;
  lastPingMs: number;
  equity?: number;
}

export interface ExchangePosition {
  connId: string;
  symbol: string;
  venueSymbol: string;
  side: Side;
  qty: number;
  entry: number;
  mark: number;
  pnl: number;
  leverage?: number;
  tactic?: TacticKind;
  indication?: IndicationId;
  playbook?: string;
  kind?: StrategyKind;
}

export interface ExchangeOrder {
  connId: string;
  id: string;
  symbol: string;
  venueSymbol: string;
  side: Side;
  qty: number;
  filled?: number;
  remaining?: number;
  price: number;
  stopPrice?: number;
  status: string;
  type: string;
  closePosition?: boolean;
  reduceOnly?: boolean;
  clientOrderId?: string;
  /** True when clientOrderId is tagged for this desk connection. */
  owned?: boolean;
}

export interface ExchangeBook {
  connId: string;
  ok: boolean;
  equity: number;
  positions: ExchangePosition[];
  orders: ExchangeOrder[];
  at: number;
  latencyMs: number;
  error?: string;
}

export interface FeedStatus {
  state: "idle" | "live" | "error" | "stale";
  venue: "bingx";
  latencyMs: number;
  at: number;
  count: number;
  missing: number;
  error?: string;
}

export interface TacticConfig {
  trailingPct: number;
  dcaCount: number;
  dcaDrawdown: number;
  axisSpacing: number;
  axisLevels: number;
  /** Extra axis ladder legs as a fraction of the validated base qty. */
  axisPartialRatio?: number;
  slAtr: number;
  tpRatio: number;
  tpAtr?: number;
  slOfTp?: number;
  shortRange?: boolean;
  maxHoldBars?: number;
  maxHoldTicks?: number;
}

export interface Thresholds {
  minPf: number;
  basePf: number;
  axisPf: number;
  blockPf: number;
  /** Live floor for short-range configs (independent of overall 1.8). */
  shortPf: number;
  /** Base validation for short-range configs before Axis/Block overlays. Allow < 1. */
  shortBasePf: number;
  /** Short-range Axis overlay. Allow < 1 so Block can still take the tape. */
  shortAxisPf: number;
  /** Short-range Block overlay. */
  shortBlockPf: number;
  maxMdd: number;
  minWr: number;
  minVf: number;
  maxDdt: number;
}

export type LastNStage = "picks" | "lanes" | "last" | "ongoing" | "next" | "combos";

export interface ShortProgressConfig {
  enabled: boolean;
  indications: IndicationId[];
  overallPf: number;
  basePf: number;
  axisPf: number;
  blockPf: number;
  lastParts: number[];
  activityWindows: number[];
  drawdownLookback: number;
  prevRelN: number;
  bestOnly: boolean;
  /** Live short floor — default 0.42 ATR (working cell). */
  minTpAtr: number;
  /** Live short floor — default 1.7 × TP (working cell). */
  minSlOfTp: number;
}

export interface LastNConfig {
  picks: number;
  lanes: number;
  last: number;
  ongoing: number;
  next: number;
  combos: number;
}

export interface HeatCell {
  cost: number;
  rangeType: RangeType;
  pf: number;
  mdd: number;
  positive: boolean;
}

export interface DeskData {
  symbols: SymbolInfo[];
  candles: Record<string, Candle[]>;
  indicators: Record<string, IndicatorPack>;
  strategies: StrategyDef[];
  backtests: Record<string, Backtest>;
  combinations: ComboResult[];
  connections: Connection[];
}

export interface PaperOrder {
  id: string;
  connId: string;
  venue: Venue;
  symbol: string;
  side: Side;
  type: OrderTypeId;
  qty: number;
  price: number;
  cost: number;
  status: "open" | "filled" | "cancelled" | "rejected";
  note: string;
}

export interface VolumeCoord {
  vf: number;
  highVolWr: number;
  lowVolWr: number;
  highVolNet: number;
  lowVolNet: number;
  confirm: "confirm" | "diverge" | "flat";
  reason: string;
}

export interface SliceStats {
  n: number;
  net: number;
  wr: number;
  pf: number;
}

export interface StrategyAdj {
  pf: number;
  mdd: number;
  wr: number;
}

export interface VstSymbol {
  id: string;
  base: string;
  quote: string;
  start: number;
  vol: number;
}

export interface VstQuote {
  id: string;
  base: string;
  px: number;
  hi: number;
  lo: number;
  atr: number;
  vol: number;
  axis: number;
  chg: number;
  vol1h?: number;
  hi1h?: number;
  lo1h?: number;
  vol1hAt?: number;
}

export interface LiveOrder {
  id: string;
  connId: string;
  symbol: string;
  side: Side;
  type: OrderTypeId;
  qty: number;
  filled: number;
  price: number;
  remaining: number;
  status: "queued" | "open" | "partial" | "filled" | "cancelled" | "rejected";
  rangeType: RangeType;
  level: number;
  sl: number;
  tp: number;
  slDist: number;
  tpDist: number;
  batchId: string;
  note: string;
  indication?: IndicationId;
  kind?: StrategyKind;
  playbook?: string;
  tactic?: TacticKind;
}

export interface LivePosition {
  id: string;
  connId: string;
  symbol: string;
  side: Side;
  qty: number;
  plannedQty: number;
  avgEntry: number;
  mark: number;
  sl: number;
  tp: number;
  slDist: number;
  tpDist: number;
  realized: number;
  unrealized: number;
  legs: { orderId: string; qty: number; px: number }[];
  controllingRange: RangeType;
  rangeSpacing: number;
  status: "open" | "partial";
  openedTick: number;
  tactic?: TacticKind;
  kind?: StrategyKind;
  indication?: IndicationId;
  playbook?: string;
  blockLevel?: number;
  blockQty?: number;
  peakPx?: number;
}

export interface Fill {
  id: string;
  orderId: string;
  connId: string;
  symbol: string;
  side: Side;
  qty: number;
  px: number;
  pnl: number;
  kind: "entry" | "partial" | "sl" | "tp" | "exit" | "time";
  tick: number;
  remaining?: number;
  planned?: number;
}

export interface VstBatch {
  id: string;
  connId: string;
  count: number;
  tick: number;
  accepted: number;
  rejected: number;
}

export interface ClosedTrade {
  id: string;
  connId: string;
  symbol: string;
  side: Side;
  pnl: number;
  qty: number;
  entry: number;
  exit: number;
  reason: "sl" | "tp" | "time";
  tick: number;
  at?: number;
  r: number;
  holdTicks?: number;
  tactic?: TacticKind;
  rangeType?: RangeType;
  kind?: StrategyKind;
  indication?: IndicationId;
  playbook?: string;
  level?: number;
  blockQty?: number;
}

export interface VstStats {
  pf: number;
  wr: number;
  net: number;
  mdd: number;
  trades: number;
  wins: number;
  openOrders: number;
  queued: number;
  positions: number;
  partials: number;
  equity: number;
  ddt: number;
}

export interface BookCounts {
  positions: {
    slots: number;
    long: number;
    short: number;
    symbols: number;
    legs: number;
    maxSlots: number;
    maxLegs: number;
  };
  orders: {
    queued: number;
    open: number;
    partial: number;
    filled: number;
    cancelled: number;
    rejected: number;
    working: number;
    live: number;
    placed: number;
  };
}

export interface VstLedger {
  trades: number;
  wins: number;
  profit: number;
  loss: number;
  slExits: number;
  tpExits: number;
  timeExits: number;
  peak: number;
  maxMdd: number;
  capRejects: number;
  rateSkips: number;
  maxPositions: number;
  maxOrders: number;
  winStreak: number;
  lossStreak: number;
  maxWinStreak: number;
  maxLossStreak: number;
  ordersPlaced: number;
  ordersFilled: number;
  ordersCancelled: number;
  ordersRejected: number;
  ddTicks: number;
  maxDdt: number;
}

export interface SymbolTape {
  id: string;
  trades: number;
  wins: number;
  profit: number;
  loss: number;
  sl: number;
  tp: number;
}

export interface SimReport {
  hours: number;
  ticks: number;
  symbols: number;
  trades: number;
  wins: number;
  wr: number;
  pf: number;
  net: number;
  mdd: number;
  equity: number;
  slExits: number;
  tpExits: number;
  openPositions: number;
  openOrders: number;
  maxPositionsSeen: number;
  maxOrdersSeen: number;
  capRejects: number;
  rateSkips: number;
  ratioViolations: number;
  negativePx: number;
  nanCount: number;
  passed: boolean;
  issues: string[];
  curve: { t: number; eq: number; dd: number }[];
  expectancy: number;
  avgWin: number;
  avgLoss: number;
  recovery: number;
  profit: number;
  loss: number;
  maxWinStreak: number;
  maxLossStreak: number;
  bySymbol: { id: string; trades: number; net: number; wr: number; pf: number; sl: number; tp: number }[];
  hourly: {
    h: number;
    net: number;
    trades: number;
    eq: number;
    pf?: number;
    wr?: number;
    mdd?: number;
    ddt?: number;
    pos?: number;
    slots?: number;
    orders?: number;
    queued?: number;
    sl?: number;
    tp?: number;
    netCum?: number;
    vol?: number;
    notional?: number;
    blockOrd?: number;
  }[];
  avgR: number;
  rHist: { bin: string; n: number }[];
  book: BookCounts;
  marks?: HorizonMark[];
  ddt?: number;
  avgPositions?: number;
  avgOrders?: number;
  avgSlots?: number;
  avgBlockOrd?: number;
  avgNotional?: number;
  startEquity?: number;
  costStep?: number;
  unitNotional?: number;
}

export interface HorizonMark {
  hours: number;
  trades: number;
  pf: number;
  wr: number;
  net: number;
  mdd: number;
  equity: number;
  slExits: number;
  tpExits: number;
  ok: boolean;
  score: number;
}

export interface AxisPick<T extends string | number = string> {
  axis: string;
  value: T;
  label: string;
  score: number;
  ok: boolean;
  marks: HorizonMark[];
}

export interface KindValidate {
  kind: StrategyKind;
  total: number;
  pass: number;
  ok: boolean;
  bestPf: number;
}

export interface AutoValidateResult {
  hours: number;
  histHours: number[];
  picks: {
    tactic: AxisPick<TacticKind>;
    rangeType: AxisPick<RangeType>;
    trailPct: AxisPick<number>;
    slAtr: AxisPick<number>;
    tpRatio: AxisPick<number>;
  };
  kinds: KindValidate[];
  enabledKinds: StrategyKind[];
  cfg: TacticConfig;
  tactic: TacticKind;
  rangeType: RangeType;
  confirm: HorizonMark[];
  confirmOk: boolean;
  confirmReport?: SimReport;
  applied: boolean;
  at: number;
  stages?: StageEvalBundle | null;
}

export interface LastNEvalRow {
  n: number;
  pf: number;
  wr: number;
  net: number;
  trades: number;
  ok: boolean;
}

export interface LaneEvalTrack {
  laneId: string;
  strategyId: string;
  symbol: string;
  tactic: TacticKind;
  kind: StrategyKind;
  ns: LastNEvalRow[];
  effective: boolean;
  lastAt: number;
}

export interface CoordValidate {
  axis: "tactic" | "range" | "kind" | "lastN";
  value: string;
  ok: boolean;
  pf: number;
  wr: number;
  lastN: number;
  recommend: string;
}

export interface StageEval {
  id: "pre" | "mid" | "end";
  hours: number;
  pf: number;
  wr: number;
  net: number;
  mdd: number;
  trades: number;
  ok: boolean;
  effective: number;
  valid: number;
  pfAvg?: number;
}

export interface StageEvalBundle {
  hours: number[];
  lastNs: number[];
  stages: StageEval[];
  coords: CoordValidate[];
  laneTracks: LaneEvalTrack[];
  liveNs: LastNEvalRow[];
  endPfAvg: number;
  effective: number;
  valid: number;
  endOk: boolean;
  mirrored: boolean;
  blockAdjust?: BlockAdjustResult;
  cfg: TacticConfig;
  tactic: TacticKind;
  rangeType: RangeType;
  at: number;
}

export type EnginePhase = "idle" | "running" | "paused" | "stopped";

export interface SymbolHourRow {
  n: number;
  pf: number;
  wr: number;
  net: number;
  ok: boolean;
  hourOk: boolean;
  byHour: Record<string, { n: number; pf: number; net: number }>;
  byWindow: Record<string, { n: number; pf: number; net: number; ok: boolean }>;
  bestInd?: string;
  bestSide?: string;
  bestTac?: string;
  bestHour?: number;
}

export interface HourCoord {
  hour: number;
  performing: string[];
  skipped: string[];
  bestInd?: string;
  bestSide?: string;
  bestTac?: string;
  at: number;
}

export interface VstEngine {
  quotes: Record<string, VstQuote>;
  queue: LiveOrder[];
  orders: LiveOrder[];
  positions: LivePosition[];
  fills: Fill[];
  closed: ClosedTrade[];
  batches: VstBatch[];
  tick: number;
  running: boolean;
  phase: EnginePhase;
  lastMsg: string;
  seq: number;
  tokens: Record<string, number>;
  stats: VstStats;
  ledger: VstLedger;
  sim: SimReport | null;
  cooldown: Record<string, number>;
  symbolCount: number;
  orderType: OrderTypeId;
  symbolStats: Record<string, SymbolTape>;
  activeConnId: string;
  healCount: number;
  lastHeal: string;
  tpRatio: number;
  costStep: number;
  startEquity?: number;
  lastTactic: TacticKind;
  lastRange: RangeType;
  lastBlockAt: number;
  blockLanes: Record<string, BlockLaneState>;
  blockWindows: Record<number, BlockPosWindow>;
  blockWindowsBySymbol: Record<string, Record<number, BlockPosWindow>>;
  blockRelWindows: Record<string, Record<number, BlockPosWindow>>;
  blockRelBest?: Record<string, { key: string; n: number; pf: number; net: number; vol: number; major: boolean }>;
  lastRelEvalTick?: number;
  relVolumeFactor?: number;
  liveDisabled?: Record<string, { pf: number; n: number; at: number }>;
  liveHealth?: { n: number; at: number; disabled: string[]; kept: string[] };
  indRangeBest?: Partial<Record<IndicationId, RangeType>>;
  indTacticBest?: Partial<Record<IndicationId, TacticKind>>;
  blockCfg?: BlockConfig;
  symbolEval?: Record<string, SymbolHourRow>;
  performingSymbols?: string[];
  hourCoord?: HourCoord;
  minPf?: number;
  basePf?: number;
  axisPf?: number;
  blockPf?: number;
  shortPf?: number;
  shortBasePf?: number;
  shortAxisPf?: number;
  shortBlockPf?: number;
  shortProgress?: ShortProgressConfig;
  liveTape?: boolean;
  shortRange?: boolean;
  strategyToggles?: StrategyToggles;
  /** Owned live exchange position count — used to allow a restart when the book is empty. */
  liveOpenN?: number;
  liveLegHint?: Record<string, { side?: Side; indication?: IndicationId; tactic?: TacticKind; playbook?: string; kind?: string; rangeType?: RangeType }>;
}

export interface BlockLaneState {
  symbol: string;
  side: Side;
  baseQty: number;
  baseEntry: number;
  confirmedAdd: number;
  satisfied: Record<number, boolean>;
  pfRing: Record<number, number[]>;
  parentPf: number[];
  pending?: number;
  active: boolean;
  pauseRemaining: Record<number, number>;
  heldFactor: Record<number, number>;
}

