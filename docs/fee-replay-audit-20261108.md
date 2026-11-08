# Fee, step PF and replay audit — 2026-11-08

## Policy and scope

Configured fallback fees are maker 0.0005 (0.05%) and taker 0.0008 (0.08%) per side. Slippage is a fee ratio of 0.1: 10% of the applicable fee, not 10% of position notional. Modeled round-trip allowances are 0.176% taker/taker, 0.143% maker/taker and 0.110% maker/maker. Account-specific rates supersede fallback estimates only within their symbol/account scope and freshness window. Unknown selected symbols keep their fallback.

Actual fill prices already contain slippage. Measured fees, confirmed zero and explicit normalized rebates do not receive another modeled allowance. LIMIT alone is not maker evidence. No private fee endpoints or credentials were read for this audit, and no real-money service was started.

The manual step rule is `max(existing lane/range floor, min(maxSetting, 1 + floor(tpPercent * 10) / 10 * ratio))`, with the target grid bounded to 0.2–3.5%. New settings default enabled/ratio/max to true/0.2/2. Stricter existing floors remain. Signals keep their independent policy. A qualifying historical PF is an admission rule, not a promise about later results.

## Final measured results

Eight cached symbols: ADA, AVAX, BCH, BNB, BTC, DOGE, DOT, ETH. Evaluated prehistory is 2026-11-06 19:00–2026-11-07 07:00 UTC; the scored period is November 7 07:00–19:00. This is 12h prehistory plus 12h scored, not a 24h scored test. CTS-A-O additionally receives 25h of indicator-only warmup, for 49h of physical candles; its evaluated and scored windows stay unchanged. CTS-A uses generated prices rather than this exchange feed.

| Project / evidence | Modeled settled closes | Settled return PF | Open-position outcome |
|---|---:|---:|---|
| CTS-G selected parent replay, new cost | 17 | 10.602 | 8 held; closed + marked PF 0.931 |
| CTS-G same replay, legacy fixed 0.12% | 17 | 9.312 | closed + marked PF 1.135 |
| CTS-A-O final native runtime | 34,629 | 8.30590 | 15,532 allocations / 7 positions held; final equity −9.77912 from a 10-unit book |
| CTS-A synthetic Axis + Block | 9 | 0.80985 | synthetic evidence only |

CTS-A-O's final closed balance is 17.69987, but open mark-to-market is −27.47900. The allocation model exceeds feasible exposure for 541 minutes; six hours are green and six red. It reports 50,161 opened allocations and 34,629 settled allocations. These are modeled counts, not exchange orders. The high settled PF does not make the configuration viable. Report checks are 75/77: complete-combination and complete-kind coverage still fail. Base passes 114/2,240 returned evaluations; downstream config passes are 4,971/53,622. Signals build 125,970 tapes but seat none.

The same-warmup fee-only baseline had 34,711 closes and PF 8.37235. The final step policy reduces closes by 82 and lowers settled PF slightly; it is not presented as a performance improvement. Initial 24h-physical-feed runs had zero closes. Additional indicator warmup changes the available candidate cohort, so the warmed run is not a controlled speed comparison to those initial runs.

## Micro, Axis, Block and parity limits

CTS-G's isolated Micro run constrained TP and trailing ranges and disabled the separate Short Range pack: 168 sets, 1.49% Base validity, zero executions. CTS-A-O's separate Micro grid tested 48 source/timeframe/profile combinations plus automatic legacy focus, with 1/5/15m timeframes, 15-minute hold, targets 1/1.5/2 cost units, SL ratios 1/1.5/2 and four trailing choices. It evaluated 816 Micro pairs, passed none and executed none; median evaluated PF was 0.1051. Micro indications do execute in the Minimal range, which is distinct from the separately named Micro range.

CTS-G native Pulse parent management was driven offline on an explicit OHLC tick path for all 17 selected entries: 17/17 exit reasons and exit minutes match. Tick-market fills and fee-only settlement estimates differ from barrier-fill paper prices, and those differences are retained. This is not complete account-level, funding, Block lifecycle or exchange-fill parity. Axis replay now keeps held parents in continuation slots and orders last-N/loss streaks by settlement.

CTS-G cached replay with hourly diagnostic sampling took 7 seconds versus 38 seconds cold; closed and held lists match. A later fresh-cache stage-statistics check took 21 seconds under different concurrency. CTS-A-O final compute took 185.0 seconds, total 189 seconds, with a 562ms worst foreground slice; it does not establish a strict sub-500ms cycle. CTS-A synthetic Minimal/Axis/Axis+Block results are 1/6/9 closes and PF 0/0.8453/0.8099, taking about 3.33/2.02/1.97 seconds.

