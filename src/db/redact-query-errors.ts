import "server-only";
import { DrizzleQueryError } from "drizzle-orm";
import { PgPreparedQuery } from "drizzle-orm/pg-core";

const REDACTED = "[redacted]";

/**
 * Strips bound values from a failed query's error, in place, keeping the query
 * text and the cause. Postgres repeats values in `detail`, e.g. on a unique
 * violation: "Key (token)=(abc) already exists".
 */
export function redactQueryError(err: unknown): unknown {
  if (!(err instanceof DrizzleQueryError)) return err;
  const message = `Failed query: ${err.query}\nparams: ${REDACTED}`;
  // A replacer function, because the query's $1 would otherwise read as a replacement pattern.
  err.stack = err.stack?.replace(err.message, () => message);
  err.message = message;
  err.params = [];
  if (err.cause && "detail" in err.cause) err.cause.detail = REDACTED;
  return err;
}

/**
 * Drizzle puts every bound value (session tokens, emails) in the message, the
 * stack and `params` of the error it throws, and from there into anything that
 * prints or stores it: Better Auth's logger, our console.error calls, Next's
 * logging of uncaught errors, the cron_runs results. So they come off where the
 * error is created. This wraps an internal method, hence the cast;
 * redact-query-errors.test.ts fails if an upgrade changes it.
 */
export function installQueryErrorRedaction(): void {
  const prototype = PgPreparedQuery.prototype as unknown as {
    queryWithCache: (this: unknown, ...args: unknown[]) => Promise<unknown>;
  };
  const queryWithCache = prototype.queryWithCache;
  prototype.queryWithCache = async function (...args) {
    try {
      return await queryWithCache.apply(this, args);
    } catch (err) {
      throw redactQueryError(err);
    }
  };
}
