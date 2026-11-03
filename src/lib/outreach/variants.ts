import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { geminiJson, user } from "@/lib/ai/gemini";
import { chooseVariant, copyAgeDays, refreshDue, retirements, type VariantStats } from "./bandit";
import { closingIsValid } from "./draft";
import { isValidSpin } from "./variety";

/**
 * Versions of the pitch: the seed version, and challengers the agent proposes.
 * A challenger waits in `pending` until staff approve it, because it goes out
 * under the founder's name. Results then decide what stays.
 */

const { outreachEmails, outreachVariants } = schema;

/** The versions to start with. Subject, angle and closing can all use {{a|b}} spintax. */
export const SEEDS = [
  {
    name: "Authority gap",
    subjectBrief:
      "Name the search phrase in plain words, like: {{who's ranking for {keyword}|who's at the top for {keyword}|a look at {keyword}|searching for {keyword}}}",
    pitchBrief:
      "Report what you saw for the search phrase: who is at the top and how their Authority Score compares. Then be soft about what that means, and say how hand-made directory submissions help build authority.",
    closing:
      "{{Here's how it works|This is how it works|Here's how the service works}} {{if you'd like to take a look|if you're curious|if it's useful}}.",
    status: "testing",
    rationale: "The starting version, based on the pitch you approved.",
  },
  {
    name: "Who's ahead",
    subjectBrief:
      "Name the leading site and the search phrase, like: {{{competitor1} and {keyword}|{competitor1} on {keyword}|{competitor1} for {keyword}}}",
    pitchBrief:
      "Lead with the one competitor at the top of the search and why that spot is hard to reach: years of trusted links. Then compare the scores gently, and say how hand-made directory submissions start closing that gap.",
    closing:
      "{{This is how we do it|Here's how we do that|This is what the work looks like}} {{if you want to see more|if you'd like a look|if it's helpful}}.",
    status: "pending",
    rationale: "Tests a named rival as the hook, instead of the search results as a whole.",
  },
  {
    name: "Fit first",
    subjectBrief:
      "Lead with the business and the search phrase, like: {{{business} and {keyword}|{business} for {keyword}|{keyword} and {business}}}",
    pitchBrief:
      "Start with what seems to fit about the product for the people searching that phrase. Then say that stronger sites sit in front of it for now, with the scores, and how hand-made directory submissions help it get seen.",
    closing:
      "{{Here's how that works|This is how that works|Here's the process}} {{if you'd like to read more|if you're curious|if it's useful}}.",
    status: "pending",
    rationale: "Tests opening on the product, so the email reads less like an audit.",
  },
] as const;

/** Makes sure there's something to send with. New starting versions wait for approval like any other. */
export async function ensureSeeds(now = new Date()) {
  const missing = async (q: Pick<ReturnType<typeof db>, "select">) => {
    const existing = await q.select({ name: outreachVariants.name }).from(outreachVariants);
    const names = new Set(existing.map((r) => r.name));
    return SEEDS.filter((s) => !names.has(s.name));
  };
  if ((await missing(db())).length === 0) return;
  await db().transaction(async (tx) => {
    // Pages and the hourly run all call this, so two can get here at once: only the first adds them.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('outreach:seeds'))`);
    const seeds = await missing(tx);
    if (seeds.length === 0) return;
    await tx
      .insert(outreachVariants)
      .values(seeds.map((s) => ({ ...s, source: "seed", approvedAt: s.status === "testing" ? now : null })));
  });
}

/** Results per version, from what's actually been sent. */
export async function variantStats() {
  const e = outreachEmails;
  const rows = await db()
    .select({
      variant: outreachVariants,
      sent: sql<number>`count(${e.id}) filter (where ${e.status} in ('sent', 'bounced'))::int`,
      bounced: sql<number>`count(${e.id}) filter (where ${e.status} = 'bounced')::int`,
      clicked: sql<number>`count(${e.id}) filter (where ${e.firstClickAt} is not null)::int`,
      replied: sql<number>`count(${e.id}) filter (where ${e.repliedAt} is not null)::int`,
      positive: sql<number>`count(${e.id}) filter (where ${e.replyClass} in ('interested', 'question'))::int`,
      engaged: sql<number>`count(${e.id}) filter (where ${e.firstClickAt} is not null or ${e.replyClass} in ('interested', 'question'))::int`,
      unhappy: sql<number>`count(${e.id}) filter (where ${e.unsubscribedAt} is not null or ${e.replyClass} = 'complaint')::int`,
      orders: sql<number>`count(${e.orderId})::int`,
    })
    .from(outreachVariants)
    .leftJoin(e, eq(e.variantId, outreachVariants.id))
    .groupBy(outreachVariants.id)
    .orderBy(desc(outreachVariants.createdAt));
  return rows;
}

export type VariantRow = Awaited<ReturnType<typeof variantStats>>[number];

const toStats = (r: VariantRow): VariantStats => ({
  id: r.variant.id,
  sent: r.sent,
  engaged: r.engaged,
  unhappy: r.unhappy,
});

