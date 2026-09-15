import { readSession, readVersions, wipeLocalData } from "./lib/settings.js";

async function renderSession(): Promise<void> {
  const snapshot = await readSession();
  const label =
    snapshot.state === "active"
      ? "X session active."
      : snapshot.state === "missing"
        ? "No X session. Log into X first."
        : snapshot.state === "expired"
          ? "X session expired. Log into X again."
          : "Session not checked yet.";
  document.getElementById("session-state")?.replaceChildren(label);
}

async function renderVersions(): Promise<void> {
  const manifestVersion = chrome.runtime.getManifest().version;
  const stored = await readVersions();
  const operations = stored?.operations ?? "unknown";
  document
    .getElementById("version-info")
    ?.replaceChildren(`Extension ${manifestVersion}. Operations ${operations}.`);
}

document.getElementById("session-check")?.addEventListener("click", () => {
  void renderSession();
});

document.getElementById("wipe-data")?.addEventListener("click", () => {
  void wipeLocalData().then(() => {
    document.getElementById("wipe-state")?.replaceChildren("Local data wiped.");
    void renderSession();
  });
});

void renderSession();
void renderVersions();
