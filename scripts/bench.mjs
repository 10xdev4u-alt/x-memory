import { clusterPosts } from "../dist/src/lib/taxonomy.js";
import { SearchIndex } from "../dist/src/lib/search.js";
import { extractTopics } from "../dist/src/lib/entities.js";

const WORDS = "kernel attention eval harness thread model training inference benchmark grok deepseek scaling agent".split(" ");

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

function measure(label, fn) {
  const start = performance.now();
  const result = fn();
  const ms = performance.now() - start;
  console.log(`${label}: ${ms.toFixed(0)}ms`);
  return result;
}

const sizes = [1000, 5000, 20000];
for (const n of sizes) {
  console.log(`--- ${n} posts ---`);
  const posts = makePosts(n);
  const index = new SearchIndex();
  measure("index build", () => index.add(posts.map((p) => ({ ...p, authorName: "", createdAt: 1 }))));
  measure("search x50", () => {
    for (let i = 0; i < 50; i += 1) index.search("kernel attention");
  });
  measure("taxonomy", () => clusterPosts(posts));
  measure("topics x1000", () => {
    for (let i = 0; i < 1000; i += 1) extractTopics(posts[i % posts.length].text);
  });
}
