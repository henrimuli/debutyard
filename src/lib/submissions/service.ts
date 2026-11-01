import "server-only";
import { and, asc, desc, eq, gt, inArray, isNotNull, ne, or, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db, schema } from "@/db";
import { env } from "@/env";
import { site } from "@/config/site";
import { sendEmail } from "@/lib/email";
import { renderEmail, type Block } from "@/lib/email-template";
import { toStaff } from "@/lib/notifications";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { inspectBacklink } from "@/lib/directories/backlink";
import { effectiveLinkType } from "@/lib/directories/service";
import { verifySubmission } from "@/lib/directories/verify";
import { monitorEnd, trackSubmission } from "@/lib/links/service";
import { baselineSnapshot } from "@/lib/metrics/service";
import { fetchPage } from "@/lib/fetch-page";
import { formatUsd } from "@/lib/payments/skus";
import { domainOf } from "@/lib/slug";
import { BADGE_WAIT_DAYS, badgeBlockHtml, MAX_BADGES } from "./badge-block";
import { newInboxKey } from "./inbox-rules";
import { PACKAGES, packageForSku, selectTargets, type PackageId } from "./packages";

const { submissionOrders: orders, submissions, directories } = schema;
export type SubmissionOrder = typeof orders.$inferSelect;
type Payment = typeof schema.orders.$inferSelect;

export class SubmissionError extends Error {}

const token = () => randomBytes(18).toString("base64url");
const url = (path: string) => new URL(path, env().NEXT_PUBLIC_SITE_URL).toString();
const DAY = 86_400_000;

/** A Submission service email to the buyer. */
async function mail(to: string, subject: string, blocks: Block[], preheader?: string) {
  await sendEmail({
    to,
    ...renderEmail({
      variant: "customer",
      label: "Submission service",
      subject,
      preheader,
      reason: "you ordered DebutYard's directory submission service",
      blocks,
    }),
  });
}

const staffTrigger = "Sent by the submission service.";

/**
 * Payment fulfilment: opens the order and emails the buyer their private
 * intake link. A "boost" (productId in the payment) starts with the product's
 * details filled in. A package bundled with a paid debut opens without emails:
 * the debut's own confirmation and staff email carry it (see payments/handlers).
 */
export async function openOrderFromPayment(payment: Payment, bundled?: PackageId): Promise<SubmissionOrder> {
  const pkg = bundled ?? packageForSku(payment.sku);
  if (!pkg) throw new Error(`Order ${payment.id} isn't a submission package`);
  const existing = await db().query.submissionOrders.findFirst({ where: eq(orders.orderId, payment.id) });
  if (existing) return existing;

  const productId = typeof payment.metadata.productId === "string" ? payment.metadata.productId : null;
  const product =
    productId && payment.userId
      ? await db().query.products.findFirst({
          where: and(eq(schema.products.id, productId), eq(schema.products.createdBy, payment.userId)),
        })
      : null;
  const cats = product
    ? (
        await db()
          .select({ slug: schema.productCategories.categorySlug })
          .from(schema.productCategories)
          .where(eq(schema.productCategories.productId, product.id))
      ).map((c) => c.slug)
    : [];

  const [row] = await db()
    .insert(orders)
    .values({
      orderId: payment.id,
      userId: payment.userId,
      productId: product?.id ?? null,
      email: payment.email,
      package: pkg,
      targetCount: PACKAGES[pkg].count,
      intakeToken: token(),
      reportToken: token(),
      inboxKey: newInboxKey(),
      ...(product
        ? {
            productName: product.name,
            websiteUrl: product.websiteUrl,
            tagline: product.tagline,
            shortDescription: product.tagline,
            longDescription: product.description.slice(0, 500),
            categories: cats,
            logoUrl: product.logoUrl,
            contactEmail: payment.email,
          }
        : {}),
    })
    .onConflictDoNothing()
    .returning();
  const order = row ?? (await db().query.submissionOrders.findFirst({ where: eq(orders.orderId, payment.id) }))!;
  if (!row || bundled) return order;

  const p = PACKAGES[pkg];
  await mail(
    payment.email,
    `Next step for your ${site.name} ${p.label} order`,
    [
      { heading: "One step left: tell us about your product" },
      { text: `Thanks for your order (${p.label}: ${p.count} directories, ${formatUsd(payment.amountCents)}).` },
      {
        text: "Tell us about your product: logo, descriptions, categories and a couple of preferences. It takes about five minutes, and submissions start within 48 hours of receiving it.",
      },
      { button: "Fill in your product details", href: url(`/orders/${order.intakeToken}`) },
      { note: "This link is private to you. It also becomes your live tracking dashboard, so keep it." },
    ],
    "It takes about five minutes. Submissions start within 48 hours.",
  );
  await toStaff(
    "Orders",
    `New submission order: ${p.label} (${formatUsd(payment.amountCents)})`,
    [
      { heading: `New submission order: ${p.label}` },
      {
        facts: [
          ["Buyer", payment.email],
          ["Package", `${p.label}, ${p.count} directories`],
          ["Paid", formatUsd(payment.amountCents)],
          ["Status", product ? `Boost for ${product.name}` : "Waiting for intake"],
        ],
      },
      { button: "Open in the ops console", href: url(`/admin/submissions/${order.id}`) },
    ],
    staffTrigger,
  );
  return order;
}

