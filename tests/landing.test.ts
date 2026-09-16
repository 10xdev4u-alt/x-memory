import { readFileSync } from "node:fs";
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
});
