import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import type { SQL } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/env";
import { installQueryErrorRedaction } from "./redact-query-errors";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __db?: Database };

function createDb(): Database {
  const url = env().DATABASE_URL;
  if (!url) throw new Error("Missing environment variables: DATABASE_URL");
  // node-postgres, not postgres.js: postgres.js pipelines several queries on one
  // connection, and Supabase's transaction pooler (Supavisor) can lose one of
  // them, leaving it hung forever. A pg client only ever has one query in flight.
  const pool = new Pool({
    connectionString: url,
    max: env().NODE_ENV === "production" ? 5 : 3,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
    // A query that gets no reply fails instead of leaving the page loading forever.
    query_timeout: 20_000,
  });
  // A dropped idle connection must not crash the process.
  pool.on("error", (e) => console.error("Postgres pool error:", e.message));
  // On Vercel, releases idle connections before the instance is suspended.
  attachDatabasePool(pool);
  installQueryErrorRedaction();
  return drizzle(pool, { schema, casing: "snake_case" });
}

/** Lazily created so builds and tests that never touch the DB don't need DATABASE_URL. */
export function db(): Database {
  globalForDb.__db ??= createDb();
  return globalForDb.__db;
}

/** Rows from a raw SQL query. */
export async function queryRows<T>(query: SQL): Promise<T[]> {
  return (await db().execute(query)).rows as T[];
}

export { schema };
