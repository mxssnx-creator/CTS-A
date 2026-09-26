// Bot entry triggers. Eight fade-to-magnet bots (semantics of the desk bots, without look-ahead) plus
// "follow", which enters on indication onsets. A bot × indication combo = trigger AND indication agrees.
import type { BotType, Side } from "../domain/types.ts";
import type { SeriesCache } from "../indications/cache.ts";
import { indicationState } from "../indications/registry.ts";

export interface BotSpec {
  type: BotType;
  label: string;
  magnet: string;
  thesis: string;
}

export const BOTS: readonly BotSpec[] = [
  { type: "sandwich", label: "Sandwich", magnet: "1H VWAP", thesis: "Fade a stretch away from the hour VWAP once price turns back." },
  { type: "snap", label: "Snap", magnet: "1H VWAP + RSI", thesis: "VWAP fade confirmed by an RSI extreme." },
  { type: "pulse", label: "Pulse", magnet: "1H VWAP (expansion)", thesis: "VWAP fade only when this hour's range exceeds the last hour's." },
  { type: "ribbon", label: "Ribbon", magnet: "EMA21", thesis: "Fade a stretch from EMA21." },
  { type: "sweep", label: "Sweep", magnet: "Prior hour extreme", thesis: "Wick through the prior hour high/low, then reclaim." },
  { type: "clamp", label: "Clamp", magnet: "Hour open", thesis: "Fade a stretch from the hour open." },
  { type: "magnet", label: "Magnet", magnet: "Prior hour VWAP", thesis: "First half of the hour: fade back to the prior hour VWAP." },
  { type: "pivot", label: "Pivot", magnet: "Prior hour pivot", thesis: "Fade toward the prior hour (H+L+C)/3." },
  { type: "follow", label: "Follow", magnet: "—", thesis: "Enter in the indication's direction when its state turns on." },
  { type: "revert", label: "Revert", magnet: "—", thesis: "Fade the indication: enter against its direction when its state turns on." },
];

export const BOT_BY_TYPE: ReadonlyMap<BotType, BotSpec> = new Map(BOTS.map((b) => [b.type, b]));

/** Stretch threshold in ATR(14) units. */
export const FADE_ATR = 0.9;
const HOUR = 3_600_000;

function fade(k: SeriesCache, magnet: Float64Array, extra?: (i: number, side: Side) => boolean): Int8Array {
  const { c, n } = k.b;
  const a = k.atr(14);
  const out = new Int8Array(n);
  for (let i = 1; i < n; i++) {
    const m = magnet[i];
    const at = a[i];
    if (!Number.isFinite(m) || !Number.isFinite(at) || at <= 0) continue;
    const d = c[i] - m;
    if (d < -FADE_ATR * at && c[i] > c[i - 1]) {
      if (!extra || extra(i, 1)) out[i] = 1;
    } else if (d > FADE_ATR * at && c[i] < c[i - 1]) {
      if (!extra || extra(i, -1)) out[i] = -1;
    }
  }
  return out;
}

export function botTrigger(type: BotType, k: SeriesCache): Int8Array | null {
  if (type === "follow" || type === "revert") return null;
  return k.memo(`bot:${type}`, () => {
    const per = k.period(HOUR);
    const { t, c, h, l, n } = k.b;
    switch (type) {
      case "sandwich":
        return fade(k, per.curVwap);
      case "snap": {
        const r = k.rsi(14);
        return fade(k, per.curVwap, (i, s) => (s === 1 ? r[i] < 35 : r[i] > 65));
      }
      case "pulse":
        return fade(k, per.curVwap, (i) => per.curRange[i] > per.prevRange[i]);
      case "ribbon":
        return fade(k, k.ema(21));
      case "clamp":
        return fade(k, per.curOpen);
      case "magnet":
        return fade(k, per.prevVwap, (i) => (t[i] % HOUR) / 60_000 < 30);
      case "pivot":
        return fade(k, per.prevPivot);
      case "sweep": {
        const out = new Int8Array(n);
        for (let i = 0; i < n; i++) {
          const ph = per.prevHigh[i];
          const pl = per.prevLow[i];
          if (!Number.isFinite(ph)) continue;
          if (l[i] < pl && c[i] > pl) out[i] = 1;
          else if (h[i] > ph && c[i] < ph) out[i] = -1;
        }
        return out;
      }
      default:
        return new Int8Array(n);
    }
  });
}

/** Final entry signal for a bot × indication combo. Returns null when the combo is not defined. */
export function comboSignal(bot: BotType, ind: string, k: SeriesCache): Int8Array | null {
  return k.memo(`combo:${bot}:${ind}`, () => {
    const st = indicationState(ind, k);
    if (bot === "follow" || bot === "revert") {
      if (!st) return null;
      const dir = bot === "follow" ? 1 : -1;
      const out = new Int8Array(k.b.n);
      for (let i = 1; i < st.length; i++) if (st[i] !== 0 && st[i] !== st[i - 1]) out[i] = st[i] * dir;
      return out;
    }
    const trig = botTrigger(bot, k)!;
    if (!st) return trig;
    const out = new Int8Array(trig.length);
    for (let i = 0; i < trig.length; i++) if (trig[i] !== 0 && st[i] === trig[i]) out[i] = trig[i];
    return out;
  });
}
