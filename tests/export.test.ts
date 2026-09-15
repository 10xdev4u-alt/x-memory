import { bundleCorpus, bundleFromJson, bundleToJson, postsToMarkdown } from "../src/lib/export.js";
import { describe, expect, it } from "vitest";

const POST = {
  authorHandle: "kernels",
  authorId: "u1",
  authorName: "K",
  createdAt: 1726358400000,
  id: "p1",
  provenance: "saved" as const,
  references: { quotedIds: [] as string[] },
  status: "active" as const,
  syncedAt: 1,
  text: "DeepSeek kernel tricks",
  url: "https://x.com/i/status/p1",
};

describe("export", () => {
  it("renders markdown with brief and media", () => {
    const md = postsToMarkdown(
      [POST],
      new Map([["p1", "brief text"]]),
      new Map([["p1", [{ id: "m", kind: "link", postId: "p1", url: "https://paper.example" }]]]),
    );
    expect(md).toContain("# x-memory export");
    expect(md).toContain("## @kernels · Saved");
    expect(md).toContain("DeepSeek kernel tricks");
    expect(md).toContain("> brief text");
    expect(md).toContain("- link: https://paper.example");
    expect(md).toContain("- Original: https://x.com/i/status/p1");
  });

  it("omits missing briefs cleanly", () => {
    const md = postsToMarkdown([POST], new Map(), new Map());
    expect(md).not.toContain(">");
  });

  it("round-trips json bundles", () => {
    const bundle = bundleCorpus([POST], [{ createdAt: 1, postId: "p1", text: "b" }], []);
    const parsed = bundleFromJson(bundleToJson(bundle));
    expect(parsed).toEqual({ ...bundle, exportedAt: expect.any(String) });
    expect(parsed.posts).toHaveLength(1);
  });

  it("rejects bad bundles", () => {
    expect(() => bundleFromJson("{}")).toThrow(/unsupported/);
    expect(() => bundleFromJson("nope")).toThrow();
  });
});
