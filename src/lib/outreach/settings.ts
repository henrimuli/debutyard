import "server-only";
import { db, schema } from "@/db";

const { outreachMailboxes, outreachSettings } = schema;

export type OutreachSettings = typeof outreachSettings.$inferSelect;

/** The one settings row, created (off, 5 a day) the first time anything asks. */
export async function getSettings(): Promise<OutreachSettings> {
  const [row] = await db().select().from(outreachSettings).limit(1);
  if (row) return row;
  await db().insert(outreachSettings).values({ id: 1 }).onConflictDoNothing();
  const [created] = await db().select().from(outreachSettings).limit(1);
  return created!;
}

export async function updateSettings(
  patch: Partial<Pick<OutreachSettings, "mode" | "dailyLimit" | "maxAuthority" | "pausedReason" | "healthFrom">>,
) {
  await getSettings();
  await db().update(outreachSettings).set(patch);
}

/** Saves what we learned about one mailbox, creating its row the first time. */
export async function saveMailboxState(
  address: string,
  patch: Partial<Omit<typeof outreachMailboxes.$inferInsert, "address">>,
) {
  await db()
    .insert(outreachMailboxes)
    .values({ address, ...patch })
    .onConflictDoUpdate({ target: outreachMailboxes.address, set: patch });
}
