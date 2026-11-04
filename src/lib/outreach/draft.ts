import { site } from "@/config/site";
import { allSpins, spin, variations } from "./variety";

/**
 * Turns the writer's answer into the email. The model only ever writes words:
 * every name and keyword reaches the email through a placeholder that code fills
 * from the research, so it can't state a fact we didn't measure. Scores decide
 * who gets an email but never appear in one: the contrast is made in words.
 * Greeting, sign-off and opt-out are set here in spintax, so no two emails share
 * the same fixed wording. Plain text only. Pure.
 */

export type DraftFacts = {
  business: string;
  keyword: string;
  competitors: Array<{ name: string }>;
};

/** Names of every site in the search results: the model must use placeholders, not these. */
export type DraftContext = DraftFacts & { forbiddenNames: string[] };

export type WriterAnswer = { subject: string; paragraphs: string[] };

const MAX_SUBJECT = 60;
const MAX_PARAGRAPH_WORDS = 70;
const BODY_WORDS = { min: 40, max: 140 };

export function placeholders(f: DraftFacts): Record<string, string> {
  const out: Record<string, string> = {
    business: f.business,
    keyword: f.keyword,
  };
  f.competitors.forEach((c, i) => {
    out[`competitor${i + 1}`] = c.name;
  });
  return out;
}

