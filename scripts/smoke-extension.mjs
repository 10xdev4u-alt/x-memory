import { chromium } from "playwright-core";
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
let context;

try {
  context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: executable,
    headless: true,
    env: {
      PATH: process.env.PATH ?? "",
      HOME: userDataDir,
      XDG_CONFIG_HOME: userDataDir
    },
    args: [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-extensions-except=" + extensionPath,
      "--load-extension=" + extensionPath
    ]
  });
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/panel.html`, { waitUntil: "domcontentloaded" });
  await page.locator("#zone-nav").waitFor({ state: "attached" });
  if (await page.title() !== "x-memory" || await page.locator("#library").count() !== 1) {
    throw new Error("extension panel did not load correctly");
  }
  console.log("extension panel loaded from unpacked dist");
} finally {
  if (context) await context.close();
  rmSync(userDataDir, { recursive: true, force: true });
}
