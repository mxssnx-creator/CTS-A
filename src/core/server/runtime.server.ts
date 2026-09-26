// Core v2 continuous runtime. One per server process (globalThis singleton).
//
// Loop (every cycleMs):
//   1. market   backfill once, then pull newly CLOSED bars for every symbol (BingX public; real data only — an outage is retried with backoff)
//   2. compute  when a new bar closed: S1–S5 pipeline, walk-forward tapes, 48h simulated run with 20h pre-calc
//   3. paper    the current hour's selection trades on paper; closes land in paper_trades
//   4. live     optional gated adapter mirrors fresh paper entries (off by default)
// Heavy work is time-sliced (yields every ~12 ms) so the web server stays responsive.
import { DEFAULT_SETTINGS, STRATEGY_PRESETS, type CoreSettings } from "../config.ts";
import type { Candle, OpenPosition, Protect, Trade } from "../domain/types.ts";
import { barsFromCandles, syntheticCandles, tailBars } from "../market/bars.ts";
import {
  fetchHistory,
  fetchKlines,
  fetchTickers,
  pickUniverse,
  type Ticker,
} from "../market/bingx.ts";
import {
  makeUniverse,
  runPipeline,
  type PipelineOutput,
  type PipelineProgress,
} from "../pipeline/pipeline.ts";
import {
  buildTapesGen,
  defaultWalkForward,
  selectAt,
  selectDurable,
  walkForwardGen,
  type ConfigTape,
  type WalkForwardOptions,
  type WalkForwardResult,
} from "../sim/walkforward.ts";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { coreDb, type CoreDb } from "./db.server.ts";

const H = 3_600_000;
const SLICE_MS = 12;

export type RuntimeState =
  "idle" | "booting" | "backfill" | "running" | "computing" | "error" | "stopped";

export interface PhaseTiming {
  ms: number;
  /** longest synchronous slice between yields (what can delay other requests) */
  maxSliceMs: number;
}

export interface RuntimeStatus {
  state: RuntimeState;
  stage: string;
  progress: number;
  label: string;
  cycles: number;
  computes: number;
  startedAt: number;
  heartbeat: number;
  lastCycleMs: number;
  lastComputeMs: number;
  lastBarT: number;
  source: "bingx" | "synthetic" | "none";
  symbols: string[];
  error: string | null;
  nextCycleAt: number;
  phases: Record<string, PhaseTiming>;
  /** Base combos promoted to Main in the last compute */
  mainPairs: number;
  /** when settings last changed, and which settings version the last finished compute used */
  settingsAt: number;
  appliedSettingsAt: number;
  lastComputeAt: number;
  /** a compute is requested (settings change / recompute) and not yet finished */
  pending: boolean;
  /** self-healing: actions taken and consecutive failed cycles */
  heals: number;
  lastHeal: string;
  errorsInRow: number;
  /** event-loop delay over the last compute (ms) */
  loop: { p50: number; p99: number; max: number };
}

export interface PaperBook {
  selected: string[];
  eligible: number;
  positions: OpenPosition[];
  trades: Trade[];
  equity: number;
  startedAt: number;
}

const yieldNow = () => new Promise<void>((r) => setImmediate(r));

export class CoreRuntime {
  readonly db: CoreDb;
  settings: CoreSettings;
  wf: WalkForwardOptions;
  status: RuntimeStatus;
  candles = new Map<string, Candle[]>();
  tickers: Ticker[] = [];
  pipeline: PipelineOutput | null = null;
  tapes: ConfigTape[] = [];
  sim: WalkForwardResult | null = null;
  paper: PaperBook;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private busy = false;
  private dirty = true;
  /** loop generation: a cycle from an older generation never reschedules or publishes */
  private gen = 0;
  private stopped = false;
  private resetUniverse = false;
  private loop = monitorEventLoopDelay({ resolution: 20 });
  private snapshotPath = process.env.CTS_CORE_SNAPSHOT || "";
  private lastSnapshot = 0;
  onLive?: (rt: CoreRuntime, intents: LiveIntent[], gen: number) => Promise<void>;

  /** market source: live BingX (the app) or synthetic (automated tests only, explicit opt-in) */
  private market: "bingx" | "synthetic";
  /** market data functions (injectable for recovery tests) */
  private feed: MarketFeed;
  private healer: ReturnType<typeof setInterval> | null = null;
  private errorsInRow = 0;

