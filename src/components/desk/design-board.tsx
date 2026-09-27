import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { INDICATION_KINDS } from "@/lib/desk/engine";
import { DESIGN_SKINS, setDesignSkin, useDesignSkin, type DesignSkin } from "@/lib/desk/design-skin";
import { useLiveSnapshot } from "@/lib/desk/live-ctx";
import { useDesk } from "@/lib/desk/store";
import { fmtUsd } from "@/lib/utils";
import { pickLiveOverview } from "./live-exchange-stats";
import { fmtPf, fmtWr } from "./widgets";

const HOURS = [1, 2, 4, 6, 8, 12] as const;
const LASTS = [12, 40, 120, 650] as const;

type HourRow = { h: number; pf: number; n: number; net: number; wr: number; ddt: number };
type IndRow = { id: string; label: string; pf: number; n: number; net: number };
type LastRow = { n: number; pf: number; wr: number; net: number; count: number };
type BookRow = { key: string; pf: number; n: number; net: number };

function useDesignModel() {
  const live = useLiveSnapshot();
  const pulse = useDesk((s) => Math.floor((s.vst.tick || 0) / 8));
  const closedN = useDesk((s) => s.vst.closed.length);
  const enginePf = useDesk((s) => Number(s.vst.stats?.pf) || 0);
  const engineEq = useDesk((s) => Number(s.vst.stats?.equity) || 0);
  const engineWr = useDesk((s) => Number(s.vst.stats?.wr) || 0);
  const phase = useDesk((s) => s.vst.phase);
  const botsOn = useDesk((s) => s.botsRunning || Boolean(s.botByConn[s.activeConnId]?.running));

  return useMemo(() => {
    const e = useDesk.getState().vst;
    const view = pickLiveOverview(live.session, live.overall as { live?: unknown });
    const closed = e.closed ?? [];
    const slice = closed.slice(-36);
    let acc =
      (Number(e.stats?.equity) || Number(e.startEquity) || live.equity || 10) -
      slice.reduce((sum, t) => sum + (Number(t.pnl) || 0), 0);
    const spark = slice.map((t) => {
      acc += Number(t.pnl) || 0;
      return acc;
    });
    if (spark.length < 2) {
      const eq = engineEq || live.equity || 10;
      spark.splice(0, spark.length, eq, eq);
    }
    const hours: HourRow[] = HOURS.map((h) => {
      const b = view.hours?.[String(h)];
      return {
        h,
        pf: Number(b?.pf || 0),
        n: Number(b?.n || 0),
        net: Number(b?.net || 0),
        wr: Number(b?.wr || 0),
        ddt: Number(b?.ddt || 0),
      };
    });
    const inds: IndRow[] = INDICATION_KINDS.map((k) => {
      const b = (view.byIndication ?? []).find((r) => r.key === k.id);
      return { id: k.id, label: k.label, pf: Number(b?.pf || 0), n: Number(b?.n || 0), net: Number(b?.net || 0) };
    });
    const lastN: LastRow[] = LASTS.map((n) => {
      const b = view.lastN?.[String(n)] ?? view.lastN?.[`n${n}`];
      return { n, pf: Number(b?.pf || 0), wr: Number(b?.wr || 0), net: Number(b?.net || 0), count: Number(b?.n || 0) };
    });
    const books: BookRow[] = (view.byPlaybook?.length ? view.byPlaybook : view.byKind ?? []).slice(0, 6).map((b) => ({
      key: b.key,
      pf: Number(b.pf || 0),
      n: Number(b.n || 0),
      net: Number(b.net || 0),
    }));
    return { live, spark, hours, inds, lastN, books, enginePf, engineEq, engineWr, phase, botsOn };
  }, [live, pulse, closedN, enginePf, engineEq, engineWr, phase, botsOn]);
}

