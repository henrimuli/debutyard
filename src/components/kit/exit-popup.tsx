"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { KIT_COUPON_PERCENT, KIT_ITEMS, KIT_NAME, popupAllowedOn } from "@/lib/kit";
import { KitSignupForm } from "./kit-signup-form";

const KEY = "dy-kit-popup";
const SNOOZE_MS = 14 * 86_400_000;
/** Ignore exits in the first few seconds: that is a bounce, not someone leaving a page they read. */
const ARM_AFTER_MS = 6_000;

type Stored = { until: number } | { subscribed: true };

function read(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

function write(v: Stored) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* private mode: the popup may show again, which is fine */
  }
}

const due = () => {
  const s = read();
  if (!s) return true;
  return "until" in s && Date.now() > s.until;
};

/**
 * Offers the Founder Kit once when a visitor is about to leave: the cursor heading for the tab
 * bar on desktop, a quick scroll back up after reading on touch screens. At most once every
 * 14 days, never again after signing up, and never on checkout, account or newsletter pages.
 */
export function ExitPopup({ turnstileSiteKey }: { turnstileSiteKey: string | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const allowed = popupAllowedOn(pathname);

  useEffect(() => {
    if (!allowed || !due()) return;
    const armedAt = Date.now() + ARM_AFTER_MS;
    let fired = false;

    const show = () => {
      if (fired || Date.now() < armedAt || !due()) return;
      // Never stack on top of another dialog (the debut modal, a screenshot viewer).
      if (document.querySelector('[role="dialog"]')) return;
      fired = true;
      write({ until: Date.now() + SNOOZE_MS });
      setOpen(true);
    };

    const onMouseOut = (e: MouseEvent) => {
      if (!e.relatedTarget && e.clientY <= 0) show();
    };

    // Touch: once they've read 40% of the page, a fast flick back up reads as heading for the exit.
    let deepest = 0;
    let lastY = window.scrollY;
    let lastT = performance.now();
    const onScroll = () => {
      const y = window.scrollY;
      const t = performance.now();
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max > 0) deepest = Math.max(deepest, y / max);
      const speed = (lastY - y) / Math.max(1, t - lastT); // px per ms, upward
      if (deepest >= 0.4 && speed > 2.5 && lastY - y > 80) show();
      lastY = y;
      lastT = t;
    };

    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (touch) window.addEventListener("scroll", onScroll, { passive: true });
    else document.addEventListener("mouseout", onMouseOut);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("mouseout", onMouseOut);
    };
  }, [allowed, pathname]);

  const onDone = useCallback(() => write({ subscribed: true }), []);

  if (!open || !allowed) return null;
  return (
    <Dialog onClose={() => setOpen(false)} size="md" label={`Get the free ${KIT_NAME}`}>
      <div className="relative p-6 sm:p-8">
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="absolute top-3 right-3 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-5">
            <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
          </svg>
        </button>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Free · 5 guides</p>
        <h2 className="mt-1.5 pr-8 font-display text-2xl font-bold tracking-tight">Before you go: the {KIT_NAME}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          What we wish every maker had before launch day, plus {KIT_COUPON_PERCENT}% off your first paid debut.
        </p>
        <ul className="mt-5 space-y-2.5">
          {KIT_ITEMS.map((item) => (
            <li key={item.slug} className="flex gap-2.5 text-sm">
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                className="mt-0.5 size-4 shrink-0 text-primary"
              >
                <path d="m5 12 5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>
                <span className="font-semibold">{item.title}</span>
                <span className="hidden text-muted-foreground sm:inline">: {item.blurb}</span>
              </span>
            </li>
          ))}
        </ul>
        <KitSignupForm
          source="exit_popup"
          turnstileSiteKey={turnstileSiteKey}
          onDone={onDone}
          autoFocus
          className="mt-6"
        />
        <p className="mt-3 text-xs text-muted-foreground">
          Includes the weekly digest, one email each Monday. Unsubscribe any time.
        </p>
      </div>
    </Dialog>
  );
}
