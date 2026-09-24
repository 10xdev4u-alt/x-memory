import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");

describe("CI artifact gate", () => {
  it("runs the complete verification command before publishing", () => {
    expect(workflow).toContain("run: npm run verify");
    expect(workflow).toContain("Record verified artifact hashes");
    expect(workflow).toContain("sha256sum");
    expect(workflow).toContain("artifact-hashes/SHA256SUMS");
  });

  it("uploads the verified extension, server, package, and hash outputs", () => {
    expect(workflow).toContain("name: verified-artifacts");
    expect(workflow).toContain("            dist");
    expect(workflow).toContain("            dist-server");
    expect(workflow).toContain("            release");
    expect(workflow).toContain("            artifact-hashes");
  });
});
