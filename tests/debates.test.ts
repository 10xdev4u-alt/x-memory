import { buildJudgePrompt, findContradictionPairs, judgePair, parseJudgeVerdict } from "../src/lib/debates.js";
import type { GrokEvent } from "../src/lib/grok.js";
import { describe, expect, it } from "vitest";

const SCALING_UP = { authorHandle: "bull", id: "u1", text: "Scaling laws hold strong, 10x models every year #scaling" };
const SCALING_DOWN = { authorHandle: "bear", id: "d1", text: "Scaling has plateaued, data walls bite hard #scaling" };
const SAME_AUTHOR = { authorHandle: "bull", id: "u2", text: "More scaling thoughts and surveys #scaling" };
const UNRELATED = { authorHandle: "cook", id: "c1", text: "Sourdough starter ratios for humid kitchens" };

async function* scripted(text: string): AsyncGenerator<GrokEvent, void, void> {
  yield { fullText: text, type: "done" };
}

describe("debates", () => {
  it("pairs cross-author posts sharing a hashtag", () => {
    const pairs = findContradictionPairs([SCALING_UP, SCALING_DOWN, UNRELATED]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ postA: "u1", postB: "d1" });
    expect(pairs[0]?.shared).toContain("#scaling");
  });

  it("skips same-author pairs", () => {
    expect(findContradictionPairs([SCALING_UP, SAME_AUTHOR])).toEqual([]);
  });

  it("requires strong overlap for keyword pairs", () => {
    const a = { authorHandle: "x", id: "a", text: "Kernel attention optimization techniques" };
    const b = { authorHandle: "y", id: "b", text: "Kernel attention optimization methods" };
    expect(findContradictionPairs([a, b])).toHaveLength(1);
    const c = { authorHandle: "x", id: "c", text: "Kernel breakfast recipes" };
    expect(findContradictionPairs([a, c])).toEqual([]);
  });

  it("parses judge verdicts", () => {
    expect(parseJudgeVerdict("DISAGREE: opposite claims")).toEqual({ summary: "opposite claims", verdict: "disagree" });
    expect(parseJudgeVerdict("agree, same direction")).toEqual({ summary: "same direction", verdict: "agree" });
    expect(parseJudgeVerdict("rambling")).toEqual({ summary: "rambling", verdict: "unrelated" });
  });

  it("judges a pair through Grok", async () => {
    const verdict = await judgePair(SCALING_UP, SCALING_DOWN, () => scripted("DISAGREE: scaling debate"), "c");
    expect(verdict).toEqual({ summary: "scaling debate", verdict: "disagree" });
    expect(buildJudgePrompt("a", "b")).toContain("Post one: a");
  });
});