  constructor(
    db: CoreDb = coreDb(),
    settings?: Partial<CoreSettings>,
    opts: { market?: "bingx" | "synthetic"; feed?: Partial<MarketFeed> } = {},
  ) {
    this.feed = {
      tickers: fetchTickers,
      history: fetchHistory,
      klines: fetchKlines,
      ...(opts.feed ?? {}),
    };
    this.market = opts.market ?? "bingx";
    this.db = db;
    const saved = db.kvGet<Partial<CoreSettings>>("settings");
    this.settings = mergeSettings(DEFAULT_SETTINGS, saved, settings);
    this.wf = {
      ...defaultWalkForward(this.settings),
      ...pickWf(db.kvGet<Partial<WalkForwardOptions>>("wf") ?? {}),
    };
    const now = Date.now();
    this.status = {
      state: "idle",
      stage: "",
      progress: 0,
      label: "",
      cycles: 0,
      computes: 0,
      startedAt: now,
      heartbeat: now,
      lastCycleMs: 0,
      lastComputeMs: 0,
      lastBarT: 0,
      source: "none",
      symbols: [],
      error: null,
      nextCycleAt: now,
      phases: {},
      mainPairs: 0,
      settingsAt: 0,
      appliedSettingsAt: 0,
      lastComputeAt: 0,
      pending: true,
      heals: 0,
      lastHeal: "",
      errorsInRow: 0,
      loop: { p50: 0, p99: 0, max: 0 },
    };
    this.loop.enable();
    this.paper = {
      selected: [],
      eligible: 0,
      positions: [],
      trades: [],
      equity: 0,
      startedAt: now,
    };
  }

  /** Current loop generation (live steps abort when it changes). */
  get generation(): number {
    return this.gen;
  }

  /** Tickers fetched now (for live pricing); falls back to the last known ones. */
  async freshTickers(): Promise<Ticker[]> {
    try {
      const t = await this.feed.tickers();
      if (t.length) this.tickers = t;
    } catch {
      /* keep last */
    }
    return this.tickers;
  }

  start() {
    if (!this.stopped && this.status.state !== "idle" && this.status.state !== "error") return;
    if (this.status.state === "idle" && this.snapshotPath && this.db.restore(this.snapshotPath))
      this.db.event("info", `restored snapshot ${this.snapshotPath}`);
    this.stopped = false;
    if (!this.busy) this.status.state = "booting";
    if (!this.healer) {
      this.healer = setInterval(() => void this.heal(), 30_000);
      (this.healer as { unref?: () => void }).unref?.();
    }
    this.db.event("info", "runtime start");
    this.schedule(0);
  }

  /** Stop now: the in-flight cycle is abandoned at its next yield (a new generation), nothing half-published. */
  stop() {
    this.stopped = true;
    this.gen++;
    this.busy = false;
    this.dirty = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.status.state = "stopped";
    this.db.event("info", "runtime stopped");
  }

  /** Watchdog: if a cycle has not beaten for a long time, abandon it (new generation) and start fresh. */
  ensureAlive() {
    if (this.status.state === "idle") return this.start();
    if (this.stopped) return;
    // a loop that is merely waiting out an error backoff (timer set) is not stale
    const waitingBackoff =
      !this.busy && this.timer !== null && this.status.nextCycleAt > Date.now() - 60_000;
    const stale =
      !waitingBackoff &&
      Date.now() - this.status.heartbeat > Math.max(180_000, this.settings.cycleMs * 8);
    if (stale) {
      this.db.event("warn", "watchdog: loop stale, starting a new generation");
      this.gen++;
      this.busy = false;
      this.dirty = true;
      this.status.heartbeat = Date.now();
      this.schedule(0);
    }
  }

  private noteHeal(msg: string, level: "info" | "warn" = "warn") {
    this.status.heals++;
    this.status.lastHeal = `${new Date().toISOString().slice(11, 19)} ${msg}`;
    this.db.event(level, `self-heal: ${msg}`);
  }

  /**
   * Periodic self-healing (every 30 s, independent of viewers):
   *  - stale loop → new generation (ensureAlive)
   *  - a lost timer (nothing scheduled while not busy / stopped) → reschedule
   */
  async heal() {
    if (this.stopped) return;
    const beforeGen = this.gen;
    this.ensureAlive();
    if (this.gen !== beforeGen) this.noteHeal("stale loop replaced by a new generation");
    if (!this.busy && !this.timer && !this.stopped && this.status.state !== "idle") {
      this.noteHeal("no cycle scheduled, rescheduling");
      this.schedule(0);
    }
  }

  updateSettings(patch: Partial<CoreSettings>, wfPatch?: Partial<WalkForwardOptions>) {
    const prevUniverse = `${this.settings.symbols}|${this.settings.tfMin}|${this.settings.historyDays}`;
    this.settings = mergeSettings(this.settings, patch);
    this.wf = {
      ...defaultWalkForward(this.settings),
      ...pickWf(this.wf),
      ...sanitizeWf(wfPatch ?? {}),
      gates: this.settings.gates,
      cost: this.settings.cost,
      toggles: this.settings.toggles,
      block: this.settings.block,
      dca: this.settings.dca,
    };
    this.db.kvSet("settings", this.settings);
    this.db.kvSet("wf", pickWf(this.wf));
    this.status.settingsAt = Date.now();
    // a running cycle keeps its snapshot; the universe reset is applied at the start of the next cycle
    if (
      prevUniverse !==
      `${this.settings.symbols}|${this.settings.tfMin}|${this.settings.historyDays}`
    )
      this.resetUniverse = true;
    this.db.event(
      "info",
      this.busy ? "settings updated — applied after the running compute" : "settings updated",
    );
    this.kick();
  }

  /** Drop all candles and backfill again (applied at the start of the next cycle). */
  requestResync() {
    this.resetUniverse = true;
    this.kick();
  }

