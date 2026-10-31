"use client";

import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { IconClose } from "@/components/blog-admin/icons";
import { Dialog } from "@/components/ui/dialog";
import type { BlogDisplayStatus } from "@/lib/blog/types";
import { cn } from "@/lib/utils";

/** Form controls and small widgets for the blog editor, on the site's tokens. */

const control =
  "w-full rounded-md border border-border bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

export function TextInput({ className, ...props }: ComponentProps<"input">) {
  return <input {...props} className={cn(control, className)} />;
}

export function TextArea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={cn(control, "resize-y", className)} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select {...props} className={cn(control, "h-10 py-0", className)} />;
}

export function Field({
  label,
  hint,
  right,
  htmlFor,
  children,
}: {
  label: string;
  hint?: ReactNode;
  right?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </label>
        {right}
      </div>
      {children}
      {hint ? <p className="text-xs leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** "56 / 30–60": green inside the ideal range, amber near it, red far outside. */
export function Counter({ value, min, max }: { value: number; min: number; max: number }) {
  const tone =
    value === 0
      ? "text-muted-foreground"
      : value >= min && value <= max
        ? "text-success"
        : value >= min * 0.7 && value <= max * 1.15
          ? "text-amber-600 dark:text-amber-400"
          : "text-danger";
  return (
    <span className={cn("text-xs tabular-nums", tone)} aria-label={`${value} characters, aim for ${min} to ${max}`}>
      {value} / {min}–{max}
    </span>
  );
}

/** Tag-style multi-value input: Enter or comma adds, Backspace on empty removes the last. */
export function ChipInput({
  values,
  onChange,
  placeholder,
  max,
  suggestions = [],
  label,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  max?: number;
  suggestions?: string[];
  label: string;
}) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const v = raw.trim().replace(/,+$/, "").trim();
    setDraft("");
    if (!v || values.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    if (max && values.length >= max) return;
    onChange([...values, v]);
  };
  const q = draft.trim().toLowerCase();
  const hints = q ? suggestions.filter((s) => s.toLowerCase().includes(q) && !values.includes(s)).slice(0, 5) : [];

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-card p-1.5 focus-within:ring-2 focus-within:ring-ring">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded bg-muted py-0.5 pl-2 pr-1 text-sm">
            {v}
            <button
              type="button"
              aria-label={`Remove ${v}`}
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="rounded p-0.5 text-muted-foreground hover:bg-border hover:text-foreground"
            >
              <IconClose className="size-3.5" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          aria-label={label}
          placeholder={values.length === 0 ? placeholder : ""}
          onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={() => draft.trim() && add(draft)}
          className="min-w-24 flex-1 bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {hints.length > 0 ? (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border bg-card shadow-lg">
          {hints.map((h) => (
            <li key={h}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(h)}
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted"
              >
                {h}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const STATUS_STYLE: Record<BlogDisplayStatus, string> = {
  published: "bg-success/10 text-success",
  scheduled: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  draft: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status, className }: { status: BlogDisplayStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize",
        STATUS_STYLE[status],
        className,
      )}
    >
      {status}
    </span>
  );
}

export function scoreTone(score: number | null) {
  if (score === null) return "bg-muted text-muted-foreground";
  if (score >= 80) return "bg-success/10 text-success";
  if (score >= 55) return "bg-accent/25 text-foreground";
  return "bg-danger/10 text-danger";
}

/** The on-page SEO score as a small chip. */
export function ScoreChip({ score, className }: { score: number | null; className?: string }) {
  return (
    <span
      title="On-page SEO score"
      className={cn(
        "inline-flex min-w-9 items-center justify-center rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums",
        scoreTone(score),
        className,
      )}
    >
      {score ?? "–"}
    </span>
  );
}

/** The site's Dialog with a title bar and an optional footer row. */
export function Modal({
  title,
  onClose,
  children,
  footer,
  size = "sm",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "xl";
}) {
  return (
    <Dialog onClose={onClose} label={title} size={size} className="flex max-h-[90dvh] flex-col">
      <h2 className="border-b border-border px-5 py-3.5 pr-12 font-display text-lg font-semibold">{title}</h2>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      {footer ? (
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>
      ) : null}
    </Dialog>
  );
}

/** A menu that opens under its trigger and closes on outside click or Escape. */
export function Menu({
  trigger,
  children,
  align = "right",
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open ? (
        <div
          role="menu"
          className={cn(
            "absolute z-40 mt-1 min-w-52 rounded-lg border border-border bg-card p-1 shadow-xl",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

export function MenuItem({ danger, className, ...props }: ComponentProps<"button"> & { danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      {...props}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted",
        danger && "text-danger hover:bg-danger/10",
        className,
      )}
    />
  );
}

export type ToastState = { id: number; message: string; tone: "info" | "error" } | null;

/** One short message at the bottom of the screen; errors stay a little longer. */
export function Toast({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(onDismiss, toast.tone === "error" ? 8000 : 3500);
    return () => window.clearTimeout(t);
  }, [toast, onDismiss]);
  if (!toast) return null;
  return (
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      className={cn(
        "fixed bottom-5 left-1/2 z-[90] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-start gap-3 whitespace-pre-line rounded-lg px-4 py-2.5 text-sm shadow-xl",
        toast.tone === "error" ? "bg-danger text-white" : "bg-foreground text-background",
      )}
    >
      <span className="min-w-0">{toast.message}</span>
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="opacity-70 hover:opacity-100">
        <IconClose className="size-4" />
      </button>
    </div>
  );
}
