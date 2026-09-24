import { spawn } from "node:child_process";
import { once } from "node:events";
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
const hasPanelDom = (dom) => dom.includes("<title>x-memory</title>") && dom.includes('id="zone-nav"') && dom.includes('id="library"');
const browser = spawn(executable, [
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
], {
  env: {
    PATH: process.env.PATH ?? "",
    HOME: userDataDir,
    XDG_CONFIG_HOME: userDataDir
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let stdout = "";
let stderr = "";
let browserError;
browser.stdout.on("data", (chunk) => {
  stdout += chunk.toString();
});
browser.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});
browser.once("error", (error) => {
  browserError = error;
});

try {
  await new Promise((resolveResult, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolveResult();
    };
    const timeout = setTimeout(() => {
      finish(hasPanelDom(stdout) ? undefined : new Error(`Chromium extension smoke timed out: ${stderr}`));
    }, 15000);
    browser.stdout.on("data", () => {
      if (hasPanelDom(stdout)) finish();
    });
    browser.once("exit", (code, signal) => {
      if (browserError) finish(browserError);
      else if (hasPanelDom(stdout)) finish();
      else finish(new Error(`Chromium extension smoke exited before panel load: code=${code} signal=${signal} stderr=${stderr}`));
    });
  });
  if (!hasPanelDom(stdout)) {
    throw new Error("extension panel did not load correctly");
  }
  console.log("extension panel loaded from unpacked dist");
} finally {
  if (browser.exitCode === null && browser.signalCode === null) {
    browser.kill("SIGTERM");
    await Promise.race([once(browser, "exit"), new Promise((resolveExit) => setTimeout(resolveExit, 2000))]);
    if (browser.exitCode === null && browser.signalCode === null) browser.kill("SIGKILL");
  }
  rmSync(userDataDir, { recursive: true, force: true });
}
