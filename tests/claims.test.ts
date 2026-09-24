import { buildVerifyPrompt, parseVerdict, recordClaims, verifyClaims } from "../src/lib/claims.js";
import { getRecord, openDb } from "../src/lib/db.js";
import type { GrokEvent } from "../src/lib/grok.js";
import { ThrottleQueue } from "../src/lib/queue.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { indexedDB } from "fake-indexeddb";

vi.stubGlobal("indexedDB", indexedDB);

afterEach(async () => {
  const dbs = await indexedDB.databases();
  await Promise.all(dbs.map((info) => info.name !== undefined && indexedDB.deleteDatabase(info.name)));
});

async function* scripted(text: string): AsyncGenerator<GrokEvent, void, void> {
  yield { fullText: text, type: "done" };
}

const quiet = new ThrottleQueue({ baseDelayMs: 1, maxAttempts: 1, minIntervalMs: 0, sleep: async () => undefined });

describe("claims", () => {
  it("parses verdicts only with a strong source", () => {
    expect(parseVerdict("CONFIRMED\nSource: https://example.com/claim\nEvidence: shipped in 4.8")).toEqual({
      evidence: "shipped in 4.8",
      source: "https://example.com/claim",
      status: "fresh",
    });
    expect(parseVerdict("EVOLVED\nSource: https://example.com/claim\nEvidence: partial rollout")).toEqual({
      evidence: "partial rollout",
      source: "https://example.com/claim",
      status: "evolving",
    });
    expect(parseVerdict("DEAD\nSource: https://example.com/claim\nEvidence: superseded")).toEqual({
      evidence: "superseded",
      source: "https://example.com/claim",
      status: "dead",
    });
    expect(parseVerdict("CONFIRMED: no source")).toEqual({ evidence: "no source", source: "", status: "evolving" });
    expect(parseVerdict("CONFIRMED\nSource: https://example.com/no-evidence")).toEqual({
      evidence: "",
      source: "https://example.com/no-evidence",
      status: "evolving",
    });
    expect(parseVerdict("mumbling")).toEqual({ evidence: "mumbling", source: "", status: "evolving" });
  });

  it("marks partial and oversized verdicts as uncertain", () => {
    expect(parseVerdict("")).toEqual({ evidence: "", source: "", status: "evolving" });
    expect(parseVerdict("x".repeat(20_001))).toEqual({ evidence: "", source: "", status: "evolving" });
  });

  it("verifies claims and persists verdicts", async () => {
    const replies = [
      "CONFIRMED\nSource: https://example.com/one\nEvidence: yes",
      "DEAD\nSource: https://example.com/two\nEvidence: superseded",
    ];
    const send = () => scripted(replies.shift() ?? "CONFIRMED: x");
    await recordClaims(
      [
        { checkedAt: 0, id: "c1", postId: "p1", status: "fresh", text: "one" },
        { checkedAt: 0, id: "c2", postId: "p1", status: "fresh", text: "two" },
      ],
      { dbFactory: indexedDB },
    );
    const result = await verifyClaims(
      [
        { checkedAt: 0, id: "c1", postId: "p1", status: "fresh", text: "one" },
        { checkedAt: 0, id: "c2", postId: "p1", status: "fresh", text: "two" },
      ],
      { conversationId: "c", dbFactory: indexedDB, queue: quiet, send },
    );
    expect(result).toEqual({ checked: 2, dead: 1, evolved: 0 });
    const db = await openDb(indexedDB);
    expect(await getRecord(db, "claims", "c2")).toMatchObject({
      evidence: "superseded",
      evidenceSource: "https://example.com/two",
      evidenceVerified: false,
      status: "dead",
    });
    db.close();
  });

  it("skips dead claims without network", async () => {
    let calls = 0;
    const send = () => {
      calls += 1;
      return scripted("CONFIRMED: x");
    };
    const result = await verifyClaims(
      [{ checkedAt: 0, id: "c", postId: "p", status: "dead", text: "old" }],
      { conversationId: "c", dbFactory: indexedDB, queue: quiet, send },
    );
    expect(result).toEqual({ checked: 0, dead: 0, evolved: 0 });
    expect(calls).toBe(0);
  });

  it("migrates v1 databases forward with claims", async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("x-memory", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("posts", { keyPath: "id" });
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
    const db = await openDb(indexedDB);
    expect(db.version).toBe(5);
    expect(db.objectStoreNames.contains("claims")).toBe(true);
    expect(db.objectStoreNames.contains("posts")).toBe(true);
    db.close();
  });
});
