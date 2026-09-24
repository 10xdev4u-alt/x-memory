import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { delimiter, extname, join, resolve, sep } from "node:path";

const root = resolve("landing");
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8"
};

function findExecutable(candidate) {
  if (!candidate) return undefined;
  if (candidate.includes("/") || candidate.includes("\\")) return existsSync(candidate) ? candidate : undefined;
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
if (!executable) throw new Error("Chromium is required for the landing smoke test");

const server = createServer(async (request, response) => {
  try {
    const requestPath = new URL(request.url ?? "/", "http://localhost").pathname;
    const relativePath = requestPath === "/" ? "index.html" : decodeURIComponent(requestPath).replace(/^\/+/, "");
    const filePath = resolve(root, relativePath);
    if (filePath !== root && !filePath.startsWith(root + sep)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    const body = await readFile(filePath);
    response.writeHead(200, { "content-type": contentTypes[extname(filePath)] ?? "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});
await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
const address = server.address();
if (address === null || typeof address === "string") throw new Error("landing server did not bind a port");
const baseUrl = `http://127.0.0.1:${address.port}/`;
let browser;

try {
  browser = await chromium.launch({ executablePath: executable, headless: true, args: ["--no-sandbox", "--disable-gpu"] });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  for (const viewport of [
    { name: "mobile", width: 390, height: 844 },
    { name: "tablet", width: 768, height: 900 },
    { name: "desktop", width: 1440, height: 900 }
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    const result = await page.evaluate(() => ({
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "",
      theme: document.querySelector('meta[name="theme-color"]')?.getAttribute("content") ?? "",
      language: document.documentElement.lang,
      sections: document.querySelectorAll("main > section").length,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      focusable: [...document.querySelectorAll("a, button")].every((element) => (element.textContent ?? "").trim() !== "" || element.getAttribute("aria-label") !== null),
      skipLink: document.querySelector(".skip-link")?.getAttribute("href") === "#main-content"
    }));
    if (result.title === "" || result.description === "" || result.theme === "" || result.language !== "en" || result.sections !== 6) {
      throw new Error(`${viewport.name} metadata or landmark check failed`);
    }
    if (result.overflow || !result.focusable || !result.skipLink) {
      throw new Error(`${viewport.name} layout or keyboard check failed`);
    }
  }

  const robots = await page.request.get(`${baseUrl}robots.txt`);
  const sitemap = await page.request.get(`${baseUrl}sitemap.xml`);
  const robotsText = await robots.text();
  const sitemapText = await sitemap.text();
  if (robots.status() !== 200 || !robotsText.includes("User-agent: *") || !robotsText.includes("Allow: /")) {
    throw new Error("robots.txt is not valid");
  }
  if (sitemap.status() !== 200 || !sitemapText.startsWith("<?xml") || !/<loc>[^<]+<\/loc>/.test(sitemapText)) {
    throw new Error("sitemap.xml is not valid");
  }

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator("#demo-play").focus();
  await page.keyboard.press("Enter");
  const reducedMotion = await page.evaluate(() => ({
    status: document.querySelector("#demo-status")?.textContent ?? "",
    done: document.querySelectorAll("#demo-steps li.done").length,
    enabled: !(document.querySelector("#demo-play") instanceof HTMLButtonElement && document.querySelector("#demo-play").disabled)
  }));
  if (reducedMotion.status !== "Demo complete. No motion used." || reducedMotion.done !== 5 || !reducedMotion.enabled) {
    throw new Error("reduced-motion demo behavior failed");
  }

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator("#demo-play").focus();
  await page.keyboard.press("Enter");
  const running = await page.locator("#demo-status").textContent();
  if (running !== "Demo running.") throw new Error("keyboard demo activation failed");
  await page.waitForTimeout(6500);
  const completed = await page.evaluate(() => ({
    status: document.querySelector("#demo-status")?.textContent ?? "",
    done: document.querySelectorAll("#demo-steps li.done").length
  }));
  if (completed.status !== "Demo complete. This was an illustrative sample." || completed.done !== 5) {
    throw new Error("timed demo behavior failed");
  }
  if (pageErrors.length > 0) throw new Error(`landing page errors: ${pageErrors.join("; ")}`);
  console.log("landing responsive, metadata, keyboard, and motion checks passed");
} finally {
  if (browser !== undefined) await browser.close();
  await new Promise((resolveServer) => server.close(resolveServer));
}
