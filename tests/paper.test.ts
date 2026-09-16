import { buildMorningPaper, paperToSpeech, renderPaperMarkdown } from "../src/lib/paper.js";
import { describe, expect, it } from "vitest";

const INPUT = {
  clashes: [{ summary: "scaling debated", topic: "Scaling" }],
  date: "2026-09-16",
  missed: [{ authorLine: "@star", text: "new kernel post" }],
  resolutions: [{ evidence: "shipped", outcome: "TRUE", text: "Grok ships" }],
  reviewsDue: 3,
};

describe("paper", () => {
  it("assembles sections in order", () => {
    const paper = buildMorningPaper(INPUT, 100);
    expect(paper.sections.map((section) => section.heading)).toEqual([
      "Resolved overnight",
      "You missed",
      "Worth your coffee",
      "Due for review",
    ]);
    expect(paper.generatedAt).toBe(100);
  });

  it("writes a quiet edition on calm nights", () => {
    const paper = buildMorningPaper({ clashes: [], date: "d", missed: [], resolutions: [], reviewsDue: 0 }, 1);
    expect(paper.sections).toEqual([
      { heading: "Quiet night", lines: ["Nothing resolved, missed, or due. The river was calm."] },
    ]);
  });

  it("renders forwardable markdown", () => {
    const md = renderPaperMarkdown(buildMorningPaper(INPUT, 1));
    expect(md).toContain("# Morning paper · 2026-09-16");
    expect(md).toContain("## Resolved overnight");
    expect(md).toContain("- TRUE: Grok ships (shipped)");
  });

  it("flattens to speech", () => {
    const speech = paperToSpeech(buildMorningPaper(INPUT, 1));
    expect(speech).toContain("Here is your morning paper");
    expect(speech).toContain("Worth your coffee.");
  });
});
