# Execution evidence repair — 7 November 2026

Parent: `d7dce30` on CTS-A main. This is an accounting and type-correctness repair, not a claim that the strategies now earn a specified PF.

## Defects fixed

- Parent and Block-overlay closes used hour/lane protection to replace a measured loss and its exit price with zero PnL at entry. Those rewrites and the parent cash-PnL clipping are removed. Recorded closes, return PF, loss streaks, hourly totals and downstream feedback retain the actual modeled fill economics and one cost deduction. Hour controls can still affect future Block additions.
- Combined Last-N scoring added a bonus to the strongest agreeing window's PF. It now reports that window's measured PF, sample count and net; agreement remains an admission condition.
- Absolute tiny-loss cutoffs could classify a losing return sample as no-loss. Shared PF arithmetic retains all finite nonzero losses, including tiny returns. Nonfinite or missing observations invalidate the current window instead of becoming a zero return or reviving older wins.
- Minimal-distance parameters now accept numeric inputs through their existing snapping rules. The exchange request contract includes the already consumed equity field. Stale test fixtures now use complete order/position/window types and matching strategy identities. The dependency lock was repaired so clean installation succeeds.
- Four builtin preset tapes are labeled `legacy-unverified`. Their old PF/100%-positive-hour figures are historical, not remeasured after the settlement repair. Existing account settings are unchanged.

## Verification

The five actual tick-loop settlement regressions fail on original main and pass on the patched code. They cover long and short parent losses with the hour switch on/off, and a losing Block partial while its parent remains held. Exit, net cash, net return, sample count and loss feedback reconcile independently against the cost functions.

`npm run test:stable` now includes those tests and the PF/Last-N evidence tests: 52 pass. Additional focused checks cover five Minimal-range cases and 16 feed/ownership tests. Typecheck and production build pass. The bounded Block/DCA checks are run with the two historical long simulation cases excluded; a full VST/combined run was cancelled and is not counted as a pass. No new market replay, exchange authentication, order submission or live deployment is claimed for CTS-A.

## Future maintenance

Run `npm run test:stable`, `npm run typecheck` and the production build before merging economics changes. Preserve identity, side, quantity, actual exit and cost provenance through partial/final closes. Admission failures must not erase earlier admitted losses. Preserve unknown/empty/no-loss distinctions; do not add PF bonuses or discard small losses. For a strategy change, freeze configuration using earlier data, then report a separate later execution cohort, open-position marks, orders, fees, drawdown and every hour, including zero/negative hours. Retrospective tuning is not an untouched holdout.

These controls protect calculation correctness, not future profitability. Historical `protect` rows have already lost their original exit evidence; this patch cannot reconstruct it or make them verified venue fills. They require raw-fill reconciliation or a new replay. All-strategy profitability and venue reconciliation remain unproven.
