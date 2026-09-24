import { type CommandId, filterCommands } from "./lib/commands.js";
import { listAccounts, readCurrentAccount, writeCurrentAccount } from "./lib/accounts.js";
import { isZone, type Zone } from "./lib/zone-nav.js";
import { allRecords, getRecord, mediaForPost, openDb, type BriefRecord, type MediaRecord, type PostRecord } from "./lib/db.js";
import { postsToMarkdown } from "./lib/export.js";
import { buildReaderModel, snippet } from "./lib/reader-model.js";
import { createCollection, forkCollection, listCollections } from "./lib/collections.js";
import { canShareInline, importSharedPackage, packageCollection, parseSharedLink, shareLink } from "./lib/sharing.js";
import { getVisibility, setVisibility, visibilityBadge, type Visibility } from "./lib/visibility.js";
import { buildTasteProfile } from "./lib/profile.js";
import { loopCounts, resolvePost } from "./lib/loops.js";
import { ensureConversation, GrokError, sendGrokMessage } from "./lib/grok.js";
import { isPaperDue, readLatestPaper, runPaperJob } from "./lib/paper-job.js";
import { renderPaperMarkdown, paperToSpeech } from "./lib/paper.js";
import { browserBackend, playDigest, splitDigest } from "./lib/voice.js";
import { ThrottleQueue } from "./lib/queue.js";
import { completeStep, nextStep, readOnboarding, type OnboardingStep } from "./lib/onboarding.js";
import { loadOps, readBearer } from "./lib/healer.js";
import { callOperation, readStoredCsrf } from "./lib/session-client.js";
import { syncBookmarks, syncLikes, type SyncTransport } from "./lib/sync.js";
import { briefBatch } from "./lib/briefs.js";
import { Selection } from "./lib/selection.js";
import { listViews, matchView } from "./lib/views.js";
import { readSession } from "./lib/settings.js";
import { sessionMessage } from "./lib/session-machine.js";
import { applyTheme } from "./lib/theme.js";
import { createQuotaSend } from "./lib/quota.js";

const buttons = [...document.querySelectorAll<HTMLButtonElement>("#zone-nav [data-zone]")];

function activate(zone: Zone): void {
  for (const button of buttons) {
    const selected = button.dataset["zone"] === zone;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
    document.getElementById(button.dataset["zone"] ?? "")?.toggleAttribute("hidden", !selected);
  }
}

for (const button of buttons) {
  button.addEventListener("click", () => {
    const zone = button.dataset["zone"] ?? "";
    if (isZone(zone)) activate(zone);
  });
}

document.addEventListener("keydown", (event) => {
  const palette = document.getElementById("palette");
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    palette?.toggleAttribute("hidden");
    document.getElementById("palette-input")?.focus();
    return;
  }
  if (event.key === "Escape") {
    palette?.setAttribute("hidden", "");
    return;
  }
  if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
    const current = buttons.findIndex((button) => button.getAttribute("aria-selected") === "true");
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next = buttons[(current + delta + buttons.length) % buttons.length];
    next?.focus();
    next?.click();
    return;
  }
  if (event.key >= "1" && event.key <= "3") {
    const zone = (["library", "reader", "paper"] as const)[Number(event.key) - 1];
    if (zone !== undefined) activate(zone);
  }
});

function runCommand(id: CommandId): void {
  document.getElementById("palette")?.setAttribute("hidden", "");
  switch (id) {
    case "go-library":
      activate("library");
      break;
    case "go-reader":
      activate("reader");
      break;
    case "go-paper":
      activate("paper");
      break;
    case "sync-now":
    case "check-session":
      document.dispatchEvent(new CustomEvent("xmem:command", { detail: id }));
      break;
  }
}

function renderPalette(query: string): void {
  const list = document.getElementById("palette-list");
  if (list === null) return;
  list.replaceChildren();
  for (const command of filterCommands(query)) {
    const item = document.createElement("li");
    item.setAttribute("role", "option");
    const button = document.createElement("button");
    button.type = "button";
    button.replaceChildren(`${command.title} (${command.hint})`);
    button.addEventListener("click", () => runCommand(command.id));
    item.append(button);
    list.append(item);
  }
}

document.getElementById("palette-input")?.addEventListener("input", (event) => {
  renderPalette((event.target as HTMLInputElement).value);
});

document.getElementById("palette-input")?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    const first = filterCommands((event.target as HTMLInputElement).value)[0];
    if (first !== undefined) runCommand(first.id);
  }
});

