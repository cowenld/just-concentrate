/* ──────────────────────────────────────────────
   Just Concentrate — offscreen badge-timer ticker
   Runs a 1-second interval and posts formatted
   countdown text to the background, which sets
   chrome.action badge. Lives in an offscreen
   document so the ticker survives SW suspension.
   ────────────────────────────────────────────── */

let timer = null;
let endTime = 0;

function fmt(ms) {
  if (ms <= 0) return '';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function tick() {
  const remaining = endTime - Date.now();
  if (remaining <= 0) {
    chrome.runtime.sendMessage({ type: 'badgeTick', text: '' });
    stop();
    return;
  }
  chrome.runtime.sendMessage({ type: 'badgeTick', text: fmt(remaining) });
}

function start(end) {
  endTime = end;
  stop();
  tick();
  timer = setInterval(tick, 1000);
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'tickerStart') start(msg.endTime);
  if (msg && msg.type === 'tickerStop') {
    stop();
    chrome.runtime.sendMessage({ type: 'badgeTick', text: '' });
  }
});

chrome.runtime.sendMessage({ type: 'getTimerState' }, (resp) => {
  void chrome.runtime.lastError;
  if (resp && resp.active && resp.endTime > Date.now()) start(resp.endTime);
});
