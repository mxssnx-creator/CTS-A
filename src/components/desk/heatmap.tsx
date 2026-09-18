import { COST_STEPS, RANGE_META, RANGE_TYPES } from "@/lib/desk/engine";
import type { HeatCell, RangeType } from "@/lib/desk/types";
import { cn, fmtNum } from "@/lib/utils";

export function CostHeatmap({
  cells,
  costStep,
  rangeType,
  onSelect,
}: {
  cells: HeatCell[];
  costStep: number;
  rangeType: RangeType;
  onSelect: (cost: number, range: RangeType) => void;
}) {
  const byRange = (r: RangeType) => cells.filter((c) => c.rangeType === r);
  return (
    <div className="max-w-full overflow-x-auto">
      <div className="min-w-3xl">
        <div className="mb-1 grid grid-cols-[4.5rem_repeat(28,minmax(0,1fr))] gap-px text-xs text-subtle">
          <div />
          {COST_STEPS.map((c) => (
            <div key={c} className="text-center font-mono tabular">
              {c}
            </div>
          ))}
        </div>
        {RANGE_TYPES.map((r) => (
          <div
            key={r}
            className="mb-px grid grid-cols-[4.5rem_repeat(28,minmax(0,1fr))] gap-px"
          >
            <div className="flex items-center pr-2 text-xs font-medium text-muted">
              {RANGE_META[r].label}
            </div>
            {byRange(r).map((cell) => {
              const active = cell.cost === costStep && r === rangeType;
              return (
                <button
                  key={`${r}-${cell.cost}`}
                  type="button"
                  title={`${r} · cost ${cell.cost} · PF ${fmtNum(cell.pf, 2)}`}
                  onClick={() => onSelect(cell.cost, r)}
                  className={cn("h-6 w-full min-w-3 transition-opacity duration-150", active && "ring-2 ring-fg")}
                  style={{ background: heatColor(cell.pf) }}
                />
              );
            })}
          </div>
        ))}
        <div className="mt-3 flex items-center gap-3 text-xs text-muted">
          <span>PF</span>
          <span className="h-2 w-24" style={{ background: "linear-gradient(90deg, var(--color-down-soft), var(--color-surface-muted), var(--color-primary))" }} />
          <span>weak</span>
          <span className="ml-auto font-medium text-fg">Steps 3–30</span>
        </div>
      </div>
    </div>
  );
}

function heatColor(pf: number): string {
  if (pf < 1) {
    const t = Math.min(1, (1 - pf) / 0.6);
    return `color-mix(in srgb, var(--color-down) ${Math.round(18 + t * 42)}%, var(--color-surface))`;
  }
  const t = Math.min(1, (pf - 1) / 1.4);
  return `color-mix(in srgb, var(--color-primary) ${Math.round(16 + t * 70)}%, var(--color-surface))`;
}
