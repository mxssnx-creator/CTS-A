# Last-N sample coverage and qualification repairs — 9 November 2026

Sample sufficiency is reported separately from PF validation. Full losing samples count as sampled; empty contexts remain in the denominator. No research preset is promoted and no live account is started by this change.

## Changes

Progress publishes enough-sample percentages for the active Last-N policies, including inherited recent-loss windows. Counts cover retained exact config × symbol × direction contexts on the selected connection, including known empty open/pending configs. Return validity, insufficiency and PF verdict are separate. The chosen history follows qualification precedence: current closes, retained own history, then frozen Base; an older long winning tape never replaces a short current losing tape. Configs never generated are outside this denominator. A remote session missing this snapshot remains unavailable rather than borrowing local evidence.

Two qualification failures were reproduced and fixed. The hard-coded 80-row cap hid older losses from a configured Last-200 window (80 recent wins plus 120 double-sized losses incorrectly passed); live and frozen-Base qualification now read the configured maximum up to 200. The legacy eight-row warm-up shortcut also bypassed explicit independent/recent-loss policies; those policies now reach their own full decision. Legacy default warm-up remains unchanged. Retained row serialization preserves unknown returns instead of converting them to flat samples.

## Verification

All 100 integrity tests pass, including exact-connection isolation, Last-200 current/frozen/restart behavior, older losses, warm-up veto bypass, unknown observations and policy inheritance. Typecheck and development build pass. Actual component server rendering preserves sample counts and unavailable states; local Chromium visual inspection is unavailable because its process-singleton socket is denied by the host. Hosted checks must refer to the final PR head.

## Financial evidence

No current-policy market or venue PF is measured by these synthetic correctness tests. Post-Base PF and validated percentage remain unavailable for a new run. The UI snapshot measures sample sufficiency, not future profitability or venue readiness.