  /** Re-run the compute stages on the next cycle, now (or right after the running one). */
  kick() {
    this.dirty = true;
    this.status.pending = true;
    if (!this.busy && !this.stopped) this.schedule(0);
  }

  private schedule(ms: number) {
    if (this.timer) clearTimeout(this.timer);
    this.status.nextCycleAt = Date.now() + ms;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.cycle();
    }, ms);
    (this.timer as { unref?: () => void }).unref?.();
  }

  private setStage(stage: string, done: number, total: number, label = "") {
    this.status.stage = stage;
    this.status.progress = total ? done / total : 0;
    this.status.label = label;
    this.status.heartbeat = Date.now();
  }

  async cycle() {
    if (this.busy || this.stopped) return;
    this.busy = true;
    const gen = this.gen;
    const t0 = performance.now();
    try {
      if (this.resetUniverse) {
        this.resetUniverse = false;
        this.candles.clear();
        this.db.run("DELETE FROM candles");
        this.db.run("DELETE FROM symbols");
        this.dirty = true;
      }
      const newBars = await this.syncMarket(gen);
      if (gen !== this.gen) return;
      // the universe changed while syncing (timeframe / symbols / history): start over with the new one
      if (this.resetUniverse) return;
      if (newBars || this.dirty) await this.compute(gen);
      if (gen !== this.gen) return;
      this.phase("Paper", () => this.stepPaper());
      if (this.onLive && this.settings.live.enabled) {
        await this.onLive(this, this.pendingEntries(), gen);
        if (gen !== this.gen) return;
      }
      if (!this.stopped) this.status.state = "running";
      this.status.error = null;
      if (this.snapshotPath && Date.now() - this.lastSnapshot > 10 * 60_000) {
        this.lastSnapshot = Date.now();
        this.db.snapshot(this.snapshotPath);
      }
      this.db.trim();
      if (this.errorsInRow > 0)
        this.noteHeal(`recovered after ${this.errorsInRow} failed cycle(s)`, "info");
      this.errorsInRow = 0;
    } catch (e) {
      if (gen === this.gen) {
        this.errorsInRow++;
        this.dirty = true; // retry the compute on the next cycle
        this.status.state = this.stopped ? "stopped" : "error";
        this.status.error = e instanceof Error ? e.message : String(e);
        this.db.event("error", `cycle: ${this.status.error}`);
      }
    } finally {
      if (gen === this.gen) {
        this.status.cycles++;
        this.status.lastCycleMs = performance.now() - t0;
        this.status.heartbeat = Date.now();
        this.busy = false;
        // a compute requested while we were busy runs right away
        this.status.errorsInRow = this.errorsInRow;
        // failures back off exponentially (5 s … 10 min); a compute requested while busy runs right away
        const backoff = this.errorsInRow
          ? Math.min(600_000, 5_000 * 2 ** Math.min(7, this.errorsInRow - 1))
          : 0;
        if (!this.stopped) this.schedule(backoff || (this.dirty ? 0 : this.settings.cycleMs));
      }
    }
  }

  private phase<T>(name: string, fn: () => T): T {
    const t = performance.now();
    const r = fn();
    const ms = performance.now() - t;
    this.status.phases[name] = { ms, maxSliceMs: ms };
    return r;
  }

  // ── market ────────────────────────────────────────────────────────────
  private async syncMarket(gen: number): Promise<boolean> {
    const s = this.settings;
    const want = Math.round((s.historyDays * 24 * 60) / s.tfMin);
    if (this.candles.size === 0) {
      this.status.state = "backfill";
      this.loadCandlesFromDb();
    }
    if (this.candles.size === 0) {
      // test-only feed (explicit opt-in); the app always runs on real BingX data
      if (this.market === "synthetic") {
        const end = Date.now();
        for (let i = 0; i < s.symbols; i++)
          this.storeCandles(`SYN${i}-USDT`, syntheticCandles(`SYN${i}`, s.tfMin, want, end));
        this.status.source = "synthetic";
      } else {
        // real data only: if BingX does not answer, the cycle fails and is retried with backoff — no mock data
        try {
          this.tickers = await this.feed.tickers();
        } catch (e) {
          this.status.source = "none";
          throw new Error(
            `BingX market unavailable (${e instanceof Error ? e.message : e}) — retrying, no mock data is used`,
          );
        }
        const syms = pickUniverse(this.tickers, s.symbols);
        let done = 0;
        await mapLimit(syms, 4, async (sym) => {
          const cs = await this.feed.history(sym, s.tfMin, want, { pauseMs: 60 }).catch(() => []);
          if (gen !== this.gen) return;
          if (cs.length >= 200) this.storeCandles(sym, cs);
          this.setStage("backfill", ++done, syms.length, sym);
        });
        if (gen !== this.gen) return false;
        if (this.candles.size === 0) {
          this.status.source = "none";
          throw new Error("BingX returned no history — retrying, no mock data is used");
        }
        this.status.source = "bingx";
        this.db.event(
          "info",
          `backfilled ${this.candles.size} symbols × ${want} bars (${s.tfMin}m)`,
        );
      }
      this.status.symbols = [...this.candles.keys()];
      this.upsertSymbols();
      return true;
    }
    // incremental
    const tfMs = s.tfMin * 60_000;
    const now = Date.now();
    let added = 0;
    if (this.status.source === "synthetic") return false;
    // gap repair: a symbol more than 300 bars behind cannot be caught up incrementally → backfill it again
    const wantBars = Math.round((s.historyDays * 24 * 60) / s.tfMin);
    const behind = [...this.candles.entries()].filter(
      ([, cs]) => now - (cs[cs.length - 1]?.t ?? 0) > 300 * tfMs,
    );
    if (behind.length) {
      await mapLimit(behind, 4, async ([sym]) => {
        const cs = await this.feed.history(sym, s.tfMin, wantBars, { pauseMs: 60 }).catch(() => []);
        if (cs.length >= 200 && gen === this.gen && this.candles.has(sym)) {
          this.storeCandles(sym, cs);
          added += cs.length;
        }
      });
      this.noteHeal(`re-backfilled ${behind.length} symbol(s) with a gap > 300 bars`);
    }
    const due = [...this.candles.entries()].filter(([, cs]) => {
      const last = cs[cs.length - 1]?.t ?? 0;
      return last + 2 * tfMs <= now && now - last <= 300 * tfMs;
    });
    await mapLimit(due, 6, async ([sym, cs]) => {
      const last = cs[cs.length - 1]?.t ?? 0;
      try {
        const fresh = await this.feed.klines(sym, s.tfMin, {
          startT: last + 1,
          limit: 300,
          nowT: now,
        });
        const extra = fresh.filter((c) => c.t > last);
        if (extra.length && gen === this.gen && this.candles.has(sym)) {
          this.storeCandles(sym, extra, true);
          added += extra.length;
        }
      } catch (e) {
        this.db.event("warn", `${sym} klines: ${e instanceof Error ? e.message : e}`);
      }
    });
    this.status.heartbeat = Date.now();
    if (added) {
      try {
        this.tickers = await this.feed.tickers();
        this.upsertSymbols();
      } catch {
        /* tickers are cosmetic */
      }
    }
    return added > 0;
  }

  private loadCandlesFromDb() {
    const rows = this.db.all<Candle & { sym: string }>(
      "SELECT sym, t, o, h, l, c, v FROM candles ORDER BY sym, t",
    );
    for (const r of rows) {
      const arr = this.candles.get(r.sym) ?? [];
      arr.push({ t: r.t, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v });
      this.candles.set(r.sym, arr);
    }
    if (this.candles.size) {
      this.status.source = this.status.source === "none" ? "bingx" : this.status.source;
      this.status.symbols = [...this.candles.keys()];
    }
  }

  private storeCandles(sym: string, cs: Candle[], append = false) {
    const want = Math.round((this.settings.historyDays * 24 * 60) / this.settings.tfMin);
    const arr = append ? [...(this.candles.get(sym) ?? []), ...cs] : [...cs];
    const trimmed = arr.slice(Math.max(0, arr.length - want));
    this.candles.set(sym, trimmed);
    const ins =
      "INSERT OR REPLACE INTO candles (sym, t, o, h, l, c, v) VALUES (?, ?, ?, ?, ?, ?, ?)";
    this.db.tx(() => {
      for (const c of cs) this.db.run(ins, sym, c.t, c.o, c.h, c.l, c.c, c.v);
      if (trimmed.length)
        this.db.run("DELETE FROM candles WHERE sym = ? AND t < ?", sym, trimmed[0].t);
    });
    const last = trimmed[trimmed.length - 1]?.t ?? 0;
    if (last > this.status.lastBarT) this.status.lastBarT = last;
  }

  private upsertSymbols() {
    const tick = new Map(this.tickers.map((t) => [t.sym, t]));
    this.db.tx(() => {
      for (const [sym, cs] of this.candles) {
        const t = tick.get(sym);
        this.db.run(
          "INSERT OR REPLACE INTO symbols (sym, last, quote_vol, change_pct, bars, first_t, last_t, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          sym,
          t?.last ?? cs[cs.length - 1]?.c ?? 0,
          t?.quoteVol ?? 0,
          t?.changePct ?? 0,
          cs.length,
          cs[0]?.t ?? 0,
          cs[cs.length - 1]?.t ?? 0,
          Date.now(),
        );
      }
    });
  }

  // ── compute ───────────────────────────────────────────────────────────
  /** Run a generator in time slices; records total time and the longest uninterrupted slice. */
  private async drive<T, R>(
    name: string,
    gen: Generator<T, R>,
    onStep: (v: T) => void,
    runGen = this.gen,
  ): Promise<R> {
    const t0 = performance.now();
    let slice = t0;
    let maxSlice = 0;
    for (;;) {
      const r = gen.next();
      if (r.done) {
        maxSlice = Math.max(maxSlice, performance.now() - slice);
        this.status.phases[name] = { ms: performance.now() - t0, maxSliceMs: maxSlice };
        return r.value;
      }
      onStep(r.value);
      const el = performance.now() - slice;
      if (el > SLICE_MS) {
        maxSlice = Math.max(maxSlice, el);
        await yieldNow();
        if (runGen !== this.gen) throw new Error("superseded by a newer loop generation");
        slice = performance.now();
      }
    }
  }

  async compute(gen = this.gen) {
    const t0 = performance.now();
    this.dirty = false;
    this.status.state = "computing";
    this.loop.reset();
    const settingsAt = this.status.settingsAt;
    // snapshot: a settings change during this compute applies to the next one
    const s = this.settings;
    const wf = this.wf;
    const allBars = [...this.candles.entries()].map(([sym, cs]) =>
      barsFromCandles(sym, s.tfMin, cs),
    );
    const u = makeUniverse(allBars);
    if (!u.bars.length) return;

    // Base (S1) → Main (S2/S3) → Real ranking on the full history
    const stageName: Record<string, string> = {
      S1: "Base",
      S2: "Main",
      S3: "Main",
      S4: "Real",
      S5: "Real",
    };
    const pipeline = await this.drive(
      "Pipeline",
      runPipeline(u, s),
      (p: PipelineProgress) =>
        this.setStage(stageName[p.stage] ?? p.stage, p.done, p.total, p.label),
      gen,
    );
    await this.persistPipeline(pipeline, gen);
    this.pipeline = pipeline;

    // walk-forward tapes on the recent tail: warm-up + long window + simulated run
    const tailN = Math.round(((24 + Math.max(wf.preH, wf.longH) + wf.simH) * 60) / s.tfMin);
    const wu = makeUniverse(allBars.map((b) => tailBars(b, tailN)));
    // Main candidates: Base combos by score (default protect, full history), plus every pair held right now
    const main = new Set<string>();
    for (const r of [...pipeline.s1].sort((a, b) => b.score - a.score).slice(0, s.mainTop))
      main.add(`${r.bot}|${r.ind}`);
    for (const id of this.paper.selected) main.add(id.split("|").slice(0, 2).join("|"));
    this.status.mainPairs = main.size;
    const tapes = await this.drive(
      "Tapes",
      buildTapesGen(wu, wf.protects, s.cost, { protects: wf.dcaProtects, dca: wf.dca }, main),
      (p) =>
        this.setStage(
          "Base",
          p.done,
          p.total,
          "strategy tapes (normal · trailing · DCA · DCA Active)",
        ),
      gen,
    );
    let step = 0;
    const steps = Math.max(1, Math.ceil(wf.simH / Math.max(wf.stepH, s.tfMin / 60)));
    const sim = await this.drive(
      "Simulation",
      walkForwardGen(wu, tapes, wf),
      () => this.setStage("Real", ++step, steps, `${wf.simH}h simulated run, ${wf.preH}h pre-calc`),
      gen,
    );
    this.tapes = tapes;
    this.sim = sim;
    this.persistSim(sim);
    // every preset on the same tapes: with / without Block, DCA and Active, side by side
    const presets: Record<string, unknown> = {};
    const names = Object.keys(STRATEGY_PRESETS);
    const tc = performance.now();
    let maxSlice = 0;
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      this.setStage("Compare", i, names.length, name);
      const r = await this.drive(
        "Compare",
        walkForwardGen(wu, tapes, { ...wf, toggles: STRATEGY_PRESETS[name].toggles }),
        () => undefined,
        gen,
      );
      maxSlice = Math.max(maxSlice, this.status.phases.Compare?.maxSliceMs ?? 0);
      presets[name] = {
        label: STRATEGY_PRESETS[name].label,
        toggles: STRATEGY_PRESETS[name].toggles,
        stats: r.stats,
        hourly: r.hourly,
        byKind: r.byKind,
        skips: r.skips,
        blocks: r.blocks,
        stable: r.stable,
      };
    }
    this.status.phases.Compare = { ms: performance.now() - tc, maxSliceMs: maxSlice };
    this.db.kvSet("presetSims", { at: Date.now(), startT: sim.startT, endT: sim.endT, presets });
    this.setStage("Real", 1, 1, "done");
    this.status.computes++;
    this.status.lastComputeMs = performance.now() - t0;
    this.status.lastComputeAt = Date.now();
    this.status.appliedSettingsAt = settingsAt;
    this.status.pending = this.dirty;
    this.status.loop = {
      p50: this.loop.percentile(50) / 1e6,
      p99: this.loop.percentile(99) / 1e6,
      max: this.loop.max / 1e6,
    };
    const ph = Object.entries(this.status.phases)
      .map(([k, v]) => `${k} ${Math.round(v.ms)}/${Math.round(v.maxSliceMs)}`)
      .join(" · ");
    this.db.run(
      "INSERT INTO runs (kind, started, ended, items, ms, note) VALUES (?, ?, ?, ?, ?, ?)",
      "compute",
      Date.now() - Math.round(this.status.lastComputeMs),
      Date.now(),
      pipeline.s1.length + pipeline.s2.length + tapes.length,
      this.status.lastComputeMs,
      `${ph} (ms total/max slice) · loop p99 ${this.status.loop.p99.toFixed(0)} max ${this.status.loop.max.toFixed(0)}`,
    );
    console.info(
      `[core-v2] compute #${this.status.computes} done in ${Math.round(this.status.lastComputeMs)} ms · sim PF ${sim.stats.pf.toFixed(2)} n ${sim.stats.n} · loop max ${this.status.loop.max.toFixed(0)} ms`,
    );
    this.db.event(
      "info",
      `compute #${this.status.computes}: sim PF ${sim.stats.pf.toFixed(2)} net ${sim.stats.net.toFixed(1)}% n ${sim.stats.n} · armed ${pipeline.armed.length} · ${Math.round(this.status.lastComputeMs)}ms`,
    );
  }

  /** Write rows in small transactions, yielding between them. */
  private async writeChunked(
    rows: Iterable<[string, Array<string | number | null>]>,
    gen: number,
    chunk = 1500,
  ) {
    const db = this.db;
    let n = 0;
    let slice = performance.now();
    let maxSlice = 0;
    db.db.exec("BEGIN");
    try {
      for (const [sql, p] of rows) {
        db.run(sql, ...p);
        if (++n % chunk === 0) {
          db.db.exec("COMMIT");
          maxSlice = Math.max(maxSlice, performance.now() - slice);
          await yieldNow();
          if (gen !== this.gen) throw new Error("superseded by a newer loop generation");
          slice = performance.now();
          db.db.exec("BEGIN");
        }
      }
      db.db.exec("COMMIT");
    } catch (e) {
      try {
        db.db.exec("ROLLBACK");
      } catch {
        /* no open transaction */
      }
      throw e;
    }
    return Math.max(maxSlice, performance.now() - slice);
  }

  private async persistPipeline(o: PipelineOutput, gen: number) {
    const t0 = performance.now();
    const now = Date.now();
    const db = this.db;
    const TABLES = ["results", "lastn", "tapes"] as const;
    db.shadowCreate(TABLES);
    const ins = `INSERT OR REPLACE INTO results_next (id, stage, bot, ind, tp, sl, trail, hold, n, pf, net, wr, mdd, ddt, gh, tph, is_n, is_pf, is_net, score,
        rank, armed, best_n, oos_n, oos_pf, oos_net, oos_ddt, lastn_ok, eval_pass, eval_ok, by_sym, at) VALUES (${Array(32).fill("?").join(",")})`;
    const lnIns =
      "INSERT OR REPLACE INTO lastn_next (cfg, n, part, taken, pf, net, ddt, score) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
    const evIns =
      "INSERT INTO evals (cfg, at, win, n, pf, net, ddt, wr, pass) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
    const tpIns =
      "INSERT OR REPLACE INTO tapes_next (cfg, sym, side, entry_t, exit_t, entry, exit, r, reason, bars) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    const rankedById = new Map(o.ranked.map((k) => [k.id, k]));
    const s2Ids = new Set(o.s2.map((r) => r.id));
    function* rows(): Generator<[string, Array<string | number | null>]> {
      for (const r of o.s1) {
        // a Base row whose id was refined in Main is represented by the Main row
        if (s2Ids.has(r.id)) continue;
        yield [
          ins,
          [
            r.id,
            1,
            r.bot,
            r.ind,
            r.protect.tp,
            r.protect.sl,
            r.protect.trail,
            r.protect.hold,
            r.full.n,
            r.full.pf,
            r.full.net,
            r.full.wr,
            r.full.mdd,
            r.full.ddt,
            r.full.gh,
            r.full.tph,
            r.is.n,
            r.is.pf,
            r.is.net,
            r.score,
            null,
            0,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            JSON.stringify(r.bySym),
            now,
          ],
        ];
      }
      for (const r of o.s2) {
        const k = rankedById.get(r.id);
        yield [
          ins,
          [
            r.id,
            k ? 3 : 2,
            r.bot,
            r.ind,
            r.protect.tp,
            r.protect.sl,
            r.protect.trail,
            r.protect.hold,
            r.full.n,
            r.full.pf,
            r.full.net,
            r.full.wr,
            r.full.mdd,
            r.full.ddt,
            r.full.gh,
            r.full.tph,
            r.is.n,
            r.is.pf,
            r.is.net,
            r.score,
            k?.rank ?? null,
            k?.armed ? 1 : 0,
            k?.lastN?.bestN ?? null,
            k?.lastN?.oos.n ?? null,
            k?.lastN?.oos.pf ?? null,
            k?.lastN?.oos.net ?? null,
            k?.lastN?.oos.ddt ?? null,
            k?.lastN ? (k.lastN.success ? 1 : 0) : null,
            k?.evalRes?.passRatio ?? null,
            k?.evalRes ? (k.evalRes.success ? 1 : 0) : null,
            JSON.stringify(o.runs.get(r.id)?.bySym ?? {}),
            now,
          ],
        ];
      }
      for (const k of o.ranked) {
        if (k.lastN) {
          for (const r of k.lastN.rows)
            yield [lnIns, [k.id, r.n, "is", r.taken, r.pf, r.net, r.ddt, r.score]];
          for (const r of k.lastN.oosRows)
            yield [lnIns, [k.id, r.n, "oos", r.taken, r.pf, r.net, r.ddt, r.score]];
          yield [
            lnIns,
            [
              k.id,
              0,
              "is",
              k.lastN.baseline.is.n,
              k.lastN.baseline.is.pf,
              k.lastN.baseline.is.net,
              k.lastN.baseline.is.ddt,
              0,
            ],
          ];
          yield [
            lnIns,
            [
              k.id,
              0,
              "oos",
              k.lastN.baseline.oos.n,
              k.lastN.baseline.oos.pf,
              k.lastN.baseline.oos.net,
              k.lastN.baseline.oos.ddt,
              0,
            ],
          ];
        }
        for (const t of o.tapes.get(k.id) ?? [])
          yield [
            tpIns,
            [t.cfg, t.sym, t.side, t.entryT, t.exitT, t.entry, t.exit, t.r, t.reason, t.bars],
          ];
      }
    }
    const maxSlice = await this.writeChunked(rows(), gen);
    const ts = performance.now();
    db.shadowSwap(TABLES);
    // evals are a history table: written in one small transaction after the swap (a superseded compute
    // never leaves partial rows); a recompute of the same instant replaces its rows
    db.tx(() => {
      db.run("DELETE FROM evals WHERE at = ?", o.universe.nowT);
      for (const k of o.ranked) {
        if (!k.evalRes) continue;
        for (const w of k.evalRes.windows)
          db.run(
            evIns,
            k.id,
            o.universe.nowT,
            w.key,
            w.n,
            w.pf,
            w.net,
            w.ddt,
            w.wr,
            w.pass ? 1 : 0,
          );
      }
    });
    db.kvSet("pipeline", {
      at: o.at,
      universe: o.universe,
      timings: o.timings,
      armed: o.armed,
      s1: o.s1.length,
      s2: o.s2.length,
      ranked: o.ranked.length,
      portfolio: {
        members: o.portfolio.members,
        guardPct: o.portfolio.guardPct,
        is: o.portfolio.is,
        oos: o.portfolio.oos,
        full: o.portfolio.full,
        hourly: o.portfolio.hourly,
      },
    });
    this.status.phases.Persist = {
      ms: performance.now() - t0,
      maxSliceMs: Math.max(maxSlice, performance.now() - ts),
    };
  }

  private persistSim(r: WalkForwardResult) {
    this.db.run(
      "INSERT INTO sim_runs (at, start_t, end_t, n, pf, net, gh, tph, ddt, stable, opts, blocks, hourly) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      Date.now(),
      r.startT,
      r.endT,
      r.stats.n,
      r.stats.pf,
      r.stats.net,
      r.stats.gh,
      r.stats.tph,
      r.stats.ddt,
      r.stable ? 1 : 0,
      JSON.stringify(r.opts),
      JSON.stringify(r.blocks),
      JSON.stringify(r.hourly),
    );
  }

  // ── paper ─────────────────────────────────────────────────────────────
  /** Current-hour selection from the pre-historic window; open positions of the selected configs are the paper book. */
  private stepPaper() {
    if (!this.tapes.length || !this.sim) return;
    const nowT = Math.floor(Date.now() / H) * H;
    const t = Math.min(nowT, this.sim.endT);
    const held = new Set(this.sim.steps[this.sim.steps.length - 1]?.real ?? []);
    const { picks, eligible } =
      this.wf.mode === "durable"
        ? selectDurable(this.tapes, t, this.wf, held)
        : selectAt(this.tapes, t, this.wf);
    const sel = new Set(picks.map((p) => p.id));
    const positions: OpenPosition[] = [];
    const perSym = new Map<string, number>();
    for (const tp of this.tapes) {
      if (!sel.has(tp.id)) continue;
      for (const op of tp.open) {
        const c = perSym.get(op.sym) ?? 0;
        if (c >= this.wf.maxPerSymbol || positions.length >= this.wf.maxOpen) continue;
        perSym.set(op.sym, c + 1);
        positions.push(op);
      }
    }
    const since = this.paper.startedAt - this.wf.simH * H;
    const trades = this.sim.trades.filter((t) => t.exitT >= since);
    const notional = this.settings.paperNotional;
    const db = this.db;
    db.tx(() => {
      db.run("DELETE FROM paper_positions");
      for (const p of positions) {
        db.run(
          "INSERT OR REPLACE INTO paper_positions (cfg, sym, side, entry_t, entry, stop, target, mtm, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          p.cfg,
          p.sym,
          p.side,
          p.entryT,
          p.entry,
          p.stop,
          p.target,
          p.mtm,
          Date.now(),
        );
      }
      for (const t of trades) {
        db.run(
          "INSERT OR IGNORE INTO paper_trades (cfg, sym, side, entry_t, exit_t, entry, exit, r, pnl, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          t.cfg,
          t.sym,
          t.side,
          t.entryT,
          t.exitT,
          t.entry,
          t.exit,
          t.r,
          t.r * notional,
          t.reason,
        );
      }
    });
    this.paper = {
      selected: [...sel],
      eligible,
      positions,
      trades,
      equity:
        trades.reduce((a, t) => a + t.r * notional, 0) +
        positions.reduce((a, p) => a + p.mtm * notional, 0),
      startedAt: this.paper.startedAt,
    };
  }

  /**
   * Entries due NOW: signals of the selected configs on the newest closed bar (they enter at the next open).
   * These are what the live adapter may mirror.
   */
  pendingEntries(): LiveIntent[] {
    const sel = new Set(this.paper.selected);
    const out: LiveIntent[] = [];
    for (const tp of this.tapes) {
      if (!sel.has(tp.id)) continue;
      for (const p of tp.pending) {
        // the bar the signal was decided on is the symbol's own newest bar (a lagging symbol is dropped by the planner)
        const barT = this.candles.get(p.sym)?.at(-1)?.t ?? 0;
        out.push({ cfg: tp.id, sym: p.sym, side: p.side, protect: tp.protect, barT });
      }
    }
    return out;
  }
}

