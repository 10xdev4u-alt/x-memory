import {
  addToCollection,
  createCollection,
  deleteCollection,
  forkCollection,
  listCollections,
  removeFromCollection,
} from "../src/lib/collections.js";
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
      },
    },
  });
});

describe("collections", () => {
  it("creates collections with clean ids", async () => {
    const collection = await createCollection("Kernels", "reading path", 100);
    expect(collection.postIds).toEqual([]);
    expect(collection.description).toBe("reading path");
    expect(await listCollections()).toHaveLength(1);
  });

  it("adds without duplicates and removes cleanly", async () => {
    const collection = await createCollection("K", "", 1);
    expect(collection.description).toBeUndefined();
    await addToCollection(collection.id, ["a", "b"], 2);
    await addToCollection(collection.id, ["b", "c"], 3);
    const updated = await addToCollection(collection.id, [], 4);
    expect(updated?.postIds).toEqual(["a", "b", "c"]);
    await removeFromCollection(collection.id, ["b"], 5);
    const after = (await listCollections()).find((entry) => entry.id === collection.id);
    expect(after?.postIds).toEqual(["a", "c"]);
  });

  it("forks with origin lineage and inherited posts", async () => {
    const origin = await createCollection("Canon", "base", 1);
    await addToCollection(origin.id, ["p1"], 2);
    const fork = await forkCollection(origin.id, "My canon", 3);
    expect(fork?.originId).toBe(origin.id);
    expect(fork?.postIds).toEqual(["p1"]);
    expect(fork?.description).toBe("base");
    expect(fork?.id).not.toBe(origin.id);
  });

  it("returns undefined for missing collections", async () => {
    expect(await addToCollection("ghost", ["a"], 1)).toBeUndefined();
    expect(await removeFromCollection("ghost", ["a"], 1)).toBeUndefined();
    expect(await forkCollection("ghost", "x", 1)).toBeUndefined();
  });

  it("deletes collections", async () => {
    const collection = await createCollection("Temp", "", 1);
    await deleteCollection(collection.id);
    expect(await listCollections()).toEqual([]);
  });
});
