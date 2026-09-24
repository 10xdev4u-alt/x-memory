import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const packageScript = readFileSync("scripts/package.mjs", "utf8");
const releaseGuide = readFileSync("docs/RELEASE.md", "utf8");

describe("release provenance", () => {
  it("records source, toolchain, build time, and artifact hash", () => {
    expect(packageScript).toContain("GITHUB_SHA");
    expect(packageScript).toContain("provenance.json");
    expect(packageScript).toContain("buildTime");
    expect(packageScript).toContain("toolchain");
    expect(packageScript).toContain("createHash(\"sha256\")");
    expect(packageScript).toContain("SHA256SUMS");
  });

  it("documents the archive and hash handoff", () => {
    expect(releaseGuide).toContain("provenance.json");
    expect(releaseGuide).toContain("release/SHA256SUMS");
    expect(releaseGuide).toContain("npm run verify");
  });
});