async function renderSessionBanner(): Promise<void> {
  const snapshot = await readSession();
  const library = document.getElementById("library");
  if (library === null) return;
  let banner = document.getElementById("session-banner");
  if (banner === null) {
    banner = document.createElement("p");
    banner.id = "session-banner";
    banner.setAttribute("role", "status");
    library.prepend(banner);
  }
  banner.replaceChildren(sessionMessage(snapshot.state));
}

async function renderAccounts(): Promise<void> {
  const current = document.getElementById("account-current");
  const list = document.getElementById("account-list");
  if (current === null || list === null) return;
  const active = await readCurrentAccount();
  const accounts = await listAccounts();
  current.replaceChildren(active === undefined ? "No account" : `Account ${active}`);
  list.replaceChildren();
  for (const account of accounts) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.replaceChildren(account.handle ?? `Account ${account.id}`);
    button.addEventListener("click", () => {
      void writeCurrentAccount(account.id).then(() => {
        document.dispatchEvent(new CustomEvent("xmem:account", { detail: account.id }));
        list.setAttribute("hidden", "");
        void renderAccounts();
      });
    });
    item.append(button);
    list.append(item);
  }
}

document.getElementById("account-current")?.addEventListener("click", () => {
  document.getElementById("account-list")?.toggleAttribute("hidden");
});

activate("library");
void applyTheme(document.documentElement);
void renderSessionBanner();
void renderAccounts();
void renderLibrary();
void renderLoopCount();
void renderOnboarding();

const selection = new Selection();

function refreshBulk(): void {
  document.getElementById("bulk-bar")?.replaceChildren(`Selected ${selection.size}`);
}

async function renderCollections(activeId: string | null): Promise<string | null> {
  const library = document.getElementById("library");
  if (library === null) return activeId;
  let section = document.getElementById("collections");
  if (section === null) {
    section = document.createElement("div");
    section.id = "collections";
    library.append(section);
  }
  section.replaceChildren();
  const heading = document.createElement("h2");
  heading.replaceChildren("Collections");
  const form = document.createElement("form");
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "New collection name";
  input.setAttribute("aria-label", "New collection name");
  const create = document.createElement("button");
  create.type = "submit";
  create.replaceChildren("Create");
  form.append(input, create);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (name === "") return;
    void createCollection(name, "", Date.now()).then(() => {
      void renderLibrary();
    });
  });
  section.append(heading, form);
  const list = document.createElement("ul");
  let selected = activeId;
  for (const collection of await listCollections()) {
    const item = document.createElement("li");
    const open = document.createElement("button");
    open.type = "button";
    open.replaceChildren(`${collection.name} (${collection.postIds.length})`);
    open.setAttribute("aria-pressed", String(collection.id === selected));
    open.addEventListener("click", () => {
      selected = selected === collection.id ? null : collection.id;
      void renderLibrary(selected);
    });
    const fork = document.createElement("button");
    fork.type = "button";
    fork.replaceChildren("Fork");
    fork.setAttribute("aria-label", `Fork ${collection.name}`);
    fork.addEventListener("click", () => {
      void forkCollection(collection.id, `${collection.name} (fork)`, Date.now()).then(() => void renderLibrary(selected));
    });
    const share = document.createElement("button");
    share.type = "button";
    share.replaceChildren("Share");
    share.setAttribute("aria-label", `Share ${collection.name}`);
    share.addEventListener("click", () => {
      void shareCollection(collection.id).then((link) => {
        if (link === undefined) {
          share.replaceChildren("Too big");
          return;
        }
        void navigator.clipboard.writeText(link).then(() => share.replaceChildren("Copied"));
      });
    });
    item.append(open, " ", fork, " ", share);
    const badge = document.createElement("span");
    const paint = async (): Promise<void> => {
      const visibility = await getVisibility("collection", collection.id);
      const info = visibilityBadge(visibility);
      badge.replaceChildren(`${info.label}`);
      badge.dataset["tone"] = info.tone;
    };
    const cycle = document.createElement("button");
    cycle.type = "button";
    cycle.replaceChildren("Visibility");
    cycle.setAttribute("aria-label", `Change visibility of ${collection.name}`);
    cycle.addEventListener("click", () => {
      void getVisibility("collection", collection.id).then((current) => {
        const next: Visibility = current === "private" ? "unlisted" : current === "unlisted" ? "public" : "private";
        void setVisibility("collection", collection.id, next).then(() => void paint());
      });
    });
    item.append(" ", badge, " ", cycle);
    list.append(item);
    void paint();
  }
  section.append(list);
  const importForm = document.createElement("form");
  const importInput = document.createElement("input");
  importInput.type = "text";
  importInput.placeholder = "Paste a shared link";
  importInput.setAttribute("aria-label", "Shared collection link");
  const importButton = document.createElement("button");
  importButton.type = "submit";
  importButton.replaceChildren("Import");
  importForm.append(importInput, importButton);
  const importStatus = document.createElement("p");
  importStatus.setAttribute("role", "status");
  importForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const link = importInput.value.trim();
    if (link === "") return;
    void importSharedLink(link).then((result) => {
      importStatus.replaceChildren(result === undefined ? "That link did not parse." : `Imported ${result}.`);
      void renderLibrary(selected);
    });
  });
  section.append(importForm, importStatus);
  return selected;
}

