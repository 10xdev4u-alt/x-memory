import type { PostReferences } from "./threads.js";

export type PostStatus = "active" | "deleted" | "suspended";

export const DB_NAME = "x-memory";
export const DB_VERSION = 4;

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

export type StoreName = "posts" | "authors" | "media" | "briefs" | "claims" | "predictions" | "review";

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

export function putRecords(db: IDBDatabase, store: StoreName, records: unknown[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const storage = tx.objectStore(store);
    for (const record of records) storage.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
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
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const request = tx.objectStore(store).delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export function clearStore(db: IDBDatabase, store: StoreName): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const request = tx.objectStore(store).clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
