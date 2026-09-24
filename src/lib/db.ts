import type { PostReferences } from "./threads.js";

export type PostStatus = "active" | "deleted" | "suspended";

export const DB_NAME = "x-memory";
export const DB_VERSION = 5;

export type Provenance = "saved" | "liked" | "both";

export interface PostRecord {
  id: string;
  authorId: string;
  authorHandle: string;
  authorName: string;
  references: PostReferences;
  status: PostStatus;
  text: string;
  createdAt: number;
  url: string;
  provenance: Provenance;
  syncedAt: number;
}

export interface AuthorRecord {
  id: string;
  handle: string;
  name: string;
  saveCount: number;
  likeCount: number;
  lastSeen: number;
}

export type MediaKind = "image" | "video" | "link";

export interface MediaRecord {
  id: string;
  postId: string;
  kind: MediaKind;
  url: string;
}

export interface BriefRecord {
  postId: string;
  text: string;
  createdAt: number;
}

export type StoreName = "posts" | "authors" | "media" | "briefs" | "claims" | "predictions" | "review" | "loops";

export interface ClaimRecord {
  checkedAt: number;
  evidence?: string;
  id: string;
  postId: string;
  status: ClaimStatus;
  text: string;
}

export type ClaimStatus = "fresh" | "evolving" | "dead";

export type PredictionStatus = "open" | "resolved-true" | "resolved-false" | "expired";

export interface PredictionRecord {
  checkedAt: number;
  evidence?: string;
  id: string;
  postId: string;
  status: PredictionStatus;
  targetDate?: number;
  text: string;
}

export interface ReviewRecord {
  dueAt: number;
  intervalDays: number;
  postId: string;
}

export interface LoopRecord {
  postId: string;
  resolvedAt: number;
}

export function openDb(factory: IDBFactory = indexedDB, name: string = DB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("posts")) {
        const posts = db.createObjectStore("posts", { keyPath: "id" });
        posts.createIndex("by-author", "authorId", { unique: false });
        posts.createIndex("by-provenance", "provenance", { unique: false });
      }
      if (!db.objectStoreNames.contains("authors")) {
        db.createObjectStore("authors", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("media")) {
        const media = db.createObjectStore("media", { keyPath: "id" });
        media.createIndex("by-post", "postId", { unique: false });
      }
      if (!db.objectStoreNames.contains("briefs")) {
        db.createObjectStore("briefs", { keyPath: "postId" });
      }
      if (!db.objectStoreNames.contains("claims")) {
        const claims = db.createObjectStore("claims", { keyPath: "id" });
        claims.createIndex("by-post", "postId", { unique: false });
        claims.createIndex("by-status", "status", { unique: false });
      }
      if (!db.objectStoreNames.contains("predictions")) {
        const predictions = db.createObjectStore("predictions", { keyPath: "id" });
        predictions.createIndex("by-post", "postId", { unique: false });
        predictions.createIndex("by-status", "status", { unique: false });
      }
      if (!db.objectStoreNames.contains("review")) {
        const review = db.createObjectStore("review", { keyPath: "postId" });
        review.createIndex("by-due", "dueAt", { unique: false });
      }
      if (!db.objectStoreNames.contains("loops")) {
        db.createObjectStore("loops", { keyPath: "postId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transact<T>(db: IDBDatabase, store: StoreName, mode: IDBTransactionMode, run: (storage: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = run(tx.objectStore(store));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runWrite(
  db: IDBDatabase,
  stores: StoreName | StoreName[],
  action: string,
  run: (tx: IDBTransaction) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, "readwrite");
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      const detail = error instanceof Error ? error.message : "transaction aborted";
      reject(new Error(`${action} failed: ${detail}`));
    };
    tx.oncomplete = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    tx.onerror = () => fail(tx.error ?? new Error("transaction error"));
    tx.onabort = () => fail(tx.error ?? new Error("transaction aborted"));
    try {
      run(tx);
    } catch (error) {
      try {
        tx.abort();
      } catch {
        fail(error);
        return;
      }
      fail(error);
    }
  });
}

export function putRecords(db: IDBDatabase, store: StoreName, records: unknown[]): Promise<void> {
  return runWrite(db, store, `put ${store} records`, (tx) => {
    const storage = tx.objectStore(store);
    for (const record of records) storage.put(record);
  });
}

export interface CorpusReplacement {
  briefs: unknown[];
  media: unknown[];
  posts: unknown[];
}

export function replaceCorpus(db: IDBDatabase, replacement: CorpusReplacement): Promise<void> {
  return new Promise((resolve, reject) => {
    const stores: CorpusReplacement = replacement;
    const tx = db.transaction(["posts", "briefs", "media"], "readwrite");
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      try {
        tx.abort();
      } catch {
        reject(error instanceof Error ? error : new Error("corpus replacement failed"));
        return;
      }
      reject(error instanceof Error ? error : new Error("corpus replacement failed"));
    };
    tx.oncomplete = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    tx.onerror = () => fail(tx.error ?? new Error("corpus replacement failed"));
    tx.onabort = () => fail(tx.error ?? new Error("corpus replacement aborted"));
    try {
      tx.objectStore("posts").clear();
      tx.objectStore("briefs").clear();
      tx.objectStore("media").clear();
      for (const record of stores.posts) tx.objectStore("posts").put(record);
      for (const record of stores.briefs) tx.objectStore("briefs").put(record);
      for (const record of stores.media) tx.objectStore("media").put(record);
    } catch (error) {
      fail(error);
    }
  });
}

export function getRecord<T>(db: IDBDatabase, store: StoreName, key: string): Promise<T | undefined> {
  return transact<T | undefined>(db, store, "readonly", (storage) => storage.get(key));
}

export function allRecords<T>(db: IDBDatabase, store: StoreName): Promise<T[]> {
  return transact<T[]>(db, store, "readonly", (storage) => storage.getAll());
}

export function mediaForPost(db: IDBDatabase, postId: string): Promise<MediaRecord[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("media", "readonly");
    const request = tx.objectStore("media").index("by-post").getAll(postId);
    request.onsuccess = () => resolve(request.result as MediaRecord[]);
    request.onerror = () => reject(request.error);
  });
}

export function countRecords(db: IDBDatabase, store: StoreName): Promise<number> {
  return transact<number>(db, store, "readonly", (storage) => storage.count());
}

export function deleteRecord(db: IDBDatabase, store: StoreName, key: string): Promise<void> {
  return runWrite(db, store, `delete ${store} record`, (tx) => {
    tx.objectStore(store).delete(key);
  });
}

export function clearStore(db: IDBDatabase, store: StoreName): Promise<void> {
  return runWrite(db, store, `clear ${store} store`, (tx) => {
    tx.objectStore(store).clear();
  });
}