const PLACEHOLDER = /\{([a-z0-9_]+)\}/g;
/** The model sometimes quotes the phrase itself. Code adds the marks, so they don't double up. */
const QUOTED_KEYWORD = /["'\u201c\u2018]\{keyword\}["'\u201d\u2019]/g;
const PRICES =
  /[$€£¥]|\b(prices?|pricing|costs?|fees?|discounts?|cheap|affordable|afford|packages?|per month|monthly|usd|dollars?|free|offer|deal)\b/i;
const OVERCLAIMS =
  /\b(first place|first page|number one|guarantee[ds]?|guaranteeing|will (rank|raise|grow|lift|climb|improve|increase|push|move)|rank you|top of google|skyrocket|explode|10x|game[- ]chang\w*|revolution\w*|act now|limited time|urgent|don't miss)\b|#\s?1/i;
/**
 * Words spam filters and checkers commonly dislike. Our own list, kept short
 * because a draft that hits one gets rewritten, and that costs a model call.
 */
const SPAM_WORDS =
  /\b(act now|apply now|buy now|call now|click (here|below)|order now|sign up now|best price|lowest price|bargain|cash|credit card|make money|extra income|exclusive|expires?|hurry|instant(ly)?|incredible|amazing|miracle|winner|congratulations|promise[ds]?|promotion(al)?|opportunity|no obligation|no cost|risk[- ]free|double your|boost your|increase your|dear friend|once in a lifetime|spam|unsubscribe)\b/i;

export const spamWordIn = (text: string) => SPAM_WORDS.exec(text)?.[0] ?? null;

const LINKS = /https?:|www\.|\b[a-z0-9-]+\.(com|io|ai|co|app|net|org|dev)\b/i;
/** A capitalised word in mid-sentence is a name, and names come from placeholders. */
const MID_SENTENCE_NAME = /(?<=[a-z,;:'"] )([A-Z][a-zA-Z]+)/g;
const ALLOWED_NAMES = new Set(["Google", "DebutYard", "I"]);
/** Spelled-out figures count too. "One" is left out because it's rarely a figure. */
const NUMBER_WORDS =
  /\b(zero|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|twice|double|triple)\b/i;
const SCORES = /\bscores?\b/i;
const BAD_GRAMMAR = /\b(site|product|business) domain rating\b/i;
/** Orders only use directories that give a dofollow link (isOrderTarget), but plenty of others don't. */
const ALL_DIRECTORIES = /\b(all|every|any) director(y|ies)\b/i;
/**
 * What the last paragraph has to say. Each is a step from the listing to the
 * ranking, and the pitch doesn't land with one missing.
 */
const PUNCHLINE: Array<[RegExp, string]> = [
  [/\bdirector(y|ies)\b/i, "directories"],
  [/\bdo-?follow\b/i, "dofollow links"],
  [/\bdomain rating\b/i, "domain rating"],
  [/\bGoogle\b/, "Google"],
  [/\bby hand\b/i, "submitting by hand"],
];

function problemsIn(raw: string, ctx: DraftContext, known: Record<string, string>): string[] {
  const problems: string[] = [];
  for (const m of raw.matchAll(PLACEHOLDER)) if (!(m[1]! in known)) problems.push(`unknown placeholder {${m[1]}}`);
  const words = raw.replace(PLACEHOLDER, " ");
  if (/\d/.test(words) || NUMBER_WORDS.test(words)) problems.push("wrote a number by hand");
  if (SCORES.test(words)) problems.push("mentions a score");
  if (BAD_GRAMMAR.test(words)) problems.push(`write "a site's domain rating"`);
  if (ALL_DIRECTORIES.test(words)) problems.push("makes a claim about all directories");
  const price = PRICES.exec(words)?.[0];
  if (price) problems.push(`mentions pricing: "${price}"`);
  const claim = OVERCLAIMS.exec(words)?.[0];
  if (claim) problems.push(`overclaims: "${claim}"`);
  const spam = spamWordIn(words);
  if (spam) problems.push(`uses a word spam filters dislike: "${spam}"`);
  if (LINKS.test(words)) problems.push("wrote a link or domain");
  if (/[{}]/.test(words)) problems.push("broken placeholder");
  if (/[—]/.test(words)) problems.push("uses an em dash");
  for (const m of words.matchAll(MID_SENTENCE_NAME)) {
    if (!ALLOWED_NAMES.has(m[1]!)) problems.push(`named "${m[1]}" by hand`);
  }
  for (const name of ctx.forbiddenNames) {
    if (name.length < 3) continue;
    if (new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(words))
      problems.push(`named "${name}" by hand`);
  }
  return problems;
}

const fill = (raw: string, known: Record<string, string>) => raw.replace(PLACEHOLDER, (_, k: string) => known[k] ?? "");
const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export type FilledDraft = { ok: true; subject: string; paragraphs: string[] } | { ok: false; problems: string[] };

/** Checks the writer's answer and fills in the facts. Any problem rejects the whole draft. */
export function fillDraft(answer: WriterAnswer, ctx: DraftContext): FilledDraft {
  const known = placeholders(ctx);
  const subject = answer.subject.trim();
  const paragraphs = answer.paragraphs.map((p) => p.trim()).filter(Boolean);
  const problems = [...problemsIn(subject, ctx, known), ...paragraphs.flatMap((p) => problemsIn(p, ctx, known))];
  if (!subject) problems.push("no subject");
  if (/[!?]{2,}|!/.test(subject)) problems.push("exclamation in the subject");
  if (fill(subject, known).length > MAX_SUBJECT) problems.push("subject too long");
  if (paragraphs.length < 2 || paragraphs.length > 3) problems.push("needs two or three paragraphs");
  if (paragraphs.some((p) => wordCount(fill(p, known)) > MAX_PARAGRAPH_WORDS)) problems.push("a paragraph is too long");
  const whole = paragraphs.join("\n\n");
  const words = wordCount(fill(whole, known));
  if (words < BODY_WORDS.min || words > BODY_WORDS.max) problems.push(`body is ${words} words`);
  for (const required of ["{keyword}", "{competitor1}"]) {
    if (!whole.includes(required)) problems.push(`doesn't use ${required}`);
  }
  const earlier = paragraphs.slice(0, -1).join("\n\n");
  if (!/\bdomain rating\b/i.test(earlier)) problems.push("doesn't contrast domain rating before the last paragraph");
  const last = paragraphs.at(-1) ?? "";
  for (const [needs, what] of PUNCHLINE) {
    if (!needs.test(last)) problems.push(`the last paragraph doesn't mention ${what}`);
  }
  if (problems.length) return { ok: false, problems: [...new Set(problems)] };
  // Plain text can't be bold, so quote marks make the search phrase stand out. The subject stays bare.
  const inBody = { ...known, keyword: `"${ctx.keyword}"` };
  return {
    ok: true,
    subject: fill(subject, known),
    paragraphs: paragraphs.map((p) => fill(p.replace(QUOTED_KEYWORD, "{keyword}"), inBody)),
  };
}

/** The sentence just above the link. Every wording it can spin to has to pass. */
export function closingIsValid(closing: string): boolean {
  try {
    const all = allSpins(closing);
    return all.every((c) => c.trim() && !/[{}]/.test(c) && !PRICES.test(c) && !LINKS.test(c) && !spamWordIn(c));
  } catch {
    return false;
  }
}

/** The wording around what the writer writes. "Hey team" and the launch line are Henry's own; the rest are close to them. */
export const FIXED_COPY = {
  greeting: "{{Hey|Hi|Hello}} {{team|there}},",
  opening:
    "{{Congrats on the launch|Congrats on launching|Nice launch}}, {{I came across|I found|I just came across}} {business} and {{wanted to reach out directly|thought I'd reach out directly|wanted to write to you directly}}.",
  signOff: "{{Thanks|Best|Cheers}},\nHenry\nFounder, DebutYard",
  // Replies are read, and these ones block the sender. The one-click header in pipeline.ts covers everyone else.
  optOut:
    "{{If you'd rather not hear from me, just let me know.|Reply \"not interested\" if this isn't relevant.|If this isn't useful, just say so and I won't write again.|If you don't want to hear from me again, just reply and tell me.}}",
};

/** How many ways the fixed wording can come out, before the version's closing. */
export const fixedVariations = () => Object.values(FIXED_COPY).reduce((n, t) => n * variations(t), 1);

export const footerLine = (postalAddress: string) => `${site.legalName}, ${postalAddress}`;

export type RenderInput = {
  business: string;
  subject: string;
  paragraphs: string[];
  closing: string;
  linkUrl: string;
  postalAddress: string;
  /** The email's token: its choices stay the same however many times it's rendered. */
  seed: string;
};

/** A plain text email, just what someone would write by hand. */
export function renderOutreachEmail(e: RenderInput): { subject: string; text: string } {
  const choose = (template: string, part: string) => spin(template, `${e.seed}:${part}`);
  const closing = choose(e.closing, "closing");
  if (/[{}]/.test(closing)) throw new Error("A version's closing has a placeholder left in it");
  const text = [
    choose(FIXED_COPY.greeting, "greeting"),
    choose(FIXED_COPY.opening, "opening").replace("{business}", () => e.business),
    ...e.paragraphs,
    `${closing}\n${e.linkUrl}`,
    choose(FIXED_COPY.signOff, "signOff"),
    choose(FIXED_COPY.optOut, "optOut"),
    footerLine(e.postalAddress),
  ].join("\n\n");
  return { subject: e.subject, text };
}
