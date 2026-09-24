import { collectBriefText, type GrokSend } from "./briefs.js";
import { ThrottleQueue } from "./queue.js";

const VERDICTS_KEY = "xmem.verdicts";
const MAX_MODEL_OUTPUT_LENGTH = 20_000;

export type DebateWinner = "a" | "b" | "draw";

export interface DebateCase {
  side: string;
  text: string;
}

export interface StagedDebate {
  cases: [DebateCase, DebateCase];
  id: string;
  topic: string;
}

export interface VerdictTally {
  a: number;
  b: number;
  draw: number;
  total: number;
}

export function debateId(postA: string, postB: string): string {
  return [postA, postB].sort().join("::");
}

export function buildDebatePrompt(topic: string, textA: string, textB: string): string {
  return [
    `Stage a debate on ${topic} between two saved posts.`,
    "Present the strongest honest case for each side under exactly these headers:",
    "CASE FOR, then CASE AGAINST. Two sentences per case, no winner declared.",
    "",
    `First post: ${textA.slice(0, 800)}`,
    "",
    `Second post: ${textB.slice(0, 800)}`,
  ].join("\n");
}

export function parseDebate(reply: string): [DebateCase, DebateCase] | undefined {
  if (reply.length > MAX_MODEL_OUTPUT_LENGTH) return undefined;
  const forMatch = /CASE FOR\s*[:\-]?\s*([\s\S]+?)(?=CASE AGAINST|$)/i.exec(reply);
  const againstMatch = /CASE AGAINST\s*[:\-]?\s*([\s\S]+)$/i.exec(reply);
  if (forMatch?.[1] === undefined || againstMatch?.[1] === undefined) return undefined;
  const forText = forMatch[1].trim();
  const againstText = againstMatch[1].trim();
  if (forText === "" || againstText === "") return undefined;
  return [
    { side: "for", text: forText.slice(0, 1000) },
    { side: "against", text: againstText.slice(0, 1000) },
  ];
}

export async function stageDebate(
  topic: string,
  postA: { id: string; text: string },
  postB: { id: string; text: string },
  send: GrokSend,
  conversationId: string,
  queue?: ThrottleQueue,
): Promise<StagedDebate | undefined> {
  const runner = queue ?? new ThrottleQueue();
  const reply = await runner.enqueue(() =>
    collectBriefText(send, { conversationId, message: buildDebatePrompt(topic, postA.text, postB.text) }),
  );
  const cases = parseDebate(reply);
  if (cases === undefined) return undefined;
  return { cases, id: debateId(postA.id, postB.id), topic };
}

export async function recordVerdict(debateIdValue: string, winner: DebateWinner): Promise<void> {
  const stored = await chrome.storage.local.get(VERDICTS_KEY);
  const verdicts = (stored[VERDICTS_KEY] as Record<string, DebateWinner> | undefined) ?? {};
  verdicts[debateIdValue] = winner;
  await chrome.storage.local.set({ [VERDICTS_KEY]: verdicts });
}

export async function listVerdicts(): Promise<Array<{ debateId: string; winner: DebateWinner }>> {
  const stored = await chrome.storage.local.get(VERDICTS_KEY);
  const verdicts = (stored[VERDICTS_KEY] as Record<string, DebateWinner> | undefined) ?? {};
  return Object.entries(verdicts).map(([debateId, winner]) => ({ debateId, winner }));
}

export function tallyDebate(winners: DebateWinner[]): VerdictTally {
  const tally: VerdictTally = { a: 0, b: 0, draw: 0, total: winners.length };
  for (const winner of winners) tally[winner] += 1;
  return tally;
}
