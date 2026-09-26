import { createFileRoute } from "@tanstack/react-router";
import { ResultsPage } from "@/components/v2/pages/results";

export const Route = createFileRoute("/v2/results")({
  component: ResultsPage,
});
