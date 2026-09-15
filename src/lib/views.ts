import type { PostRecord } from "./db.js";
import { tokenize } from "./search.js";

const VIEWS_KEY = "xmem.views";

export interface ViewQuery {
  after?: number;
  author?: string;
  before?: number;
  cluster?: string;
  hasMedia?: boolean;
  provenance?: PostRecord["provenance"];
  text?: string;
}

export interface SavedView {
  id: string;
  name: string;
  query: ViewQuery;
}

export interface ViewContext {
  clusterIds?: string[];
  mediaCount?: number;
}

export function matchView(post: PostRecord, view: SavedView, context?: ViewContext): boolean {
  const query = view.query;
  if (query.text !== undefined) {
    const haystack = `${post.text} ${post.authorHandle} ${post.authorName}`.toLowerCase();
    for (const token of tokenize(query.text)) {
      if (!haystack.includes(token)) return false;
    }
  }
  if (query.author !== undefined && !post.authorHandle.toLowerCase().includes(query.author.toLowerCase())) {
    return false;
  }
  if (query.provenance !== undefined && post.provenance !== query.provenance) return false;
  if (query.after !== undefined && post.createdAt < query.after) return false;
  if (query.before !== undefined && post.createdAt > query.before) return false;
  if (query.hasMedia === true && (context?.mediaCount ?? 0) === 0) return false;
  if (query.cluster !== undefined && !(context?.clusterIds ?? []).includes(query.cluster)) return false;
  return true;
}

export function defaultViews(): SavedView[] {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return [
    { id: "saved", name: "Saved", query: { provenance: "saved" } },
    { id: "liked", name: "Liked", query: { provenance: "liked" } },
    { id: "media", name: "With links", query: { hasMedia: true } },
    { id: "week", name: "This week", query: { after: weekAgo } },
  ];
}

export async function listViews(): Promise<SavedView[]> {
  const stored = await chrome.storage.local.get(VIEWS_KEY);
  return (stored[VIEWS_KEY] as SavedView[] | undefined) ?? defaultViews();
}

export async function saveView(view: SavedView): Promise<void> {
  const views = (await listViews()).filter((entry) => entry.id !== view.id);
  views.push(view);
  await chrome.storage.local.set({ [VIEWS_KEY]: views });
}

export async function deleteView(id: string): Promise<void> {
  const views = (await listViews()).filter((entry) => entry.id !== id);
  await chrome.storage.local.set({ [VIEWS_KEY]: views });
}
