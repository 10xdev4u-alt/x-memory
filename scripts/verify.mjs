import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const verificationSteps = [
  { name: "install", args: ["ci"] },
  { name: "typecheck", args: ["run", "typecheck"] },
  { name: "tests", args: ["run", "test"] },
  { name: "extension build", args: ["run", "build"] },
  { name: "benchmark", args: ["run", "bench"] },
  { name: "server build", args: ["run", "build:server"] },
  { name: "server smoke", args: ["run", "smoke:server"] },
  { name: "extension smoke", args: ["run", "smoke:extension"] },
  { name: "package", args: ["run", "package"] },
  { name: "dependency audit", args: ["audit", "--audit-level=moderate"] }
];

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function runNpm(args) {
  execFileSync(npmCommand, args, { stdio: "inherit" });
}

export function runVerification(execute = runNpm) {
  for (const step of verificationSteps) {
    console.log(`[verify] ${step.name}: ${npmCommand} ${step.args.join(" ")}`);
    execute(step.args);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runVerification();
}
