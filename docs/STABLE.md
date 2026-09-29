# Stable — live breakpoint, 2026-09-29

This tree is the restore point. Git tags `stable` and `breakpoint-0929` point here. The tape cell underneath is still `stable-12h-0928` (geometric short 0.48/0.75). Repair the live book from this breakpoint, not from an older tag.

Machine copy: [breakpoints/stable-0929.json](breakpoints/stable-0929.json).

```bash
npm run test:stable
```

`test:stable` runs the coordination cell and [src/lib/desk/stable-book.regression.test.ts](../src/lib/desk/stable-book.regression.test.ts). That file locks the 100-signal cap, unlimited orders, the control pins, and bots staying off.

## Live book

| Rule | Value |
|---|---|
| Connection | BingX x01 mainnet, 50 symbols, limit |
| Cost / min PF / max DDT | 18 USDT, 1.15, 14h |
| Signal cap | 100, one per symbol+direction. Long and short both count. Duplicate rows of the same side stay one signal. |
| Orders | Unlimited. Each partial counts. Internal position rows count as orders, not as extra signals. |
| Controls | Trigger-rate limit pauses stops only. At most 2 protects per cycle. One trail, and only when the gap is 0. |
| Entries | At most 8 new orders per cycle. |
| Desk connection | The chosen session stays. The host poll does not put it back. |
| Bots | Off. Sandwich, clamp, and pivot do not arm on open. |

The 09-28 coordination note below is the cell this book still trades. Do not treat it as a newer breakpoint.

# Stable — coordination mark, 2026-09-28


This commit is the version later coordinations repair from. Preset id: `stable-12h-0928`. Git tag `stable` points here. Live x01 runs this cell. Do not turn DCA on, and do not leave this geometric short cell, unless a new tape beats it on equity and keeps Axis and Block above Normal.

Reference check:

```bash
npm run test:stable
```

The lock is [src/lib/desk/stable-regression.test.ts](../src/lib/desk/stable-regression.test.ts). It fails if the preset id, the hybrid/geometric short cell, the toggles, or the five coordination switches move. The DCA cases in that file only check the add mechanism when the toggle is on. They are not the live book.

Machine copy: [stable-12h-0928.json](stable-12h-0928.json). Builtin list: [src/lib/desk/presets.ts](../src/lib/desk/presets.ts). Live session: [scripts/cts-a-vst-session.mjs](../scripts/cts-a-vst-session.mjs).

## What is on

| Switch | State |
|---|---|
| Normal | on |
| Trailing | on |
| Axis | on |
| Block | on |
| DCA | off |
| Hour keep | on |
| Bank win | on |
| Pair add | on |
| Lane cool | on |
| Win again | on |

Live tactics are hybrid, trailing, and axis. Range is geometric only. Connection is BingX x01, 50 live symbols, hedge, cross, max leverage. Limit orders. Cost step on the measured tapes is 3. No indication is skipped.

## Short cell

- `tpAtr` 0.48, `slOfTp` 0.75, `slAtr` 0.36, `tpRatio` 1/0.75
- `shortRange` true
- `trailingPct` 1.5 for the book
- Trend and Break use 1.8, then 2.2, then 2.6
- `maxHoldTicks` 8, `maxHoldBars` 3
- `axisLevels` 5, `axisSpacing` 0.7, `axisPartialRatio` 3
- `dcaCount` 1 is stored and does nothing, because the DCA toggle is off

Trailing does not move the stop until 78% of the short target is open (70% for the wider Trend/Break trails). A stop that is already in profit is not pulled back through entry by the TP/SL ratio.

Volume factor 1 is twice the exchange minimum. The old 0.5 setting was lifted onto that same minimum, so it did not change size. A confirming factor can scale up to 1.5×. It cannot go under the exchange minimum.

## Block factors

Counts `[1, 3, 4, 5, 6]`, max multiple 6, min multiple 1, min active level 1, pause count 0. Windows, stack, and sets are on. Sides are both.

