import { createFileRoute } from "@tanstack/react-router";
import { ResultsView } from "@/components/desk/views/results";

export const Route = createFileRoute("/_desk/statistics")({
  component: ResultsView,
});
