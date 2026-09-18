import { createFileRoute } from "@tanstack/react-router";
import { LanesView } from "@/components/desk/views/lanes";

export const Route = createFileRoute("/_desk/lanes")({
  component: LanesView,
});
