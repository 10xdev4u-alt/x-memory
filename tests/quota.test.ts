import {
  checkQuota,
  DEFAULT_BUDGET,
  estimateInputChars,
  guardSend,
  QuotaExceededError,
  readUsage,
  recordUsage,
} from "../src/lib/quota.js";
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

const T0 = 1000000;
const BUDGET = { maxCalls: 2, maxInputChars: 100, windowMs: 60000 };

describe("quota", () => {
  it("allows everything with no usage", () => {
    expect(checkQuota(BUDGET, undefined, T0)).toMatchObject({ allowed: true, remainingCalls: 2, remainingChars: 100 });
  });

  it("counts down calls and chars", async () => {
    await recordUsage(1, 40, T0, BUDGET.windowMs);
    expect(checkQuota(BUDGET, await readUsage(), T0)).toMatchObject({ allowed: true, remainingCalls: 1, remainingChars: 60 });
    await recordUsage(1, 10, T0, BUDGET.windowMs);
    const status = checkQuota(BUDGET, await readUsage(), T0);
    expect(status.allowed).toBe(false);
    expect(status.resetInMs).toBe(60000);
  });

  it("resets expired windows", async () => {
    await recordUsage(2, 100, T0, BUDGET.windowMs);
    expect(checkQuota(BUDGET, await readUsage(), T0 + 61000).allowed).toBe(true);
    const next = await recordUsage(1, 1, T0 + 61000, BUDGET.windowMs);
    expect(next).toMatchObject({ calls: 1, windowStart: T0 + 61000 });
  });

  it("guards oversized prompts and exhausted budgets", async () => {
    await expect(guardSend("x".repeat(101), BUDGET, T0)).rejects.toBeInstanceOf(QuotaExceededError);
    await expect(guardSend("ok", BUDGET, T0)).resolves.toBeUndefined();
    await recordUsage(2, 0, T0, BUDGET.windowMs);
    await expect(guardSend("ok", BUDGET, T0)).rejects.toThrow(/resumes in/);
  });

  it("estimates input size", () => {
    expect(estimateInputChars("hello")).toBe(5);
    expect(DEFAULT_BUDGET.maxCalls).toBeGreaterThan(0);
  });
});
