import type { MediaKind, MediaRecord } from "./db.js";

export interface RawUrlEntity {
  expanded_url?: string;
}

export interface RawMediaEntity {
  id_str?: string;
  media_url_https?: string;
  type?: string;
}

export interface RawEntities {
  media?: RawMediaEntity[];
  urls?: RawUrlEntity[];
}

export interface TopicSignals {
  hashtags: string[];
  mentions: string[];
}

const URL_PATTERN = /https?:\/\/[^\s)]+/g;
const MENTION_PATTERN = /(^|[\s(])@([A-Za-z0-9_]{1,15})/g;
const HASHTAG_PATTERN = /(^|[\s(])#([\p{L}\p{N}_]+)/gu;

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function extractTextUrls(text: string): string[] {
  return unique(text.match(URL_PATTERN) ?? []);
}

export function extractTopics(text: string): TopicSignals {
  const mentions: string[] = [];
  const hashtags: string[] = [];
  for (const match of text.matchAll(MENTION_PATTERN)) {
    if (match[2] !== undefined) mentions.push(match[2].toLowerCase());
  }
  for (const match of text.matchAll(HASHTAG_PATTERN)) {
    if (match[2] !== undefined) hashtags.push(match[2].toLowerCase());
  }
  return { hashtags: unique(hashtags), mentions: unique(mentions) };
}

function mediaKind(type: string | undefined): MediaKind | undefined {
  if (type === "photo") return "image";
  if (type === "video" || type === "animated_gif") return "video";
  return undefined;
}

export function extractMedia(postId: string, entities: RawEntities | undefined, text: string): MediaRecord[] {
  const records: MediaRecord[] = [];
  let index = 0;
  for (const item of entities?.media ?? []) {
    const kind = mediaKind(item.type);
    const url = item.media_url_https;
    if (kind === undefined || url === undefined) continue;
    records.push({ id: `${postId}#m${index}`, kind, postId, url });
    index += 1;
  }
  const seen = new Set(records.map((record) => record.url));
  for (const entity of entities?.urls ?? []) {
    const url = entity.expanded_url;
    if (url === undefined || seen.has(url)) continue;
    seen.add(url);
    records.push({ id: `${postId}#l${index}`, kind: "link", postId, url });
    index += 1;
  }
  for (const url of extractTextUrls(text)) {
    if (seen.has(url)) continue;
    seen.add(url);
    records.push({ id: `${postId}#l${index}`, kind: "link", postId, url });
    index += 1;
  }
  return records;
}
