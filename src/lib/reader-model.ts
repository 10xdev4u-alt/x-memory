import type { MediaRecord, PostRecord } from "./db.js";

export interface ReaderMedia {
  kind: string;
  url: string;
}

export interface ReaderModel {
  authorLine: string;
  brief?: string;
  id: string;
  media: ReaderMedia[];
  originalUrl: string;
  provenanceLabel: string;
  text: string;
  timeLine: string;
}

export function provenanceLabel(provenance: PostRecord["provenance"]): string {
  switch (provenance) {
    case "saved":
      return "Saved";
    case "liked":
      return "Liked";
    case "both":
      return "Saved and liked";
  }
}

export function buildReaderModel(post: PostRecord, media: MediaRecord[], brief?: string): ReaderModel {
  const author = post.authorHandle !== "" ? `@${post.authorHandle}` : post.authorId;
  const model: ReaderModel = {
    authorLine: post.authorName !== "" ? `${post.authorName} (${author})` : author,
    id: post.id,
    media: media.map((item) => ({ kind: item.kind, url: item.url })),
    originalUrl: post.url,
    provenanceLabel: provenanceLabel(post.provenance),
    text: post.text,
    timeLine: post.createdAt > 0 ? new Date(post.createdAt).toISOString() : "Unknown time",
  };
  if (brief !== undefined) model.brief = brief;
  return model;
}

export function snippet(text: string, length = 120): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= length ? flat : `${flat.slice(0, length - 1)}…`;
}
