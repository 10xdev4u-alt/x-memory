import { curatorBoard, curatorCard, forecasterBoard, forecasterCard } from "../src/lib/boards.js";
import { openDb, putRecords } from "../src/lib/db.js";
import { createCollection, forkCollection } from "../src/lib/collections.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { indexedDB } from "fake-indexeddb";

vi.stubGlobal("indexedDB", indexedDB);

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

afterEach(async () => {
  const dbs = await indexedDB.databases();
  await Promise.all(dbs.map((info) => info.name !== undefined && indexedDB.deleteDatabase(info.name)));
});

function post(id: string, authorHandle: string): Record<string, unknown> {
  return {
    authorHandle, authorId: authorHandle, authorName: authorHandle, createdAt: 1, id,
    provenance: "saved", references: { quotedIds: [] }, status: "active",
    syncedAt: 1, text: "t", url: `u${id}`,
  };
}

describe("boards", () => {
  it("ranks forecasters by accuracy then volume", async () => {
    const db = await openDb(indexedDB);
    await putRecords(db, "posts", [post("p1", "sharp"), post("p2", "sharp"), post("p3", "noisy")]);
    await putRecords(db, "predictions", [
      { checkedAt: 1, id: "a", postId: "p1", status: "resolved-true", text: "a" },
      { checkedAt: 1, id: "b", postId: "p2", status: "resolved-false", text: "b" },
      { checkedAt: 1, id: "c", postId: "p3", status: "resolved-true", text: "c" },
      { checkedAt: 1, id: "d", postId: "p3", status: "open", text: "d" },
    ]);
    db.close();
    const board = await forecasterBoard({ dbFactory: indexedDB });
    expect(board).toEqual([
      { accuracy: 1, correct: 1, handle: "noisy", resolved: 1 },
      { accuracy: 0.5, correct: 1, handle: "sharp", resolved: 2 },
    ]);
    expect(forecasterCard(board)).toContain("@noisy — 100% over 1");
  });

  it("ranks curators by forks then posts", async () => {
    const origin = await createCollection("Canon", "", 1);
    await forkCollection(origin.id, "Fork one", 2);
    await forkCollection(origin.id, "Fork two", 3);
    await createCollection("Solo", "", 4);
    const board = await curatorBoard();
    expect(board[0]).toMatchObject({ forks: 2, name: "Canon" });
    expect(curatorCard(board)).toContain("Canon — 0 posts, 2 forks");
  });

  it("boards stay empty without data", async () => {
    expect(await forecasterBoard({ dbFactory: indexedDB })).toEqual([]);
    expect(await curatorBoard()).toEqual([]);
  });
});
