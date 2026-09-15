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

export function bundleFromJson(raw: string): ExportBundle {
  const parsed = JSON.parse(raw) as ExportBundle;
  if (parsed.version !== 1 || !Array.isArray(parsed.posts)) {
    throw new Error("unsupported export bundle");
  }
  return parsed;
}
