import { PostError } from "@/lib/blog/service";

/**
 * Per-staff throttle for the writer agent, a guard rail against a runaway
 * loop or a stuck button spending the Gemini budget. In-memory, so each
 * server instance counts separately; that's enough for a guard rail.
 */
const PER_MINUTE = 12;
const PER_DAY = 200;

const hits = new Map<string, number[]>();

export function enforceAiLimit(userId: string, now = Date.now()): void {
  const day = now - 86_400_000;
  const minute = now - 60_000;
  const recent = (hits.get(userId) ?? []).filter((t) => t > day);
  const lastMinute = recent.filter((t) => t > minute);

  if (lastMinute.length >= PER_MINUTE) {
    const retryAfter = Math.max(1, Math.ceil((lastMinute[0]! + 60_000 - now) / 1000));
    throw new PostError(`Slow down a little: ${PER_MINUTE} AI requests a minute. Try again in ${retryAfter}s.`, 429);
  }
  if (recent.length >= PER_DAY) {
    throw new PostError("That's today's AI request limit. It resets over the next 24 hours.", 429);
  }
  recent.push(now);
  hits.set(userId, recent);

  if (hits.size > 500) {
    for (const [k, v] of hits) if (v.every((t) => t <= day)) hits.delete(k);
  }
}
