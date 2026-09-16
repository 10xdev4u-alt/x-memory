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

export async function buildTasteProfile(deps?: { dbFactory?: IDBFactory; dbName?: string }): Promise<TasteProfile> {
  const db = await openDb(deps?.dbFactory ?? indexedDB, deps?.dbName);
  try {
    const posts = await allRecords<PostRecord>(db, "posts");
    const clusters = clusterPosts(posts.map((post) => ({ authorHandle: post.authorHandle, id: post.id, text: post.text })));
    const ranked = await rankAuthors(db, 5);
    const collections = await listCollections();
    const briefs = await countRecords(db, "briefs");
    const loops = deps === undefined ? await loopCounts() : await loopCounts(deps);
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
