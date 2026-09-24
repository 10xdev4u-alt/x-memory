import { rankAuthors } from "./authors.js";
import { clusterPosts } from "./taxonomy.js";
import { allRecords, countRecords, openDb, type PostRecord } from "./db.js";
import { listCollections } from "./collections.js";
import { loopCounts } from "./loops.js";

export interface ProfileCluster {
  count: number;
  label: string;
}

export interface ProfileMind {
  handle: string;
  score: number;
}

export interface ProfileCollection {
  count: number;
  name: string;
}

export interface TasteProfile {
  clusters: ProfileCluster[];
  collections: ProfileCollection[];
  generatedAt: number;
  minds: ProfileMind[];
  stats: {
    briefs: number;
    loopsOpen: number;
    loopsResolved: number;
    posts: number;
  };
}

export interface ProfileBuildDeps {
  dbFactory?: IDBFactory;
  dbName?: string;
  onProgress?: (progress: number) => void;
  posts?: PostRecord[];
  signal?: AbortSignal;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new DOMException("Profile build cancelled", "AbortError");
}

export async function buildTasteProfile(deps?: ProfileBuildDeps): Promise<TasteProfile> {
  const db = await openDb(deps?.dbFactory ?? indexedDB, deps?.dbName);
  try {
    throwIfAborted(deps?.signal);
    deps?.onProgress?.(10);
    const posts = deps?.posts ?? await allRecords<PostRecord>(db, "posts");
    throwIfAborted(deps?.signal);
    deps?.onProgress?.(35);
    const clusters = clusterPosts(posts.map((post) => ({ authorHandle: post.authorHandle, id: post.id, text: post.text })));
    throwIfAborted(deps?.signal);
    deps?.onProgress?.(60);
    const ranked = await rankAuthors(db, 5);
    const collections = await listCollections();
    const briefs = await countRecords(db, "briefs");
    const loops = deps === undefined ? await loopCounts() : await loopCounts(deps);
    throwIfAborted(deps?.signal);
    deps?.onProgress?.(100);
    return {
      clusters: clusters.slice(0, 5).map((cluster) => ({ count: cluster.postIds.length, label: cluster.label })),
      collections: collections.map((collection) => ({ count: collection.postIds.length, name: collection.name })),
      generatedAt: Date.now(),
      minds: ranked.map((author) => ({ handle: author.handle === "" ? author.id : author.handle, score: author.score })),
      stats: { briefs, loopsOpen: loops.open, loopsResolved: loops.resolved, posts: posts.length },
    };
  } finally {
    db.close();
  }
}
