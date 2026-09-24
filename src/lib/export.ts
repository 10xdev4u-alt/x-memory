import type { BriefRecord, MediaRecord, PostRecord } from "./db.js";
import { provenanceLabel } from "./reader-model.js";

export interface ExportBundle {
  briefs: BriefRecord[];
  exportedAt: string;
  media: MediaRecord[];
  posts: PostRecord[];
  version: 1;
}

function authorOf(post: PostRecord): string {
  return post.authorHandle !== "" ? `@${post.authorHandle}` : post.authorId;
}

function timeOf(post: PostRecord): string {
  return post.createdAt > 0 ? new Date(post.createdAt).toISOString() : "unknown time";
}

export function postsToMarkdown(
  posts: PostRecord[],
  briefsById: Map<string, string>,
  mediaByPostId: Map<string, MediaRecord[]>,
): string {
  const sections = posts.map((post) => {
    const lines = [
      `## ${authorOf(post)} · ${provenanceLabel(post.provenance)}`,
      "",
      post.text,
      "",
      `- Original: ${post.url}`,
      `- Saved: ${timeOf(post)}`,
    ];
    const brief = briefsById.get(post.id);
    if (brief !== undefined) lines.push("", `> ${brief}`);
    for (const item of mediaByPostId.get(post.id) ?? []) {
      lines.push(`- ${item.kind}: ${item.url}`);
    }
    return lines.join("\n");
  });
  return `# x-memory export\n\nExported ${new Date().toISOString()} · ${posts.length} posts.\n\n${sections.join("\n\n---\n\n")}\n`;
}

export function bundleCorpus(posts: PostRecord[], briefs: BriefRecord[], media: MediaRecord[]): ExportBundle {
  return { briefs, exportedAt: new Date().toISOString(), media, posts, version: 1 };
}

export function bundleToJson(bundle: ExportBundle): string {
  return JSON.stringify(bundle);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isReferences(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value["quotedIds"])) return false;
  if (!value["quotedIds"].every((id) => isNonEmptyString(id))) return false;
  return value["replyToId"] === undefined || isNonEmptyString(value["replyToId"]);
}

function isPost(value: unknown): value is PostRecord {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value["id"]) &&
    isNonEmptyString(value["authorId"]) &&
    isString(value["authorHandle"]) &&
    isString(value["authorName"]) &&
    isString(value["text"]) &&
    isNonEmptyString(value["url"]) &&
    isReferences(value["references"]) &&
    (value["status"] === "active" || value["status"] === "deleted" || value["status"] === "suspended") &&
    (value["provenance"] === "saved" || value["provenance"] === "liked" || value["provenance"] === "both") &&
    isFiniteNumber(value["createdAt"]) &&
    isFiniteNumber(value["syncedAt"])
  );
}

function isBrief(value: unknown): value is BriefRecord {
  return isRecord(value) && isNonEmptyString(value["postId"]) && isString(value["text"]) && isFiniteNumber(value["createdAt"]);
}

function isMedia(value: unknown): value is MediaRecord {
  return (
    isRecord(value) &&
    isNonEmptyString(value["id"]) &&
    isNonEmptyString(value["postId"]) &&
    (value["kind"] === "image" || value["kind"] === "video" || value["kind"] === "link") &&
    isNonEmptyString(value["url"])
  );
}

function assertUniqueIds(records: Array<{ id?: string; postId?: string }>, field: "id" | "postId", label: string): void {
  const ids = new Set<string>();
  for (const record of records) {
    const id = record[field];
    if (id === undefined || ids.has(id)) {
      throw new Error(`invalid export bundle: duplicate or missing ${label} ${field}`);
    }
    ids.add(id);
  }
}

export function bundleFromJson(raw: string): ExportBundle {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed) || parsed["version"] !== 1 || !isNonEmptyString(parsed["exportedAt"])) {
    throw new Error("unsupported export bundle");
  }
  if (!Array.isArray(parsed["posts"]) || !Array.isArray(parsed["briefs"]) || !Array.isArray(parsed["media"])) {
    throw new Error("invalid export bundle: arrays are required");
  }
  if (!parsed["posts"].every(isPost) || !parsed["briefs"].every(isBrief) || !parsed["media"].every(isMedia)) {
    throw new Error("invalid export bundle: record shape");
  }
  const posts = parsed["posts"] as PostRecord[];
  const briefs = parsed["briefs"] as BriefRecord[];
  const media = parsed["media"] as MediaRecord[];
  assertUniqueIds(posts, "id", "post");
  assertUniqueIds(briefs, "postId", "brief");
  assertUniqueIds(media, "id", "media");
  const postIds = new Set(posts.map((post) => post.id));
  if (briefs.some((brief) => !postIds.has(brief.postId)) || media.some((item) => !postIds.has(item.postId))) {
    throw new Error("invalid export bundle: orphan record");
  }
  return { briefs, exportedAt: parsed["exportedAt"], media, posts, version: 1 };
}
