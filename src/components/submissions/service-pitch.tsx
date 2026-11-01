import Link from "next/link";
import { Card } from "@/components/ui/primitives";
import type { CatalogStats } from "@/lib/directories/service";
import { PACKAGES } from "@/lib/submissions/packages";
import { cn } from "@/lib/utils";
import { ToPackages } from "./to-packages";

/*
 * The public submission-service page's case for the service: the pain, what
 * it's worth, how we compare, the fine print and an FAQ. The dashboard's order
 * page only reuses the chips, figures, details and a short FAQ, since anyone
 * there is already buying.
 */

const MONITOR = Object.values(PACKAGES)
  .map((p) => p.monitorMonths)
  .join(", ")
  .replace(/, (\d+)$/, " or $1");

function SectionHead({ eyebrow, title, intro }: { eyebrow: string; title: string; intro?: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
      <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
      {intro && <p className="mt-3 text-muted-foreground">{intro}</p>}
    </div>
  );
}

const icon = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  className: "size-5",
} as const;

/** Small promises under the hero, each one backed by the refund policy, the link checks or Link Monitor. */
export function TrustChips({ className }: { className?: string }) {
  const chips = ["Every link verified by us", "Rejected directories replaced", "Automatic link monitoring"];
  return (
    <ul className={cn("mt-6 flex flex-wrap justify-center gap-2", className)}>
      {chips.map((c) => (
        <li
          key={c}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-sm"
        >
          <svg {...icon} className="size-4 text-primary">
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
          {c}
        </li>
      ))}
    </ul>
  );
}

const PAINS = [
  {
    quote: "Launch week disappears into a hundred signup forms.",
    body: "Every directory wants its own account, its own copy length and its own categories. That's the week you meant to spend shipping.",
  },
  {
    quote: "I paid a cheap service and got a spreadsheet of claims.",
    body: "“Submitted” isn't “live”. Plenty of those links never go up, and nobody checks whether the rest are dofollow.",
  },
  {
    quote: "My new domain is invisible to Google.",
    body: "A fresh site has no authority, so even good pages crawl in slowly and rank behind older, weaker ones.",
  },
];

export function PainPoints() {
  return (
    <section className="mt-20">
      <SectionHead eyebrow="Sound familiar?" title="Getting listed shouldn't cost you a launch." />
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {PAINS.map((p) => (
          <Card key={p.quote} className="relative p-6">
            <span aria-hidden className="absolute right-5 top-3 font-display text-5xl leading-none text-primary/15">
              &rdquo;
            </span>
            <p className="font-display text-lg font-semibold leading-snug">{p.quote}</p>
            <p className="mt-3 text-sm text-muted-foreground">{p.body}</p>
          </Card>
        ))}
      </div>
      <p className="mt-6 font-medium">We take that whole job off your plate, and show you proof it&apos;s done.</p>
    </section>
  );
}

