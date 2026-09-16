import { extractDescriptors, healOperations, saveBearer, saveOps, scanBearer, type ChunkRegistry } from "../lib/healer.js";
import { parseAccountId, rememberAccount, writeCurrentAccount } from "../lib/accounts.js";
import { probeSession, transition } from "../lib/session-machine.js";
import { readSession, writeSession } from "../lib/settings.js";

type WebpackRegistry = Array<[unknown, Record<string, unknown>]>;

function readRegistry(): WebpackRegistry {
  const registry = (window as unknown as { webpackChunk_twitter_responsive_web?: unknown })
    .webpackChunk_twitter_responsive_web;
  return Array.isArray(registry) ? (registry as WebpackRegistry) : [];
}

function chunkSources(registry: WebpackRegistry): string[] {
  const sources: string[] = [];
  for (const chunk of registry) {
    const modules = chunk[1];
    if (modules === null || typeof modules !== "object") continue;
    for (const key of Object.keys(modules)) {
      const value = (modules as Record<string, unknown>)[key];
      if (typeof value === "function") {
        try {
          sources.push(Function.prototype.toString.call(value));
        } catch {
          continue;
        }
      }
    }
  }
  return sources;
}

async function heal(): Promise<void> {
  const registry = readRegistry() as ChunkRegistry;
  const wanted = ["Bookmarks", "Likes", "CreateGrokConversation", "DeleteBookmark", "UnfavoriteTweet"];
  const report = healOperations(registry, wanted);
  if (report.healed.length > 0) {
    await saveOps(extractDescriptors(registry).filter((descriptor) => wanted.includes(descriptor.operationName)));
  }
  const bearer = scanBearer(chunkSources(readRegistry()));
  if (bearer !== undefined) await saveBearer(bearer);
}

async function snapshotSession(): Promise<void> {
  const state = probeSession(document.cookie);
  const previous = await readSession();
  const next = transition(previous.state, state === "active" ? "CHECK_OK" : "CHECK_GONE");
  await writeSession({ checkedAt: Date.now(), state: next });
  const csrf = /(?:^|; )ct0=([^;]+)/.exec(document.cookie)?.[1];
  if (csrf !== undefined && csrf !== "") {
    await chrome.storage.local.set({ "xmem.csrf": decodeURIComponent(csrf) });
  }
  const accountId = parseAccountId(document.cookie);
  if (accountId !== undefined) {
    await rememberAccount({ id: accountId, lastUsed: Date.now() });
    await writeCurrentAccount(accountId);
  }
}

console.debug("[x-memory] session client loaded");
void heal()
  .then(() => snapshotSession())
  .catch((error: unknown) => console.debug("[x-memory] heal skipped", error));
