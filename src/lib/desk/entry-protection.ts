import type { LiveOrder, Side } from "./types.ts";

/** Rebase the exact source order's captured geometry onto its actual submitted entry price. */
export function capturedEntryProtection(order: LiveOrder | undefined, intent: {
  orderId: string; connId: string; symbol: string; side: Side; entry: number;
}): {sl:number;tp?:number}|null {
  if(!order||order.id!==intent.orderId||order.connId!==intent.connId||order.symbol!==intent.symbol||order.side!==intent.side)
    return null;
  if(![order.price,order.slDist,intent.entry].every(x=>Number.isFinite(x)&&x>0))return null;
  if(!Number.isFinite(order.tpDist)||order.tpDist<0||(!order.tpDist&&!(Number(order.trailPct)>0)))return null;
  const sign=intent.side==="long"?1:-1;
  const sl=intent.entry*(1-sign*order.slDist/order.price),tp=order.tpDist?intent.entry*(1+sign*order.tpDist/order.price):undefined;
  return sl>0&&(tp===undefined||tp>0)?{sl,...(tp===undefined?{}:{tp})}:null;
}
