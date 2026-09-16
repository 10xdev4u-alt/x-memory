import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("release", () => {
  it("keeps manifest and package versions in step", () => {
    const manifest = JSON.parse(readFileSync("src/manifest.json", "utf8")) as { version?: string };
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version?: string };
    expect(manifest.version).toBe(pkg.version);
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
