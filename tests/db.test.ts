import { countRecords, getRecord, openDb, putRecords } from "../src/lib/db.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { indexedDB } from "fake-indexeddb";

vi.stubGlobal("indexedDB", indexedDB);

describe("corpus schema", () => {
  afterEach(async () => {
    const dbs = await indexedDB.databases();
    await Promise.all(dbs.map((info) => info.name !== undefined && indexedDB.deleteDatabase(info.name)));
  });

  it("creates five versioned stores", async () => {
    const db = await openDb(indexedDB);
    expect([...db.objectStoreNames]).toEqual(expect.arrayContaining(["posts", "authors", "media", "briefs", "claims"]));
    expect(db.version).toBe(2);
    db.close();
  });

  it("round-trips posts with provenance", async () => {
    const db = await openDb(indexedDB);
    await putRecords(db, "posts", [
      { authorId: "a1", createdAt: 1, id: "p1", provenance: "saved", syncedAt: 2, text: "hello", url: "u" },
    ]);
    expect(await getRecord(db, "posts", "p1")).toMatchObject({ id: "p1", provenance: "saved" });
    expect(await countRecords(db, "posts")).toBe(1);
    db.close();
  });

  it("upserts authors and briefs by key", async () => {
    const db = await openDb(indexedDB);
    await putRecords(db, "authors", [{ handle: "h", id: "a1", lastSeen: 3, likeCount: 1, name: "n", saveCount: 2 }]);
    await putRecords(db, "authors", [{ handle: "h", id: "a1", lastSeen: 4, likeCount: 1, name: "n", saveCount: 3 }]);
    expect(await countRecords(db, "authors")).toBe(1);
    await putRecords(db, "briefs", [{ createdAt: 5, postId: "p1", text: "brief" }]);
    expect(await getRecord(db, "briefs", "p1")).toMatchObject({ text: "brief" });
    db.close();
  });

  it("indexes media by post", async () => {
    const db = await openDb(indexedDB);
    await putRecords(db, "media", [
      { id: "m1", kind: "image", postId: "p1", url: "u1" },
      { id: "m2", kind: "link", postId: "p1", url: "u2" },
    ]);
    expect(await countRecords(db, "media")).toBe(2);
    db.close();
  });
});
