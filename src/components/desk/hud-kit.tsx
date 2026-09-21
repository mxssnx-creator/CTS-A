import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type HudThemeId = "cyan-orange" | "blue-grey" | "mono" | "blue-green" | "amber-navy" | "ice-rose";

export const HUD_THEMES: { id: HudThemeId; label: string }[] = [
  { id: "cyan-orange", label: "Blue / orange" },
  { id: "blue-grey", label: "Blue / grey" },
  { id: "mono", label: "Black / white" },
  { id: "blue-green", label: "Blue / green" },
  { id: "amber-navy", label: "Amber / navy" },
  { id: "ice-rose", label: "Ice / rose" },
];

export function lerpPfColor(pf: number, n: number) {
  if (!(n > 0)) return "var(--hud-muted)";
  if (pf >= 1) return "var(--hud-a)";
  if (pf >= 0.85) return "var(--hud-b)";
  return "var(--hud-bad)";
}

export function HudPanel({
  title,
  kicker,
  action,
  className,
  children,
}: {
  title: string;
  kicker?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("hud-panel relative min-w-0 overflow-hidden", className)}>
      <div className="hud-scan absolute inset-0" />
      <header className="relative flex items-center justify-between gap-3 border-b border-[var(--hud-line)] px-4 py-3">
        <div>
          {kicker ? <p className="hud-kicker">{kicker}</p> : null}
          <h2 className="text-sm font-semibold tracking-wide text-[var(--hud-fg)]">{title}</h2>
        </div>
        {action}
      </header>
      <div className="relative p-4">{children}</div>
    </section>
  );
}

export function HudGauge({
  value,
  label,
  sub,
  max = 3,
}: {
  value: number;
  label: string;
  sub?: string;
  max?: number;
}) {
  const t = Math.max(0, Math.min(1, value / Math.max(0.01, max)));
  const r = 54;
  const c = 2 * Math.PI * r;
  const dash = c * t;
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 160 160" className="h-40 w-40" role="img" aria-label={label}>
        <circle cx="80" cy="80" r="70" fill="none" stroke="var(--hud-line)" strokeWidth="1" />
        <circle cx="80" cy="80" r="62" fill="none" stroke="var(--hud-grid)" strokeWidth="8" />
        <circle
          cx="80"
          cy="80"
          r={r}
          fill="none"
          stroke="var(--hud-a)"
          strokeWidth="6"
          strokeDasharray={`${dash} ${c}`}
          strokeLinecap="round"
          transform="rotate(-90 80 80)"
        />
        <circle cx="80" cy="80" r="54" fill="none" stroke="var(--hud-b)" strokeWidth="1" opacity="0.55" className="hud-orbit" />
        <text x="80" y="78" textAnchor="middle" className="hud-glow fill-[var(--hud-fg)] text-3xl font-semibold">
          {Number.isFinite(value) ? value.toFixed(2) : "—"}
        </text>
        <text x="80" y="98" textAnchor="middle" className="fill-[var(--hud-muted)] text-[10px] uppercase tracking-[0.2em]">
          {label}
        </text>
      </svg>
      {sub ? <p className="mt-1 text-xs text-[var(--hud-muted)]">{sub}</p> : null}
    </div>
  );
}

