import { allRecords, getRecord, openDb, putRecords, type LoopRecord, type PostRecord } from "./db.js";

export interface LoopCounts {
  open: number;
  resolved: number;
}

export async function resolvePost(postId: string, now: number, deps?: { dbFactory?: IDBFactory; dbName?: string }): Promise<boolean> {
  const db = await openDb(deps?.dbFactory ?? indexedDB, deps?.dbName);
  try {
    const existing = await getRecord(db, "loops", postId);
    if (existing !== undefined) return false;
    await putRecords(db, "loops", [{ postId, resolvedAt: now } satisfies LoopRecord]);
    return true;
  } finally {
    db.close();
  }
}

export async function reopenPost(postId: string, deps?: { dbFactory?: IDBFactory; dbName?: string }): Promise<boolean> {
  const db = await openDb(deps?.dbFactory ?? indexedDB, deps?.dbName);
  try {
    const existing = await getRecord(db, "loops", postId);
    if (existing === undefined) return false;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("loops", "readwrite");
      const request = tx.objectStore("loops").delete(postId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    return true;
  } finally {
    db.close();
  }
}

export async function loopCounts(deps?: { dbFactory?: IDBFactory; dbName?: string }): Promise<LoopCounts> {
  const db = await openDb(deps?.dbFactory ?? indexedDB, deps?.dbName);
  try {
    const posts = await allRecords<PostRecord>(db, "posts");
    const loops = await allRecords<LoopRecord>(db, "loops");
    const resolved = new Set(loops.map((loop) => loop.postId));
    let open = 0;
    for (const post of posts) {
      if (!resolved.has(post.id)) open += 1;
    }
    return { open, resolved: resolved.size };
  } finally {
    db.close();
  }
}

export async function openLoopIds(deps?: { dbFactory?: IDBFactory; dbName?: string }): Promise<string[]> {
  const db = await openDb(deps?.dbFactory ?? indexedDB, deps?.dbName);
  try {
    const posts = await allRecords<PostRecord>(db, "posts");
    const loops = await allRecords<LoopRecord>(db, "loops");
    const resolved = new Set(loops.map((loop) => loop.postId));
    return posts.filter((post) => !resolved.has(post.id)).map((post) => post.id);
  } finally {
    db.close();
  }
}
