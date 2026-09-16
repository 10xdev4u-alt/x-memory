import { optionFor, readModelOptions, routeTask, writeModelOptions } from "../src/lib/modes.js";
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

describe("modes", () => {
  it("routes cheap tasks fast and reasoning tasks deep", () => {
    expect(routeTask("brief")).toBe("fast");
    expect(routeTask("extract")).toBe("fast");
    expect(routeTask("ask")).toBe("fast");
    expect(routeTask("verify")).toBe("think");
    expect(routeTask("judge")).toBe("think");
    expect(routeTask("resolve")).toBe("think");
  });

  it("honors per-request overrides", () => {
    expect(routeTask("brief", "think")).toBe("think");
    expect(routeTask("verify", "fast")).toBe("fast");
  });

  it("round-trips model option ids", async () => {
    expect(await readModelOptions()).toEqual({ fast: "", think: "" });
    await writeModelOptions({ fast: "fast-1", think: "think-1" });
    const options = await readModelOptions();
    expect(optionFor("fast", options)).toBe("fast-1");
    expect(optionFor("think", options)).toBe("think-1");
  });
});
