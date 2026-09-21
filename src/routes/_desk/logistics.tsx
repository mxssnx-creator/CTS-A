import { createFileRoute } from "@tanstack/react-router";
import { LogisticsView } from "@/components/desk/views/logistics";

export const Route = createFileRoute("/_desk/logistics")({
  component: LogisticsView,
});
