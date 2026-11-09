# Expanded Last-N and negative filters — 2026-11-09

Requested scope: independent multi-window qualification through exact symbol/config/type lanes, with lower positive windows and additional negative windows. No future-profit guarantee is asserted.

## Native CTS-G market sensitivity

150 trials: Micro / Minimal / Short × 10 Base/Main/Real tuples × positive, negative recovery 1/3, negative recovery 5/10, recent-loss veto 1, recent-loss veto 3+5. Twelve frozen symbols; 24h evaluated prehistory and 24h trading (2026-11-07 06:00 through 2026-11-08 06:00 UTC). Completed-minute input; four indication configurations per range; normal base TP/SL only; independent symbol/config identities; SL/TP 0.25 and 0.5. Existing Axis stays enabled. Block/DCA/Relate are disabled in this comparison. One physical position per symbol remains a shared execution constraint.

Strict full windows; Base secondary and Main-short selection disabled to isolate the tested policies. Public frozen maker 0.02%, taker 0.05%, fee-relative slippage 10%; the market/market modeled roundtrip is 0.11%. Funding is excluded. This is reused retrospective research data, not an independent holdout or verified account execution.

| Range | Strongest PF with >=10 total closes | Closed parents | Base/Main/Real | Mode | First half PF / n | Second half PF / n |
|---|---:|---:|---|---|---|---|
| Micro | 0.559702 | 42 | 5/3/1 | positive | 0.489583 / 18 | 0.619885 / 24 |
| Minimal | 1.256684 | 10 | 10/5/3 | veto recent loss 1 | no-loss / 1 | 1.048128 / 9 |
| Short | 1.032244 | 17 | 10/5/3 | veto recent loss 1 | 0.984006 / 7 | 1.064449 / 10 |

**0/150 passes** the predeclared screen: >=10 settled parents and PF>1 in each chronological 12h half. No economic preset is promoted. Tiny or empty high-PF cells are retained in the report but cannot establish an edge. New losing outcomes are never removed because their source later fails qualification.

Independent price arithmetic checks all 7,962 trade occurrences, costs exactly once, 3,600 hourly windows, drawdown, stage count bounds and chronological halves: no mismatches. Six hundred sampled engine/replay verdict comparisons: zero mismatches. Cross-project recent-loss arithmetic: 2,880 comparisons, zero differences. Repeated trade occurrences across trials are not independent market observations.

Reproduce with `scripts/lastn_sensitivity.py` and `scripts/report_lastn_sensitivity.py` in CTS-G. The evidence archive includes all trial JSON, both protocols, frozen input candles, code and fingerprints. The earlier 12-case independent-lane study predates the strict Base-full-window fix and is superseded as comparative market evidence. Later global lower-bound fixes do not alter this sweep's explicit per-profile windows.

## Negative semantics and preservation

Recent-loss veto: optional 1–200 completed own-parent observations, up to 16 windows, any/all mode, max loss PF 0–1. Inputs are already net of costs. Insufficient/nonfinite evidence cannot pass. Tiny losses remain losses. The veto changes later admissions only, never held ownership, exits or historic performance. Same ID with a changed economic policy is a new qualification identity.

CTS-G's existing negative recovery is a same-direction branch with its own positive Real-negative validation. It is not an inverse strategy. CTS-A-O's requested opposite-direction processed Main remains a separate pending runtime integration.

## Earlier demo run, not acceptance of this patch

CTS-G x02 VST ran approximately 20m25s before network policy blocked the venue. Cleanup confirmed zero positions and zero orders. Twenty-two entries and twenty-two exits: one natural close, twenty-one interruption cleanup closes. All-owned-close return PF 0.230211; cash PF 0.226618; cash net -0.127680 VST. This predates the new policies and is not a complete 30-minute run. CTS-A and CTS-A-O 30-minute runs were not completed. No new x01 run, no deployment, and no live/sim parity claim without matching final candles.

## CTS-A implementation and validation

Expanded positive research grids 1,2,3,5,8,10,12,15,20,25,30,40,50,60,80,100,150,200; recent-loss research grid through 50, custom values through 200. Per-config independent policies retain exact configured counts, negative filters and retention/cache identity. Statistics use the actual configured count instead of a hidden minimum of eight. Existing defaults/custom selections remain.

Demo settings preserve all configured strategies and low distances. Current losing or missing evidence cannot inherit a historical passing fallback. Accepted pending/uncertain closes no longer release ownership in the three close consumers. Connection identity selects VST transport and ambiguous writes are not retried as refusals.

Final focused integrity suite 93/93 passes; typecheck and development build pass. The legacy broad suite was not certified: earlier unrelated failures/timeouts remain. Persistent separately funded Base/Main/Real progression, durable late-close recovery and the runner's limited grid/selection logic remain unfinished. This patch does not establish native CTS-A market PF or a completed live run.
