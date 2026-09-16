import { collectBriefText, type GrokSend } from "./briefs.js";
import { ThrottleQueue } from "./queue.js";

const VOICE_KEY = "xmem.voice.samples";
const MAX_SAMPLES = 20;

export async function listVoiceSamples(): Promise<string[]> {
  const stored = await chrome.storage.local.get(VOICE_KEY);
  return (stored[VOICE_KEY] as string[] | undefined) ?? [];
}

export async function addVoiceSample(text: string): Promise<void> {
  const cleaned = text.replace(/\s+/g, " ").trim().slice(0, 500);
  if (cleaned === "") return;
  const samples = await listVoiceSamples();
  samples.push(cleaned);
  await chrome.storage.local.set({ [VOICE_KEY]: samples.slice(-MAX_SAMPLES) });
}

export function buildReplyPrompt(postText: string, voiceNotes: string[]): string {
  const voice = voiceNotes.length > 0 ? voiceNotes.map((note) => `- ${note}`).join("\n") : "- (no voice samples yet)";
  return [
    "Draft exactly three reply variants to the post below, numbered 1. 2. 3.",
    "Match the voice in these samples of how I write:",
    voice,
    "Keep each variant under 240 characters. No hashtags unless the post has them.",
    "",
    `Post: ${postText.slice(0, 1000)}`,
  ].join("\n");
}

export function parseVariants(reply: string): string[] {
  const variants: string[] = [];
  for (const line of reply.split("\n")) {
    const match = /^\s*\d+[.)]\s*(.+?)\s*$/.exec(line);
    if (match?.[1] !== undefined && match[1] !== "") variants.push(match[1]);
  }
  return variants.slice(0, 3);
}

export function buildQuotePrompt(postText: string, angle: string): string {
  return [
    "Draft one quote-post that adds my take to the post below.",
    `My angle: ${angle.slice(0, 500)}`,
    "Keep it under 240 characters. Sound like me, not like a press release.",
    "",
    `Post: ${postText.slice(0, 1000)}`,
  ].join("\n");
}

export async function draftReplies(
  postText: string,
  send: GrokSend,
  conversationId: string,
  queue?: ThrottleQueue,
): Promise<string[]> {
  const runner = queue ?? new ThrottleQueue();
  const voice = await listVoiceSamples();
  const reply = await runner.enqueue(() =>
    collectBriefText(send, { conversationId, message: buildReplyPrompt(postText, voice) }),
  );
  return parseVariants(reply);
}

export async function draftQuote(
  postText: string,
  angle: string,
  send: GrokSend,
  conversationId: string,
  queue?: ThrottleQueue,
): Promise<string> {
  const runner = queue ?? new ThrottleQueue();
  const reply = await runner.enqueue(() =>
    collectBriefText(send, { conversationId, message: buildQuotePrompt(postText, angle) }),
  );
  return reply.trim().slice(0, 280);
}
