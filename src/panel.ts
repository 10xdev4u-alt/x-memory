import { type CommandId, filterCommands } from "./lib/commands.js";
import { listAccounts, readCurrentAccount, writeCurrentAccount } from "./lib/accounts.js";
import { isZone, type Zone } from "./lib/zone-nav.js";
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
