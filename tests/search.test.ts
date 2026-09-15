import { SearchIndex, searchLinkPosts, tokenize } from "../src/lib/search.js";
import { openDb, putRecords } from "../src/lib/db.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { indexedDB } from "fake-indexeddb";

vi.stubGlobal("indexedDB", indexedDB);

afterEach(async () => {
  const dbs = await indexedDB.databases();
  await Promise.all(dbs.map((info) => info.name !== undefined && indexedDB.deleteDatabase(info.name)));
});

const POSTS = [
  { authorHandle: "kernels", authorName: "K", createdAt: 30, id: "p1", text: "DeepSeek kernel tricks for fast attention" },
  { authorHandle: "evalsguy", authorName: "E", createdAt: 20, id: "p2", text: "Eval harnesses beat vibes every time" },
  { authorHandle: "kernels", authorName: "K", createdAt: 10, id: "p3", text: "Attention kernels part two with benchmarks" },
];

describe("search", () => {
  it("tokenizes unicode text", () => {
    expect(tokenize("Hello, World! AI aged 4.8")).toEqual(["hello", "world", "ai", "aged"]);
    expect(tokenize("a I")).toEqual([]);
  });

  it("matches all tokens and ranks by frequency", () => {
    const index = new SearchIndex();
    index.add(POSTS);
    expect(index.search("kernel attention").map((post) => post.id)).toEqual(["p1"]);
    expect(index.search("attention").map((post) => post.id)).toEqual(["p1", "p3"]);
  });

  it("matches authors", () => {
    const index = new SearchIndex();
    index.add(POSTS);
    expect(index.search("kernels").map((post) => post.id)).toEqual(["p3", "p1"]);
  });

  it("filters by author and dates", () => {
    const index = new SearchIndex();
    index.add(POSTS);
    expect(index.search("attention", { author: "KERNELS" }).map((post) => post.id)).toEqual(["p1", "p3"]);
    expect(index.search("attention", { after: 25 }).map((post) => post.id)).toEqual(["p1"]);
    expect(index.search("attention", { before: 15 }).map((post) => post.id)).toEqual(["p3"]);
  });

  it("returns empty on misses and blank queries", () => {
    const index = new SearchIndex();
    index.add(POSTS);
    expect(index.search("zzz")).toEqual([]);
    expect(index.search("  ")).toEqual([]);
  });

  it("finds posts through saved link urls", async () => {
    const db = await openDb(indexedDB);
    await putRecords(db, "media", [
      { id: "p1#l0", kind: "link", postId: "p1", url: "https://paper.example/transformer" },
      { id: "p2#l0", kind: "link", postId: "p2", url: "https://other.example" },
    ]);
    expect(await searchLinkPosts(db, "PAPER")).toEqual(["p1"]);
    expect(await searchLinkPosts(db, "")).toEqual([]);
    db.close();
  });
});
