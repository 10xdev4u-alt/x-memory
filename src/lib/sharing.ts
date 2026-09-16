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
  pkg: SharedPackage,
  deps?: { dbFactory?: IDBFactory; dbName?: string },
): Promise<ImportResult> {
  const now = Date.now();
  const db = await openDb(deps?.dbFactory ?? indexedDB, deps?.dbName);
  try {
    await putRecords(
      db,
      "posts",
      pkg.posts.map((post) => ({
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
    const briefs = Object.entries(pkg.briefs).map(([postId, text]) => ({ createdAt: now, postId, text }));
    if (briefs.length > 0) await putRecords(db, "briefs", briefs);
  } finally {
    db.close();
  }
  const collectionId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `c-${now}`;
  await saveCollection({ createdAt: now, id: collectionId, name: pkg.name, originId: pkg.id, postIds: pkg.posts.map((post) => post.id), updatedAt: now });
  return { briefs: Object.keys(pkg.briefs).length, collectionId, posts: pkg.posts.length };
}

export function parseSharedLink(hash: string): SharedPackage {  const match = /^#xmem1-(.+)$/.exec(hash.trim());
  if (match?.[1] === undefined) throw new Error("not a shared collection link");
  const parsed = decodePayload(match[1]) as Partial<SharedPackage>;
  if (parsed.v !== 1 || typeof parsed.id !== "string" || typeof parsed.name !== "string" || !Array.isArray(parsed.posts)) {
    throw new Error("unsupported shared package");
  }
  for (const post of parsed.posts) {
    if (typeof post.id !== "string" || typeof post.text !== "string") throw new Error("unsupported shared package");
  }
  return {
    briefs: parsed.briefs !== undefined && typeof parsed.briefs === "object" ? (parsed.briefs as Record<string, string>) : {},
    id: parsed.id,
    name: parsed.name,
    posts: parsed.posts as SharedPost[],
    v: 1,
    ...(parsed.description !== undefined ? { description: parsed.description } : {}),
  };
}
