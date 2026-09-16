import { canPublish, getVisibility, setVisibility, visibilityBadge } from "../src/lib/visibility.js";
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

describe("visibility", () => {
  it("defaults everything to private", async () => {
    expect(await getVisibility("collection", "c1")).toBe("private");
    expect(await canPublish("profile", "u1")).toBe(false);
  });

  it("publishes only after explicit change", async () => {
    await setVisibility("collection", "c1", "public");
    expect(await canPublish("collection", "c1")).toBe(true);
    await setVisibility("collection", "c1", "unlisted");
    expect(await canPublish("collection", "c1")).toBe(true);
    await setVisibility("collection", "c1", "private");
    expect(await canPublish("collection", "c1")).toBe(false);
  });

  it("scopes visibility per object", async () => {
    await setVisibility("collection", "c1", "public");
    expect(await getVisibility("board", "c1")).toBe("private");
    expect(await getVisibility("collection", "c2")).toBe("private");
  });

  it("badges every level", () => {
    expect(visibilityBadge("public")).toEqual({ label: "Public", tone: "green" });
    expect(visibilityBadge("unlisted")).toEqual({ label: "Unlisted", tone: "amber" });
    expect(visibilityBadge("private")).toEqual({ label: "Private", tone: "grey" });
  });
});