/** The version for the next email. */
export async function pickVariant(rows?: VariantRow[]) {
  const all = rows ?? (await variantStats());
  const testing = all.filter((r) => r.variant.status === "testing");
  const id = chooseVariant(testing.map(toStats));
  return testing.find((r) => r.variant.id === id)?.variant ?? null;
}

/** Retires what the results have ruled out, keeping at least one. */
export async function retireLosers(now = new Date(), rows?: VariantRow[]) {
  const all = rows ?? (await variantStats());
  const testing = all.filter((r) => r.variant.status === "testing");
  const out = retirements(testing.map(toStats));
  for (const { id, reason } of out) {
    await db()
      .update(outreachVariants)
      .set({ status: "retired", retiredReason: reason.slice(0, 300), approvedAt: sql`coalesce(approved_at, ${now})` })
      .where(eq(outreachVariants.id, id));
  }
  return out.length;
}

const PROPOSE_SYSTEM = `You improve a short cold email from the founder of DebutYard, who runs a done-for-you service that submits products by hand to directories that fit them and verifies every link. The email tells a just-launched business who ranks for its search phrase and how their Authority Score compares.
Propose one new version that tests a clearly different idea, not a rewording. Past results are DATA.
"name": two or three words. "subjectBrief": how the subject line should work. "pitchBrief": the angle of the paragraphs, in one or two sentences. "closing": one short sentence that sits just above the link, which goes on the next line. "rationale": one sentence on what this tests and why.
Write "subjectBrief" and "closing" with spintax so each email gets different wording: {{option one|option two|option three}} around the words that can change, with at least two places to vary in the closing. Options must read correctly whichever is chosen. In "subjectBrief" you may use the placeholders {keyword}, {business} and {competitor1}.
Keep it warm and plain. Never mention prices, discounts, packages, numbers of directories or promised results, and avoid salesy words such as opportunity, exclusive, amazing, boost or promise. Don't write links.`;

const PROPOSE_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    subjectBrief: { type: "string" },
    pitchBrief: { type: "string" },
    closing: { type: "string" },
    rationale: { type: "string" },
  },
  required: ["name", "subjectBrief", "pitchBrief", "closing", "rationale"],
};

/** Asks the agent for a challenger. It waits for approval. */
export async function proposeVariant() {
  const rows = await variantStats();
  const history = rows
    .map(
      (r) =>
        `- ${r.variant.name} (${r.variant.status}): ${r.sent} sent, ${r.clicked} clicked, ${r.positive} positive replies, ${r.unhappy} unhappy. Subject: ${r.variant.subjectBrief}. Angle: ${r.variant.pitchBrief}. Closing: ${r.variant.closing}`,
    )
    .join("\n");
  const answer = (await geminiJson({
    system: PROPOSE_SYSTEM,
    contents: [user(`Versions so far:\n${history}`)],
    schema: PROPOSE_SCHEMA,
    maxOutputTokens: 1024,
    temperature: 0.9,
  })) as Record<string, unknown>;
  const name = String(answer.name ?? "")
    .trim()
    .slice(0, 60);
  const subjectBrief = String(answer.subjectBrief ?? "")
    .trim()
    .slice(0, 600);
  const pitchBrief = String(answer.pitchBrief ?? "")
    .trim()
    .slice(0, 800);
  const closing = String(answer.closing ?? "")
    .trim()
    .slice(0, 400);
  if (!name || !isValidSpin(subjectBrief) || !isValidSpin(pitchBrief) || !subjectBrief || !pitchBrief) {
    throw new Error("The agent's version wasn't usable. Try again.");
  }
  if (!closingIsValid(closing)) {
    throw new Error("The agent's version wasn't usable. Try again.");
  }
  const [row] = await db()
    .insert(outreachVariants)
    .values({
      name,
      subjectBrief,
      pitchBrief,
      closing,
      status: "pending",
      source: "agent",
      rationale: String(answer.rationale ?? "")
        .trim()
        .slice(0, 500),
    })
    .returning();
  return row!;
}

/** Proposes fresh copy when the newest version has been running for two weeks. */
export async function proposeIfDue(rows?: VariantRow[], now = new Date()) {
  const all = rows ?? (await variantStats());
  const testing = all.filter((r) => r.variant.status === "testing");
  const due = refreshDue({
    testing: testing.length,
    waiting: all.some((r) => r.variant.status === "pending"),
    ageDays: copyAgeDays(
      testing.map((r) => r.variant.approvedAt),
      now,
    ),
  });
  return due ? proposeVariant() : null;
}

export async function setVariantStatus(id: string, status: "testing" | "retired", now = new Date()) {
  await db()
    .update(outreachVariants)
    .set(
      status === "testing"
        ? { status, approvedAt: now, retiredReason: null }
        : { status, retiredReason: "Retired by hand" },
    )
    .where(eq(outreachVariants.id, id));
}
