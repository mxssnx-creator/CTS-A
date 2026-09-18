import { createFileRoute } from "@tanstack/react-router";
import { PositionsView } from "@/components/desk/views/positions";

export const Route = createFileRoute("/_desk/positions")({
  component: PositionsView,
});
