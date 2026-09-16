import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
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
  execFileSync("zip", ["-qr", `../${out}`, "."], { cwd: "dist", stdio: "inherit" });
  console.log(`packaged ${out}`);
}

if (process.argv[1] !== undefined && process.argv[1].endsWith("package.mjs")) {
  main();
}
