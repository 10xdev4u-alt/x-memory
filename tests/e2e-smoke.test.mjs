import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const packageJson = readFileSync("package.json", "utf8");
const verificationScript = readFileSync("scripts/verify.mjs", "utf8");
const extensionSmoke = readFileSync("scripts/smoke-extension.mjs", "utf8");
const serverSmoke = readFileSync("scripts/smoke-server.mjs", "utf8");

describe("runtime smoke coverage", () => {
  it("wires both runtime smokes into local verification", () => {
    expect(packageJson).toContain('"smoke:extension":"node scripts/smoke-extension.mjs"');
    expect(packageJson).toContain('"smoke:server":"node scripts/smoke-server.mjs"');
    expect(verificationScript).toContain('{ name: "extension smoke", args: ["run", "smoke:extension"] }');
    expect(verificationScript).toContain('{ name: "server smoke", args: ["run", "smoke:server"] }');
  });

  it("covers the unpacked panel and server health boundary", () => {
    expect(extensionSmoke).toContain("--load-extension=");
    expect(extensionSmoke).toContain("Target.createTarget");
    expect(extensionSmoke).toContain("hasZoneNav");
    expect(serverSmoke).toContain("/health");
    expect(serverSmoke).toContain("body.ok !== true");
  });
});
