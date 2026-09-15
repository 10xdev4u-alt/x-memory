export type SessionState = "unknown" | "active" | "missing" | "expired";

const SESSION_KEY = "xmem.session";
const VERSION_KEY = "xmem.versions";

export interface SessionSnapshot {
  state: SessionState;
  checkedAt: number;
}

export interface VersionSnapshot {
  extension: string;
  operations: string;
  checkedAt: number;
}

export async function readSession(): Promise<SessionSnapshot> {
  const stored = await chrome.storage.local.get(SESSION_KEY);
  const snapshot = stored[SESSION_KEY] as SessionSnapshot | undefined;
  return snapshot ?? { checkedAt: 0, state: "unknown" };
}

export async function writeSession(snapshot: SessionSnapshot): Promise<void> {
  await chrome.storage.local.set({ [SESSION_KEY]: snapshot });
}

export async function readVersions(): Promise<VersionSnapshot | undefined> {
  const stored = await chrome.storage.local.get(VERSION_KEY);
  return stored[VERSION_KEY] as VersionSnapshot | undefined;
}

export async function writeVersions(snapshot: VersionSnapshot): Promise<void> {
  await chrome.storage.local.set({ [VERSION_KEY]: snapshot });
}

export async function wipeLocalData(): Promise<void> {
  const databases = await indexedDB.databases();
  await Promise.all(databases.map((info) => info.name !== undefined && deleteDatabase(info.name)));
  await chrome.storage.local.clear();
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}
