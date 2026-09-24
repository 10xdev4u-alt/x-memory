import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("landing/index.html", "utf8");
const demo = readFileSync("landing/demo.js", "utf8");
const robots = readFileSync("landing/robots.txt", "utf8");
const sitemap = readFileSync("landing/sitemap.xml", "utf8");

describe("landing", () => {
  it("covers every proof point section", () => {
    for (const id of ["demo", "proof-memory", "proof-session", "proof-paper", "proof-privacy", "install"]) {
      expect(page).toContain(`id="${id}"`);
    }
  });

  it("carries description meta and labelled demo", () => {
    expect(page).toContain('name="description"');
    expect(page).toContain('aria-label="Interactive illustrative demo"');
  });

  it("uses verified local-first claims and labels the install path", () => {
    expect(page).toContain("Your corpus stays on your device until you explicitly share an object.");
    expect(page).toContain("There is no hosted install claim here.");
    expect(page).not.toContain("No login, no keys, no Premium");
    expect(page).not.toContain("Nothing phones home.");
    expect(page).not.toContain("Ask saved posts with source citations");
  });

  it("loads styles and demo script relatively", () => {
    expect(page).toContain('href="styles.css"');
    expect(page).toContain('src="demo.js"');
  });

  it("scripts a five-step illustrative demo with motion respect", () => {
    expect(demo).toContain("demo-play");
    expect(demo).toContain("prefers-reduced-motion");
    expect(demo).toContain("illustrative demo");
    expect(demo).toContain("not a live account flow");
  });

  it("ships crawler files and stays featherweight", () => {
    expect(existsSync("landing/robots.txt")).toBe(true);
    expect(existsSync("landing/sitemap.xml")).toBe(true);
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Allow: /");
    expect(sitemap).toMatch(/<loc>[^<]+<\/loc>/);
    expect(page).toContain('property="og:title"');
    expect(page).toContain('name="twitter:card"');
    expect(page).toContain('name="theme-color"');
    const total = ["index.html", "styles.css", "demo.js"]
      .map((file) => statSync(`landing/${file}`).size)
      .reduce((sum, size) => sum + size, 0);
    expect(total).toBeLessThan(15 * 1024);
  });
});
