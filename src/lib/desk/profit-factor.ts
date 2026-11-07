/** Finite no-loss gate score, not a measured ratio or forecast. */
export const PF_NO_LOSS = 4;

/** PF is dimensionless. Tiny nonzero losses must survive unit changes. */
export function profitFactor(profit: number, loss: number): number {
  if (!Number.isFinite(profit) || !Number.isFinite(loss) || profit < 0 || loss < 0) return 0;
  if (loss === 0) return profit > 0 ? PF_NO_LOSS : 0;
  const pf = profit / loss;
  return Number.isFinite(pf) ? pf : 0;
}
