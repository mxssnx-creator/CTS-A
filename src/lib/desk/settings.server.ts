import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { sanitizeDeskSettings, type DeskSettingsSnap } from "./settings-sync.ts";

function settingsPath() {
  return process.env.CTS_A_SETTINGS || "/var/lib/cts-a/desk-settings.json";
}

export function readSettingsFile(path = settingsPath()): DeskSettingsSnap | null {
  try {
    return sanitizeDeskSettings(JSON.parse(readFileSync(path, "utf8")) as Partial<DeskSettingsSnap>);
  } catch {
    try {
      return sanitizeDeskSettings(
        JSON.parse(readFileSync("/tmp/cts-a-desk-settings.json", "utf8")) as Partial<DeskSettingsSnap>,
      );
    } catch {
      return null;
    }
  }
}

export function writeSettingsFile(snap: DeskSettingsSnap, path = settingsPath()) {
  const body = JSON.stringify(snap, null, 2);
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body);
  } catch {
    writeFileSync("/tmp/cts-a-desk-settings.json", body);
  }
}
