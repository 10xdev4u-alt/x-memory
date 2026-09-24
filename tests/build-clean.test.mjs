import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanPaths } from "../scripts/clean.mjs";

describe("build cleanup", () => {
  it("removes stale output directories before a build", () => {
    const root = mkdtempSync(join(tmpdir(), "x-memory-build-"));
    const output = join(root, "dist");
    const staleFile = join(output, "stale-fixture.js");
    mkdirSync(output, { recursive: true });
    writeFileSync(staleFile, "stale");

    try {
      cleanPaths([output]);
      expect(existsSync(staleFile)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("cleans both build outputs and replaces old package archives", () => {
    const packageJson = readFileSync("package.json", "utf8");
    const packageScript = readFileSync("scripts/package.mjs", "utf8");

    expect(packageJson).toContain("node scripts/clean.mjs dist");
    expect(packageJson).toContain("node scripts/clean.mjs dist-server");
    expect(packageScript).toContain("rmSync(out, { force: true })");
  });
});
