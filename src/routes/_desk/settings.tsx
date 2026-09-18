import { createFileRoute } from "@tanstack/react-router";
import { SettingsView } from "@/components/desk/views/settings";

export const Route = createFileRoute("/_desk/settings")({
  component: SettingsView,
});
