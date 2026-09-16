import { markPaperDue } from "./lib/paper-job.js";

const PAPER_ALARM = "xmem-paper";

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  void chrome.alarms.create(PAPER_ALARM, { periodInMinutes: 24 * 60 });
});

chrome.tabs.onUpdated.addListener((tabId, _info, tab) => {
  if (tab.url?.startsWith("https://x.com/") === true) {
    void chrome.sidePanel.setOptions({ enabled: true, path: "src/panel.html", tabId });
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === PAPER_ALARM) void markPaperDue();
});
