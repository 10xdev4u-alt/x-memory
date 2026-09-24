import { listCollections, saveCollection } from "../src/lib/collections.js";
import { deletePublishedCollection, publishCollection } from "../src/lib/hosted-publishing.js";
import { setVisibility } from "../src/lib/visibility.js";
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

const COLLECTION = {
  createdAt: 1,
  id: "c1",
  name: "Canon",
  postIds: [],
  updatedAt: 1,
};

describe("hosted publishing", () => {
  it("checks visibility immediately before publishing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const options = { apiKey: "publisher", fetchImpl: fetchImpl as unknown as typeof fetch };
    expect(await publishCollection(COLLECTION, options)).toBe("private");
    expect(fetchImpl).not.toHaveBeenCalled();

    await setVisibility("collection", "c1", "public");
    expect(await publishCollection(COLLECTION, options)).toBe("published");
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/v1/collections/c1",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("deletes hosted state before removing the local collection", async () => {
    await saveCollection(COLLECTION);
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    expect(await deletePublishedCollection("c1", { apiKey: "publisher", fetchImpl: fetchImpl as unknown as typeof fetch })).toBe(true);
    expect(await listCollections()).toEqual([]);
  });

  it("keeps local state when hosted deletion is forbidden", async () => {
    await saveCollection(COLLECTION);
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 403 }));
    await expect(deletePublishedCollection("c1", { apiKey: "publisher", fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toThrow("delete failed: 403");
    expect(await listCollections()).toHaveLength(1);
  });

  it("removes local state idempotently when hosted object is already gone", async () => {
    await saveCollection(COLLECTION);
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 404 }));
    expect(await deletePublishedCollection("c1", { apiKey: "publisher", fetchImpl: fetchImpl as unknown as typeof fetch })).toBe(false);
    expect(await listCollections()).toEqual([]);
  });
});
