import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtNum, fmtPct, fmtPx, fmtUsd } from "@/lib/utils";
import type { ComboPoint } from "@/lib/desk/types";

const TIP = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 0,
  fontSize: 12,
} as const;

const TICK = { fill: "var(--color-muted)", fontSize: 11 };

const TACTIC_FILL: Record<string, string> = {
  trailing: "var(--color-primary)",
  dca: "var(--color-info)",
  axis: "var(--color-muted)",
  hybrid: "var(--color-up)",
};

export function EquityChart({ data }: { data: { i: number; eq: number }[] }) {
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="axisEq" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="i" hide />
          <YAxis
            width={52}
            tick={TICK}
            tickFormatter={(v) => fmtNum(v, 0)}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip contentStyle={TIP} formatter={(v: number) => [fmtUsd(v), "Equity"]} />
          <Area
            type="monotone"
            dataKey="eq"
            stroke="var(--color-primary)"
            fill="url(#axisEq)"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PriceChart({
  data,
  replayIndex,
}: {
  data: { i: number; c: number; signal: number }[];
  replayIndex?: number;
}) {
  const slice = typeof replayIndex === "number" ? data.slice(0, replayIndex + 1) : data;
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={slice} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="i" hide />
          <YAxis
            width={56}
            domain={["auto", "auto"]}
            tick={TICK}
            tickFormatter={(v) => fmtPx(v)}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip contentStyle={TIP} formatter={(v: number) => [fmtPx(v), "Close"]} />
          <Line type="monotone" dataKey="c" stroke="var(--color-fg)" strokeWidth={1.4} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function OccupancyChart({ data }: { data: { i: number; pos: number; ord: number }[] }) {
  if (!data.length) {
    return <p className="px-4 py-8 text-sm text-muted">No occupancy samples.</p>;
  }
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="i" hide />
          <YAxis width={36} tick={TICK} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={TIP}
            formatter={(v: number, name: string) => [fmtNum(v, 2), name === "pos" ? "Positions" : "Orders"]}
          />
          <Area type="monotone" dataKey="pos" stroke="var(--color-primary)" fill="var(--color-primary)" fillOpacity={0.18} strokeWidth={1.4} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="ord" stroke="var(--color-info)" strokeWidth={1.25} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MultiCurveChart({
  data,
  title,
}: {
  data: readonly { i: number; eq?: number; dd?: number; pf?: number; vol?: number }[];
  title?: string;
}) {
  if (!data.length) {
    return <p className="px-4 py-8 text-sm text-muted">{title ?? "No window yet."}</p>;
  }
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={[...data]} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="ovEq" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="i" tick={TICK} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis yAxisId="eq" width={48} tick={TICK} axisLine={false} tickLine={false} tickFormatter={(v) => fmtNum(v, 2)} />
          <YAxis yAxisId="pf" orientation="right" width={40} tick={TICK} axisLine={false} tickLine={false} tickFormatter={(v) => fmtNum(v, 2)} />
          <Tooltip
            contentStyle={TIP}
            formatter={(v: number, name: string) => {
              if (name === "dd") return [fmtPct(v, 1), "Drawdown"];
              if (name === "pf") return [fmtNum(v, 2), "PF"];
              if (name === "vol") return [fmtUsd(v), "Volume"];
              return [fmtUsd(v), "Equity"];
            }}
          />
          <Area yAxisId="eq" type="monotone" dataKey="eq" stroke="var(--color-primary)" fill="url(#ovEq)" strokeWidth={1.6} dot={false} isAnimationActive={false} />
          <Bar yAxisId="eq" dataKey="vol" fill="var(--color-info)" fillOpacity={0.18} maxBarSize={6} isAnimationActive={false} />
          <Line yAxisId="pf" type="monotone" dataKey="pf" stroke="var(--color-up)" strokeWidth={1.4} dot={false} isAnimationActive={false} />
          <Line yAxisId="pf" type="monotone" dataKey="dd" stroke="var(--color-down)" strokeWidth={1.2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DualEquityChart({
  data,
  xLabel,
}: {
  data: { t: number; eq: number; dd: number }[];
  xLabel?: string;
}) {
  if (!data.length) {
    return <p className="px-4 py-8 text-sm text-muted">No equity samples yet.</p>;
  }
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
          <defs>
            <linearGradient id="statsEq" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="t"
            tick={TICK}
            tickFormatter={(v) => fmtNum(v, 0)}
            axisLine={false}
            tickLine={false}
            label={xLabel ? { value: xLabel, fill: "var(--color-subtle)", fontSize: 11, position: "insideBottomRight" } : undefined}
          />
          <YAxis
            yAxisId="eq"
            width={52}
            tick={TICK}
            tickFormatter={(v) => fmtNum(v, 0)}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="dd"
            orientation="right"
            width={44}
            tick={TICK}
            tickFormatter={(v) => fmtPct(v, 2)}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={TIP}
            formatter={(v: number, name: string) =>
              name === "dd" ? [fmtPct(v, 2), "Drawdown"] : [fmtUsd(v), "Equity"]
            }
            labelFormatter={(l) => `${xLabel ?? "t"} ${fmtNum(Number(l), 1)}`}
          />
          <Area
            yAxisId="eq"
            type="monotone"
            dataKey="eq"
            stroke="var(--color-primary)"
            fill="url(#statsEq)"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            yAxisId="dd"
            type="monotone"
            dataKey="dd"
            stroke="var(--color-down)"
            strokeWidth={1.25}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MetricBarChart({
  data,
  yLabel = "PF",
  formatY = (v: number) => fmtNum(v, 2),
}: {
  data: { label: string; value: number }[];
  yLabel?: string;
  formatY?: (v: number) => string;
}) {
  if (!data.length) {
    return <p className="px-4 py-8 text-sm text-muted">No series.</p>;
  }
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="label" tick={TICK} axisLine={false} tickLine={false} interval={0} />
          <YAxis
            width={48}
            tick={TICK}
            tickFormatter={formatY}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={TIP}
            formatter={(v: number) => [formatY(v), yLabel]}
          />
          <Bar dataKey="value" fill="var(--color-primary)" radius={0} maxBarSize={36} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HourPfChart({
  data,
}: {
  data: { label: string; value: number; net?: number; empty?: boolean }[];
}) {
  if (!data.length) {
    return <p className="px-4 py-8 text-sm text-muted">No hourly tape yet.</p>;
  }
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="label" tick={TICK} axisLine={false} tickLine={false} interval={2} />
          <YAxis width={48} tick={TICK} tickFormatter={(v) => fmtNum(v, 1)} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={TIP} formatter={(v: number) => [fmtNum(v, 2), "PF"]} />
          <ReferenceLine y={1} stroke="var(--color-border-strong)" strokeDasharray="3 3" />
          <Bar dataKey="value" radius={0} maxBarSize={18} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={
                  d.empty
                    ? "var(--color-surface-muted)"
                    : d.value >= 1 || (d.net ?? 0) >= 0
                      ? "var(--color-up)"
                      : "var(--color-down)"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HBarChart({
  data,
  yLabel = "PF",
  formatY = (v: number) => fmtNum(v, 2),
}: {
  data: { label: string; value: number }[];
  yLabel?: string;
  formatY?: (v: number) => string;
}) {
  if (!data.length) {
    return <p className="px-4 py-8 text-sm text-muted">No series.</p>;
  }
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
        >
          <CartesianGrid stroke="var(--color-border)" horizontal={false} />
          <XAxis type="number" tick={TICK} tickFormatter={formatY} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="label"
            width={120}
            tick={TICK}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip contentStyle={TIP} formatter={(v: number) => [formatY(v), yLabel]} />
          <Bar dataKey="value" fill="var(--color-primary)" radius={0} maxBarSize={18} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CostLineChart({ data }: { data: { label: string; value: number }[] }) {
  if (!data.length) {
    return <p className="px-4 py-8 text-sm text-muted">No cost steps.</p>;
  }
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
          <defs>
            <linearGradient id="costPf" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.2} />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="label" tick={TICK} axisLine={false} tickLine={false} interval={3} />
          <YAxis
            width={44}
            tick={TICK}
            tickFormatter={(v) => fmtNum(v, 2)}
            axisLine={false}
            tickLine={false}
            domain={["auto", "auto"]}
          />
          <Tooltip contentStyle={TIP} formatter={(v: number) => [fmtNum(v, 2), "Avg PF"]} />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--color-primary)"
            fill="url(#costPf)"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HistChart({
  data,
  yLabel = "Count",
}: {
  data: { bin: string; n: number; pass?: number }[];
  yLabel?: string;
}) {
  if (!data.length) {
    return <p className="px-4 py-8 text-sm text-muted">No distribution.</p>;
  }
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="bin" tick={TICK} axisLine={false} tickLine={false} interval={0} />
          <YAxis width={36} tick={TICK} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={TIP}
            formatter={(v: number, name: string) => [v, name === "pass" ? "Pass" : yLabel]}
          />
          <Bar dataKey="n" fill="var(--color-surface-muted)" radius={0} maxBarSize={28} isAnimationActive={false} />
          {data.some((d) => typeof d.pass === "number") ? (
            <Bar dataKey="pass" fill="var(--color-primary)" radius={0} maxBarSize={28} isAnimationActive={false} />
          ) : null}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HourlyChart({ data }: { data: { h: number; net: number; trades: number; eq: number }[] }) {
  if (!data.length) {
    return <p className="px-4 py-8 text-sm text-muted">Run a simulation to plot hourly net.</p>;
  }
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="h" tick={TICK} axisLine={false} tickLine={false} />
          <YAxis
            width={52}
            tick={TICK}
            tickFormatter={(v) => fmtNum(v, 1)}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={TIP}
            formatter={(v: number) => [fmtUsd(v), "Hour net"]}
            labelFormatter={(l) => `Hour ${l}`}
          />
          <ReferenceLine y={0} stroke="var(--color-border-strong)" />
          <Bar dataKey="net" radius={0} maxBarSize={22} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.net >= 0 ? "var(--color-up)" : "var(--color-down)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MixChart({
  sl,
  tp,
  downLabel = "Stop loss",
  upLabel = "Take profit",
  unit = "Exits",
}: {
  sl: number;
  tp: number;
  downLabel?: string;
  upLabel?: string;
  unit?: string;
}) {
  const total = sl + tp;
  const data = [
    { label: downLabel, value: sl },
    { label: upLabel, value: tp },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="label" width={88} tick={TICK} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TIP} formatter={(v: number) => [v, unit]} />
            <Bar dataKey="value" radius={0} maxBarSize={22} isAnimationActive={false}>
              <Cell fill="var(--color-down)" />
              <Cell fill="var(--color-up)" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex h-3 w-full overflow-hidden bg-surface-muted">
        <div
          className="h-full bg-down"
          style={{ width: total ? `${(sl / total) * 100}%` : "50%" }}
        />
        <div
          className="h-full bg-up"
          style={{ width: total ? `${(tp / total) * 100}%` : "50%" }}
        />
      </div>
      <p className="text-xs text-muted">
        {total
          ? `${fmtNum((tp / total) * 100, 0)}% ${upLabel.toLowerCase()} · ${fmtNum((sl / total) * 100, 0)}% ${downLabel.toLowerCase()}`
          : `No ${unit.toLowerCase()}`}
      </p>
    </div>
  );
}

export function PfScatterChart({ data }: { data: ComboPoint[] }) {
  if (!data.length) {
    return <p className="px-4 py-8 text-sm text-muted">No combination sample.</p>;
  }
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid stroke="var(--color-border)" />
          <XAxis
            type="number"
            dataKey="lastNPf"
            name="Last N PF"
            tick={TICK}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => fmtNum(v, 1)}
          />
          <YAxis
            type="number"
            dataKey="pf"
            name="Full PF"
            width={40}
            tick={TICK}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => fmtNum(v, 1)}
          />
          <Tooltip
            contentStyle={TIP}
            formatter={(v: number, name: string) => [fmtNum(v, 2), name === "pf" ? "Full PF" : "Last N PF"]}
          />
          <Scatter data={data} fill="var(--color-primary)" isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell key={i} fill={TACTIC_FILL[d.tactic] ?? "var(--color-primary)"} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

const CHART_STROKES = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
] as const;

export type ChartLayer = { id: string; label: string; values: number[] };

function layerNorm(values: number[]) {
  const max = Math.max(...values.map((v) => Math.abs(v)), 1e-9);
  return values.map((v) => v / max);
}

/** SciChart-style stacked traces: each layer is a depth slice of the same X. */
export function WaterfallStack({
  layers,
  xLabels,
  height = 280,
}: {
  layers: ChartLayer[];
  xLabels?: string[];
  height?: number;
}) {
  const [active, setActive] = useState(0);
  const ready = layers.filter((l) => l.values.some((v) => Number.isFinite(v)));
  if (!ready.length) {
    return <p className="px-4 py-8 text-sm text-muted">No waterfall layers yet.</p>;
  }
  const n = Math.max(...ready.map((l) => l.values.length), 1);
  const w = 720;
  const h = height;
  const padL = 36;
  const padR = 88;
  const padT = 28;
  const padB = 28;
  const dx = 14;
  const dy = 18;
  const innerW = w - padL - padR - dx * Math.max(0, ready.length - 1);
  const innerH = h - padT - padB - dy * Math.max(0, ready.length - 1);
  const hit = ready[Math.max(0, Math.min(active, ready.length - 1))]!;
  return (
    <div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Waterfall ${hit.label}`}
      >
        {ready.map((layer, li) => {
          const ox = li * dx;
          const oy = (ready.length - 1 - li) * dy;
          const norm = layerNorm(layer.values);
          const pts = norm.map((v, j) => {
            const x = padL + ox + (n <= 1 ? innerW / 2 : (j / (n - 1)) * innerW);
            const y = padT + oy + innerH - ((v + 1) / 2) * innerH;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          });
          const baseY = padT + oy + innerH;
          const first = pts[0]?.split(",")[0] ?? String(padL + ox);
          const last = pts[pts.length - 1]?.split(",")[0] ?? String(padL + ox + innerW);
          const fill = `M${first},${baseY.toFixed(1)} L${pts.join(" ")} L${last},${baseY.toFixed(1)} Z`;
          const on = li === active;
          return (
            <g key={layer.id} onMouseEnter={() => setActive(li)} className="cursor-pointer">
              <path d={fill} fill={CHART_STROKES[li % CHART_STROKES.length]} opacity={on ? 0.22 : 0.08} />
              <polyline
                points={pts.join(" ")}
                fill="none"
                stroke={CHART_STROKES[li % CHART_STROKES.length]}
                strokeWidth={on ? 2.2 : 1.1}
                opacity={on ? 1 : 0.55}
              />
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
        {ready.map((layer, li) => (
          <button
            key={layer.id}
            type="button"
            onClick={() => setActive(li)}
            className={
              li === active
                ? "font-medium text-fg transition-[transform,color] duration-150 ease-out active:scale-[0.96]"
                : "text-muted transition-[transform,color] duration-150 ease-out hover:text-fg active:scale-[0.96]"
            }
          >
            <span
              className="mr-1 inline-block size-2"
              style={{ background: CHART_STROKES[li % CHART_STROKES.length] }}
            />
            {layer.label}
          </button>
        ))}
        {xLabels?.length ? <span className="ml-auto">{xLabels.join(" · ")}</span> : null}
      </div>
      <p className="mt-1 text-xs text-muted">
        Front slice <span className="font-medium text-fg">{hit.label}</span>
        {" · "}
        {hit.values.map((v, i) => `${xLabels?.[i] ?? i}:${fmtNum(v, 2)}`).join("  ")}
      </p>
    </div>
  );
}

/** Two-series overlay (SciChart spectra compare). */
export function SpectraOverlay({
  a,
  b,
  aLabel = "A",
  bLabel = "B",
  format = (v: number) => fmtNum(v, 2),
}: {
  a: { x: string | number; y: number }[];
  b: { x: string | number; y: number }[];
  aLabel?: string;
  bLabel?: string;
  format?: (v: number) => string;
}) {
  const data = useMemo(() => {
    const n = Math.max(a.length, b.length);
    const out: { x: string; a: number; b: number }[] = [];
    for (let i = 0; i < n; i++) {
      out.push({
        x: String(a[i]?.x ?? b[i]?.x ?? i),
        a: Number(a[i]?.y ?? 0),
        b: Number(b[i]?.y ?? 0),
      });
    }
    return out;
  }, [a, b]);
  if (!data.length) return <p className="px-4 py-8 text-sm text-muted">No spectra.</p>;
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="x" tick={TICK} axisLine={false} tickLine={false} interval={0} />
          <YAxis width={44} tick={TICK} axisLine={false} tickLine={false} tickFormatter={(v) => format(v)} />
          <Tooltip
            contentStyle={TIP}
            formatter={(v: number, name: string) => [format(v), name === "a" ? aLabel : bLabel]}
          />
          <Line type="monotone" dataKey="a" stroke="var(--color-chart-1)" strokeWidth={1.8} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="b" stroke="var(--color-chart-2)" strokeWidth={1.6} dot={false} strokeDasharray="3 2" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-1 flex gap-4 text-xs text-muted">
        <span>
          <span className="mr-1 inline-block size-2 bg-primary" />
          {aLabel}
        </span>
        <span>
          <span className="mr-1 inline-block size-2 bg-info" />
          {bLabel}
        </span>
      </div>
    </div>
  );
}

/** Filled cross-section slice (one cut through the stack). */
export function SliceArea({
  data,
  yLabel = "Value",
  format = (v: number) => fmtNum(v, 2),
}: {
  data: { x: string; y: number }[];
  yLabel?: string;
  format?: (v: number) => string;
}) {
  if (!data.length) return <p className="px-4 py-8 text-sm text-muted">No slice.</p>;
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="sliceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-info)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-info)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="x" tick={TICK} axisLine={false} tickLine={false} />
          <YAxis width={44} tick={TICK} axisLine={false} tickLine={false} tickFormatter={(v) => format(v)} />
          <Tooltip contentStyle={TIP} formatter={(v: number) => [format(v), yLabel]} />
          <Area type="monotone" dataKey="y" stroke="var(--color-info)" fill="url(#sliceFill)" strokeWidth={1.6} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MixDonut({
  data,
}: {
  data: { label: string; value: number }[];
}) {
  const rows = data.filter((d) => d.value > 0);
  if (!rows.length) return <p className="px-4 py-8 text-sm text-muted">No mix.</p>;
  const total = rows.reduce((s, d) => s + d.value, 0);
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={rows}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={48}
            outerRadius={78}
            paddingAngle={1}
            isAnimationActive={false}
          >
            {rows.map((_, i) => (
              <Cell key={i} fill={CHART_STROKES[i % CHART_STROKES.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={TIP} formatter={(v: number, name: string) => [`${fmtNum(v, 0)} (${fmtNum((v / total) * 100, 0)}%)`, name]} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GroupedMetricChart({
  data,
  aLabel = "PF",
  bLabel = "WR",
}: {
  data: { label: string; a: number; b: number }[];
  aLabel?: string;
  bLabel?: string;
}) {
  if (!data.length) return <p className="px-4 py-8 text-sm text-muted">No groups.</p>;
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="label" tick={TICK} axisLine={false} tickLine={false} interval={0} />
          <YAxis width={40} tick={TICK} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={TIP} />
          <Bar dataKey="a" name={aLabel} fill="var(--color-chart-1)" maxBarSize={16} isAnimationActive={false} />
          <Bar dataKey="b" name={bLabel} fill="var(--color-chart-3)" maxBarSize={16} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
