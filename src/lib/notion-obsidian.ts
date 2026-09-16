import type { MediaRecord, PostRecord } from "./db.js";
import { provenanceLabel } from "./reader-model.js";

function isoDate(createdAt: number): string {
  return createdAt > 0 ? new Date(createdAt).toISOString().slice(0, 10) : "";
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function postsToNotionCsv(posts: PostRecord[], briefsById: Map<string, string>): string {
  const header = ["Title", "Author", "URL", "Date", "Provenance", "Brief"].map(csvCell).join(",");
  const rows = posts.map((post) => {
    const title = post.text.replace(/\s+/g, " ").trim().slice(0, 100);
    return [
      title,
      post.authorHandle !== "" ? `@${post.authorHandle}` : post.authorId,
      post.url,
      isoDate(post.createdAt),
      provenanceLabel(post.provenance),
      briefsById.get(post.id) ?? "",
    ]
      .map(csvCell)
      .join(",");
  });
  return [header, ...rows].join("\n");
}

export function postsToObsidian(
  posts: PostRecord[],
  briefsById: Map<string, string>,
  mediaByPostId: Map<string, MediaRecord[]>,
): string {
  const notes = posts.map((post) => {
    const author = post.authorHandle !== "" ? `@${post.authorHandle}` : post.authorId;
    const lines = [
      "---",
      `id: ${post.id}`,
      `author: "${author}"`,
      `url: ${post.url}`,
      `date: ${isoDate(post.createdAt)}`,
      `provenance: ${post.provenance}`,
      "---",
      "",
      `# ${author} on ${isoDate(post.createdAt)}`,
      "",
      post.text,
      "",
    ];
    const brief = briefsById.get(post.id);
    if (brief !== undefined) lines.push(`> ${brief}`, "");
    for (const item of mediaByPostId.get(post.id) ?? []) {
      lines.push(`- [${item.kind}](${item.url})`);
    }
    lines.push("", `[[x-memory-index]]`);
    return lines.join("\n");
  });
  const index = `# x-memory index\n\n${posts.map((post) => `- [[${post.id}]] ${post.text.replace(/\s+/g, " ").trim().slice(0, 80)}`).join("\n")}\n`;
  return `${index}\n---\n\n${notes.join("\n\n---\n\n")}\n`;
}
