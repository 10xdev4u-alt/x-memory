import { ThrottleQueue } from "../src/lib/queue.js";
import { SessionError } from "../src/lib/session-client.js";
import { describe, expect, it } from "vitest";

function harness() {
  let clock = 0;
  const slept: number[] = [];
  const queue = new ThrottleQueue({
    baseDelayMs: 100,
    maxAttempts: 3,
    minIntervalMs: 50,
    now: () => clock,
    sleep: async (ms: number) => {
      slept.push(ms);
      clock += ms;
    },
  });
  return { queue, slept };
}

describe("throttle-queue", () => {
  it("spaces task starts by the minimum interval", async () => {
    const { queue, slept } = harness();
    const starts: number[] = [];
    await Promise.all([
      queue.enqueue(async () => {
        starts.push(1);
        return 1;
      }),
      queue.enqueue(async () => {
        starts.push(2);
        return 2;
      }),
    ]);
    expect(starts).toEqual([1, 2]);
    expect(slept.reduce((sum, ms) => sum + ms, 0)).toBeGreaterThanOrEqual(50);
  });

  it("retries rate limits with backoff then succeeds", async () => {
    const { queue, slept } = harness();
    let calls = 0;
    const result = await queue.enqueue(async () => {
      calls += 1;
      if (calls < 3) throw new SessionError("rate-limited", 429, "slow down");
      return "ok";
    });
    expect(result).toBe("ok");
    expect(slept).toContain(100);
    expect(slept).toContain(200);
  });

  it("fails fast on expired sessions", async () => {
    const { queue } = harness();
    let calls = 0;
    await expect(
      queue.enqueue(async () => {
        calls += 1;
        throw new SessionError("expired", 401, "gone");
      }),
    ).rejects.toMatchObject({ kind: "expired" });
    expect(calls).toBe(1);
  });

  it("gives up after max attempts", async () => {
    const { queue } = harness();
    let calls = 0;
    await expect(
      queue.enqueue(async () => {
        calls += 1;
        throw new SessionError("server", 500, "down");
      }),
    ).rejects.toMatchObject({ kind: "server" });
    expect(calls).toBe(3);
  });

  it("tracks pending counts", async () => {
    const { queue } = harness();
    expect(queue.stats().pending).toBe(0);
    const pending = queue.enqueue(async () => "done");
    expect(queue.stats().pending).toBe(1);
    await pending;
    expect(queue.stats().pending).toBe(0);
  });
});
