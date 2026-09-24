import {
  dbNameFor,
  listAccounts,
  parseAccountId,
  readCurrentAccount,
  rememberAccount,
  writeCurrentAccount,
} from "../src/lib/accounts.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { indexedDB } from "fake-indexeddb";
import { countRecords, openDb, putRecords } from "../src/lib/db.js";

const store = new Map<string, unknown>();

afterEach(async () => {
  const dbs = await indexedDB.databases();
  await Promise.all(dbs.map((info) => info.name !== undefined && indexedDB.deleteDatabase(info.name)));
});

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

describe("accounts", () => {
  it("parses the account id from twid", () => {
    expect(parseAccountId("a=1; twid=u%3D12345; b=2")).toBe("12345");
    expect(parseAccountId("a=1")).toBeUndefined();
    expect(parseAccountId("twid=junk")).toBeUndefined();
  });

  it("names databases per account", () => {
    expect(dbNameFor("12345")).toBe("x-memory-12345");
    expect(dbNameFor("12345")).not.toBe(dbNameFor("678"));
  });

  it("isolates records when the current account changes", async () => {
    await writeCurrentAccount("a");
    const first = await openDb(indexedDB);
    await putRecords(first, "posts", [{ id: "a-post" }]);
    first.close();
    await writeCurrentAccount("b");
    const second = await openDb(indexedDB);
    expect(second.name).toBe("x-memory-b");
    expect(await countRecords(second, "posts")).toBe(0);
    second.close();
    const firstAgain = await openDb(indexedDB, "x-memory-a");
    expect(await countRecords(firstAgain, "posts")).toBe(1);
    firstAgain.close();
  });

  it("remembers accounts newest first without duplicates", async () => {
    await rememberAccount({ id: "a", lastUsed: 1 });
    await rememberAccount({ id: "b", lastUsed: 2 });
    await rememberAccount({ id: "a", lastUsed: 3 });
    expect(await listAccounts()).toEqual([
      { id: "a", lastUsed: 3 },
      { id: "b", lastUsed: 2 },
    ]);
  });

  it("tracks the current account", async () => {
    expect(await readCurrentAccount()).toBeUndefined();
    await writeCurrentAccount("a");
    expect(await readCurrentAccount()).toBe("a");
  });
});