const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || /^https:\/\/\S+$/.test(v), "Use an https:// URL")
  .transform((v) => v || null);

export const intakeInput = z.object({
  productName: z.string().trim().min(2, "Add your product's name").max(60),
  websiteUrl: z
    .string()
    .trim()
    .max(300)
    .refine((v) => /^https?:\/\/[^\s.]+\.\S+$/.test(v), "Use your full website URL, starting with https://"),
  tagline: z.string().trim().min(10, "Add a tagline (10+ characters)").max(60, "Keep the tagline to 60 characters"),
  shortDescription: z.string().trim().min(40, "At least 40 characters").max(160, "Keep it to 160 characters"),
  longDescription: z.string().trim().min(100, "At least 100 characters").max(500, "Keep it to 500 characters"),
  categories: z.array(z.string().max(40)).min(1, "Pick at least one category").max(3),
  logoUrl: optionalUrl,
  founderName: z.string().trim().max(80).default(""),
  contactEmail: z.string().trim().email("Add a contact email").max(200),
  clientNotes: z.string().trim().max(2000).default(""),
  badgePreference: z.enum(["none", "allow"]),
  allowAccounts: z.literal(true, { message: "We need permission to create accounts in your product's name." }),
});
export type IntakeInput = z.input<typeof intakeInput>;

export async function orderByIntakeToken(t: string) {
  if (!/^[\w-]{20,40}$/.test(t)) return null;
  return (await db().query.submissionOrders.findFirst({ where: eq(orders.intakeToken, t) })) ?? null;
}

export async function orderByReportToken(t: string) {
  if (!/^[\w-]{20,40}$/.test(t)) return null;
  return (await db().query.submissionOrders.findFirst({ where: eq(orders.reportToken, t) })) ?? null;
}

async function candidates() {
  const rows = await db().select().from(directories);
  return rows.map((d) => ({
    id: d.id,
    niche: d.niche,
    dr: d.dr,
    linkType: effectiveLinkType(d),
    badgeRequired: d.badgeRequired,
    guided: d.guided,
    isActive: d.isActive,
    acceptanceRate: d.acceptanceRate,
  }));
}

