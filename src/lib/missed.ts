import { rankAuthors } from "./authors.js";
import { allRecords, openDb, type PostRecord } from "./db.js";

export interface MissedOptions {
  dbFactory?: IDBFactory;
  dbName?: string;
  limit?: number;
  minScore?: number;
  since: number;
}

export async function missedFromTrusted(options: MissedOptions): Promise<PostRecord[]> {
  const db = await openDb(options.dbFactory ?? indexedDB, options.dbName);
  try {
    const ranked = await rankAuthors(db, 50);
    const threshold = options.minScore ?? 1;
    const trusted = new Set(ranked.filter((author) => author.score >= threshold).map((author) => author.id));
    const posts = await allRecords<PostRecord>(db, "posts");
    return posts
      .filter((post) => trusted.has(post.authorId) && post.createdAt >= options.since)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, options.limit ?? 20);
  } finally {
    db.close();
  }
}
