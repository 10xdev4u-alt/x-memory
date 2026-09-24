import { postsToNotionCsv, postsToObsidian } from "../src/lib/notion-obsidian.js";
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
  text: 'Deep "kernel" tricks',
  url: "https://x.com/i/status/p1",
};

describe("notion-obsidian", () => {
  it("renders notion csv with escaped cells", () => {
    const csv = postsToNotionCsv([POST], new Map([["p1", "brief"]]));
    const lines = csv.split("\n");
    expect(lines[0]).toBe('"Title","Author","URL","Date","Provenance","Brief"');
    expect(lines[1]).toContain('"Deep ""kernel"" tricks"');
    expect(lines[1]).toContain('"\'@kernels"');
    expect(lines[1]).toContain('"2024-09-15"');
  });

  it("neutralizes formula prefixes in every required variant", () => {
    const values = ["=HYPERLINK(\"https://bad\")", "+1", "-1", "@SUM(1)", "\t=1", "\t+1", "\t-1", "\t@1", "＝1", "＋1", "－1", "＠1"];
    const posts = values.map((text, index) => ({ ...POST, id: `p${index}`, text }));
    const csv = postsToNotionCsv(posts, new Map());
    for (const value of values) {
      const title = value.replace(/\s+/g, " ").trim().slice(0, 100);
      expect(csv).toContain(`"'${title.replace(/"/g, '""')}"`);
    }
  });

  it("handles missing briefs in csv", () => {
    const csv = postsToNotionCsv([{ ...POST, authorHandle: "" }], new Map());
    expect(csv).toContain('"u1"');
    expect(csv.split("\n")[1]?.endsWith('""')).toBe(true);
  });

  it("renders obsidian notes with frontmatter and index", () => {
    const md = postsToObsidian(
      [POST],
      new Map([["p1", "brief text"]]),
      new Map([["p1", [{ id: "m", kind: "link", postId: "p1", url: "https://paper.example" }]]]),
    );
    expect(md).toContain('id: "p1"');
    expect(md).toContain('author: "@kernels"');
    expect(md).toContain("> brief text");
    expect(md).toContain("- [link](https://paper.example)");
    expect(md).toContain("[[x-memory-index]]");
    expect(md).toContain("# x-memory index");
  });

  it("escapes frontmatter and link syntax in documents", () => {
    const post = { ...POST, id: "p]|x", url: "https://x.com/a(b)" };
    const md = postsToObsidian(
      [post],
      new Map(),
      new Map([[post.id, [{ id: "m", kind: "link", postId: post.id, url: post.url }]]]),
    );
    expect(md).toContain('id: "p]|x"');
    expect(md).toContain('url: "https://x.com/a(b)"');
    expect(md).toContain("- [link](https://x.com/a\\(b\\))");
    expect(md).toContain("[[p\\]\\|x]]");
  });
});
