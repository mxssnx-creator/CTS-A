import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { sanitizeDeskSettings, type DeskSettingsSnap } from "./settings-sync.ts";

function settingsPath() {
  return process.env.CTS_A_SETTINGS || "/var/lib/cts-a/desk-settings.json";
}

function parseSnap(raw: string): DeskSettingsSnap | null {
  try {
    return sanitizeDeskSettings(JSON.parse(raw) as Partial<DeskSettingsSnap>);
  } catch {
    return null;
  }
}

function readOne(path: string): DeskSettingsSnap | null {
  try {
    const snap = parseSnap(readFileSync(path, "utf8"));
    if (snap) return snap;
  } catch {
    /* missing or unreadable */
  }
  try {
    return parseSnap(readFileSync(`${path}.tmp`, "utf8"));
  } catch {
    return null;
  }
}

export function readSettingsFile(path = settingsPath()): DeskSettingsSnap | null {
  return readOne(path) ?? readOne("/tmp/cts-a-desk-settings.json");
}

function atomicWrite(dest: string, body: string) {
  mkdirSync(dirname(dest), { recursive: true });
  const tmp = `${dest}.tmp`;
  writeFileSync(tmp, body);
  renameSync(tmp, dest);
}

export function writeSettingsFile(snap: DeskSettingsSnap, path = settingsPath()) {
  const body = JSON.stringify(snap, null, 2);
  try {
    atomicWrite(path, body);
  } catch {
    atomicWrite("/tmp/cts-a-desk-settings.json", body);
  }
}