/** Saves the product kit, queues the order and picks its directories. */
export async function submitIntake(intakeToken: string, raw: IntakeInput, now = new Date()) {
  const order = await orderByIntakeToken(intakeToken);
  if (!order) throw new SubmissionError("Order not found.");
  if (order.status !== "awaiting_intake") throw new SubmissionError("We already have your details.");
  const input = intakeInput.parse(raw);

  const targets = selectTargets(await candidates(), {
    count: order.targetCount,
    categories: input.categories,
    allowBadges: input.badgePreference === "allow",
    maxBadges: MAX_BADGES,
  });
  const [updated] = await db()
    .update(orders)
    .set({
      ...input,
      allowAccounts: true,
      status: "queued",
      intakeAt: now,
      dueAt: new Date(now.getTime() + (2 + PACKAGES[order.package].days) * DAY),
    })
    .where(and(eq(orders.id, order.id), eq(orders.status, "awaiting_intake")))
    .returning();
  if (!updated) throw new SubmissionError("We already have your details.");
  if (targets.length) {
    await db()
      .insert(submissions)
      .values(targets.map((directoryId) => ({ directoryId, submissionOrderId: order.id })))
      .onConflictDoNothing();
  }
  // DR before/after: the "before".
  await baselineSnapshot(input.websiteUrl, now);
  // The badge block rides in this email rather than a second one sent at the same moment.
  const badges = updated.badgePreference === "allow" ? await badgeBlocks(updated) : null;

  await mail(
    input.contactEmail,
    `We've got everything: your ${PACKAGES[order.package].label} submissions start within 48 hours`,
    [
      { heading: "We've got everything we need" },
      {
        text: `We've lined up ${targets.length} directories for ${input.productName}. You'll see each one move from queued to live on your dashboard, with every link checked by us.`,
      },
      ...(input.badgePreference === "allow"
        ? []
        : [{ text: "You chose no badges, so we only use directories that don't ask for one." }]),
      { button: "Open your live dashboard", href: url(`/orders/${order.intakeToken}`) },
      ...(badges ? [{ section: "One step for you: add your directory badges" }, ...badges] : []),
    ],
  );
  if (badges) await db().update(orders).set({ badgeBlockSentAt: now }).where(eq(orders.id, order.id));
  await toStaff(
    "Orders",
    `Intake received: ${input.productName} (${PACKAGES[order.package].label})`,
    [
      { heading: `Intake received: ${input.productName}` },
      {
        facts: [
          ["Package", PACKAGES[order.package].label],
          ["Targets", `${targets.length} queued`],
          ["Due", updated.dueAt!.toDateString()],
        ],
      },
      { button: "Open in the ops console", href: url(`/admin/submissions/${order.id}`) },
    ],
    staffTrigger,
  );
  return updated;
}

/** An order's rows with their directories, best first. */
export async function orderRows(orderId: string) {
  return db()
    .select({ s: submissions, d: directories })
    .from(submissions)
    .innerJoin(directories, eq(directories.id, submissions.directoryId))
    .where(eq(submissions.submissionOrderId, orderId))
    .orderBy(
      sql`case ${submissions.status} when 'needs_action' then 0 when 'live' then 1 when 'pending' then 2 when 'submitted' then 3 when 'todo' then 4 else 5 end`,
      sql`${directories.dr} desc nulls last`,
      asc(directories.name),
    );
}

/** Guided directories (Product Hunt, HN, G2…): a checklist for the maker, not counted in the package. */
export async function guidedChecklist() {
  return db()
    .select({
      name: directories.name,
      url: directories.url,
      notes: directories.submissionNotes,
      slug: directories.slug,
    })
    .from(directories)
    .where(and(eq(directories.guided, true), eq(directories.isActive, true)))
    .orderBy(sql`${directories.dr} desc nulls last`);
}

export type OrderSummary = {
  target: number;
  scheduled: number;
  live: number;
  dofollow: number;
  inReview: number;
  needsAction: number;
  rejected: number;
  progress: number;
};

/** Counts for the progress bar. Replaced rows don't count; their replacements do. */
export function summarizeOrder(
  order: Pick<SubmissionOrder, "targetCount">,
  rows: Array<{ status: string; linkVerdict: string | null }>,
): OrderSummary {
  const counted = rows.filter((r) => r.status !== "replaced");
  const n = (...st: string[]) => counted.filter((r) => st.includes(r.status)).length;
  const done = n("live", "rejected", "dead", "skipped");
  return {
    target: order.targetCount,
    scheduled: counted.length,
    live: n("live"),
    dofollow: counted.filter((r) => r.status === "live" && r.linkVerdict === "dofollow").length,
    inReview: n("submitted", "pending"),
    needsAction: n("needs_action"),
    rejected: n("rejected", "dead"),
    progress: counted.length ? Math.round((100 * done) / counted.length) : 0,
  };
}

/** A signed-in buyer's orders (matched by account or by the email they paid with). */
export async function ordersForUser(userId: string, email: string) {
  return db()
    .select({
      o: orders,
      live: sql<number>`(select count(*)::int from submissions s where s.submission_order_id = ${orders.id} and s.status = 'live')`,
      total: sql<number>`(select count(*)::int from submissions s where s.submission_order_id = ${orders.id} and s.status <> 'replaced')`,
    })
    .from(orders)
    .where(
      and(
        or(eq(orders.userId, userId), eq(sql`lower(${orders.email})`, email.toLowerCase())),
        ne(orders.status, "cancelled"),
      ),
    )
    .orderBy(desc(orders.createdAt));
}

// --- Ops console -------------------------------------------------------------

