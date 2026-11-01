"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { LogoMark } from "@/components/logo";

const PILL =
  "shrink-0 rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-foreground";

/**
 * The advertise card's sample sponsor. The name and tagline always show in full, and the pill
 * says "AD" when "Sponsored" wouldn't fit beside them. This measures the text rather than using a
 * breakpoint, because a browser's minimum font size can double the pill at the same card width.
 */
export function SponsoredSample() {
  const row = useRef<HTMLDivElement>(null);
  const logo = useRef<HTMLSpanElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  const fullPill = useRef<HTMLSpanElement>(null);
  const [short, setShort] = useState(false);

  useLayoutEffect(() => {
    const measure = () => {
      if (!row.current || !logo.current || !text.current || !fullPill.current) return;
      const gap = parseFloat(getComputedStyle(row.current).columnGap) || 0;
      const textWidth = Math.max(...Array.from(text.current.children, (line) => line.scrollWidth));
      const needed = logo.current.offsetWidth + gap + textWidth + gap + fullPill.current.offsetWidth;
      setShort(needed > row.current.clientWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row.current!);
    document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={row} className="relative flex items-center gap-2.5">
      <span ref={logo} className="grid size-9 shrink-0 place-items-center rounded-lg bg-foreground">
        <LogoMark className="size-5" />
      </span>
      <span ref={text} className="min-w-0 flex-1">
        <span className="block w-fit max-w-full truncate text-sm font-semibold">Your product</span>
        <span className="block w-fit max-w-full truncate text-xs text-muted-foreground">Seen first</span>
      </span>
      <span className={PILL}>{short ? "AD" : "Sponsored"}</span>
      <span ref={fullPill} className={`invisible absolute ${PILL}`}>
        Sponsored
      </span>
    </div>
  );
}
