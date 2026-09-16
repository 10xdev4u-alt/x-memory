import {
  classifyGrokStatus,
  grokBody,
  grokHeaders,
  GrokError,
  sendGrokMessage,
  type GrokMessage,
} from "../src/lib/grok.js";
import { describe, expect, it, vi } from "vitest";

function streamResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status });
}

function collect(message: GrokMessage, fetchImpl: typeof fetch) {
  return (async () => {
    const events = [];
    for await (const event of sendGrokMessage(message, { clientUuid: "uuid-1", fetchImpl, requestId: () => "req-1" })) {
      events.push(event);
    }
    return events;
  })();
}

const MESSAGE: GrokMessage = { conversationId: "c1", message: "hi" };

describe("grok pipe", () => {
  it("builds headers and body", () => {
    expect(grokHeaders("r", "u")).toMatchObject({ "x-client-uuid": "u", "x-xai-request-id": "r" });
    expect(grokBody(MESSAGE)).toMatchObject({
      conversationId: "c1",
      isCancel: false,
      message: "hi",
      responses: [],
    });
  });

  it("classifies statuses and bodies", () => {
    expect(classifyGrokStatus(401, "")).toBe("auth");
    expect(classifyGrokStatus(429, "")).toBe("quota");
    expect(classifyGrokStatus(200, "quota exhausted today")).toBe("quota");
    expect(classifyGrokStatus(500, "")).toBe("server");
    expect(classifyGrokStatus(400, "weird")).toBe("blocked");
  });

  it("streams text events then done", async () => {
    const seen: unknown[] = [];
    const fetchImpl = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      seen.push([_url, init.method, (init.headers as Record<string, string>)["x-xai-request-id"]]);
      return streamResponse(['data: {"text":"Hel"}\n', 'data: {"text":"lo"}\n']);
    });
    const events = await collect(MESSAGE, fetchImpl as unknown as typeof fetch);
    expect(seen).toEqual([["https://grok.x.com/2/grok/add_response.json", "POST", "req-1"]]);
    expect(events[events.length - 1]).toMatchObject({ fullText: "Hello", type: "done" });
    expect(events.slice(0, -1).every((event) => event.type === "text")).toBe(true);
  });

  it("throws quota errors with bodies", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => new Response("quota exhausted", { status: 429 }));
    await expect(collect(MESSAGE, fetchImpl as unknown as typeof fetch)).rejects.toMatchObject({ kind: "quota" });
  });

  it("throws auth errors", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => new Response("", { status: 403 }));
    await expect(collect(MESSAGE, fetchImpl as unknown as typeof fetch)).rejects.toMatchObject({ kind: "auth" });
  });

  it("throws network errors", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => {
      throw new Error("down");
    });
    await expect(collect(MESSAGE, fetchImpl as unknown as typeof fetch)).rejects.toBeInstanceOf(GrokError);
  });
});