export async function listOrdersForOps() {
  return db()
    .select({
      o: orders,
      live: sql<number>`(select count(*)::int from submissions s where s.submission_order_id = ${orders.id} and s.status = 'live')`,
      total: sql<number>`(select count(*)::int from submissions s where s.submission_order_id = ${orders.id} and s.status <> 'replaced')`,
      open: sql<number>`(select count(*)::int from submissions s where s.submission_order_id = ${orders.id} and s.status in ('todo', 'needs_action'))`,
      overdue: sql<boolean>`${orders.dueAt} < now() and ${orders.status} not in ('delivered', 'cancelled')`,
      assignee: schema.user.name,
    })
    .from(orders)
    .leftJoin(schema.user, eq(schema.user.id, orders.assigneeId))
    .where(ne(orders.status, "cancelled"))
    .orderBy(sql`${orders.dueAt} asc nulls last`, desc(orders.createdAt));
}

export const opsUpdate = z.object({
  status: z.enum(["todo", "submitted", "pending", "needs_action", "live", "rejected", "skipped", "dead"]).optional(),
  liveUrl: z
    .string()
    .trim()
    .max(500)
    .refine((u) => u === "" || /^https?:\/\/\S+$/.test(u), "Use the full listing URL")
    .optional(),
  notes: z.string().trim().max(2000).optional(),
  actionNeeded: z.string().trim().max(300).optional(),
  evidenceUrl: z
    .string()
    .trim()
    .max(500)
    .refine((u) => u === "" || /^https:\/\/\S+$/.test(u), "Use an https:// URL")
    .optional(),
  /** Directory account we created. An empty password keeps the stored one. */
  accountLogin: z.string().trim().max(200).optional(),
  accountPassword: z.string().max(200).optional(),
  /** Staff confirm the client's badge for this directory is on their site. */
  badgeSeen: z.boolean().optional(),
});
export type OpsUpdate = z.input<typeof opsUpdate>;

/** Adds the next best unused directory to an order. Returns the new row, or null when none are left. */
async function addReplacement(order: SubmissionOrder, replacesId: string, opts: { noBadges?: boolean } = {}) {
  const used = await db()
    .select({ id: submissions.directoryId })
    .from(submissions)
    .where(eq(submissions.submissionOrderId, order.id));
  const [next] = selectTargets(await candidates(), {
    count: 1,
    categories: order.categories,
    allowBadges: order.badgePreference === "allow" && !opts.noBadges,
    exclude: new Set(used.map((u) => u.id)),
  });
  if (!next) return null;
  const [row] = await db()
    .insert(submissions)
    .values({ directoryId: next, submissionOrderId: order.id, replacesId })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

/**
 * Staff updates one row. Live + URL runs the link check. A rejection (or a
 * dead listing) is swapped for the next best directory so the count holds.
 */
export async function updateOrderSubmission(submissionId: string, raw: OpsUpdate, now = new Date()) {
  const input = opsUpdate.parse(raw);
  const s = await db().query.submissions.findFirst({ where: eq(submissions.id, submissionId) });
  if (!s?.submissionOrderId) throw new SubmissionError("Not found.");
  const order = (await db().query.submissionOrders.findFirst({ where: eq(orders.id, s.submissionOrderId) }))!;
  if (order.status === "awaiting_intake" || order.status === "cancelled")
    throw new SubmissionError("This order isn't active.");

  const status = input.status ?? s.status;
  const directory = (await db().query.directories.findFirst({ where: eq(directories.id, s.directoryId) }))!;
  const badgeSeenAt =
    input.badgeSeen === true ? (s.badgeSeenAt ?? now) : input.badgeSeen === false ? null : s.badgeSeenAt;
  if (
    heldForBadge(order, directory, { badgeSeenAt }) &&
    status !== s.status &&
    !["todo", "skipped", "rejected"].includes(status)
  ) {
    throw new SubmissionError("Held until the client's badge for this directory is on their site.");
  }
  let accountSecret = s.accountSecret;
  if (input.accountPassword) {
    const key = env().CREDENTIALS_KEY;
    if (!key) throw new SubmissionError("Set CREDENTIALS_KEY to store directory passwords.");
    accountSecret = encryptSecret(input.accountPassword, key);
  }
  const liveUrl = input.liveUrl !== undefined ? input.liveUrl || null : s.liveUrl;
  if (status === "live" && !liveUrl) throw new SubmissionError("Add the live listing URL.");
  const urlChanged = liveUrl !== s.liveUrl;

  const [row] = await db()
    .update(submissions)
    .set({
      status,
      liveUrl,
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.actionNeeded !== undefined ? { actionNeeded: input.actionNeeded || null } : {}),
      ...(input.evidenceUrl !== undefined ? { evidenceUrl: input.evidenceUrl || null } : {}),
      ...(input.accountLogin !== undefined ? { accountLogin: input.accountLogin || null } : {}),
      accountSecret,
      badgeSeenAt,
      submittedAt: s.submittedAt ?? (status !== "todo" && status !== "skipped" ? now : null),
      liveAt: status === "live" ? (s.liveAt ?? now) : null,
      ...(urlChanged
        ? { linkVerdict: null, linkRel: null, linkAnchor: null, linkHttpStatus: null, linkCheckedAt: null }
        : {}),
    })
    .where(eq(submissions.id, submissionId))
    .returning();

  if (order.status === "queued" && status !== "todo") {
    await db().update(orders).set({ status: "in_progress", startedAt: now }).where(eq(orders.id, order.id));
  }

  let replacement = null;
  if ((status === "rejected" || status === "dead") && s.status !== status) {
    replacement = await addReplacement(order, row.id);
    if (replacement) await db().update(submissions).set({ status: "replaced" }).where(eq(submissions.id, row.id));
  }
  const checked =
    status === "live" && liveUrl && (urlChanged || !row.linkCheckedAt) ? await verifySubmission(row.id) : null;
  await trackSubmission(row.id, now);
  return { row: checked ?? (replacement ? { ...row, status: "replaced" as const } : row), replacement };
}