async function shareCollection(collectionId: string): Promise<string | undefined> {
  const db = await openDb();
  const collections = await listCollections();
  const collection = collections.find((entry) => entry.id === collectionId);
  if (collection === undefined) {
    db.close();
    return undefined;
  }
  const posts = [];
  for (const postId of collection.postIds) {
    const post = await getRecord<PostRecord>(db, "posts", postId);
    if (post === undefined) continue;
    posts.push(post);
  }
  const briefs: Record<string, string> = {};
  for (const post of posts) {
    const brief = await getRecord<BriefRecord>(db, "briefs", post.id);
    if (brief !== undefined) briefs[post.id] = brief.text;
  }
  db.close();
  const pkg = packageCollection(
    collection.id,
    collection.name,
    collection.description,
    posts.map((post) => ({
      authorHandle: post.authorHandle,
      authorName: post.authorName,
      createdAt: post.createdAt,
      id: post.id,
      text: post.text,
      url: post.url,
    })),
    briefs,
  );
  if (!canShareInline(pkg)) return undefined;
  return shareLink(pkg);
}

async function importSharedLink(link: string): Promise<string | undefined> {
  let pkg;
  try {
    pkg = parseSharedLink(link);
  } catch {
    return undefined;
  }
  const result = await importSharedPackage(pkg);
  return `${result.posts} posts in a new collection`;
}

async function renderProfile(): Promise<void> {
  const library = document.getElementById("library");
  if (library === null) return;
  const profile = await buildTasteProfile();
  let card = document.getElementById("taste-profile");
  if (card === null) {
    card = document.createElement("div");
    card.id = "taste-profile";
    library.prepend(card);
  }
  const minds = profile.minds.slice(0, 3).map((mind) => `@${mind.handle} (${mind.score})`).join(", ") || "none yet";
  const clusters = profile.clusters.slice(0, 3).map((cluster) => `${cluster.label} (${cluster.count})`).join(", ") || "none yet";
  card.replaceChildren(
    `Taste profile: ${profile.stats.posts} posts, ${profile.stats.briefs} briefs, ${profile.stats.loopsOpen} open loops. Minds: ${minds}. Clusters: ${clusters}.`,
  );
}

