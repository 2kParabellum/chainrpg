// Отладка на телефоне, где нет консоли: по ?debug=1 в верху экрана — FPS и текст последней ошибки JS.
// Подключается первым, чтобы ловить ошибки всех остальных файлов. Ни от кого не зависит.
(function (G) {
'use strict';

const enabled = new URLSearchParams(location.search).get('debug') === '1';
const el = document.getElementById('debug');
let lastError = '';
let frames = 0, since = performance.now(), fps = 0;

function show() {
  if (enabled) el.textContent = `FPS ${fps}${lastError ? '  |  ' + lastError : ''}`;
}

window.addEventListener('error', (ev) => {
  const file = (ev.filename || '').split('/').pop();
  lastError = `${ev.message} @ ${file}:${ev.lineno}`;
  show();
});
window.addEventListener('unhandledrejection', (ev) => { lastError = String(ev.reason); show(); });

// main.js зовёт каждый кадр: раз в полсекунды пересчитываем FPS
function frame(now) {
  if (!enabled) return;
  frames++;
  if (now - since >= 500) {
    fps = Math.round(frames * 1000 / (now - since));
    frames = 0; since = now;
    show();
  }
}

if (enabled) el.style.display = 'block';

G.debug = { frame };
})(window.Game = window.Game || {});
