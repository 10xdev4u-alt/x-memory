import { findDuplicateGroups, markDeadPosts, mergeDuplicates, normalizeText, verifyPosts } from "../src/lib/hygiene.js";
import { countRecords, getRecord, mediaForPost, openDb, putRecords } from "../src/lib/db.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { indexedDB } from "fake-indexeddb";

vi.stubGlobal("indexedDB", indexedDB);

afterEach(async () => {
  const dbs = await indexedDB.databases();
  await Promise.all(dbs.map((info) => info.name !== undefined && indexedDB.deleteDatabase(info.name)));
});

describe("hygiene", () => {
  it("normalizes text for comparison", () => {
    expect(normalizeText("Hello,  World! https://t.co/x")).toBe("hello world");
    expect(normalizeText("  ")).toBe("");
  });

  it("groups duplicates across url wrappers", () => {
    const groups = findDuplicateGroups([
      { id: "a", text: "Gold post https://t.co/1" },
      { id: "b", text: "gold POST" },
      { id: "c", text: "Something else entirely here" },
    ]);
    expect(groups).toEqual([["a", "b"]]);
  });

  it("skips empty texts", () => {
    expect(findDuplicateGroups([{ id: "a", text: "https://t.co/1" }])).toEqual([]);
  });

  it("marks dead posts through lookup", async () => {
    const marked: Array<[string, string]> = [];
    const result = await verifyPosts(
      ["a", "b", "c"],
      async () => new Map([["b", "deleted"]]),
      async (id, status) => {
        marked.push([id, status]);
      },
    );
    expect(result).toEqual({ checked: 3, dead: ["b"] });
    expect(marked).toEqual([["b", "deleted"]]);
  });

  it("treats unknown lookup results as active", async () => {
    const result = await verifyPosts(["a"], async () => new Map(), async () => undefined);
    expect(result.dead).toEqual([]);
  });

  it("marks dead posts without touching live ones", async () => {
    const db = await openDb(indexedDB);
    await putRecords(db, "posts", [
      { authorHandle: "", authorId: "u", authorName: "", createdAt: 1, id: "a", provenance: "saved", references: { quotedIds: [] }, status: "active", syncedAt: 1, text: "a", url: "u" },
      { authorHandle: "", authorId: "u", authorName: "", createdAt: 1, id: "b", provenance: "saved", references: { quotedIds: [] }, status: "active", syncedAt: 1, text: "b", url: "u" },
    ]);
    await markDeadPosts(db, [{ id: "b", status: "deleted" }, { id: "ghost", status: "suspended" }]);
    expect(await getRecord(db, "posts", "b")).toMatchObject({ status: "deleted" });
    expect(await getRecord(db, "posts", "a")).toMatchObject({ status: "active" });
    db.close();
  });

  it("merges duplicates keeping media and the richest brief", async () => {
    const db = await openDb(indexedDB);
    await putRecords(db, "posts", [
      { authorHandle: "", authorId: "u", authorName: "", createdAt: 1, id: "keep", provenance: "saved", references: { quotedIds: [] }, status: "active", syncedAt: 1, text: "t", url: "u" },
      { authorHandle: "", authorId: "u", authorName: "", createdAt: 1, id: "drop", provenance: "saved", references: { quotedIds: [] }, status: "active", syncedAt: 1, text: "t", url: "u" },
    ]);
    await putRecords(db, "media", [{ id: "drop#m0", kind: "image", postId: "drop", url: "img" }]);
    await putRecords(db, "briefs", [{ createdAt: 1, postId: "drop", text: "adopt me" }]);
    await mergeDuplicates(db, "keep", ["drop", "keep"]);
    expect(await countRecords(db, "posts")).toBe(1);
    expect(await mediaForPost(db, "keep")).toHaveLength(1);
    expect(await getRecord(db, "briefs", "keep")).toMatchObject({ text: "adopt me" });
    db.close();
  });
});
