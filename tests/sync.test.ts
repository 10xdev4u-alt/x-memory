import { clearProgress, readProgress } from "../src/lib/sync-progress.js";
import { storedPostCount, syncBookmarks } from "../src/lib/sync.js";
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

beforeEach(() => store.clear());

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
    expect(await readProgress()).toBeUndefined();
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
    await writeProgress({ completed: 10, cursor: "c9", startedAt: 1, updatedAt: 1 });
    const progress: number[] = [];
    const result = await syncBookmarks({ dbFactory: indexedDB, onProgress: (n) => progress.push(n), queue, transport });
    expect(result).toEqual({ pages: 1, stored: 1 });
    expect(progress).toEqual([11]);
    await clearProgress();
  });

  it("stops at the page cap", async () => {
    const transport = { fetchPage: async () => ({ data: page(["1"], "again") }) };
    const queue = new ThrottleQueue({ baseDelayMs: 1, maxAttempts: 1, minIntervalMs: 0, sleep: async () => undefined });
    const result = await syncBookmarks({ dbFactory: indexedDB, maxPages: 3, queue, transport });
    expect(result.pages).toBe(3);
  });
});
