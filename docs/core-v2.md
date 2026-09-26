# CTS-A Core v2

A clean, layered recreation of the desk engine that lives **beside** the existing desk (the live x01 lane is
untouched). UI at `/v2`. Everything here is honest by construction:

- signals are decided on a bar **close** and entered at the **next open** (no look-ahead, tested for every
  indication and bot by prefix-stability tests);
- exits are pessimistic inside a bar (stop before target; no target on a bar where a DCA leg filled);
- every close pays the **0.2 % round-trip position cost** (0.1 % per side × 2);
- PF neutral is **1.00**; the default minimum is **1.10** (one position cost of margin above neutral).

## Stages: Base → Main → Real → Live

| Stage | What it does | Where |
|---|---|---|
| **Base** | Every indication (10 kinds, 40 configs) × bot type (8 fade bots + `follow`) = 377 combos; plus independent strategy tapes for every protect variant × sub-strategy (normal, trailing, DCA, DCA Active). Default grid: TP 1.8/2.6/3.5/5 % × SL 1/1.5/2/2.5 × TP × trail 0/0.25/0.4 × TP (min trail 0.6 %, min SL 1 %) × hold 3h/8h ≈ 37,700 tapes. Always computed, whatever the toggles. Tapes are compact typed-array columns. | `src/core/sim/walkforward.ts` `buildTapesGen`, `src/core/pipeline/pipeline.ts` |
| **Main** | Long-window gates: n ≥ min trades, PF ≥ min, net > 0, DDT limit; parameter robustness. Selection only uses trades closed **before** the decision time. | `selectAt`, `selectDurable` |
| **Real** | Durable winners (default): positive in ≥ 75 % of 4 sub-windows of the last 14 days and PF ≥ 1.1 overall; still working in the **20 h pre-historic window** (PF ≥ 1.0); once held, kept while the 14-day PF stays ≥ 1.0. Entries go through last-N (12, PF ≥ 1.0), Block levels, per-symbol / per-side / total caps and the hour guard; executed on paper every hour. | `walkForward`, `execDecision` |
| **Live** | Off by default. Needs Settings → Live enabled **and** `CTS_CORE_LIVE=1` on the host **and** API keys **and** a rolling simulated run with PF ≥ min and stable. Uses its own `CTSB{X1,V1,V2}_` client-order tags, never touches CTSA or foreign tickets, skips any symbol with foreign positions/orders. | `src/core/server/live.ts`, `live.server.ts` |

### Sub-strategies (toggles filter execution only)

| Toggle | Meaning |
|---|---|
| Normal | plain positions. Off ⇒ plain entries execute only when Block-adjusted (level ≥ 1). |
| Trailing | trailing-stop protect variants. |
| Block | last-n windows n = 1..6 of the config's own closes are checked independently; level = passing windows; volume = 1 + 0.2 · level (cap 2.5×). |
| Block Active | executes only level ≥ 1 (skips the normal / lower level). |
| DCA | extra legs at 0.8 % steps (2 levels); target re-anchored to the average; stop anchored beyond the deepest level. |
| DCA Active | skips the base leg; a limit at the first level waits up to the hold time; only that higher-level fill is traded. |

## Runtime

- In-memory SQLite (`node:sqlite`, `:memory:`) — tables: candles, symbols, results, lastn, evals, tapes,
  sim_runs, paper_trades, paper_positions, live_orders, events, runs, kv. Optional snapshot with
  `CTS_CORE_SNAPSHOT=/path/core.sqlite` (VACUUM INTO every 10 min, restored on boot).
- Continuous loop (20 s): pull newly closed BingX bars (public API, no keys; synthetic fallback), on a new
  bar run Base → Main → Real, a 48 h simulated run with 20 h pre-calc, every preset on the same tapes, the
  paper book and the Live stage. Heavy work is time-sliced (yields every 12 ms); a watchdog restarts a
  stale loop.