No profitable preset is promoted. Complete causal processed-stage runtime integration in CTS-A-O, complete timestamped exchange replay in CTS-A, account-feasible sizing, Micro/Signals coverage and consistently positive marked results remain outstanding. No future PF guarantee follows from these tests.

## Implementation and verification

Position sizing stays at its existing 0.12% of equity; transaction costs are now separate. Minimal target distances use the modeled round-trip fee unit rather than the sizing constant. Positions snapshot their modeled cost at admission, and parent/Block close ratios and mark-to-market use the snapshot. A read-only background commission refresh populates symbol/account snapshots; actual-price partial-close estimates deduct fees without adding modeled slippage again.

Verification: 52 stable/settlement/PF checks, 12 fee/Minimal integration checks and five focused Block scope/stack checks passed. TypeScript and build passed. The broader Block/DCA test command was stopped after running for several minutes without output; it is not recorded as passing.

Synthetic 8-symbol, 12h-prehistory + 12h-run experiments: Minimal 1 close/PF 0; Axis 6 closes/PF 0.8453; Axis + Block 9 closes/PF 0.8099. They took approximately 2.18/1.22/2.13 seconds. These are generated price paths in the production desk simulator, not cached-exchange replay. There is not yet an independently routed Micro implementation or verified timestamped market replay equivalent to the original live lifecycle. Do not promote these losing synthetic presets.

## Step PF, exact lane history and last-N rules
New `tacticConfig.stepPf` settings expose enabled/ratio/max (true/0.2/2 for new engines). Uses the CTS-G manual percent rule when a price-percent target is explicit, or Minimal's actual fee-relative target is known; ATR multipliers are not silently treated as price percentages. Stricter lane floors remain.
Last-N history/cache identity now includes symbol, side, indication, tactic, type, range, playbook, TP and SL. Cache identity also includes the current windows and PF settings. Empty completed-stage windows cannot pass or manufacture a parallel stack. Base qualification respects the selected multi-window mode, prefers current own closes over frozen older wins, and cannot borrow a broader range for an exact symbol/side context. Relation volume retains candidates until matching the entry, includes exact config/protection keys and applies the eight-relation bound after matching.
Validation: 39 focused fee/step/lane/window tests and 52 stable tests passed. The deterministic synthetic Minimal/Axis/Axis+Block results remain 1/6/9 closes with PF 0/0.8453/0.8099. This is not a timestamped exchange replay, full stage architecture, or proof of Micro profitability.

## Executed statistics follow-up

The 12-symbol, 24h-prehistory + 24h synthetic expansion exposed a reporting defect.
Before this correction, Axis displayed PF 1.4517005 while its own nine scored closes
had PF 0.5903720. Axis + Block displayed PF 2.1204807 while its own eleven scored
closes had PF 0.4941101. The report substituted a selected winning subset for executed
PF, retained prehistory in symbol totals, and sometimes substituted selected net for
marked equity change. These are reporting errors, not evidence of profitable execution.

Headlines now use every owned settled slice in the scored interval. Unit-return PF,
size-weighted cash PF, settled cash and marked equity change are separate values.
Symbols, indications, types, hours, horizon marks, order counts, drawdown and streaks
use that interval. Selected, gated and prehistory cohorts remain explicit diagnostics.
Block partial settlements now update the same ratio, symbol, exit and streak ledgers
as parent settlements. The parent retains its independent remaining quantity.

The eight new/reinforced tests reconcile actual close rows against headline PF,
hourly and symbol cash, all execution group counts, horizon marks and recovered
maximum drawdown, including a losing Block partial. All eight passed, as did 52
stable regressions, TypeScript and the production build. Targeted lint has no errors
and retains 27 pre-existing unused-symbol warnings.

Corrected 12-symbol/24h synthetic results: Minimal 1 close/PF 0; Axis 9 closes/PF
0.5903720; Axis + Block 13 closes/PF 0.5458914. The corrected Block ledger affects
later model decisions, so its rerun has a different cohort. The corrected 8-symbol/12h
Axis + Block result is 9 closes/PF 0.8133033, superseding the earlier 0.8099 figure
above. No high-PF preset is supported by these results. This simulator still uses
generated prices; no exchange parity or future return guarantee is implied.
