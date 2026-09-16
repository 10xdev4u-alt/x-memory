import { compareEvals, gradeBrief, runEval } from "../src/lib/eval.js";
import { describe, expect, it } from "vitest";

const GOOD = {
  id: "g1",
  input: "DeepSeek kernel tricks for fast attention layers",
  output: "- Kernel fusion cuts launch overhead\n- Attention layers run twice as fast\n- DeepSeek published benchmarks today",
};

describe("eval", () => {
  it("passes grounded structured briefs", () => {
    const grade = gradeBrief(GOOD);
    expect(grade.passed).toBe(true);
    expect(grade.scores).toEqual({ brevity: 1, grounding: 1, structure: 1 });
  });

  it("fails ungrounded output", () => {
    expect(gradeBrief({ id: "x", input: GOOD.input, output: "- Something\n- Else\n- Entirely" }).passed).toBe(false);
  });

  it("fails unstructured output", () => {
    expect(gradeBrief({ id: "x", input: GOOD.input, output: "DeepSeek kernel attention layers running fast" }).passed).toBe(false);
  });

  it("fails bloated output", () => {
    expect(gradeBrief({ id: "x", input: GOOD.input, output: `${GOOD.output}\n${"padding ".repeat(500)}` }).passed).toBe(false);
  });

  it("reports runs and compares deltas", () => {
    const before = runEval([GOOD]);
    expect(before).toMatchObject({ passed: 1, total: 1 });
    const after = runEval([{ ...GOOD, output: "unrelated prose" }]);
    expect(after.failures).toHaveLength(1);
    expect(compareEvals(before, after)).toEqual({ delta: -1, regressed: true });
    expect(compareEvals(after, before).regressed).toBe(false);
  });
});
