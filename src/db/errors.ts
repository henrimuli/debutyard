const UNIQUE_VIOLATION = "23505";

/**
 * Whether a failed write hit a unique constraint. Drizzle wraps the driver's
 * error, so the Postgres code is on the cause and the message is only the query.
 */
export function isUniqueViolation(err: unknown): boolean {
  for (let e = err; e instanceof Error; e = e.cause) {
    if ((e as Error & { code?: unknown }).code === UNIQUE_VIOLATION) return true;
  }
  return false;
}
