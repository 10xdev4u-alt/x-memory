import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("landing/index.html", "utf8");
const demo = readFileSync("landing/demo.js", "utf8");

describe("landing", () => {
  it("covers every proof point section", () => {
    for (const id of ["demo", "proof-memory", "proof-session", "proof-paper", "proof-privacy", "install"]) {
      expect(page).toContain(`id="${id}"`);
    }
  });

  it("carries description meta and labelled demo", () => {
    expect(page).toContain('name="description"');
    expect(page).toContain('aria-label="Interactive demo"');
  });

  it("loads styles and demo script relatively", () => {
    expect(page).toContain('href="styles.css"');
    expect(page).toContain('src="demo.js"');
  });

  it("scripts a five-step demo with motion respect", () => {
    expect(demo).toContain("demo-play");
    expect(demo).toContain("prefers-reduced-motion");
    expect(demo.match(/Sync pulls|Briefs land|prediction resolves|Morning Paper|Playback/)?.length).toBeGreaterThan(0);
  });

  it("ships crawler files and stays featherweight", () => {
    expect(existsSync("landing/robots.txt")).toBe(true);
    expect(existsSync("landing/sitemap.xml")).toBe(true);
    expect(page).toContain('property="og:title"');
    expect(page).toContain('name="twitter:card"');
    expect(page).toContain('name="theme-color"');
    const total = ["index.html", "styles.css", "demo.js"]
      .map((file) => statSync(`landing/${file}`).size)
      .reduce((sum, size) => sum + size, 0);
    expect(total).toBeLessThan(15 * 1024);
  });
});
