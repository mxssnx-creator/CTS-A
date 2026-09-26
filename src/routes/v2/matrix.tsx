import { createFileRoute } from "@tanstack/react-router";
import { MatrixPage } from "@/components/v2/pages/matrix";

export const Route = createFileRoute("/v2/matrix")({
  component: MatrixPage,
});
