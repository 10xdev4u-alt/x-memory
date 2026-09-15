export interface SearchablePost {
  authorHandle: string;
  authorName: string;
  createdAt: number;
  id: string;
  text: string;
}

export interface SearchFilters {
  author?: string;
  after?: number;
  before?: number;
}

export async function searchLinkPosts(db: IDBDatabase, token: string): Promise<string[]> {
  const needle = token.toLowerCase();
  if (needle === "") return [];
  const { allRecords } = await import("./db.js");
  const media = await allRecords<{ postId: string; url: string }>(db, "media");
  const hits = new Set<string>();
  for (const item of media) {
    if (item.url.toLowerCase().includes(needle)) hits.add(item.postId);
  }
  return [...hits];
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2);
}

export class SearchIndex {
  private readonly documents = new Map<string, SearchablePost>();
  private readonly postings = new Map<string, Map<string, number>>();

  add(posts: SearchablePost[]): void {
    for (const post of posts) {
      this.documents.set(post.id, post);
      const counts = new Map<string, number>();
      for (const token of tokenize(`${post.text} ${post.authorHandle} ${post.authorName}`)) {
        counts.set(token, (counts.get(token) ?? 0) + 1);
      }
      for (const [token, count] of counts) {
        let posting = this.postings.get(token);
        if (posting === undefined) {
          posting = new Map();
          this.postings.set(token, posting);
        }
        posting.set(post.id, count);
      }
    }
  }

  search(query: string, filters?: SearchFilters): SearchablePost[] {
    const tokens = tokenize(query);
    if (tokens.length === 0) return [];
    let candidates: Map<string, number> | undefined;
    for (const token of tokens) {
      const posting = this.postings.get(token);
      if (posting === undefined) return [];
      if (candidates === undefined) {
        candidates = new Map(posting);
        continue;
      }
      for (const id of [...candidates.keys()]) {
        const count = posting.get(id);
        if (count === undefined) candidates.delete(id);
        else candidates.set(id, (candidates.get(id) ?? 0) + count);
      }
      if (candidates.size === 0) return [];
    }
    const results: Array<{ post: SearchablePost; score: number }> = [];
    for (const [id, score] of candidates ?? []) {
      const post = this.documents.get(id);
      if (post === undefined) continue;
      if (filters?.author !== undefined && !post.authorHandle.toLowerCase().includes(filters.author.toLowerCase())) {
        continue;
      }
      if (filters?.after !== undefined && post.createdAt < filters.after) continue;
      if (filters?.before !== undefined && post.createdAt > filters.before) continue;
      results.push({ post, score });
    }
    results.sort((a, b) => b.score - a.score || b.post.createdAt - a.post.createdAt);
    return results.map((result) => result.post);
  }

  clear(): void {
    this.documents.clear();
    this.postings.clear();
  }

  get size(): number {
    return this.documents.size;
  }
}
