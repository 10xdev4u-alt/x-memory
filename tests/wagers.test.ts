import { calibrationScore, listWagers, placeWager, settleWagers } from "../src/lib/wagers.js";
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

function prediction(id: string, status: "open" | "resolved-true" | "resolved-false" | "expired") {
  return { checkedAt: 1, id, postId: "x", status, text: id };
}

describe("wagers", () => {
  it("places one wager per prediction", async () => {
    await placeWager("p1", "true", 0.8, 100);
    await placeWager("p1", "false", 0.6, 200);
    const wagers = await listWagers();
    expect(wagers).toHaveLength(1);
    expect(wagers[0]).toMatchObject({ predictionId: "p1", stance: "false" });
  });

  it("rejects bad confidence", async () => {
    await expect(placeWager("p", "true", 0, 1)).rejects.toThrow(/confidence/);
    await expect(placeWager("p", "true", 1.5, 1)).rejects.toThrow(/confidence/);
  });

  it("settles against resolved predictions", async () => {
    await placeWager("p1", "true", 0.9, 1);
    await placeWager("p2", "true", 0.9, 1);
    await placeWager("p3", "false", 0.5, 1);
    const settled = await settleWagers(
      [prediction("p1", "resolved-true"), prediction("p2", "resolved-false"), prediction("p3", "open")],
      999,
    );
    expect(settled).toHaveLength(2);
    expect(settled.find((wager) => wager.predictionId === "p1")).toMatchObject({ correct: true, resolvedAt: 999 });
    expect(settled.find((wager) => wager.predictionId === "p2")).toMatchObject({ correct: false });
  });

  it("scores calibration with brier", async () => {
    await placeWager("p1", "true", 1, 1);
    await placeWager("p2", "true", 0.5, 1);
    await settleWagers([prediction("p1", "resolved-true"), prediction("p2", "resolved-false")], 2);
    const score = calibrationScore(await listWagers());
    expect(score?.resolved).toBe(2);
    expect(score?.brier).toBeCloseTo((0 + 0.25) / 2);
    expect(score?.calibration).toBeCloseTo(0.875);
  });

  it("returns undefined without resolutions", async () => {
    await placeWager("p", "true", 0.7, 1);
    expect(calibrationScore(await listWagers())).toBeUndefined();
  });
});
