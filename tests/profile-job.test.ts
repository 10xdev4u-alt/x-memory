import { openDb, putRecords, type PostRecord } from "../src/lib/db.js";
import { profileCorpusVersion, scheduleTasteProfile } from "../src/lib/profile-job.js";
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

function post(id: string, text: string): PostRecord {
  return {
    authorHandle: "author",
    authorId: "author",
    authorName: "Author",
    createdAt: 1,
    id,
    provenance: "saved",
    references: { quotedIds: [] },
    status: "active",
    syncedAt: 1,
    text,
    url: `https://example.com/${id}`,
  };
}

const PROFILE = {
  clusters: [],
  collections: [],
  generatedAt: 1,
  minds: [],
  stats: { briefs: 0, loopsOpen: 0, loopsResolved: 0, posts: 1 },
};

describe("profile jobs", () => {
  it("reports progress and caches by account and corpus version", async () => {
    const db = await openDb(indexedDB);
    await putRecords(db, "posts", [post("p1", "short")]);
    db.close();
    let builds = 0;
    const states: string[] = [];
    const build = async ({ posts, onProgress }: { posts?: PostRecord[]; onProgress?: (progress: number) => void }) => {
      builds += 1;
      onProgress?.(50);
      return { ...PROFILE, stats: { ...PROFILE.stats, posts: posts?.length ?? 0 } };
    };

    const first = scheduleTasteProfile({ accountId: "account-a", build, dbFactory: indexedDB, onState: (state) => states.push(state.status) });
    expect(await first.promise).toMatchObject({ stats: { posts: 1 } });
    expect(states).toContain("running");
    expect(states).toContain("ready");

    const second = scheduleTasteProfile({ accountId: "account-a", build, dbFactory: indexedDB });
    expect(await second.promise).toMatchObject({ stats: { posts: 1 } });
    expect(builds).toBe(1);

    const changed = await openDb(indexedDB);
    await putRecords(changed, "posts", [post("p1", "a longer changed corpus")]);
    changed.close();
    const third = scheduleTasteProfile({ accountId: "account-a", build, dbFactory: indexedDB });
    expect(await third.promise).toMatchObject({ stats: { posts: 1 } });
    expect(builds).toBe(2);
  });

  it("cancels an in-flight build without publishing a result", async () => {
    const db = await openDb(indexedDB);
    await putRecords(db, "posts", [post("p1", "short")]);
    db.close();
    const states: string[] = [];
    let started = (): void => undefined;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    const job = scheduleTasteProfile({
      accountId: "account-a",
      build: async ({ signal }) => {
        started();
        return await new Promise((_, reject) => {
          signal?.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")));
        });
      },
      dbFactory: indexedDB,
      onState: (state) => states.push(state.status),
    });

    await startedPromise;
    job.cancel();
    expect(await job.promise).toBeUndefined();
    expect(states).toContain("cancelled");
  });

  it("changes the corpus version when content changes", () => {
    expect(profileCorpusVersion([post("p1", "short")])).not.toBe(profileCorpusVersion([post("p1", "longer")]));
  });
});
