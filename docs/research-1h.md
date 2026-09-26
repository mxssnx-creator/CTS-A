# Indication research — 60m

40 symbols · 90 days of real BingX data · train 2026-06-28 → 2026-08-12 · test → 2026-09-26 · cost 0.2% round trip · 98 indications × follow/revert/magnet/pivot/sandwich

**Holdout survivors** (train PF ≥ 1.1 and test PF ≥ 1.1, ≥ 30 trades each): 102 of 8820 stage-2 configs.

## Sensitivity (stage-2 leaders, test half, pooled)

- **tp**: 1.20% → PF 0.60 (n 944342) · 2.00% → PF 0.64 (n 905651) · 3.60% → PF 0.64 (n 833922) · 5.20% → PF 0.65 (n 777966) · 7.00% → PF 0.66 (n 730242) · 10.00% → PF 0.68 (n 689088) · 14.00% → PF 0.69 (n 664182)
- **slRatio**: 0.75 → PF 0.69 (n 1153857) · 1 → PF 0.68 (n 1130701) · 1.5 → PF 0.65 (n 1101558) · 2 → PF 0.64 (n 1085154) · 2.5 → PF 0.63 (n 1074123)
- **minSl**: 0.60% → PF 0.66 (n 1849977) · 1.20% → PF 0.66 (n 1849503) · 2.00% → PF 0.66 (n 1845913)
- **trailShare**: 0 → PF 0.69 (n 765710) · 0.3 → PF 0.63 (n 2426173) · 0.5 → PF 0.67 (n 2353510)
- **minTrail**: 0.40% → PF 0.65 (n 1605513) · 0.80% → PF 0.65 (n 1597771) · 1.60% → PF 0.66 (n 1576399)
- **holdH**: 24 → PF 0.66 (n 5545393)

## Best 20 by train, reported on test

| config | TP | SL | trail | hold h | train n | train PF | test n | test PF | test net % | test orders/day |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| follow·break-atr-2 | 14.00% | 14.00% | 7.00% | 24 | 429 | 1.12 | 573 | 1.28 | 304.19 | 12.74 |
| follow·break-atr-2 | 14.00% | 14.00% | 7.00% | 24 | 429 | 1.12 | 573 | 1.28 | 304.19 | 12.74 |
| follow·break-atr-2 | 14.00% | 14.00% | 7.00% | 24 | 429 | 1.12 | 573 | 1.28 | 304.19 | 12.74 |
| follow·break-atr-2 | 14.00% | 14.00% | 7.00% | 24 | 429 | 1.12 | 573 | 1.28 | 304.19 | 12.74 |
| follow·break-atr-2 | 14.00% | 14.00% | 7.00% | 24 | 429 | 1.12 | 573 | 1.28 | 304.19 | 12.74 |
| follow·break-atr-2 | 14.00% | 14.00% | 7.00% | 24 | 429 | 1.12 | 573 | 1.28 | 304.19 | 12.74 |
| follow·break-atr-2 | 14.00% | 14.00% | 7.00% | 24 | 429 | 1.12 | 573 | 1.28 | 304.19 | 12.74 |
| follow·break-atr-2 | 14.00% | 14.00% | 7.00% | 24 | 429 | 1.12 | 573 | 1.28 | 304.19 | 12.74 |
| follow·break-atr-2 | 14.00% | 14.00% | 7.00% | 24 | 429 | 1.12 | 573 | 1.28 | 304.19 | 12.74 |
| follow·break-atr-2 | 14.00% | 21.00% | 7.00% | 24 | 429 | 1.12 | 569 | 1.33 | 345.26 | 12.65 |
| follow·break-atr-2 | 14.00% | 21.00% | 7.00% | 24 | 429 | 1.12 | 569 | 1.33 | 345.26 | 12.65 |
| follow·break-atr-2 | 14.00% | 21.00% | 7.00% | 24 | 429 | 1.12 | 569 | 1.33 | 345.26 | 12.65 |
| follow·break-atr-2 | 14.00% | 21.00% | 7.00% | 24 | 429 | 1.12 | 569 | 1.33 | 345.26 | 12.65 |
| follow·break-atr-2 | 14.00% | 21.00% | 7.00% | 24 | 429 | 1.12 | 569 | 1.33 | 345.26 | 12.65 |
| follow·break-atr-2 | 14.00% | 21.00% | 7.00% | 24 | 429 | 1.12 | 569 | 1.33 | 345.26 | 12.65 |
| follow·break-atr-2 | 14.00% | 21.00% | 7.00% | 24 | 429 | 1.12 | 569 | 1.33 | 345.26 | 12.65 |
| follow·break-atr-2 | 14.00% | 21.00% | 7.00% | 24 | 429 | 1.12 | 569 | 1.33 | 345.26 | 12.65 |
| follow·break-atr-2 | 14.00% | 21.00% | 7.00% | 24 | 429 | 1.12 | 569 | 1.33 | 345.26 | 12.65 |
| follow·break-atr-2 | 14.00% | 28.00% | 7.00% | 24 | 429 | 1.12 | 568 | 1.32 | 335.78 | 12.63 |
| follow·break-atr-2 | 14.00% | 28.00% | 7.00% | 24 | 429 | 1.12 | 568 | 1.32 | 335.78 | 12.63 |