/** Sets many rows to one status (no live: those need a URL each). */
export async function bulkUpdate(orderId: string, ids: string[], status: "submitted" | "pending" | "skipped" | "todo") {
  if (ids.length === 0) return 0;
  const now = new Date();
  const rows = await db()
    .update(submissions)
    .set({
      status,
      submittedAt: sql`coalesce(${submissions.submittedAt}, ${status === "todo" || status === "skipped" ? null : now.toISOString()}::timestamptz)`,
    })
    .where(
      and(
        eq(submissions.submissionOrderId, orderId),
        inArray(submissions.id, ids),
        ne(submissions.status, "live"),
        ne(submissions.status, "replaced"),
        // Badge-gated rows wait for the client's badge (only "todo" and "skipped" move them).
        status === "todo" || status === "skipped"
          ? undefined
          : sql`not (${submissions.badgeSeenAt} is null
              and exists (select 1 from directories d where d.id = ${submissions.directoryId} and d.badge_required)
              and exists (select 1 from submission_orders o where o.id = ${submissions.submissionOrderId} and o.badge_preference = 'allow'))`,
      ),
    )
    .returning({ id: submissions.id });
  if (status !== "todo") {
    await db()
      .update(orders)
      .set({ status: "in_progress", startedAt: now })
      .where(and(eq(orders.id, orderId), eq(orders.status, "queued")));
  }
  return rows.length;
}

export async function assignOrder(orderId: string, assigneeId: string | null) {
  await db().update(orders).set({ assigneeId }).where(eq(orders.id, orderId));
}

/** Marks an order delivered and sends the client their report. */
export async function deliverOrder(orderId: string, now = new Date()) {
  const [order] = await db()
    .update(orders)
    .set({ status: "delivered", deliveredAt: now })
    .where(and(eq(orders.id, orderId), inArray(orders.status, ["queued", "in_progress"])))
    .returning();
  if (!order) throw new SubmissionError("Only active orders can be delivered.");
  const months = PACKAGES[order.package].monitorMonths;
  await db()
    .update(orders)
    .set({ monitorUntil: monitorEnd(now, months) })
    .where(eq(orders.id, order.id));
  const rows = await orderRows(order.id);
  const s = summarizeOrder(
    order,
    rows.map((r) => r.s),
  );
  await mail(order.contactEmail ?? order.email, `Delivered: ${s.live} live listings for ${order.productName}`, [
    { heading: `Your ${PACKAGES[order.package].label} order is complete` },
    {
      facts: [
        ["Live listings", String(s.live)],
        ["Verified dofollow", String(s.dofollow)],
      ],
    },
    {
      text: "Your report lists every directory with its live URL and link check, plus the logins of any accounts we created for you.",
    },
    {
      callout: "Link Monitor included",
      text: `Link Monitor is included for ${months} months: we re-check every live link and email you if one is removed or turns nofollow.`,
    },
    { button: "Open your report", href: url(`/orders/${order.intakeToken}`) },
    { note: "Share the read-only report with your team, or download it as CSV or PDF." },
  ]);
  return order;
}

