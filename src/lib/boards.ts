import { allRecords, getRecord, openDb, type PostRecord, type PredictionRecord } from "./db.js";
import { listCollections } from "./collections.js";

export interface ForecasterRow {
  accuracy: number;
  correct: number;
  handle: string;
  resolved: number;
}

export interface CuratorRow {
  forks: number;
  name: string;
  posts: number;
}

export async function forecasterBoard(deps?: { dbFactory?: IDBFactory; dbName?: string }): Promise<ForecasterRow[]> {
  const db = await openDb(deps?.dbFactory ?? indexedDB, deps?.dbName);
  try {
    const predictions = await allRecords<PredictionRecord>(db, "predictions");
    const byAuthor = new Map<string, { correct: number; resolved: number }>();
    for (const prediction of predictions) {
      if (prediction.status !== "resolved-true" && prediction.status !== "resolved-false") continue;
      const post = await getRecord<PostRecord>(db, "posts", prediction.postId);
      const key = post?.authorHandle !== undefined && post.authorHandle !== "" ? post.authorHandle : "unknown";
      const entry = byAuthor.get(key) ?? { correct: 0, resolved: 0 };
      entry.resolved += 1;
      if (prediction.status === "resolved-true") entry.correct += 1;
      byAuthor.set(key, entry);
    }
    return [...byAuthor.entries()]
      .map(([handle, entry]) => ({ accuracy: entry.correct / entry.resolved, correct: entry.correct, handle, resolved: entry.resolved }))
      .sort((a, b) => b.accuracy - a.accuracy || b.resolved - a.resolved || a.handle.localeCompare(b.handle));
  } finally {
    db.close();
  }
}

export async function curatorBoard(): Promise<CuratorRow[]> {
  const collections = await listCollections();
  const forks = new Map<string, number>();
  for (const collection of collections) {
    if (collection.originId !== undefined) forks.set(collection.originId, (forks.get(collection.originId) ?? 0) + 1);
  }
  return collections
    .map((collection) => ({ forks: forks.get(collection.id) ?? 0, name: collection.name, posts: collection.postIds.length }))
    .sort((a, b) => b.forks - a.forks || b.posts - a.posts || a.name.localeCompare(b.name));
}

export function renderBoardCard(title: string, rows: string[]): string {
  const lines = [`${title}`, ""];
  rows.forEach((row, index) => lines.push(`${index + 1}. ${row}`));
  return lines.join("\n");
}

export function forecasterCard(board: ForecasterRow[]): string {
  return renderBoardCard(
    "Top forecasters",
    board.slice(0, 10).map((row) => `@${row.handle} — ${Math.round(row.accuracy * 100)}% over ${row.resolved}`),
  );
}

export function curatorCard(board: CuratorRow[]): string {
  return renderBoardCard(
    "Top curators",
    board.slice(0, 10).map((row) => `${row.name} — ${row.posts} posts, ${row.forks} forks`),
  );
}