| Factor | Value |
|---|---|
| Relation volume | 0.4 |
| Shared volume | 1.5 |
| Overall volume | 1.5 |
| Max volume multiplier | 8 |
| Shared mode | parallel |
| Overall mode | parallel |

Layers that size on their own: book, symbol, direction, indication, type.

Size while a window is still proving, on a complete tape or on live:

| Window PF | Size |
|---|---|
| not yet proven | 0.4× the ratio above |
| at least 1.35 | 0.7× |
| at least 1.8 | full ratio |

Count 1 may add while the window is still filling. Counts above 1 wait until that window is at least PF 1.30. The first count, once it has a full window, needs PF 1.45.

The overlay does not scratch at the mark. It banks when the favorable move reaches 0.62 of the parent target, and that bank is at least 3.2× the cut. The cut is 0.20 of the parent stop distance. A winning peel may open one more order through win-again (at most 4 per symbol, side, indication, and tactic in an hour).

## Coordinations

All five are on in the preset (`pfCoords`). A missing coord map still keeps hour-keep. The others run only when their switch is on.

| Coord | What it does on this mark |
|---|---|
| Hour keep | A Block add is refused when the Block hour already has samples and its PF is under 1.08. A loss that would push the hour net negative, or the hour PF under 1.08, is scratched flat instead of booked. |
| Bank win | A Block add needs the parent at least 20% of the way to the target (and at least 0.04%). A parent that has already traveled and then given back locks a stop just past cost. |
| Lane cool | Two losses on the same symbol, indication, and tactic in the hour stop further Block adds there. |
| Pair add | The first rung of a live or complete-tape entry can add a second indication on the same symbol and side. |
| Win again | After a winning Block peel, one re-entry is queued. The hour cap is 4. |

Pair, bank, cool, again, and scratch all fired on the coordination check below. Later work should keep these five paths live. Do not bypass them to force more adds.

## Coordination check

Same cell, after the Block gate. 2 hours, 4 symbols, complete open tape, prehours 0, limit, equity $10, cost step 3. Hybrid, geometric, trailing on, DCA off.

| | |
|---|---|
| Equity | $10.00 → $10.14 |
| Book PF | 2.034 |
| Hours | 2 / 2 green (2.341, then 2.034) |
| Closes | 91813 |
| Normal | PF 1.664, n=36241 |
| Axis | PF 5.129, n=3876 |
| Block | PF 5.153, n=3882 |

Coordination hits on that run: pair 12, bank 2720, lane-cool 196, win-again 97, hour scratch 47814.

Axis and Block stay far above Normal. That is the relation later coordinations have to keep.

## Indication census

This table is the earlier 12×12 open tape on the same short cell, before the Block gate. It is the indication census, not the coordination-check book. Every indication finished above 1.13, which is why none are skipped.

| Indication | n | PF |
|---|---|---|
| trend | 18783 | 1.499 |
| sar | 9058 | 1.442 |
| break | 15202 | 1.363 |
| direction | 17627 | 1.334 |
| ema | 20334 | 1.275 |
| move | 6295 | 1.235 |
| macd | 21369 | 1.234 |
| bollinger | 13106 | 1.195 |
| active | 17220 | 1.153 |
| rsi | 11723 | 1.132 |

That 12×12 run ended at equity $11.31, book PF 1.285, max drawdown 13.38%, 476051 trades, all 12 hours green. Normal was 1.177, Axis 2.042, Block 2.056. The gate above is what lifted Block and Axis on the later check.

## Replay

12×12 cell:

```bash
node --experimental-strip-types scripts/sim-12x12.mjs
```

The coordination check is `simulateHours(2, CFG, "hybrid")` with 4 symbols, `complete: true`, `prehours: 0`, `rangeType: "geometric"`, and the toggles and block config in this file.

## What stays off

- DCA. An earlier DCA-on tape dipped under $10.
- Any range other than geometric, until a later tape beats this equity and keeps Axis and Block above Normal.
- Skipping direction, MACD, or Bollinger. On this cell they are above 1.19.

The site shows a processing only after 4 closes at PF 1 or better. A worse sample does not replace the seed.
