import { DB_NAME, DB_VERSION, openDb, type StoreName } from "./db.js";

export type DbHealth = "healthy" | "recovered" | "failed";

export interface HealthReport {
  status: DbHealth;
  detail: string;
}

const REQUIRED_STORES: StoreName[] = ["posts", "authors", "media", "briefs"];

function inspectDb(factory: IDBFactory, name: string): Promise<{ version: number; stores: string[] }> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name);
    request.onsuccess = () => {
      const db = request.result;
      const snapshot = { stores: [...db.objectStoreNames], version: db.version };
      db.close();
      resolve(snapshot);
    };
    request.onerror = () => reject(request.error);
  });
}

function deleteDatabase(factory: IDBFactory, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

export async function assessDb(factory: IDBFactory = indexedDB, name: string = DB_NAME): Promise<HealthReport> {
  let snapshot: { version: number; stores: string[] };
  try {
    snapshot = await inspectDb(factory, name);
  } catch (error) {
    return { detail: `Open failed: ${String(error)}`, status: "failed" };
  }
  const missing = REQUIRED_STORES.filter((store) => !snapshot.stores.includes(store));
  if (missing.length === 0 && snapshot.version === DB_VERSION) {
    return { detail: "All stores present at current version.", status: "healthy" };
  }
  if (snapshot.stores.length === 0 && snapshot.version === DB_VERSION) {
    try {
      const fresh = await openDb(factory, name);
      fresh.close();
    } catch (error) {
      return { detail: `Initialize failed: ${String(error)}`, status: "failed" };
    }
    return { detail: "Initialized fresh schema.", status: "healthy" };
  }
  try {
    await deleteDatabase(factory, name);
    const fresh = await openDb(factory, name);
    fresh.close();
  } catch (error) {
    return { detail: `Recreate failed: ${String(error)}`, status: "failed" };
  }
  return {
    detail: `Recreated clean at version ${DB_VERSION}. Resync from X to rebuild.`,
    status: "recovered",
  };
}
