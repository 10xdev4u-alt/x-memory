import { parseTimelinePage, type TimelinePage } from "../src/lib/timeline.js";
import { describe, expect, it } from "vitest";

function tweet(id: string, text: string): unknown {
  return {
    content: {
      itemContent: {
        tweet_results: {
          result: {
            core: { user_results: { result: { legacy: { name: "N", screen_name: "h" } } } },
            legacy: { created_at: "Mon Sep 15 00:00:00 +0000 2026", full_text: text, id_str: id, user_id_str: "u1" },
          },
        },
      },
    },
    entryId: `tweet-${id}`,
  };
}

function cursor(value: string): unknown {
  return { content: { cursorType: "Bottom", value }, entryId: "cursor-bottom" };
}

describe("timeline", () => {
  it("parses posts and the bottom cursor", () => {
    const page = { instructions: [{ entries: [tweet("1", "a"), tweet("2", "b"), cursor("c1")], type: "TimelineAddEntries" }] } as TimelinePage;
    const parsed = parseTimelinePage(page);
    expect(parsed.posts.map((post) => post.id)).toEqual(["1", "2"]);
    expect(parsed.cursor).toBe("c1");
    expect(parsed.posts[0]).toMatchObject({ authorHandle: "h", authorId: "u1", text: "a" });
  });

  it("ends pages without a cursor", () => {
    const page = { instructions: [{ entries: [tweet("1", "a")], type: "TimelineAddEntries" }] } as TimelinePage;
    expect(parseTimelinePage(page)).toEqual({
      cursor: undefined,
      posts: [expect.objectContaining({ id: "1" })],
    });
  });

  it("skips entries without tweet payloads", () => {
    const page = { instructions: [{ entries: [{ entryId: "x" }, tweet("1", "a")], type: "x" }] } as TimelinePage;
    expect(parseTimelinePage(page).posts).toHaveLength(1);
  });

  it("handles empty timelines", () => {
    expect(parseTimelinePage({})).toEqual({ cursor: undefined, posts: [] });
  });
});
