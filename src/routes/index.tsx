import { createFileRoute } from "@tanstack/react-router";
import { ZChecklistApp } from "@/components/zchecklist/ZChecklistApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ZChecklist — Premium Member Checklist" },
      { name: "description", content: "Check off members, track progress, and download a clean report." },
      { property: "og:title", content: "ZChecklist — Premium Member Checklist" },
      { property: "og:description", content: "Check off members, track progress, and download a clean report." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ZChecklistApp,
});
