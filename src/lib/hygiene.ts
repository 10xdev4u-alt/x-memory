import { deleteRecord, getRecord, mediaForPost, putRecords, type BriefRecord, type MediaRecord, type PostRecord, type PostStatus } from "./db.js";

export type { PostStatus };

export interface HygienePost {
  id: string;
  text: string;
}

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/[^\s)]+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findDuplicateGroups(posts: HygienePost[]): string[][] {
  const buckets = new Map<string, string[]>();
  for (const post of posts) {
    const key = normalizeText(post.text);
    if (key === "") continue;
    const bucket = buckets.get(key) ?? [];
    bucket.push(post.id);
    buckets.set(key, bucket);
  }
  return [...buckets.values()].filter((group) => group.length > 1);
}

export type StatusLookup = (ids: string[]) => Promise<Map<string, PostStatus>>;

export async function verifyPosts(
  ids: string[],
  lookup: StatusLookup,
  onDead: (id: string, status: PostStatus) => Promise<void>,
): Promise<{ checked: number; dead: string[] }> {
  const dead: string[] = [];
  const statuses = await lookup(ids);
  for (const id of ids) {
    const status = statuses.get(id) ?? "active";
    if (status !== "active") {
      dead.push(id);
      await onDead(id, status);
    }
  }
  return { checked: ids.length, dead };
}

export async function markDeadPosts(db: IDBDatabase, entries: Array<{ id: string; status: PostStatus }>): Promise<void> {
  for (const entry of entries) {
    if (entry.status === "active") continue;
    const post = await getRecord<PostRecord>(db, "posts", entry.id);
    if (post === undefined) continue;
    await putRecords(db, "posts", [{ ...post, status: entry.status }]);
  }
}

export async function mergeDuplicates(db: IDBDatabase, keepId: string, dropIds: string[]): Promise<void> {
  let keepBrief = await getRecord<BriefRecord>(db, "briefs", keepId);
  let index = 0;
  for (const dropId of dropIds) {
    if (dropId === keepId) continue;
    const media = await mediaForPost(db, dropId);
    for (const item of media) {
      await deleteRecord(db, "media", item.id);
    }
    const repointed: MediaRecord[] = media.map((item) => ({
      ...item,
      id: `${keepId}#g${index++}`,
      postId: keepId,
    }));
    if (repointed.length > 0) await putRecords(db, "media", repointed);
    if (keepBrief === undefined) {
      const dropBrief = await getRecord<BriefRecord>(db, "briefs", dropId);
      if (dropBrief !== undefined) {
        await putRecords(db, "briefs", [{ ...dropBrief, postId: keepId }]);
        keepBrief = { ...dropBrief, postId: keepId };
      }
    }
    await deleteRecord(db, "briefs", dropId);
    await deleteRecord(db, "posts", dropId);
  }
}
