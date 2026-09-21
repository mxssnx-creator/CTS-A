import type { ReactNode } from "react";
import { LAST_N_OPTIONS, type LastNChoice } from "@/lib/desk/engine";
import { cn, clsPnl, fmtNum, fmtPct, fmtSigned } from "@/lib/utils";

export function Panel({
  title,
  action,
  className,
  children,
  padded = true,
}: {
  title?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
  padded?: boolean;
}) {
  return (
    <section className={cn("min-w-0 border border-border bg-surface shadow-panel", className)}>
      {title ? (
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold tracking-tight text-fg">{title}</h2>
          {action}
        </header>
      ) : null}
      <div className={padded ? "p-4" : ""}>{children}</div>
    </section>
  );
}

export function Kpi({
  label,
  value,
  delta,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  delta?: number;
  hint?: string;
  tone?: "neutral" | "up" | "down" | "accent";
}) {
  const valueCls =
    tone === "up"
      ? "text-up"
      : tone === "down"
        ? "text-down"
        : tone === "accent"
          ? "text-primary"
          : "text-fg";
  return (
    <div className="min-w-0 border border-border bg-surface px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-subtle">{label}</div>
      <div className={cn("mt-1 font-mono text-xl font-semibold tabular leading-tight", valueCls)}>
        {value}
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-muted">
        {typeof delta === "number" ? (
          <span className={clsPnl(delta)}>{fmtSigned(delta, 2)}</span>
        ) : null}
        {hint ? <span>{hint}</span> : null}
      </div>
    </div>
  );
}

/** Dashboard-style KPI with a progress ring (share of a target, not a second metric). */
export function RingKpi({
  label,
  value,
  hint,
  progress,
  tone = "accent",
  delta,
}: {
  label: string;
  value: string;
  hint?: string;
  progress: number;
  tone?: "neutral" | "up" | "down" | "accent";
  delta?: string;
}) {
  const p = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const r = 18;
  const c = 2 * Math.PI * r;
  const stroke =
    tone === "up"
      ? "var(--color-up)"
      : tone === "down"
        ? "var(--color-down)"
        : tone === "accent"
          ? "var(--color-primary)"
          : "var(--color-muted)";
  const valueCls =
    tone === "up" ? "text-up" : tone === "down" ? "text-down" : tone === "accent" ? "text-primary" : "text-fg";
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 border border-border bg-surface px-4 py-3">
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-wide text-subtle">{label}</div>
        <div className={cn("mt-1 font-mono text-xl font-semibold tabular leading-tight", valueCls)}>{value}</div>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted">
          {delta ? <span className={valueCls}>{delta}</span> : null}
          {hint ? <span>{hint}</span> : null}
        </div>
      </div>
      <svg width="52" height="52" viewBox="0 0 48 48" className="shrink-0" aria-hidden>
        <circle cx="24" cy="24" r={r} fill="none" stroke="var(--color-surface-muted)" strokeWidth="4" />
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="4"
          strokeLinecap="butt"
          strokeDasharray={`${c * p} ${c}`}
          transform="rotate(-90 24 24)"
        />
      </svg>
    </div>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "up" | "down" | "accent" | "warn";
}) {
  const cls =
    tone === "up"
      ? "bg-up-soft text-up"
      : tone === "down"
        ? "bg-down-soft text-down"
        : tone === "accent"
          ? "bg-primary-soft text-info"
          : tone === "warn"
            ? "bg-warn text-fg"
            : "bg-surface-muted text-muted";
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 text-xs font-medium", cls)}>
      {children}
    </span>
  );
}

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

export const controlClass =
  "h-10 w-full border border-border bg-surface px-3 text-sm text-fg outline-none transition-colors duration-150 hover:border-border-strong focus:border-primary";

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
}) {
  return (
    <div className="inline-flex border border-border bg-surface">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "h-8 px-3 text-xs font-medium transition-[transform,background-color,color] duration-150 ease-out active:scale-[0.96]",
            value === o.id ? "bg-primary text-primary-fg" : "text-muted hover:bg-surface-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function StatLine({
  k,
  v,
  tone,
}: {
  k: string;
  v: string;
  tone?: "up" | "down" | "neutral";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-xs text-muted">{k}</span>
      <span
        className={cn(
          "font-mono text-sm tabular",
          tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-fg",
        )}
      >
        {v}
      </span>
    </div>
  );
}

export function pfTone(pf: number): "up" | "down" | "neutral" {
  if (pf >= 1.2) return "up";
  if (pf < 1) return "down";
  return "neutral";
}

export function signedTone(n: number): "up" | "down" | "neutral" {
  if (n > 0) return "up";
  if (n < 0) return "down";
  return "neutral";
}

export function fmtPf(n: number) {
  if (!Number.isFinite(n)) return "—";
  return fmtNum(n, 2);
}

export function fmtWr(n: number) {
  return fmtPct(n, 1).replace("+", "");
}

export function fmtMdd(n: number) {
  return fmtPct(-Math.abs(n), 1);
}

export function fmtR(n: number) {
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${fmtNum(n, 2)}R`;
}

export function LastNChips({
  value,
  onChange,
  name,
}: {
  value: number;
  onChange: (n: LastNChoice) => void;
  name?: string;
}) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label={name ?? "Last N"}>
      {LAST_N_OPTIONS.map((n) => (
        <button
          key={n}
          type="button"
          aria-pressed={value === n}
          onClick={() => onChange(n)}
          className={cn(
            "h-11 min-w-11 px-3 text-xs font-medium transition-[transform,background-color,color] duration-150 ease-out active:scale-[0.96] sm:h-8",
            value === n ? "bg-primary text-primary-fg" : "bg-surface-muted text-muted hover:text-fg",
          )}
        >
          N{n}
        </button>
      ))}
    </div>
  );
}

export function Meter({
  label,
  value,
  max,
  hint,
}: {
  label: string;
  value: number;
  max: number;
  hint?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-muted">{label}</span>
        <span className="font-mono tabular text-fg">{hint ?? `${value}/${max}`}</span>
      </div>
      <div className="mt-1 h-1.5 w-full bg-surface-muted">
        <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
