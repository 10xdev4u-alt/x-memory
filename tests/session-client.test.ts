import { clearOperations, registerOperation } from "../src/lib/op-registry.js";
import {
  buildHeaders,
  buildOperationUrl,
  callOperation,
  classifyStatus,
  readCsrfToken,
  SessionError,
} from "../src/lib/session-client.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const BEARER = "test-bearer";

beforeEach(() => {
  clearOperations();
  registerOperation({ kind: "query", operationName: "Bookmarks", queryId: "qid123" });
});

describe("session-client", () => {
  it("reads the csrf token from cookies", () => {
    expect(readCsrfToken("a=1; ct0=abc123; b=2")).toBe("abc123");
    expect(readCsrfToken("a=1")).toBe("");
  });

  it("builds operation urls with encoded variables", () => {
    const url = buildOperationUrl("qid123", "Bookmarks", { count: 5 });
    expect(url).toBe(
      "https://x.com/i/api/graphql/qid123/Bookmarks?variables=%7B%22count%22%3A5%7D",
    );
  });

  it("builds session headers", () => {
    expect(buildHeaders("tok", BEARER)).toMatchObject({
      authorization: `Bearer ${BEARER}`,
      "x-csrf-token": "tok",
      "x-twitter-auth-type": "OAuth2Session",
    });
  });

  it("classifies statuses", () => {
    expect(classifyStatus(401)).toBe("expired");
    expect(classifyStatus(403)).toBe("forbidden");
    expect(classifyStatus(429)).toBe("rate-limited");
    expect(classifyStatus(404)).toBe("stale-operation");
    expect(classifyStatus(500)).toBe("server");
    expect(classifyStatus(418)).toBe("network");
  });

  it("rejects unknown operations without network", async () => {
    const fetchImpl = vi.fn();
    await expect(callOperation("Nope", {}, { bearer: BEARER, cookie: "ct0=x", fetchImpl })).rejects.toThrow(
      SessionError,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects missing csrf without network", async () => {
    const fetchImpl = vi.fn();
    await expect(
      callOperation("Bookmarks", {}, { bearer: BEARER, cookie: "", fetchImpl }),
    ).rejects.toMatchObject({ kind: "expired" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns envelopes on success", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { hello: true } }),
    });
    const result = await callOperation("Bookmarks", { count: 1 }, { bearer: BEARER, cookie: "ct0=x", fetchImpl });
    expect(result).toEqual({ data: { hello: true } });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("maps failure statuses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    await expect(
      callOperation("Bookmarks", {}, { bearer: BEARER, cookie: "ct0=x", fetchImpl }),
    ).rejects.toMatchObject({ kind: "rate-limited", status: 429 });
  });
});
