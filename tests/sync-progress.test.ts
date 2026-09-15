import { clearProgress, planResume, progressSummary, readProgress, writeProgress } from "../src/lib/sync-progress.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("sync-progress", () => {
  it("starts fresh with no progress", () => {
    expect(planResume(undefined, "active")).toEqual({ action: "start" });
  });

  it("resumes from cursor when session is active", async () => {
    await writeProgress({ completed: 40, cursor: "abc", startedAt: 1, total: 100, updatedAt: 2 });
    expect(planResume(await readProgress(), "active")).toEqual({ action: "resume", cursor: "abc" });
  });

  it("waits for auth when session is gone", () => {
    expect(planResume(undefined, "missing")).toMatchObject({ action: "await-auth" });
    expect(planResume({ completed: 5, cursor: "x", startedAt: 1, updatedAt: 2 }, "expired")).toMatchObject({
      action: "await-auth",
    });
  });

  it("clears progress", async () => {
    await writeProgress({ completed: 1, startedAt: 1, updatedAt: 1 });
    await clearProgress();
    expect(await readProgress()).toBeUndefined();
  });

  it("summarizes progress", () => {
    expect(progressSummary(undefined)).toBe("Sync has not started.");
    expect(progressSummary({ completed: 40, startedAt: 1, total: 100, updatedAt: 2 })).toBe("Synced 40 of 100.");
  });
});
