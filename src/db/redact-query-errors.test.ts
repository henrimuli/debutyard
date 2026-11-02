import { inspect } from "node:util";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { installQueryErrorRedaction } from "./redact-query-errors";
import { session } from "./schema";

const TOKEN = "s3cr3t-session-token";

/** Runs a session lookup through real Drizzle on a client whose queries fail. */
async function failedLookup(cause: Error) {
  const client = { query: () => Promise.reject(cause) } as unknown as Pool;
  const db = drizzle(client, { casing: "snake_case" });
  return db
    .select()
    .from(session)
    .where(eq(session.token, TOKEN))
    .then(
      () => expect.unreachable("the query should fail"),
      (err: Error & { params: unknown[] }) => err,
    );
}

describe("query error redaction", () => {
  beforeAll(installQueryErrorRedaction);

  it("removes parameter values from everything a logger can print", async () => {
    const err = await failedLookup(new Error("Query read timeout"));

    for (const printed of [err.message, err.stack, String(err), inspect(err), JSON.stringify(err)]) {
      expect(printed).not.toContain(TOKEN);
    }
    expect(err.params).toEqual([]);
  });

  it("keeps the query text and the cause", async () => {
    const err = await failedLookup(new Error("Query read timeout"));

    expect(err.message).toContain('"session"."token" = $1');
    expect(err.message).toContain("params: [redacted]");
    expect(err.stack).toContain('"session"."token" = $1');
    expect(err.stack).toContain("redact-query-errors.test.ts");
    expect(inspect(err)).toContain("Query read timeout");
    expect((err.cause as Error).message).toBe("Query read timeout");
  });

  it("removes values Postgres repeats in the cause's detail, keeping its code", async () => {
    const cause = Object.assign(new Error("duplicate key value violates unique constraint"), {
      code: "23505",
      detail: `Key (token)=(${TOKEN}) already exists.`,
    });
    const err = await failedLookup(cause);

    expect(inspect(err)).not.toContain(TOKEN);
    expect(inspect(err)).toContain("duplicate key value");
    expect(err.cause).toMatchObject({ code: "23505", detail: "[redacted]" });
  });
});
