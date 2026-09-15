export interface PostReferences {
  quotedIds: string[];
  replyToId?: string;
}

export interface ChainLink {
  createdAt: number;
  id: string;
  references: PostReferences;
}

export interface Chain {
  postIds: string[];
  rootId: string;
}

export function linkTargets(link: ChainLink): string[] {
  const targets = [...link.references.quotedIds];
  if (link.references.replyToId !== undefined) targets.push(link.references.replyToId);
  return targets;
}

export function buildChains(links: ChainLink[]): Chain[] {
  const byId = new Map(links.map((link) => [link.id, link]));
  const parent = new Map(links.map((link) => [link.id, link.id]));
  const find = (id: string): string => {
    const root = parent.get(id) ?? id;
    if (root === id) return id;
    const resolved = find(root);
    parent.set(id, resolved);
    return resolved;
  };
  for (const link of links) {
    for (const target of linkTargets(link)) {
      if (byId.has(target)) parent.set(find(link.id), find(target));
    }
  }
  const groups = new Map<string, ChainLink[]>();
  for (const link of links) {
    const root = find(link.id);
    const group = groups.get(root) ?? [];
    group.push(link);
    groups.set(root, group);
  }
  const chains: Chain[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => a.createdAt - b.createdAt);
    chains.push({ postIds: group.map((link) => link.id), rootId: group[0]?.id ?? "" });
  }
  return chains.sort((a, b) => b.postIds.length - a.postIds.length);
}
