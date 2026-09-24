import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const options = readFileSync("src/options.ts", "utf8");

describe("local wipe UI", () => {
  it("reports failure instead of claiming success", () => {
    expect(options).toContain("Local data wiped.");
    expect(options).toContain("Local data wipe failed:");
    expect(options).toContain(".catch((error: unknown)");
  });
});
