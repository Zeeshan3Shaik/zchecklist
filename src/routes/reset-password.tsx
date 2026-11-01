import { createFileRoute } from "@tanstack/react-router";
import { RecoveryScreen } from "@/components/zchecklist/AccountScreens";
export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Reset Password — ZChecklist" }, { name: "description", content: "Securely recover your ZChecklist account." }, { property: "og:title", content: "Reset Password — ZChecklist" }, { property: "og:description", content: "Securely recover your ZChecklist account." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: RecoveryScreen,
});