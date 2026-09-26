import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/components/v2/pages/settings";

export const Route = createFileRoute("/v2/settings")({
  component: SettingsPage,
});