async function renderLibrary(activeCollection: string | null = null): Promise<void> {
  const library = document.getElementById("library");
  if (library === null) return;
  const db = await openDb();
  const posts = await allRecords<PostRecord>(db, "posts");
  const media = await allRecords<{ postId: string }>(db, "media");
  db.close();
  const mediaCounts = new Map<string, number>();
  for (const item of media) mediaCounts.set(item.postId, (mediaCounts.get(item.postId) ?? 0) + 1);
  let controls = document.getElementById("library-controls");
  if (controls === null) {
    controls = document.createElement("div");
    controls.id = "library-controls";
    const label = document.createElement("label");
    label.replaceChildren("View ");
    const select = document.createElement("select");
    select.id = "view-select";
    select.setAttribute("aria-label", "Saved view");
    select.addEventListener("change", () => void renderLibrary());
    label.append(select);
    controls.append(label);
    const bulk = document.createElement("div");
    bulk.id = "bulk-bar";
    bulk.setAttribute("role", "status");
    const exportButton = document.createElement("button");
    exportButton.type = "button";
    exportButton.replaceChildren("Export selected");
    exportButton.addEventListener("click", () => {
      void exportSelection(selection).then(refreshBulk);
    });
    controls.append(bulk, exportButton);
    library.append(controls);
  }
  const select = document.getElementById("view-select");
  const views = await listViews();
  if (select instanceof HTMLSelectElement) {
    const current = select.value;
    select.replaceChildren();
    const all = document.createElement("option");
    all.value = "";
    all.replaceChildren("All posts");
    select.append(all);
    for (const view of views) {
      const option = document.createElement("option");
      option.value = view.id;
      option.replaceChildren(view.name);
      select.append(option);
    }
    if (views.some((view) => view.id === current)) select.value = current;
  }
  const active = views.find((view) => view.id === (select instanceof HTMLSelectElement ? select.value : ""));
  let visible =
    active === undefined
      ? posts
      : posts.filter((post) => matchView(post, active, { mediaCount: mediaCounts.get(post.id) ?? 0 }));
  if (activeCollection !== null) {
    const collection = (await listCollections()).find((entry) => entry.id === activeCollection);
    const members = new Set(collection?.postIds ?? []);
    visible = visible.filter((post) => members.has(post.id));
  }
  let list = document.getElementById("post-list");
  if (list === null) {
    list = document.createElement("ul");
    list.id = "post-list";
    library.append(list);
  }
  list.replaceChildren();
  for (const post of visible.slice(0, 100)) {
    const item = document.createElement("li");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.setAttribute("aria-label", `Select post ${post.id}`);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selection.add(post.id);
      else selection.remove(post.id);
      refreshBulk();
    });
    const button = document.createElement("button");
    button.type = "button";
    button.replaceChildren(`${post.authorHandle !== "" ? `@${post.authorHandle}` : post.authorId}: ${snippet(post.text, 100)}`);
    button.addEventListener("click", () => {
      document.dispatchEvent(new CustomEvent("xmem:open-post", { detail: post.id }));
    });
    item.append(checkbox, button);
    list.append(item);
  }
  refreshBulk();
  await renderCollections(activeCollection);
  await renderProfile();
}

