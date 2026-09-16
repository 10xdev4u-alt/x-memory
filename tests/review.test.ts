import { dueReviews, enqueueReviews, nextInterval, readStreak, recordReview, touchStreak } from "../src/lib/review.js";
import { getRecord, openDb } from "../src/lib/db.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { indexedDB, IDBKeyRange } from "fake-indexeddb";

vi.stubGlobal("indexedDB", indexedDB);
vi.stubGlobal("IDBKeyRange", IDBKeyRange);

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

const T0 = Date.parse("2026-09-15T00:00:00Z");

describe("review", () => {
  it("climbs the ladder", () => {
    expect(nextInterval(0)).toBe(1);
    expect(nextInterval(1)).toBe(3);
    expect(nextInterval(30)).toBe(30);
  });

  it("enqueues once and lists due", async () => {
    expect(await enqueueReviews(["a", "b"], T0, { dbFactory: indexedDB })).toBe(2);
    expect(await enqueueReviews(["a"], T0, { dbFactory: indexedDB })).toBe(0);
    expect((await dueReviews(T0, { dbFactory: indexedDB })).map((item) => item.postId).sort()).toEqual(["a", "b"]);
  });

  it("advances kept reviews along the ladder", async () => {
    await enqueueReviews(["a"], T0, { dbFactory: indexedDB });
    await recordReview("a", true, T0, { dbFactory: indexedDB });
    expect(await dueReviews(T0, { dbFactory: indexedDB })).toEqual([]);
    const db = await openDb(indexedDB);
    expect(await getRecord(db, "review", "a")).toMatchObject({ intervalDays: 1 });
    db.close();
  });

  it("removes resolved reviews", async () => {
    await enqueueReviews(["a"], T0, { dbFactory: indexedDB });
    await recordReview("a", false, T0, { dbFactory: indexedDB });
    const db = await openDb(indexedDB);
    expect(await getRecord(db, "review", "a")).toBeUndefined();
    db.close();
  });

  it("tracks streaks across days", async () => {
    expect(await touchStreak(T0)).toEqual({ count: 1, lastDay: "2026-09-15" });
    expect(await touchStreak(T0 + 3600_000)).toEqual({ count: 1, lastDay: "2026-09-15" });
    expect(await touchStreak(T0 + 24 * 3600_000)).toEqual({ count: 2, lastDay: "2026-09-16" });
    expect(await touchStreak(T0 + 72 * 3600_000)).toEqual({ count: 1, lastDay: "2026-09-18" });
    expect(await readStreak()).toEqual({ count: 1, lastDay: "2026-09-18" });
  });
});
