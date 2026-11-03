import type { Route } from "next";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { NewsletterForm } from "@/components/newsletter-form";
import { freeTools } from "@/components/tools/tool-list";
import { Container } from "@/components/ui/primitives";
import { SectionWave } from "@/components/ui/section-wave";
import { site } from "@/config/site";

type FooterLink = { href: Route; label: string };

const columns: Array<{ heading: string; links: FooterLink[] }> = [
  {
    heading: "Explore",
    links: [
      { href: "/", label: "This week" },
      { href: "/weeks", label: "Past weeks" },
      { href: "/categories", label: "Categories" },
      { href: "/launch-wall", label: "Launch wall" },
      { href: "/blog", label: "Blog" },
      { href: "/resources", label: "Free resources" },
    ],
  },
  {
    heading: "For makers",
    links: [
      { href: "/submission-service", label: "Submission service" },
      { href: "/directories", label: "Directories" },
      { href: "/advertise", label: "Advertise" },
      { href: "/docs", label: "API & MCP" },
    ],
  },
];

const BADGE_BLOCK_URL = "https://preview.debutyard.com/badges/20d1825e49d74c3ca7c6c0e67b9e2e4f.html";

const legal: FooterLink[] = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/refund-policy", label: "Refund policy" },
];

/** Our own badge block, fetched like any maker's server would. If the fetch fails the footer goes without it. */
async function badgeBlockHtml() {
  "use cache";
  // Not a shorter life: that sends the block after the page, hidden until a script moves it, and directories miss it.
  cacheLife("minutes");
  try {
    const res = await fetch(BADGE_BLOCK_URL, { signal: AbortSignal.timeout(3000) });
    return res.ok ? await res.text() : "";
  } catch {
    return "";
  }
}

async function BadgeBlock() {
  const html = await badgeBlockHtml();
  return html ? <Container dangerouslySetInnerHTML={{ __html: html }} /> : null;
}

export function SiteFooter() {
  const groups = [
    ...columns,
    { heading: "Free tools", links: freeTools().map((t) => ({ href: t.href, label: t.label })) },
  ];
  return (
    <footer className="mt-24 print:hidden">
      <SectionWave />
      <Container className="grid gap-10 pb-8 pt-14 md:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))] md:gap-8">
        <div className="space-y-3">
          <Logo className="text-lg" />
          <p className="text-sm text-muted-foreground">{site.tagline}</p>
          <div className="pt-3">
            <p className="mb-2 text-sm font-medium">Weekly digest: winners and new debuts, every Monday.</p>
            <NewsletterForm source="footer" className="max-w-sm" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:contents">
          {groups.map((g) => (
            <nav key={g.heading} aria-label={g.heading}>
              <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground">{g.heading}</h2>
              <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
                {g.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="hover:text-foreground">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </Container>
      <BadgeBlock />
      <Container className="flex flex-col gap-3 border-t border-border/70 py-6 text-xs text-muted-foreground sm:flex-row sm:items-end sm:justify-between">
        <p>
          © {site.legalName} ·{" "}
          <a href={`mailto:${site.supportEmail}`} className="hover:text-foreground">
            {site.supportEmail}
          </a>
        </p>
        <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2">
          {legal.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-foreground">
              {l.label}
            </Link>
          ))}
          <a href={site.social.x} rel="noopener" target="_blank" className="hover:text-foreground">
            X / Twitter
          </a>
        </nav>
      </Container>
    </footer>
  );
}
