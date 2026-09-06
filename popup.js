const msgEl = document.getElementById("msg");
const goEl = document.getElementById("go");
const langEl = document.getElementById("lang");
const chunkEl = document.getElementById("chunk");
const trEl = document.getElementById("tr");
let tabId = null;
let running = false;

function render() {
  goEl.textContent = running ? "자막 중지" : "자막 시작";
  goEl.className = running ? "stop" : "";
  langEl.disabled = running;
  chunkEl.disabled = running;
  trEl.disabled = running;
}

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab && tab.id;

  const cfg = await chrome.storage.local.get(["lang", "chunkSec", "doTranslate"]);
  if (cfg.lang) langEl.value = cfg.lang;
  if (cfg.chunkSec) chunkEl.value = String(cfg.chunkSec);
  trEl.checked = cfg.doTranslate !== false;

  chrome.runtime.sendMessage({ type: "ui-status" }, (r) => {
    running = !!(r && r.capturing);
    render();
  });

  try {
    const h = await fetch("http://127.0.0.1:8765/health");
    if (!h.ok) throw new Error();
    msgEl.textContent = "서버 연결됨";
  } catch (e) {
    msgEl.textContent = "서버 없음 - 로컬 서버를 먼저 실행하세요";
  }
})();

async function saveCfg() {
  await chrome.storage.local.set({
    lang: langEl.value,
    chunkSec: parseInt(chunkEl.value, 10),
    doTranslate: trEl.checked
  });
}

goEl.addEventListener("click", async () => {
  if (!tabId) return;
  goEl.disabled = true;

  if (running) {
    chrome.runtime.sendMessage({ type: "ui-stop" }, () => {
      running = false;
      goEl.disabled = false;
      msgEl.textContent = "중지됨";
      render();
    });
    return;
  }

  await saveCfg();
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  } catch (e) {
    msgEl.textContent = "이 페이지에는 자막을 표시할 수 없습니다";
    goEl.disabled = false;
    return;
  }

  msgEl.textContent = "캡처 시작 중...";
  chrome.runtime.sendMessage({ type: "ui-start", tabId }, (r) => {
    goEl.disabled = false;
    if (r && r.ok) {
      running = true;
      msgEl.textContent = "자막 동작 중";
    } else {
      msgEl.textContent = "실패: " + ((r && r.msg) || "unknown");
    }
    render();
  });
});
