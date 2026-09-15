import { buildChains } from "../src/lib/threads.js";
import { describe, expect, it } from "vitest";

const NONE = { quotedIds: [] as string[] };

describe("threads", () => {
  it("chains quotes root first", () => {
    const chains = buildChains([
      { createdAt: 2, id: "q2", references: { quotedIds: ["q1"] } },
      { createdAt: 1, id: "q1", references: NONE },
      { createdAt: 3, id: "solo", references: NONE },
    ]);
    expect(chains).toEqual([{ postIds: ["q1", "q2"], rootId: "q1" }]);
  });

  it("follows reply links", () => {
    const chains = buildChains([
      { createdAt: 5, id: "r2", references: { quotedIds: [], replyToId: "r1" } },
      { createdAt: 4, id: "r1", references: NONE },
    ]);
    expect(chains).toEqual([{ postIds: ["r1", "r2"], rootId: "r1" }]);
  });

  it("follows multi-hop references", () => {
    const chains = buildChains([
      { createdAt: 3, id: "c", references: { quotedIds: ["b"] } },
      { createdAt: 2, id: "b", references: { quotedIds: ["a"] } },
      { createdAt: 1, id: "a", references: NONE },
    ]);
    expect(chains).toEqual([{ postIds: ["a", "b", "c"], rootId: "a" }]);
  });

  it("survives reference cycles", () => {
    const chains = buildChains([
      { createdAt: 1, id: "x", references: { quotedIds: ["y"] } },
      { createdAt: 2, id: "y", references: { quotedIds: ["x"] } },
    ]);
    expect(chains).toHaveLength(1);
    expect(chains[0]?.postIds.sort()).toEqual(["x", "y"]);
  });

  it("ignores references outside the corpus", () => {
    expect(buildChains([{ createdAt: 1, id: "a", references: { quotedIds: ["ghost"] } }])).toEqual([]);
  });
});
