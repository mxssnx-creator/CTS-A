import { existsSync, readFileSync } from "node:fs";

/**
 * @param {Record<string, any> | null | undefined} incoming
 * @param {string} dest
 */
export function lockDeskSettings(incoming, dest) {
  const body = incoming && typeof incoming === "object" ? { ...incoming } : {};
  delete body.hostCommand;
  let prev = null;
  try {
    if (dest && existsSync(dest)) prev = JSON.parse(readFileSync(dest, "utf8"));
  } catch {
    prev = null;
  }
  const locked = Boolean(prev && (prev.locked === true || prev.activeConnId === "bingx-x01"));
  if (!locked || !prev) return body;
  const th = { ...(body.thresholds || {}) };
  const prevTh = prev.thresholds || {};
  if (prevTh.minPf != null) th.minPf = prevTh.minPf;
  if (prevTh.basePf != null) th.basePf = prevTh.basePf;
  if (prevTh.maxDdt != null) th.maxDdt = prevTh.maxDdt;
  const toggles = { ...(prev.strategyToggles || {}), ...(body.strategyToggles || {}) };
  toggles.dca = false;
  toggles.block = false;
  return {
    ...body,
    locked: true,
    minPf: prev.minPf ?? th.minPf,
    costStep: prev.costStep ?? body.costStep,
    symbolCount: prev.symbolCount ?? body.symbolCount,
    liveSymbolCap: prev.liveSymbolCap ?? body.liveSymbolCap,
    evalSymbolCount: prev.evalSymbolCount ?? body.evalSymbolCount,
    activeConnId: prev.activeConnId || body.activeConnId,
    marginMode: prev.marginMode || body.marginMode,
    minSizeRatio: prev.minSizeRatio ?? body.minSizeRatio,
    sessionPhase: prev.sessionPhase || "running",
    thresholds: th,
    strategyToggles: toggles,
  };
}
