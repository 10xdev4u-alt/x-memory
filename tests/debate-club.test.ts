import {
  buildDebatePrompt,
  debateId,
  listVerdicts,
  parseDebate,
  recordVerdict,
  stageDebate,
  tallyDebate,
} from "../src/lib/debate-club.js";
import type { GrokEvent } from "../src/lib/grok.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, unknown>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: store.get(key) }),
        set: async (entries: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(entries)) store.set(key, value);
        },
      },
    },
  });
});

async function* scripted(text: string): AsyncGenerator<GrokEvent, void, void> {
  yield { fullText: text, type: "done" };
}

describe("debate-club", () => {
  it("ids debates order-independently", () => {
    expect(debateId("b", "a")).toBe(debateId("a", "b"));
    expect(debateId("a", "a")).toBe("a::a");
  });

  it("parses staged cases", () => {
    const parsed = parseDebate("CASE FOR: scaling wins.\nCASE AGAINST: walls bite.");
    expect(parsed).toEqual([
      { side: "for", text: "scaling wins." },
      { side: "against", text: "walls bite." },
    ]);
    expect(parseDebate("no structure here")).toBeUndefined();
    expect(parseDebate("CASE FOR: only one side")).toBeUndefined();
  });

  it("rejects oversized debate output", () => {
    expect(parseDebate("CASE FOR: " + "x".repeat(20_001) + "\nCASE AGAINST: no")).toBeUndefined();
  });

  it("stages debates through Grok", async () => {
    const debate = await stageDebate(
      "Scaling",
      { id: "a", text: "up" },
      { id: "b", text: "down" },
      () => scripted("CASE FOR: up wins\nCASE AGAINST: down wins"),
      "c",
    );
    expect(debate).toMatchObject({ id: "a::b", topic: "Scaling" });
    expect(debate?.cases).toHaveLength(2);
    expect(buildDebatePrompt("T", "a", "b")).toContain("CASE AGAINST");
  });

  it("returns undefined on unstructured replies", async () => {
    const debate = await stageDebate("T", { id: "a", text: "x" }, { id: "b", text: "y" }, () => scripted("nope"), "c");
    expect(debate).toBeUndefined();
  });

  it("records and lists verdicts with tallies", async () => {
    await recordVerdict("a::b", "a");
    await recordVerdict("c::d", "draw");
    expect(await listVerdicts()).toEqual([
      { debateId: "a::b", winner: "a" },
      { debateId: "c::d", winner: "draw" },
    ]);
    expect(tallyDebate(["a", "a", "b", "draw"])).toEqual({ a: 2, b: 1, draw: 1, total: 4 });
  });
});
