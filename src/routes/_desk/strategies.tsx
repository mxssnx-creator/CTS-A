import { createFileRoute } from "@tanstack/react-router";
import { StrategiesView } from "@/components/desk/views/strategies";

export const Route = createFileRoute("/_desk/strategies")({
  component: StrategiesView,
});
