import { allRecords, clearStore, openDb, putRecords, type BriefRecord, type MediaRecord, type PostRecord } from "./db.js";
import { bundleCorpus, bundleFromJson, bundleToJson, type ExportBundle } from "./export.js";

export interface BackupRestoreResult {
  briefs: number;
  media: number;
  posts: number;
}

export async function createBackup(deps: { dbFactory?: IDBFactory; dbName?: string }): Promise<string> {
  const db = await openDb(deps.dbFactory ?? indexedDB, deps.dbName);
  const posts = await allRecords<PostRecord>(db, "posts");
  const briefs = await allRecords<BriefRecord>(db, "briefs");
  const media = await allRecords<MediaRecord>(db, "media");
  db.close();
  return bundleToJson(bundleCorpus(posts, briefs, media));
}

export async function restoreBackup(
  raw: string,
  deps: { dbFactory?: IDBFactory; dbName?: string },
): Promise<BackupRestoreResult> {
  const bundle: ExportBundle = bundleFromJson(raw);
  const db = await openDb(deps.dbFactory ?? indexedDB, deps.dbName);
  await clearStore(db, "posts");
  await clearStore(db, "briefs");
  await clearStore(db, "media");
  await putRecords(db, "posts", bundle.posts);
  await putRecords(db, "briefs", bundle.briefs);
  await putRecords(db, "media", bundle.media);
  db.close();
  return { briefs: bundle.briefs.length, media: bundle.media.length, posts: bundle.posts.length };
}
