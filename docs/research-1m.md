# Indication research — 1m

40 symbols · 20 days of real BingX data · train 2026-09-06 → 2026-09-16 · test → 2026-09-26 · cost 0.2% round trip · 98 indications × follow/revert/magnet/pivot/sandwich

**Holdout survivors** (train PF ≥ 1.1 and test PF ≥ 1.1, ≥ 30 trades each): 0 of 8820 stage-2 configs.

## Sensitivity (stage-2 leaders, test half, pooled)

- **tp**: 0.15% → PF 0.00 (n 228008) · 0.26% → PF 0.11 (n 219167) · 0.46% → PF 0.29 (n 212085) · 0.67% → PF 0.42 (n 209397) · 0.90% → PF 0.49 (n 206733) · 1.29% → PF 0.61 (n 203520) · 1.81% → PF 0.67 (n 199881)
- **slRatio**: 0.75 → PF 0.42 (n 298959) · 1 → PF 0.43 (n 297664) · 1.5 → PF 0.44 (n 295269) · 2 → PF 0.45 (n 293898) · 2.5 → PF 0.46 (n 293001)
- **minSl**: 0.08% → PF 0.44 (n 493101) · 0.15% → PF 0.44 (n 492975) · 0.26% → PF 0.44 (n 492715)
- **trailShare**: 0 → PF 0.53 (n 208643) · 0.3 → PF 0.38 (n 638012) · 0.5 → PF 0.46 (n 632136)
- **minTrail**: 0.05% → PF 0.42 (n 423958) · 0.10% → PF 0.42 (n 423756) · 0.21% → PF 0.42 (n 422434)
- **holdH**: 1 → PF 0.43 (n 741293) · 3 → PF 0.45 (n 737498)

## Best 20 by train, reported on test

| config | TP | SL | trail | hold h | train n | train PF | test n | test PF | test net % | test orders/day |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| sandwich·move-cont | 1.81% | 4.53% | 0.00% | 3 | 212 | 1.26 | 462 | 0.69 | -152.45 | 46.20 |
| sandwich·move-cont | 1.81% | 4.53% | 0.00% | 3 | 212 | 1.26 | 462 | 0.69 | -152.45 | 46.20 |
| sandwich·move-cont | 1.81% | 4.53% | 0.00% | 3 | 212 | 1.26 | 462 | 0.69 | -152.45 | 46.20 |
| sandwich·move-cont | 1.81% | 4.53% | 0.91% | 3 | 217 | 1.22 | 481 | 0.64 | -136.38 | 48.10 |
| sandwich·move-cont | 1.81% | 4.53% | 0.91% | 3 | 217 | 1.22 | 481 | 0.64 | -136.38 | 48.10 |
| sandwich·move-cont | 1.81% | 4.53% | 0.91% | 3 | 217 | 1.22 | 481 | 0.64 | -136.38 | 48.10 |
| sandwich·move-cont | 1.81% | 4.53% | 0.91% | 3 | 217 | 1.22 | 481 | 0.64 | -136.38 | 48.10 |
| sandwich·move-cont | 1.81% | 4.53% | 0.91% | 3 | 217 | 1.22 | 481 | 0.64 | -136.38 | 48.10 |
| sandwich·move-cont | 1.81% | 4.53% | 0.91% | 3 | 217 | 1.22 | 481 | 0.64 | -136.38 | 48.10 |
| sandwich·move-cont | 1.81% | 4.53% | 0.91% | 3 | 217 | 1.22 | 481 | 0.64 | -136.38 | 48.10 |
| sandwich·move-cont | 1.81% | 4.53% | 0.91% | 3 | 217 | 1.22 | 481 | 0.64 | -136.38 | 48.10 |
| sandwich·move-cont | 1.81% | 4.53% | 0.91% | 3 | 217 | 1.22 | 481 | 0.64 | -136.38 | 48.10 |
| sandwich·move-cont | 1.81% | 2.72% | 0.00% | 3 | 214 | 1.15 | 476 | 0.68 | -153.77 | 47.60 |
| sandwich·move-cont | 1.81% | 2.72% | 0.00% | 3 | 214 | 1.15 | 476 | 0.68 | -153.77 | 47.60 |
| sandwich·move-cont | 1.81% | 2.72% | 0.00% | 3 | 214 | 1.15 | 476 | 0.68 | -153.77 | 47.60 |
| sandwich·move-cont | 1.81% | 3.62% | 0.00% | 3 | 213 | 1.14 | 468 | 0.70 | -145.05 | 46.80 |
| sandwich·move-cont | 1.81% | 3.62% | 0.00% | 3 | 213 | 1.14 | 468 | 0.70 | -145.05 | 46.80 |
| sandwich·move-cont | 1.81% | 3.62% | 0.00% | 3 | 213 | 1.14 | 468 | 0.70 | -145.05 | 46.80 |
| sandwich·move-cont | 1.81% | 4.53% | 0.00% | 1 | 222 | 1.20 | 489 | 0.72 | -94.70 | 48.90 |
| sandwich·move-cont | 1.81% | 4.53% | 0.00% | 1 | 222 | 1.20 | 489 | 0.72 | -94.70 | 48.90 |

