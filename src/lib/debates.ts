import { extractTopics } from "./entities.js";
import { tokenize } from "./search.js";
import { collectBriefText, type GrokSend } from "./briefs.js";
import { ThrottleQueue } from "./queue.js";

const MAX_MODEL_OUTPUT_LENGTH = 20_000;

export interface CandidatePost {
  authorHandle: string;
  id: string;
  text: string;
}

export interface ContradictionPair {
  postA: string;
  postB: string;
  shared: string[];
}

export type Verdict = "agree" | "disagree" | "unrelated";

export interface PairVerdict {
  summary: string;
  verdict: Verdict;
}

function contentSignals(text: string): Set<string> {
  const signals = new Set<string>();
  const topics = extractTopics(text);
  for (const tag of topics.hashtags) signals.add(`#${tag}`);
  for (const token of tokenize(text)) {
    if (token.length >= 5) signals.add(token);
  }
  return signals;
}

export function findContradictionPairs(posts: CandidatePost[]): ContradictionPair[] {
  const signals = new Map(posts.map((post) => [post.id, contentSignals(post.text)]));
  const pairs: ContradictionPair[] = [];
  for (let i = 0; i < posts.length; i += 1) {
    for (let j = i + 1; j < posts.length; j += 1) {
      const a = posts[i];
      const b = posts[j];
      if (a === undefined || b === undefined) continue;
      if (a.authorHandle !== "" && a.authorHandle === b.authorHandle) continue;
      const setA = signals.get(a.id) ?? new Set<string>();
      const setB = signals.get(b.id) ?? new Set<string>();
      const shared = [...setA].filter((signal) => setB.has(signal));
      const strong = shared.some((signal) => signal.startsWith("#")) || shared.length >= 3;
      if (strong) pairs.push({ postA: a.id, postB: b.id, shared: shared.sort() });
    }
  }
  return pairs;
}

export function buildJudgePrompt(a: string, b: string): string {
  return [
    "Two saved posts may disagree. Reply with exactly one word first: AGREE, DISAGREE, or UNRELATED.",
    "Follow with two sentences explaining the relationship.",
    "",
    `Post one: ${a.slice(0, 1000)}`,
    "",
    `Post two: ${b.slice(0, 1000)}`,
  ].join("\n");
}

export function parseJudgeVerdict(reply: string): PairVerdict {
  if (reply.length > MAX_MODEL_OUTPUT_LENGTH) return { summary: "", verdict: "unrelated" };
  const match = /^\s*(AGREE|DISAGREE|UNRELATED)\b[\s:,\-]*(.*)$/is.exec(reply.trim());
  if (match?.[1] === undefined) return { summary: reply.trim().slice(0, 500), verdict: "unrelated" };
  const word = match[1].toLowerCase();
  const verdict: Verdict = word === "agree" ? "agree" : word === "disagree" ? "disagree" : "unrelated";
  return { summary: (match[2] ?? "").trim().slice(0, 500), verdict };
}

export async function judgePair(
  a: CandidatePost,
  b: CandidatePost,
  send: GrokSend,
  conversationId: string,
  queue?: ThrottleQueue,
): Promise<PairVerdict> {
  const runner = queue ?? new ThrottleQueue();
  const reply = await runner.enqueue(() =>
    collectBriefText(send, { conversationId, message: buildJudgePrompt(a.text, b.text) }),
  );
  return parseJudgeVerdict(reply);
}
