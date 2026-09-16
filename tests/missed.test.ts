import { missedFromTrusted } from "../src/lib/missed.js";
import { openDb, putRecords } from "../src/lib/db.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { indexedDB } from "fake-indexeddb";

vi.stubGlobal("indexedDB", indexedDB);

afterEach(async () => {
  const dbs = await indexedDB.databases();
  await Promise.all(dbs.map((info) => info.name !== undefined && indexedDB.deleteDatabase(info.name)));
});

function post(id: string, authorId: string, createdAt: number): Record<string, unknown> {
  return {
    authorHandle: authorId,
    authorId,
    authorName: authorId,
    createdAt,
    id,
    provenance: "saved",
    references: { quotedIds: [] },
    status: "active",
    syncedAt: 1,
    text: `post ${id}`,
    url: `u${id}`,
  };
}

describe("missed", () => {
  it("returns recent posts from trusted authors", async () => {
    const db = await openDb(indexedDB);
    await putRecords(db, "authors", [
      { handle: "star", id: "s", lastSeen: 1, likeCount: 0, name: "S", saveCount: 5 },
      { handle: "meh", id: "m", lastSeen: 1, likeCount: 0, name: "M", saveCount: 0 },
    ]);
    await putRecords(db, "posts", [
      post("p1", "s", 100),
      post("p2", "s", 50),
      post("p3", "m", 100),
      post("p4", "s", 10),
    ]);
    db.close();
    const missed = await missedFromTrusted({ dbFactory: indexedDB, since: 60 });
    expect(missed.map((item) => item.id)).toEqual(["p1"]);
  });

  it("respects score threshold and limit", async () => {
    const db = await openDb(indexedDB);
    await putRecords(db, "authors", [{ handle: "s", id: "s", lastSeen: 1, likeCount: 0, name: "S", saveCount: 10 }]);
    await putRecords(db, "posts", [post("p1", "s", 100), post("p2", "s", 90)]);
    db.close();
    expect(await missedFromTrusted({ dbFactory: indexedDB, minScore: 100, since: 0 })).toEqual([]);
    expect(await missedFromTrusted({ dbFactory: indexedDB, limit: 1, since: 0 })).toHaveLength(1);
  });

  it("returns empty without trusted authors", async () => {
    const db = await openDb(indexedDB);
    await putRecords(db, "posts", [post("p1", "s", 100)]);
    db.close();
    expect(await missedFromTrusted({ dbFactory: indexedDB, since: 0 })).toEqual([]);
  });
});
