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

function extractText(chunk: string): string {
  const texts: string[] = [];
  for (const line of chunk.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith(":")) continue;
    const payload = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
    if (payload === "[DONE]") continue;
    try {
      const parsed = JSON.parse(payload) as { text?: unknown; delta?: unknown; content?: unknown };
      for (const field of [parsed.text, parsed.delta, parsed.content]) {
        if (typeof field === "string") texts.push(field);
      }
    } catch {
      texts.push(payload);
    }
  }
  return texts.join("");
}
