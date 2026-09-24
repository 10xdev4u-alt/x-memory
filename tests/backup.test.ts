import { createBackup, restoreBackup } from "../src/lib/backup.js";
import { countRecords, openDb } from "../src/lib/db.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { indexedDB } from "fake-indexeddb";

vi.stubGlobal("indexedDB", indexedDB);

afterEach(async () => {
  const dbs = await indexedDB.databases();
  await Promise.all(dbs.map((info) => info.name !== undefined && indexedDB.deleteDatabase(info.name)));
});

const POST = {
  authorHandle: "h",
  authorId: "u",
  authorName: "n",
  createdAt: 1,
  id: "p1",
  provenance: "saved" as const,
  references: { quotedIds: [] as string[] },
  status: "active" as const,
  syncedAt: 1,
  text: "t",
  url: "u",
};

describe("backup", () => {
  it("round-trips the corpus through one file", async () => {
    const { putRecords } = await import("../src/lib/db.js");
    const seed = await openDb(indexedDB);
    await putRecords(seed, "posts", [POST]);
    await putRecords(seed, "briefs", [{ createdAt: 1, postId: "p1", text: "b" }]);
    await putRecords(seed, "media", [{ id: "m", kind: "link", postId: "p1", url: "u" }]);
    seed.close();
    const raw = await createBackup({ dbFactory: indexedDB });
    const wipe = await openDb(indexedDB);
    await wipe.close();
    const { clearStore } = await import("../src/lib/db.js");
    const clearing = await openDb(indexedDB);
    await clearStore(clearing, "posts");
    await clearStore(clearing, "briefs");
    await clearStore(clearing, "media");
    clearing.close();
    const result = await restoreBackup(raw, { dbFactory: indexedDB });
    expect(result).toEqual({ briefs: 1, media: 1, posts: 1 });
    const check = await openDb(indexedDB);
    expect(await countRecords(check, "posts")).toBe(1);
    check.close();
  });

  it("rejects corrupt files before touching data", async () => {
    await expect(restoreBackup("garbage", { dbFactory: indexedDB })).rejects.toThrow();
    const check = await openDb(indexedDB);
    expect(await countRecords(check, "posts")).toBe(0);
    check.close();
  });

  it("rejects malformed records before touching seeded data", async () => {
    const { putRecords } = await import("../src/lib/db.js");
    const seed = await openDb(indexedDB);
    await putRecords(seed, "posts", [POST]);
    await putRecords(seed, "briefs", [{ createdAt: 1, postId: "p1", text: "b" }]);
    await putRecords(seed, "media", [{ id: "m", kind: "link", postId: "p1", url: "u" }]);
    seed.close();
    const valid = {
      briefs: [{ createdAt: 1, postId: "p1", text: "b" }],
      exportedAt: "2026-01-01T00:00:00.000Z",
      media: [{ id: "m", kind: "link", postId: "p1", url: "u" }],
      posts: [POST],
      version: 1
    };
    const invalidBundles = [
      JSON.stringify({ ...valid, posts: [{}] }),
      JSON.stringify({ ...valid, posts: [{ ...POST, references: { quotedIds: "p1" } }] }),
      JSON.stringify({ ...valid, briefs: [{ ...valid.briefs[0], postId: "missing" }] }),
      JSON.stringify({ ...valid, media: [{ ...valid.media[0], postId: "missing" }] }),
      JSON.stringify({ ...valid, posts: [POST, { ...POST }] })
    ];

    for (const raw of invalidBundles) {
      await expect(restoreBackup(raw, { dbFactory: indexedDB })).rejects.toThrow();
    }

    const check = await openDb(indexedDB);
    expect(await countRecords(check, "posts")).toBe(1);
    expect(await countRecords(check, "briefs")).toBe(1);
    expect(await countRecords(check, "media")).toBe(1);
    check.close();
  });
});
