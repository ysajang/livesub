const SERVER = "http://127.0.0.1:8765";
let capturing = false;
let activeTabId = null;

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"]
  });
  if (contexts && contexts.length > 0) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["USER_MEDIA"],
    justification: "tab audio capture for local subtitles"
  });
}

async function start(tabId) {
  if (capturing) await stop();
  await ensureOffscreen();
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  const cfg = await chrome.storage.local.get(["lang", "doTranslate", "chunkSec"]);
  chrome.runtime.sendMessage({
    target: "offscreen",
    type: "start",
    streamId: streamId,
    tabId: tabId,
    server: SERVER,
    lang: cfg.lang || "ja",
    doTranslate: cfg.doTranslate === false ? "0" : "1",
    chunkSec: cfg.chunkSec || 5
  });
  capturing = true;
  activeTabId = tabId;
  chrome.action.setBadgeText({ text: "ON" });
  chrome.action.setBadgeBackgroundColor({ color: "#2f9e44" });
}

async function stop() {
  chrome.runtime.sendMessage({ target: "offscreen", type: "stop" });
  if (activeTabId !== null) {
    chrome.tabs.sendMessage(activeTabId, { type: "clear-subtitle" }, function () {
      void chrome.runtime.lastError;
    });
  }
  capturing = false;
  activeTabId = null;
  chrome.action.setBadgeText({ text: "" });
  await new Promise(function (r) { setTimeout(r, 300); });
}

chrome.tabs.onRemoved.addListener(function (tabId) {
  if (capturing && tabId === activeTabId) stop();
});

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg) return;

  if (msg.type === "ui-start") {
    start(msg.tabId).then(
      function () { sendResponse({ ok: true }); },
      function (e) {
        capturing = false;
        sendResponse({ ok: false, msg: String(e) });
      }
    );
    return true;
  }

  if (msg.type === "ui-stop") {
    stop().then(function () { sendResponse({ ok: true }); });
    return true;
  }

  if (msg.type === "ui-status") {
    sendResponse({ ok: true, capturing: capturing });
    return true;
  }

  if (msg.type === "seek-reset") {
    if (capturing) {
      chrome.runtime.sendMessage({ target: "offscreen", type: "reset" });
    }
    return;
  }

  if (msg.type === "subtitle") {
    chrome.tabs.sendMessage(msg.tabId, { type: "subtitle", segments: msg.segments }, function () {
      void chrome.runtime.lastError;
    });
    return;
  }

  if (msg.type === "capture-error") {
    capturing = false;
    activeTabId = null;
    chrome.action.setBadgeText({ text: "ERR" });
    chrome.action.setBadgeBackgroundColor({ color: "#c92a2a" });
    return;
  }
});
