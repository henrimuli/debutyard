import { index, pgTable, real, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Domain Rating snapshots: DR before/after charts, Maker Pro tracking, the free DR checker's cache. */
export const domainMetrics = pgTable(
  "domain_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    domain: text("domain").notNull(),
    /** 0–100, on the provider's scale. Readings from earlier providers are kept but no longer read (see DR_SOURCE). */
    dr: real("dr").notNull(),
    provider: text("provider").notNull(),
    measuredAt: timestamp("measured_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("domain_metrics_domain_idx").on(t.domain, t.measuredAt)],
);
