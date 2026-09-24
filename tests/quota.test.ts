import {
  checkQuota,
  createQuotaSend,
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

async function* completed(text: string): AsyncGenerator<{ fullText: string; type: "done" }, void, void> {
  yield { fullText: text, type: "done" };
}

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

  it("guards a production send and records usage after dispatch", async () => {
    let calls = 0;
    const send = createQuotaSend((message) => {
      calls += 1;
      return completed(message.message);
    }, BUDGET, () => T0);
    const events = [];
    for await (const event of send({ conversationId: "c", message: "hello" })) events.push(event);

    expect(calls).toBe(1);
    expect(events).toEqual([{ fullText: "hello", type: "done" }]);
    expect(await readUsage()).toMatchObject({ calls: 1, inputChars: 5, windowStart: T0 });
  });

  it("records usage when a dispatched send fails", async () => {
    const send = createQuotaSend(async function* failing() {
      throw new Error("network");
      yield { fullText: "", type: "done" as const };
    }, BUDGET, () => T0);
    const consume = async () => {
      for await (const _event of send({ conversationId: "c", message: "hello" })) {
        return;
      }
    };

    await expect(consume()).rejects.toThrow("network");
    expect(await readUsage()).toMatchObject({ calls: 1, inputChars: 5 });
  });

  it("serializes concurrent sends so the budget cannot be bypassed", async () => {
    let calls = 0;
    const budget = { maxCalls: 1, maxInputChars: 100, windowMs: 60000 };
    const send = createQuotaSend(() => {
      calls += 1;
      return completed("ok");
    }, budget, () => T0);
    const consume = async () => {
      for await (const _event of send({ conversationId: "c", message: "hello" })) {
        return;
      }
    };

    const results = await Promise.allSettled([consume(), consume()]);
    expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
    expect(calls).toBe(1);
    expect(await readUsage()).toMatchObject({ calls: 1, inputChars: 5 });
  });

  it("estimates input size", () => {
    expect(estimateInputChars("hello")).toBe(5);
    expect(DEFAULT_BUDGET.maxCalls).toBeGreaterThan(0);
  });
});
