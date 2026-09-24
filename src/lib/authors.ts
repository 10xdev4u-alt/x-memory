import { allRecords, getRecord, putRecords, type AuthorRecord, type PostRecord } from "./db.js";

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
  const posts = await allRecords<PostRecord>(db, "posts");
  const postsByAuthor = new Map<string, PostRecord[]>();
  for (const post of posts) {
    const group = postsByAuthor.get(post.authorId) ?? [];
    group.push(post);
    postsByAuthor.set(post.authorId, group);
  }
  const now = Date.now();
  for (const [authorId, group] of byId) {
    const latest = group[group.length - 1];
    if (latest === undefined) continue;
    const existing = await getRecord<AuthorRecord>(db, "authors", authorId);
    const authorPosts = postsByAuthor.get(authorId) ?? [];
    const record: AuthorRecord = {
      handle: latest.authorHandle === "" ? (existing?.handle ?? "") : latest.authorHandle,
      id: authorId,
      lastSeen: now,
      likeCount: authorPosts.filter((post) => post.provenance === "liked" || post.provenance === "both").length,
      name: latest.authorName === "" ? (existing?.name ?? "") : latest.authorName,
      saveCount: authorPosts.filter((post) => post.provenance === "saved" || post.provenance === "both").length,
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
