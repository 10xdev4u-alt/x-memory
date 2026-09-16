import {
  addVoiceSample,
  buildQuotePrompt,
  buildReplyPrompt,
  draftQuote,
  draftReplies,
  listVoiceSamples,
  parseVariants,
} from "../src/lib/composer.js";
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

describe("composer", () => {
  it("builds voice-aware reply prompts", () => {
    const prompt = buildReplyPrompt("hello world", ["short sentences", "dry humor"]);
    expect(prompt).toContain("- short sentences");
    expect(prompt).toContain("Post: hello world");
    expect(prompt).toContain("1. 2. 3.");
  });

  it("parses numbered variants", () => {
    expect(parseVariants("1. First\n2) Second\n- not numbered\n3. Third\n4. Extra")).toEqual(["First", "Second", "Third"]);
    expect(parseVariants("no numbers")).toEqual([]);
  });

  it("drafts replies through Grok", async () => {
    await addVoiceSample("terse takes");
    const variants = await draftReplies("some post", () => scripted("1. A\n2. B\n3. C"), "c");
    expect(variants).toEqual(["A", "B", "C"]);
  });

  it("drafts quotes with the given angle", async () => {
    const quote = await draftQuote("some post", "skeptical", () => scripted("  My take here.  "), "c");
    expect(quote).toBe("My take here.");
    expect(buildQuotePrompt("p", "a")).toContain("My angle: a");
  });

  it("learns voice from accepted drafts with a cap", async () => {
    await addVoiceSample("  ");
    for (let i = 0; i < 25; i += 1) {
      await addVoiceSample(`sample ${i}`);
    }
    const samples = await listVoiceSamples();
    expect(samples).toHaveLength(20);
    expect(samples[0]).toBe("sample 5");
  });
});
