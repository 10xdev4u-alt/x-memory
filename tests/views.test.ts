import { defaultViews, deleteView, listViews, matchView, saveView } from "../src/lib/views.js";
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

const POST = {
  authorHandle: "kernels",
  authorId: "u",
  authorName: "K",
  createdAt: 100,
  id: "p1",
  provenance: "saved" as const,
  references: { quotedIds: [] as string[] },
  status: "active" as const,
  syncedAt: 1,
  text: "DeepSeek kernel tricks",
  url: "u",
};

describe("views", () => {
  it("matches text, author, and provenance", () => {
    expect(matchView(POST, { id: "v", name: "v", query: { text: "deepseek tricks" } })).toBe(true);
    expect(matchView(POST, { id: "v", name: "v", query: { text: "missing" } })).toBe(false);
    expect(matchView(POST, { id: "v", name: "v", query: { author: "KERNEL" } })).toBe(true);
    expect(matchView(POST, { id: "v", name: "v", query: { provenance: "liked" } })).toBe(false);
  });

  it("matches dates, media, and clusters", () => {
    expect(matchView(POST, { id: "v", name: "v", query: { after: 50 } })).toBe(true);
    expect(matchView(POST, { id: "v", name: "v", query: { before: 50 } })).toBe(false);
    expect(matchView(POST, { id: "v", name: "v", query: { hasMedia: true } }, { mediaCount: 2 })).toBe(true);
    expect(matchView(POST, { id: "v", name: "v", query: { hasMedia: true } })).toBe(false);
    expect(matchView(POST, { id: "v", name: "v", query: { cluster: "kernels" } }, { clusterIds: ["kernels"] })).toBe(true);
    expect(matchView(POST, { id: "v", name: "v", query: { cluster: "other" } }, { clusterIds: ["kernels"] })).toBe(false);
  });

  it("ships smart defaults", () => {
    expect(defaultViews().map((view) => view.id)).toEqual(["saved", "liked", "media", "week"]);
  });

  it("saves, lists, and deletes views", async () => {
    expect(await listViews()).toHaveLength(4);
    await saveView({ id: "custom", name: "Custom", query: { author: "kernels" } });
    expect(await listViews()).toHaveLength(5);
    await saveView({ id: "custom", name: "Custom2", query: {} });
    expect((await listViews()).filter((view) => view.id === "custom")).toHaveLength(1);
    await deleteView("custom");
    expect(await listViews()).toHaveLength(4);
  });
});
