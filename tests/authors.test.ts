import { rankAuthors, scoreAuthor, upsertAuthors } from "../src/lib/authors.js";
import { openDb } from "../src/lib/db.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { indexedDB } from "fake-indexeddb";

vi.stubGlobal("indexedDB", indexedDB);

afterEach(async () => {
  const dbs = await indexedDB.databases();
  await Promise.all(dbs.map((info) => info.name !== undefined && indexedDB.deleteDatabase(info.name)));
});

describe("authors", () => {
  it("scores saves double against likes", () => {
    expect(scoreAuthor({ handle: "h", id: "a", lastSeen: 1, likeCount: 3, name: "n", saveCount: 2 })).toBe(7);
  });

  it("upserts counts and refreshes names", async () => {
    const db = await openDb(indexedDB);
    await upsertAuthors(db, [
      { authorHandle: "h1", authorId: "a1", authorName: "N1", provenance: "saved", seenAt: 1 },
      { authorHandle: "h1", authorId: "a1", authorName: "N1", provenance: "liked", seenAt: 2 },
      { authorHandle: "h2", authorId: "a2", authorName: "N2", provenance: "liked", seenAt: 3 },
    ]);
    const ranked = await rankAuthors(db, 10);
    expect(ranked.map((author) => [author.id, author.score])).toEqual([
      ["a1", 3],
      ["a2", 1],
    ]);
    await upsertAuthors(db, [{ authorHandle: "h1x", authorId: "a1", authorName: "N1x", provenance: "saved", seenAt: 4 }]);
    const updated = await rankAuthors(db, 10);
    expect(updated[0]).toMatchObject({ handle: "h1x", id: "a1", name: "N1x", saveCount: 2 });
    db.close();
  });

  it("keeps prior names on empty updates", async () => {
    const db = await openDb(indexedDB);
    await upsertAuthors(db, [{ authorHandle: "h", authorId: "a", authorName: "N", provenance: "saved", seenAt: 1 }]);
    await upsertAuthors(db, [{ authorHandle: "", authorId: "a", authorName: "", provenance: "liked", seenAt: 2 }]);
    const ranked = await rankAuthors(db, 10);
    expect(ranked[0]).toMatchObject({ handle: "h", name: "N" });
    db.close();
  });

  it("respects the limit", async () => {
    const db = await openDb(indexedDB);
    await upsertAuthors(db, [
      { authorHandle: "a", authorId: "1", authorName: "a", provenance: "saved", seenAt: 1 },
      { authorHandle: "b", authorId: "2", authorName: "b", provenance: "saved", seenAt: 1 },
    ]);
    expect(await rankAuthors(db, 1)).toHaveLength(1);
    db.close();
  });
});
