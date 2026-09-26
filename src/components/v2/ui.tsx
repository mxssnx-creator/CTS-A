import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/** Poll a server function; data is replaced in place (no reload, no scroll jump). */
export function usePoll<T>(fn: () => Promise<T>, ms: number, deps: unknown[] = []): { data: T | null; error: string | null; refresh: () => void; loading: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const alive = useRef(true);
  const run = useCallback(async () => {
    try {
      const d = await fnRef.current();
      if (!alive.current) return;
      setData(d);
      setError(null);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    setLoading(true);
    void run();
    const id = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") void run();
    }, ms);
    return () => {
      alive.current = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, run, ...deps]);
  return { data, error, refresh: run, loading };
}

export const fmt = {
  pf: (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x.toFixed(2) : "–"),
  pct: (x: unknown, d = 2) => (typeof x === "number" && Number.isFinite(x) ? `${x >= 0 ? "+" : ""}${x.toFixed(d)}%` : "–"),
  ratio: (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? `${Math.round(x * 100)}%` : "–"),
  num: (x: unknown, d = 0) => (typeof x === "number" && Number.isFinite(x) ? x.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d }) : "–"),
  usd: (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? `${x >= 0 ? "" : "−"}$${Math.abs(x).toFixed(2)}` : "–"),
  h: (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? `${x.toFixed(1)}h` : "–"),
  frac: (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? `${(x * 100).toFixed(2)}%` : "–"),
  time: (t: unknown) => (typeof t === "number" && t > 0 ? new Date(t).toISOString().slice(5, 16).replace("T", " ") : "–"),
  hour: (t: unknown) => (typeof t === "number" && t > 0 ? new Date(t).toISOString().slice(5, 13).replace("T", " ") + ":00" : "–"),
  ago: (t: unknown) => {
    if (typeof t !== "number" || !t) return "–";
    const s = Math.max(0, Math.round((Date.now() - t) / 1000));
    return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${(s / 3600).toFixed(1)}h ago`;
  },
  bytes: (x: unknown) => (typeof x === "number" ? (x > 1e6 ? `${(x / 1e6).toFixed(1)} MB` : `${(x / 1e3).toFixed(0)} kB`) : "–"),
};

export const tone = (x: unknown, neutral = 0) => (typeof x === "number" ? (x > neutral ? "v2-up" : x < neutral ? "v2-down" : "") : "");
export const pfTone = (x: unknown, min = 1.1) => (typeof x === "number" ? (x >= min ? "v2-up" : x >= 1 ? "v2-warn" : "v2-down") : "");

export function Panel(props: { title?: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={`v2-panel ${props.className ?? ""}`}>
      {props.title !== undefined && (
        <header className="v2-panel-h">
          <div>
            <h2>{props.title}</h2>
            {props.sub && <p>{props.sub}</p>}
          </div>
          {props.right && <div className="v2-right">{props.right}</div>}
        </header>
      )}
      <div className={`v2-panel-b ${props.flush ? "flush" : ""}`}>{props.children}</div>
    </section>
  );
}

export function Kpi(props: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className="v2-panel v2-kpi">
      <div className="l">{props.label}</div>
      <div className={`v ${props.className ?? ""}`}>{props.value}</div>
      {props.sub !== undefined && <div className="s">{props.sub}</div>}
    </div>
  );
}

export function Pill(props: { children: ReactNode; kind?: "ok" | "bad" | "acc" }) {
  return <span className={`v2-pill ${props.kind ?? ""}`}>{props.children}</span>;
}

export function Seg<T extends string | number>(props: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="v2-seg" role="group" aria-label={props.label}>
      {props.options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === props.value} onClick={() => props.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch(props: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-label={props.label} aria-checked={props.checked} className="v2-switch" onClick={() => props.onChange(!props.checked)} />;
}

export function Line(props: { k: ReactNode; v: ReactNode; className?: string }) {
  return (
    <div className="v2-line">
      <span>{props.k}</span>
      <span className={props.className}>{props.v}</span>
    </div>
  );
}

export function Empty(props: { children: ReactNode }) {
  return <div className="v2-empty">{props.children}</div>;
}

export function ErrorNote(props: { error: string | null }) {
  if (!props.error) return null;
  return (
    <div className="v2-panel" style={{ padding: 10, borderColor: "var(--v-down)" }}>
      <span className="v2-down">Server: {props.error}</span>
    </div>
  );
}

export function downloadFile(name: string, text: string, type = "application/json") {
  const blob = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n");
}
