import { createFileRoute } from "@tanstack/react-router";
import { usePreserveScroll } from "@/lib/desk/live-ctx";

export const Route = createFileRoute("/_desk/heatmap")({
  component: HeatmapPage,
});

function HeatmapPage() {
  usePreserveScroll();
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-subtle">Sim vs exchange</p>
        <h1 className="text-2xl font-semibold tracking-tight">Heatmap</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Short-range sim cells versus the live BingX VST-02 protect grid. Scroll stays on this page.
        </p>
      </div>
      <iframe
        title="Sim vs exchange heatmap"
        src="/heatmap-sim-exchange.html"
        className="min-h-[calc(100vh-10rem)] w-full border border-border bg-bg"
      />
    </div>
  );
}
