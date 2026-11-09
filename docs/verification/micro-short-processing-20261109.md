# Micro, Minimal and Short processing — 9 November 2026

Long desk simulations previously replaced the selected range with a Short preset,
forced at least 80 symbols, enabled Block settings, removed prehistory and set
Base PF to 0.7 / execution PF to 0.95. They now preserve the selected configuration,
strategy switches, volumes, symbol count, PF rules, own windows and fee policy.
Complete runs use the existing 20-hour Base evaluation. Short diagnostic runs
without prehistory are identified as synthetic discovery, not completed Base proof.

After Base, paper and live arming use the full symbol/direction/indication/type/
range/calculation/protection/economic identity. An unobserved sibling cannot become
a valid paper execution. A pooled Short TP/SL score no longer suppresses a cell
whose exact history qualifies. A call-local verdict cache reuses no decisions
across ticks or settings changes. The simulation boundary uses finishBaseEval,
retaining the same frozen configuration evidence as the ordinary engine.

Regression fixtures initially reproduced unqualified Micro and Minimal admission,
and a qualified Short cell being omitted. They now check the actual paper and live
arming paths. Configuration tests cover all three low ranges, custom costs before
the first order, and preserving disabled strategies and higher PF floors.

Validation: 60 focused integrity tests passed; TypeScript and development build
passed. A bounded audit of the 172 legacy VST tests has 115 passes, 49 failures and
8 timeouts at 20 seconds per isolated test. This is not a clean whole-project suite.
The legacy test which expected unknown post-Base configurations to populate a live
queue now rejects that false-progress behavior. Known failures and timeouts remain
in the evidence archive. No market-profitability claim follows from synthetic tests.

No live exchange orders were submitted. Future profit factor is not guaranteed.