## Every indication (best bot on train, base protect) → test

| kind | indication | bot | train PF | train n | test PF | test n | test net % | gross edge / trade (test) |
|---|---|---|---:|---:|---:|---:|---:|---:|
| trend | trend-adx | magnet | 0.00 | 0 | 17.43 | 3 | 9.43 | 3.34% |
| direction | dir-macd | magnet | 0.00 | 0 | 17.43 | 3 | 9.43 | 3.34% |
| trend | trend-adx-20 | magnet | 0.00 | 0 | 17.43 | 3 | 9.43 | 3.34% |
| trend | trend-adx-30 | magnet | 0.00 | 0 | 17.43 | 3 | 9.43 | 3.34% |
| move | move-impulse-4-1.2 | magnet | 0.00 | 0 | 17.43 | 3 | 9.43 | 3.34% |
| macd | macd-hist-19-39-9 | magnet | 0.00 | 0 | 17.43 | 3 | 9.43 | 3.34% |
| trend | trend-ema | magnet | 0.00 | 0 | 8.71 | 2 | 4.43 | 2.41% |
| trend | trend-ribbon | magnet | 0.00 | 0 | 8.71 | 2 | 4.43 | 2.41% |
| direction | dir-emax | magnet | 0.00 | 0 | 8.71 | 2 | 4.43 | 2.41% |
| direction | dir-vwap | magnet | 0.00 | 0 | 8.71 | 2 | 4.43 | 2.41% |
| move | move-impulse | magnet | 0.00 | 0 | 8.71 | 2 | 4.43 | 2.41% |
| rsi | rsi-mid | magnet | 0.00 | 0 | 8.71 | 2 | 4.43 | 2.41% |
| macd | macd-zero | magnet | 0.00 | 0 | 8.71 | 2 | 4.43 | 2.41% |
| ema | ema-slope | magnet | 0.00 | 0 | 8.71 | 2 | 4.43 | 2.41% |
| trend | trend-ema-5-20 | magnet | 0.00 | 0 | 8.71 | 2 | 4.43 | 2.41% |
| trend | trend-ema-12-26 | magnet | 0.00 | 0 | 8.71 | 2 | 4.43 | 2.41% |
| trend | trend-ema-20-50 | magnet | 0.00 | 0 | 8.71 | 2 | 4.43 | 2.41% |
| trend | trend-ema-50-200 | magnet | 0.00 | 0 | 8.71 | 2 | 4.43 | 2.41% |
| trend | trend-st-14-4 | magnet | 0.00 | 0 | 8.71 | 2 | 4.43 | 2.41% |
| break | break-don10 | magnet | 0.00 | 0 | 8.71 | 2 | 4.43 | 2.41% |
| direction | dir-emax-5-13 | magnet | 0.00 | 0 | 8.71 | 2 | 4.43 | 2.41% |
| direction | dir-emax-12-26 | magnet | 0.00 | 0 | 8.71 | 2 | 4.43 | 2.41% |
| direction | dir-vwap-30 | magnet | 0.00 | 0 | 8.71 | 2 | 4.43 | 2.41% |
| direction | dir-vwap-120 | magnet | 0.00 | 0 | 8.71 | 2 | 4.43 | 2.41% |
| direction | dir-vwap-240 | magnet | 0.00 | 0 | 8.71 | 2 | 4.43 | 2.41% |
| rsi | rsi-mid-52-48 | magnet | 0.00 | 0 | 8.71 | 2 | 4.43 | 2.41% |
| ema | ema-9-21 | magnet | 0.00 | 0 | 8.71 | 2 | 4.43 | 2.41% |
| ema | ema-slope-20 | magnet | 0.00 | 0 | 8.71 | 2 | 4.43 | 2.41% |
| ema | ema-slope-100 | magnet | 0.00 | 0 | 8.71 | 2 | 4.43 | 2.41% |
| direction | dir-st | magnet | 0.00 | 0 | 8.71 | 2 | 4.43 | 2.41% |
| direction | dir-reclaim | magnet | 0.00 | 0 | 8.71 | 2 | 4.43 | 2.41% |
| bollinger | bb-mid | magnet | 0.00 | 0 | 8.71 | 2 | 4.43 | 2.41% |
| sar | sar-std | magnet | 0.00 | 0 | 8.71 | 2 | 4.43 | 2.41% |
| sar | sar-fast | magnet | 0.00 | 0 | 8.71 | 2 | 4.43 | 2.41% |
| sar | sar-flip | magnet | 0.00 | 0 | 8.71 | 2 | 4.43 | 2.41% |
| macd | macd-cross | magnet | 0.00 | 0 | 8.71 | 2 | 4.43 | 2.41% |
| trend | trend-st-7-2 | magnet | 0.00 | 0 | 8.71 | 2 | 4.43 | 2.41% |
| sar | sar-0.01 | magnet | 0.00 | 0 | 8.71 | 2 | 4.43 | 2.41% |
| sar | sar-0.03 | magnet | 0.00 | 0 | 8.71 | 2 | 4.43 | 2.41% |
| macd | macd-cross-5-35-5 | magnet | 0.00 | 0 | 8.71 | 2 | 4.43 | 2.41% |
| macd | macd-hist-5-35-5 | magnet | 0.00 | 0 | 8.71 | 2 | 4.43 | 2.41% |
| macd | macd-cross-8-21-5 | magnet | 0.00 | 0 | 8.71 | 2 | 4.43 | 2.41% |
| macd | macd-hist-8-21-5 | magnet | 0.00 | 0 | 8.71 | 2 | 4.43 | 2.41% |
| macd | macd-cross-19-39-9 | magnet | 0.00 | 0 | 8.71 | 2 | 4.43 | 2.41% |
| trend | trend-st | magnet | 0.00 | 0 | 4.00 | 1 | 5.00 | 5.20% |
| break | break-don20 | magnet | 0.00 | 0 | 4.00 | 1 | 5.00 | 5.20% |
| break | break-vol | magnet | 0.00 | 0 | 4.00 | 1 | 5.00 | 5.20% |
| break | break-atr | magnet | 0.00 | 0 | 4.00 | 1 | 5.00 | 5.20% |
| active | act-burst | magnet | 0.00 | 0 | 4.00 | 1 | 5.00 | 5.20% |
| active | act-shift | magnet | 0.00 | 0 | 4.00 | 1 | 5.00 | 5.20% |
| active | act-hf | magnet | 0.00 | 0 | 4.00 | 1 | 5.00 | 5.20% |
| move | move-cont | magnet | 0.00 | 0 | 4.00 | 1 | 5.00 | 5.20% |
| macd | macd-hist | magnet | 0.00 | 0 | 4.00 | 1 | 5.00 | 5.20% |
| break | break-don40 | magnet | 0.00 | 0 | 4.00 | 1 | 5.00 | 5.20% |
| break | break-don55 | magnet | 0.00 | 0 | 4.00 | 1 | 5.00 | 5.20% |
| break | break-vol-1.3 | magnet | 0.00 | 0 | 4.00 | 1 | 5.00 | 5.20% |
| break | break-vol-2 | magnet | 0.00 | 0 | 4.00 | 1 | 5.00 | 5.20% |
| break | break-atr-0.9 | magnet | 0.00 | 0 | 4.00 | 1 | 5.00 | 5.20% |
| break | break-atr-1.5 | magnet | 0.00 | 0 | 4.00 | 1 | 5.00 | 5.20% |
| break | break-atr-2 | magnet | 0.00 | 0 | 4.00 | 1 | 5.00 | 5.20% |
| active | act-burst-2.5 | magnet | 0.00 | 0 | 4.00 | 1 | 5.00 | 5.20% |
| move | move-impulse-10-2 | magnet | 0.00 | 0 | 4.00 | 1 | 5.00 | 5.20% |
| rsi | rsi-mid-60-40 | magnet | 0.00 | 0 | 4.00 | 1 | 5.00 | 5.20% |
| trend | trend-st-21-5 | follow | 1.00 | 466 | 0.87 | 442 | -66.23 | 0.05% |
| rsi | rsi-14-20-80 | follow | 1.01 | 105 | 0.68 | 245 | -135.11 | -0.35% |
| move | move-impulse-20-2.5 | magnet | 0.00 | 0 | 0.63 | 2 | -3.00 | -1.30% |
| active | act-burst-1.5 | magnet | 0.00 | 0 | 0.58 | 3 | -3.62 | -1.01% |
| break | break-squeeze | magnet | 0.00 | 0 | 0.00 | 0 | 0.00 | 0.00% |
| break | break-retest | magnet | 0.00 | 0 | 0.00 | 1 | -8.00 | -7.80% |
| break | break-fail | sandwich | 0.00 | 0 | 0.00 | 0 | 0.00 | 0.00% |
| active | act-chop | magnet | 0.00 | 0 | 0.00 | 0 | 0.00 | 0.00% |
| direction | dir-thrust | magnet | 0.00 | 0 | 0.00 | 1 | -0.57 | -0.37% |
| move | move-swing | magnet | 0.00 | 0 | 0.00 | 0 | 0.00 | 0.00% |
| rsi | rsi-extreme | sandwich | 0.00 | 0 | 0.00 | 0 | 0.00 | 0.00% |
| rsi | rsi-fast | sandwich | 0.00 | 0 | 0.00 | 0 | 0.00 | 0.00% |
| rsi | rsi-div | magnet | 0.00 | 0 | 0.00 | 0 | 0.00 | 0.00% |
| bollinger | bb-bounce | sandwich | 0.00 | 0 | 0.00 | 0 | 0.00 | 0.00% |
| bollinger | bb-walk | magnet | 0.00 | 0 | 0.00 | 0 | 0.00 | 0.00% |
| bollinger | bb-wick | magnet | 0.00 | 0 | 0.00 | 1 | -0.14 | 0.06% |
| ema | ema-21-55 | sandwich | 0.00 | 0 | 0.00 | 0 | 0.00 | 0.00% |
| ema | ema-pullback | magnet | 0.00 | 0 | 0.00 | 0 | 0.00 | 0.00% |
| ema | ema-stoch | sandwich | 0.00 | 0 | 0.00 | 0 | 0.00 | 0.00% |
| active | act-hf-5 | magnet | 0.00 | 0 | 0.00 | 0 | 0.00 | 0.00% |
| active | act-hf-8 | magnet | 0.00 | 0 | 0.00 | 0 | 0.00 | 0.00% |
| direction | dir-emax-20-50 | sandwich | 0.00 | 0 | 0.00 | 0 | 0.00 | 0.00% |
| direction | dir-thrust-4 | magnet | 0.00 | 0 | 0.00 | 0 | 0.00 | 0.00% |
| direction | dir-reclaim-50 | magnet | 0.00 | 0 | 0.00 | 0 | 0.00 | 0.00% |
| move | move-swing-16 | magnet | 0.00 | 0 | 0.00 | 0 | 0.00 | 0.00% |
| move | move-swing-32 | magnet | 0.00 | 0 | 0.00 | 0 | 0.00 | 0.00% |
| rsi | rsi-14-25-75 | sandwich | 0.00 | 0 | 0.00 | 0 | 0.00 | 0.00% |
| rsi | rsi-21-30-70 | magnet | 0.00 | 0 | 0.00 | 2 | -0.76 | -0.18% |
| rsi | rsi-7-15-85 | sandwich | 0.00 | 0 | 0.00 | 0 | 0.00 | 0.00% |
| bollinger | bb-bounce-20-2.5 | sandwich | 0.00 | 0 | 0.00 | 0 | 0.00 | 0.00% |
| bollinger | bb-bounce-20-3 | magnet | 0.00 | 0 | 0.00 | 0 | 0.00 | 0.00% |
| bollinger | bb-bounce-50-2 | sandwich | 0.00 | 0 | 0.00 | 0 | 0.00 | 0.00% |
| bollinger | bb-walk-50 | magnet | 0.00 | 0 | 0.00 | 0 | 0.00 | 0.00% |
| ema | ema-50-100 | sandwich | 0.00 | 0 | 0.00 | 0 | 0.00 | 0.00% |
| ema | ema-pullback-50 | magnet | 0.00 | 0 | 0.00 | 0 | 0.00 | 0.00% |