## Every indication (best bot on train, base protect) → test

| kind | indication | bot | train PF | train n | test PF | test n | test net % | gross edge / trade (test) |
|---|---|---|---:|---:|---:|---:|---:|---:|
| rsi | rsi-mid-60-40 | sandwich | 0.45 | 78 | 0.79 | 114 | -9.59 | 0.12% |
| bollinger | bb-bounce-20-2.5 | magnet | 0.70 | 95 | 0.77 | 83 | -7.61 | 0.11% |
| break | break-squeeze | sandwich | 0.54 | 564 | 0.68 | 620 | -87.39 | 0.06% |
| rsi | rsi-div | magnet | 0.62 | 4146 | 0.66 | 5256 | -800.65 | 0.05% |
| trend | trend-ema-50-200 | magnet | 0.57 | 2663 | 0.66 | 3260 | -497.89 | 0.05% |
| macd | macd-cross-19-39-9 | sandwich | 0.68 | 3497 | 0.66 | 4157 | -636.39 | 0.05% |
| break | break-vol | magnet | 0.71 | 445 | 0.66 | 516 | -78.35 | 0.05% |
| bollinger | bb-bounce-50-2 | magnet | 0.62 | 3294 | 0.65 | 4305 | -670.60 | 0.04% |
| sar | sar-std | sandwich | 0.64 | 5273 | 0.65 | 6887 | -1076.82 | 0.04% |
| macd | macd-hist-19-39-9 | sandwich | 0.66 | 4158 | 0.65 | 5155 | -807.44 | 0.04% |
| break | break-vol-1.3 | magnet | 0.71 | 563 | 0.65 | 683 | -106.05 | 0.04% |
| break | break-don20 | sandwich | 0.61 | 723 | 0.65 | 913 | -142.72 | 0.04% |
| sar | sar-flip | sandwich | 0.64 | 5004 | 0.65 | 6445 | -1026.51 | 0.04% |
| ema | ema-stoch | magnet | 0.58 | 1117 | 0.65 | 1218 | -193.95 | 0.04% |
| break | break-vol-2 | magnet | 0.76 | 344 | 0.65 | 395 | -62.71 | 0.04% |
| direction | dir-macd | sandwich | 0.63 | 5169 | 0.64 | 6789 | -1094.20 | 0.04% |
| active | act-hf-5 | sandwich | 0.64 | 3815 | 0.64 | 4819 | -782.91 | 0.04% |
| active | act-shift | sandwich | 0.70 | 1357 | 0.64 | 1404 | -229.64 | 0.04% |
| sar | sar-0.01 | sandwich | 0.64 | 3990 | 0.64 | 5163 | -847.96 | 0.04% |
| move | move-swing-32 | sandwich | 0.57 | 157 | 0.64 | 212 | -34.61 | 0.04% |
| direction | dir-thrust-4 | sandwich | 0.64 | 1706 | 0.64 | 2368 | -389.41 | 0.04% |
| move | move-impulse-4-1.2 | sandwich | 0.63 | 4475 | 0.64 | 5708 | -941.58 | 0.04% |
| bollinger | bb-wick | magnet | 0.59 | 5760 | 0.64 | 7901 | -1308.80 | 0.03% |
| sar | sar-0.03 | sandwich | 0.63 | 5867 | 0.64 | 7783 | -1290.85 | 0.03% |
| macd | macd-cross | sandwich | 0.63 | 4807 | 0.64 | 6040 | -1001.03 | 0.03% |
| break | break-fail | magnet | 0.59 | 5319 | 0.63 | 7551 | -1262.55 | 0.03% |
| bollinger | bb-bounce | magnet | 0.64 | 1492 | 0.63 | 1698 | -282.93 | 0.03% |
| macd | macd-hist | magnet | 0.60 | 6851 | 0.63 | 9649 | -1627.98 | 0.03% |
| move | move-swing | sandwich | 0.65 | 4156 | 0.63 | 5282 | -890.40 | 0.03% |
| move | move-swing-16 | sandwich | 0.64 | 1773 | 0.63 | 2113 | -355.04 | 0.03% |
| direction | dir-st | sandwich | 0.67 | 3215 | 0.63 | 4036 | -680.45 | 0.03% |
| trend | trend-st-7-2 | sandwich | 0.67 | 3215 | 0.63 | 4036 | -680.45 | 0.03% |
| active | act-hf-8 | sandwich | 0.64 | 2328 | 0.63 | 2890 | -487.46 | 0.03% |
| sar | sar-fast | sandwich | 0.63 | 6474 | 0.63 | 8737 | -1509.61 | 0.03% |
| macd | macd-cross-5-35-5 | sandwich | 0.62 | 6597 | 0.63 | 8766 | -1514.46 | 0.03% |
| macd | macd-cross-8-21-5 | sandwich | 0.62 | 6450 | 0.63 | 8541 | -1475.88 | 0.03% |
| macd | macd-hist-8-21-5 | sandwich | 0.62 | 6646 | 0.63 | 8927 | -1542.99 | 0.03% |
| bollinger | bb-mid | sandwich | 0.65 | 3494 | 0.63 | 4297 | -741.78 | 0.03% |
| rsi | rsi-extreme | magnet | 0.62 | 2122 | 0.62 | 2670 | -462.25 | 0.03% |
| macd | macd-hist-5-35-5 | sandwich | 0.63 | 6723 | 0.62 | 9038 | -1569.26 | 0.03% |
| trend | trend-adx | sandwich | 0.60 | 1310 | 0.62 | 1425 | -245.62 | 0.03% |
| active | act-hf | sandwich | 0.64 | 5390 | 0.62 | 7089 | -1233.68 | 0.03% |
| ema | ema-pullback-50 | magnet | 0.73 | 652 | 0.62 | 814 | -140.63 | 0.03% |
| direction | dir-emax-5-13 | sandwich | 0.65 | 2487 | 0.62 | 3155 | -559.24 | 0.02% |
| active | act-chop | magnet | 0.66 | 432 | 0.62 | 565 | -99.51 | 0.02% |
| direction | dir-thrust | sandwich | 0.64 | 4046 | 0.62 | 5536 | -989.97 | 0.02% |
| break | break-don55 | magnet | 0.26 | 41 | 0.62 | 35 | -6.16 | 0.02% |
| break | break-atr-2 | sandwich | 0.67 | 731 | 0.61 | 633 | -112.55 | 0.02% |
| rsi | rsi-21-30-70 | magnet | 0.62 | 1091 | 0.61 | 1327 | -240.68 | 0.02% |
| move | move-impulse | sandwich | 0.66 | 3271 | 0.61 | 4025 | -729.18 | 0.02% |
| trend | trend-adx-30 | magnet | 0.74 | 1176 | 0.61 | 994 | -179.72 | 0.02% |
| active | act-burst-1.5 | sandwich | 0.63 | 5355 | 0.61 | 6482 | -1185.72 | 0.02% |
| ema | ema-slope-100 | magnet | 0.58 | 1647 | 0.61 | 1919 | -351.12 | 0.02% |
| break | break-don40 | sandwich | 0.54 | 313 | 0.61 | 389 | -71.24 | 0.02% |
| break | break-don10 | sandwich | 0.61 | 2144 | 0.61 | 2780 | -515.08 | 0.01% |
| break | break-retest | sandwich | 0.54 | 519 | 0.61 | 566 | -104.16 | 0.02% |
| ema | ema-21-55 | magnet | 0.57 | 1533 | 0.61 | 1748 | -323.60 | 0.01% |
| break | break-atr-0.9 | sandwich | 0.64 | 5789 | 0.60 | 7311 | -1361.88 | 0.01% |
| trend | trend-adx-20 | sandwich | 0.61 | 1838 | 0.60 | 2163 | -401.88 | 0.01% |
| active | act-burst | sandwich | 0.63 | 3511 | 0.60 | 3778 | -705.11 | 0.01% |
| active | act-burst-2.5 | sandwich | 0.60 | 1105 | 0.60 | 882 | -164.51 | 0.01% |
| direction | dir-reclaim | sandwich | 0.60 | 2984 | 0.60 | 3774 | -713.14 | 0.01% |
| direction | dir-vwap | magnet | 0.62 | 1893 | 0.60 | 2115 | -399.48 | 0.01% |
| break | break-atr | sandwich | 0.64 | 4028 | 0.60 | 4651 | -885.85 | 0.01% |
| direction | dir-vwap-30 | sandwich | 0.63 | 2259 | 0.60 | 2764 | -531.24 | 0.01% |
| ema | ema-slope | magnet | 0.66 | 1395 | 0.59 | 1685 | -323.45 | 0.01% |
| rsi | rsi-14-25-75 | magnet | 0.59 | 868 | 0.59 | 1029 | -199.39 | 0.01% |
| trend | trend-ema-5-20 | sandwich | 0.63 | 1364 | 0.59 | 1731 | -335.29 | 0.01% |
| rsi | rsi-mid | sandwich | 0.55 | 520 | 0.59 | 702 | -136.26 | 0.01% |
| rsi | rsi-fast | magnet | 0.59 | 1140 | 0.59 | 1399 | -272.89 | 0.00% |
| break | break-atr-1.5 | sandwich | 0.65 | 2140 | 0.59 | 2120 | -414.73 | 0.00% |
| rsi | rsi-mid-52-48 | sandwich | 0.58 | 1380 | 0.59 | 1809 | -359.56 | 0.00% |
| macd | macd-zero | magnet | 0.64 | 1963 | 0.58 | 2222 | -446.19 | -0.00% |
| direction | dir-emax-12-26 | magnet | 0.64 | 1963 | 0.58 | 2222 | -446.19 | -0.00% |
| ema | ema-slope-20 | sandwich | 0.63 | 1937 | 0.58 | 2438 | -490.67 | -0.00% |
| direction | dir-emax-20-50 | magnet | 0.59 | 1333 | 0.58 | 1524 | -305.53 | -0.00% |
| direction | dir-vwap-120 | magnet | 0.58 | 1739 | 0.58 | 2110 | -431.56 | -0.00% |
| rsi | rsi-7-15-85 | magnet | 0.54 | 392 | 0.58 | 480 | -98.41 | -0.01% |
| trend | trend-ema | sandwich | 0.57 | 792 | 0.58 | 1081 | -222.09 | -0.01% |
| trend | trend-st-14-4 | magnet | 0.58 | 2261 | 0.57 | 2705 | -556.69 | -0.01% |
| move | move-impulse-10-2 | sandwich | 0.69 | 1925 | 0.57 | 2329 | -493.49 | -0.01% |
| move | move-impulse-20-2.5 | sandwich | 0.59 | 1423 | 0.56 | 1724 | -371.27 | -0.02% |
| trend | trend-st-21-5 | magnet | 0.58 | 2111 | 0.56 | 2581 | -556.19 | -0.02% |
| bollinger | bb-walk | sandwich | 0.92 | 73 | 0.56 | 84 | -18.38 | -0.02% |
| rsi | rsi-14-20-80 | magnet | 0.62 | 273 | 0.54 | 292 | -67.18 | -0.03% |
| direction | dir-emax | sandwich | 0.54 | 1642 | 0.54 | 2244 | -518.40 | -0.03% |
| ema | ema-9-21 | sandwich | 0.54 | 1642 | 0.54 | 2244 | -518.40 | -0.03% |
| trend | trend-st | sandwich | 0.59 | 2593 | 0.52 | 3273 | -795.63 | -0.04% |
| direction | dir-reclaim-50 | sandwich | 0.55 | 1438 | 0.52 | 1896 | -461.06 | -0.04% |
| direction | dir-vwap-240 | follow | 0.64 | 3235 | 0.51 | 4180 | -1061.29 | -0.05% |
| trend | trend-ema-12-26 | sandwich | 0.49 | 635 | 0.50 | 926 | -238.63 | -0.06% |
| ema | ema-pullback | magnet | 0.61 | 174 | 0.50 | 238 | -61.25 | -0.06% |
| ema | ema-50-100 | follow | 0.60 | 2831 | 0.50 | 3392 | -893.67 | -0.06% |
| trend | trend-ribbon | magnet | 0.59 | 276 | 0.49 | 330 | -87.35 | -0.06% |
| trend | trend-ema-20-50 | magnet | 0.62 | 339 | 0.48 | 393 | -106.84 | -0.07% |
| move | move-cont | sandwich | 0.75 | 228 | 0.47 | 528 | -152.72 | -0.09% |
| bollinger | bb-bounce-20-3 | magnet | 0.00 | 0 | 0.00 | 0 | 0.00 | 0.00% |
| bollinger | bb-walk-50 | sandwich | 0.00 | 1 | 0.00 | 0 | 0.00 | 0.00% |