import type { GuideBlock } from "@/lib/kit-guides";
import { cn } from "@/lib/utils";

const Check = () => (
  <svg
    aria-hidden
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    className="mt-0.5 size-5 shrink-0 text-primary"
  >
    <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
    <path d="m8 12 3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Renders a kit guide's content blocks in the site's prose style. */
export function GuideBody({ blocks, className }: { blocks: GuideBlock[]; className?: string }) {
  return (
    <div className={cn("prose-dy", className)}>
      {blocks.map((b, i) => {
        if ("h2" in b) return <h2 key={i}>{b.h2}</h2>;
        if ("p" in b) return <p key={i}>{b.p}</p>;
        if ("list" in b)
          return (
            <ul key={i}>
              {b.list.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          );
        if ("checklist" in b)
          return (
            <ul key={i} className="not-prose my-5 space-y-2.5">
              {b.checklist.map((x) => (
                <li key={x} className="flex gap-2.5 leading-relaxed">
                  <Check />
                  <span>{x}</span>
                </li>
              ))}
            </ul>
          );
        if ("steps" in b)
          return (
            <ol key={i} className="not-prose my-5 space-y-4">
              {b.steps.map((s, n) => (
                <li key={s.title} className="flex gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {n + 1}
                  </span>
                  <span className="leading-relaxed">
                    <span className="block font-semibold">{s.title}</span>
                    <span className="text-muted-foreground">{s.body}</span>
                  </span>
                </li>
              ))}
            </ol>
          );
        return (
          <figure key={i} className="not-prose my-5">
            {b.label ? (
              <figcaption className="mb-1.5 font-mono text-xs text-muted-foreground">{b.label}</figcaption>
            ) : null}
            <pre className="overflow-x-auto rounded-lg border border-border bg-muted/50 p-4 font-mono text-sm leading-relaxed">
              <code>{b.code}</code>
            </pre>
          </figure>
        );
      })}
    </div>
  );
}
