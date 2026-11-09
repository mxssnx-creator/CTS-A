/** Causal recent-loss veto. Input is newest-first, already net of costs once. */
export type NegativeLastN = { windows: number[]; mode: "any" | "all"; maxPf: number };
export type NegativeResult = { state: "clear" | "negative" | "insufficient" | "unknown"; pass: boolean; negativeNs: number[] };
export function negativeLastN(raw: unknown): NegativeLastN | undefined {
  if (raw == null) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid negative Last-N");
  const f = raw as Record<string, unknown>, windows = f.windows, mode = f.mode ?? "any", maxPf = f.maxPf ?? 1;
  if (Object.keys(f).some(k=>!["windows","mode","maxPf"].includes(k)) ||
    !Array.isArray(windows) || !windows.length || windows.length > 16 ||
    windows.some(n=>typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 200) ||
    !["any","all"].includes(String(mode)) || typeof maxPf !== "number" || !Number.isFinite(maxPf) || maxPf < 0 || maxPf > 1)
    throw new Error("Invalid negative Last-N");
  return {windows:[...new Set(windows as number[])].sort((a,b)=>a-b), mode:mode as "any"|"all", maxPf};
}
export function negativeLastNDecision(values: readonly (number | null)[], policy?: NegativeLastN): NegativeResult {
  if (!policy) return {state:"clear",pass:true,negativeNs:[]};
  const negativeNs: number[] = [];
  for (const n of policy.windows) {
    if (values.length < n) return {state:"insufficient",pass:false,negativeNs};
    let gain=0, loss=0;
    for (const v of values.slice(0,n)) {
      if (v === null || !Number.isFinite(v)) return {state:"unknown",pass:false,negativeNs};
      gain += Math.max(0,v); loss += Math.max(0,-v);
    }
    if (!Number.isFinite(gain) || !Number.isFinite(loss)) return {state:"unknown",pass:false,negativeNs};
    if (loss > gain && gain <= loss * policy.maxPf) negativeNs.push(n);
  }
  const bad = policy.mode === "any" ? negativeNs.length > 0 : negativeNs.length === policy.windows.length;
  return {state:bad ? "negative" : "clear",pass:!bad,negativeNs};
}
