import { useEffect, useSyncExternalStore } from "react";

export type DesignSkin = "desk" | "lattice" | "pulse" | "atlas";

export const DESIGN_SKINS: { id: DesignSkin; name: string; note: string }[] = [
  { id: "desk", name: "Desk", note: "Carbon rail. Current working layout." },
  { id: "lattice", name: "Lattice", note: "Compact editorial. Hairline diagrams, micro type." },
  { id: "pulse", name: "Pulse", note: "Dark instrument. Radar, signal bars, mono tape." },
  { id: "atlas", name: "Atlas", note: "Soft cards. Relation diagrams and rounded overview." },
];

const KEY = "cts-design-skin";

function isSkin(v: string | null): v is DesignSkin {
  return v === "desk" || v === "lattice" || v === "pulse" || v === "atlas";
}

let skin: DesignSkin = "desk";
const listeners = new Set<() => void>();

function applyDom(next: DesignSkin) {
  if (typeof document === "undefined") return;
  if (next === "desk") delete document.documentElement.dataset.skin;
  else document.documentElement.dataset.skin = next;
}

export function getDesignSkin(): DesignSkin {
  return skin;
}

export function setDesignSkin(next: DesignSkin) {
  skin = next;
  applyDom(next);
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* keep in memory */
  }
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useDesignSkin(): DesignSkin {
  const value = useSyncExternalStore(subscribe, getDesignSkin, () => "desk" as DesignSkin);
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(KEY);
    } catch {
      stored = null;
    }
    if (isSkin(stored)) setDesignSkin(stored);
    else applyDom(skin);
  }, []);
  return value;
}
