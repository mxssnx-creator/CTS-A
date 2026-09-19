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
