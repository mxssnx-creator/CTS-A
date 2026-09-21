import { createFileRoute } from "@tanstack/react-router";
import { StatisticsView } from "@/components/desk/views/statistics";

export const Route = createFileRoute("/_desk/statistics")({
  component: StatisticsView,
});
