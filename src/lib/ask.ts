import { tokenize } from "./search.js";
import { collectBriefText, type GrokSend } from "./briefs.js";

export interface AskablePost {
  authorHandle: string;
  id: string;
  text: string;
}

export interface AskAnswer {
  answer: string;
  sources: string[];
}

export function retrieveContext(posts: AskablePost[], question: string, limit: number): AskablePost[] {
  const query = new Set(tokenize(question));
  if (query.size === 0) return [];
  const scored = posts.map((post) => {
    let score = 0;
    for (const token of new Set(tokenize(`${post.text} ${post.authorHandle}`))) {
      if (query.has(token)) score += 1;
    }
    return { post, score };
  });
  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.post);
}

export function buildAskPrompt(question: string, context: AskablePost[]): string {
  const sources = context
    .map((post, index) => `[${index + 1}] @${post.authorHandle !== "" ? post.authorHandle : "?"}: ${post.text.slice(0, 800)}`)
    .join("\n\n");
  return [
    "Answer using only the numbered saved posts below. Cite sources like [1] and [2].",
    "Say plainly when the saves do not contain the answer.",
    "",
    `Question: ${question}`,
    "",
    "Saved posts:",
    sources === "" ? "(none)" : sources,
  ].join("\n");
}

export async function askSaves(
  question: string,
  posts: AskablePost[],
  send: GrokSend,
  conversationId: string,
  limit = 5,
): Promise<AskAnswer> {
  const context = retrieveContext(posts, question, limit);
  const answer = await collectBriefText(send, { conversationId, message: buildAskPrompt(question, context) });
  return { answer, sources: context.map((post) => post.id) };
}
