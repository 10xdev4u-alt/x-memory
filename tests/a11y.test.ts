import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const panel = readFileSync("src/panel.html", "utf8");
const options = readFileSync("src/options.html", "utf8");
const styles = readFileSync("src/styles.css", "utf8");

describe("panel accessibility", () => {
  it("wires tab semantics", () => {
    expect(panel).toContain('role="tablist"');
    expect(panel).toContain('role="tab"');
    expect(panel).toContain('role="tabpanel"');
  });

  it("labels dialogs and status regions", () => {
    expect(panel).toContain('role="dialog"');
    expect(panel).toContain('aria-label="Commands"');
  });

  it("names every button", () => {
    for (const html of [panel, options]) {
      const buttons = html.match(/<button[^>]*>(.*?)<\/button>/g) ?? [];
      expect(buttons.length).toBeGreaterThan(0);
      for (const button of buttons) {
        expect(button.replace(/<[^>]+>/g, "").trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("shows focus and respects reduced motion", () => {
    expect(styles).toContain(":focus-visible");
    expect(styles).toContain("prefers-reduced-motion");
  });
});
