export const DB_NAME = "x-memory";
export const DB_VERSION = 1;

export type Provenance = "saved" | "liked" | "both";

export interface PostRecord {
  id: string;
  authorId: string;
  authorHandle: string;
  authorName: string;
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

export type StoreName = "posts" | "authors" | "media" | "briefs";

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

export function countRecords(db: IDBDatabase, store: StoreName): Promise<number> {
  return transact<number>(db, store, "readonly", (storage) => storage.count());
}
