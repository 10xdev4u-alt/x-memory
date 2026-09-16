import { getRecord, openDb, putRecords } from "../src/lib/db.js";
import { DELETE_BOOKMARK_OPERATION, UNLIKE_OPERATION, unsavePost } from "../src/lib/unsave.js";
import { ThrottleQueue } from "../src/lib/queue.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { indexedDB } from "fake-indexeddb";

vi.stubGlobal("indexedDB", indexedDB);

afterEach(async () => {
  const dbs = await indexedDB.databases();
  await Promise.all(dbs.map((info) => info.name !== undefined && indexedDB.deleteDatabase(info.name)));
});

const quiet = new ThrottleQueue({ baseDelayMs: 1, maxAttempts: 1, minIntervalMs: 0, sleep: async () => undefined });

function seedPost(id: string, withBrief: boolean): Promise<void> {
  return (async () => {
    const db = await openDb(indexedDB);
    await putRecords(db, "posts", [
      { authorHandle: "", authorId: "u", authorName: "", createdAt: 1, id, provenance: "saved", references: { quotedIds: [] }, status: "active", syncedAt: 1, text: "t", url: "u" },
    ]);
    if (withBrief) await putRecords(db, "briefs", [{ createdAt: 1, postId: id, text: "memory" }]);
    db.close();
  })();
}

describe("unsave", () => {
  it("unbookmarks saved posts and keeps the brief", async () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    await seedPost("p1", true);
    const result = await unsavePost("p1", "saved", {
      dbFactory: indexedDB,
      mutate: async (op, vars) => {
        calls.push([op, vars]);
        return {};
      },
      queue: quiet,
    });
    expect(result).toEqual({ memoryKept: true, unbookmarked: true, unliked: false });
    expect(calls).toEqual([[DELETE_BOOKMARK_OPERATION, { tweet_id: "p1" }]]);
    const db = await openDb(indexedDB);
    expect(await getRecord(db, "posts", "p1")).toBeUndefined();
    expect(await getRecord(db, "briefs", "p1")).toBeDefined();
    db.close();
  });

  it("unlikes liked posts without memory", async () => {
    const calls: string[] = [];
    await seedPost("p2", false);
    const result = await unsavePost("p2", "liked", {
      dbFactory: indexedDB,
      mutate: async (op) => {
        calls.push(op);
        return {};
      },
      queue: quiet,
    });
    expect(result).toEqual({ memoryKept: false, unbookmarked: false, unliked: true });
    expect(calls).toEqual([UNLIKE_OPERATION]);
  });

  it("handles both provenance with two mutations", async () => {
    const calls: string[] = [];
    await seedPost("p3", true);
    const result = await unsavePost("p3", "both", {
      dbFactory: indexedDB,
      mutate: async (op) => {
        calls.push(op);
        return {};
      },
      queue: quiet,
    });
    expect(result).toEqual({ memoryKept: true, unbookmarked: true, unliked: true });
    expect(calls).toEqual([DELETE_BOOKMARK_OPERATION, UNLIKE_OPERATION]);
  });

  it("tolerates missing local posts", async () => {
    const result = await unsavePost("ghost", "saved", {
      dbFactory: indexedDB,
      mutate: async () => ({}),
      queue: quiet,
    });
    expect(result.unbookmarked).toBe(true);
  });
});
