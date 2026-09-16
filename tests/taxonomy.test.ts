import { clusterPosts } from "../src/lib/taxonomy.js";
import { describe, expect, it } from "vitest";

const POSTS = [
  { authorHandle: "kernels", id: "k1", text: "DeepSeek kernel tricks for fast attention #kernels" },
  { authorHandle: "kernels", id: "k2", text: "More attention kernel benchmarks and profiling #kernels" },
  { authorHandle: "evalsguy", id: "e1", text: "Eval harnesses beat vibes every single time" },
  { authorHandle: "evalsguy", id: "e2", text: "How to grade eval harnesses without going mad" },
  { authorHandle: "loner", id: "x1", text: "Sourdough starter ratios for humid kitchens" },
];

describe("taxonomy", () => {
  it("clusters posts sharing strong signals", () => {
    const clusters = clusterPosts(POSTS);
    expect(clusters).toHaveLength(2);
    const kernel = clusters.find((cluster) => cluster.label === "#kernels");
    expect(kernel?.postIds.sort()).toEqual(["k1", "k2"]);
  });

  it("leaves loners unclustered", () => {
    const clusters = clusterPosts(POSTS);
    expect(clusters.flatMap((cluster) => cluster.postIds)).not.toContain("x1");
  });

  it("orders clusters by size", () => {
    const clusters = clusterPosts([
      ...POSTS,
      { authorHandle: "evalsguy", id: "e3", text: "Eval harnesses need fresh prompts weekly" },
    ]);
    expect(clusters[0]?.postIds).toHaveLength(3);
  });

  it("handles empty input", () => {
    expect(clusterPosts([])).toEqual([]);
  });

  it("ignores ultra-common signals instead of mega-clustering", () => {
    const posts = Array.from({ length: 60 }, (_, i) => ({
      authorHandle: `u${i}`,
      id: `p${i}`,
      text: `kernel notes number ${i} filler words here`,
    }));
    const clusters = clusterPosts(posts);
    for (const cluster of clusters) {
      expect(cluster.postIds.length).toBeLessThan(60);
    }
  });
});
