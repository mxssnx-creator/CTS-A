import { useMemo } from "react";
import { cn } from "@/lib/utils";

export type LogisticsNodeId =
  | "quotes"
  | "indications"
  | "eval"
  | "arm"
  | "queue"
  | "positions"
  | "protect"
  | "block"
  | "close"
  | "stores"
  | "network"
  | "ui"
  | "stack";

export type CampusLive = {
  equity: number;
  pf: number;
  livePos: number;
  liveOrd: number;
  liveSl: number;
  liveTp: number;
  occupied: number;
  liveLong: number;
  liveShort: number;
  pingOk: boolean;
  latencyMs: number;
  systemNet: number;
  closedNet: number;
  openNet: number;
  foreignPos: number;
  liveOwned: number;
  conn: string;
  venueLabel: string;
  trades: number;
};

function iso(x: number, y: number, z: number, ox = 520, oy = 420) {
  return { x: ox + x * 22 - y * 22, y: oy + x * 12 + y * 12 - z * 18 };
}

function Prism({
  x,
  y,
  z,
  w,
  d,
  h,
  fill,
  side,
  top,
  selected,
  dim,
  onSelect,
  label,
  sub,
}: {
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  h: number;
  fill: string;
  side: string;
  top: string;
  selected?: boolean;
  dim?: boolean;
  onSelect?: () => void;
  label?: string;
  sub?: string;
}) {
  const a = iso(x, y, z);
  const b = iso(x + w, y, z);
  const c = iso(x + w, y + d, z);
  const e = iso(x, y + d, z);
  const a2 = iso(x, y, z + h);
  const b2 = iso(x + w, y, z + h);
  const c2 = iso(x + w, y + d, z + h);
  const e2 = iso(x, y + d, z + h);
  const pts = (xs: { x: number; y: number }[]) => xs.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  return (
    <g
      className={cn("cursor-pointer transition-opacity duration-200", dim && !selected ? "opacity-35" : "opacity-100")}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          onSelect?.();
        }
      }}
    >
      <polygon points={pts([e, c, c2, e2])} fill={side} stroke="var(--color-border-strong)" strokeWidth={selected ? 1.6 : 0.6} />
      <polygon points={pts([b, c, c2, b2])} fill={fill} stroke="var(--color-border-strong)" strokeWidth={selected ? 1.6 : 0.6} />
      <polygon points={pts([a2, b2, c2, e2])} fill={top} stroke="var(--color-border-strong)" strokeWidth={selected ? 1.8 : 0.6} />
      {selected ? (
        <polygon points={pts([a2, b2, c2, e2])} fill="none" stroke="var(--color-primary)" strokeWidth="2.2" className="lgx-pulse" />
      ) : null}
      {label ? (
        <text x={a2.x + (c2.x - a2.x) / 2} y={a2.y + 4} textAnchor="middle" className="fill-fg text-[10px] font-semibold uppercase tracking-wide">
          {label}
        </text>
      ) : null}
      {sub ? (
        <text x={a2.x + (c2.x - a2.x) / 2} y={a2.y + 16} textAnchor="middle" className="fill-muted text-[9px] font-mono">
          {sub}
        </text>
      ) : null}
    </g>
  );
}

function Flow({
  d,
  active,
  speed,
  width,
}: {
  d: string;
  active: boolean;
  speed: number;
  width: number;
}) {
  return (
    <path
      d={d}
      fill="none"
      stroke={active ? "var(--color-primary)" : "var(--color-border-strong)"}
      strokeWidth={width}
      className={active ? "lgx-flow" : undefined}
      style={{ animationDuration: `${Math.max(0.6, 2.4 / speed)}s` }}
      strokeLinecap="round"
    />
  );
}

