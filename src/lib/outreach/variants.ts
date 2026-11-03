import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { geminiJson, user } from "@/lib/ai/gemini";
import { chooseVariant, MIN_SENDS_TO_RETIRE, retirements, type VariantStats } from "./bandit";
import { closingIsValid } from "./draft";

/**
 * Versions of the pitch: the seed version, and challengers the agent proposes.
 * A challenger waits in `pending` until staff approve it, because it goes out
 * under the founder's name. Results then decide what stays.
 */

const { outreachEmails, outreachVariants } = schema;

export const CONTROL = {
  name: "Authority gap",
  subjectBrief: "Name the search phrase in plain words, like: who's ranking for {keyword}",
  pitchBrief:
    "Report what you saw for the search phrase: who is at the top and how their Authority Score compares. Then be soft about what that means, and say how hand-made directory submissions help build authority.",
  closing: "{link:Here's how it works} if you'd like to take a look.",
} as const;

/** Makes sure there's something to send with. */
export async function ensureControl() {
  const [any] = await db().select({ id: outreachVariants.id }).from(outreachVariants).limit(1);
  if (any) return;
  await db()
    .insert(outreachVariants)
    .values({
      ...CONTROL,
      status: "testing",
      source: "seed",
      rationale: "The starting version, based on the pitch you approved.",
      approvedAt: new Date(),
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
"name": two or three words. "subjectBrief": how the subject line should work. "pitchBrief": the angle of the paragraphs, in one or two sentences. "closing": one short sentence after the pitch, with the words to link wrapped as {link:the words}. "rationale": one sentence on what this tests and why.
Keep it warm and plain. Never mention prices, discounts, packages, numbers of directories or promised results.`;

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
    .slice(0, 400);
  const pitchBrief = String(answer.pitchBrief ?? "")
    .trim()
    .slice(0, 800);
  const closing = String(answer.closing ?? "")
    .trim()
    .slice(0, 200);
  if (!name || !subjectBrief || !pitchBrief || !closingIsValid(closing)) {
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

/** Proposes a challenger once the current version has enough results to compare against. */
export async function proposeIfDue(rows?: VariantRow[]) {
  const all = rows ?? (await variantStats());
  const testing = all.filter((r) => r.variant.status === "testing");
  const waiting = all.some((r) => r.variant.status === "pending");
  if (waiting || testing.length !== 1 || testing[0]!.sent < MIN_SENDS_TO_RETIRE) return null;
  return proposeVariant();
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
