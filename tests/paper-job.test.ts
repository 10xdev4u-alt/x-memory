import { gatherPaperInput, isPaperDue, markPaperDue, readLatestPaper, runPaperJob } from "../src/lib/paper-job.js";
import { paperToSpeech, renderPaperMarkdown } from "../src/lib/paper.js";
import { openDb, putRecords } from "../src/lib/db.js";
import type { GrokEvent } from "../src/lib/grok.js";
import { ThrottleQueue } from "../src/lib/queue.js";
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
        remove: async (key: string) => {
          store.delete(key);
        },
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

const T0 = 1000000;

function post(id: string, authorId: string, text: string, createdAt: number): Record<string, unknown> {
  return {
    authorHandle: authorId, authorId, authorName: authorId, createdAt, id,
    provenance: "saved", references: { quotedIds: [] }, status: "active",
    syncedAt: 1, text, url: `u${id}`,
  };
}

async function* scripted(text: string): AsyncGenerator<GrokEvent, void, void> {
  yield { fullText: text, type: "done" };
}

const quiet = new ThrottleQueue({ baseDelayMs: 1, maxAttempts: 1, minIntervalMs: 0, sleep: async () => undefined });

describe("paper-job", () => {
  it("gathers resolutions, misses, clashes, and due counts", async () => {
    const db = await openDb(indexedDB);
    await putRecords(db, "authors", [{ handle: "star", id: "s", lastSeen: 1, likeCount: 0, name: "S", saveCount: 5 }]);
    await putRecords(db, "posts", [
      post("k1", "s", "DeepSeek kernel tricks for fast attention #kernels", T0),
      post("k2", "t", "Attention kernel benchmarks continue #kernels", T0),
    ]);
    await putRecords(db, "predictions", [
      {
        checkedAt: T0,
        evidence: "shipped",
        evidenceAt: T0,
        evidenceSource: "https://example.com/source",
        evidenceVerified: false,
        id: "p1",
        postId: "k1",
        status: "resolved-true",
        text: "Grok ships",
      },
    ]);
    await putRecords(db, "review", [{ dueAt: T0 - 1, intervalDays: 1, postId: "k1" }]);
    db.close();
    const input = await gatherPaperInput({
      conversationId: "c",
      dbFactory: indexedDB,
      queue: quiet,
      send: () => scripted("kernels win, evals matter"),
      since: T0 - 100,
    });
    expect(input.resolutions).toHaveLength(1);
    expect(input.resolutions[0]).toMatchObject({
      evidence: "shipped",
      evidenceAt: T0,
      evidenceSource: "https://example.com/source",
      evidenceVerified: false,
    });
    expect(input.missed.map((item) => item.text)).toContain("DeepSeek kernel tricks for fast attention #kernels".slice(0, 200));
    expect(input.clashes).toHaveLength(1);
    expect(input.reviewsDue).toBe(1);
  });

  it("writes quiet editions without network", async () => {
    const input = await gatherPaperInput({ dbFactory: indexedDB, since: T0 });
    expect(input).toEqual({ clashes: [], missed: [], resolutions: [], reviewsDue: 0 });
  });

  it("stores the paper and clears the due flag", async () => {
    await markPaperDue();
    expect(await isPaperDue()).toBe(true);
    const paper = await runPaperJob({
      dbFactory: indexedDB,
      markdown: renderPaperMarkdown,
      since: T0,
      speech: paperToSpeech,
    });
    expect(paper.sections[0]?.heading).toBe("Quiet night");
    expect(await isPaperDue()).toBe(false);
    const stored = await readLatestPaper();
    expect(stored?.markdown).toContain("Quiet night");
    expect(stored?.speech).toContain("morning paper");
  });
});
