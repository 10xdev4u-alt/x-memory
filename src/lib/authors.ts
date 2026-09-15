import { getRecord, putRecords, type AuthorRecord } from "./db.js";

export interface AuthorSignal {
  authorHandle: string;
  authorId: string;
  authorName: string;
  provenance: "saved" | "liked" | "both";
  seenAt: number;
}

export function scoreAuthor(author: AuthorRecord): number {
  return author.saveCount * 2 + author.likeCount;
}

export interface RankedAuthor extends AuthorRecord {
  score: number;
}

export async function upsertAuthors(db: IDBDatabase, signals: AuthorSignal[]): Promise<void> {
  const byId = new Map<string, AuthorSignal[]>();
  for (const signal of signals) {
    const group = byId.get(signal.authorId) ?? [];
    group.push(signal);
    byId.set(signal.authorId, group);
  }
  const now = Date.now();
  for (const [authorId, group] of byId) {
    const latest = group[group.length - 1];
    if (latest === undefined) continue;
    const existing = await getRecord<AuthorRecord>(db, "authors", authorId);
    const saves = group.filter((signal) => signal.provenance !== "liked").length;
    const likes = group.filter((signal) => signal.provenance !== "saved").length;
    const record: AuthorRecord = {
      handle: latest.authorHandle === "" ? (existing?.handle ?? "") : latest.authorHandle,
      id: authorId,
      lastSeen: now,
      likeCount: (existing?.likeCount ?? 0) + likes,
      name: latest.authorName === "" ? (existing?.name ?? "") : latest.authorName,
      saveCount: (existing?.saveCount ?? 0) + saves,
    };
    await putRecords(db, "authors", [record]);
  }
}

export async function rankAuthors(db: IDBDatabase, limit: number): Promise<RankedAuthor[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("authors", "readonly");
    const request = tx.objectStore("authors").getAll();
    request.onsuccess = () => {
      const authors = (request.result as AuthorRecord[])
        .map((author) => ({ ...author, score: scoreAuthor(author) }))
        .sort((a, b) => b.score - a.score || b.lastSeen - a.lastSeen);
      resolve(authors.slice(0, limit));
    };
    request.onerror = () => reject(request.error);
  });
}
