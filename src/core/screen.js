// Экран: размер канваса и вида, способ ввода (клавиатура или касание), положение телефона, полноэкранный режим.
// На компьютере канвас постоянного размера, как раньше. На телефоне (режим касаний) канвас на весь экран,
// высота вида — CONFIG.SCREEN.touchViewH, ширина — по соотношению сторон экрана; CONFIG.VIEW переписывается здесь.
// Канвас рисуется в разрешении экрана (× devicePixelRatio): игра рисует в единицах мира, а pixelScale() —
// сколько пикселей канваса в одной единице.
//
// Режим касаний: ?touch=1 — включить (так сенсорный интерфейс проверяют мышью), ?touch=0 — выключить;
// иначе — если устройство сенсорное, или с первого касания экрана.
// onChange(fn) — fn() после любого пересчёта (поворот, размер окна, смена режима).
(function (G) {
'use strict';

const { CONFIG } = G;
const { clamp } = G.math;

const canvas = document.getElementById('c');
const stage = document.getElementById('stage');
const params = new URLSearchParams(location.search);
const forced = params.get('touch');
let touch = forced === '1' || (forced !== '0' && matchMedia('(pointer: coarse)').matches);
let scale = 1;
const listeners = [];

function isTouch() { return touch; }
function pixelScale() { return scale; }
// телефон держат вертикально: игра не помещается, просим повернуть
function isPortrait() { return touch && window.innerHeight > window.innerWidth; }

function fit() {
  document.body.classList.toggle('touch', touch);
  document.body.classList.toggle('portrait', isPortrait());
  const S = CONFIG.SCREEN;
  let cssW, cssH;
  if (touch) {
    cssW = Math.max(1, stage.clientWidth);
    cssH = Math.max(1, stage.clientHeight);
    // телефон — вид ниже, чем на компьютере (объекты крупнее); планшет — как на компьютере
    CONFIG.VIEW.h = clamp(cssH, S.touchViewH, S.desktop.h);
    CONFIG.VIEW.w = Math.round(CONFIG.VIEW.h * cssW / cssH);
  } else {
    cssW = S.desktop.w; cssH = S.desktop.h;
    CONFIG.VIEW.w = S.desktop.w; CONFIG.VIEW.h = S.desktop.h;
  }
  const dpr = Math.min(window.devicePixelRatio || 1, S.maxDpr);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  scale = canvas.height / CONFIG.VIEW.h;
  for (const fn of listeners) fn();
}

function onChange(fn) { listeners.push(fn); }

// на телефоне — полноэкранный режим и горизонтальное положение (Android Chrome; на iPhone не поддерживается — тихо
// ничего не делаем). Вызывать только из обработчика нажатия: браузер разрешает это лишь по действию игрока
function enterFullscreen() {
  if (!touch || !CONFIG.SCREEN.autoFullscreen || document.fullscreenElement) return;
  const el = document.documentElement;
  if (!el.requestFullscreen) return;
  el.requestFullscreen({ navigationUI: 'hide' })
    .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'))
    .catch(() => {});
}

// пересчёт после поворота: часть браузеров сообщает новый размер не сразу
function refit() { fit(); setTimeout(fit, 250); }
window.addEventListener('resize', refit);
window.addEventListener('orientationchange', refit);
if (window.visualViewport) window.visualViewport.addEventListener('resize', refit);
// сенсорный экран у компьютера: включаем режим касаний с первого касания
window.addEventListener('pointerdown', (ev) => {
  if (ev.pointerType === 'touch' && !touch && forced !== '0') { touch = true; fit(); }
}, true);

fit();

G.screen = { isTouch, isPortrait, pixelScale, onChange, enterFullscreen, fit };
})(window.Game = window.Game || {});
