import { type CommandId, filterCommands } from "./lib/commands.js";
import { listAccounts, readCurrentAccount, writeCurrentAccount } from "./lib/accounts.js";
import { isZone, type Zone } from "./lib/zone-nav.js";
import { allRecords, getRecord, mediaForPost, openDb, type BriefRecord, type PostRecord } from "./lib/db.js";
import { buildReaderModel, snippet } from "./lib/reader-model.js";
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

async function renderLibrary(): Promise<void> {
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
  const visible =
    active === undefined
      ? posts
      : posts.filter((post) => matchView(post, active, { mediaCount: mediaCounts.get(post.id) ?? 0 }));
  let list = document.getElementById("post-list");
  if (list === null) {
    list = document.createElement("ul");
    list.id = "post-list";
    library.append(list);
  }
  list.replaceChildren();
  for (const post of visible.slice(0, 100)) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.replaceChildren(`${post.authorHandle !== "" ? `@${post.authorHandle}` : post.authorId}: ${snippet(post.text, 100)}`);
    button.addEventListener("click", () => {
      document.dispatchEvent(new CustomEvent("xmem:open-post", { detail: post.id }));
    });
    item.append(button);
    list.append(item);
  }
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
  actions.append(open, " ", copy);
  reader.append(actions);
}

document.addEventListener("xmem:open-post", (event) => {
  const postId = (event as CustomEvent).detail as string;
  activate("reader");
  void openPost(postId);
});
