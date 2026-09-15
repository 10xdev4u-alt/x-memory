import { classifyTheme, readDetectedTheme, readThemeOverride, resolveTheme, writeDetectedTheme, writeThemeOverride } from "../src/lib/theme.js";
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

describe("theme", () => {
  it("classifies x backgrounds", () => {
    expect(classifyTheme("rgb(255, 255, 255)")).toBe("light");
    expect(classifyTheme("rgb(21, 32, 43)")).toBe("dim");
    expect(classifyTheme("rgb(0, 0, 0)")).toBe("dark");
    expect(classifyTheme("nonsense")).toBe("dark");
  });

  it("auto follows detection, override wins", () => {
    expect(resolveTheme("auto", "dim")).toBe("dim");
    expect(resolveTheme("light", "dark")).toBe("light");
  });

  it("round-trips override and detection", async () => {
    expect(await readThemeOverride()).toBe("auto");
    await writeThemeOverride("dim");
    expect(await readThemeOverride()).toBe("dim");
    await writeDetectedTheme("light");
    expect(await readDetectedTheme()).toBe("light");
  });
});
