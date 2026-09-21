# CTS-A — Coordinations that must not regress

**Read this before changing PF floors, last-N, Block volumes, short GRID, intern/live isolation, or sim headlines.**  
Pair with [CTS-A-COMPLETE-CONTEXT.md](./CTS-A-COMPLETE-CONTEXT.md) and [CTS-A-defaults.json](./CTS-A-defaults.json). Machine dump: [CTS-A-coordinations.json](./CTS-A-coordinations.json).

The repeating failure is always the same class: **intern paper mixed into live/headline, exclusive locks starving performing cells, or Block/Axis ratios swapped (0.08).** When those happen, hourly PF collapses toward 0.2–0.35 even if selected winners sit at PF 1.3–4.0.

---

## 1. Process order (mandatory)

```
intern ALL combos (pre)
  → last-N Eval 15–80 / primary 50
  → last-N Valid-execute 8–24 / primary 15
  → last-N Disable 6–20 / primary 12   (net<0, min samples 4; do not disable if valid PF still passes)
  → performing short combos only (after pre)
  → Real counted
  → Live execute (Normal off = only adjusted / Block / short)
  → Block per-relation N=1–6 additive 0.2
  → Overall Block shared 1.5 + additive stack (book + symbol + direction)
  → place tagged CTSA tickets
```

Last-N / relation PF / indication sets **before** Overall Block sizes extra volume. Intern **never stops** when Normal is off.

---

## 2. Known-good coordinations (keep)

### 2.1 Isolation

| Layer | Rule |
|---|---|
| Intern paper | `completeSim && paperMode && !preEvalDone` → intern-all 126 TP×SL. Closes **must not** enter live tape. |
| After pre | Arm **performing** combos only. Flatten intern losers at the pre boundary (cancel intern pending; keep proven `validExec=true`). |
| Live tape | Exchange closes only: id starts with `x:`. `deskTapeClosed` / `deskTapeRow` filter. |
| Headline | **selected / performing** tape (min-PF subset with n≥4, net>0). Never mixed intern dump. Never PF_NO_LOSS=4 on tiny net. |
| Green hour | gatedN>0 **and** gatedNet≥0. Empty hour is G0, not a fail. |
| Engine volume | `engineSizeFactor = 1`. Tape VF ≥ 1.05. Axis extra is **not** engine volume. **1.08 is Axis 0.08 leftover — forbidden.** |

### 2.2 PF floors (Overall ≥ stage; higher floor must **keep** winners)

| Gate | Default | Short-range |
|---|---|---|
| Overall | 1.35 | **0.95** |
| Base (Normal intern) | 1.00 | **0.70** |
| Axis | 1.15 | **0.90** |
| Block | 1.20 | **1.15** |
| Live disable | Block PF | 1.10 stable / 1.80 strict |

Raising floors **selects the positive subset**. It must not starve Block adds or collapse paper to 0.20. If nSel=0 do **not** show mixed paper — show the performing subset or “no live yet”.

### 2.3 Last-N

| Stage | Grid | Primary |
|---|---|---|
| Eval | 15–80 step 5 | **50** |
| Valid execute | 8–24 step 4 | **15** |
| Disable | 6–20 step 2 | **12** |

Mode **parallel**, `parallelStack=true`, `parallelVolRatio=1.25`.  
Each **relation / combo / indication / tactic / playbook / short TP×SL** scores the **full** last-N grid on its own tape (prefix O(N) then O(windows)). Book-level slim windows are **display / stack only** — they must not replace per-relation eval.  
`ok` = last-N pass **OR** (full window pf≥minPf && net≥0 && samples≥4). Undersampled n<4 stays armable (high order count).  
Disable never overrides a valid-execute pass. After pre, disable uses **live `validExec` tape only**. Red disable + valid still green → keep processing.

### 2.4 Block volumes (never 0.08)

| Mode | Ratio | Math |
|---|---|---|
| Additive (each relation N) | **0.2** | extra = N × 0.2 × baseQty **cap**; each N adds `0.2 × base` independently |
| Shared | **1.5** | extra/n when n>2, else min(vr, extraCap) |
| Overall | **1.5** | Independent of lanes; stacked additively across book + symbol + direction |
| Winning-rel extra | **once** | `Σ vol × baseQty` after all N=1–6, not on every N (per-N extra starved sets) |
| Cap | **2.5×** parent base | Extra vs **base + existing Block qty only** (GRID legs must not starve Block) |