function Spark({ values, stroke, fill }: { values: number[]; stroke: string; fill: string }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * 100;
    const y = 30 - ((v - min) / span) * 24;
    return [x, y] as const;
  });
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ");
  const area = `${d} L100,32 L0,32 Z`;
  return (
    <svg viewBox="0 0 100 32" className="h-8 w-full" preserveAspectRatio="none" role="img" aria-label="Equity path">
      <path d={area} fill={fill} />
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function HourCols({ rows, ink, mute, line }: { rows: HourRow[]; ink: string; mute: string; line: string }) {
  const max = Math.max(2, ...rows.map((r) => r.pf));
  return (
    <svg viewBox="0 0 180 64" className="h-16 w-full" role="img" aria-label="Hour profit factor">
      <line x1="0" y1={64 - (1 / max) * 52} x2="180" y2={64 - (1 / max) * 52} stroke={line} strokeDasharray="2 2" />
      {rows.map((r, i) => {
        const h = Math.max(1, (r.pf / max) * 52);
        const x = 6 + i * 29;
        const hot = r.n > 0 && r.pf >= 1;
        return (
          <g key={r.h}>
            <rect x={x} y={58 - h} width="16" height={h} fill={r.n ? (hot ? ink : mute) : line} />
            <text x={x + 8} y="64" textAnchor="middle" fill={mute} fontSize="7">
              {r.h}h
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Radar({ rows, stroke, grid, bad }: { rows: IndRow[]; stroke: string; grid: string; bad: string }) {
  const cx = 70;
  const cy = 58;
  const r = 40;
  const pts = rows.map((a, i) => {
    const ang = (Math.PI * 2 * i) / Math.max(1, rows.length) - Math.PI / 2;
    const mag = Math.max(0.06, Math.min(1, a.n ? a.pf / 2.2 : 0.06));
    return {
      x: cx + Math.cos(ang) * r * mag,
      y: cy + Math.sin(ang) * r * mag,
      ax: cx + Math.cos(ang) * (r + 10),
      ay: cy + Math.sin(ang) * (r + 10),
      a,
    };
  });
  const poly = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox="0 0 140 120" className="h-28 w-full" role="img" aria-label="Indication radar">
      {[0.35, 0.7, 1].map((s) => (
        <circle key={s} cx={cx} cy={cy} r={r * s} fill="none" stroke={grid} />
      ))}
      <polygon points={poly} fill={`${stroke}22`} stroke={stroke} strokeWidth="1.2" />
      {pts.map((p) => (
        <g key={p.a.id}>
          <circle cx={p.x} cy={p.y} r="2" fill={p.a.n && p.a.pf >= 1 ? stroke : p.a.n ? bad : grid} />
          <text x={p.ax} y={p.ay} textAnchor="middle" fill={grid} fontSize="6">
            {p.a.label.slice(0, 3)}
          </text>
        </g>
      ))}
    </svg>
  );
}

function Donut({
  parts,
}: {
  parts: { label: string; value: number; color: string }[];
}) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0) || 1;
  const c = 2 * Math.PI * 28;
  let off = 0;
  return (
    <svg viewBox="0 0 88 88" className="h-20 w-20" role="img" aria-label="Book mix">
      <circle cx="44" cy="44" r="28" fill="none" stroke="currentColor" opacity="0.12" strokeWidth="8" />
      {parts.map((p) => {
        const len = (Math.max(0, p.value) / total) * c;
        const el = (
          <circle
            key={p.label}
            cx="44"
            cy="44"
            r="28"
            fill="none"
            stroke={p.color}
            strokeWidth="8"
            strokeDasharray={`${len} ${c - len}`}
            strokeDashoffset={-off}
            transform="rotate(-90 44 44)"
          />
        );
        off += len;
        return el;
      })}
      <text x="44" y="47" textAnchor="middle" fontSize="9" fill="currentColor">
        mix
      </text>
    </svg>
  );
}

function MiniTable({
  title,
  rows,
}: {
  title: string;
  rows: { k: string; a: string; b: string; hot?: boolean }[];
}) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] opacity-60">{title}</p>
      <ul className="space-y-0.5">
        {rows.map((r) => (
          <li key={r.k} className="grid grid-cols-[1fr_auto_auto] gap-2 font-mono text-[10px] leading-4 tabular-nums">
            <span className="truncate">{r.k}</span>
            <span className={r.hot ? "text-up" : "opacity-80"}>{r.a}</span>
            <span className="opacity-60">{r.b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DesignSwitch() {
  const skin = useDesignSkin();
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const current = DESIGN_SKINS.find((s) => s.id === skin) ?? DESIGN_SKINS[0]!;

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = 288;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    setBox({ top: r.bottom + 4, left });
  };

  useEffect(() => {
    if (!open) return;
    place();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onMove = () => place();
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open]);

  const menu =
    open && box && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            data-design-menu="open"
            className="fixed z-[80] w-72 border border-border bg-surface p-1 text-fg shadow-panel"
            style={{ top: box.top, left: box.left }}
          >
            {DESIGN_SKINS.map((s) => (
              <button
                key={s.id}
                type="button"
                role="menuitemradio"
                aria-checked={skin === s.id}
                onClick={() => {
                  setDesignSkin(s.id);
                  setOpen(false);
                }}
                className={`flex w-full flex-col items-start gap-0.5 px-2 py-2 text-left ${
                  skin === s.id ? "bg-primary-soft text-fg" : "hover:bg-surface-muted"
                }`}
              >
                <span className="text-[11px] font-semibold">{s.name}</span>
                <span className="text-[10px] leading-4 text-muted">{s.note}</span>
              </button>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={ref} className="relative">
      <button
        ref={btnRef}
        type="button"
        className="desk-design-btn h-8 px-2 text-[11px] font-medium tracking-wide"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Design ${current.name}`}
        onClick={() => {
          if (open) setOpen(false);
          else {
            place();
            setOpen(true);
          }
        }}
      >
        Design · {current.name}
      </button>
      {menu}
    </div>
  );
}

export function DesignBoard() {
  const skin = useDesignSkin();
  if (skin === "desk") return null;
  return <DesignBoardLive skin={skin} />;
}

function DesignBoardLive({ skin }: { skin: Exclude<DesignSkin, "desk"> }) {
  const model = useDesignModel();
  if (skin === "lattice") return <LatticeBoard model={model} />;
  if (skin === "pulse") return <PulseBoard model={model} />;
  return <AtlasBoard model={model} />;
}

type Model = ReturnType<typeof useDesignModel>;

function HeadLine({ model, skin }: { model: Model; skin: DesignSkin }) {
  const { live } = model;
  const pf = live.pf || model.enginePf;
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-mono text-[10px] tabular-nums">
      <span className="text-[11px] font-semibold tracking-wide">{skin === "lattice" ? "LATTICE" : skin === "pulse" ? "PULSE" : "ATLAS"}</span>
      <span>PF {fmtPf(pf)}</span>
      <span>WR {fmtWr(live.wr || model.engineWr)}</span>
      <span>EQ {fmtUsd(live.equity || model.engineEq)}</span>
      <span>MDD {(live.mdd * 100).toFixed(1)}%</span>
      <span>
        POS {live.livePos} · ORD {live.liveOrd}
      </span>
      <span>
        SL {live.liveSl} / TP {live.liveTp}
      </span>
      <span>
        {live.liveLong}L {live.liveShort}S
      </span>
      <span className="opacity-60">
        {model.phase} · {live.venueLabel}
        {model.botsOn ? " · bots" : ""} · n {live.trades || model.live.trades}
      </span>
    </div>
  );
}

function LatticeBoard({ model }: { model: Model }) {
  return (
    <section className="mb-3 border border-[#d6d1c7] bg-[#fbfaf6] p-2 text-[#1c1917]">
      <HeadLine model={model} skin="lattice" />
      <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-12">
        <div className="border border-[#e7e2d8] p-1.5 lg:col-span-5">
          <p className="text-[10px] uppercase tracking-[0.16em] text-[#78716c]">Equity path · last 36 closes</p>
          <Spark values={model.spark} stroke="#9a3412" fill="#9a341218" />
        </div>
        <div className="border border-[#e7e2d8] p-1.5 lg:col-span-4">
          <p className="text-[10px] uppercase tracking-[0.16em] text-[#78716c]">Hour PF · line at 1.0</p>
          <HourCols rows={model.hours} ink="#9a3412" mute="#a8a29e" line="#e7e2d8" />
        </div>
        <div className="border border-[#e7e2d8] p-1.5 lg:col-span-3">
          <MiniTable
            title="Last N"
            rows={model.lastN.map((r) => ({
              k: `N${r.n}`,
              a: fmtPf(r.pf),
              b: `n${r.count}`,
              hot: r.count > 0 && r.pf >= 1,
            }))}
          />
        </div>
        <div className="border border-[#e7e2d8] p-1.5 lg:col-span-7">
          <MiniTable
            title="Indications"
            rows={model.inds.map((r) => ({
              k: r.label,
              a: r.n ? fmtPf(r.pf) : "—",
              b: `n${r.n} ${fmtUsd(r.net)}`,
              hot: r.n > 0 && r.pf >= 1,
            }))}
          />
        </div>
        <div className="border border-[#e7e2d8] p-1.5 lg:col-span-5">
          <MiniTable
            title="Hours · related"
            rows={model.hours.map((r) => ({
              k: `${r.h}h`,
              a: r.n ? fmtPf(r.pf) : "—",
              b: `wr ${fmtWr(r.wr)} ddt ${r.ddt.toFixed(0)}`,
              hot: r.n > 0 && r.pf >= 1,
            }))}
          />
          <div className="mt-2">
            <MiniTable
              title="Books"
              rows={(model.books.length ? model.books : [{ key: "—", pf: 0, n: 0, net: 0 }]).map((r) => ({
                k: r.key,
                a: r.n ? fmtPf(r.pf) : "—",
                b: `n${r.n}`,
                hot: r.n > 0 && r.pf >= 1,
              }))}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function PulseBoard({ model }: { model: Model }) {
  const pf = model.live.pf || model.enginePf;
  const t = Math.max(0, Math.min(1, pf / 2.4));
  const c = 2 * Math.PI * 22;
  return (
    <section className="mb-3 border border-[#1d3b2e] bg-[#070c0a] p-2 text-[#d7ffe9]">
      <HeadLine model={model} skin="pulse" />
      <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-12">
        <div className="flex items-center gap-2 border border-[#1d3b2e] p-2 lg:col-span-3">
          <svg viewBox="0 0 64 64" className="h-16 w-16 shrink-0" role="img" aria-label="Profit factor gauge">
            <circle cx="32" cy="32" r="22" fill="none" stroke="#163028" strokeWidth="4" />
            <circle
              cx="32"
              cy="32"
              r="22"
              fill="none"
              stroke="#3dffb0"
              strokeWidth="4"
              strokeDasharray={`${c * t} ${c}`}
              transform="rotate(-90 32 32)"
            />
            <text x="32" y="35" textAnchor="middle" fill="#d7ffe9" fontSize="9">
              {pf.toFixed(2)}
            </text>
          </svg>
          <div className="min-w-0 font-mono text-[10px] leading-4">
            <div>eng {fmtPf(model.enginePf)}</div>
            <div>live {fmtPf(model.live.pf)}</div>
            <div className="text-[#ffb020]">net {fmtUsd(model.live.systemNet || model.live.net)}</div>
            <div className="text-[#8aa396]">ping {model.live.pingOk ? `${model.live.latencyMs}ms` : "down"}</div>
          </div>
        </div>
        <div className="border border-[#1d3b2e] p-1 lg:col-span-4">
          <Radar rows={model.inds} stroke="#3dffb0" grid="#3d5c4c" bad="#ff5d73" />
        </div>
        <div className="border border-[#1d3b2e] p-1.5 lg:col-span-5">
          <p className="mb-1 text-[10px] uppercase tracking-[0.16em] text-[#6f8a7c]">Signal · hour PF</p>
          <ul className="space-y-1">
            {model.hours.map((r) => (
              <li key={r.h} className="grid grid-cols-[2rem_1fr_3.2rem] items-center gap-1 font-mono text-[10px]">
                <span>{r.h}h</span>
                <span className="h-1 bg-[#163028]">
                  <span
                    className="block h-1"
                    style={{
                      width: `${Math.min(100, (r.pf / 2.4) * 100)}%`,
                      background: r.n && r.pf >= 1 ? "#3dffb0" : r.n ? "#ff5d73" : "#1d3b2e",
                    }}
                  />
                </span>
                <span className="text-right">{r.n ? r.pf.toFixed(2) : "—"}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="grid grid-cols-2 gap-2 border border-[#1d3b2e] p-1.5 lg:col-span-12 lg:grid-cols-4">
          <MiniTable
            title="Indications"
            rows={model.inds.map((r) => ({ k: r.label, a: r.n ? fmtPf(r.pf) : "—", b: `n${r.n}`, hot: r.n > 0 && r.pf >= 1 }))}
          />
          <MiniTable
            title="Last N"
            rows={model.lastN.map((r) => ({ k: `N${r.n}`, a: fmtPf(r.pf), b: `n${r.count}`, hot: r.count > 0 && r.pf >= 1 }))}
          />
          <MiniTable
            title="Books"
            rows={(model.books.length ? model.books : [{ key: "—", pf: 0, n: 0, net: 0 }]).map((r) => ({
              k: r.key,
              a: r.n ? fmtPf(r.pf) : "—",
              b: fmtUsd(r.net),
              hot: r.n > 0 && r.pf >= 1,
            }))}
          />
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-[#6f8a7c]">Tape</p>
            <Spark values={model.spark} stroke="#3dffb0" fill="#3dffb014" />
            <p className="mt-1 font-mono text-[10px] text-[#8aa396]">
              occ {model.live.occupied}/{model.live.slots || "—"} · owned {model.live.liveOwned}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function AtlasBoard({ model }: { model: Model }) {
  const { live } = model;
  return (
    <section className="mb-3 grid grid-cols-1 gap-2 text-[#1e293b] lg:grid-cols-12">
      <div className="rounded-xl border border-[#dbe3ec] bg-white p-2.5 shadow-[0_8px_24px_rgb(30_41_59/0.05)] lg:col-span-4">
        <HeadLine model={model} skin="atlas" />
        <div className="mt-2 flex items-center gap-3">
          <Donut
            parts={[
              { label: "long", value: live.liveLong, color: "#0f766e" },
              { label: "short", value: live.liveShort, color: "#4338ca" },
              { label: "orders", value: live.liveOrd, color: "#94a3b8" },
            ]}
          />
          <ul className="space-y-1 font-mono text-[10px] leading-4">
            <li className="flex items-center gap-1">
              <i className="inline-block size-1.5 bg-[#0f766e]" /> long {live.liveLong}
            </li>
            <li className="flex items-center gap-1">
              <i className="inline-block size-1.5 bg-[#4338ca]" /> short {live.liveShort}
            </li>
            <li className="flex items-center gap-1">
              <i className="inline-block size-1.5 bg-[#94a3b8]" /> orders {live.liveOrd}
            </li>
            <li className="text-[#64748b]">
              closed {fmtUsd(live.closedNet)} · open {fmtUsd(live.openNet)}
            </li>
          </ul>
        </div>
      </div>
      <div className="rounded-xl border border-[#dbe3ec] bg-white p-2.5 shadow-[0_8px_24px_rgb(30_41_59/0.05)] lg:col-span-4">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#64748b]">Hour relation</p>
        <HourCols rows={model.hours} ink="#4338ca" mute="#94a3b8" line="#e2e8f0" />
        <Spark values={model.spark} stroke="#0f766e" fill="#0f766e14" />
      </div>
      <div className="rounded-xl border border-[#dbe3ec] bg-white p-2.5 shadow-[0_8px_24px_rgb(30_41_59/0.05)] lg:col-span-4">
        <MiniTable
          title="Last N · books"
          rows={[
            ...model.lastN.map((r) => ({ k: `N${r.n}`, a: fmtPf(r.pf), b: `n${r.count}`, hot: r.count > 0 && r.pf >= 1 })),
            ...model.books.map((r) => ({ k: r.key, a: r.n ? fmtPf(r.pf) : "—", b: `n${r.n}`, hot: r.n > 0 && r.pf >= 1 })),
          ]}
        />
      </div>
      <div className="rounded-xl border border-[#dbe3ec] bg-white p-2.5 shadow-[0_8px_24px_rgb(30_41_59/0.05)] lg:col-span-12">
        <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-[#64748b]">Indications · same tape</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-5">
          {model.inds.map((r) => (
            <div key={r.id} className="min-w-0">
              <div className="flex justify-between font-mono text-[10px]">
                <span className="truncate">{r.label}</span>
                <span className={r.n && r.pf >= 1 ? "text-[#0f766e]" : "text-[#64748b]"}>{r.n ? r.pf.toFixed(2) : "—"}</span>
              </div>
              <div className="mt-0.5 h-1 rounded-full bg-[#e2e8f0]">
                <div
                  className="h-1 rounded-full"
                  style={{
                    width: `${Math.min(100, (r.pf / 2.4) * 100)}%`,
                    background: r.n && r.pf >= 1 ? "#4338ca" : r.n ? "#be123c" : "#e2e8f0",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
