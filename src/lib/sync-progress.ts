import type { SessionState } from "./settings.js";

const PROGRESS_KEY = "xmem.sync.progress";

export interface SyncProgress {
  cursor?: string;
  completed: number;
  total?: number;
  startedAt: number;
  updatedAt: number;
}

export type ResumePlan =
  | { action: "start" }
  | { action: "resume"; cursor: string }
  | { action: "await-auth"; reason: string };

export async function readProgress(): Promise<SyncProgress | undefined> {
  const stored = await chrome.storage.local.get(PROGRESS_KEY);
  return stored[PROGRESS_KEY] as SyncProgress | undefined;
}

export async function writeProgress(progress: SyncProgress): Promise<void> {
  await chrome.storage.local.set({ [PROGRESS_KEY]: progress });
}

export async function clearProgress(): Promise<void> {
  await chrome.storage.local.remove(PROGRESS_KEY);
}

export function planResume(progress: SyncProgress | undefined, session: SessionState): ResumePlan {
  if (session === "missing" || session === "unknown") {
    return { action: "await-auth", reason: "Log into X before sync can continue." };
  }
  if (session === "expired") {
    return { action: "await-auth", reason: "The session expired mid-sync. Log in again to resume." };
  }
  if (progress === undefined || progress.cursor === undefined) {
    return { action: "start" };
  }
  return { action: "resume", cursor: progress.cursor };
}

export function progressSummary(progress: SyncProgress | undefined): string {
  if (progress === undefined) return "Sync has not started.";
  const total = progress.total === undefined ? "unknown total" : `of ${progress.total}`;
  return `Synced ${progress.completed} ${total}.`;
}
