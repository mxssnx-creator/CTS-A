# Bot system recreation

This file is the recreation record for the desk bots as they run on mainnet **bingx-x01**. VST **bingx-vst-02** is off for both the progress tape and the bots. Do not start it.

Saved preset id: `x01-bots` (builtin, [src/lib/desk/presets.ts](../src/lib/desk/presets.ts)). Machine copy: [x01-bot-preset.json](x01-bot-preset.json).

## What runs

| Lane | Connection | State |
|---|---|---|
| Progress tape | `bingx-x01` | On. 40 symbols. `LIVE_RUN_CFG` trailing, short 0.42 / 1.7, `liveRunBlock()`. |
| Bots | `bingx-x01` | On. Three types in parallel. |
| VST x01 | `bingx-vst-01` | Left as its own paper session. Not the live book. |
| VST x02 | `bingx-vst-02` | Off. `running: false`. `startBot` refuses it. Ticks are redirected to x01. No exchange opens. |

One engine, one tick. Orders, positions, and closes carry `connId`. A bot row is any playbook that starts with `bot:`. Progress rows do not. The two lanes do not cancel each other and do not share a symbol on the exchange (`liveLane` is `bot` or `progress`).

## Armed bots

Up to 3 types (`BOT_PARALLEL_CAP`). The saved set is Sandwich, Clamp, Pivot. Each has its own config, playbook, signal, and close tape.

Volume factor **1** is the live default. It is half the old 1× size. Notional never goes under $2.

| Type | Playbook | Indication | Select | Symbols | TP | SL | Trail | VF | Hours |
|---|---|---|---|---:|---:|---:|---:|---:|---:|
| sandwich | `bot:sandwich` | active | 1H volatility | 10 | 0.4% | 0.5% | 0.3% | 1 | 24 |
| clamp | `bot:clamp` | trend | 1H volatility | 10 | 0.4% | 0.5% | 0.3% | 1 | 24 |
| pivot | `bot:pivot` | direction | 15m range | 10 | 0.4% | 0.5% | 0.3% | 1 | 24 |

Strategies on each, live execution only when the toggle is on:

- normal: off
- trailing: on (primary)
- axis: on
- block: on
- dca: off

`livePrimary` picks the first on toggle in this order: trailing, normal, axis, block, dca. With this preset the primary is trailing. If every toggle is off, that type places nothing.

Live floors (`liveBotFloors`), which are what the order actually uses:

- take-profit = max(0.48, minTp) = **0.48%**
- stop as a multiple of that TP = max(0.75, minSl / TP) = max(0.75, 0.5 / 0.48) = **1.0417**
- trail distance = **0.3%**, and it only tightens after MFE reaches 0.3%

So a live sandwich long at price P:

- TP = P × 1.0048
- SL distance = P × 0.0048 × 1.0417 ≈ P × 0.0050
- trail activates once price has moved 0.3% in favor, then the stop follows the peak by 0.3%

## Other types (not armed)

They stay in the config map so a preset can turn them on. They are not started on x01.

| Type | Indication | Select | Difference |
|---|---|---|---|
| snap | rsi | 1H volatility | SL 0.6%. Fade RSI / band stretch back to VWAP. |
| pulse | move | ATR rank | TP 0.6, SL 0.6, trail 0.4. Only when this hour's range expands. |
| ribbon | ema | session heat | Fade a stretch from EMA21. |
| sweep | break | 15m range | Trail 0.2. Wick through the 1H extreme, then reclaim. |
| magnet | sar | ATR rank | Fade the prior hour's VWAP in the first half of the new hour. |

## Signal

`stepDeskBots` in [src/lib/desk/bots.ts](../src/lib/desk/bots.ts), once per tick, only when `e.botMode` is set.

1. Build a 1-minute bar from the live quote for each symbol in the largest armed symbol count. Keep 180 bars.
2. Need 4 bars before a symbol can trade.
3. Rank with the type's select mode and keep the top `symbolCount`.
4. Skip a symbol that already has this type's position, queued order, or working order on this connection.
5. `liveQuoteSignal`: the type's own rule after 12 bars, otherwise a short mean-reversion fallback (fade a stretch off the last few closes, and only if price has turned).
6. At most 4 new orders per type per tick.
7. Order is a market, `validExec: true`, note `Bot <type>`, kind `short`, tactic from the primary strategy.