export interface LiveIntent {
  cfg: string;
  sym: string;
  side: 1 | -1;
  protect: Protect;
  barT: number;
}

/** The walk-forward knobs that are user settings (grids, toggles and gates come from CoreSettings). */
export const WF_KEYS = [
  "preH",
  "simH",
  "stepH",
  "portfolio",
  "lastN",
  "lastNMinPf",
  "maxPerSymbol",
  "maxPerSide",
  "maxOpen",
  "guardPct",
  "longH",
  "robustFrac",
  "rank",
  "bots",
  "preGate",
  "mode",
  "durableSplits",
  "durableFrac",
] as const;
/** Range-checked walk-forward patch (unknown keys dropped, numbers clamped). */
export function sanitizeWf(o: Partial<WalkForwardOptions>): Partial<WalkForwardOptions> {
  const p = pickWf(o) as Record<string, unknown>;
  const num = (k: string, lo: number, hi: number, int = false) => {
    if (p[k] === undefined) return;
    const v = Number(p[k]);
    if (!Number.isFinite(v)) throw new Error(`${k} must be a number`);
    p[k] = Math.min(hi, Math.max(lo, int ? Math.round(v) : v));
  };
  num("preH", 1, 240);
  num("simH", 6, 240);
  num("stepH", 1 / 60, 48); // re-evaluation down to 1 minute (BingX has no sub-minute history)
  num("portfolio", 1, 60, true);
  num("lastN", 0, 200, true);
  num("lastNMinPf", 0, 5);
  num("maxPerSymbol", 1, 20, true);
  num("maxPerSide", 1, 400, true);
  num("maxOpen", 1, 1000, true);
  num("guardPct", 0, 100);
  num("longH", 24, 1440);
  num("robustFrac", 0, 1);
  num("durableSplits", 2, 12, true);
  num("durableFrac", 0, 1);
  if (p.rank !== undefined && !["lcb", "score", "net"].includes(String(p.rank))) delete p.rank;
  if (p.mode !== undefined && !["hourly", "durable"].includes(String(p.mode))) delete p.mode;
  if (p.preGate !== undefined) p.preGate = Boolean(p.preGate);
  if (p.bots !== undefined)
    p.bots = Array.isArray(p.bots) ? (p.bots as unknown[]).map(String).slice(0, 20) : [];
  return p as Partial<WalkForwardOptions>;
}

