import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";
import { products } from "./board";
import { orders } from "./payments";

export const directoryNiche = pgEnum("directory_niche", ["general", "devtools", "ai", "indie", "b2b"]);
export const directoryPricing = pgEnum("directory_pricing", ["free", "freemium", "paid"]);
export const linkType = pgEnum("link_type", ["dofollow", "nofollow", "unknown"]);

/** Places to list a product: launch boards, directories, review sites. */
export const directories = pgTable(
  "directories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    /** Where the submit form lives, if not the homepage. */
    submitUrl: text("submit_url"),
    description: text("description").notNull().default(""),
    niche: directoryNiche("niche").notNull().default("general"),
    pricing: directoryPricing("pricing").notNull().default("free"),
    /** Authority Score: measured in bulk monthly (see refreshDirectoryScores), or entered by staff in between. */
    dr: integer("dr"),
    linkTypeClaimed: linkType("link_type_claimed").notNull().default("unknown"),
    /** What our own link checks have seen on live listings. */
    linkTypeObserved: linkType("link_type_observed").notNull().default("unknown"),
    badgeRequired: boolean("badge_required").notNull().default(false),
    needsAccount: boolean("needs_account").notNull().default(true),
    /** Needs the maker personally (Product Hunt, HN, G2): offered as a checklist, not counted in packages. */
    guided: boolean("guided").notNull().default(false),
    queueEstimateDays: integer("queue_estimate_days"),
    /** Public note for makers (fees, review process). */
    submissionNotes: text("submission_notes").notNull().default(""),
    /** Internal instructions for whoever submits. */
    instructions: text("instructions").notNull().default(""),
    /** The badge HTML a badge-gated directory asks for, pasted by staff. Goes in the client's badge block. */
    badgeSnippet: text("badge_snippet"),
    /** From our outcomes, refreshed daily. */
    acceptanceRate: real("acceptance_rate"),
    avgDaysToLive: real("avg_days_to_live"),
    liveCount: integer("live_count").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    // Monthly liveness audit of the homepage. Three failures in a row deactivate it.
    auditedAt: timestamp("audited_at", { withTimezone: true }),
    auditFailures: integer("audit_failures").notNull().default(0),
    auditError: text("audit_error"),
    lastAuditedAt: timestamp("last_audited_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("directories_active_dr_idx").on(t.isActive, t.dr)],
);

export const submissionPackage = pgEnum("submission_package", ["starter", "growth", "scale"]);
export const submissionOrderStatus = pgEnum("submission_order_status", [
  "awaiting_intake",
  "queued",
  "in_progress",
  "delivered",
  "cancelled",
]);
export const badgePreference = pgEnum("badge_preference", ["none", "allow"]);

/**
 * A done-for-you submission order. Buyers don't need an account: the intake
 * token is their private link (intake, then live tracking); the report token
 * is a read-only link they can share.
 */
export const submissionOrders = pgTable(
  "submission_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .unique()
      .references(() => orders.id),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    /** A "boost" on an existing launch. */
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    package: submissionPackage("package").notNull(),
    targetCount: integer("target_count").notNull(),
    status: submissionOrderStatus("status").notNull().default("awaiting_intake"),
    intakeToken: text("intake_token").notNull().unique(),
    reportToken: text("report_token").notNull().unique(),
    // The product kit, collected at intake.
    productName: text("product_name"),
    websiteUrl: text("website_url"),
    tagline: text("tagline"),
    shortDescription: text("short_description"),
    longDescription: text("long_description"),
    categories: text("categories").array().notNull().default([]),
    logoUrl: text("logo_url"),
    founderName: text("founder_name"),
    contactEmail: text("contact_email"),
    clientNotes: text("client_notes"),
    badgePreference: badgePreference("badge_preference").notNull().default("none"),
    allowAccounts: boolean("allow_accounts").notNull().default(false),
    assigneeId: text("assignee_id").references(() => user.id, { onDelete: "set null" }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    intakeAt: timestamp("intake_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    /** Included Link Monitor ends (set at delivery: 3/6/12 months by package). */
    monitorUntil: timestamp("monitor_until", { withTimezone: true }),
    /** When the end of included monitoring was handled (links kept on a plan, or stopped). */
    monitorEndedAt: timestamp("monitor_ended_at", { withTimezone: true }),
    /** Last status-change digest sent to the client. */
    digestAt: timestamp("digest_at", { withTimezone: true }),
    /** Local part of the order's submission inbox ({key}@INBOUND_EMAIL_DOMAIN). */
    inboxKey: text("inbox_key").unique(),
    /** Badge block for clients who allow badges: when we emailed it. */
    badgeBlockSentAt: timestamp("badge_block_sent_at", { withTimezone: true }),
    /** Public key of the order's live badge block, in the URLs on the client's site. Not a credential. */
    blockKey: text("block_key")
      .notNull()
      .unique()
      .default(sql`replace(gen_random_uuid()::text, '-', '')`),
    /** When we found the block on the client's site. Orders without this that allow badges use the emailed block above. */
    blockInstalledAt: timestamp("block_installed_at", { withTimezone: true }),
    /** The website it was found on: changing the URL means checking again. */
    blockInstalledUrl: text("block_installed_url"),
    blockCheckedAt: timestamp("block_checked_at", { withTimezone: true }),
    /** The client saved their details and moved on to installing the block. */
    intakeDraftAt: timestamp("intake_draft_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("submission_orders_status_idx").on(t.status)],
);

export const submissionStatus = pgEnum("submission_status", [
  "todo",
  "submitted",
  "pending",
  "needs_action",
  "live",
  "rejected",
  "replaced",
  "skipped",
  "dead",
]);
export const linkVerdict = pgEnum("link_verdict", ["dofollow", "nofollow", "missing", "unreachable"]);

/**
 * One product on one directory. Either a DIY tracker row (owner set, no
 * order) or part of a done-for-you order.
 */
export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    directoryId: uuid("directory_id")
      .notNull()
      .references(() => directories.id, { onDelete: "cascade" }),
    submissionOrderId: uuid("submission_order_id").references(() => submissionOrders.id, { onDelete: "cascade" }),
    /** DIY tracker rows. */
    productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),
    status: submissionStatus("status").notNull().default("todo"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    liveAt: timestamp("live_at", { withTimezone: true }),
    liveUrl: text("live_url"),
    notes: text("notes").notNull().default(""),
    /** Shown to the client, e.g. "Directory asks for a reciprocal badge". */
    actionNeeded: text("action_needed"),
    evidenceUrl: text("evidence_url"),
    replacesId: uuid("replaces_id"),
    /** Directory account we created: login in clear, password encrypted (AES-GCM, CREDENTIALS_KEY). */
    accountLogin: text("account_login"),
    accountSecret: text("account_secret"),
    /** Badge-gated rows wait for the client's badge block; set when we find this directory's badge on their site. */
    badgeSeenAt: timestamp("badge_seen_at", { withTimezone: true }),
    // Latest link check, denormalised for the dashboards.
    linkVerdict: linkVerdict("link_verdict"),
    /** The directory's badge code, cleaned, shown in the client's live block while this row is active. */
    badgeCode: text("badge_code"),
    linkRel: text("link_rel"),
    linkAnchor: text("link_anchor"),
    linkHttpStatus: integer("link_http_status"),
    linkCheckedAt: timestamp("link_checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("submissions_order_directory_idx").on(t.submissionOrderId, t.directoryId),
    uniqueIndex("submissions_product_directory_idx").on(t.productId, t.directoryId),
    index("submissions_status_idx").on(t.status),
  ],
);

export const trackedLinkSource = pgEnum("tracked_link_source", ["tracker", "order", "manual"]);

/**
 * A live backlink that Link Monitor re-checks: from the DIY tracker, a
 * done-for-you order, or a URL the user added. Order links without an
 * account alert `alert_email` instead.
 */
export const trackedLinks = pgTable(
  "tracked_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "cascade" }),
    /** Where alerts go when there's no account (order links). */
    alertEmail: text("alert_email"),
    submissionId: uuid("submission_id")
      .unique()
      .references(() => submissions.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    targetDomain: text("target_domain").notNull(),
    expectedAnchor: text("expected_anchor"),
    source: trackedLinkSource("source").notNull(),
    lastVerdict: linkVerdict("last_verdict"),
    lastRel: text("last_rel"),
    lastAnchor: text("last_anchor"),
    lastStatusCode: integer("last_status_code"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    /** Consecutive checks that found the link missing or the page unreachable. */
    failures: integer("failures").notNull().default(0),
    /** Daily checks for the first 14 days after this, then weekly. */
    liveAt: timestamp("live_at", { withTimezone: true }).notNull().defaultNow(),
    nextCheckAt: timestamp("next_check_at", { withTimezone: true }).notNull().defaultNow(),
    /** Whether Google has the listing page indexed (SERP API, weekly). Null until checked. */
    indexed: boolean("indexed"),
    indexedCheckedAt: timestamp("indexed_checked_at", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tracked_links_due_idx").on(t.active, t.nextCheckAt),
    index("tracked_links_owner_idx").on(t.ownerUserId),
  ],
);

/** Every backlink check we run on a live listing or a tracked link. */
export const linkChecks = pgTable(
  "link_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id").references(() => submissions.id, { onDelete: "cascade" }),
    trackedLinkId: uuid("tracked_link_id").references(() => trackedLinks.id, { onDelete: "cascade" }),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
    verdict: linkVerdict("verdict").notNull(),
    httpStatus: integer("http_status"),
    rel: text("rel"),
    anchor: text("anchor"),
    error: text("error"),
    /** Screenshot of the listing at this check (when it went live or changed). */
    evidenceUrl: text("evidence_url"),
  },
  (t) => [
    index("link_checks_submission_idx").on(t.submissionId, t.checkedAt),
    index("link_checks_tracked_link_idx").on(t.trackedLinkId, t.checkedAt),
  ],
);

/** Makers who opted in to the public launch wall (their machine-verified links on /launch-wall and their profile). */
export const launchWallProfiles = pgTable("launch_wall_profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Email received at an order's submission inbox (directory verification mails and the like). */
export const submissionMessages = pgTable(
  "submission_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionOrderId: uuid("submission_order_id")
      .notNull()
      .references(() => submissionOrders.id, { onDelete: "cascade" }),
    toAddress: text("to_address").notNull(),
    fromAddress: text("from_address").notNull(),
    subject: text("subject").notNull().default(""),
    text: text("text").notNull().default(""),
    html: text("html"),
    /** Resend's id for the received email; makes redelivered webhooks no-ops. */
    resendEmailId: text("resend_email_id").unique(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("submission_messages_order_idx").on(t.submissionOrderId, t.receivedAt)],
);
