import { browserBackend, playDigest, splitDigest, type SpeechBackend } from "../src/lib/voice.js";
import { describe, expect, it, vi } from "vitest";

function fakeBackend(spoken: string[]): SpeechBackend {
  return {
    cancel: () => undefined,
    speak: (text, onend) => {
      spoken.push(text);
      onend();
    },
  };
}

describe("voice", () => {
  it("splits digests into bounded chunks", () => {
    const text = `First point here with enough words to fill space. Second point follows with even more words inside. Third point wraps the digest up completely now.`;
    const chunks = splitDigest(text, 80);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 80)).toBe(true);
    expect(chunks.join(" ")).toBe(text.replace(/\s+/g, " "));
    expect(splitDigest("   ")).toEqual([]);
  });

  it("splits very long sentences", () => {
    const chunks = splitDigest(`x${"y".repeat(500)}`, 100);
    expect(chunks.length).toBeGreaterThan(2);
  });

  it("plays chunks in order with progress", async () => {
    const spoken: string[] = [];
    const progress: Array<[number, number]> = [];
    const playback = playDigest(fakeBackend(spoken), ["a", "b"], (i, n) => progress.push([i, n]));
    await playback.done;
    expect(spoken).toEqual(["a", "b"]);
    expect(progress).toEqual([
      [0, 2],
      [1, 2],
    ]);
  });

  it("resolves empty digests immediately", async () => {
    const spoken: string[] = [];
    await playDigest(fakeBackend(spoken), []).done;
    expect(spoken).toEqual([]);
  });

  it("surfaces speech errors", async () => {
    const backend: SpeechBackend = {
      cancel: () => undefined,
      speak: (_text, _onend, onerror) => onerror("no voice"),
    };
    await expect(playDigest(backend, ["a"]).done).rejects.toThrow("no voice");
  });

  it("returns undefined without a speech engine", () => {
    vi.stubGlobal("speechSynthesis", undefined);
    expect(browserBackend()).toBeUndefined();
    vi.unstubAllGlobals();
  });
});
