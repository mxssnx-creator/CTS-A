# Indication research — 15m

40 symbols · 90 days of real BingX data · train 2026-06-28 → 2026-08-12 · test → 2026-09-26 · cost 0.2% round trip · 98 indications × follow/revert/magnet/pivot/sandwich

**Holdout survivors** (train PF ≥ 1.1 and test PF ≥ 1.1, ≥ 30 trades each): 105 of 8820 stage-2 configs.

## Sensitivity (stage-2 leaders, test half, pooled)

- **tp**: 0.60% → PF 0.51 (n 601888) · 1.00% → PF 0.66 (n 591883) · 1.80% → PF 0.74 (n 573582) · 2.60% → PF 0.79 (n 557787) · 3.50% → PF 0.81 (n 542946) · 5.00% → PF 0.81 (n 526560) · 7.00% → PF 0.81 (n 515007)
- **slRatio**: 0.75 → PF 0.74 (n 794396) · 1 → PF 0.75 (n 787974) · 1.5 → PF 0.76 (n 780162) · 2 → PF 0.77 (n 775326) · 2.5 → PF 0.77 (n 771795)
- **minSl**: 0.30% → PF 0.76 (n 1303512) · 0.60% → PF 0.76 (n 1303394) · 1.00% → PF 0.76 (n 1302747)
- **trailShare**: 0 → PF 0.78 (n 550302) · 0.3 → PF 0.74 (n 1691203) · 0.5 → PF 0.76 (n 1668148)
- **minTrail**: 0.20% → PF 0.75 (n 1121142) · 0.40% → PF 0.75 (n 1120235) · 0.80% → PF 0.76 (n 1117974)
- **holdH**: 8 → PF 0.76 (n 3909653)

## Best 20 by train, reported on test

| config | TP | SL | trail | hold h | train n | train PF | test n | test PF | test net % | test orders/day |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| revert·break-atr-2 | 3.50% | 5.25% | 1.75% | 8 | 1805 | 1.18 | 2019 | 0.86 | -276.30 | 44.87 |
| revert·break-atr-2 | 3.50% | 5.25% | 1.75% | 8 | 1805 | 1.18 | 2019 | 0.86 | -276.30 | 44.87 |
| revert·break-atr-2 | 3.50% | 5.25% | 1.75% | 8 | 1805 | 1.18 | 2019 | 0.86 | -276.30 | 44.87 |
| revert·break-atr-2 | 3.50% | 5.25% | 1.75% | 8 | 1805 | 1.18 | 2019 | 0.86 | -276.30 | 44.87 |
| revert·break-atr-2 | 3.50% | 5.25% | 1.75% | 8 | 1805 | 1.18 | 2019 | 0.86 | -276.30 | 44.87 |
| revert·break-atr-2 | 3.50% | 5.25% | 1.75% | 8 | 1805 | 1.18 | 2019 | 0.86 | -276.30 | 44.87 |
| revert·break-atr-2 | 3.50% | 5.25% | 1.75% | 8 | 1805 | 1.18 | 2019 | 0.86 | -276.30 | 44.87 |
| revert·break-atr-2 | 3.50% | 5.25% | 1.75% | 8 | 1805 | 1.18 | 2019 | 0.86 | -276.30 | 44.87 |
| revert·break-atr-2 | 3.50% | 5.25% | 1.75% | 8 | 1805 | 1.18 | 2019 | 0.86 | -276.30 | 44.87 |
| revert·break-atr-2 | 3.50% | 5.25% | 0.00% | 8 | 1762 | 1.16 | 1968 | 0.83 | -384.65 | 43.73 |
| revert·break-atr-2 | 3.50% | 5.25% | 0.00% | 8 | 1762 | 1.16 | 1968 | 0.83 | -384.65 | 43.73 |
| revert·break-atr-2 | 3.50% | 5.25% | 0.00% | 8 | 1762 | 1.16 | 1968 | 0.83 | -384.65 | 43.73 |
| revert·break-atr-2 | 3.50% | 8.75% | 1.75% | 8 | 1787 | 1.17 | 1958 | 0.90 | -177.03 | 43.51 |
| revert·break-atr-2 | 3.50% | 8.75% | 1.75% | 8 | 1787 | 1.17 | 1958 | 0.90 | -177.03 | 43.51 |
| revert·break-atr-2 | 3.50% | 8.75% | 1.75% | 8 | 1787 | 1.17 | 1958 | 0.90 | -177.03 | 43.51 |
| revert·break-atr-2 | 3.50% | 8.75% | 1.75% | 8 | 1787 | 1.17 | 1958 | 0.90 | -177.03 | 43.51 |
| revert·break-atr-2 | 3.50% | 8.75% | 1.75% | 8 | 1787 | 1.17 | 1958 | 0.90 | -177.03 | 43.51 |
| revert·break-atr-2 | 3.50% | 8.75% | 1.75% | 8 | 1787 | 1.17 | 1958 | 0.90 | -177.03 | 43.51 |
| revert·break-atr-2 | 3.50% | 8.75% | 1.75% | 8 | 1787 | 1.17 | 1958 | 0.90 | -177.03 | 43.51 |
| revert·break-atr-2 | 3.50% | 8.75% | 1.75% | 8 | 1787 | 1.17 | 1958 | 0.90 | -177.03 | 43.51 |

