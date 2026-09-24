import { describe, expect, it, vi } from "vitest";
import { runVerification, verificationSteps } from "../scripts/verify.mjs";

describe("local verification command", () => {
  it("runs every shipped-surface check in order", () => {
    const execute = vi.fn();

    runVerification(execute);

    expect(verificationSteps.map((step) => step.args)).toEqual([
      ["ci"],
      ["run", "typecheck"],
      ["run", "test"],
      ["run", "build"],
      ["run", "build:server"],
      ["run", "package"],
      ["audit", "--audit-level=moderate"]
    ]);
    expect(execute).toHaveBeenCalledTimes(verificationSteps.length);
  });

  it("stops at the first failed command", () => {
    const execute = vi.fn(() => {
      throw new Error("typecheck failed");
    });

    expect(() => runVerification(execute)).toThrow("typecheck failed");
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
