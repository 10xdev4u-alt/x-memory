import { extractMedia, extractTextUrls, extractTopics } from "../src/lib/entities.js";
import { describe, expect, it } from "vitest";

describe("entities", () => {
  it("finds urls in text", () => {
    expect(extractTextUrls("see https://a.example/x and https://a.example/x")).toEqual(["https://a.example/x"]);
    expect(extractTextUrls("no links")).toEqual([]);
  });

  it("finds mentions and hashtags", () => {
    expect(extractTopics("cc @Dev and @dev on #AI #ai")).toEqual({ hashtags: ["ai"], mentions: ["dev"] });
    expect(extractTopics("plain")).toEqual({ hashtags: [], mentions: [] });
  });

  it("builds media records from entities first", () => {
    const records = extractMedia("p1", {
      media: [{ media_url_https: "https://img/x.jpg", type: "photo" }, { type: "unknown" }],
      urls: [{ expanded_url: "https://paper.example" }],
    }, "read https://paper.example plus https://extra.example");
    expect(records).toEqual([
      { id: "p1#m0", kind: "image", postId: "p1", url: "https://img/x.jpg" },
      { id: "p1#l1", kind: "link", postId: "p1", url: "https://paper.example" },
      { id: "p1#l2", kind: "link", postId: "p1", url: "https://extra.example" },
    ]);
  });

  it("maps video kinds", () => {
    const records = extractMedia("p1", { media: [{ media_url_https: "u", type: "animated_gif" }] }, "");
    expect(records[0]).toMatchObject({ kind: "video" });
  });

  it("handles missing entities", () => {
    expect(extractMedia("p1", undefined, "")).toEqual([]);
  });
});
