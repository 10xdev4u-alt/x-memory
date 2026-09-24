import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function cleanPaths(paths) {
  for (const path of paths) {
    rmSync(path, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  cleanPaths(process.argv.slice(2));
}
