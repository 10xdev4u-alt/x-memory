import { cpSync, mkdirSync } from "node:fs";

mkdirSync("dist/src", { recursive: true });
cpSync("src/manifest.json", "dist/manifest.json");
cpSync("src/panel.html", "dist/src/panel.html");
console.log("assets copied");
