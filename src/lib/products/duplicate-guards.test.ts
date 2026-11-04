import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = { id: string; websiteUrl: string; createdBy: string; status: string; slug?: string; tier?: string };

const state = vi.hoisted(() => ({
  current: null as unknown,
  others: [] as unknown[],
  writes: [] as string[],
}));

vi.mock("@/db", async () => {
  const schema = await import("@/db/schema");
  const write = (kind: string) => () => {
    state.writes.push(kind);
    const chain = {
      set: () => chain,
      values: () => chain,
      where: () => chain,
      onConflictDoNothing: () => chain,
      returning: async () => [state.current],
    };
    return chain;
  };
  return {
    schema,
    db: () => ({
      query: {
        products: {
          findFirst: async () => state.current,
          findMany: async () => state.others,
        },
        productMedia: { findFirst: async () => ({ id: "shot" }) },
        badgeVerifications: { findFirst: async () => ({ status: "verified", dnsToken: "t" }) },
      },
      insert: write("insert"),
      update: write("update"),
      delete: write("delete"),
      select: () => ({
        from: () => ({ leftJoin: () => ({ where: async () => [{ n: 0 }] }), where: async () => [{ n: 0 }] }),
      }),
    }),
  };
});

const { approveProduct, assertCanEnterReview, ProductError, saveProduct, submitForReview } = await import("./service");

const mine = (over: Partial<Row> = {}): Row => ({
  id: "mine",
  websiteUrl: "https://acme.com/",
  createdBy: "maker",
  status: "draft",
  tier: "free",
  ...over,
});
const theirs = (status: string): Row => ({
  id: "theirs",
  websiteUrl: "https://www.acme.com/",
  createdBy: "someone-else",
  status,
  slug: "acme",
});
const input = {
  websiteUrl: "https://acme.com/",
  name: "Acme",
  tagline: "Does useful things",
  description: "x".repeat(40),
  pricingModel: "free",
  categories: [],
} as unknown as Parameters<typeof saveProduct>[1];

beforeEach(() => {
  state.current = mine();
  state.others = [];
  state.writes = [];
});

describe("creating a listing", () => {
  it("is refused when the site is already listed, writing nothing", async () => {
    state.others = [theirs("approved")];
    await expect(saveProduct("maker", input)).rejects.toThrow(/acme\.com is already listed/);
    expect(state.writes).toEqual([]);
  });

  it("is refused when the maker already has a draft for it", async () => {
    state.others = [mine()];
    await expect(saveProduct("maker", input)).rejects.toThrow(/You already have a listing/);
    expect(state.writes).toEqual([]);
  });
});

describe("submitting a draft", () => {
  it("is refused when someone else's listing went into review after the draft was saved", async () => {
    state.others = [theirs("pending")];
    await expect(submitForReview("mine", "maker")).rejects.toBeInstanceOf(ProductError);
    expect(state.writes).toEqual([]);
  });

  it("goes through when the other listing is only a draft", async () => {
    state.others = [theirs("draft")];
    await submitForReview("mine", "maker");
    expect(state.writes).toEqual(["update"]);
  });

  it("isn't excused by the free-rule override staff get", async () => {
    state.others = [theirs("approved")];
    await expect(submitForReview("mine", "maker", { override: true })).rejects.toThrow(/already listed/);
  });
});

describe("assertCanEnterReview, before paying", () => {
  it("refuses a draft or rejected listing whose site is taken", async () => {
    state.others = [theirs("approved")];
    await expect(assertCanEnterReview(mine() as never)).rejects.toThrow(/already listed/);
    await expect(assertCanEnterReview(mine({ status: "rejected" }) as never)).rejects.toThrow(/already listed/);
  });

  it("leaves listings already in review or approved alone, so they can still upgrade", async () => {
    state.others = [theirs("approved")];
    await expect(assertCanEnterReview(mine({ status: "pending" }) as never)).resolves.toBeUndefined();
    await expect(assertCanEnterReview(mine({ status: "approved" }) as never)).resolves.toBeUndefined();
  });
});

describe("approving a listing", () => {
  it("tells staff when another listing holds the site, and changes nothing", async () => {
    state.current = mine({ status: "pending" });
    state.others = [theirs("approved")];
    await expect(approveProduct("mine")).rejects.toThrow(/already listed/);
    expect(state.writes).toEqual([]);
  });
});