export function HudRadar({
  axes,
}: {
  axes: { id: string; label: string; pf: number; n: number }[];
}) {
  const cx = 110;
  const cy = 110;
  const r = 78;
  const pts = axes.map((a, i) => {
    const ang = (Math.PI * 2 * i) / Math.max(1, axes.length) - Math.PI / 2;
    const mag = Math.max(0.08, Math.min(1, a.pf / 2.4));
    return { x: cx + Math.cos(ang) * r * mag, y: cy + Math.sin(ang) * r * mag, ax: cx + Math.cos(ang) * r, ay: cy + Math.sin(ang) * r, a };
  });
  const poly = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox="0 0 220 220" className="h-auto w-full max-h-64" role="img" aria-label="Indication radar">
      {[0.33, 0.66, 1].map((s) => (
        <circle key={s} cx={cx} cy={cy} r={r * s} fill="none" stroke="var(--hud-line)" />
      ))}
      {pts.map((p) => (
        <line key={p.a.id} x1={cx} y1={cy} x2={p.ax} y2={p.ay} stroke="var(--hud-grid)" />
      ))}
      <polygon points={poly} fill="color-mix(in srgb, var(--hud-a) 18%, transparent)" stroke="var(--hud-a)" strokeWidth="1.4" />
      {pts.map((p) => (
        <g key={`n-${p.a.id}`}>
          <circle cx={p.x} cy={p.y} r="3" fill={lerpPfColor(p.a.pf, p.a.n)} />
          <text x={p.ax} y={p.ay < cy ? p.ay - 6 : p.ay + 12} textAnchor="middle" className="fill-[var(--hud-muted)] text-[9px] uppercase">
            {p.a.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function HudDepthField({
  layers,
  xLabels,
}: {
  layers: { id: string; label: string; values: number[]; wide?: boolean }[];
  xLabels: string[];
}) {
  const [on, setOn] = useState<string | null>(layers[0]?.id ?? null);
  const ready = layers.filter((l) => l.values.some((v) => Number.isFinite(v)));
  if (!ready.length) {
    return <p className="text-sm text-[var(--hud-muted)]">No last-N layers yet — waiting on live tape.</p>;
  }
  const n = Math.max(...ready.map((l) => l.values.length), 1);
  const w = 640;
  const h = 220;
  const dx = 16;
  const dy = 14;
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" role="img" aria-label="Last-N depth field">
        {ready.map((layer, li) => {
          const ox = li * dx;
          const oy = (ready.length - 1 - li) * dy;
          const max = Math.max(...layer.values.map((v) => Math.abs(v)), 1e-6);
          const pts = layer.values.map((v, j) => {
            const x = 28 + ox + (n <= 1 ? 500 : (j / (n - 1)) * 500);
            const y = 18 + oy + 150 - ((v / max + 1) / 2) * 150;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          });
          const active = (on ?? ready[0]!.id) === layer.id;
          const stroke = layer.wide ? "var(--hud-b)" : "var(--hud-a)";
          return (
            <g key={layer.id} onMouseEnter={() => setOn(layer.id)} className="cursor-pointer">
              <polyline
                points={pts.join(" ")}
                fill="none"
                stroke={stroke}
                strokeWidth={active ? 2.4 : layer.wide ? 1.8 : 1.1}
                opacity={active ? 1 : 0.4 + li * 0.08}
              />
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-2">
        {ready.map((layer) => (
          <button
            key={layer.id}
            type="button"
            onClick={() => setOn(layer.id)}
            className={cn(
              "min-h-11 border px-3 text-xs uppercase tracking-wide transition-[transform,border-color,color] duration-150 ease-out active:scale-[0.96]",
              on === layer.id ? "border-[var(--hud-a)] text-[var(--hud-fg)]" : "border-[var(--hud-line)] text-[var(--hud-muted)]",
            )}
          >
            {layer.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-[var(--hud-muted)]">{xLabels.join(" · ")}</p>
    </div>
  );
}

export function HudBars({
  rows,
}: {
  rows: { id: string; label: string; pf: number; n: number }[];
}) {
  const max = Math.max(...rows.map((r) => r.pf), 1);
  if (!rows.length) return <p className="text-sm text-[var(--hud-muted)]">No indication tape yet.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.id}>
          <div className="flex justify-between text-xs uppercase tracking-wide text-[var(--hud-muted)]">
            <span>{r.label}</span>
            <span className="font-mono text-[var(--hud-fg)]">
              {r.pf.toFixed(2)} · n {r.n}
            </span>
          </div>
          <div className="mt-1 h-1.5 bg-[var(--hud-line)]">
            <div
              className="h-full"
              style={{
                width: `${Math.min(100, (r.pf / max) * 100)}%`,
                background: lerpPfColor(r.pf, r.n),
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function HudDisclose({
  title,
  kicker,
  open,
  onToggle,
  children,
}: {
  title: string;
  kicker?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="hud-panel">
      <button
        type="button"
        onClick={onToggle}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-[transform,background-color] duration-150 ease-out active:scale-[0.96]"
        aria-expanded={open}
      >
        <span>
          {kicker ? <span className="hud-kicker block">{kicker}</span> : null}
          <span className="text-sm font-semibold">{title}</span>
        </span>
        <span className="font-mono text-xs text-[var(--hud-a)]">{open ? "−" : "+"}</span>
      </button>
      {open ? <div className="border-t border-[var(--hud-line)] px-4 py-3">{children}</div> : null}
    </div>
  );
}

export function useHudTheme() {
  const [theme, setTheme] = useState<HudThemeId>(() => {
    try {
      const v = localStorage.getItem("cts-hud-theme");
      if (HUD_THEMES.some((t) => t.id === v)) return v as HudThemeId;
    } catch {
      /* keep */
    }
    return "cyan-orange";
  });
  return {
    theme,
    setTheme: (id: HudThemeId) => {
      setTheme(id);
      try {
        localStorage.setItem("cts-hud-theme", id);
      } catch {
        /* keep */
      }
    },
  };
}

export function mixHour18(hours: Record<string, { pf?: number; n?: number; wr?: number; net?: number }> | undefined) {
  const a = hours?.["12"];
  const b = hours?.["45"] ?? hours?.["50"];
  if (hours?.["18"]) return hours["18"];
  if (!a) return b ?? { pf: 0, n: 0, wr: 0, net: 0 };
  if (!b) return a;
  const t = (18 - 12) / (45 - 12);
  return {
    pf: Number(a.pf || 0) * (1 - t) + Number(b.pf || 0) * t,
    n: Math.round(Number(a.n || 0) * (1 - t) + Number(b.n || 0) * t),
    wr: Number(a.wr || 0) * (1 - t) + Number(b.wr || 0) * t,
    net: Number(a.net || 0) * (1 - t) + Number(b.net || 0) * t,
  };
}
