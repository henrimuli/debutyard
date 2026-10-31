import type { Route } from "next";

/** The Founder Kit: what the exit-intent popup and /resources hand out for a newsletter sign-up. */

export const KIT_NAME = "Founder Kit";
export const KIT_PATH = "/resources/founder-kit" as Route;

/** Seeded by migration 20261031101835_founder_kit: 15% off a first paid debut. */
export const KIT_COUPON = "FOUNDERKIT15";
export const KIT_COUPON_PERCENT = 15;

/** Newsletter `source` for sign-ups that should get the kit. */
export const KIT_SOURCES = ["exit_popup", "resources"] as const;
export type KitSource = (typeof KIT_SOURCES)[number];
export const isKitSource = (s: string | null | undefined): s is KitSource =>
  (KIT_SOURCES as readonly string[]).includes(s ?? "");

export type KitItemSlug =
  "directory-atlas" | "agentic-dev-starter" | "ship-checklist" | "ai-search-playbook" | "launch-playbook";

/** In the order the popup, the emails, /resources and the kit page all list them. */
export const KIT_ITEMS: { slug: KitItemSlug; title: string; blurb: string }[] = [
  {
    slug: "ai-search-playbook",
    title: "AI Search Visibility Playbook",
    blurb: "How to get cited by ChatGPT, Perplexity and Google's AI answers, not just ranked.",
  },
  {
    slug: "ship-checklist",
    title: "Vibe-Coded App Ship Checklist",
    blurb: "The security, billing and reliability checks to run before strangers use what an AI helped you build.",
  },
  {
    slug: "directory-atlas",
    title: "Directory Atlas",
    blurb:
      "Every launch directory we track, tiered by what to submit first, with authority, price and link type. CSV included.",
  },
  {
    slug: "launch-playbook",
    title: "30-Day Launch Playbook",
    blurb: "A day-by-day plan from two weeks before launch to two weeks after, with what to post where.",
  },
  {
    slug: "agentic-dev-starter",
    title: "Agentic Dev Starter Pack",
    blurb: "A project setup that coding agents work well in: the instruction file, guardrails and the review loop.",
  },
];

/** "the A, the B, … and the E", for email copy. */
export const kitItemList = () => {
  const names = KIT_ITEMS.map((i) => `the ${i.title}`);
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
};

export const kitItemPath = (slug: KitItemSlug) => `${KIT_PATH}/${slug}` as Route;

/**
 * Pages where the exit-intent popup never shows: anywhere a visitor is paying, submitting,
 * signing in or already in their account, and the newsletter and kit pages themselves.
 */
const NO_POPUP = [
  "/checkout",
  "/submit",
  "/dashboard",
  "/admin",
  "/auth",
  "/sign-in",
  "/newsletter",
  "/orders",
  "/resources/founder-kit",
  "/blog/review",
  "/blog/preview",
];

export const popupAllowedOn = (pathname: string) =>
  !NO_POPUP.some((p) => pathname === p || pathname.startsWith(`${p}/`));
