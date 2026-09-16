const COLLECTIONS_KEY = "xmem.collections";

export interface Collection {
  createdAt: number;
  description?: string;
  id: string;
  name: string;
  originId?: string;
  postIds: string[];
  updatedAt: number;
}

function freshId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `c-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

export async function listCollections(): Promise<Collection[]> {
  const stored = await chrome.storage.local.get(COLLECTIONS_KEY);
  return (stored[COLLECTIONS_KEY] as Collection[] | undefined) ?? [];
}

async function writeCollections(collections: Collection[]): Promise<void> {
  await chrome.storage.local.set({ [COLLECTIONS_KEY]: collections });
}

export async function saveCollection(collection: Collection): Promise<void> {
  const collections = (await listCollections()).filter((entry) => entry.id !== collection.id);
  collections.push(collection);
  await writeCollections(collections);
}

export async function createCollection(name: string, description: string, now: number): Promise<Collection> {
  const collection: Collection = { createdAt: now, id: freshId(), name, postIds: [], updatedAt: now };
  if (description !== "") collection.description = description;
  await saveCollection(collection);
  return collection;
}

export async function deleteCollection(id: string): Promise<void> {
  await writeCollections((await listCollections()).filter((entry) => entry.id !== id));
}

export async function addToCollection(id: string, postIds: string[], now: number): Promise<Collection | undefined> {
  const collections = await listCollections();
  const target = collections.find((entry) => entry.id === id);
  if (target === undefined) return undefined;
  const merged = [...target.postIds];
  for (const postId of postIds) {
    if (!merged.includes(postId)) merged.push(postId);
  }
  const updated: Collection = { ...target, postIds: merged, updatedAt: now };
  await saveCollection(updated);
  return updated;
}

export async function removeFromCollection(id: string, postIds: string[], now: number): Promise<Collection | undefined> {
  const collections = await listCollections();
  const target = collections.find((entry) => entry.id === id);
  if (target === undefined) return undefined;
  const removed = new Set(postIds);
  const updated: Collection = { ...target, postIds: target.postIds.filter((postId) => !removed.has(postId)), updatedAt: now };
  await saveCollection(updated);
  return updated;
}

export async function forkCollection(id: string, name: string, now: number): Promise<Collection | undefined> {
  const origin = (await listCollections()).find((entry) => entry.id === id);
  if (origin === undefined) return undefined;
  const fork: Collection = {
    createdAt: now,
    id: freshId(),
    name,
    originId: origin.id,
    postIds: [...origin.postIds],
    updatedAt: now,
  };
  if (origin.description !== undefined) fork.description = origin.description;
  await saveCollection(fork);
  return fork;
}
