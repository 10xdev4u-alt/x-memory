import { countRecords, openDb, putRecords } from "./db.js";
import { clearProgress, readProgress, type SyncProgress, writeProgress } from "./sync-progress.js";
import { parseTimelinePage, type TimelinePage } from "./timeline.js";
import { ThrottleQueue } from "./queue.js";

export interface SyncTransport {
  fetchPage(operation: string, variables: Record<string, unknown>): Promise<{ data?: { bookmark_timeline_v2?: { timeline?: TimelinePage } } }>;
}

export interface SyncEngineDeps {
  dbFactory?: IDBFactory;
  dbName?: string;
  maxPages?: number;
  onProgress?: (completed: number) => void;
  pageSize?: number;
  queue?: ThrottleQueue;
  transport: SyncTransport;
}

export interface SyncResult {
  pages: number;
  stored: number;
}

const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_MAX_PAGES = 50;

export async function syncBookmarks(deps: SyncEngineDeps): Promise<SyncResult> {
  const db = await openDb(deps.dbFactory ?? indexedDB, deps.dbName);
  const queue = deps.queue ?? new ThrottleQueue();
  const pageSize = deps.pageSize ?? DEFAULT_PAGE_SIZE;
  const maxPages = deps.maxPages ?? DEFAULT_MAX_PAGES;
  const prior = await readProgress();
  let cursor = prior?.cursor;
  let completed = prior?.completed ?? 0;
  let stored = 0;
  let pages = 0;
  const startedAt = prior?.startedAt ?? Date.now();
  for (;;) {
    if (pages >= maxPages) break;
    const variables: Record<string, unknown> = { count: pageSize, includePromotedContent: true };
    if (cursor !== undefined) variables["cursor"] = cursor;
    const response = await queue.enqueue(() => deps.transport.fetchPage("Bookmarks", variables));
    const page = response.data?.bookmark_timeline_v2?.timeline;
    if (page === undefined) break;
    const parsed = parseTimelinePage(page);
    if (parsed.posts.length > 0) {
      await putRecords(
        db,
        "posts",
        parsed.posts.map((post) => ({
          authorId: post.authorId,
          createdAt: post.createdAt,
          id: post.id,
          provenance: "saved" as const,
          syncedAt: Date.now(),
          text: post.text,
          url: `https://x.com/i/status/${post.id}`,
        })),
      );
      stored += parsed.posts.length;
    }
    completed += parsed.posts.length;
    pages += 1;
    const progress: SyncProgress = {
      completed,
      startedAt,
      updatedAt: Date.now(),
    };
    if (parsed.cursor !== undefined) progress.cursor = parsed.cursor;
    await writeProgress(progress);
    deps.onProgress?.(completed);
    if (parsed.cursor === undefined) break;
    cursor = parsed.cursor;
  }
  await clearProgress();
  db.close();
  return { pages, stored };
}

export async function storedPostCount(deps: { dbFactory?: IDBFactory; dbName?: string }): Promise<number> {
  const db = await openDb(deps.dbFactory ?? indexedDB, deps.dbName);
  const count = await countRecords(db, "posts");
  db.close();
  return count;
}
