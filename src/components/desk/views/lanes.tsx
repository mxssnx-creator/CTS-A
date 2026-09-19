import { useMemo } from "react";
import { buildLanes } from "@/lib/desk/engine";
import type { Lane, LaneStatus } from "@/lib/desk/types";
import { useDesk } from "@/lib/desk/store";
import { fmtNum } from "@/lib/utils";
import { fmtMdd, fmtPf, fmtWr, Panel, Pill } from "../widgets";
import { LiveBookStrip } from "../live-book-strip";
import { usePreserveScroll } from "@/lib/desk/live-ctx";

const COLS: { id: LaneStatus; title: string; hint: string }[] = [
  { id: "validated", title: "Validated", hint: "PF, last N and thresholds all hold" },
  { id: "candidate", title: "Candidate", hint: "One of last N or full-sample is short" },
  { id: "rejected", title: "Rejected", hint: "Below gates — parked" },
];

export function LanesView() {
  usePreserveScroll();
  const symbol = useDesk((s) => s.symbol);
  const lastNs = useDesk((s) => s.lastNs);
  const cfg = useDesk((s) => s.tacticConfig);
  const th = useDesk((s) => s.thresholds);
  const enabledKinds = useDesk((s) => s.enabledKinds);
  const setStrategy = useDesk((s) => s.setStrategy);
  const setTactic = useDesk((s) => s.setTactic);
  const setCostStep = useDesk((s) => s.setCostStep);
  const setRangeType = useDesk((s) => s.setRangeType);
  const applyLive = useDesk((s) => s.applyLiveConfig);

  const lanes = useMemo(
    () => buildLanes(lastNs.lanes, cfg, th, undefined, enabledKinds),
    [lastNs.lanes, cfg, th, enabledKinds],
  );

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-subtle">Flow</p>
        <h1 className="text-2xl font-semibold tracking-tight">Validated lanes</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          A lane is strategy × symbol × tactic for every symbol. Trend, Break, Active and Direction run independently. Last {lastNs.lanes} plus the full book.
        </p>
      </div>

      <LiveBookStrip />
      <div className="grid gap-3 lg:grid-cols-3">
        {COLS.map((col) => {
          const items = lanes.filter((l) => l.status === col.id);
          return (
            <Panel
              key={col.id}
              title={`${col.title} · ${items.length}`}
              action={<span className="hidden text-xs text-muted sm:inline">{col.hint}</span>}
            >
              <ul className="flex flex-col gap-2">
                {items.slice(0, 10).map((l) => (
                  <LaneCard
                    key={l.id}
                    lane={l}
                    onPick={() => {
                      setStrategy(l.strategyId);
                      setTactic(l.tactic);
                      setCostStep(l.costStep);
                      setRangeType(l.rangeType);
                      applyLive();
                    }}
                  />
                ))}
              </ul>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

function LaneCard({ lane, onPick }: { lane: Lane; onPick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        className="w-full border border-border bg-bg px-3 py-3 text-left transition-colors duration-150 hover:border-primary"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-medium">{lane.strategyName}</div>
            <div className="text-xs text-muted">
              {lane.symbol} · {lane.kind === "normal" ? "Normal" : lane.kind} · {lane.tactic} · cost{" "}
              {lane.costStep}
            </div>
          </div>
          <Pill tone={lane.status === "validated" ? "up" : lane.status === "candidate" ? "accent" : "neutral"}>
            PF {fmtPf(lane.pf)}
          </Pill>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-2 text-xs text-muted">
          <span>N {fmtPf(lane.lastNPf)}</span>
          <span>WR {fmtWr(lane.wr)}</span>
          <span>DD {fmtMdd(lane.mdd)}</span>
          <span>VF {fmtNum(lane.volumeFactor, 2)}</span>
        </div>
        {lane.evals?.length ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {lane.effective ? <Pill tone="up">Effective</Pill> : null}
            {lane.evals.map((r) => (
              <Pill key={r.n} tone={r.ok ? "up" : "neutral"}>
                N{r.n} {fmtPf(r.pf)}
              </Pill>
            ))}
          </div>
        ) : null}
        <div className="mt-2 text-xs text-subtle">
          {lane.blockCount} blocks · {lane.ongoing} ongoing · {lane.next} next · DDT {lane.ddt}
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          <Pill tone={lane.hf ? "accent" : "neutral"}>{lane.hf ? "HF" : "calm"} {fmtNum(lane.activity, 2)}</Pill>
          <Pill tone={lane.indications.trend > 0.15 ? "up" : lane.indications.trend < -0.15 ? "down" : "neutral"}>
            Trend {fmtNum(lane.indications.trend, 2)}
          </Pill>
          <Pill tone={lane.indications.break > 0.15 ? "up" : lane.indications.break < -0.15 ? "down" : "neutral"}>
            Break {fmtNum(lane.indications.break, 2)}
          </Pill>
          <Pill tone={lane.indications.active > 0.15 ? "up" : lane.indications.active < -0.15 ? "down" : "neutral"}>
            Active {fmtNum(lane.indications.active, 2)}
          </Pill>
          <Pill tone={lane.indications.direction > 0.15 ? "up" : lane.indications.direction < -0.15 ? "down" : "neutral"}>
            Dir {fmtNum(lane.indications.direction, 2)}
          </Pill>
          <span>T {fmtNum(lane.timing ?? 0, 2)}</span>
          <span>Rel {fmtNum(lane.activityAgree ?? 0, 2)}</span>
        </div>
      </button>
    </li>
  );
}
