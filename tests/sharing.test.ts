import { canShareInline, importSharedPackage, packageCollection, parseSharedLink, shareLink } from "../src/lib/sharing.js";
import { countRecords, getRecord, openDb } from "../src/lib/db.js";
import { listCollections } from "../src/lib/collections.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { indexedDB } from "fake-indexeddb";

vi.stubGlobal("indexedDB", indexedDB);

const store = new Map<string, unknown>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: store.get(key) }),
        set: async (entries: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(entries)) store.set(key, value);
        },
      },
    },
  });
});

afterEach(async () => {
  const dbs = await indexedDB.databases();
  await Promise.all(dbs.map((info) => info.name !== undefined && indexedDB.deleteDatabase(info.name)));
});

const POSTS = [
  { authorHandle: "h", authorName: "N", createdAt: 1, id: "p1", text: "hello world, kernels", url: "u1" },
  { authorHandle: "e", authorName: "E", createdAt: 2, id: "p2", text: "eval harnesses win", url: "u2" },
];

describe("sharing", () => {
  it("round-trips packages through links", () => {
    const pkg = packageCollection("c1", "Canon", "base", POSTS, { p1: "brief one" });
    const link = shareLink(pkg);
    expect(link.startsWith("#xmem1-")).toBe(true);
    const parsed = parseSharedLink(link);
    expect(parsed).toEqual({ briefs: { p1: "brief one" }, description: "base", id: "c1", name: "Canon", posts: POSTS, v: 1 });
  });

  it("omits empty descriptions", () => {
    const pkg = packageCollection("c", "N", "", POSTS, {});
    expect(pkg.description).toBeUndefined();
    expect(parseSharedLink(shareLink(pkg)).name).toBe("N");
  });

  it("rejects foreign and corrupt links", () => {
    expect(() => parseSharedLink("https://example.com")).toThrow(/not a shared collection/);
    expect(() => parseSharedLink("#xmem1-!!!")).toThrow();
    expect(() => parseSharedLink(shareLink({ briefs: {}, id: "x", name: "n", posts: "nope", v: 1 } as never))).toThrow(
      /unsupported/,
    );
  });

  it("gates oversized packages from inline links", () => {
    const big = packageCollection("c", "N", undefined, [{ ...POSTS[0] as (typeof POSTS)[number], text: "x".repeat(5000) }], {});
    expect(canShareInline(big)).toBe(false);
    const small = packageCollection("c", "N", undefined, [POSTS[0] as (typeof POSTS)[number]], {});
    expect(canShareInline(small)).toBe(true);
  });

  it("imports packages with posts, briefs, and lineage", async () => {
    const pkg = packageCollection("origin-1", "Canon", "base", POSTS, { p1: "brief one" });
    const result = await importSharedPackage(pkg, { dbFactory: indexedDB });
    expect(result).toMatchObject({ briefs: 1, posts: 2 });
    const db = await openDb(indexedDB);
    expect(await countRecords(db, "posts")).toBe(2);
    expect(await getRecord(db, "briefs", "p1")).toMatchObject({ text: "brief one" });
    db.close();
    const collections = await listCollections();
    expect(collections).toHaveLength(1);
    expect(collections[0]).toMatchObject({ name: "Canon", originId: "origin-1" });
    expect(collections[0]?.postIds).toEqual(["p1", "p2"]);
  });
});
