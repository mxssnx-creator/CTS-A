import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Activity, BarChart3, Cpu, Gauge, Layers, LineChart, Menu, Settings2, SlidersHorizontal, Store, Table2, Wallet } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { coreStatus } from "@/core/api";
import { fmt, Pill, Seg, usePoll } from "./ui";

export type Design = "studio" | "graphite" | "terminal" | "aurora";
export type Density = "comfortable" | "compact";

const NAV: Array<{ group: string; items: Array<{ to: string; label: string; icon: ReactNode; exact?: boolean }> }> = [
  { group: "Desk", items: [{ to: "/v2", label: "Overview", icon: <Gauge size={15} />, exact: true }] },
  {
    group: "Stages",
    items: [
      { to: "/v2/stages", label: "Base → Live", icon: <Layers size={15} /> },
      { to: "/v2/results", label: "Configs", icon: <Table2 size={15} /> },
      { to: "/v2/matrix", label: "Bot × Indication", icon: <BarChart3 size={15} /> },
    ],
  },
  {
    group: "Simulation",
    items: [
      { to: "/v2/hourly", label: "Hour by hour", icon: <LineChart size={15} /> },
      { to: "/v2/compare", label: "Compare presets", icon: <SlidersHorizontal size={15} /> },
    ],
  },
  {
    group: "Execution",
    items: [
      { to: "/v2/trading", label: "Paper & Live", icon: <Wallet size={15} /> },
      { to: "/v2/market", label: "Market", icon: <Store size={15} /> },
    ],
  },
  {
    group: "System",
    items: [
      { to: "/v2/engine", label: "Engine", icon: <Cpu size={15} /> },
      { to: "/v2/settings", label: "Settings", icon: <Settings2 size={15} /> },
    ],
  },
];

function readPref<T extends string>(k: string, allowed: readonly T[], d: T): T {
  try {
    const v = localStorage.getItem(k) as T | null;
    return v && allowed.includes(v) ? v : d;
  } catch {
    return d;
  }
}
function writePref(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
}

export function V2Shell() {
  const [design, setDesign] = useState<Design>("graphite");
  const [density, setDensity] = useState<Density>("comfortable");
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  useEffect(() => {
    setDesign(readPref("cts-v2-design", ["studio", "graphite", "terminal", "aurora"] as const, "graphite"));
    setDensity(readPref("cts-v2-density", ["comfortable", "compact"] as const, "comfortable"));
  }, []);
  const path = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => setOpen(false), [path]);
  const { data, error } = usePoll(() => coreStatus(), 3000);
   
  const st = data as any;
  const title = NAV.flatMap((g) => g.items).find((i) => (i.exact ? path === i.to || path === `${i.to}/` : path.startsWith(i.to)))?.label ?? "Core v2";
  const stateKind = st?.state === "error" ? "bad" : st?.state === "running" || st?.state === "computing" ? "ok" : undefined;
  return (
    <div className="v2" data-design={design} data-density={density}>
      <div className="v2-shell">
        <nav className="v2-nav" data-open={open} aria-label="Core v2">
          <div className="v2-brand">
            <Activity size={18} color="var(--v-accent)" />
            <div>
              CTS-A Core
              <br />
              <small>v2 · honest walk-forward</small>
            </div>
          </div>
          {NAV.map((g) => (
            <div key={g.group}>
              <div className="v2-nav-group">{g.group}</div>
              {g.items.map((i) => (
                <Link key={i.to} to={i.to} activeOptions={{ exact: !!i.exact }}>
                  {i.icon}
                  {i.label}
                </Link>
              ))}
            </div>
          ))}
          <div style={{ marginTop: "auto", padding: "12px 8px 4px" }}>
            <a href="/" style={{ color: "var(--v-nav-muted)", fontSize: "var(--v-fs-sm)" }}>
              ← Desk v1
            </a>
          </div>
        </nav>
        {open && <div className="v2-nav-backdrop" onClick={() => setOpen(false)} aria-hidden />}
        <div className="v2-main">
          <header className="v2-top">
            <button type="button" className="v2-btn v2-mobile-toggle" aria-label="Menu" aria-expanded={open} disabled={!ready} onClick={() => setOpen((o) => !o)}>
              <Menu size={15} />
            </button>
            <h1>{title}</h1>
            {error && <Pill kind="bad">server unreachable</Pill>}
            {st && (
              <>
                <Pill kind={stateKind}>
                  {st.state}
                  {st.state === "computing" || st.state === "backfill" ? ` · ${st.stage} ${Math.round(st.progress * 100)}%` : ""}
                </Pill>
                {st.pending && st.state !== "computing" && <Pill kind="acc">compute queued</Pill>}
                <Pill>{st.source}</Pill>
                {st.live && <Pill kind="bad">live on</Pill>}
                <span className="v2-muted" style={{ fontSize: "var(--v-fs-xs)" }}>
                  bar {fmt.time(st.lastBarT)} · {st.symbols} sym
                </span>
              </>
            )}
            <select className="v2-select" aria-label="Design" value={design} onChange={(e) => { const v = e.target.value as Design; setDesign(v); writePref("cts-v2-design", v); }}>
              <option value="studio">Studio · light</option>
              <option value="graphite">Graphite · dark</option>
              <option value="terminal">Terminal · mono</option>
              <option value="aurora">Aurora · deep</option>
            </select>
            <Seg
              label="Density"
              value={density}
              options={[
                { value: "comfortable", label: "Aa" },
                { value: "compact", label: "compact" },
              ]}
              onChange={(v) => {
                setDensity(v);
                writePref("cts-v2-density", v);
              }}
            />
          </header>
          <main className="v2-content">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
