"use client";

import { useEffect, useState } from "react";
import type { BlogTocItem } from "@/lib/blog/types";
import { cn } from "@/lib/utils";

/**
 * Highlights the section nearest the top of the viewport. A heading counts as "active" once it
 * crosses the top ~30% band; the last one to have crossed stays active until the next does.
 */
function useActiveHeading(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);

  useEffect(() => {
    if (ids.length === 0) return;
    const elements = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const compute = () => {
      const line = window.innerHeight * 0.3;
      let current = elements[0]!.id;
      for (const el of elements) {
        if (el.getBoundingClientRect().top - line <= 0) current = el.id;
        else break;
      }
      // Bottom of the page: the last section is active even if it is too short to reach the line.
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      setActive(atBottom ? elements[elements.length - 1]!.id : current);
    };

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        compute();
      });
    };
    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ids]);

  return active;
}

function TocList({
  items,
  active,
  onNavigate,
}: {
  items: BlogTocItem[];
  active: string | null;
  onNavigate?: () => void;
}) {
  return (
    <ol className="space-y-0.5 border-l border-border">
      {items.map((item) => {
        const isActive = item.id === active;
        return (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              onClick={onNavigate}
              aria-current={isActive ? "location" : undefined}
              className={cn(
                "-ml-px block border-l-2 py-1.5 pr-2 text-sm leading-snug transition-colors",
                item.level === 3 ? "pl-6" : "pl-4",
                isActive
                  ? "border-primary font-semibold text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {item.text}
            </a>
          </li>
        );
      })}
    </ol>
  );
}

/** Sticky rail on wide screens; a collapsible "On this page" block above the article otherwise. */
export function TableOfContents({ items }: { items: BlogTocItem[] }) {
  const ids = items.map((i) => i.id);
  const active = useActiveHeading(ids);
  const [open, setOpen] = useState(false);

  if (items.length < 2) return null;

  return (
    <>
      {/* `sticky` must be on the nav itself: its parent is the stretched grid cell it travels within. */}
      <nav
        aria-label="Table of contents"
        className="sticky top-24 hidden max-h-[calc(100vh-7rem)] overflow-y-auto pr-2 xl:block"
      >
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">On this page</p>
        <TocList items={items} active={active} />
      </nav>

      <nav aria-label="Table of contents" className="rounded-lg border border-border bg-card xl:hidden">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full items-center justify-between px-5 py-3.5 text-left font-semibold"
        >
          On this page
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className={cn("size-5 text-muted-foreground transition-transform", open && "rotate-180")}
          >
            <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {open ? (
          <div className="px-5 pb-4">
            <TocList items={items} active={active} onNavigate={() => setOpen(false)} />
          </div>
        ) : null}
      </nav>
    </>
  );
}
