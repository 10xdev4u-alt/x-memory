const PANEL_PATH = "src/panel.html";

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.tabs.onUpdated.addListener((tabId, _info, tab) => {
  if (tab.url?.startsWith("https://x.com/") === true) {
    void chrome.sidePanel.setOptions({ enabled: true, path: PANEL_PATH, tabId });
  }
});
