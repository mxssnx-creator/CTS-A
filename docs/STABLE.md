# Stable — 12h geometric, 2026-09-28

Marked preset: `stable-12h-0928`. Git tag `stable` points at this commit. Later coordinations start here. Do not turn Trailing or DCA back on unless a new tape beats this one on equity and on Axis and Block versus Normal.

Reference check:

```bash
npm run test:stable
```

That file is [src/lib/desk/stable-regression.test.ts](../src/lib/desk/stable-regression.test.ts). The preset lock fails if the id, the hybrid/geometric cell, or the toggles move. The older DCA add checks stay in the file only as a mechanism test. They are not the live book.

Machine copy: [stable-12h-0928.json](stable-12h-0928.json). Builtin list: [src/lib/desk/presets.ts](../src/lib/desk/presets.ts).

## Measured tape

12 hours, 12 symbols, complete open tape, prehours 0, limit orders, start equity $10, cost step 3. Tactic hybrid, range geometric. Normal, Axis, Block, and Trailing are on. DCA is off. Trailing does not move the stop until 78% of the short target is open. Trend and Break use the wider 1.8 / 2.2 / 2.6 trails and may arm a little earlier. A stop that is already in profit is not pulled back out by the TP/SL ratio.

| | |
|---|---|
| Equity | $10.00 → $11.31 |
| PF | 1.285 |
| Hours green | 12 / 12 |
| Max drawdown | 13.38% |
| Trades | 476051 |
| Normal | PF 1.177, n=121929 |
| Axis | PF 2.042, n=14413 |
| Block / Overall | PF 2.056, n=14416 |

Every indication on this cell finished above 1.13. None are skipped on x01.

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

Hour PF, equity from $10: h1 1.239 / 9.36, h2 1.099 / 10.01, h3 1.260 / 10.13, h4 1.831 / 10.47, h5 1.657 / 10.50, h6 1.224 / 10.60, h7 1.088 / 10.42, h8 1.309 / 10.70, h9 1.080 / 10.84, h10 1.090 / 11.02, h11 1.523 / 10.94, h12 1.965 / 11.31. Hour 1 is green on the hour PF and dips only on open marks.

## Config to recreate

Short cell:

- `tpAtr` 0.48, `slOfTp` 0.75, `slAtr` 0.36, `tpRatio` 1/0.75
- `shortRange` true, `trailingPct` 1.5, `maxHoldTicks` 8, `maxHoldBars` 3
- `axisLevels` 5, `axisSpacing` 0.7, `dcaCount` 1 (toggle off, so it does not add)

Block:

- counts `[1, 3, 4, 5, 6]`, max multiple 6
- volume 0.4, relation 0.4, shared 1.5, overall 1.5, max multiplier 8
- parallel shared and parallel overall
- book, symbol, direction, indication, and type layers on
- adds only while hour, bank, and lane-cool agree. Counts above 1 wait for window PF 1.30 (first count 1.45). Size is 0.4× until that window is proven, 0.7× from 1.35, full from 1.8
- overlay banks at 0.62 of the target and at least 3.2× the cut. It does not scratch at the mark. A winning peel can re-enter through win-again

Toggles: `normal` true, `axis` true, `block` true, `trailing` true, `dca` false.

Live x01 runs hybrid, trailing, and axis on geometric. Other ranges and the long protect grid are not armed. A processing replaces a stable cell on the site only after 4 closes with PF at least 1. A worse sample is not shown and is not the seed.

Volume factor 1 means twice the exchange minimum (the old 0.5 setting was lifted to the same minimum, so it did not change size). A confirming volume factor can scale that up to 1.5×. It cannot go under the exchange minimum.

## Replay

```bash
node --experimental-strip-types scripts/sim-12x12.mjs
```

That script is the 12×12 open tape this preset was taken from.

## What stays off

- DCA. The DCA-on 12h book dipped under $10 and is not this mark.
- Any range other than geometric, until a later tape beats this equity and keeps Axis and Block above Normal.

Trailing is on. It is the 1.5 giveback for the book, and the higher 1.8–2.6 set for Trend and Break. It waits until most of the target is open, then locks. It does not replace Hybrid.
