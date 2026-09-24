import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const decision = readFileSync("docs/X_ACCESS.md", "utf8");
const permissions = readFileSync("docs/PERMISSIONS.md", "utf8");

describe("X access boundary", () => {
  it("compares all supported boundary options", () => {
    expect(decision).toContain("Official X API");
    expect(decision).toContain("User-authorized browser session");
    expect(decision).toContain("Private interface");
    expect(decision).toContain("Rejected");
  });

  it("blocks private fallback and records consequences", () => {
    expect(decision).toContain("must not silently fall back");
    expect(decision).toContain("dependent R3 implementation is blocked");
    expect(decision).toContain("User-visible limitation");
    expect(permissions).toContain("Private GraphQL operation discovery is blocked from release");
  });
});
