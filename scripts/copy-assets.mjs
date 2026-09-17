import { cpSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

mkdirSync("dist/src", { recursive: true });
cpSync("src/manifest.json", "dist/manifest.json");
cpSync("src/panel.html", "dist/src/panel.html");
cpSync("src/styles.css", "dist/src/styles.css");
cpSync("src/options.html", "dist/src/options.html");
// Manifest content scripts load as classic scripts, so bare imports die on
// arrival. Bundle this one entry to a self-contained file. Background and
// panel stay modular: the worker declares type module, the panel uses one.
execFileSync("npx", ["esbuild", "src/content/x-session.ts", "--bundle", "--format=iife", "--outfile=dist/src/content/x-session.js", "--log-level=error"], { stdio: "inherit" });
console.log("assets copied");