function pickWf(o: Partial<WalkForwardOptions>): Partial<WalkForwardOptions> {
  const out: Record<string, unknown> = {};
  for (const k of WF_KEYS) if (o[k] !== undefined) out[k] = o[k];
  return out as Partial<WalkForwardOptions>;
}

export interface MarketFeed {
  tickers: typeof fetchTickers;
  history: typeof fetchHistory;
  klines: typeof fetchKlines;
}

/** Run `fn` over items with at most `limit` in flight. */
async function mapLimit<T>(items: readonly T[], limit: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  });
  await Promise.all(workers);
}

function mergeSettings(
  base: CoreSettings,
  ...patches: Array<Partial<CoreSettings> | undefined>
): CoreSettings {
  let out = {
    ...base,
    gates: { ...base.gates },
    live: { ...base.live },
    toggles: { ...base.toggles },
    block: { ...base.block },
    dca: { ...base.dca },
    grid: { ...base.grid },
  };
  for (const p of patches) {
    if (!p) continue;
    out = {
      ...out,
      ...p,
      gates: { ...out.gates, ...(p.gates ?? {}) },
      live: { ...out.live, ...(p.live ?? {}) },
      toggles: { ...out.toggles, ...(p.toggles ?? {}) },
      block: { ...out.block, ...(p.block ?? {}) },
      dca: { ...out.dca, ...(p.dca ?? {}) },
      grid: { ...out.grid, ...(p.grid ?? {}) },
    };
  }
  return out;
}

const G = globalThis as unknown as { __ctsCoreRuntime?: CoreRuntime };
export function coreRuntime(): CoreRuntime {
  if (!G.__ctsCoreRuntime) {
    const rt = new CoreRuntime();
    rt.onLive = async (r, intents, gen) => {
      const { stepLive } = await import("./live.server.ts");
      await stepLive(r, intents, gen);
    };
    G.__ctsCoreRuntime = rt;
  }
  G.__ctsCoreRuntime.ensureAlive();
  return G.__ctsCoreRuntime;
}
