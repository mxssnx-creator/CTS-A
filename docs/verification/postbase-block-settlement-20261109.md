# Post-Base Block and settlement audit — 9 November 2026

## Measured defects and repairs

- A Block overlay close retired its still-open parent and appended a complete parent sample. Accumulate net cash contributions and entry notionals until the final parent close, retaining partial state across JSON restart. Only the final parent contributes one notional-weighted sample. Existing closed records are not rewritten.
- Reading Block qualification consumed pause counts. Pause now advances once per settled parent. Repeated reads and partial closes cannot shorten it.
- Block/DCA overlay gates dropped tiny losses and flats, accepted unknown unit evidence as cash PnL, and mixed desk connections. They now retain every eligible observation, require explicit post-Base execution provenance, scope to the active desk and fail qualification on unknown unit returns. A desk/phase change invalidates the cache.
- Legacy indication, relation, combo, lane and book PF readers used epsilon cutoffs or a different no-loss constant. All use the central dimensionless PF function, preserving tiny measured losses. Strategy/hourly splits retain flat and tiny contributions.
- Position management updated stops using the current candle peak before settling a stop already touched by that candle. Resolve the carried bracket first in replay and live-tape processing. Stops gapped at the observed open use that adverse price rather than an untraded trigger. New protective levels apply to subsequent observations; no inferred intrabar ordering can reprice the earlier touch. This can lower historical reported PF by retaining the real modeled loss.

## Verification

The pause and partial-parent tests, four overlay checks, and eight long/short replay/live-tape stop-ordering and gap cases failed before repair. The current focused integrity suite has 74 passing checks, including Micro/Minimal/Short post-Base qualification, config/connection isolation, fee policy, parent ownership and restart. TypeScript and development build are required release checks. The hosted release records exact completion.

The broader legacy VST inventory was already non-green: 115 passed, 49 failed, 8 timed out before this change. Ten selected failures were reproduced; they include obsolete fixed 0.12% costs, immediate unqualified order expectations, and optimistic synthetic profitability assertions. No production threshold was weakened to satisfy those expectations. This release does not claim a clean full legacy suite.

## Evidence and limits

All new reproductions use controlled synthetic observations and make no exchange calls. They establish accounting/ownership correctness, not market profitability. No current market execution PF or post-Base passing percentage is available for this CTS-A revision. Fee defaults remain dynamically resolved (fallback taker 0.08%, maker 0.05%, slippage 10% of fees); qualification/volume defaults are not optimized or promoted by this audit. No account was started.

CTS-A-O's persistent Main→Real runtime adapter remains a separate unresolved integration; a standalone processed-set fix does not complete it. CTS-G's separately measured frozen 80-symbol confirmation remains 1,449 settled parent trades, 38 held, PF 0.842094 without Block and PF 0.828311 with the shipped Block settings. These are research-model results, not this CTS-A revision or venue fills, and provide no high-forward-PF guarantee.
