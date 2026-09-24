import { readCurrentAccount } from "./accounts.js";
import { allRecords, openDb, type PostRecord } from "./db.js";
import { buildTasteProfile, type ProfileBuildDeps, type TasteProfile } from "./profile.js";

const CACHE_PREFIX = "xmem.profile.cache.";

export type ProfileJobStatus = "running" | "ready" | "cancelled" | "error";

export interface ProfileJobState {
  error?: string;
  profile?: TasteProfile;
  progress: number;
  status: ProfileJobStatus;
}

export interface ProfileJobOptions {
  accountId?: string;
  build?: (deps: ProfileBuildDeps) => Promise<TasteProfile>;
  dbFactory?: IDBFactory;
  dbName?: string;
  onState?: (state: ProfileJobState) => void;
}

export interface ProfileJobHandle {
  cancel(): void;
  promise: Promise<TasteProfile | undefined>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProfile(value: unknown): value is TasteProfile {
  if (!isRecord(value) || typeof value.generatedAt !== "number") return false;
  if (!Array.isArray(value.clusters) || !Array.isArray(value.collections) || !Array.isArray(value.minds)) return false;
  if (!isRecord(value.stats)) return false;
  const stats = value.stats;
  return ["briefs", "loopsOpen", "loopsResolved", "posts"].every((key) => typeof stats[key] === "number");
}

function hashPosts(posts: PostRecord[]): string {
  const input = posts
    .map((post) => `${post.id}:${post.syncedAt}:${post.text.length}`)
    .sort()
    .join("|");
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${posts.length}-${(hash >>> 0).toString(16)}`;
}

export function profileCorpusVersion(posts: PostRecord[]): string {
  return hashPosts(posts);
}

function cacheKey(accountId: string, corpusVersion: string): string {
  return `${CACHE_PREFIX}${encodeURIComponent(accountId)}.${encodeURIComponent(corpusVersion)}`;
}

async function readCachedProfile(key: string): Promise<TasteProfile | undefined> {
  const stored = await chrome.storage.local.get(key);
  const value = stored[key];
  return isProfile(value) ? value : undefined;
}

async function writeCachedProfile(key: string, profile: TasteProfile): Promise<void> {
  await chrome.storage.local.set({ [key]: profile });
}

export function scheduleTasteProfile(options: ProfileJobOptions = {}): ProfileJobHandle {
  const controller = new AbortController();
  let cancelled = false;
  let resolvePromise: (profile: TasteProfile | undefined) => void = () => undefined;
  const promise = new Promise<TasteProfile | undefined>((resolve) => {
    resolvePromise = resolve;
  });
  const emit = (state: ProfileJobState): void => {
    if (!cancelled || state.status === "cancelled") options.onState?.(state);
  };

  const run = async (): Promise<void> => {
    if (cancelled) {
      emit({ progress: 0, status: "cancelled" });
      resolvePromise(undefined);
      return;
    }
    emit({ progress: 0, status: "running" });
    try {
      const db = await openDb(options.dbFactory ?? indexedDB, options.dbName);
      const posts = await allRecords<PostRecord>(db, "posts");
      db.close();
      if (cancelled || controller.signal.aborted) throw new DOMException("Profile job cancelled", "AbortError");
      const accountId = options.accountId ?? (await readCurrentAccount()) ?? "unknown";
      const version = profileCorpusVersion(posts);
      const cached = await readCachedProfile(cacheKey(accountId, version));
      if (cached !== undefined) {
        emit({ profile: cached, progress: 100, status: "ready" });
        resolvePromise(cached);
        return;
      }
      const build = options.build ?? buildTasteProfile;
      const buildDeps: ProfileBuildDeps = {
        onProgress: (progress) => emit({ progress, status: "running" }),
        posts,
        signal: controller.signal,
      };
      if (options.dbFactory !== undefined) buildDeps.dbFactory = options.dbFactory;
      if (options.dbName !== undefined) buildDeps.dbName = options.dbName;
      const profile = await build(buildDeps);
      if (cancelled || controller.signal.aborted) throw new DOMException("Profile job cancelled", "AbortError");
      await writeCachedProfile(cacheKey(accountId, version), profile);
      emit({ profile, progress: 100, status: "ready" });
      resolvePromise(profile);
    } catch (error) {
      if (cancelled || (error instanceof DOMException && error.name === "AbortError")) {
        emit({ progress: 0, status: "cancelled" });
        resolvePromise(undefined);
        return;
      }
      emit({ error: error instanceof Error ? error.message : String(error), progress: 0, status: "error" });
      resolvePromise(undefined);
    }
  };

  const timer = setTimeout(() => void run(), 0);
  return {
    cancel: () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
      emit({ progress: 0, status: "cancelled" });
      resolvePromise(undefined);
    },
    promise,
  };
}
