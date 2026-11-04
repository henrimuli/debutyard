import { DR_ATTRIBUTION } from "@/lib/metrics/providers";
import { cn } from "@/lib/utils";

const sizes = {
  // Drawn at 10px and scaled to an effective 8px: browsers with a minimum font size ignore smaller font sizes.
  sm: { box: "size-8", text: "text-[10px] scale-80", stroke: 3.5 },
  md: { box: "size-12", text: "text-sm", stroke: 3.5 },
  lg: { box: "size-28", text: "text-3xl", stroke: 3 },
} as const;

/**
 * Domain Rating (0–100) as a number inside a ring whose band fills to the
 * score, growing in on first paint. Null shows an empty ring and a dash.
 */
export function DomainRating({
  score,
  size = "sm",
  className,
}: {
  score: number | null;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const s = sizes[size];
  const value = score === null ? null : Math.max(0, Math.min(100, Math.round(score)));
  return (
    <span
      role="img"
      aria-label={value === null ? "Domain Rating not measured yet" : `Domain Rating ${value} out of 100`}
      className={cn("relative inline-grid shrink-0 place-items-center", s.box, className)}
    >
      <svg viewBox="0 0 36 36" aria-hidden className="absolute inset-0 size-full -rotate-90">
        <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--border)" strokeWidth={s.stroke} />
        {value !== null && value > 0 && (
          <circle
            cx="18"
            cy="18"
            r="15.5"
            fill="none"
            stroke="var(--primary)"
            strokeWidth={s.stroke}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="100"
            strokeDashoffset={100 - value}
            className="score-band"
          />
        )}
      </svg>
      <span className={cn("relative font-display font-bold tabular-nums leading-none", s.text)}>{value ?? "–"}</span>
    </span>
  );
}

/**
 * The credit Ahrefs' licence asks for next to any Domain Rating we show, with
 * "Ahrefs" as a working link. Goes beside the score, or above a list of them.
 * Not inside another link: card lists take it above the cards.
 */
export function DrAttribution({ className }: { className?: string }) {
  return (
    <span className={cn("text-xs text-muted-foreground", className)}>
      Domain Rating by{" "}
      <a href={DR_ATTRIBUTION.url} target="_blank" rel="noopener" className="underline hover:text-foreground">
        Ahrefs
      </a>
    </span>
  );
}
