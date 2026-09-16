import {
  completeStep,
  isOnboarded,
  nextStep,
  readOnboarding,
  resetOnboarding,
  startOnboarding,
} from "../src/lib/onboarding.js";
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

describe("onboarding", () => {
  it("walks steps in order", async () => {
    expect(nextStep(await readOnboarding())).toBe("session");
    expect(isOnboarded(await readOnboarding())).toBe(false);
    await startOnboarding();
    await completeStep("session");
    expect(nextStep(await readOnboarding())).toBe("sync");
    await completeStep("sync");
    await completeStep("brief");
    await completeStep("paper");
    expect(isOnboarded(await readOnboarding())).toBe(true);
  });

  it("ignores repeat completions", async () => {
    await completeStep("session");
    await completeStep("session");
    expect((await readOnboarding()).done).toEqual(["session"]);
  });

  it("resets cleanly", async () => {
    await completeStep("session");
    await resetOnboarding();
    expect(await readOnboarding()).toEqual({ done: [], started: false });
  });
});
