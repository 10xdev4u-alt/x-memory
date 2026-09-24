import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const serverConfig = readFileSync("server/tsconfig.json", "utf8");
const serverReadme = readFileSync("server/README.md", "utf8");
const packageJson = readFileSync("package.json", "utf8");
const verificationScript = readFileSync("scripts/verify.mjs", "utf8");

describe("server entrypoint", () => {
  it("matches the compiler output to the documented start command", () => {
    expect(serverConfig).toContain('"rootDir": "src"');
    expect(serverReadme).toContain("node dist-server/main.js");
    expect(packageJson).toContain('"smoke:server":"node scripts/smoke-server.mjs"');
  });

  it("runs the server smoke check in the local verification sequence", () => {
    expect(verificationScript).toContain('{ name: "server smoke", args: ["run", "smoke:server"] }');
  });
});
