import { getRecord, openDb, putRecords } from "./db.js";
import { saveCollection } from "./collections.js";

export interface SharedPost {
  authorHandle: string;
  authorName: string;
  createdAt: number;
  id: string;
  text: string;
  url: string;
}

export interface SharedPackage {
  briefs: Record<string, string>;
  description?: string;
  id: string;
  name: string;
  posts: SharedPost[];
  v: 1;
}

export const INLINE_LIMIT = 1500;

function encodePayload(payload: unknown): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodePayload(hash: string): unknown {
  const normalized = hash.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

export function packageCollection(
  id: string,
  name: string,
  description: string | undefined,
  posts: SharedPost[],
  briefs: Record<string, string>,
): SharedPackage {
  const pkg: SharedPackage = { briefs, id, name, posts, v: 1 };
  if (description !== undefined && description !== "") pkg.description = description;
  return pkg;
}

export function shareLink(pkg: SharedPackage): string {
  return `#xmem1-${encodePayload(pkg)}`;
}

export function canShareInline(pkg: SharedPackage): boolean {
  return shareLink(pkg).length <= INLINE_LIMIT;
}

export interface ImportResult {
  briefs: number;
  collectionId: string;
  posts: number;
}

export async function importSharedPackage(
  pkg: unknown,
  deps?: { dbFactory?: IDBFactory; dbName?: string },
): Promise<ImportResult> {
  const validated = validateSharedPackage(pkg);
  const now = Date.now();
  const db = await openDb(deps?.dbFactory ?? indexedDB, deps?.dbName);
  try {
    await putRecords(
      db,
      "posts",
      validated.posts.map((post) => ({
        authorHandle: post.authorHandle,
        authorId: post.authorHandle !== "" ? `shared:${post.authorHandle}` : `shared:${post.id}`,
        authorName: post.authorName,
        createdAt: post.createdAt,
        id: post.id,
        provenance: "saved" as const,
        references: { quotedIds: [] as string[] },
        status: "active" as const,
        syncedAt: now,
        text: post.text,
        url: post.url,
      })),
    );
    const briefs = Object.entries(validated.briefs).map(([postId, text]) => ({ createdAt: now, postId, text }));
    if (briefs.length > 0) await putRecords(db, "briefs", briefs);
  } finally {
    db.close();
  }
  const collectionId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `c-${now}`;
  await saveCollection({ createdAt: now, id: collectionId, name: validated.name, originId: validated.id, postIds: validated.posts.map((post) => post.id), updatedAt: now });
  return { briefs: Object.keys(validated.briefs).length, collectionId, posts: validated.posts.length };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isSharedPost(value: unknown): value is SharedPost {
  if (!isRecord(value) || !hasOnlyKeys(value, new Set(["authorHandle", "authorName", "createdAt", "id", "text", "url"]))) return false;
  return (
    typeof value["authorHandle"] === "string" &&
    typeof value["authorName"] === "string" &&
    typeof value["createdAt"] === "number" &&
    Number.isFinite(value["createdAt"]) &&
    isNonEmptyString(value["id"]) &&
    typeof value["text"] === "string" &&
    isHttpsUrl(value["url"])
  );
}

export function validateSharedPackage(value: unknown): SharedPackage {
  const allowed = new Set(["briefs", "description", "id", "name", "posts", "v"]);
  if (!isRecord(value) || !hasOnlyKeys(value, allowed) || value["v"] !== 1 || !isNonEmptyString(value["id"]) || !isNonEmptyString(value["name"])) {
    throw new Error("unsupported shared package");
  }
  if (value["description"] !== undefined && typeof value["description"] !== "string") {
    throw new Error("unsupported shared package");
  }
  if (!isRecord(value["briefs"]) || !Array.isArray(value["posts"]) || !value["posts"].every(isSharedPost)) {
    throw new Error("unsupported shared package");
  }
  const briefs: Record<string, string> = {};
  for (const [postId, text] of Object.entries(value["briefs"])) {
    if (!isNonEmptyString(postId) || typeof text !== "string") throw new Error("unsupported shared package");
    briefs[postId] = text;
  }
  const posts = value["posts"] as SharedPost[];
  const postIds = new Set<string>();
  for (const post of posts) {
    if (postIds.has(post.id)) throw new Error("unsupported shared package");
    postIds.add(post.id);
  }
  if (Object.keys(briefs).some((postId) => !postIds.has(postId))) {
    throw new Error("unsupported shared package");
  }
  return {
    briefs,
    ...(value["description"] === undefined ? {} : { description: value["description"] as string }),
    id: value["id"],
    name: value["name"],
    posts,
    v: 1,
  };
}

export function parseSharedLink(hash: string): SharedPackage {
  const match = /^#xmem1-(.+)$/.exec(hash.trim());
  if (match?.[1] === undefined) throw new Error("not a shared collection link");
  return validateSharedPackage(decodePayload(match[1]));
}
