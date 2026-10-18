// Сенсорное управление: HTML-слой поверх канваса — плавающий джойстик и кнопки. Касания превращаются в те же
// намерения, что и клавиши: команды уходят в input.command(), отклонение джойстика — в input.setStick().
// Значки паузы и «заново» в углу — отдельно от слоя, тоже только при касаниях (на компьютере — клавиши).
// Размеры — в пикселях экрана, от масштаба игры не зависят. Мультитач: у каждого пальца свой pointerId,
// можно ехать джойстиком и одновременно жать «ВЗЯТЬ».
//
// Джойстик появляется там, где палец коснулся своей половины экрана, и ведётся от этой точки; отпустил — исчез.
// Куда тянут, туда Герой разворачивается и едет: в input.setStick уходит угол (что из него получается газ и поворот,
// решает движение Героя в game/update.js); в мёртвой зоне у центра — null.
// Настройка mirror — зеркально: джойстик слева, кнопки справа. Настройка layout — где стоят кнопки (центр в пикселях
// от левого края — от правого, если зеркально, — и от нижнего; кнопка у края экрана не уходит за него), size — их
// размер (доля обычного). Настройки хранятся в localStorage.
//
// setVisible(on) — показывать ли кнопки (только во время партии и только при касаниях); setGlow(name, on) —
// подсветка кнопки команды ('recruit' — рядом есть кого взять, 'drop' — Герой на кнопке и можно оставить дружочка,
// 'pack' — рюкзак открыт или полон); setShown(name, on) — показывать ли кнопку команды вообще (рюкзак — только
// с его улучшением). editLayout(onDone) — расстановка: слой поверх меню, кнопки перетаскивают пальцем (или мышью),
// команды не срабатывают; «Готово» — onDone().
(function (G) {
'use strict';

const { CONFIG } = G;
const { clamp } = G.math;
const { isTouch } = G.screen;
const { command, setStick } = G.input;

const layer = document.getElementById('touch');
const corner = document.getElementById('corner');
const stickEl = document.getElementById('tStick');
const knobEl = stickEl.querySelector('.knob');
const restartEl = document.getElementById('tRestart');

// --- настройки ---
const STORE_KEY = 'chain.touch';
// кнопки: обычный диаметр и место центра по умолчанию
const PAD_BUTTONS = {
  tGrab: { size: 86, x: 143, y: 61 },
  tDrop: { size: 72, x: 52, y: 106 },
  tPack: { size: 60, x: 146, y: 146 },
};
const SIZES = [0.8, 1, 1.2, 1.4];
function defaultLayout() {
  const layout = {};
  for (const [id, b] of Object.entries(PAD_BUTTONS)) layout[id] = { x: b.x, y: b.y };
  return layout;
}
const settings = { mirror: false, size: 1, layout: defaultLayout() };
try {
  const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
  if (typeof saved.mirror === 'boolean') settings.mirror = saved.mirror;
  if (SIZES.includes(saved.size)) settings.size = saved.size;
  Object.assign(settings.layout, saved.layout || {});
} catch (e) { /* без хранилища — по умолчанию */ }

function getSettings() { return { ...settings }; }
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch (e) { /* не запомнится — не беда */ }
}
function setSetting(key, value) {
  settings[key] = value;
  save();
  applySettings();
}
function resetLayout() {
  settings.layout = defaultLayout();
  settings.size = 1;
  save();
  applySettings();
}

// кнопки по местам: центр не ближе радиуса к краю слоя, чтобы кнопка была видна целиком на любом экране
function placeButtons() {
  const w = layer.clientWidth || window.innerWidth, h = layer.clientHeight || window.innerHeight;
  for (const [id, b] of Object.entries(PAD_BUTTONS)) {
    const el = document.getElementById(id);
    const d = b.size * settings.size, r = d / 2;
    const p = settings.layout[id];
    const x = clamp(p.x, r, Math.max(r, w - r)), y = clamp(p.y, r, Math.max(r, h - r));
    el.style.width = el.style.height = d + 'px';
    el.style.fontSize = Math.round(12 * Math.sqrt(settings.size)) + 'px';
    el.style.bottom = (y - r) + 'px';
    el.style.left = settings.mirror ? '' : (x - r) + 'px';
    el.style.right = settings.mirror ? (x - r) + 'px' : '';
  }
}

function applySettings() {
  document.body.classList.toggle('mirror', settings.mirror);
  placeButtons();
}

// --- кнопки ---
// что делает кнопка: команда; у «заново» — подтверждение вторым касанием, чтобы не сбросить уровень случайно
const BUTTONS = { tGrab: 'recruit', tDrop: 'drop', tPack: 'pack', tPause: 'pause', tRestart: 'restart' };
const CONFIRM_TIME = 2000;
let restartArmedAt = -1e9;

function press(el) {
  if (navigator.vibrate) navigator.vibrate(10);
  const name = BUTTONS[el.id];
  if (name === 'restart') {
    const now = performance.now();
    if (now - restartArmedAt > CONFIRM_TIME) {
      restartArmedAt = now;
      restartEl.classList.add('armed');
      setTimeout(() => { if (performance.now() - restartArmedAt >= CONFIRM_TIME) restartEl.classList.remove('armed'); }, CONFIRM_TIME);
      return;
    }
    restartArmedAt = -1e9;
    restartEl.classList.remove('armed');
  }
  command(name);
}

// --- джойстик ---
let stickId = null;            // палец, который ведёт джойстик
let originX = 0, originY = 0;  // где палец коснулся — центр джойстика (в координатах слоя)
const pressed = new Map();     // палец -> нажатая им кнопка

function moveStick(x, y) {
  const R = CONFIG.TOUCH.stickRadius;
  let dx = x - originX, dy = y - originY;
  const d = Math.hypot(dx, dy);
  if (d > R) { dx *= R / d; dy *= R / d; }
  knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
  setStick(Math.hypot(dx, dy) < CONFIG.TOUCH.deadZone * R ? null : Math.atan2(dy, dx));
}

function releaseStick() {
  stickId = null;
  stickEl.style.display = 'none';
  setStick(null);
}

// точка касания в координатах слоя
function local(ev) {
  const r = layer.getBoundingClientRect();
  return { x: ev.clientX - r.left, y: ev.clientY - r.top, w: r.width, h: r.height };
}

// кнопку нажали пальцем или мышью: подсвечена, пока держат
function pressButton(ev, btn) {
  pressed.set(ev.pointerId, btn);
  btn.classList.add('pressed');
  press(btn);
}

// --- расстановка кнопок ---
let editing = null;            // { onDone } — идёт расстановка
let drag = null;               // { id, btn, dx, dy } — кнопку тащат: палец и смещение от центра

function startDrag(ev, btn) {
  const p = local(ev), r = btn.getBoundingClientRect(), lr = layer.getBoundingClientRect();
  const cx = r.left + r.width / 2 - lr.left, cy = r.top + r.height / 2 - lr.top;
  drag = { id: ev.pointerId, btn, dx: cx - p.x, dy: cy - p.y };
  btn.classList.add('pressed');
  layer.setPointerCapture(ev.pointerId);
}
function moveDrag(ev) {
  const p = local(ev);
  const cx = p.x + drag.dx, cy = p.y + drag.dy;
  settings.layout[drag.btn.id] = { x: Math.round(settings.mirror ? p.w - cx : cx), y: Math.round(p.h - cy) };
  placeButtons();
}
function endDrag() {
  if (!drag) return;
  drag.btn.classList.remove('pressed');
  drag = null;
  // запоминаем там, где кнопку видно: если утащили за край, она встаёт у края
  const w = layer.clientWidth, h = layer.clientHeight;
  for (const [id, b] of Object.entries(PAD_BUTTONS)) {
    const r = b.size * settings.size / 2, p = settings.layout[id];
    settings.layout[id] = { x: clamp(p.x, r, Math.max(r, w - r)), y: clamp(p.y, r, Math.max(r, h - r)) };
  }
  save();
}

function editLayout(onDone) {
  releaseAll();
  editing = { onDone };
  document.body.classList.add('layoutEdit');
  placeButtons();
}
function finishEdit() {
  endDrag();
  editing.onDone();
  editing = null;
  document.body.classList.remove('layoutEdit');
}
// размер кнопок: следующий из SIZES по кругу
function nextSize() {
  const i = SIZES.indexOf(settings.size);
  setSetting('size', SIZES[(i + 1) % SIZES.length]);
  syncEditBar();
}
function syncEditBar() { document.getElementById('tSize').textContent = `Size: ${Math.round(settings.size * 100)}%`; }

document.getElementById('tDone').addEventListener('click', finishEdit);
document.getElementById('tReset').addEventListener('click', () => { resetLayout(); syncEditBar(); });
document.getElementById('tSize').addEventListener('click', nextSize);

layer.addEventListener('pointerdown', (ev) => {
  if (editing) {
    if (ev.target.closest('.tEditBar')) return; // кнопки панели расстановки — обычные щелчки
    ev.preventDefault();
    const btn = ev.target.closest('.tBtn');
    if (btn && !drag) startDrag(ev, btn);
    return;
  }
  ev.preventDefault();
  const btn = ev.target.closest('.tBtn');
  if (btn) { pressButton(ev, btn); return; }
  const p = local(ev);
  // джойстик ведётся только со своей половины экрана: промах мимо кнопки другой рукой его не включает
  const stickSide = settings.mirror ? p.x < p.w / 2 : p.x >= p.w / 2;
  if (!stickSide || stickId !== null) return;
  stickId = ev.pointerId;
  originX = p.x; originY = p.y;
  stickEl.style.left = p.x + 'px';
  stickEl.style.top = p.y + 'px';
  stickEl.style.display = 'block';
  layer.setPointerCapture(ev.pointerId);
  moveStick(p.x, p.y);
});

layer.addEventListener('pointermove', (ev) => {
  if (drag && ev.pointerId === drag.id) { moveDrag(ev); return; }
  if (ev.pointerId !== stickId) return;
  const p = local(ev);
  moveStick(p.x, p.y);
});

function onUp(ev) {
  if (drag && ev.pointerId === drag.id) endDrag();
  if (ev.pointerId === stickId) releaseStick();
  const btn = pressed.get(ev.pointerId);
  if (btn) { btn.classList.remove('pressed'); pressed.delete(ev.pointerId); }
}
corner.addEventListener('pointerdown', (ev) => {
  const btn = ev.target.closest('.tIcon');
  if (!btn) return;
  ev.preventDefault(); // и фокус не забирает: пробел потом не «нажмёт» кнопку
  pressButton(ev, btn);
});

// отпустить могут где угодно: кнопка паузы, например, уже под оверлеем
window.addEventListener('pointerup', onUp);
window.addEventListener('pointercancel', onUp);
layer.addEventListener('lostpointercapture', onUp);
for (const el of [layer, corner]) el.addEventListener('contextmenu', (ev) => ev.preventDefault());

// все пальцы отпущены: свернули вкладку, слой спрятан — Герой не должен ехать сам
function releaseAll() {
  releaseStick();
  endDrag();
  for (const btn of pressed.values()) btn.classList.remove('pressed');
  pressed.clear();
}
document.addEventListener('visibilitychange', releaseAll);

let visible = false;
function setVisible(on) {
  const onTouch = on && isTouch();
  if (onTouch === visible) return;
  visible = onTouch;
  corner.classList.toggle('on', onTouch);
  layer.classList.toggle('on', onTouch);
  releaseAll();
  if (onTouch) placeButtons(); // пока слой был скрыт, его размер не знали
}

const glowEls = { recruit: document.getElementById('tGrab'), drop: document.getElementById('tDrop'),
                  pack: document.getElementById('tPack') };
function setGlow(name, on) { glowEls[name].classList.toggle('glow', !!on); }
function setShown(name, on) { glowEls[name].classList.toggle('shown', !!on); }

applySettings();
syncEditBar();
G.screen.onChange(placeButtons);

G.touch = { setVisible, setGlow, setShown, getSettings, setSetting, editLayout };
})(window.Game = window.Game || {});