Counts **1–6 independent**. Stack old 1–2 **and** new 1–6 both run. `relAdditive=true`. `activeLive=true`, minActiveLevel=1. `keepAdjusted=true` **holds** existing extra through a loss window — it must **not** plan new Block adds on a failed Block PF. `sides=both`. `volumeMode=parallel`, `overallMode=parallel`.  
**Axis volume = 3.0×** a normal position (L1 and extra rungs). Live axis depth caps at 2 rungs when ratio ≥ 2 so a filled stack is ~3–6 normals, not 15. `clampAxisPartial` rejects 0.08. Never 1.08 engine VF.

### 2.5 Short GRID

Intern: TP 0.30–0.60 (14) × SL/TP 0.50–2.50 step 0.25 (9) = **126 independent cells**.  
Live floors: **min TP 0.38**, **min SL/TP 0.75**, max TP 0.60.  
**Do not exclusive-lock** `0.48/0.75`. Seed/winner is a **reference**, not an allowlist. After pre, every independently Base-ok + last-N/PF-positive combo may execute.

Proven after pre (`shortComboProven`):

- intern-all phase → all 126 arm
- n < 6: thin stays **armable** for live execute; GRID after pre is proven-only
- n ≥ 6: pf ≥ short 0.95, net > 0, **reject** PF_NO_LOSS with net ≤ 1e-6
- live last-N ≥ 12: `comboLastNPass` (eval≥15 base, valid≥12 short)
- intern paper **never** kills a live-proven cell

Hold: maxHoldTicks **24** (~24 min sim). Trail live **1.5% only**. Disabled trails: 0.8, 1.0, 1.2, 1.4, 1.7, 2.0.

Normal (non-short) TP 0.8–1.6 step 0.1, SL/TP **1.0 and 1.25 only**.

### 2.6 Strategy toggles (live)

| Toggle | Live | Intern |
|---|---|---|
| Normal | **OFF** | still scores as relation base |
| Trailing | ON | |
| Axis | ON | full-size rungs |
| Block | ON | shared + additive + overall |
| DCA | **OFF** | intern only if re-enabled later |

Tactics live: trailing / axis / hybrid. Preferred ranges: **atr / geometric / fibonacci**. Hedge both. Max leverage. Position size **0.12%** of equity. Round-trip position cost **0.12%** of notional deducted from **every** close / PF / last-N / mark-to-market (live actual ~0.10%; never 5 bps). Min qty always lifted.

### 2.7 Ownership

Handle **only** `clientOrderId` starting with `CTSA` + this conn tag (`V2` on x02). Foreign never cancel / flatten / attach. System Net = desk closed realized + owned open unrealized. Positions count = **symbol × direction**. Orders = complete tagged count. Common SL/TP = **widest** of partials; still pull wide SL in if 1+1 exist but looser than cell.

---

## 3. Proven tapes (use these, do not drop)

Screenshot target (independent last-N, Mixed-combo leaks **0**, Base-positive **28**):

| Cell | Note |
|---|---|
| 0.42 / 1.50 | PF **1.45** independent tape |
| 0.48 / 1.00 | PF **1.40** |
| 0.48 / 0.75 | Isolated winner PF **1.21** off / **1.29** Block shared (hold 24) |
| Block overlays | PF **2.20** and **2.05** on those bases |

