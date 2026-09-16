import { clearOperations, resolveOperation } from "../src/lib/op-registry.js";
import { extractDescriptors, healOperations, loadOps, saveOps, scanBearer, type ChunkRegistry } from "../src/lib/healer.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, unknown>();

beforeEach(() => {
  store.clear();
  clearOperations();
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

function registryWithSources(sources: string[]): ChunkRegistry {
  const modules: Record<string, unknown> = {};
  for (const [index, source] of sources.entries()) {
    modules[String(index)] = `prefix ${source} suffix`;
  }
  return [[[], modules]];
}

const BOOKMARKS_DESCRIPTOR = `{queryId:"qid-bookmarks-1",operationName:"Bookmarks",operationType:"query"}`;
const GROK_DESCRIPTOR = `{queryId:"qid-grok-1",operationName:"CreateGrokConversation",operationType:"mutation"}`;

describe("healer", () => {
  it("extracts descriptors from chunk sources", () => {
    const found = extractDescriptors(registryWithSources([BOOKMARKS_DESCRIPTOR, GROK_DESCRIPTOR]));
    expect(found).toHaveLength(2);
    expect(found.find((item) => item.operationName === "Bookmarks")).toMatchObject({
      kind: "query",
      queryId: "qid-bookmarks-1",
    });
  });

  it("dedupes repeat descriptors keeping the last", () => {
    const found = extractDescriptors(
      registryWithSources([
        `{queryId:"old",operationName:"Bookmarks",operationType:"query"}`,
        `{queryId:"new",operationName:"Bookmarks",operationType:"query"}`,
      ]),
    );
    expect(found).toEqual([{ kind: "query", operationName: "Bookmarks", queryId: "new" }]);
  });

  it("heals wanted operations into the registry", () => {
    const report = healOperations(registryWithSources([BOOKMARKS_DESCRIPTOR]), ["Bookmarks", "Missing"]);
    expect(report).toEqual({ failed: ["Missing"], healed: ["Bookmarks"] });
    expect(resolveOperation("Bookmarks")?.queryId).toBe("qid-bookmarks-1");
  });

  it("ignores non-module chunks safely", () => {
    expect(extractDescriptors([[null, null] as unknown as [unknown, Record<string, unknown>]])).toEqual([]);
  });

  it("scans bearer tokens from sources", () => {
    expect(scanBearer(["nothing here"])).toBeUndefined();
    const token = `prefix AAAAAAAAA${"x".repeat(45)} suffix`;
    expect(scanBearer([token])).toBe(`AAAAAAAAA${"x".repeat(45)}`);
  });

  it("saves and loads operations across restarts", async () => {
    await saveOps([{ kind: "query", operationName: "Bookmarks", queryId: "q1" }]);
    clearOperations();
    const loaded = await loadOps(["Bookmarks", "Missing"]);
    expect(loaded).toHaveLength(1);
    expect(resolveOperation("Bookmarks")?.queryId).toBe("q1");
    expect(await loadOps(["Bookmarks"])).toHaveLength(1);
  });
});
