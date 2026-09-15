import { buildReaderModel, provenanceLabel, snippet } from "../src/lib/reader-model.js";
import { describe, expect, it } from "vitest";

const POST = {
  authorHandle: "kernels",
  authorId: "u1",
  authorName: "Kernel Fan",
  createdAt: 1726358400000,
  id: "p1",
  provenance: "both" as const,
  references: { quotedIds: [] as string[] },
  syncedAt: 1,
  text: "DeepSeek kernel tricks",
  url: "https://x.com/i/status/p1",
};

describe("reader-model", () => {
  it("builds author, time, and provenance lines", () => {
    const model = buildReaderModel(POST, [], undefined);
    expect(model.authorLine).toBe("Kernel Fan (@kernels)");
    expect(model.timeLine).toBe("2024-09-15T00:00:00.000Z");
    expect(model.provenanceLabel).toBe("Saved and liked");
  });

  it("falls back without names", () => {
    const model = buildReaderModel({ ...POST, authorHandle: "", authorName: "" }, [], undefined);
    expect(model.authorLine).toBe("u1");
  });

  it("attaches media and briefs", () => {
    const model = buildReaderModel(POST, [{ id: "m", kind: "image", postId: "p1", url: "u" }], "brief text");
    expect(model.media).toEqual([{ kind: "image", url: "u" }]);
    expect(model.brief).toBe("brief text");
  });

  it("labels every provenance", () => {
    expect(provenanceLabel("saved")).toBe("Saved");
    expect(provenanceLabel("liked")).toBe("Liked");
  });

  it("snippets long text", () => {
    expect(snippet("short")).toBe("short");
    expect(snippet(`a${"b".repeat(200)}`, 10)).toBe("abbbbbbbb…");
  });
});
