import { splitQuoted } from "@/lib/support/rules";

export const TZ = "Africa/Nairobi";
/** "14:02" today, "28 Oct" this year, "28/10/2025" before. */
export function shortTime(at: Date, now: Date) {
  const day = (d: Date) => d.toLocaleDateString("en-GB", { timeZone: TZ });
  if (day(at) === day(now)) return at.toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  if (at.getUTCFullYear() === now.getUTCFullYear())
    return at.toLocaleDateString("en-GB", { timeZone: TZ, day: "numeric", month: "short" });
  return day(at);
}
export const longTime = (at: Date) =>
  at.toLocaleString("en-GB", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

// [label](url) as written in our composer, or a bare URL.
const LINK = /(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"])/g;

function Linked({ text }: { text: string }) {
  return text.split(LINK).map((part, i) => {
    if (i % 2 === 0) return part;
    const md = part.match(/^\[([^\]]+)\]\((.+)\)$/);
    return (
      <a
        key={i}
        href={md ? md[2] : part}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="font-medium text-primary underline underline-offset-2"
      >
        {md ? md[1] : part}
      </a>
    );
  });
}

/**
 * A plain message in the page's own colours. The history the sender's mail app
 * quoted under it is folded away behind "•••", as in Gmail.
 */
export function MessageText({ text }: { text: string }) {
  const { own, quoted } = splitQuoted(text);
  return (
    <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
      {own ? <Linked text={own} /> : quoted ? null : "(empty message)"}
      {quoted && (
        <details className="mt-2">
          <summary
            aria-label="Show quoted text"
            title="Show quoted text"
            className="inline-block cursor-pointer list-none rounded bg-muted px-2 text-xs leading-4 text-muted-foreground hover:bg-muted/70 [&::-webkit-details-marker]:hidden"
          >
            •••
          </summary>
          <div className="mt-2 border-l-2 border-border pl-3 text-muted-foreground">
            <Linked text={quoted} />
          </div>
        </details>
      )}
    </div>
  );
}
