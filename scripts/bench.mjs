import { clusterPosts } from "../dist/src/lib/taxonomy.js";
import { SearchIndex } from "../dist/src/lib/search.js";
import { extractTopics } from "../dist/src/lib/entities.js";

const WORDS = "kernel attention eval harness thread model training inference benchmark grok deepseek scaling agent".split(" ");
const CASES = [
  { index: 1_000, search: 1_000, taxonomy: 2_000 },
  { index: 5_000, search: 5_000, taxonomy: 10_000 },
  { index: 20_000, search: 15_000, taxonomy: 45_000 },
];

function* seededRandom(seed) {
  let state = seed;
  while (true) {
    state = (state * 1103515245 + 12345) % 2147483648;
    yield state / 2147483648;
  }
}

function makePosts(count, seed = 42) {
  const rand = seededRandom(seed);
  const next = () => rand.next().value;
  const posts = [];
  for (let i = 0; i < count; i += 1) {
    const words = [];
    const n = 8 + Math.floor(next() * 12);
    for (let w = 0; w < n; w += 1) words.push(WORDS[Math.floor(next() * WORDS.length)]);
    if (next() < 0.3) words.push(`#topic${Math.floor(next() * 20)}`);
    posts.push({ authorHandle: `user${Math.floor(next() * 200)}`, id: `p${i}`, text: words.join(" ") });
  }
  return posts;
}

function measure(label, fn, limitMs) {
  const start = performance.now();
  const result = fn();
  const ms = performance.now() - start;
  console.log(`${label}: ${ms.toFixed(0)}ms (limit ${limitMs}ms)`);
  if (ms > limitMs) throw new Error(`${label} exceeded ${limitMs}ms at ${ms.toFixed(0)}ms`);
  return result;
}

for (const testCase of CASES) {
  console.log(`--- ${testCase.index} posts ---`);
  const posts = makePosts(testCase.index);
  const index = new SearchIndex();
  measure("index build", () => index.add(posts.map((p) => ({ ...p, authorName: "", createdAt: 1 }))), testCase.index);
  measure("search x50", () => {
    for (let i = 0; i < 50; i += 1) index.search("kernel attention");
  }, testCase.search);
  measure("taxonomy", () => clusterPosts(posts), testCase.taxonomy);
  measure("topics x1000", () => {
    for (let i = 0; i < 1000; i += 1) extractTopics(posts[i % posts.length].text);
  }, 2_000);
}
