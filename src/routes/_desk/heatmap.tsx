import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_desk/heatmap")({
  component: HeatmapPage,
});

function HeatmapPage() {
  return (
    <iframe
      title="Sim vs exchange heatmap"
      src="/heatmap-sim-exchange.html"
      className="min-h-[calc(100vh-4rem)] w-full border-0 bg-bg"
    />
  );
}
