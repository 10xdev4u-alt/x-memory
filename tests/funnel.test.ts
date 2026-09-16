import { FUNNEL_STAGES, funnelSummary, measureFunnel } from "../src/lib/funnel.js";
import { describe, expect, it } from "vitest";

const FULL = { briefs: 3, hasPaper: true, posts: 10, reviews: 2, sessionActive: true };

describe("funnel", () => {
  it("orders stages install to weekly", () => {
    expect(FUNNEL_STAGES).toEqual(["install", "session", "sync", "brief", "paper", "weekly"]);
  });

  it("completes full funnels", () => {
    const report = measureFunnel(FULL);
    expect(report.dropOff).toBeUndefined();
    expect(funnelSummary(report)).toContain("complete");
  });

  it("finds the first gap", () => {
    const report = measureFunnel({ ...FULL, briefs: 0 });
    expect(report.dropOff).toBe("brief");
    expect(report.reached).toMatchObject({ brief: false, sync: true });
    expect(funnelSummary(report)).toContain("Drop-off at brief");
  });

  it("starts at session without login", () => {
    const report = measureFunnel({ briefs: 5, hasPaper: true, posts: 5, reviews: 9, sessionActive: false });
    expect(report.dropOff).toBe("session");
  });

  it("gates weekly on repeat reviews", () => {
    expect(measureFunnel({ ...FULL, reviews: 1 }).dropOff).toBe("weekly");
  });
});