Size on the paper book: equity × 0.20 × volume factor. Equity for that connection starts at $10 and adds only that connection's bot closes.

Live exchange size is `botLiveNotional`, not the paper formula. At volume factor 1 the scale is 0.5. Under $20 equity the cap is $2. Above $20 it is `min(8 × scale, equity × 0.15 × scale)` and still at least $2.

Volume factor steps are 1–10. In the backtest, `recalcVolumeFactor` raises it after equity is 1.6× the last recalc (`VF_RECALC_RATIO` 0.6). The live ticket uses the saved factor until the config is changed.

## Controls

Paper, inside the same step, before new entries:

- TP is reset to entry × (1 ± tp%).
- Peak price tracks the bar high (long) or low (short).
- When MFE ≥ trail%, SL tightens toward `trailLevel` and never loosens.

Live, after a bot market fill (`store.ts` born loop):

- One order per connection lane every 4 seconds.
- `placeBingxOrder` market, `confirmLive`, hedge `positionSide`, no `reduceOnly`.
- Then `placeBotControls`: STOP_MARKET and TAKE_PROFIT_MARKET with `closePosition`, prices from the mark, not from a stale last.
- `queueBotControls` repeats for a position that filled and still has no working stop or target.
- Generic progress trailing does not rewrite a `bot:` position.

## Not falling

Two holds, both on the last closes only. Open positions stay managed. New entries stop.

Progress indications ([src/lib/desk/vst.ts](../src/lib/desk/vst.ts) `liveIndStillPays`):

- Each valid close records the position ratio on that indication, last 64.
- After 40 samples, if profit factor ≤ 1 or net ≤ 0, `armUniverse` does not queue that indication.
- A later window that pays again clears the hold.
- This is what stopped the 7-day fade, where ema and macd went under 1 and pulled the book from PF 1.39 down to 1.05.

Bots (`botTapePays`):

- Last 40 closes of that playbook on that connection.
- After 16 samples, same rule. The type keeps its stops and targets. It just stops adding.

## Coordination with progress

Tick order in `tickEngine`:

1. If the view is x02, the tick runs as x01 instead.
2. Step the view connection's armed bots.
3. Snapshot new bot and gated progress orders (`liveOrderAllowed`).
4. `tickVst` the progress tape when the view is x01 (40 symbols, trailing, live block).
5. Other running connections get a bot step plus a book-only tick. x02 is never in that list.
6. Dispatch at most one live order per lane. A symbol already owned by the other lane is skipped.
7. `queueExchangeOpen` does not run for x01 or x02. x01 entries come only from the gated progress queue.

`liveOrderAllowed` sends a progress order only when the book PF is above 1, equity is at least the start, and that short combo has at least 8 closes, PF between 1 and 6, and a real net.

Progress and bots use separate ledgers. Bot closes do not move the progress PF. `occupiedSymbols` for the progress arm ignores `bot:` positions, so a bot holding BTC does not block a progress ladder on BTC inside the paper book. The exchange lane map is what stops a double live position.

## Files

| File | Role |
|---|---|
| `src/lib/desk/bots.ts` | Types, defaults, signals, step, live stats, backtest. |
| `src/lib/desk/store.ts` | Boot, tick, live dispatch, x02 off, preset apply. |
| `src/lib/desk/vst.ts` | Progress tape, indication hold, order match, stats. |
| `src/lib/desk/presets.ts` | Builtin `x01-bots`. |
| `src/lib/desk/engine.ts` | Strategy toggles and PF helpers. |
| `docs/x01-bot-preset.json` | Frozen config for the three armed types. |

## Bring it back

1. Open the desk on `bingx-x01`. Do not arm `bingx-vst-02`.
2. Apply preset `x01-bots`, or load [x01-bot-preset.json](x01-bot-preset.json) into the bots config.
3. Confirm armed = sandwich, clamp, pivot, volume factor 1, and x02 `running` is false.
4. Start. Progress uses the 40-symbol x01 tape. Bots place on the same connection with playbooks `bot:sandwich`, `bot:clamp`, `bot:pivot`.
5. A healthy hour has new bot orders, a stop and a target on each live fill, progress PF above 1, and no x02 orders.