Live floors keep 0.38+ / 0.75+ so 0.42/1.50 and 0.48/* stay in the GRID. Dropping min SL to 1.70/1.75 **killed** 0.75–1.50 tapes.

Isolated complete (6h live + 6h pre, intern flattened, headline = selected):

- selected PF **1.91**, gated **116/116** PF **1.32**, net **+1.78**, green **5/6**
- gated ≡ paper after isolation (no intern mix)

That is the shape live/sim headlines must match: **positive selected, gated ≈ paper, leaks 0.**

---

## 4. Known-bad (do not repeat)

| Symptom | Real cause | Fix that worked |
|---|---|---|
| Headline PF 0.19–0.35 while selected PF 1.3–4.0 | Intern paper in live tape / hours / last-N | `x:` filter; internAllPhase only during pre; headline = selected |
| Higher min PF → paper 0.20, 0 green | Floor starved Block adds; nSel=0 fell through to mixed paper | Post-hoc select on **same path**; never show 0.20 when winners exist |
| Exclusive lock 0.48/0.75 | Other Base-positive 28 starved | `filterLiveShortCombos` = floors, not allowlist |
| Block “add 0.08” | Axis partial leftover, not Block | Additive **0.2**, Axis **1.0**, clamp rejects 0.08 |
| Engine VF 1.08 | Same 0.08 Axis misread as engine size | `engineSizeFactor=1` |
| N=1 Block PF 0 | Window not processed independently | All N=1–6 must score; PF 0 on N=1 is a bug |
| Live gated PF ≪ intern | Intern used 5 bps RT (or zero); live is ~10 bps | Deduct **0.12%** RT on every close/PF/last-N |
| Block extra on every N | Winning-rel extra added to N=1..6 starved N=2,4,6 | Extra **once** after independent N steps |
| keepAdjusted added on losers | `blockPfOk` returned true on failed PF | Hold extra; do not plan new adds |
| Block overlay in combo tape | Parent close pnl included Block qty | Split `blockQty` share out of shortComboTape |
| Wide SL stuck (13%) | `ensureProtect` returned early when 1 SL+1 TP existed | Pull in if SL looser than cell; trail from **peak** |
| Live PF ≪ sim | Intern TP closes ingested as live; last-N disable too aggressive | No intern-close on live; disable only net<0 with samples≥4 |
| 0 occupied / 0 legs | Session vs file snap; untagged mix | Overall identity + `filterDeskRealized` + owned legs only |
| Stats buckets empty | `??` fallback skipped 0 | `\|\|` + tagOf + ingest before stats |
| Flatten killed PF 0.28 | Flatten all non-proven | Flatten **n≥6 losers + intern pending only**; keep proven `validExec=true` |
| DCA / trail 0.8–1.4 | Live losers | DCA off; trail **1.5 only** |
| Normal off stopped intern | Toggle applied to scoring | Normal off = live placement only |
| 20-min red halt | Interval treated as gate | Red windows **cut size**, never halt entries |
| PF_NO_LOSS=4 on n=1 | Tiny no-loss treated as proven | Reject if net ≤ 1e-6 |
| completeSim skip arm | paperMode gated to live-only GRID during pre | intern-all 126 during pre |

**Wrong 24h×30 mixed dump (do not treat as truth):** LIVE PF 0.284, gated n=82, green 2/24, live `0.48:0.75` PF 0.18 n=27 — intern still in the counted tape. **Wrong 12h×40:** LIVE PF 4.000 on selected n=14 while paper 0.345 and green 0/12 — headline lied.

---

## 5. Sim / headline contract

When running complete computing (`simulateHours` / `sim-*-complete.mjs`):

1. Pre hours = intern-all. After `preEvalDone`, only performing cells arm.
2. Report **three** tapes, never one mixed number:
   - **paper** = intern (pre) / mixed intern after pre if still scoring
   - **gated / live** = `validExec===true` at close (`x:` on liveTape)
   - **selected** = min-PF positive subset (headline when n≥4 and net>0)
3. Hour row: `gatedNet`, `gPF`, `selPF`, `paperNet`. Green = gatedN>0 && gatedNet≥0.
4. Isolated lock pass is a **comparison**, not the live path. Live path = all performing.
5. Block on vs off must be the **same market path** (post-hoc), not two different tapes.

Pass bar for a “stable positive” complete sim:

- Mixed-combo leaks **0**
- selected PF **≥ 1.15** with n≥4
- gated PF **≥ 1.0** (or gated ≈ selected after isolation)
- greenHours majority of hours that have gatedN>0
- Block additive extra uses **0.2**, not 0.08
- 0.42/1.50 and 0.48/0.75 still in the performing GRID when their last-N passes

---

## 6. Live x02 (default conn)

- Conn `bingx-vst-02`, tag `CTSAV2_`, port 3202, 50 symbols, tick 800 ms
- Short range on, Normal off, Block on, DCA off, trail 1.5, range atr
- Live min PF 0.95, max pos 100, max leverage, hedge both, cross
- Protect: 1 SL + 1 TP per owned leg, gap → 0, trail from peak
- Do not promote `bingx-x01` until VST selected PF is stably ≥ 1.35 on the same configs

---

## 7. Files that encode this

| File | What |
|---|---|
| `src/lib/desk/vst.ts` | internAllPhase, shortComboProven, deskTapeRow, flattenNonPerforming, reportPf |
| `src/lib/desk/engine.ts` | PF floors, Block clamps, SHORT_WINNER seed, 126 GRID, AXIS_PARTIAL=1 |
| `src/lib/desk/last-n-progress.ts` | EVAL/VALID/DISABLE grids, scoreLastNGroup ok |
| `src/lib/desk/short-progress.ts` | short PF section, live floors 0.38 / 0.75 |
| `src/lib/desk/feed.ts` | tags, filterDeskRealized, systemNet |
| `src/lib/desk/presets.ts` | vst-paper, stable-01, short-block-live |

Do not invent a parallel engine. Patch these.

---

## 8. One-line reminder

**Intern scores everything. Live executes performing only. Headline is the performing tape. Block additive 0.2 / shared 1.5 / Axis 1.0. Last-N 50/15/12. Short floors 0.38/0.75, no exclusive lock. Never mix intern into live. Never 0.08. Never 0.20 paper when winners exist.**
