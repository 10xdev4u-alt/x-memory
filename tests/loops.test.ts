import { loopCounts, openLoopIds, reopenPost, resolvePost } from "../src/lib/loops.js";
import { openDb, putRecords } from "../src/lib/db.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { indexedDB } from "fake-indexeddb";

vi.stubGlobal("indexedDB", indexedDB);

afterEach(async () => {
  const dbs = await indexedDB.databases();
  await Promise.all(dbs.map((info) => info.name !== undefined && indexedDB.deleteDatabase(info.name)));
});

function post(id: string): Record<string, unknown> {
  return {
    authorHandle: "", authorId: "u", authorName: "", createdAt: 1, id,
    provenance: "saved", references: { quotedIds: [] }, status: "active",
    syncedAt: 1, text: "t", url: "u",
  };
}

describe("loops", () => {
  it("resolves once and counts open loops", async () => {
    const db = await openDb(indexedDB);
    await putRecords(db, "posts", [post("a"), post("b")]);
    db.close();
    expect(await resolvePost("a", 100, { dbFactory: indexedDB })).toBe(true);
    expect(await resolvePost("a", 200, { dbFactory: indexedDB })).toBe(false);
    expect(await loopCounts({ dbFactory: indexedDB })).toEqual({ open: 1, resolved: 1 });
    expect(await openLoopIds({ dbFactory: indexedDB })).toEqual(["b"]);
  });

  it("reopens resolved loops", async () => {
    const db = await openDb(indexedDB);
    await putRecords(db, "posts", [post("a")]);
    db.close();
    await resolvePost("a", 1, { dbFactory: indexedDB });
    expect(await reopenPost("a", { dbFactory: indexedDB })).toBe(true);
    expect(await reopenPost("a", { dbFactory: indexedDB })).toBe(false);
    expect(await loopCounts({ dbFactory: indexedDB })).toEqual({ open: 1, resolved: 0 });
  });

  it("counts empty corpora as zero open", async () => {
    expect(await loopCounts({ dbFactory: indexedDB })).toEqual({ open: 0, resolved: 0 });
  });
});
