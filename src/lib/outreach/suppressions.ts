import "server-only";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";

const { outreachSuppressions } = schema;

/** Adds an address or domain to the never-contact list. Whatever put it there first stays the reason. */
export async function suppress(kind: "email" | "domain", value: string, reason: string) {
  await db()
    .insert(outreachSuppressions)
    .values({ kind, value: value.trim().toLowerCase(), reason })
    .onConflictDoNothing();
}

export async function isSuppressed(...values: string[]): Promise<boolean> {
  const rows = await db()
    .select({ value: outreachSuppressions.value })
    .from(outreachSuppressions)
    .where(
      inArray(
        outreachSuppressions.value,
        values.map((v) => v.toLowerCase()),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
