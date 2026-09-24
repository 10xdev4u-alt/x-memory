import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";

function findExecutable(candidate) {
  if (!candidate) return undefined;
  if (candidate.includes("/") || candidate.includes("\\")) {
    return existsSync(candidate) ? candidate : undefined;
  }
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    const path = join(directory, candidate);
    if (existsSync(path)) return path;
  }
  return undefined;
}

const executable = [
  process.env.CHROMIUM_PATH,
  "chromium",
  "chromium-browser",
  "google-chrome",
  "google-chrome-stable"
].map(findExecutable).find(Boolean);
if (!executable) {
  throw new Error("Chromium is required for the extension smoke test");
}

const extensionPath = resolve("dist");
if (!existsSync(join(extensionPath, "manifest.json"))) {
  throw new Error("extension build missing, run npm run build first");
}

const extensionId = [...createHash("sha256").update(extensionPath).digest("hex").slice(0, 32)]
  .map((nibble) => "abcdefghijklmnop"[Number.parseInt(nibble, 16)])
  .join("");
const userDataDir = mkdtempSync(join(tmpdir(), "x-memory-chromium-"));

try {
  const dom = execFileSync(executable, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions-except=" + extensionPath,
    "--load-extension=" + extensionPath,
    "--user-data-dir=" + userDataDir,
    "--dump-dom",
    `chrome-extension://${extensionId}/src/panel.html`
  ], { encoding: "utf8", timeout: 15000, stdio: ["ignore", "pipe", "pipe"] });
  if (!dom.includes("<title>x-memory</title>") || !dom.includes('id="zone-nav"') || !dom.includes('id="library"')) {
    throw new Error("extension panel did not load correctly");
  }
  console.log("extension panel loaded from unpacked dist");
} catch (error) {
  const output = `${error.stdout ?? ""}\n${error.stderr ?? ""}`.trim();
  throw new Error(`Chromium extension smoke failed${output ? `: ${output}` : ""}`);
} finally {
  rmSync(userDataDir, { recursive: true, force: true });
}