/** Live numbers from the directory catalog; a missing number hides its line. */
export function CatalogFigures({ stats, className }: { stats: CatalogStats; className?: string }) {
  const figures = [
    stats.active > 0 && { value: `${stats.active}+`, label: "directories we submit to" },
    stats.medianDr !== null && { value: `DR ${stats.medianDr}`, label: "median Authority Score" },
    stats.dr50 > 0 && { value: `${stats.dr50}`, label: "with an Authority Score of 50+" },
    stats.dofollow > 0 && { value: `${stats.dofollow}`, label: "with dofollow links" },
  ].filter(Boolean) as Array<{ value: string; label: string }>;
  if (figures.length === 0) return null;
  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-4",
        className,
      )}
    >
      {figures.map((f) => (
        <div key={f.label} className="bg-card p-5">
          <dt className="sr-only">{f.label}</dt>
          <dd>
            <span className="block font-display text-3xl font-bold text-primary">{f.value}</span>
            <span className="mt-1 block text-sm text-muted-foreground">{f.label}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** What the service is worth. */
export function ValueSection({ stats }: { stats: CatalogStats }) {
  const values = [
    {
      title: "Backlinks from sites Google already trusts",
      body: "Every listing links back to your product. Links from established, high-authority sites carry far more weight than anything a new domain can earn alone, and we pick directories by fit first, then by authority.",
      icon: (
        <svg {...icon}>
          <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
          <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
        </svg>
      ),
    },
    {
      title: "SEO that compounds",
      body: "Crawlers find you sooner through pages they already visit, your listings show up when people search your name, and directory browsers turn into referral visits. No ranking guarantees, just authority that builds month after month.",
      icon: (
        <svg {...icon}>
          <path d="M4 19h16" />
          <path d="M6 15l4-4 3 3 5-6" />
          <path d="M15 8h3v3" />
        </svg>
      ),
    },
    {
      title: "Your hours back, while you build",
      body: "At roughly 15 minutes a directory for the account, the form and the copy, 100 directories is 25+ hours before the rejections and follow-ups. Your part here is one five-minute form.",
      icon: (
        <svg {...icon}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </svg>
      ),
    },
    {
      title: "Proof, not promises",
      body: `We fetch every live listing and check it loads, links to you and whether the link is dofollow, and you watch each one go live on your dashboard. Link Monitor keeps checking for ${MONITOR} months after delivery and emails you if a link breaks.`,
      icon: (
        <svg {...icon}>
          <path d="M12 3 4.5 6v5.5c0 4.4 3.1 8.3 7.5 9.5 4.4-1.2 7.5-5.1 7.5-9.5V6L12 3Z" />
          <path d="M9 12.5 11 14.5 15.5 10" />
        </svg>
      ),
    },
  ];

  return (
    <section className="mt-20">
      <SectionHead
        eyebrow="What you get"
        title="Authority for your domain, without the grind."
        intro="Directory listings are one of the few ways a brand-new product can earn links from sites search engines already trust. Here's what that buys you."
      />
      <CatalogFigures stats={stats} className="mt-8" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {values.map((v) => (
          <Card key={v.title} className="p-6">
            <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">{v.icon}</span>
            <h3 className="mt-4 font-semibold">{v.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{v.body}</p>
          </Card>
        ))}
      </div>
      <div className="mt-8 flex justify-center">
        <ToPackages />
      </div>
    </section>
  );
}

type Mark = "yes" | "no" | "some";
const ROWS: Array<[string, Mark | string, Mark | string, Mark | string]> = [
  ["Your time", "25+ hours", "A few hours", "5 minutes"],
  ["Directories matched to your niche", "some", "no", "yes"],
  ["Rejected directories replaced", "no", "no", "yes"],
  ["Every live link checked, dofollow or not", "no", "no", "yes"],
  ["Live progress you can follow", "no", "no", "yes"],
  ["Links monitored after delivery", "no", "no", "yes"],
  ["Directory logins handed over", "yes", "some", "yes"],
];

function Cell({ v, us }: { v: Mark | string; us?: boolean }) {
  const label = { yes: "Yes", no: "No", some: "Sometimes" } as const;
  if (v === "yes" || v === "no" || v === "some")
    return (
      <span className={cn("inline-flex items-center gap-1.5", v === "no" && "text-muted-foreground")}>
        <span
          aria-hidden
          className={cn(
            "grid size-5 place-items-center rounded-full text-[11px] font-bold",
            v === "yes" && (us ? "bg-primary text-primary-foreground" : "bg-primary/15 text-primary"),
            v === "some" && "bg-accent/25 text-accent-foreground",
            v === "no" && "bg-muted text-muted-foreground",
          )}
        >
          {v === "yes" ? "✓" : v === "no" ? "–" : "~"}
        </span>
        <span className="sr-only sm:not-sr-only">{label[v]}</span>
      </span>
    );
  return <span className={cn(us && "font-semibold text-primary")}>{v}</span>;
}

export function Comparison() {
  return (
    <section className="mt-20">
      <SectionHead eyebrow="Why us" title="Doing it yourself, a cheap service, or DebutYard." />
      <div className="relative mt-8 overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="p-4 font-medium text-muted-foreground" scope="col">
                <span className="sr-only">Feature</span>
              </th>
              <th className="p-4 font-medium" scope="col">
                Doing it yourself
              </th>
              <th className="p-4 font-medium" scope="col">
                Typical cheap services
              </th>
              <th className="bg-primary/5 p-4 font-semibold text-primary" scope="col">
                DebutYard
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([label, diy, list, us]) => (
              <tr key={label} className="border-b border-border last:border-0">
                <th scope="row" className="p-4 font-normal">
                  {label}
                </th>
                <td className="p-4">
                  <Cell v={diy} />
                </td>
                <td className="p-4">
                  <Cell v={list} />
                </td>
                <td className="bg-primary/5 p-4">
                  <Cell v={us} us />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Badges and logins: the two things buyers ask about before paying. Also on the dashboard's order page. */
export function ServiceDetails({ compact = false }: { compact?: boolean }) {
  const items = [
    {
      title: "Badges: your call",
      icon: (
        <svg {...icon}>
          <circle cx="12" cy="9" r="5.5" />
          <path d="m8.5 13.5-1.5 7 5-2.5 5 2.5-1.5-7" />
        </svg>
      ),
      body: "Some directories only list you if you show their badge. By default we skip those. Say yes and you paste one HTML block into your footer once; we check it's live before submitting anywhere that needs it.",
      extra: "Why say yes: it opens up more directories, some of them with strong authority.",
    },
    {
      title: "Accounts and logins",
      icon: (
        <svg {...icon}>
          <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
          <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
        </svg>
      ),
      body: "Most directories need an account. We create them in your product's name and hand over every login when we deliver, so the listings stay yours to edit.",
      extra:
        "Product Hunt, Hacker News and review sites need you personally, so you get a step-by-step checklist for those instead.",
    },
  ];
  return (
    <section className={compact ? "mt-12" : "mt-20"}>
      {!compact && (
        <SectionHead
          eyebrow="The details"
          title="Badges and logins, sorted."
          intro="The two questions everyone asks before buying."
        />
      )}
      <div className={cn("grid gap-4 sm:grid-cols-2", !compact && "mt-8")}>
        {items.map((it) => (
          <Card key={it.title} className="p-6">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                {it.icon}
              </span>
              <h3 className="font-semibold">{it.title}</h3>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{it.body}</p>
            <p className="mt-2 text-sm text-muted-foreground">{it.extra}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}

/** Answers kept in line with the refund policy and the package config. */
export const FAQ: Array<{
  q: string;
  a: string;
  link?: { href: "/refund-policy" | "/directories"; label: string };
  /** Still a question once you're signed in and looking at the packages. */
  short?: boolean;
}> = [
  {
    short: true,
    q: "How long until I see results?",
    a: `We start submitting within 48 hours of getting your product details and deliver within ${PACKAGES.starter.days} days (Starter) or ${PACKAGES.growth.days} days (Growth and Scale). Listings go live as each directory reviews them. The SEO effect builds over the following weeks and months as search engines crawl the links.`,
  },
  {
    q: "Are all the links dofollow?",
    a: "We skip directories known to use nofollow links and check every live listing ourselves, so your report shows exactly which links are dofollow. A directory can change its policy, which is what Link Monitor watches for after delivery.",
  },
  {
    short: true,
    q: "What happens when a directory rejects my product?",
    a: "We replace it with an equivalent directory, so you get the number of submissions you paid for. If we can't, we refund the missing share.",
  },
  {
    q: "What do I need to provide?",
    a: "Your logo, three description lengths, your categories and whether badges are OK. It takes about five minutes on one form, and we write the rest from it.",
  },
  {
    q: "Do I need a DebutYard account?",
    a: "No. Checkout takes a minute and you get a private link by email to fill in your details and follow progress. If you do have an account, the order also shows up in your dashboard.",
  },
  {
    short: true,
    q: "Can I cancel or get a refund?",
    a: "Yes. Cancel any time before we start submitting for a full refund. If we don't deliver your report within 14 days of starting, for reasons on our side, you can ask for a full refund too.",
    link: { href: "/refund-policy", label: "Read the refund policy" },
  },
  {
    short: true,
    q: "Which directories will you use for my product?",
    a: "We match directories to your categories first, then rank them by Authority Score and by how often they accept products like yours. You can browse the whole catalog before you buy.",
    link: { href: "/directories", label: "Browse the directories" },
  },
  {
    q: "Does this replace launching on Product Hunt?",
    a: "No, and it shouldn't. Product Hunt, Hacker News and review sites need you personally, so you get a checklist for those. You can also debut on DebutYard's weekly board, free.",
  },
];

export function Faq({ compact = false }: { compact?: boolean }) {
  return (
    <section id="faq" className={cn("scroll-mt-24", compact ? "mt-12" : "mt-20")}>
      {compact ? (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xl font-semibold">Questions</h2>
          <Link href="/submission-service#faq" className="text-sm text-primary hover:underline">
            All questions
          </Link>
        </div>
      ) : (
        <SectionHead eyebrow="FAQ" title="Questions, answered." />
      )}
      <div className={cn("divide-y divide-border rounded-xl border border-border bg-card", compact ? "mt-4" : "mt-8")}>
        {FAQ.filter((f) => !compact || f.short).map((f) => (
          <details key={f.q} className="group px-5 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium">
              {f.q}
              <svg
                {...icon}
                className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-45"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </summary>
            <div className="pb-5 text-sm text-muted-foreground">
              <p>{f.a}</p>
              {f.link && (
                <Link href={f.link.href} className="mt-2 inline-block text-primary hover:underline">
                  {f.link.label} →
                </Link>
              )}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

export function ClosingCta() {
  return (
    <section className="mt-20 overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-accent/10 p-8 text-center sm:p-12">
      <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
        Ship the product. We&apos;ll handle the listings.
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
        Pick a package, fill in one form, and watch your links go live, each one checked.
      </p>
      <ToPackages className="mt-6">Pick a package</ToPackages>
    </section>
  );
}
