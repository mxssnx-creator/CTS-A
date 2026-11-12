# Native entry protection and final owned cleanup

The twelve-symbol `STUDYA12` experiment produced 26 filled entry orders and ten recovery-cleanup closes on seven symbols / ten sides. All entry receipts showed empty attached SL/TP. After the process stopped producing current status, the independent exact-namespace recovery reconciled 105 orders (69 cancelled, 36 filled), cancelled the remaining own limits, closed only quantities derived from its own filled history, and confirmed zero selected positions and zero own open orders. No foreign order or whole-account close was used.

The ten grouped side episodes lost **4.52527 VST**, including **0.10687 VST** signed commissions deducted once; return-based PF was **0.0956467078**. Every final exit was recovery cleanup, so these are not natural strategy exits or evidence of a successful strategy. The missing current engine trace prevents a reliable configuration-by-configuration sim/live PF comparison. The original stale status and independent recovery remain separate evidence.

Three actual entry defects are addressed:

* Ladder/resting entries no longer request unprotected submission. Their native bracket is based on the exact captured source order and rebased to the submitted entry price, rather than borrowing a sibling position's geometry at the current mark. Missing source identity is withheld on the x02 runner. Trailing-only source orders retain their stop without an invented fixed target.
* A rejected native bracket no longer triggers a second unprotected order. Explicit invalid captured prices are rejected; a definite minimum-size retry retains the requested protection. Unknown write outcomes remain unresolved and are not retried.
* x02 ladder/near bootstrap paths cannot bypass `liveShouldExecute` and the source's independent qualification checks. A lower count of genuinely qualified entries is preferable to presenting bootstrap fills as validated execution.

The bounded cleanup adapter now reads the account again after its last cancellation and requires zero pending close identities before reporting completion. A still-visible resting order, delayed fill, unknown book or unresolved close keeps cleanup incomplete and sets a failing process result. Tests cover cancellation-time fills, retained protections, foreign inventory, delayed cancellation visibility and unknown close results. Credential-bearing fallbacks to unverified alternate hosts were removed; configured BingX hosts use the established `.com` endpoints.

Validation: typecheck and 37 offline transport, identity, geometry, pending-close, session-policy and cleanup cases pass. The network guard loads before imports; API cases use in-memory responses. No profitable new live result is established by these code checks, and no production service or mainnet account was deployed or changed.
