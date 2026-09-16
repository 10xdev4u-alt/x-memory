const VISIBILITY_KEY = "xmem.visibility";

export type Visibility = "private" | "unlisted" | "public";

export type VisibleKind = "collection" | "profile" | "board";

function recordKey(kind: VisibleKind, id: string): string {
  return `${kind}:${id}`;
}

export async function getVisibility(kind: VisibleKind, id: string): Promise<Visibility> {
  const stored = await chrome.storage.local.get(VISIBILITY_KEY);
  const records = (stored[VISIBILITY_KEY] as Record<string, Visibility> | undefined) ?? {};
  return records[recordKey(kind, id)] ?? "private";
}

export async function setVisibility(kind: VisibleKind, id: string, visibility: Visibility): Promise<void> {
  const stored = await chrome.storage.local.get(VISIBILITY_KEY);
  const records = (stored[VISIBILITY_KEY] as Record<string, Visibility> | undefined) ?? {};
  records[recordKey(kind, id)] = visibility;
  await chrome.storage.local.set({ [VISIBILITY_KEY]: records });
}

export async function canPublish(kind: VisibleKind, id: string): Promise<boolean> {
  const visibility = await getVisibility(kind, id);
  return visibility === "public" || visibility === "unlisted";
}

export function visibilityBadge(visibility: Visibility): { label: string; tone: string } {
  switch (visibility) {
    case "public":
      return { label: "Public", tone: "green" };
    case "unlisted":
      return { label: "Unlisted", tone: "amber" };
    case "private":
      return { label: "Private", tone: "grey" };
  }
}
