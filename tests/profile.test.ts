import { buildTasteProfile } from "../src/lib/profile.js";
import { openDb, putRecords } from "../src/lib/db.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { indexedDB } from "fake-indexeddb";

vi.stubGlobal("indexedDB", indexedDB);

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

function post(id: string, authorId: string, text: string): Record<string, unknown> {
  return {
    authorHandle: authorId, authorId, authorName: authorId, createdAt: 1, id,
    provenance: "saved", references: { quotedIds: [] }, status: "active",
    syncedAt: 1, text, url: `u${id}`,
  };
}

describe("profile", () => {
  it("assembles clusters, minds, and stats", async () => {
    const db = await openDb(indexedDB);
    await putRecords(db, "authors", [
      { handle: "star", id: "s", lastSeen: 1, likeCount: 1, name: "S", saveCount: 4 },
    ]);
    await putRecords(db, "posts", [
      post("k1", "s", "DeepSeek kernel tricks for fast attention #kernels"),
      post("k2", "s", "More attention kernel benchmarks today #kernels"),
      post("e1", "s", "Eval harnesses beat vibes every time"),
    ]);
    await putRecords(db, "briefs", [{ createdAt: 1, postId: "k1", text: "b" }]);
    db.close();
    const profile = await buildTasteProfile({ dbFactory: indexedDB });
    expect(profile.stats).toMatchObject({ briefs: 1, posts: 3 });
    expect(profile.minds[0]).toMatchObject({ handle: "star" });
    expect(profile.clusters.some((cluster) => cluster.label === "#kernels")).toBe(true);
    expect(profile.generatedAt).toBeGreaterThan(0);
  });

  it("profiles empty corpora without failing", async () => {
    const profile = await buildTasteProfile({ dbFactory: indexedDB });
    expect(profile.stats).toEqual({ briefs: 0, loopsOpen: 0, loopsResolved: 0, posts: 0 });
    expect(profile.minds).toEqual([]);
    expect(profile.clusters).toEqual([]);
  });
});
