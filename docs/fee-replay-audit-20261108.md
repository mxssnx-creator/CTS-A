# Fee and replay audit — 2026-11-08

The configured fallback is maker 0.0005 and taker 0.0008 (fractions: 0.05% and 0.08%). Slippage is a fee ratio of 0.1, i.e. 10% of the applicable fee. Taker/taker paper allowance is 0.176%, maker/taker 0.143%, maker/maker 0.110%. These are operator assumptions, not measured venue rates.

Account-specific rates supersede fallback estimates only within their symbol/account scope and freshness window. Unknown selected symbols continue to contribute their fallback. Actual fill prices already contain slippage; measured fees, confirmed zero and explicit normalized rebates are not charged an additional paper allowance. Do not treat a LIMIT order as maker evidence.

This source update does not start or deploy a trading service. Candle simulations cannot reproduce queue priority, unknown intrabar paths, latency or liquidity. No profitable configuration was promoted from this sample, and high settled-only PF does not establish high marked or future PF.

## Evidence window

8 cached symbols (ADA, AVAX, BCH, BNB, BTC, DOGE, DOT, ETH), 2026-11-06 19:00 to 2026-11-07 19:00 UTC. First 12 hours are prehistory; last 12 hours are scored. Data was already cached; no private account rates or credentials were read.

| Project / scope | Closes | Settled PF | PF including open marks |
|---|---:|---:|---:|
| CTS-G shared parent replay, new cost | 17 | 10.602 | 0.931 |
| CTS-G same replay, legacy fixed 0.12% | 17 | 9.312 | 1.135 |
| CTS-A-O native runtime, 12h selection | 0 | unavailable | unavailable |
| CTS-A synthetic Axis + Block | 9 | 0.80985 | not comparable |

CTS-G fast replay (cached, hourly diagnostic sampling) took 7 s versus 38 s for the detailed cold run. Exact closed trades and open positions matched; 60 sampled production gate/rank checks passed. Validation always remains per entry. Diagnostic sampling density is not the admission cadence.
An initial CTS-A-O run took 92.5 s with four workers versus 246.3 s with one worker, but selection settings differed, so this is not a controlled speed benchmark. Its coverage checks failed: 2,099/3,288 requested Base combos returned; 36 pairs passed Base and 0/14,042 later config evaluations passed. 608 Micro candidates failed the close-count requirement. Do not replace these zero executions with historical selected-window PF.


## Further native checks and Micro research

Adding cached indicator warmup (49h of physical candles, still only 12h evaluated prehistory + 12h scored) allowed CTS-A-O to execute 34,711 modeled closes, settled return PF 8.37235. This is **not** a successful live preset: 15,532 order allocations remain open across seven positions, the modeled $10 book ends at negative $9.79 equity, and exposure is infeasible for 541 minutes. The high settled PF conceals open losses. The run took 170.9 seconds. Most closes were Minimal; Micro indications participated but the separately named Micro range did not qualify. Requested slow lanes still lack enough prehistory.

A separate CTS-A-O Micro study tested 48 first-class source/timeframe/profile combinations plus the runtime's automatic legacy Micro focus: 1/5/15m, 15-minute hold, net targets at 1/1.5/2 times the 0.176% fallback, stop ratios 1/1.5/2 and four trailing choices. It evaluated 816 Micro pairs, passed none and executed none (3 seconds). Median evaluated Micro PF was 0.1051. This losing research grid is not a new default.

CTS-G's actual Pulse parent position manager was driven offline on an explicit OHLC tick path for the 17 replay entries. All 17 exit reasons and exit bars matched. Stub market prices and fee-only estimated settlement differ from barrier-fill paper prices; these differences are retained. This is parent lifecycle evidence, not full account execution proof. Two Axis replay defects are fixed: open positions consume continuation slots through the end, and last-N/loss streaks follow settlement order. Both new regressions pass.

## Implementation and verification

Position sizing stays at its existing 0.12% of equity; transaction costs are now separate. Minimal target distances use the modeled round-trip fee unit rather than the sizing constant. Positions snapshot their modeled cost at admission, and parent/Block close ratios and mark-to-market use the snapshot. A read-only background commission refresh populates symbol/account snapshots; actual-price partial-close estimates deduct fees without adding modeled slippage again.

Verification: 52 stable/settlement/PF checks, 12 fee/Minimal integration checks and five focused Block scope/stack checks passed. TypeScript and build passed. The broader Block/DCA test command was stopped after running for several minutes without output; it is not recorded as passing.

Synthetic 8-symbol, 12h-prehistory + 12h-run experiments: Minimal 1 close/PF 0; Axis 6 closes/PF 0.8453; Axis + Block 9 closes/PF 0.8099. They took approximately 2.18/1.22/2.13 seconds. These are generated price paths in the production desk simulator, not cached-exchange replay. There is not yet an independently routed Micro implementation or verified timestamped market replay equivalent to the original live lifecycle. Do not promote these losing synthetic presets.

## Step PF, exact lane history and last-N rules
New `tacticConfig.stepPf` settings expose enabled/ratio/max (true/0.2/2 for new engines). Uses the CTS-G manual percent rule when a price-percent target is explicit, or Minimal's actual fee-relative target is known; ATR multipliers are not silently treated as price percentages. Stricter lane floors remain.
Last-N history/cache identity now includes symbol, side, indication, tactic, type, range, playbook, TP and SL. Cache identity also includes the current windows and PF settings. Empty completed-stage windows cannot pass or manufacture a parallel stack. Base qualification respects the selected multi-window mode, prefers current own closes over frozen older wins, and cannot borrow a broader range for an exact symbol/side context. Relation volume retains candidates until matching the entry, includes exact config/protection keys and applies the eight-relation bound after matching.
Validation: 39 focused fee/step/lane/window tests and 52 stable tests passed. The deterministic synthetic Minimal/Axis/Axis+Block results remain 1/6/9 closes with PF 0/0.8453/0.8099. This is not a timestamped exchange replay, full stage architecture, or proof of Micro profitability.
