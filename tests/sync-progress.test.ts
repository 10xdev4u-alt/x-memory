import {
  clearProgress,
  planResume,
  progressSummary,
  PROGRESS_MAX_AGE_MS,
  PROGRESS_SCHEMA_VERSION,
  readProgress,
  writeProgress,
  type SyncProgressIdentity,
} from "../src/lib/sync-progress.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, unknown>();
const identity = (operation: string): SyncProgressIdentity => ({ accountId: "account-a", operation, schemaVersion: PROGRESS_SCHEMA_VERSION });

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

describe("sync-progress", () => {
  it("starts fresh with no progress", () => {
    expect(planResume(undefined, "active")).toEqual({ action: "start" });
  });

  it("resumes from cursor when session is active", async () => {
    await writeProgress({ ...identity("Bookmarks"), completed: 40, cursor: "abc", startedAt: Date.now(), total: 100, updatedAt: Date.now() });
    expect(planResume(await readProgress(identity("Bookmarks")), "active")).toEqual({ action: "resume", cursor: "abc" });
  });

  it("waits for auth when session is gone", () => {
    expect(planResume(undefined, "missing")).toMatchObject({ action: "await-auth" });
    expect(planResume({ ...identity("Bookmarks"), completed: 5, cursor: "x", startedAt: 1, updatedAt: 2 }, "expired")).toMatchObject({
      action: "await-auth",
    });
  });

  it("isolates progress by account and operation", async () => {
    await writeProgress({ ...identity("Bookmarks"), completed: 1, cursor: "bookmark", startedAt: 1, updatedAt: Date.now() });
    expect(await readProgress(identity("Likes"))).toBeUndefined();
    await writeProgress({ ...identity("Likes"), completed: 2, cursor: "like", startedAt: 1, updatedAt: Date.now() });
    expect((await readProgress(identity("Bookmarks")))?.cursor).toBe("bookmark");
    expect((await readProgress(identity("Likes")))?.cursor).toBe("like");
  });

  it("expires stale progress safely", async () => {
    await writeProgress({ ...identity("Bookmarks"), completed: 1, startedAt: 1, updatedAt: Date.now() - PROGRESS_MAX_AGE_MS - 1 });
    expect(await readProgress(identity("Bookmarks"))).toBeUndefined();
  });

  it("clears only the requested progress identity", async () => {
    await writeProgress({ ...identity("Bookmarks"), completed: 1, startedAt: 1, updatedAt: Date.now() });
    await writeProgress({ ...identity("Likes"), completed: 2, startedAt: 1, updatedAt: Date.now() });
    await clearProgress(identity("Bookmarks"));
    expect(await readProgress(identity("Bookmarks"))).toBeUndefined();
    expect(await readProgress(identity("Likes"))).toBeDefined();
  });

  it("summarizes progress", () => {
    expect(progressSummary(undefined)).toBe("Sync has not started.");
    expect(progressSummary({ ...identity("Bookmarks"), completed: 40, startedAt: 1, total: 100, updatedAt: 2 })).toBe("Synced 40 of 100.");
  });
});
