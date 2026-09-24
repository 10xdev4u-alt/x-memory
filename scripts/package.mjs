import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { packageName } from "../dist/src/lib/release.js";

function main() {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const version = pkg.version;
  const channel = process.argv[2] === "beta" ? "beta" : "stable";
  if (!existsSync("dist/manifest.json")) {
    console.error("dist missing, run the build first");
    process.exit(1);
  }
  mkdirSync("release", { recursive: true });
  const out = `release/${packageName(version, channel)}`;
  const sourceSha = process.env.GITHUB_SHA ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const provenance = {
    version,
    sourceSha,
    buildTime: new Date().toISOString(),
    toolchain: {
      node: process.version,
      npm: execFileSync("npm", ["--version"], { encoding: "utf8" }).trim()
    }
  };
  writeFileSync("dist/provenance.json", `${JSON.stringify(provenance, null, 2)}\n`);
  rmSync(out, { force: true });
  execFileSync("zip", ["-qr", `../${out}`, "."], { cwd: "dist", stdio: "inherit" });
  const hash = createHash("sha256").update(readFileSync(out)).digest("hex");
  writeFileSync("release/SHA256SUMS", `${hash}  ${out.slice("release/".length)}\n`);
  console.log(`packaged ${out}`);
  console.log(`sha256 ${hash}`);
}

if (process.argv[1] !== undefined && process.argv[1].endsWith("package.mjs")) {
  main();
}
