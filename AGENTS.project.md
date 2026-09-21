This conversation belongs to a Grok project. The project's files are mounted at `/workspace/artifacts` — look there for user-provided sources before concluding the workspace has no project files. Files written there persist to the project across conversations.

# CTS-A session reminder (do not regress)

**Read first:** [`public/CTS-A-COORDINATIONS.md`](public/CTS-A-COORDINATIONS.md) and [`public/CTS-A-coordinations.json`](public/CTS-A-coordinations.json). Full recreate pack: [`public/CTS-A-COMPLETE-CONTEXT.md`](public/CTS-A-COMPLETE-CONTEXT.md).

One-line: **Intern scores everything. Live executes performing only. Headline is the performing tape. Block additive 0.2 / shared 1.5 / Axis 1.0. Last-N 50/15/12. Short floors 0.38/0.75, no exclusive lock. Position size 0.12%. Deduct 0.12% RT from every pos calc (live ~0.10%). Never mix intern into live. Never 0.08. Never 0.20 paper when winners exist.**

## Coordinations that produced stable positive results

- Intern-all **only during pre** (`completeSim && paperMode && !preEvalDone`). After pre: performing short combos (n≥6, PF≥0.95, net>0; reject PF_NO_LOSS tiny net).
- Live tape = exchange closes `x:` only. Intern paper must not enter last-N / hours / headline.
- Headline = **selected** min-PF subset (n≥4 net>0). Isolated 6h+6h pass: selected PF **1.91**, gated 116/116 PF **1.32**, green **5/6**. Screenshot target: Mixed-combo leaks **0**, Base-positive **28**, 0.42/1.50 PF **1.45**, 0.48/1.00 PF **1.40**, Block overlays **2.20 / 2.05**.
- Do **not** exclusive-lock 0.48/0.75. Use **all performing**. Live floors min TP 0.38 / min SL/TP 0.75.
- Block: additive **0.2**, shared **1.5**, overall **1.5**, maxMul **2.5**, counts 1–6 independent. Axis partial **1.0**. **0.08 is forbidden** (Axis leftover that killed live).
- Last-N eval **50** / valid **15** / disable **12**. Disable only if last-N **net < 0** (min samples 4) and valid PF no longer passes.
- Normal **off** (intern still computes). DCA **off**. Trail **1.5%** only. Max leverage. Hedge both. Handle only `CTSA`+conn tags. System Net = owned closed + owned open.
- Higher min PF must **keep winners** on the same path, not collapse paper to 0.20.

## Failures to avoid (already paid for)

- Intern dump → LIVE PF 0.19–0.35 while selected sits at 1.3–4.0 (24h×30 mixed, 12h×40 PF 4.00 headline lie).
- Exclusive lock starving Base-positive 28.
- Block add 0.08 / engine VF 1.08.
- `ensureProtect` early return leaving 13% SLs.
- Flatten all non-proven (PF 0.28).
- nSel=0 showing mixed paper. PF_NO_LOSS=4 on n=1 treated as proven.
- 20-min red **halting** entries (must only cut size).

Do not invent a parallel engine. Patch `src/lib/desk/vst.ts`, `engine.ts`, `last-n-progress.ts`, `short-progress.ts`, `feed.ts`.
