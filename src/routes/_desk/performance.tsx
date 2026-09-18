import { createFileRoute } from "@tanstack/react-router";
import { PerformanceView } from "@/components/desk/views/performance";

export const Route = createFileRoute("/_desk/performance")({
  component: PerformanceView,
});
