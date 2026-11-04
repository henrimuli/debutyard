import { DrizzleQueryError } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { isUniqueViolation } from "./errors";

const pgError = (code: string) => Object.assign(new Error("duplicate key value"), { code });

describe("isUniqueViolation", () => {
  it("finds the Postgres code on the cause Drizzle wraps it in", () => {
    const err = new DrizzleQueryError('insert into "directories"', [], pgError("23505"));
    expect(err.message).not.toMatch(/unique/i);
    expect(isUniqueViolation(err)).toBe(true);
  });

  it("finds it on an unwrapped driver error", () => {
    expect(isUniqueViolation(pgError("23505"))).toBe(true);
  });

  it("ignores other failures", () => {
    expect(isUniqueViolation(new DrizzleQueryError("select", [], pgError("23503")))).toBe(false);
    expect(isUniqueViolation(new Error("unique"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});
