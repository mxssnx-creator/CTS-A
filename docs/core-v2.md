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
| **Base** | Every indication (10 kinds, 98 configs) × bot type (8 fade bots + `follow` + `revert`) = 988 combos; plus independent strategy tapes for every protect variant × sub-strategy (normal, trailing, DCA, DCA Active). Default grid: TP 1.8/2.6/3.5/5 % × SL 1/1.5/2/2.5 × TP × trail 0/0.25/0.4 × TP (min trail 0.6 %, min SL 1 %) × hold 3h/8h ≈ 37,700 tapes. Always computed, whatever the toggles. Tapes are compact typed-array columns. | `src/core/sim/walkforward.ts` `buildTapesGen`, `src/core/pipeline/pipeline.ts` |
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
- Starts with the server (`vite dev` plugin `cts-a:core-v2-boot`; `CTS_CORE_AUTOSTART=0` disables) and runs
  without any viewer. Loop every 20 s: pull newly closed BingX bars (public API, no keys; 4–6 requests in
  flight), on a new bar run Base → Main → Real, a 48 h simulated run with 20 h pre-calc, every preset on the
  same tapes, the paper book and the Live stage.
- Base covers all 988 combos (98 indications × 8 fade bots + follow + revert); Main expands the top 140 Base
  combos (`mainTop`) into every protect variant × sub-strategy. A compute over 40 symbols × 18 days of 15 m bars
  takes ~11–14 s with the event loop never blocked for more than ~80 ms.

## Reliability audit (all verified by tests)

| Area | Behaviour | Evidence |
|---|---|---|
| Event loop | every heavy stage is a generator driven in 12 ms slices; persistence is chunked | worst stall 1,666 ms → ≤ 77 ms; per-phase max slice ≤ 53 ms (Engine page shows it live) |
| Memory | compact typed-array tapes, one buffer per tape; Main pre-screen | RSS 2.4 GB → 0.8 GB |
| Consistent reads | results / lastn / tapes written to shadow tables and swapped atomically | a viewer never sees half-written tables |
| Races | loop generation token: an abandoned cycle never publishes; settings snapshot per compute; universe reset applied at the next cycle | `runtime.test.ts` (stop mid-compute, settings mid-compute, resync while busy, watchdog) |
| Stop | aborts the running compute at its next slice | `stop during a compute` test |
| Self-healing | 30 s healer independent of viewers: stale loop → new generation; lost timer → reschedule; synthetic fallback → back to BingX when reachable; symbols > 300 bars behind → re-backfilled; failing cycles back off 5 s…10 min and recover | `heal.test.ts` |
| Settings | validated server-side (ranges, lists, grid size ≤ 240, walk-forward knobs clamped); UI shows unsaved / applying / applied in compute #n | e2e |
| Live path | module mutex, 10 s request timeouts, `pending` row before send (no duplicate on retry), generation check per order, size never above the notional cap, fresh price for SL/TP, market close if protection fails, orphan own orders cancelled, stale-symbol signals dropped, own `CTSB` tags only | `live.test.ts` |
| UI | one request in flight per view, stale responses dropped, backoff on errors, paused while hidden, debounced filters, confirm dialogs (Live, Stop, Resync, Discard), hydration-safe mobile menu | 22-check Playwright e2e, twice, also while computing (p95 ≤ 280 ms) |

An independent code review found 11 issues (live duplicates on hang, unvalidated walk-forward settings that
could loop forever, stale-symbol re-entry, unsorted portfolio tape, unprotected positions, stale SL/TP prices,
size cap, orphan orders, mid-backfill timeframe change, watchdog vs backoff, in-sample split leak, UI
refresh race); all are fixed. Remaining known limitation: the control endpoints have no authentication
(same as the existing desk) — Live additionally requires `CTS_CORE_LIVE=1` on the host.

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

## Results on real data (0.2 % round-trip cost)

**Edge before cost is tiny.** Per trade gross: trend-following entries −0.09…+0.06 %, fade bots mostly
±0.06 %; only magnet / snap / pulse fades reach +0.16…+0.20 %. More orders mainly add cost.

**90 days, complete and causal** (`docs/core-longrun.md`): 40 symbols, 15 m, 37 separate 2-day runs
(2026-07-13 → 09-25), Base scored only on the lookback before each block, Main = top 140 × every protect ×
sub-strategy, durable selection, 20 h pre-calc:

| Preset | PF | Runs positive | Orders/day | Green hours | Worst hour |
|---|---:|---:|---:|---:|---:|
| DCA Active | **0.92** | 13/37 | 34 | 50 % | −28 % |
| Block Active + DCA Active (default) | 0.89 | **19/37** | 34 | 52 % | −75 % |
| Normal only | 0.86 | 14/37 | 36 | 50 % | −74 % |
| Block Active | 0.86 | 15/37 | 33 | 50 % | −75 % |
| Normal + Trailing + Block | 0.84 | 12/37 | 35 | 50 % | −61 % |
| Trailing only | 0.82 | 12/37 | 36 | 53 % | −34 % |

Same test on 30 m and 1 h bars: PF 0.78–0.94 and 0.75–0.91 (DCA Active best in both).

Earlier, shorter tests (30 days) looked better — durable Block Active + DCA Active PF 1.08 over the last
15 days — but that did **not** hold over 90 days. Parameter sweeps (≈ 300 combos of last-N, N-eval PF, SL
1–2.5 × TP, trailing) never reached PF 1 either.

### Honest status

- No tested configuration is consistently profitable after the 0.2 % round-trip cost; "every hour
  positive with a high order count" is not achievable with these signal families on this data.
- The engine, the selection and the reports are built to show this truthfully and keep searching
  continuously; the Live stage stays off and refuses to trade unless the rolling simulated run is PF ≥ min
  (1.10) and stable.

### Indication research (one indication at a time, `docs/research-*.md`, `docs/oot-1h.md`)

- 98 indication configs (10 kinds, each extended with parameter families) × follow / **revert** (new: fade the
  onset) / magnet / pivot / sandwich, then the train leaders × a full protect grid (TP, SL 0.75–2.5 × TP, min SL,
  trail share, min trail), judged on an unseen second half.
- **1 m bars (hundreds of orders per hour): 0 of 8,820 configs survive**; pooled test PF 0.00 at TP 0.15 % up
  to 0.67 at TP 1.8 %. BingX has no sub-minute history, so 1 s "pre-historic" data does not exist; the
  finest re-evaluation offered is 1 minute (never finer than one bar).
- Min SL (0.3–1 %) and min trail distance (0.2–0.8 %) are **neutral** (identical pooled PF); trailing is
  slightly worse than none; wider TP and SL 2–2.5 × TP are better on 15 m. Defaults were set accordingly.
- 15 m: 105 / 8,820 survivors (≈ chance level). 1 h: `follow · break-atr-2` survived in 87 grid variants
  (median test PF 1.32) — but on the **9 months before the research window** it scored PF 0.98, full year
  PF 1.01 (8 / 13 green months, ~11 orders / day); `follow · ema-50-100` scored 0.72 there. The recent
  "survivors" were a trending regime, not a durable edge.

### Next levers

Maker (limit) execution to cut the cost; correlation-aware exposure per side; new signal families with a
gross edge > 0.3 % per trade; more history for the durable window.
