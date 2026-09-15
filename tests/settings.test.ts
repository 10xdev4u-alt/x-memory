import { readSession, readVersions, wipeLocalData, writeSession, writeVersions } from "../src/lib/settings.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
});