- A compute over 40 symbols × 18 days of 15 m bars takes ~30–60 s.

## UI (`/v2`)

Overview · Base → Live · Configs · Bot × Indication (arc diagram + heat grid) · Hour by hour · Compare
presets · Paper & Live · Market · Engine · Settings. Four designs (Studio light, Graphite dark, Terminal
mono, Aurora deep) × two densities (comfortable, compact small-text). Charts are light SVG: multi-arc
gauges, radial hour wedges, arc share, equity with shaded drawdown time, signed hour bars, N-curves.

## Commands

```bash
npm run test:core                                  # 38 tests (also part of npm test)
npm run core:run -- --symbols 40 --days 7          # full pipeline report on real BingX history
npm run core:compare -- --cache candles.json       # every preset over repeated 2-day walk-forward runs
npm run core:sweep -- --cache candles.json         # last-N × N-eval PF × SL ratio × trailing sweep
npm run core:hourly -- --cache candles.json --out docs/core-hourly   # hour-by-hour report, all presets
```

## Results on real data (40 symbols, BingX perpetuals, 30 days to 2026-09-26, 15 m, 0.2 % cost)

**Edge before cost is tiny.** Per trade gross (before the 0.2 %): trend-following entries −0.09…+0.06 %,
fade bots mostly ±0.06 %; only magnet / snap / pulse fades reach +0.16…+0.20 %. High-frequency entries
therefore lose mainly to cost: more orders ≠ more profit. 5 m bars: 5 % of training winners held up out of
sample (noise). 15 m with wide targets (TP 3.5–5 %) was the only setting with durable winners.

**Walk-forward, 7 separate 2-day runs, 20 h pre-calc before every hour** (days 15–29):

| Preset | Hourly re-selection PF | Durable 14 d PF | Durable runs positive | Orders/day |
|---|---:|---:|---:|---:|
| Normal only | 0.69 | 0.82 | 3/7 | 74 |
| Trailing only | 0.58 | 0.84 | 2/7 | 82 |
| Block | 0.71 | 0.85 | 2/7 | 79 |
| Block Active | 0.71 | 0.88 | 2/7 | 77 |
| DCA | 0.77 | 0.86 | 2/7 | 65 |
| DCA Active | 0.78 | 0.99 | 4/7 | 72 |
| **Block Active + DCA Active** (default) | 0.69 | **1.08** | **5/7** | **82** |

Parameter sweep (≈ 300 combos: last-N 0/5/8/12/20/30 × N-eval PF 1.0/1.1 × SL 1/1.5/2/2.5 × TP ×
trailing 0/0.25/0.4 × TP) under hourly re-selection: best PF 0.93 (SL 2.5 × TP, trail 0.4 × TP, last-N 8,
PF ≥ 1.1). SL ratios 2–2.5 and trailing helped; no combination reached PF 1.

Latest 48 h (2026-09-24 12h → 09-26 12h), durable mode: see `docs/core-hourly.md` — line-by-line hours
for every preset (orders, wins, PF, net, cumulative, per sub-strategy, Block level, DCA legs, skips).

### Honest status

- The durable default is the first setting that is positive over the tested out-of-sample period
  (PF 1.08, +220 % summed per-trade net, 5/7 runs green) but it is **below the 1.10 floor and not stable
  hour by hour** (≈ 55 % green hours; worst hour −59 %). It was chosen from ~36 compared options, so part of
  it may be selection luck.
- "Every hour positive with a high order count" was **not** achieved: with 0.2 % cost the measured
  signals do not carry enough edge, and hours with many concurrent positions are correlated (one market
  move stops many positions at once).
- Therefore the Live stage stays off and additionally refuses to trade until the rolling simulated run is
  PF ≥ min and stable.

### Next levers

More history (60–90 days) for the 14-day durable window; maker-fee execution (limit entries cut cost);
correlation-aware caps (net exposure per side); new signal families with gross edge > 0.3 %/trade.
