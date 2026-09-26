import { createFileRoute } from "@tanstack/react-router";
import { StagesPage } from "@/components/v2/pages/stages";

export const Route = createFileRoute("/v2/stages")({
  component: StagesPage,
});
