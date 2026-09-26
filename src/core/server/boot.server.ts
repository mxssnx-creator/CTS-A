// Starts the Core v2 runtime with the server process (not on the first viewer request), so the engine runs
// continuously. Disable with CTS_CORE_AUTOSTART=0.
import { coreRuntime } from "./runtime.server.ts";

export function bootCore(): string {
  if (process.env.CTS_CORE_AUTOSTART === "0") return "autostart disabled";
  const rt = coreRuntime();
  return `core v2 runtime ${rt.status.state}`;
}
