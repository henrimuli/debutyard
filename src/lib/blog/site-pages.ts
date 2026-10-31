/**
 * DebutYard pages an article may link to. These are the only non-blog URLs the
 * interlinking engine and the writer agent may suggest (besides product listings
 * and categories, which come from the database), so links never point at a page
 * that doesn't exist.
 */
export type SitePage = {
  href: string;
  title: string;
  /** Phrases that, when they appear in an article, make this page a natural link target. */
  keywords: string[];
};

export const SITE_PAGES: SitePage[] = [
  {
    href: "/submit",
    title: "Submit your product",
    keywords: ["submit your product", "launch your product", "launch your startup", "list your product", "debut"],
  },
  {
    href: "/",
    title: "This week's debuts",
    keywords: ["launch board", "weekly launch", "product launches this week", "new products"],
  },
  {
    href: "/submission-service",
    title: "Directory submission service",
    keywords: [
      "directory submission",
      "submit to directories",
      "directory submission service",
      "backlinks from directories",
    ],
  },
  {
    href: "/directories",
    title: "Launch directories",
    keywords: [
      "launch directories",
      "startup directories",
      "product directories",
      "where to launch",
      "saas directories",
    ],
  },
  {
    href: "/how-ranking-works",
    title: "How ranking works",
    keywords: ["how ranking works", "applause", "debut of the week"],
  },
  {
    href: "/launch-wall",
    title: "Launch wall",
    keywords: ["launch wall", "builders launching"],
  },
  {
    href: "/categories",
    title: "Browse categories",
    keywords: ["browse categories", "product categories"],
  },
  {
    href: "/newsletter",
    title: "The DebutYard newsletter",
    keywords: ["newsletter", "weekly newsletter", "new launches every week"],
  },
  {
    href: "/advertise",
    title: "Advertise on DebutYard",
    keywords: ["advertise", "sponsor", "reach founders"],
  },
  {
    href: "/resources/founder-kit",
    title: "The Agentic Founder's Launch Kit",
    keywords: ["launch kit", "founder kit", "launch checklist", "launch playbook", "free resources for founders"],
  },
  {
    href: "/tools/dofollow-checker",
    title: "Dofollow link checker",
    keywords: ["dofollow checker", "check dofollow", "nofollow or dofollow", "backlink checker"],
  },
  {
    href: "/tools/dr-checker",
    title: "Authority Score checker",
    keywords: ["domain rating", "domain authority", "authority score", "check domain rating"],
  },
  {
    href: "/tools/launch-readiness",
    title: "Launch readiness check",
    keywords: ["launch readiness", "ready to launch", "pre-launch checklist"],
  },
];
