import { describe, expect, it } from "vitest";
import type { BlogFields } from "@/lib/blog/types";
import { backupHasNewWork, type Backup } from "./use-autosave";

const fields = (o: Record<string, unknown>) => o as unknown as BlogFields;
const SAVED_AT = "2026-11-01T10:00:00.000Z";
const backup = (at: string, f: Record<string, unknown>): Backup => ({
  at: new Date(at).getTime(),
  baseVersion: 1,
  fields: fields(f),
});

describe("backupHasNewWork", () => {
  const saved = {
    fields: fields({ title: "A", content_json: { type: "doc", attrs: { a: 1, b: 2 } } }),
    updatedAt: SAVED_AT,
  };

  it("offers a newer backup with different content", () => {
    expect(backupHasNewWork(backup("2026-11-01T10:05:00Z", { title: "B" }), saved)).toBe(true);
  });

  it("ignores a backup older than the last save", () => {
    expect(backupHasNewWork(backup("2026-11-01T09:00:00Z", { title: "B" }), saved)).toBe(false);
  });

  it("isn't fooled by the key order Postgres's jsonb hands back", () => {
    const same = backup("2026-11-01T10:05:00Z", { content_json: { attrs: { b: 2, a: 1 }, type: "doc" }, title: "A" });
    expect(backupHasNewWork(same, saved)).toBe(false);
  });
});
