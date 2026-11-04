import { boolean, index, integer, jsonb, pgEnum, pgTable, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { directories } from "./directories";
import { orders } from "./payments";
import { user } from "./auth";

/** off: reads replies only. dry_run: writes drafts, sends nothing. live: sends (production only). */
export const outreachMode = pgEnum("outreach_mode", ["off", "dry_run", "live"]);

/** The one row of controls behind /admin/outreach. */
export const outreachSettings = pgTable("outreach_settings", {
  id: smallint("id").primaryKey().default(1),
  mode: outreachMode("mode").notNull().default("off"),
  /** Emails per UTC day. Staff raise it slowly from the dashboard. */
  dailyLimit: integer("daily_limit").notNull().default(5),
  /** Sites above this Domain Rating don't need the pitch. */
  maxAuthority: integer("max_authority").notNull().default(40),
  /** Set when the health check drops the mode to dry run. Cleared by going live again. */
  pausedReason: text("paused_reason"),
  /** Health checks only look at sends after this, so going live again doesn't re-trip on the same bad sends. */
  healthFrom: timestamp("health_from", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/**
 * What we know about each mailbox. The logins live in OUTREACH_MAILBOXES; rows
 * appear the first time a mailbox is read or fails, and outlive its removal.
 */
export const outreachMailboxes = pgTable("outreach_mailboxes", {
  /** Bare and lowercased. */
  address: text("address").primaryKey(),
  /** Where the reader got to. A new UID validity means reading from the top. */
  imapUidValidity: text("imap_uid_validity"),
  imapLastUid: integer("imap_last_uid").notNull().default(0),
  imapCheckedAt: timestamp("imap_checked_at", { withTimezone: true }),
  imapError: text("imap_error"),
  /** Why it couldn't send when last tried. Cleared by its next good send. */
  sendError: text("send_error"),
  sendErrorAt: timestamp("send_error_at", { withTimezone: true }),
});

/** One row per crawled directory: when we last read it and how much it gave us. */
export const outreachSources = pgTable("outreach_sources", {
  directoryId: uuid("directory_id")
    .primaryKey()
    .references(() => directories.id, { onDelete: "cascade" }),
  lastCrawledAt: timestamp("last_crawled_at", { withTimezone: true }),
  lastFound: integer("last_found").notNull().default(0),
  totalFound: integer("total_found").notNull().default(0),
  lastError: text("last_error"),
});

export const outreachProspectStatus = pgEnum("outreach_prospect_status", [
  "discovered",
  "qualified",
  "researched",
  "drafted",
  "rejected",
  "failed",
]);

export type OutreachClassification = { kind: string; confidence: number; reason: string };

export type OutreachSerpRow = { position: number; domain: string; url: string; title: string };

/** Everything the email's claims rest on, kept so each one can be checked later. */
export type OutreachResearch = {
  summary: string;
  audience: string;
  keywords: Array<{ keyword: string; prospectPosition: number | null; results: OutreachSerpRow[] }>;
  pick: {
    keyword: string;
    competitors: Array<{ name: string; domain: string; position: number; authority: number }>;
    prospectAuthority: number;
  };
};

/**
 * A business found on a directory. `domain` is unique, so nobody enters the
 * pipeline twice, however many directories list them. Rejected rows stay: they
 * stop the same site being checked (and paid for) again.
 */
export const outreachProspects = pgTable(
  "outreach_prospects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Registrable domain, e.g. acme.com. */
    domain: text("domain").notNull().unique(),
    name: text("name").notNull(),
    websiteUrl: text("website_url").notNull(),
    directoryId: uuid("directory_id").references(() => directories.id, { onDelete: "set null" }),
    /** The page on the directory where we saw it. */
    sourceUrl: text("source_url").notNull(),
    /** Why we believe it launched recently: a date or the section it sat in. */
    launchEvidence: text("launch_evidence").notNull(),
    launchedAt: timestamp("launched_at", { withTimezone: true }),
    status: outreachProspectStatus("status").notNull().default("discovered"),
    /** Short code when rejected or failed, e.g. directory_signal. */
    reason: text("reason"),
    reasonDetail: text("reason_detail"),
    classification: jsonb("classification").$type<OutreachClassification>(),
    email: text("email"),
    /** The public page the address was on. */
    emailSourceUrl: text("email_source_url"),
    research: jsonb("research").$type<OutreachResearch>(),
    /** Failed steps so far. Three and the prospect is dropped. */
    attempts: integer("attempts").notNull().default(0),
    discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("outreach_prospects_status_idx").on(t.status, t.discoveredAt)],
);

export const outreachVariantStatus = pgEnum("outreach_variant_status", ["pending", "testing", "retired"]);

/** One version of the pitch: a brief the writer follows, personalised for each business. */
export const outreachVariants = pgTable("outreach_variants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  status: outreachVariantStatus("status").notNull().default("pending"),
  /** How the subject line should work. */
  subjectBrief: text("subject_brief").notNull(),
  /** The angle of the pitch paragraphs. */
  pitchBrief: text("pitch_brief").notNull(),
  /** The closing sentence that carries the link, with {link:...} around its linked words. */
  closing: text("closing").notNull(),
  /** Who wrote it: seed, or agent. */
  source: text("source").notNull().default("agent"),
  rationale: text("rationale").notNull().default(""),
  retiredReason: text("retired_reason"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const outreachEmailStatus = pgEnum("outreach_email_status", [
  "draft",
  "sending",
  "sent",
  "failed",
  "bounced",
  "discarded",
]);

/**
 * The one email a prospect ever gets. Unique on prospect and on address, so the
 * database itself refuses a second one. A row stuck on `sending` (a crash mid
 * send) is never retried: not knowing means not risking a duplicate.
 */
export const outreachEmails = pgTable(
  "outreach_emails",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    prospectId: uuid("prospect_id")
      .notNull()
      .unique()
      .references(() => outreachProspects.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => outreachVariants.id),
    /** Lowercased. */
    toAddress: text("to_address").notNull().unique(),
    fromAddress: text("from_address"),
    subject: text("subject").notNull(),
    /** The email exactly as it goes out: plain text, with its link in it. */
    body: text("body").notNull(),
    /** In the click and unsubscribe links. */
    token: text("token").notNull().unique(),
    /** RFC Message-ID, angle brackets included, fixed before sending so replies always match. */
    messageId: text("message_id").notNull().unique(),
    status: outreachEmailStatus("status").notNull().default("draft"),
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    firstClickAt: timestamp("first_click_at", { withTimezone: true }),
    clicks: integer("clicks").notNull().default(0),
    repliedAt: timestamp("replied_at", { withTimezone: true }),
    /** How the first human reply read: interested, question, not_interested… */
    replyClass: text("reply_class"),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    bouncedAt: timestamp("bounced_at", { withTimezone: true }),
    /** A paid order we could tie back to this email. */
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("outreach_emails_status_idx").on(t.status, t.sentAt),
    index("outreach_emails_variant_idx").on(t.variantId),
  ],
);

/** One click on an email's link, including the ones we think were mail scanners. */
export const outreachClicks = pgTable(
  "outreach_clicks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    emailId: uuid("email_id")
      .notNull()
      .references(() => outreachEmails.id, { onDelete: "cascade" }),
    userAgent: text("user_agent"),
    /** Looked like a scanner: not counted in the email's clicks. */
    scanner: boolean("scanner").notNull().default(false),
    clickedAt: timestamp("clicked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("outreach_clicks_email_idx").on(t.emailId)],
);

export const outreachThreadStatus = pgEnum("outreach_thread_status", ["open", "done"]);

/** One conversation in the outreach inbox. Separate from the support inbox, and sent from an outreach mailbox. */
export const outreachThreads = pgTable(
  "outreach_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The email it answers. Null when a message arrived we couldn't match to one. */
    emailId: uuid("email_id")
      .unique()
      .references(() => outreachEmails.id, { onDelete: "set null" }),
    contactEmail: text("contact_email").notNull(),
    contactName: text("contact_name"),
    /** The mailbox this conversation is with, which answers come from. */
    mailbox: text("mailbox"),
    subject: text("subject").notNull().default(""),
    /** How the latest reply read. */
    replyClass: text("reply_class"),
    status: outreachThreadStatus("status").notNull().default("open"),
    unread: boolean("unread").notNull().default(true),
    snippet: text("snippet").notNull().default(""),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("outreach_threads_status_idx").on(t.status, t.lastMessageAt),
    index("outreach_threads_contact_idx").on(t.contactEmail),
  ],
);

export const outreachDirection = pgEnum("outreach_direction", ["in", "out"]);

export const outreachMessages = pgTable(
  "outreach_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => outreachThreads.id, { onDelete: "cascade" }),
    direction: outreachDirection("direction").notNull(),
    fromAddress: text("from_address").notNull(),
    fromName: text("from_name"),
    toAddress: text("to_address").notNull(),
    subject: text("subject").notNull().default(""),
    text: text("text").notNull().default(""),
    /** RFC Message-ID: makes reading the mailbox again a no-op. */
    messageId: text("message_id").notNull().unique(),
    inReplyTo: text("in_reply_to"),
    references: text("references"),
    /** Staff member who wrote an outgoing message. */
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("outreach_messages_thread_idx").on(t.threadId, t.createdAt)],
);

export const outreachSuppressionKind = pgEnum("outreach_suppression_kind", ["email", "domain"]);

/** Addresses and domains we never contact: unsubscribes, bounces, and anything staff block. Permanent. */
export const outreachSuppressions = pgTable("outreach_suppressions", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: outreachSuppressionKind("kind").notNull(),
  /** A lowercased address or registrable domain. */
  value: text("value").notNull().unique(),
  /** unsubscribed, bounced, complained, not_interested, directory or manual. */
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
