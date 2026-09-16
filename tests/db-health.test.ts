import { assessDb } from "../src/lib/db-health.js";
import { DB_NAME, openDb } from "../src/lib/db.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { indexedDB } from "fake-indexeddb";

vi.stubGlobal("indexedDB", indexedDB);

async function wipe(): Promise<void> {
  const dbs = await indexedDB.databases();
  await Promise.all(dbs.map((info) => info.name !== undefined && indexedDB.deleteDatabase(info.name)));
}

describe("db-health", () => {
  afterEach(wipe);

  it("reports healthy on a clean database", async () => {
    const report = await assessDb(indexedDB);
    expect(report).toMatchObject({ status: "healthy" });
  });

  it("recovers a version-skewed database by recreating", async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("x-memory", 99);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("legacy", { keyPath: "id" });
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
    const report = await assessDb(indexedDB);
    expect(report.status).toBe("recovered");
    expect(report.detail).toContain("Resync");
    const db = await openDb(indexedDB);
    expect(db.version).toBe(2);
    expect(db.objectStoreNames.contains("claims")).toBe(true);
    db.close();
  });

  it("fails cleanly when open throws", async () => {
    const broken = {
      deleteDatabase: () => undefined,
      open: () => {
        throw new Error("nope");
      },
    } as unknown as IDBFactory;
    const report = await assessDb(broken);
    expect(report).toMatchObject({ status: "failed" });
  });
});
