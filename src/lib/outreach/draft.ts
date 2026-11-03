import { site } from "@/config/site";
import { esc } from "@/lib/email-template";

/**
 * Turns the writer's answer into the email. The model only ever writes words:
 * every name, keyword and score reaches the email through a placeholder that
 * code fills from the research, so it can't state a fact we didn't measure.
 * Greeting, link, sign-off and footer are fixed here. Pure.
 */

export type DraftFacts = {
  business: string;
  keyword: string;
  competitors: Array<{ name: string; authority: number }>;
  businessAuthority: number;
};

/** Names of every site in the search results: the model must use placeholders, not these. */
export type DraftContext = DraftFacts & { forbiddenNames: string[] };

export type WriterAnswer = { subject: string; paragraphs: string[] };

const MAX_SUBJECT = 60;
const MAX_PARAGRAPH_WORDS = 70;
const BODY_WORDS = { min: 40, max: 130 };

export function placeholders(f: DraftFacts): Record<string, string> {
  const out: Record<string, string> = {
    business: f.business,
    keyword: f.keyword,
    business_score: String(Math.round(f.businessAuthority)),
  };
  f.competitors.forEach((c, i) => {
    out[`competitor${i + 1}`] = c.name;
    out[`competitor${i + 1}_score`] = String(Math.round(c.authority));
  });
  return out;
}

const PLACEHOLDER = /\{([a-z0-9_]+)\}/g;
const PRICES =
  /[$€£¥]|\b(prices?|pricing|costs?|fees?|discounts?|cheap|affordable|afford|packages?|per month|monthly|usd|dollars?|free|offer|deal)\b/i;
const OVERCLAIMS =
  /\b(first place|first page|number one|guarantee[ds]?|guaranteeing|will rank|rank you|top of google|skyrocket|explode|10x|game[- ]chang\w*|revolution\w*|act now|limited time|urgent|don't miss)\b|#\s?1/i;
const LINKS = /https?:|www\.|\b[a-z0-9-]+\.(com|io|ai|co|app|net|org|dev)\b/i;
/** A capitalised word in mid-sentence is a name, and names come from placeholders. */
const MID_SENTENCE_NAME = /(?<=[a-z,;:'"] )([A-Z][a-zA-Z]+)/g;
const ALLOWED_NAMES = new Set(["Google", "Authority", "Score", "Scores", "DebutYard", "I"]);

function problemsIn(raw: string, ctx: DraftContext, known: Record<string, string>): string[] {
  const problems: string[] = [];
  for (const m of raw.matchAll(PLACEHOLDER)) if (!(m[1]! in known)) problems.push(`unknown placeholder {${m[1]}}`);
  const words = raw.replace(PLACEHOLDER, " ");
  if (/\d/.test(words)) problems.push("wrote a number by hand");
  const price = PRICES.exec(words)?.[0];
  if (price) problems.push(`mentions pricing: "${price}"`);
  const claim = OVERCLAIMS.exec(words)?.[0];
  if (claim) problems.push(`overclaims: "${claim}"`);
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
  for (const required of ["{keyword}", "{competitor1}", "{competitor1_score}", "{business_score}"]) {
    if (!whole.includes(required)) problems.push(`doesn't use ${required}`);
  }
  if (problems.length) return { ok: false, problems: [...new Set(problems)] };
  return { ok: true, subject: fill(subject, known), paragraphs: paragraphs.map((p) => fill(p, known)) };
}

/** The sentence that carries the link, e.g. "{link:Here's how it works} if you'd like a look." */
const CLOSING_LINK = /\{link:([^}]+)\}/;
export const closingIsValid = (closing: string) => CLOSING_LINK.test(closing) && !PRICES.test(closing);

export type RenderInput = {
  business: string;
  subject: string;
  paragraphs: string[];
  closing: string;
  linkUrl: string;
  unsubscribeUrl: string;
  postalAddress: string;
};

export const SIGN_OFF = "Henry\nFounder, DebutYard";

/** A plain email: no logo, no button, just what someone would write by hand, in text and in the simplest HTML. */
export function renderOutreachEmail(e: RenderInput): { subject: string; text: string; html: string } {
  const opening = `Congrats on the launch, I came across ${e.business} and wanted to reach out directly.`;
  const label = CLOSING_LINK.exec(e.closing)?.[1] ?? "Here's how it works";
  const closingText = e.closing.replace(CLOSING_LINK, label);
  const footer = `${site.legalName}, ${e.postalAddress}`;
  const text = [
    "Hey team,",
    opening,
    ...e.paragraphs,
    `${closingText}\n${e.linkUrl}`,
    SIGN_OFF,
    `--\n${footer}\nNot useful? Unsubscribe here: ${e.unsubscribeUrl}`,
  ].join("\n\n");
  const p = (inner: string) => `<p style="margin:0 0 14px">${inner}</p>`;
  const closingHtml = esc(e.closing).replace(
    /\{link:([^}]+)\}/,
    (_, words: string) => `<a href="${esc(e.linkUrl)}">${words}</a>`,
  );
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#222222">${[
    p("Hey team,"),
    p(esc(opening)),
    ...e.paragraphs.map((x) => p(esc(x))),
    p(closingHtml),
    p(SIGN_OFF.split("\n").map(esc).join("<br>")),
    `<p style="margin:22px 0 0;font-size:12px;line-height:1.5;color:#777777">${esc(footer)}<br>Not useful? <a href="${esc(e.unsubscribeUrl)}" style="color:#777777">Unsubscribe</a>.</p>`,
  ].join("")}</div>`;
  return { subject: e.subject, text, html };
}
