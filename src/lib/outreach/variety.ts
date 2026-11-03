/**
 * Keeps emails from looking alike: spintax for fixed wording, and a measure of
 * how much written copy repeats. Filters learn phrases that recur across many
 * emails, so as little as possible should. Pure.
 *
 * Spintax is `{{a|b|c}}`, and options can nest. A single-brace `{placeholder}` is
 * left for later, so `{{hi {business}|hello}}` works.
 */

type Part = string | Part[][];

function parse(template: string): Part[] {
  let i = 0;
  const sequence = (inside: boolean): Part[] => {
    const out: Part[] = [];
    let text = "";
    const flush = () => {
      if (text) out.push(text);
      text = "";
    };
    while (i < template.length) {
      if (template.startsWith("{{", i)) {
        flush();
        i += 2;
        const options = [sequence(true)];
        while (template[i] === "|") {
          i++;
          options.push(sequence(true));
        }
        if (!template.startsWith("}}", i)) throw new Error("Spintax is missing its closing }}");
        i += 2;
        if (options.some((o) => !o.some((p) => typeof p !== "string" || p.trim()))) {
          throw new Error("Spintax has an empty option");
        }
        out.push(options);
        continue;
      }
      if (inside && (template[i] === "|" || template.startsWith("}}", i))) break;
      if (template.startsWith("}}", i)) throw new Error("Spintax has a stray }}");
      if (template[i] === "{") {
        const end = template.indexOf("}", i);
        if (end < 0) throw new Error("A placeholder is missing its closing }");
        text += template.slice(i, end + 1);
        i = end + 1;
        continue;
      }
      text += template[i++];
    }
    flush();
    return out;
  };
  return sequence(false);
}

/** FNV-1a, then mulberry32: the same seed always gives the same choices. */
function seeded(seed: string): () => number {
  let state = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 0x01000193);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Picks one wording. Throws on broken spintax, so it can never reach a recipient. */
export function spin(template: string, seed: string): string {
  const next = seeded(seed);
  const render = (parts: Part[]): string =>
    parts
      .map((p) => {
        if (typeof p === "string") return p;
        return render(p[Math.floor(next() * p.length)]!).trim();
      })
      .join("");
  return render(parse(template));
}

/** How many different results a template can give. */
export function variations(template: string): number {
  const count = (parts: Part[]): number =>
    parts.reduce((n, p) => (typeof p === "string" ? n : n * p.reduce((sum, o) => sum + count(o), 0)), 1);
  return count(parse(template));
}

/** Every result, for checking the wording of each. Stops at `cap`. */
export function allSpins(template: string, cap = 2000): string[] {
  const expand = (parts: Part[]): string[] => {
    let results = [""];
    for (const p of parts) {
      const options = typeof p === "string" ? [p] : p.flatMap((o) => expand(o).map((s) => s.trim()));
      results = results.flatMap((r) => options.map((o) => r + o)).slice(0, cap);
    }
    return results;
  };
  return expand(parse(template));
}

export function isValidSpin(template: string): boolean {
  try {
    parse(template);
    return true;
  } catch {
    return false;
  }
}

const SHINGLE = 5;

/** Runs of five words. Numbers don't count, because scores differ between otherwise identical sentences. */
function shingles(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z][a-z'’-]*/g) ?? [];
  const out: string[] = [];
  for (let i = 0; i + SHINGLE <= words.length; i++) out.push(words.slice(i, i + SHINGLE).join(" "));
  return out;
}

/** The share of `text`'s phrases that also appear in `other`, from 0 to 1. */
export function overlap(text: string, other: string): number {
  const own = new Set(shingles(text));
  if (own.size === 0) return 0;
  const theirs = new Set(shingles(other));
  let shared = 0;
  for (const s of own) if (theirs.has(s)) shared++;
  return shared / own.size;
}

/** Phrases in at least `minShare` of the emails (and at least five), commonest first. Ignores `except`, such as the footer. */
export function repeatedPhrases(
  bodies: string[],
  { minShare = 0.3, except = "", limit = 10 }: { minShare?: number; except?: string; limit?: number } = {},
): Array<{ phrase: string; emails: number }> {
  const counts = new Map<string, number>();
  const skip = new Set(shingles(except));
  for (const body of bodies) {
    for (const s of new Set(shingles(body))) {
      if (!skip.has(s)) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
  }
  const floor = Math.max(5, Math.ceil(bodies.length * minShare));
  return [...counts]
    .filter(([, n]) => n >= floor)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([phrase, emails]) => ({ phrase, emails }));
}
