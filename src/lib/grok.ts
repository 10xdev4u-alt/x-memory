import { callOperation } from "./session-client.js";
import { loadOps, readBearer } from "./healer.js";

export const GROK_HOST = "https://grok.x.com";
export const GROK_CREATE_OPERATION = "CreateGrokConversation";

export type GrokErrorKind = "auth" | "quota" | "network" | "server" | "blocked";

export class GrokError extends Error {
  readonly kind: GrokErrorKind;
  readonly status: number;

  constructor(kind: GrokErrorKind, status: number, message: string) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

export interface GrokMessage {
  conversationId: string;
  message: string;
  modelOptionId?: string;
  temporary?: boolean;
}

export interface GrokDeps {
  clientUuid?: string;
  fetchImpl?: typeof fetch;
  requestId?: () => string;
}

export type GrokEvent = { type: "text"; delta: string } | { type: "done"; fullText: string };

export interface ConversationDeps {
  bearer?: string;
  cookie?: string;
  fetchImpl?: typeof fetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function ensureConversation(deps: ConversationDeps = {}): Promise<string> {
  const loaded = await loadOps([GROK_CREATE_OPERATION]);
  if (loaded.length === 0) throw new GrokError("blocked", 0, "grok operations unknown, open x.com to heal");
  const bearer = deps.bearer ?? (await readBearer());
  if (bearer === undefined) throw new GrokError("auth", 0, "missing bearer, open x.com to heal");
  const cookie = deps.cookie ?? (typeof document !== "undefined" ? document.cookie : "");
  const client: { bearer: string; cookie: string; fetchImpl?: typeof fetch } = { bearer, cookie };
  if (deps.fetchImpl !== undefined) client.fetchImpl = deps.fetchImpl;
  const envelope = await callOperation(GROK_CREATE_OPERATION, {}, client);
  const data = isRecord(envelope.data) ? envelope.data : undefined;
  const conversation = data !== undefined && isRecord(data.create_grok_conversation) ? data.create_grok_conversation : undefined;
  const id = conversation?.conversation_id;
  if (typeof id !== "string" || id.trim() === "") {
    throw new GrokError("server", 0, "conversation create returned no id");
  }
  return id;
}

export function grokHeaders(requestId: string, clientUuid?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-xai-request-id": requestId,
  };
  if (clientUuid !== undefined) headers["x-client-uuid"] = clientUuid;
  return headers;
}

export function grokBody(message: GrokMessage): Record<string, unknown> {
  return {
    conversationId: message.conversationId,
    conversation_id: message.conversationId,
    isCancel: false,
    message: message.message,
    modelOptionId: message.modelOptionId ?? "",
    prompt: message.message,
    responses: [],
    responseToChatItemId: null,
    systemPromptName: "",
    temporary: message.temporary ?? false,
  };
}

export function classifyGrokStatus(status: number, body: string): GrokErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 402 || status === 429) return "quota";
  if (/quota|limit|exhaust/i.test(body)) return "quota";
  if (/auth|forbidden|denied/i.test(body)) return "auth";
  if (status >= 500) return "server";
  return "blocked";
}

export async function* sendGrokMessage(
  message: GrokMessage,
  deps: GrokDeps = {},
): AsyncGenerator<GrokEvent, void, void> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const requestId = deps.requestId?.() ?? (typeof crypto !== "undefined" ? crypto.randomUUID() : "xmem");
  let response: Response;
  try {
    response = await fetchImpl(`${GROK_HOST}/2/grok/add_response.json`, {
      body: JSON.stringify(grokBody(message)),
      credentials: "include",
      headers: grokHeaders(requestId, deps.clientUuid),
      method: "POST",
    });
  } catch (error) {
    throw new GrokError("network", 0, `grok request failed: ${String(error)}`);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new GrokError(classifyGrokStatus(response.status, body), response.status, `grok refused: ${response.status}`);
  }
  if (response.body === null) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    fullText += extractText(chunk);
    if (chunk.length > 0) yield { delta: chunk, type: "text" };
  }
  yield { fullText, type: "done" };
}

export function extractText(chunk: string): string {
  const texts: string[] = [];
  for (const line of chunk.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith(":")) continue;
    const payload = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
    if (payload === "[DONE]") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      continue;
    }
    if (!isRecord(parsed) || Object.keys(parsed).some((key) => !["text", "delta", "content"].includes(key))) continue;
    const fields = [parsed.text, parsed.delta, parsed.content];
    if (!fields.some((field) => typeof field === "string")) continue;
    for (const field of fields) {
      if (typeof field === "string") texts.push(field);
    }
  }
  return texts.join("");
}
