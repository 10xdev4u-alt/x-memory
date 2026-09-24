import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
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

const userDataDir = mkdtempSync(join(tmpdir(), "x-memory-chromium-"));
const devtoolsPort = 19222;
const browser = spawn(executable, [
  "--headless=new",
  "--no-sandbox",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-extensions-except=" + extensionPath,
  "--load-extension=" + extensionPath,
  "--remote-debugging-port=" + devtoolsPort,
  "--user-data-dir=" + userDataDir,
  "about:blank"
], { stdio: ["ignore", "pipe", "pipe"] });

let browserError;
browser.once("error", (error) => {
  browserError = error;
});
const browserEndpoint = await (async () => {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (browserError) throw browserError;
    if (browser.exitCode !== null) {
      throw new Error(`Chromium exited before DevTools started with code ${browser.exitCode}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${devtoolsPort}/json/version`);
      if (response.ok) {
        const body = await response.json();
        if (typeof body.webSocketDebuggerUrl === "string") {
          return body.webSocketDebuggerUrl;
        }
      }
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
  }
  throw new Error("Chromium DevTools endpoint did not start within 10 seconds");
})();

const extensionId = [...createHash("sha256").update(extensionPath).digest("hex").slice(0, 32)]
  .map((nibble) => "abcdefghijklmnop"[Number.parseInt(nibble, 16)])
  .join("");

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      const request = this.pending.get(message.id);
      if (request) {
        this.pending.delete(message.id);
        if (message.error) request.reject(new Error(message.error.message));
        else request.resolve(message.result);
      }
    });
  }

  static async connect(endpoint) {
    const socket = new WebSocket(endpoint);
    await once(socket, "open");
    return new CdpClient(socket);
  }

  send(method, params = {}, sessionId) {
    const id = ++this.nextId;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    this.socket.send(JSON.stringify(message));
    return new Promise((resolveResult, reject) => {
      this.pending.set(id, { resolve: resolveResult, reject });
    });
  }
}

const client = await CdpClient.connect(browserEndpoint);
let targetId;
try {
  const extensionOrigin = `chrome-extension://${extensionId}`;
  const panelTarget = await client.send("Target.createTarget", { url: "about:blank" });
  targetId = panelTarget.targetId;
  const attached = await client.send("Target.attachToTarget", { targetId, flatten: true });
  const sessionId = attached.sessionId;
  await client.send("Page.enable", {}, sessionId);
  await client.send("Runtime.enable", {}, sessionId);
  await client.send("Page.navigate", { url: `${extensionOrigin}/src/panel.html` }, sessionId);
  let value;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await client.send("Runtime.evaluate", {
      expression: "({ href: location.href, readyState: document.readyState, title: document.title, hasZoneNav: Boolean(document.querySelector('#zone-nav')), hasLibrary: Boolean(document.querySelector('#library')) })",
      returnByValue: true
    }, sessionId);
    value = result.result.value;
    if (value.href.endsWith("/src/panel.html") && value.readyState === "complete" && value.title === "x-memory" && value.hasZoneNav && value.hasLibrary) break;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  if (value.title !== "x-memory" || !value.hasZoneNav || !value.hasLibrary) {
    throw new Error(`extension panel did not load correctly: ${JSON.stringify(value)}`);
  }
  console.log("extension panel loaded from unpacked dist");
} finally {
  if (targetId) {
    await client.send("Target.closeTarget", { targetId }).catch(() => undefined);
  }
  client.socket.close();
  browser.kill("SIGTERM");
  await Promise.race([once(browser, "exit"), new Promise((resolveExit) => setTimeout(resolveExit, 5000))]);
  rmSync(userDataDir, { recursive: true, force: true });
}
