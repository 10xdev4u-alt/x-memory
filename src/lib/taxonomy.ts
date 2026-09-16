import { extractTopics } from "./entities.js";
import { tokenize as searchTokenize } from "./search.js";

export interface ClusterInput {
  authorHandle: string;
  id: string;
  text: string;
}

export interface Cluster {
  id: string;
  label: string;
  postIds: string[];
}

void searchTokenize;

const STOPWORDS = new Set(
  "the and for with from that this have are was were will would there their what when where which while about into over after just like more most other some such than then them they through under also get got can has had her his its our out only own same than too very can will just don should now".split(" "),
);

function signalsFor(post: ClusterInput): Set<string> {
  const signals = new Set<string>();
  const topics = extractTopics(post.text);
  for (const tag of topics.hashtags) signals.add(`#${tag}`);
  for (const mention of topics.mentions) signals.add(`@${mention}`);
  if (post.authorHandle !== "") signals.add(`by:${post.authorHandle.toLowerCase()}`);
  for (const token of searchTokenize(post.text)) {
    if (token.length >= 5 && !STOPWORDS.has(token)) signals.add(token);
  }
  return signals;
}

export function clusterPosts(posts: ClusterInput[]): Cluster[] {
  const signals = new Map(posts.map((post) => [post.id, signalsFor(post)]));
  const parent = new Map(posts.map((post) => [post.id, post.id]));
  const find = (id: string): string => {
    const root = parent.get(id) ?? id;
    if (root === id) return id;
    const resolved = find(root);
    parent.set(id, resolved);
    return resolved;
  };
  const union = (a: string, b: string): void => {
    parent.set(find(a), find(b));
  };
  const bySignal = new Map<string, string[]>();
  for (const post of posts) {
    for (const signal of signals.get(post.id) ?? []) {
      const bucket = bySignal.get(signal) ?? [];
      bucket.push(post.id);
      bySignal.set(signal, bucket);
    }
  }
  const candidates = new Set<string>();
  // Signals shared by more than five percent of the corpus carry no
  // clustering value and would explode candidate pairs on dense data.
  const maxBucket = Math.max(50, Math.floor(posts.length * 0.05));
  for (const bucket of bySignal.values()) {
    if (bucket.length < 2 || bucket.length > maxBucket) continue;
    for (let i = 0; i < bucket.length; i += 1) {
      for (let j = i + 1; j < bucket.length; j += 1) {
        const a = bucket[i] as string;
        const b = bucket[j] as string;
        candidates.add(a < b ? `${a} ${b}` : `${b} ${a}`);
      }
    }
  }
  const byId = new Map(posts.map((post) => [post.id, post]));
  for (const pair of candidates) {
    const [aId, bId] = pair.split(" ");
    const a = byId.get(aId ?? "");
    const b = byId.get(bId ?? "");
    if (a === undefined || b === undefined) continue;
    const setA = signals.get(a.id) ?? new Set<string>();
    const setB = signals.get(b.id) ?? new Set<string>();
    let shared = 0;
    const [smaller, larger] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
    for (const signal of smaller) {
      if (!larger.has(signal)) continue;
      shared += signal.startsWith("#") ? 3 : 1;
      if (shared >= 2) {
        union(a.id, b.id);
        break;
      }
    }
  }
  const groups = new Map<string, string[]>();
  for (const post of posts) {
    const root = find(post.id);
    const group = groups.get(root) ?? [];
    group.push(post.id);
    groups.set(root, group);
  }
  const clusters: Cluster[] = [];
  for (const postIds of groups.values()) {
    if (postIds.length < 2) continue;
    const counts = new Map<string, number>();
    for (const id of postIds) {
      for (const signal of signals.get(id) ?? []) {
        counts.set(signal, (counts.get(signal) ?? 0) + 1);
      }
    }
    const label =
      [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "misc";
    clusters.push({ id: label.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase(), label, postIds });
  }
  return clusters.sort((a, b) => b.postIds.length - a.postIds.length);
}
