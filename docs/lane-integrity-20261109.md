# Configuration and Block ownership — 9 November 2026

An additional Block fill could join an identically protected sibling before resolving its parent. Block state and pending quantities were shared by symbol and side. This could change a sibling's volume, cancel its pending additions, or consume its stack budget.

Orders now carry an explicit parent position ID. Legacy batch IDs are parsed from their known scope/level suffix, retaining colons in parent IDs. Missing or ambiguous parents do not fall back to similar positions. Every Block state uses connection, symbol, side, complete protection/config identity, origin kind/playbook and volume mode; the current episode has its own parent ID. Original partial entry fills all contribute to base quantity. Later Block/DCA volume does not become a new base.

Per-set and Overall modes are independent. Eligible requests share the parent's remaining total quantity cap proportionally, preserving their requested ratios. Step limits apply to the order's step, not the count of independent Overall scopes. Explicit symbol-side conflict handling covers every owned group. Disabling Normal and closing a parent preserve other connections and sibling orders.

Exact qualification now retains Micro/Minimal/Short flags, calculation lane, trailing ratio, captured modeled cost and stop policy. Those fields survive the current tape, frozen Base evidence, retained config histories, last-N cache keys and settlement. Final normal-order qualification uses its actual snapped protection and calculation identity. Connection-specific history cannot borrow another desk's closes. Broad reporting queries remain broad; omitted metadata is not fabricated for legacy exchange records.

Old symbol-only Block states remain inactive and do not seed new owners. Orders with an unresolvable legacy parent are cancelled in the modeled engine. This is an intentional ownership safeguard, not a claim that external exchange reconciliation is complete. The exchange PnL importer still lacks exact per-order configuration identity for some legacy rows; new exact contexts cannot qualify from missing metadata.

## Verification and limits

`npm run test:integrity` covers 55 tests, including 19 new ownership/configuration/settlement regressions. Thirteen existing focused Block/DCA tests pass. Type checking and the production build in development mode pass. Older mode/planner fixtures now state their intended enabled modes and admitted parent explicitly; the allocation fixture checks proportional budgets. No production PF gate was weakened to satisfy a test.

The legacy VST suite is separately audited one test per process with a 20-second timeout and four workers. A timeout is unknown, not a passing or failing profitability result. Its unchanged main baseline has 110 passes, 55 failures and 7 timeouts among 172 tests. After the fixes and targeted longer reruns, there are 114 passes, 50 failures and 8 unresolved timeouts. No previously passing test has a newly confirmed failure. Three initially timed-out baseline passes completed in the longer rerun (54.8 seconds together). It is not a green release-wide suite. The saved comparison identifies changed outcomes; many old assertions assume disabled strategies, obsolete defaults, pooled qualification or guaranteed profit from generated prices.

These are correctness fixes, not an economic preset promotion. No new market simulation or exchange order was run for this patch. No new post-Base, Main, Real or execution PF is asserted. Earlier profitability figures do not validate this source revision. Preserve all losses and distinguish selected-window PF, subsequent execution PF and open marks. High future PF cannot be guaranteed by a qualification threshold.