async function exportSelection(selection: Selection): Promise<void> {
  const ids = selection.list();
  if (ids.length === 0) return;
  const db = await openDb();
  const posts: PostRecord[] = [];
  for (const id of ids) {
    const post = await getRecord<PostRecord>(db, "posts", id);
    if (post !== undefined) posts.push(post);
  }
  const briefs = new Map<string, string>();
  const mediaByPost = new Map<string, MediaRecord[]>();
  for (const post of posts) {
    const brief = await getRecord<BriefRecord>(db, "briefs", post.id);
    if (brief !== undefined) briefs.set(post.id, brief.text);
    mediaByPost.set(post.id, await mediaForPost(db, post.id));
  }
  db.close();
  const blob = new Blob([postsToMarkdown(posts, briefs, mediaByPost)], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "x-memory-selection.md";
  link.click();
  URL.revokeObjectURL(url);
}

async function openPost(postId: string): Promise<void> {
  const reader = document.getElementById("reader");
  if (reader === null) return;
  const db = await openDb();
  const post = await getRecord<PostRecord>(db, "posts", postId);
  if (post === undefined) {
    db.close();
    return;
  }
  const media = await mediaForPost(db, postId);
  const brief = await getRecord<BriefRecord>(db, "briefs", postId);
  db.close();
  const model = buildReaderModel(post, media, brief?.text);
  reader.replaceChildren();
  const heading = document.createElement("h2");
  heading.replaceChildren(model.authorLine);
  const meta = document.createElement("p");
  meta.replaceChildren(`${model.timeLine} · ${model.provenanceLabel}`);
  const body = document.createElement("p");
  body.replaceChildren(model.text);
  reader.append(heading, meta, body);
  if (model.brief !== undefined) {
    const quote = document.createElement("blockquote");
    quote.replaceChildren(model.brief);
    reader.append(quote);
  }
  if (model.media.length > 0) {
    const list = document.createElement("ul");
    for (const item of model.media) {
      const entry = document.createElement("li");
      const link = document.createElement("a");
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.replaceChildren(`${item.kind}: ${item.url}`);
      entry.append(link);
      list.append(entry);
    }
    reader.append(list);
  }
  const actions = document.createElement("p");
  const open = document.createElement("a");
  open.href = model.originalUrl;
  open.target = "_blank";
  open.rel = "noreferrer";
  open.replaceChildren("Open original");
  const copy = document.createElement("button");
  copy.type = "button";
  copy.replaceChildren("Copy link");
  copy.addEventListener("click", () => {
    void navigator.clipboard.writeText(model.originalUrl).then(() => copy.replaceChildren("Copied"));
  });
  const resolve = document.createElement("button");
  resolve.type = "button";
  resolve.replaceChildren("Resolve");
  resolve.addEventListener("click", () => {
    void resolvePost(model.id, Date.now()).then((done) => {
      resolve.replaceChildren(done ? "Resolved" : "Already resolved");
      void renderLoopCount();
      void renderLibrary();
    });
  });
  actions.append(open, " ", copy, " ", resolve);
  reader.append(actions);
}

async function renderLoopCount(): Promise<void> {
  const library = document.getElementById("library");
  if (library === null) return;
  const counts = await loopCounts();
  let line = document.getElementById("loop-count");
  if (line === null) {
    line = document.createElement("p");
    line.id = "loop-count";
    line.setAttribute("role", "status");
    library.prepend(line);
  }
  line.replaceChildren(counts.open === 0 ? "Inbox zero. Everything resolved." : `${counts.open} open loops.`);
}

document.addEventListener("xmem:open-post", (event) => {
  const postId = (event as CustomEvent).detail as string;
  activate("reader");
  void openPost(postId);
});

async function renderStoredPaper(): Promise<void> {
  const zone = document.getElementById("paper");
  if (zone === null) return;
  const stored = await readLatestPaper();
  let article = document.getElementById("paper-article");
  if (article === null) {
    article = document.createElement("div");
    article.id = "paper-article";
    zone.append(article);
  }
  if (stored === undefined) {
    article.replaceChildren("No paper yet. Generate one below.");
    return;
  }
  article.replaceChildren(stored.markdown);
}

async function generatePaper(status: HTMLElement, generate: HTMLElement): Promise<void> {
  if (!(generate instanceof HTMLButtonElement)) return;
  generate.disabled = true;
  status.replaceChildren("Writing the paper.");
  try {
    const conversationId = await ensureConversation();
    const paper = await runPaperJob({
      conversationId,
      markdown: renderPaperMarkdown,
      queue: new ThrottleQueue(),
      send: createQuotaSend((message) => sendGrokMessage(message)),
      since: Date.now() - 24 * 60 * 60 * 1000,
      speech: paperToSpeech,
    });
    status.replaceChildren(`Paper ready for ${paper.date}.`);
    await renderStoredPaper();
  } catch (error) {
    if (error instanceof GrokError && error.kind === "quota") {
      status.replaceChildren("Grok quota hit. Showing the last paper until it resets.");
      return;
    }
    status.replaceChildren(`Paper failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    generate.disabled = false;
  }
}

function renderPaperControls(): void {
  const zone = document.getElementById("paper");
  if (zone === null || document.getElementById("paper-generate") !== null) return;
  const status = document.createElement("p");
  status.id = "paper-status";
  status.setAttribute("role", "status");
  const generate = document.createElement("button");
  generate.id = "paper-generate";
  generate.type = "button";
  generate.replaceChildren("Generate paper");
  generate.addEventListener("click", () => void generatePaper(status, generate));
  const play = document.createElement("button");
  play.type = "button";
  play.replaceChildren("Listen");
  play.setAttribute("aria-label", "Listen to the paper");
  play.addEventListener("click", () => {
    void readLatestPaper().then((stored) => {
      if (stored === undefined) {
        status.replaceChildren("No paper to play yet.");
        return;
      }
      const backend = browserBackend();
      if (backend === undefined) {
        status.replaceChildren("This browser has no speech engine.");
        return;
      }
      status.replaceChildren("Playing the paper.");
      void playDigest(backend, splitDigest(stored.speech)).done.then(
        () => status.replaceChildren("Playback finished."),
        () => status.replaceChildren("Playback stopped."),
      );
    });
  });
  zone.prepend(status, generate, play);
}

renderPaperControls();
void renderStoredPaper();
void isPaperDue().then((due) => {
  if (!due) return;
  const generate = document.getElementById("paper-generate");
  const status = document.getElementById("paper-status");
  if (generate !== null && status !== null) void generatePaper(status, generate);
});
void renderOnboarding();

async function panelTransport(): Promise<SyncTransport | undefined> {
  const loaded = await loadOps(["Bookmarks", "Likes"]);
  if (loaded.length === 0) return undefined;
  const bearer = await readBearer();
  const csrf = await readStoredCsrf();
  if (bearer === undefined || csrf === "") return undefined;
  const authedFetch = (url: string | URL | Request, init?: RequestInit): Promise<Response> =>
    fetch(url, { ...init, credentials: "include" });
  return {
    fetchPage: (operation, variables) => callOperation(operation, variables, { bearer, cookie: `ct0=${csrf}`, fetchImpl: authedFetch }),
  };
}

async function runOnboardingSync(status: HTMLElement): Promise<boolean> {
  const transport = await panelTransport();
  if (transport === undefined) {
    status.replaceChildren("Open x.com first so operations heal, then retry.");
    return false;
  }
  const queue = new ThrottleQueue();
  status.replaceChildren("Syncing bookmarks.");
  await syncBookmarks({ queue, transport });
  const userId = await readCurrentAccount();
  if (userId !== undefined) {
    status.replaceChildren("Syncing likes.");
    await syncLikes({ queue, transport, userId });
  }
  await renderLibrary();
  await renderLoopCount();
  return true;
}

async function runOnboardingBriefs(status: HTMLElement): Promise<boolean> {
  const transport = await panelTransport();
  if (transport === undefined) {
    status.replaceChildren("Open x.com first so operations heal, then retry.");
    return false;
  }
  status.replaceChildren("Starting a Grok conversation.");
  let conversationId: string;
  try {
    conversationId = await ensureConversation();
  } catch {
    status.replaceChildren("Grok is unreachable right now. Retry later.");
    return false;
  }
  status.replaceChildren("Briefing first saves.");
  const db = await openDb();
  const posts = (await allRecords<PostRecord>(db, "posts")).slice(0, 5);
  db.close();
  const result = await briefBatch(
    posts.map((post) => ({ authorHandle: post.authorHandle, id: post.id, text: post.text })),
    { conversationId, queue: new ThrottleQueue(), send: (message) => sendGrokMessage(message) },
  );
  status.replaceChildren(`Briefed ${result.briefed}, skipped ${result.skipped}.`);
  await renderLibrary();
  return result.briefed > 0 || result.skipped > 0;
}

const STEP_COPY: Record<OnboardingStep, { action: string; done: string; todo: string }> = {
  brief: { action: "Brief first saves", done: "First briefs written.", todo: "Turn five saves into briefs." },
  paper: { action: "Write first paper", done: "First paper written.", todo: "Assemble the first Morning Paper." },
  session: { action: "Open X", done: "Session active.", todo: "Log into X so the extension can sync." },
  sync: { action: "Sync now", done: "Corpus synced.", todo: "Pull bookmarks and likes." },
};

async function renderOnboarding(): Promise<void> {
  const library = document.getElementById("library");
  if (library === null) return;
  let state = await readOnboarding();
  if (!state.done.includes("session")) {
    const snapshot = await readSession();
    if (snapshot.state === "active") {
      state = await completeStep("session");
    }
  }
  let section = document.getElementById("onboarding");
  if (state.done.length === 4) {
    section?.remove();
    return;
  }
  if (section === null) {
    section = document.createElement("div");
    section.id = "onboarding";
    library.prepend(section);
  }
  section.replaceChildren();
  const heading = document.createElement("h2");
  heading.replaceChildren("Getting started");
  section.append(heading);
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  section.append(status);
  const step = nextStep(state);
  if (step === undefined) return;
  const copy = STEP_COPY[step];
  const line = document.createElement("p");
  line.replaceChildren(`Next: ${copy.todo}`);
  const button = document.createElement("button");
  button.type = "button";
  button.replaceChildren(copy.action);
  button.addEventListener("click", () => {
    void (async () => {
      if (step === "session") {
        await chrome.tabs.create({ url: "https://x.com/i/history" });
        status.replaceChildren("Log into X, browse a little, then come back.");
        return;
      }
      if (step === "sync") {
        if (await runOnboardingSync(status)) {
          await completeStep("sync");
          status.replaceChildren(STEP_COPY.sync.done);
          await renderOnboarding();
        }
        return;
      }
      if (step === "brief") {
        if (await runOnboardingBriefs(status)) {
          await completeStep("brief");
          status.replaceChildren(STEP_COPY.brief.done);
          await renderOnboarding();
        }
        return;
      }
      const generate = document.getElementById("paper-generate");
      const paperStatus = document.getElementById("paper-status");
      if (generate !== null && paperStatus !== null) {
        activate("paper");
        await generatePaper(paperStatus, generate);
        await completeStep("paper");
        await renderOnboarding();
      }
    })();
  });
  section.append(line, button);
}
