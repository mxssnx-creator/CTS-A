export type Liquidity = "maker" | "taker";
export interface FeeModel {
  makerBps: number;
  takerBps: number;
  slippageFeePct: number;
  entryLiquidity: Liquidity;
  exitLiquidity: Liquidity;
}
export const DEFAULT_FEES: FeeModel = Object.freeze({ makerBps: 5, takerBps: 8, slippageFeePct: 10,
  entryLiquidity: "taker", exitLiquidity: "taker" });

export function sanitizeFees(input?: Partial<FeeModel> | null): FeeModel {
  const number = (v: unknown, fallback: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? v : fallback;
  return { makerBps: number(input?.makerBps, DEFAULT_FEES.makerBps, 100),
    takerBps: number(input?.takerBps, DEFAULT_FEES.takerBps, 100),
    slippageFeePct: number(input?.slippageFeePct, DEFAULT_FEES.slippageFeePct, 200),
    entryLiquidity: input?.entryLiquidity === "maker" ? "maker" : "taker",
    exitLiquidity: input?.exitLiquidity === "maker" ? "maker" : "taker" };
}

/** Fractions of each leg's notional; slippage is charged once on that leg's fee. */
export function modeledLegRates(model: FeeModel): { entry: number; exit: number } {
  if (!model || !Number.isFinite(model.makerBps) || model.makerBps < 0 || model.makerBps > 100 ||
      !Number.isFinite(model.takerBps) || model.takerBps < 0 || model.takerBps > 100 ||
      !Number.isFinite(model.slippageFeePct) || model.slippageFeePct < 0 || model.slippageFeePct > 200 ||
      !["maker", "taker"].includes(model.entryLiquidity) || !["maker", "taker"].includes(model.exitLiquidity))
    throw new RangeError("invalid modeled fee assumptions");
  const f = model, rate = (kind: Liquidity) =>
    (kind === "maker" ? f.makerBps : f.takerBps) / 10_000 * (1 + f.slippageFeePct / 100);
  return { entry: rate(f.entryLiquidity), exit: rate(f.exitLiquidity) };
}
export function modeledCost(model: FeeModel): number {
  const f = modeledLegRates(model);
  return +(f.entry + f.exit).toFixed(12);
}
export function effectiveFees(fallback: FeeModel, exchange?: { makerBps: number; takerBps: number } | null): FeeModel {
  return sanitizeFees(exchange ? { ...fallback, makerBps: exchange.makerBps, takerBps: exchange.takerBps } : fallback);
}
