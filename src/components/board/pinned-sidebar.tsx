"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * A sidebar that scrolls with the page, then pins once its last card is in view, while
 * the column beside it keeps going. It sticks at a negative offset equal to the part that
 * doesn't fit the screen, so it needs its own height. One shorter than the screen just
 * pins under the header.
 */
export function PinnedSidebar({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => el.style.setProperty("--sidebar-h", `${el.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <aside
      ref={ref}
      className="min-w-0 space-y-6 lg:sticky lg:top-[min(5.5rem,calc(100dvh-var(--sidebar-h,0px)-1.5rem))]"
    >
      {children}
    </aside>
  );
}
