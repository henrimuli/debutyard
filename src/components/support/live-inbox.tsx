"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * One shared poll of the mail counts for the whole admin, however many
 * components listen: every 5 seconds while the tab is visible, and at once when
 * it becomes visible again. So new mail shows within 5 seconds of its webhook.
 */
type MailPulse = { unread: number; latest: string | null };
type Pulse = MailPulse & { orderMail: MailPulse };
let pulse: Pulse | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let inFlight = false;

/** Asks for fresh numbers now, e.g. after opening a conversation marks it read. */
export async function pollInbox() {
  if (inFlight || document.hidden) return;
  inFlight = true;
  try {
    const res = await fetch("/admin/pulse", { cache: "no-store" });
    if (!res.ok) return;
    const next = (await res.json()) as Pulse;
    if (JSON.stringify(next) !== JSON.stringify(pulse)) {
      pulse = next;
      listeners.forEach((l) => l());
    }
  } catch {
    // Offline or signed out: try again on the next tick.
  } finally {
    inFlight = false;
  }
}

const onVisible = () => {
  if (!document.hidden) void pollInbox();
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    void pollInbox();
    timer = setInterval(pollInbox, 5_000);
    document.addEventListener("visibilitychange", onVisible);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    }
  };
}

const usePulse = () =>
  useSyncExternalStore(
    subscribe,
    () => pulse,
    () => null,
  );

function NavCount({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="ml-auto min-w-5 rounded-full bg-primary px-1.5 text-center text-[11px] font-semibold leading-5 text-primary-foreground">
      {n > 99 ? "99+" : n}
    </span>
  );
}

/** Unread conversations, beside "Email" in the admin sidebar. */
export function InboxBadge({ initial }: { initial: number }) {
  return <NavCount n={usePulse()?.unread ?? initial} />;
}

/** Unread emails across order inboxes, beside "Submissions" in the admin sidebar. */
export function OrderMailBadge({ initial }: { initial: number }) {
  return <NavCount n={usePulse()?.orderMail.unread ?? initial} />;
}

/** Re-renders the inbox page when new mail arrives, without a reload. */
export function LiveRefresh() {
  const router = useRouter();
  const latest = usePulse()?.latest ?? null;
  const prev = useRef(latest);
  useEffect(() => {
    // The first value is what the page was rendered with; only later changes are new mail.
    if (prev.current && latest && latest !== prev.current) router.refresh();
    prev.current = latest;
  }, [latest, router]);
  return null;
}

/**
 * Keeps a page showing order mail current: `rendered` is the pulse it was rendered
 * with, and it re-renders whenever the live one differs. That also catches the
 * very first order email, and mail that came while the page was away.
 */
export function OrderMailRefresh({ rendered }: { rendered: MailPulse }) {
  const router = useRouter();
  const live = usePulse()?.orderMail;
  const liveKey = live ? `${live.unread}|${live.latest}` : null;
  const renderedKey = `${rendered.unread}|${rendered.latest}`;
  useEffect(() => {
    if (liveKey && liveKey !== renderedKey) router.refresh();
  }, [liveKey, renderedKey, router]);
  return null;
}
