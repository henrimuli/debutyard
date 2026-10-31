import type { BlogFaqItem } from "@/lib/blog/types";

/** Native <details> accordion: works without JS and the answers stay in the HTML for crawlers. */
export function ArticleFaq({ items }: { items: BlogFaqItem[] }) {
  const faq = items.filter((f) => f.q.trim() && f.a.trim());
  if (faq.length === 0) return null;
  return (
    <section id="faq" className="mt-12 scroll-mt-24" aria-labelledby="faq-heading">
      <h2 id="faq-heading" className="font-display text-2xl font-bold tracking-tight">
        Frequently asked questions
      </h2>
      <div className="mt-5 divide-y divide-border rounded-lg border border-border bg-card">
        {faq.map((f, i) => (
          <details key={i} className="group px-5 py-4" open={i === 0}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
              {f.q}
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
              >
                <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>
            <p className="mt-3 leading-relaxed text-muted-foreground">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