## Every indication (best bot on train, base protect) → test

| kind | indication | bot | train PF | train n | test PF | test n | test net % | gross edge / trade (test) |
|---|---|---|---:|---:|---:|---:|---:|---:|
| direction | dir-reclaim-50 | sandwich | 0.37 | 6 | 3.05 | 9 | 7.92 | 1.08% |
| macd | macd-hist-5-35-5 | sandwich | 1.02 | 12 | 2.16 | 13 | 9.06 | 0.90% |
| active | act-hf-5 | sandwich | 2.49 | 3 | 1.97 | 7 | 3.58 | 0.71% |
| move | move-swing | sandwich | 4.00 | 2 | 1.96 | 6 | 3.53 | 0.79% |
| direction | dir-thrust-4 | magnet | 3.04 | 8 | 1.94 | 16 | 9.97 | 0.82% |
| macd | macd-hist | sandwich | 4.00 | 2 | 1.74 | 7 | 4.08 | 0.78% |
| break | break-atr-1.5 | sandwich | 0.42 | 3 | 1.50 | 9 | 3.47 | 0.59% |
| trend | trend-adx | sandwich | 1.23 | 25 | 1.49 | 39 | 13.30 | 0.54% |
| macd | macd-hist-8-21-5 | sandwich | 1.48 | 17 | 1.38 | 17 | 5.31 | 0.51% |
| trend | trend-st-21-5 | sandwich | 1.03 | 89 | 1.37 | 129 | 36.09 | 0.48% |
| ema | ema-stoch | sandwich | 0.69 | 62 | 1.36 | 88 | 23.95 | 0.47% |
| trend | trend-st-14-4 | sandwich | 0.82 | 76 | 1.36 | 115 | 31.04 | 0.47% |
| direction | dir-st | sandwich | 1.26 | 39 | 1.31 | 49 | 12.01 | 0.45% |
| trend | trend-st-7-2 | sandwich | 1.26 | 39 | 1.31 | 49 | 12.01 | 0.45% |
| active | act-hf | sandwich | 4.00 | 1 | 1.31 | 5 | 1.13 | 0.43% |
| move | move-swing-16 | sandwich | 4.00 | 2 | 1.31 | 5 | 1.13 | 0.43% |
| trend | trend-ema-50-200 | sandwich | 1.04 | 84 | 1.27 | 104 | 21.75 | 0.41% |
| move | move-cont | sandwich | 0.76 | 21 | 1.26 | 30 | 6.87 | 0.43% |
| direction | dir-reclaim | sandwich | 11.95 | 6 | 1.26 | 12 | 2.47 | 0.41% |
| ema | ema-slope | sandwich | 1.01 | 88 | 1.25 | 115 | 24.07 | 0.41% |
| macd | macd-zero | sandwich | 0.86 | 86 | 1.25 | 107 | 22.28 | 0.41% |
| direction | dir-emax-12-26 | sandwich | 0.86 | 86 | 1.25 | 107 | 22.28 | 0.41% |
| break | break-don40 | magnet | 1.08 | 212 | 1.25 | 290 | 63.17 | 0.42% |
| trend | trend-st | sandwich | 0.94 | 83 | 1.25 | 91 | 18.12 | 0.40% |
| ema | ema-pullback-50 | sandwich | 0.69 | 11 | 1.24 | 13 | 2.63 | 0.40% |
| move | move-impulse | sandwich | 1.12 | 53 | 1.21 | 54 | 9.83 | 0.38% |
| trend | trend-ema-20-50 | sandwich | 1.16 | 47 | 1.21 | 59 | 10.01 | 0.37% |
| direction | dir-vwap-120 | sandwich | 0.95 | 76 | 1.19 | 101 | 16.29 | 0.36% |
| trend | trend-adx-30 | sandwich | 1.14 | 17 | 1.19 | 27 | 4.46 | 0.37% |
| trend | trend-adx-20 | sandwich | 1.03 | 39 | 1.18 | 54 | 7.98 | 0.35% |
| direction | dir-vwap-240 | sandwich | 1.01 | 90 | 1.18 | 113 | 15.29 | 0.34% |
| break | break-don55 | sandwich | 1.57 | 29 | 1.16 | 37 | 5.33 | 0.34% |
| trend | trend-ribbon | sandwich | 1.00 | 60 | 1.15 | 77 | 9.90 | 0.33% |
| rsi | rsi-7-15-85 | sandwich | 0.58 | 17 | 1.15 | 55 | 7.84 | 0.34% |
| sar | sar-0.03 | sandwich | 1.67 | 22 | 1.14 | 32 | 3.93 | 0.32% |
| ema | ema-slope-100 | sandwich | 0.96 | 96 | 1.12 | 129 | 13.37 | 0.30% |
| ema | ema-21-55 | sandwich | 0.99 | 103 | 1.12 | 145 | 14.80 | 0.30% |
| break | break-vol-1.3 | magnet | 1.10 | 162 | 1.12 | 197 | 19.93 | 0.30% |
| bollinger | bb-wick | sandwich | 0.76 | 74 | 1.10 | 90 | 8.21 | 0.29% |
| macd | macd-cross-5-35-5 | pivot | 1.30 | 17 | 1.10 | 37 | 3.82 | 0.30% |
| ema | ema-50-100 | sandwich | 0.76 | 123 | 1.09 | 173 | 14.23 | 0.28% |
| break | break-fail | sandwich | 0.75 | 93 | 1.08 | 177 | 13.00 | 0.27% |
| direction | dir-emax-20-50 | sandwich | 0.94 | 103 | 1.07 | 139 | 8.40 | 0.26% |
| direction | dir-vwap | sandwich | 1.33 | 48 | 1.06 | 74 | 3.91 | 0.25% |
| direction | dir-emax | magnet | 1.02 | 805 | 1.05 | 923 | 44.69 | 0.25% |
| ema | ema-9-21 | magnet | 1.02 | 805 | 1.05 | 923 | 44.69 | 0.25% |
| rsi | rsi-extreme | sandwich | 0.50 | 67 | 1.04 | 118 | 4.80 | 0.24% |
| macd | macd-cross-8-21-5 | pivot | 1.51 | 42 | 1.02 | 44 | 1.25 | 0.23% |
| rsi | rsi-fast | sandwich | 0.66 | 57 | 1.01 | 106 | 1.02 | 0.21% |
| active | act-chop | sandwich | 0.59 | 18 | 1.00 | 18 | -0.01 | 0.20% |
| bollinger | bb-bounce-50-2 | sandwich | 0.44 | 104 | 0.99 | 171 | -0.89 | 0.19% |
| move | move-impulse-4-1.2 | magnet | 1.20 | 57 | 0.98 | 80 | -1.28 | 0.18% |
| break | break-don20 | magnet | 1.03 | 303 | 0.97 | 383 | -9.32 | 0.18% |
| ema | ema-slope-20 | magnet | 1.04 | 663 | 0.97 | 794 | -20.87 | 0.17% |
| break | break-don10 | magnet | 1.05 | 349 | 0.96 | 420 | -16.73 | 0.16% |
| active | act-shift | sandwich | 1.09 | 11 | 0.95 | 18 | -1.05 | 0.14% |
| break | break-retest | magnet | 1.29 | 237 | 0.93 | 255 | -17.72 | 0.13% |
| break | break-vol | magnet | 1.04 | 125 | 0.92 | 159 | -10.90 | 0.13% |
| trend | trend-ema-12-26 | sandwich | 1.53 | 32 | 0.91 | 38 | -3.21 | 0.12% |
| rsi | rsi-mid-60-40 | sandwich | 4.07 | 6 | 0.89 | 11 | -1.24 | 0.09% |
| move | move-impulse-10-2 | magnet | 1.11 | 386 | 0.87 | 411 | -58.69 | 0.06% |
| direction | dir-emax-5-13 | sandwich | 1.05 | 46 | 0.85 | 44 | -6.75 | 0.05% |
| bollinger | bb-bounce | magnet | 0.90 | 727 | 0.85 | 664 | -107.08 | 0.04% |
| move | move-impulse-20-2.5 | magnet | 1.00 | 516 | 0.84 | 583 | -101.42 | 0.03% |
| bollinger | bb-mid | magnet | 1.48 | 112 | 0.83 | 116 | -20.14 | 0.03% |
| break | break-atr-2 | revert | 1.10 | 1814 | 0.83 | 2062 | -388.51 | 0.01% |
| rsi | rsi-21-30-70 | sandwich | 0.56 | 38 | 0.82 | 72 | -14.59 | -0.00% |
| macd | macd-cross | magnet | 1.80 | 48 | 0.80 | 69 | -13.99 | -0.00% |
| break | break-squeeze | magnet | 1.22 | 123 | 0.80 | 142 | -27.29 | 0.01% |
| direction | dir-vwap-30 | sandwich | 1.15 | 42 | 0.79 | 49 | -9.28 | 0.01% |
| break | break-vol-2 | magnet | 1.08 | 98 | 0.78 | 125 | -28.34 | -0.03% |
| rsi | rsi-mid | sandwich | 1.60 | 15 | 0.78 | 19 | -4.83 | -0.05% |
| active | act-burst-1.5 | magnet | 1.09 | 532 | 0.75 | 559 | -155.44 | -0.08% |
| rsi | rsi-14-25-75 | sandwich | 0.71 | 37 | 0.74 | 76 | -24.06 | -0.12% |
| rsi | rsi-div | magnet | 1.26 | 162 | 0.73 | 159 | -48.13 | -0.10% |
| direction | dir-macd | magnet | 1.05 | 367 | 0.73 | 484 | -141.87 | -0.09% |
| sar | sar-0.01 | sandwich | 0.81 | 63 | 0.72 | 60 | -18.50 | -0.11% |
| active | act-burst | magnet | 1.14 | 266 | 0.69 | 301 | -110.42 | -0.17% |
| rsi | rsi-mid-52-48 | sandwich | 1.30 | 24 | 0.69 | 33 | -10.90 | -0.13% |
| trend | trend-ema-5-20 | sandwich | 1.52 | 25 | 0.68 | 35 | -12.60 | -0.16% |
| break | break-atr-0.9 | magnet | 0.96 | 236 | 0.67 | 196 | -85.04 | -0.23% |
| macd | macd-hist-19-39-9 | magnet | 1.03 | 589 | 0.67 | 700 | -270.29 | -0.19% |
| break | break-atr | sandwich | 0.16 | 4 | 0.66 | 10 | -4.20 | -0.22% |
| bollinger | bb-bounce-20-2.5 | magnet | 1.43 | 70 | 0.63 | 37 | -16.17 | -0.24% |
| move | move-swing-32 | sandwich | 28.03 | 5 | 0.62 | 6 | -2.97 | -0.30% |
| trend | trend-ema | sandwich | 1.46 | 26 | 0.61 | 34 | -15.00 | -0.24% |
| sar | sar-fast | pivot | 1.12 | 157 | 0.61 | 201 | -94.33 | -0.27% |
| sar | sar-std | magnet | 1.08 | 254 | 0.60 | 372 | -172.82 | -0.26% |
| active | act-hf-8 | sandwich | 2.91 | 4 | 0.60 | 11 | -4.88 | -0.24% |
| macd | macd-cross-19-39-9 | magnet | 1.11 | 60 | 0.54 | 82 | -48.35 | -0.39% |
| rsi | rsi-14-20-80 | pivot | 0.93 | 112 | 0.53 | 128 | -98.18 | -0.57% |
| active | act-burst-2.5 | magnet | 0.85 | 47 | 0.47 | 75 | -57.40 | -0.57% |
| ema | ema-pullback | sandwich | 1.91 | 11 | 0.45 | 16 | -11.28 | -0.51% |
| sar | sar-flip | magnet | 1.67 | 86 | 0.44 | 127 | -88.34 | -0.50% |
| direction | dir-thrust | sandwich | 2.47 | 12 | 0.41 | 10 | -7.13 | -0.51% |
| bollinger | bb-walk | sandwich | 4.00 | 1 | 0.00 | 1 | -1.17 | -0.97% |
| bollinger | bb-bounce-20-3 | magnet | 0.00 | 0 | 0.00 | 0 | 0.00 | 0.00% |
| bollinger | bb-walk-50 | sandwich | 0.00 | 0 | 0.00 | 2 | -1.42 | -0.51% |