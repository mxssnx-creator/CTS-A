import { createFileRoute } from "@tanstack/react-router";
import { CombinationsView } from "@/components/desk/views/combinations";

export const Route = createFileRoute("/_desk/combinations")({
  component: CombinationsView,
});
