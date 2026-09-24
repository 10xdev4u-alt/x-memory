import { readSession, readVersions, wipeLocalData, writeSession, writeVersions } from "../src/lib/settings.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, unknown>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async (key?: string) => key === undefined ? Object.fromEntries(store) : ({ [key]: store.get(key) }),
        set: async (entries: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(entries)) store.set(key, value);
        },
        clear: async () => store.clear(),
      },
    },
  });
  vi.stubGlobal("indexedDB", { databases: async () => [], deleteDatabase: () => undefined });
});

describe("settings", () => {
  it("returns unknown session before any check", async () => {
    expect(await readSession()).toEqual({ checkedAt: 0, state: "unknown" });
  });

  it("round-trips session snapshots", async () => {
    await writeSession({ checkedAt: 7, state: "active" });
    expect(await readSession()).toEqual({ checkedAt: 7, state: "active" });
  });

  it("round-trips version snapshots", async () => {
    await writeVersions({ checkedAt: 9, extension: "0.1.0", operations: "abc" });
    expect(await readVersions()).toEqual({ checkedAt: 9, extension: "0.1.0", operations: "abc" });
  });

  it("wipes storage", async () => {
    await writeSession({ checkedAt: 1, state: "active" });
    await wipeLocalData();
    expect(await readSession()).toEqual({ checkedAt: 0, state: "unknown" });
  });

  it("reports blocked database deletion without clearing storage", async () => {
    const request: { onblocked?: () => void } = {};
    vi.stubGlobal("indexedDB", {
      databases: async () => [{ name: "x-memory-account" }],
      deleteDatabase: () => {
        queueMicrotask(() => request.onblocked?.());
        return request;
      }
    });
    await writeSession({ checkedAt: 1, state: "active" });

    await expect(wipeLocalData()).rejects.toThrow(/deletion blocked/);
    expect(await readSession()).toMatchObject({ state: "active" });
  });

  it("verifies database and storage removal", async () => {
    let databaseChecks = 0;
    vi.stubGlobal("indexedDB", {
      databases: async () => {
        databaseChecks += 1;
        return databaseChecks === 1 ? [{ name: "x-memory-account" }] : [];
      },
      deleteDatabase: () => {
        const request: { onsuccess?: () => void } = {};
        queueMicrotask(() => request.onsuccess?.());
        return request;
      }
    });
    await writeSession({ checkedAt: 1, state: "active" });

    await wipeLocalData();
    expect(databaseChecks).toBe(2);
    expect(await readSession()).toEqual({ checkedAt: 0, state: "unknown" });
  });
});
