import type { Route } from "next";
import { drEnabled } from "@/lib/metrics/service";

export type FreeTool = {
  href: Route;
  label: string;
  description: string;
  icon: React.ReactNode;
};

const ICON = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  className: "size-5",
} as const;

/** The free tools, for the header's Free Tools panel and the footer. The Domain Rating checker needs a DR provider. */
export function freeTools(): FreeTool[] {
  const tools: Array<FreeTool & { dr?: boolean }> = [
    {
      href: "/tools/launch-readiness",
      label: "Launch readiness check",
      description: "Score your page on HTTPS, SEO tags, social image and indexability, with fixes.",
      icon: (
        <svg {...ICON}>
          <path d="M9 12.5 11 14.5 15.5 10" />
          <path d="M12 3 4.5 6v5.5c0 4.4 3.1 8.3 7.5 9.5 4.4-1.2 7.5-5.1 7.5-9.5V6L12 3Z" />
        </svg>
      ),
    },
    {
      href: "/tools/dofollow-checker",
      label: "Dofollow link checker",
      description: "See whether that link you got is really dofollow.",
      icon: (
        <svg {...ICON}>
          <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
          <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
        </svg>
      ),
    },
    {
      href: "/tools/dr-checker",
      label: "Domain Rating checker",
      description: "Any site's Domain Rating from 0 to 100.",
      dr: true,
      icon: (
        <svg {...ICON}>
          <path d="M4 19V5" />
          <path d="M4 19h16" />
          <path d="M8 15l3.5-4 3 2.5L19 8" />
        </svg>
      ),
    },
  ];
  return tools.filter((t) => !t.dr || drEnabled());
}
