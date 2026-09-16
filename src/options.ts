import { readSession, readVersions, wipeLocalData } from "./lib/settings.js";
import { applyTheme, readThemeOverride, type ThemeOverride, writeThemeOverride } from "./lib/theme.js";
import { createBackup, restoreBackup } from "./lib/backup.js";
import { isTelemetryEnabled, setTelemetryEnabled } from "./lib/telemetry.js";

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

async function renderTheme(): Promise<void> {
  const select = document.getElementById("theme-select");
  if (!(select instanceof HTMLSelectElement)) return;
  select.value = await readThemeOverride();
  select.addEventListener("change", () => {
    const value = select.value as ThemeOverride;
    void writeThemeOverride(value).then(() => applyTheme(document.documentElement));
  });
}

void renderSession();
void renderVersions();
void renderTheme();
void applyTheme(document.documentElement);
void renderTelemetry();

async function renderTelemetry(): Promise<void> {
  const toggle = document.getElementById("telemetry-toggle");
  if (!(toggle instanceof HTMLInputElement)) return;
  toggle.checked = await isTelemetryEnabled();
  toggle.addEventListener("change", () => {
    void setTelemetryEnabled(toggle.checked);
  });
}

function backupStatus(message: string): void {
  document.getElementById("backup-state")?.replaceChildren(message);
}

document.getElementById("backup-export")?.addEventListener("click", () => {
  void createBackup({})
    .then((raw) => {
      const blob = new Blob([raw], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "x-memory-backup.json";
      link.click();
      URL.revokeObjectURL(url);
      backupStatus("Backup downloaded.");
    })
    .catch((error: unknown) => backupStatus(`Backup failed: ${String(error)}`));
});

document.getElementById("backup-import")?.addEventListener("change", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.files?.[0] === undefined) return;
  const file = input.files[0];
  void file
    .text()
    .then((raw) => restoreBackup(raw, {}))
    .then((result) => backupStatus(`Restored ${result.posts} posts, ${result.briefs} briefs, ${result.media} media.`))
    .catch(() => backupStatus("Restore failed. The file is not a valid backup."));
  input.value = "";
});
