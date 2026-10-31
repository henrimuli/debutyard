"use client";

import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type Option = { value: string; label: ReactNode; text: string; disabled: boolean };

/** What `onChange` gets: shaped like a change event, so `e.target.value` reads the same as on `<select>`. */
export type SelectChange = { target: { value: string; name?: string } };

type Props = {
  /** `<option>` elements, as you would give a `<select>`. */
  children: ReactNode;
  value?: string;
  defaultValue?: string;
  onChange?: (e: SelectChange) => void;
  /** Posted with the form through a hidden input, like a native select. */
  name?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
};

const text = (node: ReactNode): string =>
  typeof node === "string" || typeof node === "number"
    ? String(node)
    : Array.isArray(node)
      ? node.map(text).join("")
      : isValidElement<{ children?: ReactNode }>(node)
        ? text(node.props.children)
        : "";

/** Reads `<option>`s out of children, through arrays and fragments. */
function readOptions(children: ReactNode, out: Option[] = []): Option[] {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const el = child as ReactElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>;
    if (el.type === "option") {
      const label = el.props.children;
      out.push({
        value: el.props.value !== undefined ? String(el.props.value) : text(label),
        label,
        text: text(label),
        disabled: Boolean(el.props.disabled),
      });
    } else readOptions(el.props.children, out);
  });
  return out;
}

const PANEL_MAX = 288; // max-h-72

/**
 * The site's dropdown, in place of the browser's native one: a button that opens a listbox in the
 * same card style as our menus and dialogs. Takes `<option>` children and calls `onChange` with
 * `{ target: { value } }`, so it swaps in for `<select>` as is. Arrow keys, Home/End, Enter, Escape
 * and typing a letter work as on a native select; focus stays on the button throughout.
 */
export function Select({
  children,
  value,
  defaultValue,
  onChange,
  name,
  id,
  disabled,
  className,
  "aria-label": ariaLabel,
}: Props) {
  const options = readOptions(children);
  const [own, setOwn] = useState(defaultValue ?? options[0]?.value ?? "");
  const current = value ?? own;
  const selected = options.find((o) => o.value === current) ?? options[0];

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<CSSProperties>({});
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const listId = useId();
  const optionId = (i: number) => `${listId}-${i}`;

  function place() {
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom;
    const up = below < Math.min(PANEL_MAX, options.length * 36 + 8) + 8 && r.top > below;
    setPos({
      position: "fixed",
      left: r.left,
      minWidth: r.width,
      maxWidth: Math.max(r.width, window.innerWidth - r.left - 8),
      ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
    });
  }

  function show() {
    if (disabled || options.length === 0) return;
    place();
    setActive(Math.max(0, options.indexOf(selected)));
    setOpen(true);
  }

  function pick(i: number) {
    const o = options[i];
    if (!o || o.disabled) return;
    setOpen(false);
    if (o.value === current) return;
    if (value === undefined) setOwn(o.value);
    onChange?.({ target: { value: o.value, name } });
  }

  function move(from: number, step: 1 | -1) {
    for (let i = from + step; i >= 0 && i < options.length; i += step) if (!options[i].disabled) return i;
    return from;
  }

  function onKeyDown(e: KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        show();
      }
      return;
    }
    if (e.key === "Escape") {
      // Closes the list, not a dialog it sits in (the Dialog skips handled keys).
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => move(a, e.key === "ArrowDown" ? 1 : -1));
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setActive(e.key === "Home" ? move(-1, 1) : move(options.length, -1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(active);
    } else if (e.key === "Tab") {
      setOpen(false);
    } else if (e.key.length === 1 && /\S/.test(e.key)) {
      // Type to jump, like a native select: letters typed in quick succession build a prefix.
      const now = Date.now();
      const t = typed.current;
      t.text = (now - t.at < 700 ? t.text : "") + e.key.toLowerCase();
      t.at = now;
      const hit = options.findIndex((o) => !o.disabled && o.text.toLowerCase().startsWith(t.text));
      if (hit >= 0) setActive(hit);
    }
  }

  // While open: follow the button when the page scrolls or resizes, and close on a press outside.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!button.current?.contains(t) && !list.current?.contains(t)) setOpen(false);
    };
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("pointerdown", onPointer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- place only reads the button's position
  }, [open]);

  useEffect(() => {
    if (open)
      list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  return (
    <>
      <button
        ref={button}
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? optionId(active) : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        className={cn(
          "inline-flex h-11 w-full items-center justify-between gap-2 rounded-md border border-border bg-card px-3 text-left text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 sm:h-10 sm:text-sm",
          className,
        )}
      >
        <span className="min-w-0 truncate">{selected?.label}</span>
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className={cn("size-3.5 shrink-0 opacity-60 transition-transform", open && "rotate-180")}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m4 6 4 4 4-4" />
        </svg>
      </button>
      {name !== undefined ? <input type="hidden" name={name} value={current} /> : null}
      {open
        ? createPortal(
            <ul
              ref={list}
              id={listId}
              role="listbox"
              aria-label={ariaLabel}
              style={pos}
              className="z-[60] max-h-72 overflow-y-auto rounded-lg border border-border bg-card p-1 text-sm text-foreground shadow-xl"
            >
              {options.map((o, i) => (
                <li
                  key={`${o.value}-${i}`}
                  id={optionId(i)}
                  data-index={i}
                  role="option"
                  aria-selected={o.value === current}
                  aria-disabled={o.disabled || undefined}
                  // Keep focus on the button: a mousedown here would otherwise move it.
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => !o.disabled && setActive(i)}
                  onClick={() => pick(i)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 py-2 sm:py-1.5",
                    i === active && "bg-muted",
                    o.value === current && "font-medium",
                    o.disabled && "cursor-default opacity-50",
                  )}
                >
                  <span className="min-w-0 truncate">{o.label}</span>
                  {o.value === current ? (
                    <svg
                      aria-hidden
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.5}
                      className="size-4 shrink-0 text-primary"
                    >
                      <path d="m5 12 5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
    </>
  );
}
