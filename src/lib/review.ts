import { getRecord, openDb, putRecords, type ReviewRecord } from "./db.js";

export const REVIEW_LADDER = [1, 3, 7, 14, 30];
const DAY_MS = 24 * 60 * 60 * 1000;
const STREAK_KEY = "xmem.review.streak";

export interface Streak {
  count: number;
  lastDay: string;
}

function dayOf(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

export function nextInterval(currentDays: number): number {
  for (const step of REVIEW_LADDER) {
    if (step > currentDays) return step;
  }
  return REVIEW_LADDER[REVIEW_LADDER.length - 1] ?? 30;
}

export async function enqueueReviews(postIds: string[], now: number, deps?: { dbFactory?: IDBFactory; dbName?: string }): Promise<number> {
  const db = await openDb(deps?.dbFactory ?? indexedDB, deps?.dbName);
  let added = 0;
  try {
    for (const postId of postIds) {
      const existing = await getRecord(db, "review", postId);
      if (existing !== undefined) continue;
      await putRecords(db, "review", [{ dueAt: now, intervalDays: 0, postId } satisfies ReviewRecord]);
      added += 1;
    }
  } finally {
    db.close();
  }
  return added;
}

export async function dueReviews(now: number, deps?: { dbFactory?: IDBFactory; dbName?: string }): Promise<ReviewRecord[]> {
  const db = await openDb(deps?.dbFactory ?? indexedDB, deps?.dbName);
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("review", "readonly");
      const range = IDBKeyRange.upperBound(now);
      const request = tx.objectStore("review").index("by-due").getAll(range);
      request.onsuccess = () => resolve(request.result as ReviewRecord[]);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function recordReview(
  postId: string,
  kept: boolean,
  now: number,
  deps?: { dbFactory?: IDBFactory; dbName?: string },
): Promise<void> {
  const db = await openDb(deps?.dbFactory ?? indexedDB, deps?.dbName);
  try {
    const existing = await getRecord<ReviewRecord>(db, "review", postId);
    if (existing === undefined) return;
    if (!kept) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("review", "readwrite");
        const request = tx.objectStore("review").delete(postId);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      return;
    }
    const intervalDays = nextInterval(existing.intervalDays);
    await putRecords(db, "review", [{ dueAt: now + intervalDays * DAY_MS, intervalDays, postId }]);
  } finally {
    db.close();
  }
  await touchStreak(now);
}

export async function readStreak(): Promise<Streak> {
  const stored = await chrome.storage.local.get(STREAK_KEY);
  return (stored[STREAK_KEY] as Streak | undefined) ?? { count: 0, lastDay: "" };
}

export async function touchStreak(now: number): Promise<Streak> {
  const today = dayOf(now);
  const yesterday = dayOf(now - DAY_MS);
  const streak = await readStreak();
  let next: Streak;
  if (streak.lastDay === today) {
    next = streak;
  } else if (streak.lastDay === yesterday) {
    next = { count: streak.count + 1, lastDay: today };
  } else {
    next = { count: 1, lastDay: today };
  }
  await chrome.storage.local.set({ [STREAK_KEY]: next });
  return next;
}
