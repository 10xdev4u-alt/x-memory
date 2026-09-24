import { clearProgress, PROGRESS_SCHEMA_VERSION, readProgress } from "../src/lib/sync-progress.js";
import { getRecord } from "../src/lib/db.js";
import { mergeProvenance, storedPostCount, syncBookmarks, syncLikes } from "../src/lib/sync.js";
import { ThrottleQueue } from "../src/lib/queue.js";
import type { TimelineEntry, TimelinePage } from "../src/lib/timeline.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { indexedDB } from "fake-indexeddb";

vi.stubGlobal("indexedDB", indexedDB);

const store = new Map<string, unknown>();
vi.stubGlobal("chrome", {
  storage: {
    local: {
      get: async (key: string) => ({ [key]: store.get(key) }),
      remove: async (key: string) => {
        store.delete(key);
      },
      set: async (entries: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(entries)) store.set(key, value);
      },
    },
  },
});

function tweet(id: string): unknown {
  return {
    content: {
      itemContent: {
        tweet_results: {
          result: {
            core: { user_results: { result: { legacy: { name: "N", screen_name: "h" } } } },
            legacy: { created_at: "Mon Sep 15 00:00:00 +0000 2026", full_text: `post ${id}`, id_str: id, user_id_str: "u" },
          },
        },
      },
    },
    entryId: `tweet-${id}`,
  };
}

function page(ids: string[], cursor?: string): { bookmark_timeline_v2: { timeline: TimelinePage } } {
  const entries = ids.map((id) => tweet(id) as TimelineEntry);
  if (cursor !== undefined) entries.push({ content: { cursorType: "Bottom", value: cursor } });
  return { bookmark_timeline_v2: { timeline: { instructions: [{ entries, type: "TimelineAddEntries" }] } } };
}

beforeEach(() => {
  store.clear();
  store.set("xmem.account.current", "account-a");
});

afterEach(async () => {
  const dbs = await indexedDB.databases();
  await Promise.all(dbs.map((info) => info.name !== undefined && indexedDB.deleteDatabase(info.name)));
});

describe("sync engine", () => {
  it("walks cursors and stores posts", async () => {
    const seen: unknown[] = [];
    const transport = {
      fetchPage: async (_op: string, variables: Record<string, unknown>) => {
        seen.push(variables["cursor"]);
        if (variables["cursor"] === undefined) return { data: page(["1", "2"], "c1") };
        return { data: page(["3"]) };
      },
    };
    const queue = new ThrottleQueue({ baseDelayMs: 1, maxAttempts: 1, minIntervalMs: 0, sleep: async () => undefined });
    const result = await syncBookmarks({ dbFactory: indexedDB, queue, transport });
    expect(result).toEqual({ pages: 2, stored: 3 });
    expect(seen).toEqual([undefined, "c1"]);
    expect(await storedPostCount({ dbFactory: indexedDB })).toBe(3);
    expect(await readProgress({ accountId: "account-a", operation: "Bookmarks", schemaVersion: PROGRESS_SCHEMA_VERSION })).toBeUndefined();
  });

  it("resumes from stored progress", async () => {
    const transport = {
      fetchPage: async (_op: string, variables: Record<string, unknown>) => {
        expect(variables["cursor"]).toBe("c9");
        return { data: page(["7"]) };
      },
    };
    const queue = new ThrottleQueue({ baseDelayMs: 1, maxAttempts: 1, minIntervalMs: 0, sleep: async () => undefined });
    const { writeProgress } = await import("../src/lib/sync-progress.js");
    await writeProgress({ accountId: "account-a", completed: 10, cursor: "c9", operation: "Bookmarks", schemaVersion: PROGRESS_SCHEMA_VERSION, startedAt: 1, updatedAt: Date.now() });
    const progress: number[] = [];
    const result = await syncBookmarks({ dbFactory: indexedDB, onProgress: (n) => progress.push(n), queue, transport });
    expect(result).toEqual({ pages: 1, stored: 1 });
    expect(progress).toEqual([11]);
    await clearProgress({ accountId: "account-a", operation: "Bookmarks", schemaVersion: PROGRESS_SCHEMA_VERSION });
  });

  it("stops at the page cap", async () => {
    const transport = { fetchPage: async () => ({ data: page(["1"], "again") }) };
    const queue = new ThrottleQueue({ baseDelayMs: 1, maxAttempts: 1, minIntervalMs: 0, sleep: async () => undefined });
    const result = await syncBookmarks({ dbFactory: indexedDB, maxPages: 3, queue, transport });
    expect(result.pages).toBe(3);
  });
});

