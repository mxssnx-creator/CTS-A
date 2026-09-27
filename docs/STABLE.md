# Stable

Preset `stable-dca-0927` is the version to repair from. Git tag `stable` points at this commit.

Reference check:

```bash
npm run test:stable
```

That file is [src/lib/desk/stable-regression.test.ts](../src/lib/desk/stable-regression.test.ts). It fails if any of these slip:

- After the base exam, a set with no passing last-N does not execute.
- The higher profit-factor indication and tactic are armed first.
- DCA adds inside the stop and does not add once most of the stop is used.
- Volume does not get a DCA add. ATR, linear, geometric, and Fibonacci do.
- A 1h complete tape, 8 symbols, from $10, stays at PF ≥ 1.15, DCA PF ≥ 1.15, equity ≥ $10, no ratio violations, and placed orders match the ledger.

Measured reference (2h after 1h pre, 8 symbols, ATR, drawdown tune 0.6, 3 adds):

- Overall PF 1.241, equity $10.003, 362 trades
- DCA 168 closes, PF 1.253
- Linear DCA PF 1.155, geometric 1.190, Fibonacci 1.205
- Volume DCA stayed under 1 and is off

Live x01 runs this on 50 symbols. Normal, Trailing, Axis, Block, and DCA are on. The base exam finishes before live orders.
