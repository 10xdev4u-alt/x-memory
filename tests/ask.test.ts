import { askSaves, buildAskPrompt, retrieveContext } from "../src/lib/ask.js";
import type { GrokEvent } from "../src/lib/grok.js";
import { describe, expect, it } from "vitest";

const POSTS = [
  { authorHandle: "kernels", id: "k1", text: "DeepSeek kernel tricks for fast attention" },
  { authorHandle: "evalsguy", id: "e1", text: "Eval harnesses beat vibes every single time" },
];

async function* scripted(text: string): AsyncGenerator<GrokEvent, void, void> {
  yield { fullText: text, type: "done" };
}

describe("ask", () => {
  it("retrieves by token overlap", () => {
    expect(retrieveContext(POSTS, "kernel attention speed", 5).map((post) => post.id)).toEqual(["k1"]);
    expect(retrieveContext(POSTS, "zzz", 5)).toEqual([]);
    expect(retrieveContext(POSTS, "  ", 5)).toEqual([]);
  });

  it("respects the limit", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ authorHandle: "h", id: `p${i}`, text: "kernel notes" }));
    expect(retrieveContext(many, "kernel", 3)).toHaveLength(3);
  });

  it("builds cited prompts", () => {
    const prompt = buildAskPrompt("What about kernels?", [POSTS[0] as (typeof POSTS)[number]]);
    expect(prompt).toContain("[1] @kernels");
    expect(prompt).toContain("Cite sources like [1]");
  });

  it("answers with sources", async () => {
    const seen: string[] = [];
    const result = await askSaves(
      "kernel speed",
      POSTS,
      (message) => {
        seen.push(message.message);
        return scripted("Kernels win [1].");
      },
      "c",
    );
    expect(result).toEqual({ answer: "Kernels win [1].", sources: ["k1"] });
    expect(seen[0]).toContain("Question: kernel speed");
  });
});
