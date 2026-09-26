// Honest bar simulator.
// - A signal is decided on the CLOSE of bar i and entered at the OPEN of bar i+1 (no look-ahead).
// - Intrabar order is unknown, so the stop is checked before the target (pessimistic).
// - The trailing stop tightens from the peak of completed bars only; the new level applies from the next bar.
// - Every closed trade pays the round-trip cost on notional.
import type { Bars, OpenPosition, Protect, Side, Trade } from "../domain/types.ts";

export interface SimOptions {
  cost: number;
  /** bars to wait after an exit before a new signal can enter */
  cooldown?: number;
}

export interface SimResult {
  trades: Trade[];
  open: OpenPosition | null;
  /** signal on the last closed bar that would enter at the next open */
  pending: Side | 0;
}

export function simulate(cfg: string, bars: Bars, sig: Int8Array, p: Protect, opt: SimOptions): SimResult {
  const { n, t, o, h, l, c, sym } = bars;
  const cost = opt.cost;
  const cooldown = opt.cooldown ?? 0;
  const trades: Trade[] = [];
  let inPos = false;
  let side: Side = 1;
  let entryI = 0;
  let entry = 0;
  let stop = 0;
  let target = 0;
  let peak = 0;
  let trailOn = false;
  let mfe = 0;
  let mae = 0;
  let nextAllowed = 0;

  const close = (i: number, exit: number, reason: Trade["reason"], exitT: number) => {
    const r = (side * (exit - entry)) / entry - cost;
    trades.push({
      cfg,
      sym,
      side,
      entryT: t[entryI],
      exitT,
      entry,
      exit,
      r,
      reason,
      bars: i - entryI + 1,
      mfe,
      mae,
    });
    inPos = false;
    nextAllowed = i + cooldown;
  };

  for (let i = 0; i < n; i++) {
    if (inPos && i >= entryI) {
      const gap = i > entryI;
      const barEnd = t[i] + bars.tfMin * 60_000;
      if (side === 1) {
        const up = (h[i] - entry) / entry;
        const dn = (entry - l[i]) / entry;
        if (up > mfe) mfe = up;
        if (dn > mae) mae = dn;
        if (l[i] <= stop) {
          close(i, gap ? Math.min(o[i], stop) : stop, trailOn ? "trail" : "sl", barEnd);
        } else if (h[i] >= target) {
          close(i, gap ? Math.max(o[i], target) : target, "tp", barEnd);
        }
      } else {
        const up = (entry - l[i]) / entry;
        const dn = (h[i] - entry) / entry;
        if (up > mfe) mfe = up;
        if (dn > mae) mae = dn;
        if (h[i] >= stop) {
          close(i, gap ? Math.max(o[i], stop) : stop, trailOn ? "trail" : "sl", barEnd);
        } else if (l[i] <= target) {
          close(i, gap ? Math.min(o[i], target) : target, "tp", barEnd);
        }
      }
      if (inPos) {
        if (i - entryI + 1 >= p.hold) {
          close(i, c[i], "time", barEnd);
        } else if (p.trail > 0) {
          if (side === 1) {
            if (h[i] > peak) peak = h[i];
            if ((peak - entry) / entry >= p.trail) {
              trailOn = true;
              const lvl = peak * (1 - p.trail);
              if (lvl > stop) stop = lvl;
            }
          } else {
            if (l[i] < peak) peak = l[i];
            if ((entry - peak) / entry >= p.trail) {
              trailOn = true;
              const lvl = peak * (1 + p.trail);
              if (lvl < stop) stop = lvl;
            }
          }
        }
      }
    }
    if (!inPos && i >= nextAllowed && i + 1 < n) {
      const s = sig[i];
      if (s !== 0) {
        inPos = true;
        side = s > 0 ? 1 : -1;
        entryI = i + 1;
        entry = o[i + 1];
        stop = side === 1 ? entry * (1 - p.sl) : entry * (1 + p.sl);
        target = side === 1 ? entry * (1 + p.tp) : entry * (1 - p.tp);
        peak = entry;
        trailOn = false;
        mfe = 0;
        mae = 0;
      }
    }
  }

  let open: OpenPosition | null = null;
  if (inPos) {
    const last = c[n - 1];
    open = {
      cfg,
      sym,
      side,
      entryT: t[entryI],
      entryI,
      entry,
      stop,
      target,
      peak,
      trailOn,
      mtm: (side * (last - entry)) / entry - cost,
    };
  }
  const lastSig = n > 0 ? sig[n - 1] : 0;
  const pending: Side | 0 = !inPos && n > 0 && n - 1 >= nextAllowed && lastSig !== 0 ? (lastSig > 0 ? 1 : -1) : 0;
  return { trades, open, pending };
}

/** Merge per-symbol trade lists into one tape ordered by exit time (stable on entry time). */
export function mergeTapes(lists: readonly Trade[][]): Trade[] {
  const all: Trade[] = [];
  for (const l of lists) for (const tr of l) all.push(tr);
  all.sort((a, b) => a.exitT - b.exitT || a.entryT - b.entryT || (a.sym < b.sym ? -1 : 1));
  return all;
}
