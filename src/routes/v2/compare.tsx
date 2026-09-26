import { createFileRoute } from "@tanstack/react-router";
import { ComparePage } from "@/components/v2/pages/compare";

export const Route = createFileRoute("/v2/compare")({
  component: ComparePage,
});
