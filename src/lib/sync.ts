import { countRecords, openDb, putRecords } from "./db.js";
import type { Provenance } from "./db.js";
import { upsertAuthors } from "./authors.js";
import { extractMedia } from "./entities.js";
import { clearProgress, readProgress, type SyncProgress, writeProgress } from "./sync-progress.js";
import { parseTimelinePage, type TimelinePage } from "./timeline.js";
import { ThrottleQueue } from "./queue.js";

export interface SyncTransport {
  fetchPage(operation: string, variables: Record<string, unknown>): Promise<{ data?: unknown }>;
}

export interface SyncTarget {
  operation: string;
  provenance: Provenance;
  timelineOf: (envelope: { data?: unknown }) => TimelinePage | undefined;
  variables: (pageSize: number, cursor: string | undefined, extra: Record<string, unknown>) => Record<string, unknown>;
}

function bookmarkTimelineOf(envelope: { data?: unknown }): TimelinePage | undefined {
  const data = envelope.data as { bookmark_timeline_v2?: { timeline?: TimelinePage } } | undefined;
  return data?.bookmark_timeline_v2?.timeline;
}

function likesTimelineOf(envelope: { data?: unknown }): TimelinePage | undefined {
  const data = envelope.data as
    | { user?: { result?: { timeline_v2?: { timeline?: TimelinePage }; timeline?: { timeline?: TimelinePage } } } }
    | undefined;
  const timelines = data?.user?.result;
  return timelines?.timeline_v2?.timeline ?? timelines?.timeline?.timeline;
}

export const BOOKMARKS_TARGET: SyncTarget = {
  operation: "Bookmarks",
  provenance: "saved",
  timelineOf: bookmarkTimelineOf,
  variables: (pageSize, cursor) => {
    const variables: Record<string, unknown> = { count: pageSize, includePromotedContent: true };
    if (cursor !== undefined) variables["cursor"] = cursor;
    return variables;
  },
};

export function likesTarget(userId: string): SyncTarget {
  return {
    operation: "Likes",
    provenance: "liked",
    timelineOf: likesTimelineOf,
    variables: (pageSize, cursor) => {
      const variables: Record<string, unknown> = { count: pageSize, userId };
      if (cursor !== undefined) variables["cursor"] = cursor;
      return variables;
    },
  };
}

export interface SyncEngineDeps {
  dbFactory?: IDBFactory;
  dbName?: string;
  extraVariables?: Record<string, unknown>;
  maxPages?: number;
  onProgress?: (completed: number) => void;
  pageSize?: number;
  queue?: ThrottleQueue;
  target: SyncTarget;
  transport: SyncTransport;
}

export interface SyncResult {
  pages: number;
  stored: number;
}

const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_MAX_PAGES = 50;

export async function syncTimeline(deps: SyncEngineDeps): Promise<SyncResult> {
  const db = await openDb(deps.dbFactory ?? indexedDB, deps.dbName);
  const queue = deps.queue ?? new ThrottleQueue();
  const pageSize = deps.pageSize ?? DEFAULT_PAGE_SIZE;
  const maxPages = deps.maxPages ?? DEFAULT_MAX_PAGES;
  const extra = deps.extraVariables ?? {};
  const prior = await readProgress();
  let cursor = prior?.cursor;
  let completed = prior?.completed ?? 0;
  let stored = 0;
  let pages = 0;
  const startedAt = prior?.startedAt ?? Date.now();
  for (;;) {
    if (pages >= maxPages) break;
    const variables = deps.target.variables(pageSize, cursor, extra);
    const response = await queue.enqueue(() => deps.transport.fetchPage(deps.target.operation, variables));
    const page = deps.target.timelineOf(response);
    if (page === undefined) break;
    const parsed = parseTimelinePage(page);
    if (parsed.posts.length > 0) {
      await putRecords(
        db,
        "posts",
        parsed.posts.map((post) => ({
          authorHandle: post.authorHandle,
          authorId: post.authorId,
          authorName: post.authorName,
          createdAt: post.createdAt,
          id: post.id,
          provenance: deps.target.provenance,
          references: post.references,
          syncedAt: Date.now(),
          text: post.text,
          url: `https://x.com/i/status/${post.id}`,
        })),
      );
      await upsertAuthors(
        db,
        parsed.posts.map((post) => ({
          authorHandle: post.authorHandle,
          authorId: post.authorId,
          authorName: post.authorName,
          provenance: deps.target.provenance,
          seenAt: Date.now(),
        })),
      );
      const media = parsed.posts.flatMap((post) => extractMedia(post.id, post.entities, post.text));
      if (media.length > 0) await putRecords(db, "media", media);
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

export function syncBookmarks(deps: Omit<SyncEngineDeps, "target">): Promise<SyncResult> {
  return syncTimeline({ ...deps, target: BOOKMARKS_TARGET });
}

export function syncLikes(deps: Omit<SyncEngineDeps, "target"> & { userId: string }): Promise<SyncResult> {
  const { userId, ...rest } = deps;
  return syncTimeline({ ...rest, target: likesTarget(userId) });
}

export async function storedPostCount(deps: { dbFactory?: IDBFactory; dbName?: string }): Promise<number> {
  const db = await openDb(deps.dbFactory ?? indexedDB, deps.dbName);
  const count = await countRecords(db, "posts");
  db.close();
  return count;
}
