/**
 * Which version of the pitch gets the next email, and when to give up on one.
 * Thompson sampling: each version is drawn from what its results so far allow,
 * so better ones get more sends while weak ones keep a fair chance. Pure, with
 * the random source passed in.
 */

export type VariantStats = {
  id: string;
  sent: number;
  /** Sends that got a real click or a positive reply. Opens don't count, and aren't tracked. */
  engaged: number;
  /** Unsubscribes and spam complaints. */
  unhappy: number;
};

/** No version is judged before this many sends. */
export const MIN_SENDS_TO_RETIRE = 100;
const RETIRE_BELOW = 0.05;
const UNHAPPY_MIN_SENDS = 30;
const UNHAPPY_RATE = 0.05;

type Rng = () => number;

function normal(rng: Rng): number {
  const u = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/** Marsaglia and Tsang. Shape is always 1 or more here. */
function gamma(shape: number, rng: Rng): number {
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const x = normal(rng);
    const v = (1 + c * x) ** 3;
    if (v <= 0) continue;
    if (Math.log(Math.max(rng(), 1e-12)) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
  }
}

function drawRate(s: VariantStats, rng: Rng): number {
  const a = gamma(1 + s.engaged, rng);
  const b = gamma(1 + Math.max(0, s.sent - s.engaged), rng);
  return a / (a + b);
}

/** The version for the next email, or null with none to choose from. */
export function chooseVariant(stats: VariantStats[], rng: Rng = Math.random): string | null {
  let best: { id: string; rate: number } | null = null;
  for (const s of stats) {
    const rate = drawRate(s, rng);
    if (!best || rate > best.rate) best = { id: s.id, rate };
  }
  return best?.id ?? null;
}

/** The chance each version is truly the best, by simulation. */
export function probabilityBest(stats: VariantStats[], rng: Rng = Math.random, draws = 2000): Map<string, number> {
  const wins = new Map(stats.map((s) => [s.id, 0]));
  for (let i = 0; i < draws; i++) {
    const id = chooseVariant(stats, rng);
    if (id) wins.set(id, wins.get(id)! + 1);
  }
  return new Map([...wins].map(([id, n]) => [id, n / draws]));
}

/** Versions to retire, with why. The last one standing is always kept, however it's doing. */
export function retirements(stats: VariantStats[], rng: Rng = Math.random): Array<{ id: string; reason: string }> {
  if (stats.length < 2) return [];
  const best = probabilityBest(stats, rng);
  const out: Array<{ id: string; reason: string }> = [];
  for (const s of stats) {
    if (s.sent >= UNHAPPY_MIN_SENDS && s.unhappy / s.sent >= UNHAPPY_RATE) {
      out.push({ id: s.id, reason: `${s.unhappy} unsubscribes or complaints in ${s.sent} sends` });
    } else if (s.sent >= MIN_SENDS_TO_RETIRE && best.get(s.id)! < RETIRE_BELOW) {
      out.push({
        id: s.id,
        reason: `${Math.round(best.get(s.id)! * 100)}% chance of being the best after ${s.sent} sends`,
      });
    }
  }
  if (out.length === stats.length) {
    const keep = [...stats].sort((a, b) => (best.get(b.id) ?? 0) - (best.get(a.id) ?? 0))[0]!;
    return out.filter((r) => r.id !== keep.id);
  }
  return out;
}
