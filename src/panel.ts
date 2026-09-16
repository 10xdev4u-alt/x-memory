import { type CommandId, filterCommands } from "./lib/commands.js";
import { listAccounts, readCurrentAccount, writeCurrentAccount } from "./lib/accounts.js";
import { isZone, type Zone } from "./lib/zone-nav.js";
import { allRecords, getRecord, mediaForPost, openDb, type BriefRecord, type MediaRecord, type PostRecord } from "./lib/db.js";
import { postsToMarkdown } from "./lib/export.js";
import { buildReaderModel, snippet } from "./lib/reader-model.js";
import { createCollection, forkCollection, listCollections } from "./lib/collections.js";
import { loopCounts, resolvePost } from "./lib/loops.js";
import { Selection } from "./lib/selection.js";
import { listViews, matchView } from "./lib/views.js";
import { readSession } from "./lib/settings.js";
import { sessionMessage } from "./lib/session-machine.js";
import { applyTheme } from "./lib/theme.js";

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
    item.append(open, " ", fork);
    list.append(item);
  }
  section.append(list);
  return selected;
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