/** Daily: tells clients about listings that went live since their last update. */
export async function sendOrderDigests(now = new Date()) {
  const active = await db()
    .select()
    .from(orders)
    .where(inArray(orders.status, ["in_progress"]));
  let sent = 0;
  for (const o of active) {
    const since = o.digestAt ?? o.intakeAt ?? o.createdAt;
    const fresh = await db()
      .select({ name: directories.name, needs: submissions.actionNeeded, status: submissions.status })
      .from(submissions)
      .innerJoin(directories, eq(directories.id, submissions.directoryId))
      .where(
        and(
          eq(submissions.submissionOrderId, o.id),
          or(
            and(eq(submissions.status, "live"), isNotNull(submissions.liveAt), gt(submissions.liveAt, since)),
            and(eq(submissions.status, "needs_action"), gt(submissions.updatedAt, since)),
          ),
        ),
      );
    if (fresh.length === 0) continue;
    const live = fresh.filter((f) => f.status === "live");
    const needs = fresh.filter((f) => f.status === "needs_action");
    const blocks: Block[] = [{ heading: `Progress on ${o.productName}` }];
    if (live.length) {
      blocks.push(
        { section: "New live listings" },
        { items: live.map((l) => ({ name: l.name, chip: { label: "Live", tone: "good" as const } })) },
      );
    }
    if (needs.length) {
      blocks.push(
        { section: "We need something from you" },
        {
          items: needs.map((n) => ({
            name: n.name,
            detail: n.needs ?? undefined,
            chip: { label: "Needs you", tone: "warn" as const },
          })),
        },
      );
    }
    blocks.push({ button: "Open your dashboard", href: url(`/orders/${o.intakeToken}`) });
    await mail(
      o.contactEmail ?? o.email,
      `${o.productName}: ${live.length} new live listing${live.length === 1 ? "" : "s"}`,
      blocks,
    );
    await db().update(orders).set({ digestAt: now }).where(eq(orders.id, o.id));
    sent++;
  }
  return { sent };
}

