export interface TimelineEntry {
  content?: {
    cursorType?: string;
    value?: string;
    itemContent?: {
      tweet_results?: {
        result?: {
          legacy?: {
            created_at?: string;
            full_text?: string;
            id_str?: string;
            user_id_str?: string;
          };
          core?: {
            user_results?: {
              result?: {
                legacy?: {
                  name?: string;
                  screen_name?: string;
                };
              };
            };
          };
        };
      };
    };
  };
  entryId?: string;
}

export interface TimelinePage {
  instructions?: Array<{ entries?: TimelineEntry[]; type?: string }>;
}

export interface ParsedPost {
  authorHandle: string;
  authorId: string;
  authorName: string;
  createdAt: number;
  id: string;
  text: string;
}

export interface ParsedPage {
  cursor?: string;
  posts: ParsedPost[];
}

function parseEntry(entry: TimelineEntry): ParsedPost | undefined {
  const result = entry.content?.itemContent?.tweet_results?.result;
  const legacy = result?.legacy;
  if (legacy?.id_str === undefined || legacy.full_text === undefined) return undefined;
  const user = result?.core?.user_results?.result?.legacy;
  return {
    authorHandle: user?.screen_name ?? "",
    authorId: legacy.user_id_str ?? "",
    authorName: user?.name ?? "",
    createdAt: Date.parse(legacy.created_at ?? "") || 0,
    id: legacy.id_str,
    text: legacy.full_text,
  };
}

export function parseTimelinePage(page: TimelinePage): ParsedPage {
  const posts: ParsedPost[] = [];
  let cursor: string | undefined;
  for (const instruction of page.instructions ?? []) {
    for (const entry of instruction.entries ?? []) {
      if (entry.content?.cursorType === "Bottom" && entry.content.value !== undefined) {
        cursor = entry.content.value;
        continue;
      }
      const post = parseEntry(entry);
      if (post !== undefined) posts.push(post);
    }
  }
  if (cursor === undefined) return { posts };
  return { cursor, posts };
}
