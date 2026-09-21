import { createFileRoute } from "@tanstack/react-router";
import { ModernView } from "@/components/desk/views/modern";

export const Route = createFileRoute("/_desk/modern")({
  component: ModernView,
});