describe("likes sync", () => {
  function likesPage(ids: string[], cursor?: string): unknown {
    const entries = ids.map((id) => tweet(id));
    if (cursor !== undefined) entries.push({ content: { cursorType: "Bottom", value: cursor } });
    return { user: { result: { timeline_v2: { timeline: { instructions: [{ entries, type: "TimelineAddEntries" }] } } } } };
  }

  it("syncs with liked provenance and user variables", async () => {
    const seenOps: string[] = [];
    const seenVars: Record<string, unknown>[] = [];
    const transport = {
      fetchPage: async (op: string, variables: Record<string, unknown>) => {
        seenOps.push(op);
        seenVars.push(variables);
        if (variables["cursor"] === undefined) return { data: likesPage(["l1"], "lc1") };
        return { data: likesPage(["l2"]) };
      },
    };
    const queue = new ThrottleQueue({ baseDelayMs: 1, maxAttempts: 1, minIntervalMs: 0, sleep: async () => undefined });
    const result = await syncLikes({ dbFactory: indexedDB, queue, transport, userId: "u9" });
    expect(result).toEqual({ pages: 2, stored: 2 });
    expect(seenOps).toEqual(["Likes", "Likes"]);
    expect(seenVars[0]).toMatchObject({ count: 20, userId: "u9" });
    expect(seenVars[1]).toMatchObject({ cursor: "lc1", userId: "u9" });
    const db = await (await import("../src/lib/db.js")).openDb(indexedDB);
    expect(await getRecord(db, "posts", "l1")).toMatchObject({ provenance: "liked" });
    db.close();
  });

  it("merges saved then liked provenance", async () => {
    expect(mergeProvenance("saved", "liked")).toBe("both");
    const queue = new ThrottleQueue({ baseDelayMs: 1, maxAttempts: 1, minIntervalMs: 0, sleep: async () => undefined });
    await syncBookmarks({ dbFactory: indexedDB, queue, transport: { fetchPage: async () => ({ data: page(["both-1"]) }) } });
    await syncLikes({ dbFactory: indexedDB, queue, transport: { fetchPage: async () => ({ data: likesPage(["both-1"]) }) }, userId: "u9" });
    const db = await (await import("../src/lib/db.js")).openDb(indexedDB);
    expect(await getRecord(db, "posts", "both-1")).toMatchObject({ provenance: "both" });
    db.close();
  });

  it("merges liked then saved provenance", async () => {
    expect(mergeProvenance("liked", "saved")).toBe("both");
    const queue = new ThrottleQueue({ baseDelayMs: 1, maxAttempts: 1, minIntervalMs: 0, sleep: async () => undefined });
    await syncLikes({ dbFactory: indexedDB, queue, transport: { fetchPage: async () => ({ data: likesPage(["both-2"]) }) }, userId: "u9" });
    await syncBookmarks({ dbFactory: indexedDB, queue, transport: { fetchPage: async () => ({ data: page(["both-2"]) }) } });
    const db = await (await import("../src/lib/db.js")).openDb(indexedDB);
    expect(await getRecord(db, "posts", "both-2")).toMatchObject({ provenance: "both" });
    db.close();
  });
});