/** CSV of an order's rows (for the client's export and the report). */
export function ordersCsv(rows: Awaited<ReturnType<typeof orderRows>>): string {
  const q = (v: unknown) => {
    const s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [
    "directory",
    "directory_url",
    "dr",
    "status",
    "submitted_at",
    "live_at",
    "live_url",
    "link",
    "anchor",
    "checked_at",
    "note",
  ];
  const lines = rows
    .filter((r) => r.s.status !== "replaced")
    .map(({ s, d }) =>
      [
        d.name,
        d.url,
        d.dr,
        s.status,
        s.submittedAt,
        s.liveAt,
        s.liveUrl,
        s.linkVerdict,
        s.linkAnchor,
        s.linkCheckedAt,
        s.actionNeeded,
      ]
        .map(q)
        .join(","),
    );
  return [header.join(","), ...lines].join("\n");
}

export type { PackageId };

// --- Badge blocks (clients who allow badges) ----------------------------------

/** A badge-gated row waits until we've seen that directory's badge on the client's site. */
export function heldForBadge(
  order: Pick<SubmissionOrder, "badgePreference">,
  directory: { badgeRequired: boolean },
  row: { badgeSeenAt: Date | null },
) {
  return order.badgePreference === "allow" && directory.badgeRequired && !row.badgeSeenAt;
}

async function badgeRows(orderId: string) {
  return db()
    .select({ s: submissions, d: directories })
    .from(submissions)
    .innerJoin(directories, eq(directories.id, submissions.directoryId))
    .where(
      and(
        eq(submissions.submissionOrderId, orderId),
        eq(directories.badgeRequired, true),
        inArray(submissions.status, ["todo", "submitted", "pending", "needs_action", "live"]),
      ),
    )
    .orderBy(sql`${directories.dr} desc nulls last`);
}

/** The order's badge block: the snippets of its badge-gated directories. Null when there are none. */
export async function badgeBlockFor(orderId: string) {
  const rows = (await badgeRows(orderId)).filter((r) => r.d.badgeSnippet?.trim());
  if (rows.length === 0) return null;
  return {
    html: badgeBlockHtml(rows.map((r) => ({ name: r.d.name, snippet: r.d.badgeSnippet! }))),
    directories: rows.map((r) => ({ name: r.d.name, seen: Boolean(r.s.badgeSeenAt) })),
  };
}

/** The badge block and how to use it, or null when no queued directory needs a badge. */
async function badgeBlocks(order: SubmissionOrder): Promise<Block[] | null> {
  const block = await badgeBlockFor(order.id);
  if (!block) return null;
  return [
    {
      text: `${block.directories.length} of the directories we're submitting ${order.productName ?? "your product"} to only list products that show their badge. Paste this block into your site's footer (any page we can reach from your homepage works):`,
    },
    { code: block.html },
    {
      text: `We check your site daily and submit each one as soon as its badge is up. Any still missing after ${BADGE_WAIT_DAYS} days are swapped for directories that don't need a badge.`,
    },
  ];
}

/** Emails the client their badge block on its own, when staff resend it. Intake puts it in its confirmation. */
export async function sendBadgeBlock(order: SubmissionOrder, now = new Date()) {
  const blocks = await badgeBlocks(order);
  if (!blocks) return false;
  await mail(order.contactEmail ?? order.email, "One step for your listings: add your directory badges", [
    { heading: "Add your directory badges" },
    ...blocks,
    { button: "Open your dashboard", href: url(`/orders/${order.intakeToken}`) },
  ]);
  await db().update(orders).set({ badgeBlockSentAt: now }).where(eq(orders.id, order.id));
  return true;
}

/**
 * Daily: looks for each held directory's badge on the client's site and
 * releases the rows it finds. After the wait, swaps the rest for badge-free
 * directories so the count holds.
 */
export async function checkBadgeBlocks(now = new Date()) {
  const active = await db()
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.badgePreference, "allow"),
        inArray(orders.status, ["queued", "in_progress"]),
        isNotNull(orders.websiteUrl),
      ),
    );
  let found = 0;
  let replaced = 0;
  for (const order of active) {
    const held = (await badgeRows(order.id)).filter((r) => heldForBadge(order, r.d, r.s));
    if (held.length === 0) continue;
    let html = "";
    let pageUrl = order.websiteUrl!;
    try {
      const page = await fetchPage(order.websiteUrl!, { purpose: "verify", timeoutMs: 10_000 });
      if (page.status < 400 && !page.blocked) {
        html = page.body;
        pageUrl = page.url;
      }
    } catch {
      // Unreachable today: try again tomorrow (the wait still runs).
    }
    const waited = now.getTime() - (order.badgeBlockSentAt ?? order.intakeAt ?? now).getTime();
    for (const r of held) {
      let domain: string;
      try {
        domain = domainOf(r.d.url);
      } catch {
        continue;
      }
      if (html && inspectBacklink(html, pageUrl, domain).verdict !== "missing") {
        await db().update(submissions).set({ badgeSeenAt: now }).where(eq(submissions.id, r.s.id));
        found++;
      } else if (r.s.status === "todo" && waited >= BADGE_WAIT_DAYS * DAY) {
        const next = await addReplacement(order, r.s.id, { noBadges: true });
        await db()
          .update(submissions)
          .set({
            status: next ? "replaced" : "skipped",
            notes: sql`trim(${submissions.notes} || ' Badge not found on the client site.')`,
          })
          .where(eq(submissions.id, r.s.id));
        replaced++;
      }
    }
  }
  return { orders: active.length, found, replaced };
}

// --- Directory accounts --------------------------------------------------------

/** Logins we created for the client, decrypted. Only for the private order page after delivery, and ops. */
export async function credentialsFor(orderId: string) {
  const key = env().CREDENTIALS_KEY;
  const rows = await db()
    .select({
      directory: directories.name,
      url: directories.url,
      login: submissions.accountLogin,
      secret: submissions.accountSecret,
    })
    .from(submissions)
    .innerJoin(directories, eq(directories.id, submissions.directoryId))
    .where(and(eq(submissions.submissionOrderId, orderId), isNotNull(submissions.accountLogin)))
    .orderBy(asc(directories.name));
  return rows.map((r) => {
    let password: string | null = null;
    if (r.secret && key) {
      try {
        password = decryptSecret(r.secret, key);
      } catch {
        password = null;
      }
    }
    return { directory: r.directory, url: r.url, login: r.login!, password };
  });
}
