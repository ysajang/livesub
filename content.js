(() => {
  if (window.__livesub_ready) return;
  window.__livesub_ready = true;

  const box = document.createElement("div");
  box.id = "__livesub_box";
  box.style.cssText = [
    "position:fixed",
    "left:50%",
    "bottom:9%",
    "transform:translateX(-50%)",
    "z-index:2147483647",
    "max-width:80vw",
    "padding:10px 18px",
    "background:rgba(0,0,0,.72)",
    "color:#fff",
    "font:600 22px/1.45 'Malgun Gothic',system-ui,sans-serif",
    "text-align:center",
    "border-radius:8px",
    "pointer-events:none",
    "text-shadow:0 2px 4px rgba(0,0,0,.9)",
    "white-space:pre-wrap",
    "display:none"
  ].join(";");
  document.documentElement.appendChild(box);

  let hideTimer = null;

  function show(text) {
    if (!text) return;
    box.textContent = text;
    box.style.display = "block";
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      box.style.display = "none";
    }, 8000);
  }

  function hide() {
    box.style.display = "none";
    if (hideTimer) clearTimeout(hideTimer);
  }

  function reattach() {
    const fs = document.fullscreenElement;
    const parent = fs || document.documentElement;
    if (box.parentElement !== parent) parent.appendChild(box);
  }

  document.addEventListener("fullscreenchange", reattach);

  // 탐색 감지 -> 오프스크린 버퍼 리셋 요청
  const watched = new WeakSet();

  function notifySeek() {
    hide();
    chrome.runtime.sendMessage({ type: "seek-reset" });
  }

  function attachVideo(v) {
    if (watched.has(v)) return;
    watched.add(v);
    v.addEventListener("seeking", notifySeek);
    v.addEventListener("ratechange", notifySeek);
  }

  function scan() {
    document.querySelectorAll("video").forEach(attachVideo);
  }

  scan();
  const mo = new MutationObserver(scan);
  mo.observe(document.documentElement, { childList: true, subtree: true });

  chrome.runtime.onMessage.addListener(function (msg) {
    if (!msg) return;
    if (msg.type === "subtitle") {
      reattach();
      const lines = msg.segments
        .map(function (s) { return s.ko ? s.ko : s.text; })
        .filter(Boolean);
      show(lines.join("\n"));
    }
    if (msg.type === "clear-subtitle") hide();
  });
})();
