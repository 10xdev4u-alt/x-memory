import { deleteRecord, getRecord, openDb, type PostRecord, type Provenance } from "./db.js";
import { ThrottleQueue } from "./queue.js";

export const DELETE_BOOKMARK_OPERATION = "DeleteBookmark";
export const UNLIKE_OPERATION = "UnfavoriteTweet";

export type Mutate = (operation: string, variables: Record<string, unknown>) => Promise<unknown>;

export interface UnsaveResult {
  memoryKept: boolean;
  unbookmarked: boolean;
  unliked: boolean;
}

export interface UnsaveDeps {
  dbFactory?: IDBFactory;
  dbName?: string;
  mutate: Mutate;
  queue?: ThrottleQueue;
}

export async function unsavePost(postId: string, provenance: Provenance, deps: UnsaveDeps): Promise<UnsaveResult> {
  const queue = deps.queue ?? new ThrottleQueue();
  const result: UnsaveResult = { memoryKept: false, unbookmarked: false, unliked: false };
  if (provenance === "saved" || provenance === "both") {
    await queue.enqueue(() => deps.mutate(DELETE_BOOKMARK_OPERATION, { tweet_id: postId }));
    result.unbookmarked = true;
  }
  if (provenance === "liked" || provenance === "both") {
    await queue.enqueue(() => deps.mutate(UNLIKE_OPERATION, { tweet_id: postId }));
    result.unliked = true;
  }
  const db = await openDb(deps.dbFactory ?? indexedDB, deps.dbName);
  try {
    const brief = await getRecord(db, "briefs", postId);
    result.memoryKept = brief !== undefined;
    const post = await getRecord<PostRecord>(db, "posts", postId);
    if (post !== undefined) await deleteRecord(db, "posts", postId);
  } finally {
    db.close();
  }
  return result;
}
