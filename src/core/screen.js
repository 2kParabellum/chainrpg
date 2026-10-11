// Экран: размер канваса и вида, способ ввода (клавиатура или касание), положение телефона, полноэкранный режим.
// Способ ввода решает устройство (сенсорное или нет), а размер — окно: сцена всегда на всё окно страницы (минус вырез),
// и на компьютере, и на телефоне. Короткая сторона вида — CONFIG.SCREEN.viewMax, если окно достаточно большое
// (большой экран показывает то же, только крупнее), а в тесном окне — сколько влезет при масштабе minScale (но не
// меньше viewMin); длинная сторона — по соотношению сторон окна. CONFIG.VIEW переписывается здесь.
// iPhone: браузер (Chrome, Safari) оставляет странице не весь экран — панели и вырез; весь экран — только у игры,
// запущенной с иконки «На экран Домой». На iPhone в браузере у body класс ios-browser (подсказка в меню).
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

const probe = document.getElementById('safeProbe');
const viewportMeta = document.querySelector('meta[name=viewport]');

function isTouch() { return touch; }
function pixelScale() { return scale; }

// видимая область страницы. На iPhone CSS-размеры экрана после поворота и при панелях браузера часто неверны,
// а visualViewport — то, что реально видно
function viewport() {
  const vv = window.visualViewport;
  return vv
    ? { x: vv.offsetLeft, y: vv.offsetTop, w: vv.width, h: vv.height }
    : { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
}
// вырез экрана и полоска «домой»: env(safe-area-inset-*) читаем через невидимый элемент с такими отступами
function safeInsets() {
  const cs = getComputedStyle(probe);
  const px = (v) => parseFloat(v) || 0;
  return { t: px(cs.paddingTop), r: px(cs.paddingRight), b: px(cs.paddingBottom), l: px(cs.paddingLeft) };
}

// размер страницы без учёта зума (layout viewport): на него зум и панели браузера после поворота не влияют
function layoutSize() {
  const de = document.documentElement;
  return { w: de.clientWidth || window.innerWidth, h: de.clientHeight || window.innerHeight };
}

// телефон держат вертикально (экран выше, чем шире)
function isPortrait() {
  const l = layoutSize();
  return touch && l.h > l.w;
}
// вертикально, а вертикаль выключена (CONFIG.SCREEN.allowPortrait) — плашка «Поверни телефон» и пауза
function needsRotate() { return isPortrait() && !CONFIG.SCREEN.allowPortrait; }

// iPhone мог отдалить страницу (масштаб меньше 1) — тогда всё мельче и игра занимает не всю область.
// Сбрасываем: любое изменение meta viewport заставляет браузер заново применить initial-scale=1. Не больше пары раз
let zoomResets = 0;
function resetZoom() {
  const vv = window.visualViewport;
  if (!touch || !vv || Math.abs(vv.scale - 1) < 0.01 || zoomResets >= 3) return; // счётчик обнуляет refit()
  zoomResets++;
  const content = viewportMeta.getAttribute('content');
  viewportMeta.setAttribute('content', content.includes('initial-scale=1.0')
    ? content.replace('initial-scale=1.0', 'initial-scale=1') : content.replace('initial-scale=1', 'initial-scale=1.0'));
}

// ?debug=1: что браузер сообщает о размерах — по этому видно, сколько места он оставил игре
function sizeReport(cssW, cssH, dpr) {
  const vv = window.visualViewport, de = document.documentElement, ins = safeInsets();
  const vh = (unit) => {
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;left:0;top:0;width:1px;height:100${unit};visibility:hidden;pointer-events:none`;
    document.body.append(el);
    const h = Math.round(el.getBoundingClientRect().height);
    el.remove();
    return h;
  };
  const r = Math.round;
  return [
    vv ? `vv ${r(vv.width)}×${r(vv.height)} x${vv.scale.toFixed(2)} @${r(vv.offsetLeft)},${r(vv.offsetTop)}` : 'vv нет',
    `inner ${window.innerWidth}×${window.innerHeight}`, `client ${de.clientWidth}×${de.clientHeight}`,
    `screen ${screen.width}×${screen.height}`, `svh ${vh('svh')} lvh ${vh('lvh')}`,
    `safe ${r(ins.t)},${r(ins.r)},${r(ins.b)},${r(ins.l)}`,
    `сцена ${cssW}×${cssH} вид ${CONFIG.VIEW.w}×${CONFIG.VIEW.h} dpr ${dpr}${standalone ? ' домой' : ''}`,
  ].join(' | ');
}

let lastKey = '';
// iPhone / iPad (iPad с iOS 13 притворяется Mac'ом), открытый в браузере, а не с иконки на экране «Домой»
const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = navigator.standalone === true
  || matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches;

function fit() {
  document.body.classList.toggle('touch', touch);
  document.body.classList.toggle('ios-browser', ios && !standalone);
  document.body.classList.toggle('portrait', isPortrait());
  document.body.classList.toggle('rotate', needsRotate());
  const S = CONFIG.SCREEN;
  // сцена — всё окно страницы минус вырез (растягивает CSS, здесь только читаем размер)
  const cssW = Math.max(1, stage.clientWidth);
  const cssH = Math.max(1, stage.clientHeight);
  // страница не должна уезжать прокруткой (iPhone прокручивает её при повороте и показе панелей)
  if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
  // масштаб по короткой стороне — объекты одного размера при любом положении телефона и любой форме окна;
  // если места мало, обзор меньше, но не до тесноты
  const short = Math.min(cssW, cssH);
  const minScale = touch ? S.minScale.touch : S.minScale.desktop;
  const k = short / clamp(short / minScale, S.viewMin, S.viewMax); // точек экрана на единицу мира
  CONFIG.VIEW.w = Math.round(cssW / k);
  CONFIG.VIEW.h = Math.round(cssH / k);
  // чёткость под экран, но без лишних пикселей: на большом экране с высокой чёткостью канвас чуть мягче
  const dpr = Math.min(window.devicePixelRatio || 1, S.maxDpr, Math.max(1, Math.sqrt(S.maxPixels / (cssW * cssH))));
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  scale = canvas.height / CONFIG.VIEW.h;
  lastKey = sizeKey();
  if (G.debug && G.debug.enabled) G.debug.note(sizeReport(cssW, cssH, dpr));
  for (const fn of listeners) fn();
  resetZoom();
}

// всё, от чего зависит раскладка: если поменялось, а события браузер не прислал — пересчитать
function sizeKey() {
  const v = viewport(), l = layoutSize();
  return [touch, v.w, v.h, l.w, l.h, stage.clientWidth, stage.clientHeight, window.devicePixelRatio].join(',');
}

function onChange(fn) { listeners.push(fn); }

// на телефоне — полноэкранный режим и горизонтальное положение (Android Chrome; на iPhone не поддерживается — тихо
// ничего не делаем). Вызывать только из обработчика нажатия: браузер разрешает это лишь по действию игрока
function enterFullscreen() {
  if (!touch || !CONFIG.SCREEN.autoFullscreen || document.fullscreenElement) return;
  const el = document.documentElement;
  if (!el.requestFullscreen) return;
  el.requestFullscreen({ navigationUI: 'hide' })
    .then(() => !CONFIG.SCREEN.allowPortrait && screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'))
    .catch(() => {});
}

// пересчёт после поворота: часть браузеров (iPhone) сообщает новый размер не сразу, а то и без события
function refit() { zoomResets = 0; fit(); for (const ms of [100, 300, 700, 1500]) setTimeout(fit, ms); }
window.addEventListener('resize', refit);
window.addEventListener('orientationchange', refit);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', refit);
  window.visualViewport.addEventListener('scroll', fit);
}
setInterval(() => { if (sizeKey() !== lastKey) fit(); }, 400);
// сенсорный экран у компьютера: включаем режим касаний с первого касания
window.addEventListener('pointerdown', (ev) => {
  if (ev.pointerType === 'touch' && !touch && forced !== '0') { touch = true; fit(); }
}, true);

fit();

G.screen = { isTouch, isPortrait, needsRotate, pixelScale, onChange, enterFullscreen, fit };
})(window.Game = window.Game || {});
