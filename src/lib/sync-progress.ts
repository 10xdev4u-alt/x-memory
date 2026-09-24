import type { SessionState } from "./settings.js";

const PROGRESS_PREFIX = "xmem.sync.progress.";
export const PROGRESS_SCHEMA_VERSION = 1;
export const PROGRESS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface SyncProgressIdentity {
  accountId: string;
  operation: string;
  schemaVersion: typeof PROGRESS_SCHEMA_VERSION;
}

export interface SyncProgress extends SyncProgressIdentity {
  completed: number;
  cursor?: string;
  startedAt: number;
  total?: number;
  updatedAt: number;
}

export type ResumePlan =
  | { action: "start" }
  | { action: "resume"; cursor: string }
  | { action: "await-auth"; reason: string };

function progressKey(identity: SyncProgressIdentity): string {
  return `${PROGRESS_PREFIX}${encodeURIComponent(identity.accountId)}.${encodeURIComponent(identity.operation)}.v${identity.schemaVersion}`;
}

function isProgress(value: unknown, identity: SyncProgressIdentity): value is SyncProgress {
  if (typeof value !== "object" || value === null) return false;
  const progress = value as Record<string, unknown>;
  return (
    progress["accountId"] === identity.accountId &&
    progress["operation"] === identity.operation &&
    progress["schemaVersion"] === identity.schemaVersion &&
    typeof progress["completed"] === "number" &&
    Number.isFinite(progress["completed"]) &&
    typeof progress["startedAt"] === "number" &&
    Number.isFinite(progress["startedAt"]) &&
    typeof progress["updatedAt"] === "number" &&
    Number.isFinite(progress["updatedAt"]) &&
    (progress["cursor"] === undefined || typeof progress["cursor"] === "string") &&
    (progress["total"] === undefined || (typeof progress["total"] === "number" && Number.isFinite(progress["total"])))
  );
}

export async function readProgress(identity: SyncProgressIdentity): Promise<SyncProgress | undefined> {
  const key = progressKey(identity);
  const stored = await chrome.storage.local.get(key);
  const progress = stored[key];
  if (!isProgress(progress, identity) || Date.now() - progress.updatedAt > PROGRESS_MAX_AGE_MS) {
    await clearProgress(identity);
    return undefined;
  }
  return progress;
}

export async function writeProgress(progress: SyncProgress): Promise<void> {
  if (!isProgress(progress, progress)) throw new Error("invalid sync progress");
  await chrome.storage.local.set({ [progressKey(progress)]: progress });
}

export async function clearProgress(identity: SyncProgressIdentity): Promise<void> {
  await chrome.storage.local.remove(progressKey(identity));
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
