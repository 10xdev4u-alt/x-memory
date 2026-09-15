import { isZone, type Zone } from "./lib/zone-nav.js";
import { readSession } from "./lib/settings.js";
import { sessionMessage } from "./lib/session-machine.js";

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
  if (event.key >= "1" && event.key <= "3") {
    const zone = (["library", "reader", "paper"] as const)[Number(event.key) - 1];
    if (zone !== undefined) activate(zone);
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

activate("library");
void renderSessionBanner();
