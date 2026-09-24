import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const checklist = readFileSync("docs/RELEASE-CHECKLIST.md", "utf8");
const releaseGuide = readFileSync("docs/RELEASE.md", "utf8");
const evidenceScript = readFileSync("scripts/release-evidence.mjs", "utf8");
const gitignore = readFileSync(".gitignore", "utf8");

describe("release evidence", () => {
  it("records provenance, checks, permissions, privacy, and manual flows", () => {
    for (const required of ["Source SHA", "Automated checks", "Artifact", "Permissions", "Privacy", "Manual flows", "Open blockers"]) {
      expect(checklist).toContain(required);
    }
    expect(evidenceScript).toContain("release/evidence.json");
    expect(evidenceScript).toContain("release/evidence.md");
    expect(evidenceScript).toContain("src/manifest.json");
    expect(evidenceScript).toContain("docs/PRIVACY.md");
    expect(evidenceScript).toContain("manualFlows");
  });

  it("keeps the evidence command and dry-run gate explicit", () => {
    expect(evidenceScript).toContain("--verified");
    expect(evidenceScript).toContain("decision: \"blocked\"");
    expect(evidenceScript).toContain("Full release blocked");
    expect(releaseGuide).toContain("docs/RELEASE-CHECKLIST.md");
    expect(releaseGuide).toContain("npm run release:evidence");
  });

  it("keeps the evidence output out of version control", () => {
    expect(gitignore).toContain("release/");
  });
});