export function LogisticsCampus({
  live,
  selected,
  onSelect,
  expand,
  flow,
  vol,
  hold,
  pfGate,
  pf,
}: {
  live: CampusLive;
  selected: LogisticsNodeId;
  onSelect: (id: LogisticsNodeId) => void;
  expand: number;
  flow: number;
  vol: number;
  hold: number;
  pfGate: number;
  pf: number;
}) {
  const lanesOn = pf + 1e-9 >= pfGate;
  const posH = Math.max(1.2, Math.min(8, (live.livePos / 12) * vol + expand * 0.35));
  const qH = Math.max(1.4, Math.min(7, (live.liveOrd / 40) * flow + 1.6));
  const holdH = Math.max(0.8, hold / 12);
  const netH = live.pingOk ? 3.2 : 1.4;
  const dim = selected;

  const paths = useMemo(() => {
    const q = iso(0, 8, 3.4);
    const i = iso(4, 8, 5.2);
    const ev = iso(8, 6, 6);
    const ar = iso(-1, 2, 3);
    const qu = iso(-6, 2, 2);
    const po = iso(2, -1, 2);
    const pr = iso(7, 0, 2 + holdH);
    const bl = iso(11, 2, 2);
    const cl = iso(6, 8, 1);
    const st = iso(-7, 8, 2);
    const nw = iso(14, 6, netH);
    const ui = iso(0, 12, 8);
    return {
      quotesInd: `M ${q.x} ${q.y} L ${i.x} ${i.y}`,
      indEval: `M ${i.x} ${i.y} L ${ev.x} ${ev.y}`,
      evalArm: `M ${ev.x} ${ev.y} L ${ar.x} ${ar.y}`,
      armQueue: `M ${ar.x} ${ar.y} L ${qu.x} ${qu.y}`,
      queuePos: `M ${qu.x} ${qu.y} L ${po.x} ${po.y}`,
      posProtect: `M ${po.x} ${po.y} L ${pr.x} ${pr.y}`,
      posBlock: `M ${po.x} ${po.y} L ${bl.x} ${bl.y}`,
      close: `M ${pr.x} ${pr.y} L ${cl.x} ${cl.y}`,
      store: `M ${cl.x} ${cl.y} L ${st.x} ${st.y}`,
      net: `M ${bl.x} ${bl.y} L ${nw.x} ${nw.y}`,
      ui: `M ${i.x} ${i.y} L ${ui.x} ${ui.y}`,
    };
  }, [holdH, netH]);

  return (
    <svg viewBox="0 0 1100 720" className="h-auto w-full logistics-stage" role="img" aria-label="CTS logistics campus">
      <rect x="0" y="0" width="1100" height="720" fill="var(--color-surface-muted)" />
      <text x="28" y="36" className="fill-fg text-sm font-semibold uppercase tracking-widest">
        CTS logistics campus
      </text>
      <text x="28" y="54" className="fill-muted text-[11px]">
        {live.venueLabel} · {live.conn} · owned {live.liveOwned} · foreign {live.foreignPos}
      </text>

      <polygon
        points="80,560 540,790 980,560 520,360"
        fill="var(--color-surface)"
        stroke="var(--color-border)"
        strokeWidth="1"
      />
      <text x="520" y="700" textAnchor="middle" className="fill-subtle text-[10px] uppercase tracking-widest">
        site · exchange floor
      </text>

      <Flow d={paths.quotesInd} active={live.pingOk} speed={flow} width={1.4 * flow} />
      <Flow d={paths.indEval} active={lanesOn} speed={flow} width={1.2 * flow} />
      <Flow d={paths.evalArm} active={lanesOn} speed={flow} width={1.6 * vol} />
      <Flow d={paths.armQueue} active={live.liveOrd > 0} speed={flow} width={1.8 * flow} />
      <Flow d={paths.queuePos} active={live.livePos > 0} speed={flow} width={1.5 * vol} />
      <Flow d={paths.posProtect} active={live.liveSl + live.liveTp > 0} speed={flow} width={1.3} />
      <Flow d={paths.posBlock} active={live.livePos > 0} speed={flow * 0.8} width={1.4 * vol} />
      <Flow d={paths.close} active={live.trades > 0} speed={flow} width={1.2} />
      <Flow d={paths.store} active speed={0.7 * flow} width={1} />
      <Flow d={paths.net} active={live.pingOk} speed={flow} width={1.5} />
      <Flow d={paths.ui} active speed={0.9} width={1} />

      <Prism
        x={-8}
        y={7}
        z={0}
        w={3.2}
        d={3.2}
        h={2 + expand * 0.2}
        fill="var(--color-surface)"
        side="var(--color-surface-muted)"
        top="var(--color-primary-soft)"
        selected={selected === "stores"}
        dim={dim !== "stores"}
        onSelect={() => onSelect("stores")}
        label="Stores"
        sub="JSON · tape"
      />
      <Prism
        x={-1}
        y={7}
        z={0}
        w={4.2}
        d={3.4}
        h={3.2}
        fill="var(--color-info)"
        side="var(--color-primary-active)"
        top="var(--color-primary-soft)"
        selected={selected === "quotes"}
        dim={dim !== "quotes"}
        onSelect={() => onSelect("quotes")}
        label="Quotes"
        sub={`${live.occupied} sym`}
      />
      <Prism
        x={4}
        y={7.2}
        z={0}
        w={3.6}
        d={3}
        h={5}
        fill="var(--color-primary)"
        side="var(--color-primary-active)"
        top="var(--color-primary-fg)"
        selected={selected === "indications"}
        dim={dim !== "indications"}
        onSelect={() => onSelect("indications")}
        label="Indications"
        sub="10 tactics"
      />
      <Prism
        x={8.2}
        y={5.4}
        z={0}
        w={3.4}
        d={3.2}
        h={6}
        fill="var(--color-fg)"
        side="var(--color-nav)"
        top="var(--color-nav-muted)"
        selected={selected === "eval"}
        dim={dim !== "eval"}
        onSelect={() => onSelect("eval")}
        label="Eval"
        sub={`PF ${pf.toFixed(2)}`}
      />
      <Prism
        x={-2}
        y={1.4}
        z={0}
        w={3.6}
        d={3.2}
        h={3}
        fill="var(--color-surface)"
        side="var(--color-surface-muted)"
        top="var(--color-up-soft)"
        selected={selected === "arm"}
        dim={dim !== "arm"}
        onSelect={() => onSelect("arm")}
        label="Arm"
        sub={`${live.occupied} occ`}
      />
      <Prism
        x={-7}
        y={1.2}
        z={0}
        w={4}
        d={3.6}
        h={qH}
        fill="var(--color-warn)"
        side="var(--color-muted)"
        top="var(--color-primary-soft)"
        selected={selected === "queue"}
        dim={dim !== "queue"}
        onSelect={() => onSelect("queue")}
        label="Queue"
        sub={`${live.liveOrd} ord`}
      />
      <Prism
        x={1.4}
        y={-1.6}
        z={0}
        w={4.4}
        d={4}
        h={posH}
        fill="var(--color-up)"
        side="var(--color-up)"
        top="var(--color-up-soft)"
        selected={selected === "positions"}
        dim={dim !== "positions"}
        onSelect={() => onSelect("positions")}
        label="Positions"
        sub={`${live.liveLong}L ${live.liveShort}S`}
      />
      <Prism
        x={6.4}
        y={-0.6}
        z={0}
        w={3.4}
        d={3}
        h={holdH + 1.4}
        fill="var(--color-down)"
        side="var(--color-down)"
        top="var(--color-down-soft)"
        selected={selected === "protect"}
        dim={dim !== "protect"}
        onSelect={() => onSelect("protect")}
        label="Protect"
        sub={`${live.liveSl} SL · ${live.liveTp} TP`}
      />
      <Prism
        x={10.6}
        y={1.4}
        z={0}
        w={3.6}
        d={3.4}
        h={2.4 + vol}
        fill="var(--color-primary-hover)"
        side="var(--color-primary-active)"
        top="var(--color-primary-soft)"
        selected={selected === "block"}
        dim={dim !== "block"}
        onSelect={() => onSelect("block")}
        label="Block"
        sub={`×${vol.toFixed(1)}`}
      />
      <Prism
        x={5.4}
        y={8.4}
        z={0}
        w={3.2}
        d={2.6}
        h={1.6}
        fill="var(--color-surface)"
        side="var(--color-surface-muted)"
        top={live.systemNet >= 0 ? "var(--color-up-soft)" : "var(--color-down-soft)"}
        selected={selected === "close"}
        dim={dim !== "close"}
        onSelect={() => onSelect("close")}
        label="Close"
        sub={`${live.trades} n`}
      />
      <Prism
        x={13.6}
        y={5.2}
        z={0}
        w={2.6}
        d={2.6}
        h={netH}
        fill="var(--color-info)"
        side="var(--color-primary-active)"
        top="var(--color-primary-soft)"
        selected={selected === "network"}
        dim={dim !== "network"}
        onSelect={() => onSelect("network")}
        label="Net"
        sub={live.pingOk ? `${live.latencyMs}ms` : "down"}
      />
      <Prism
        x={-0.4}
        y={11.4}
        z={0}
        w={4.2}
        d={2.4}
        h={2.2}
        fill="var(--color-header)"
        side="var(--color-primary-active)"
        top="var(--color-primary-fg)"
        selected={selected === "ui"}
        dim={dim !== "ui"}
        onSelect={() => onSelect("ui")}
        label="Desk UI"
        sub="pages"
      />

      {Array.from({ length: 7 }, (_, i) => (
        <Prism
          key={`stack-${i}`}
          x={-11.6}
          y={-2 + i * 0.05}
          z={i * 1.05}
          w={3.4}
          d={3.4}
          h={0.95}
          fill={i === expand - 1 ? "var(--color-primary)" : "var(--color-surface)"}
          side="var(--color-surface-muted)"
          top={i < expand ? "var(--color-primary-soft)" : "var(--color-surface)"}
          selected={selected === "stack"}
          dim={dim !== "stack"}
          onSelect={() => onSelect("stack")}
          label={i === 6 ? "L7" : i === 0 ? "L0" : undefined}
        />
      ))}
    </svg>
  );
}
