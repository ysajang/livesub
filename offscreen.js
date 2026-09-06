let stream = null;
let ctx = null;
let recorder = null;
let timer = null;
let conf = null;
let gen = 0;

chrome.runtime.onMessage.addListener(function (msg) {
  if (!msg || msg.target !== "offscreen") return;
  if (msg.type === "start") startCapture(msg);
  if (msg.type === "stop") stopCapture();
  if (msg.type === "reset") resetChunk();
});

async function startCapture(cfg) {
  stopCapture();
  conf = cfg;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: cfg.streamId
        }
      }
    });
  } catch (e) {
    chrome.runtime.sendMessage({ type: "capture-error", msg: String(e) });
    return;
  }

  ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  src.connect(ctx.destination);

  loop();
}

// 탐색 발생 -> 현재 조각을 버리고 새로 시작
function resetChunk() {
  if (!stream) return;
  gen++;
  if (timer) clearTimeout(timer);
  timer = null;
  if (recorder && recorder.state === "recording") {
    recorder.ondataavailable = null;
    recorder.onstop = null;
    recorder.stop();
  }
  recorder = null;
  loop();
}

function loop() {
  if (!stream) return;
  const myGen = gen;
  const chunks = [];
  recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
  recorder.ondataavailable = function (e) {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  recorder.onstop = function () {
    if (myGen === gen && chunks.length) {
      send(new Blob(chunks, { type: "audio/webm" }), myGen);
    }
    if (myGen === gen && stream) loop();
  };
  recorder.start();
  timer = setTimeout(function () {
    if (recorder && recorder.state === "recording") recorder.stop();
  }, (conf.chunkSec || 5) * 1000);
}

async function send(blob, myGen) {
  try {
    const fd = new FormData();
    fd.append("audio", blob, "chunk.webm");
    fd.append("lang", conf.lang);
    fd.append("do_translate", conf.doTranslate);

    const r = await fetch(conf.server + "/transcribe", { method: "POST", body: fd });
    const j = await r.json();

    // 탐색으로 세대가 바뀌었으면 늦게 온 결과는 버린다
    if (myGen !== gen) return;

    if (j.segments && j.segments.length) {
      chrome.runtime.sendMessage({
        type: "subtitle",
        tabId: conf.tabId,
        segments: j.segments
      });
    }
  } catch (e) {
    console.error("send failed", e);
  }
}

function stopCapture() {
  gen++;
  if (timer) clearTimeout(timer);
  timer = null;
  if (recorder && recorder.state === "recording") {
    recorder.ondataavailable = null;
    recorder.onstop = null;
    recorder.stop();
  }
  recorder = null;
  if (stream) {
    stream.getTracks().forEach(function (t) { t.stop(); });
    stream = null;
  }
  if (ctx) {
    ctx.close();
    ctx = null;
  }
}
