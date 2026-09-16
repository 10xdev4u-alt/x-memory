import { getRecord, openDb } from "../src/lib/db.js";
import {
  buildExtractPrompt,
  parsePredictionLines,
  parseResolution,
  recordPredictions,
  resolvePredictions,
} from "../src/lib/predictions.js";
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

describe("predictions", () => {
  it("parses dated prediction lines", () => {
    expect(parsePredictionLines("- Grok ships (by 2026-03-01)\n- Kernels win\nnot a line")).toEqual([
      { targetDate: Date.parse("2026-03-01T00:00:00Z"), text: "Grok ships" },
      { text: "Kernels win" },
    ]);
    expect(parsePredictionLines("no predictions here")).toEqual([]);
  });

  it("parses resolutions with open fallback", () => {
    expect(parseResolution("TRUE: shipped")).toEqual({ evidence: "shipped", status: "resolved-true" });
    expect(parseResolution("FALSE - delayed")).toEqual({ evidence: "delayed", status: "resolved-false" });
    expect(parseResolution("UNCLEAR")).toEqual({ evidence: "", status: "open" });
    expect(parseResolution("rambling")).toEqual({ evidence: "rambling", status: "open" });
  });

  it("resolves open predictions and persists", async () => {
    const replies = ["TRUE: done", "FALSE: missed"];
    const send = () => scripted(replies.shift() ?? "UNCLEAR");
    const predictions = [
      { checkedAt: 0, id: "p1", postId: "x", status: "open" as const, text: "one" },
      { checkedAt: 0, id: "p2", postId: "x", status: "open" as const, text: "two" },
    ];
    await recordPredictions(predictions, { dbFactory: indexedDB });
    const result = await resolvePredictions(predictions, { conversationId: "c", dbFactory: indexedDB, queue: quiet, send });
    expect(result).toEqual({ expired: 0, resolved: 2, stillOpen: 0 });
    const db = await openDb(indexedDB);
    expect(await getRecord(db, "predictions", "p1")).toMatchObject({ status: "resolved-true" });
    db.close();
  });

  it("expires ancient predictions without network", async () => {
    let calls = 0;
    const send = () => {
      calls += 1;
      return scripted("TRUE: x");
    };
    const old = Date.now() - 60 * 24 * 60 * 60 * 1000;
    const result = await resolvePredictions(
      [{ checkedAt: 0, id: "p", postId: "x", status: "open", targetDate: old, text: "old" }],
      { conversationId: "c", dbFactory: indexedDB, queue: quiet, send },
    );
    expect(result).toEqual({ expired: 1, resolved: 0, stillOpen: 0 });
    expect(calls).toBe(0);
  });

  it("migrates v2 databases to v4", async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("x-memory", 2);
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
    expect(db.version).toBe(4);
    expect(db.objectStoreNames.contains("predictions")).toBe(true);
    expect(db.objectStoreNames.contains("posts")).toBe(true);
    db.close();
  });

  it("builds extraction prompts", () => {
    expect(buildExtractPrompt("some text", "h")).toContain("@h");
  });
});
