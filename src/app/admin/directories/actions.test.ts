import { DrizzleQueryError } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  failure: null as unknown,
  existing: null as { name: string } | null,
  saved: [] as string[],
}));

vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "staff" })),
  isStaff: vi.fn(async () => true),
}));
vi.mock("@/db", async () => {
  const schema = await import("@/db/schema");
  const write = (kind: string) => () => {
    const chain = {
      set: () => chain,
      values: () => chain,
      where: () => chain,
      returning: async () => {
        if (state.failure) throw state.failure;
        state.saved.push(kind);
        return [{ id: "saved-id" }];
      },
    };
    return chain;
  };
  return {
    schema,
    queryRows: vi.fn(),
    db: () => ({
      insert: write("insert"),
      update: write("update"),
      query: { directories: { findFirst: async () => state.existing } },
    }),
  };
});

const { saveDirectoryAction } = await import("./actions");

const ID = "7f0c1a52-1c7e-4a7b-9d55-0a4f3b2c1d10";
const input = { name: "Product Hunt", slug: "", url: "https://producthunt.com" };
const slugTaken = () =>
  new DrizzleQueryError(
    'insert into "directories"',
    [],
    Object.assign(new Error('duplicate key value violates unique constraint "directories_slug_unique"'), {
      code: "23505",
    }),
  );

beforeEach(() => {
  state.failure = null;
  state.existing = null;
  state.saved = [];
});

describe("saveDirectoryAction", () => {
  it("says the directory exists when adding one with a taken slug", async () => {
    state.failure = slugTaken();
    state.existing = { name: "Product Hunt" };
    const res = await saveDirectoryAction(input, null);
    expect(res).toEqual({
      ok: false,
      error:
        'Product Hunt already exists with the slug "product-hunt". Edit that one, or use a different slug if this is another directory.',
    });
  });

  it("says the same when an edit moves onto a taken slug", async () => {
    state.failure = slugTaken();
    state.existing = { name: "Betalist" };
    const res = await saveDirectoryAction({ ...input, slug: "betalist" }, ID);
    expect(res).toMatchObject({
      ok: false,
      error: expect.stringContaining('Betalist already exists with the slug "betalist"'),
    });
  });

  it("still gives a message if the other directory has gone by the time we look", async () => {
    state.failure = slugTaken();
    const res = await saveDirectoryAction(input, null);
    expect(res).toMatchObject({ ok: false, error: expect.stringContaining("That directory already exists") });
  });

  it("still throws on other database failures", async () => {
    const down = new DrizzleQueryError("insert", [], Object.assign(new Error("gone"), { code: "57P01" }));
    state.failure = down;
    await expect(saveDirectoryAction(input, null)).rejects.toBe(down);
  });

  it("saves a new directory and an edit when nothing clashes", async () => {
    await expect(saveDirectoryAction(input, null)).resolves.toEqual({ ok: true, id: "saved-id" });
    await expect(saveDirectoryAction(input, ID)).resolves.toEqual({ ok: true, id: "saved-id" });
    expect(state.saved).toEqual(["insert", "update"]);
  });

  it("reports bad input by field", async () => {
    const res = await saveDirectoryAction({ ...input, url: "not a url" }, null);
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/^url: /) });
  });
});
