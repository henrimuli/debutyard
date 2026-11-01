"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

const sizes = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-6xl" } as const;

// Open dialogs, innermost last: Escape closes only the top one (e.g. a screenshot viewer over the debut modal).
const stack: symbol[] = [];

/**
 * Modal dialog over the page: Escape and the backdrop close it, the page
 * behind stops scrolling, and focus moves into the panel and back out.
 */
export function Dialog({
  onClose,
  size = "sm",
  label,
  children,
  className,
}: {
  onClose: () => void;
  size?: keyof typeof sizes;
  /** Accessible name, read by screen readers. */
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    const id = Symbol("dialog");
    stack.push(id);
    const onKey = (e: KeyboardEvent) => {
      // A control inside that handled Escape itself (an open Select) prevents default.
      if (e.key === "Escape" && !e.defaultPrevented && stack.at(-1) === id) onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      stack.splice(stack.indexOf(id), 1);
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 sm:items-center sm:p-6">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px]" aria-hidden onClick={() => onCloseRef.current()} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={cn(
          "relative my-auto w-full rounded-xl border border-border bg-card shadow-2xl outline-none",
          sizes[size],
          className,
        )}
      >
        <button
          type="button"
          onClick={() => onCloseRef.current()}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
          </svg>
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}
