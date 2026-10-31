/** Text helpers for the SEO analyzer and link engine. Pure, dependency-free. */

const WORD_RE = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(WORD_RE) ?? []).map((t) => t.replace(/['’]/g, ""));
}

/**
 * Light stemmer for keyword matching: "hooks", "hooked", "hooking" all reduce to "hook", and
 * "publishing" to "publish". It is deliberately small (no dictionary); over-matching a rare word
 * is harmless for SEO checks, and missing "Publishing" for the keyword "publish" is not.
 */
export function stem(token: string): string {
  let t = token;
  if (/(ss|sh|ch|x|z)es$/.test(t) && t.length > 4) t = t.slice(0, -2);
  else if (t.length > 4 && t.endsWith("ies")) t = `${t.slice(0, -3)}y`;
  else if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) t = t.slice(0, -1);
  if (t.length > 5 && t.endsWith("ing")) t = t.slice(0, -3);
  else if (t.length > 4 && t.endsWith("ed")) t = t.slice(0, -2);
  return t;
}

/** Surface forms that share a stem, for building anchor-text regexes. */
export function wordVariants(word: string): string[] {
  const w = word.toLowerCase();
  const base = stem(w);
  return [...new Set([w, base, `${base}s`, `${base}es`, `${base}ed`, `${base}ing`, `${base}e`, `${base}ion`])];
}

function stems(text: string): string[] {
  return tokenize(text).map(stem);
}

/** Number of times the phrase appears (consecutive tokens, plural-insensitive). */
export function countPhrase(text: string, phrase: string): number {
  const p = stems(phrase);
  if (p.length === 0) return 0;
  const t = stems(text);
  let n = 0;
  for (let i = 0; i + p.length <= t.length; i++) {
    let ok = true;
    for (let j = 0; j < p.length; j++) {
      if (t[i + j] !== p[j]) {
        ok = false;
        break;
      }
    }
    if (ok) {
      n += 1;
      i += p.length - 1;
    }
  }
  return n;
}

export const hasPhrase = (text: string, phrase: string) => countPhrase(text, phrase) > 0;

/** True when every word of the phrase appears somewhere in the text (any order). */
export function hasAllWords(text: string, phrase: string): boolean {
  const t = new Set(stems(text));
  const p = stems(phrase);
  return p.length > 0 && p.every((w) => t.has(w));
}

export function firstWords(text: string, n: number): string {
  return tokenize(text).slice(0, n).join(" ");
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"‘'(])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const groups = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
    .replace(/^y/, "")
    .match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length ?? 1);
}

/** Flesch reading ease (higher is easier; 60–70 is plain English). */
export function fleschReadingEase(text: string): number {
  const words = tokenize(text);
  const sentences = splitSentences(text);
  if (words.length === 0 || sentences.length === 0) return 0;
  const syl = words.reduce((sum, w) => sum + syllables(w), 0);
  const score = 206.835 - 1.015 * (words.length / sentences.length) - 84.6 * (syl / words.length);
  return Math.round(Math.max(0, Math.min(100, score)));
}

const GENERIC_ANCHORS = new Set([
  "click here",
  "here",
  "read more",
  "learn more",
  "this",
  "this link",
  "link",
  "more",
  "this article",
  "this post",
  "check this out",
  "click",
  "page",
]);

export function isGenericAnchor(text: string): boolean {
  const t = text
    .trim()
    .toLowerCase()
    .replace(/[.!:]+$/g, "");
  return GENERIC_ANCHORS.has(t) || /^https?:\/\//i.test(t) || /^www\./i.test(t);
}
