// Сенсорное управление: HTML-слой поверх канваса — плавающий джойстик и кнопки. Касания превращаются в те же
// намерения, что и клавиши: команды уходят в input.command(), отклонение джойстика — в input.setStick().
// Значки паузы и «заново» в углу — отдельно от слоя: они есть и на компьютере (мышью).
// Размеры — в пикселях экрана, от масштаба игры не зависят. Мультитач: у каждого пальца свой pointerId,
// можно ехать джойстиком и одновременно жать «ВЗЯТЬ».
//
// Джойстик появляется там, где палец коснулся своей половины экрана, и ведётся от этой точки; отпустил — исчез.
// Два режима джойстика (настройка mode):
//   'tank' — как клавиатура: вверх — газ (по порогу), влево/вправо — плавный поворот;
//   'aim'  — «Направление»: куда тянут, туда Герой разворачивается и едет (что из угла получается газ и поворот,
//            решает движение Героя в game/update.js).
// Настройка mirror — зеркально: джойстик слева, кнопки справа. Настройки хранятся в localStorage.
//
// setVisible(on) — показывать ли кнопки (только во время партии; джойстик и «ВЗЯТЬ» / «БРОСИТЬ» — только при
// касаниях, значки в углу — всегда); setGlow(name, on) — подсветка кнопки команды
// ('recruit' — рядом есть кого взять, 'drop' — Герой на кнопке и можно оставить дружочка).
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
const settings = { mode: 'aim', mirror: false };
try { Object.assign(settings, JSON.parse(localStorage.getItem(STORE_KEY) || '{}')); } catch (e) { /* без хранилища — по умолчанию */ }

function getSettings() { return { ...settings }; }
function setSetting(key, value) {
  settings[key] = value;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch (e) { /* не запомнится — не беда */ }
  applySettings();
}
function applySettings() { document.body.classList.toggle('mirror', settings.mirror); }

// --- кнопки ---
// что делает кнопка: команда; у «заново» — подтверждение вторым касанием, чтобы не сбросить уровень случайно
const BUTTONS = { tGrab: 'recruit', tDrop: 'drop', tPause: 'pause', tRestart: 'restart' };
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

function stickAxes(nx, ny) {
  const T = CONFIG.TOUCH;
  const m = Math.hypot(nx, ny);
  if (m < T.deadZone) return { throttle: 0, turn: 0, aim: null };
  if (settings.mode === 'aim') return { throttle: 0, turn: 0, aim: Math.atan2(ny, nx) };
  const turn = Math.sign(nx) * clamp((Math.abs(nx) - T.deadZone) / (1 - T.deadZone), 0, 1);
  const throttle = ny < -T.throttleZone ? 1 : ny > T.throttleZone ? -1 : 0;
  return { throttle, turn, aim: null };
}

function moveStick(x, y) {
  const R = CONFIG.TOUCH.stickRadius;
  let dx = x - originX, dy = y - originY;
  const d = Math.hypot(dx, dy);
  if (d > R) { dx *= R / d; dy *= R / d; }
  knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
  setStick(stickAxes(dx / R, dy / R));
}

function releaseStick() {
  stickId = null;
  stickEl.style.display = 'none';
  setStick(null);
}

// точка касания в координатах слоя
function local(ev) {
  const r = layer.getBoundingClientRect();
  return { x: ev.clientX - r.left, y: ev.clientY - r.top, w: r.width };
}

// кнопку нажали пальцем или мышью: подсвечена, пока держат
function pressButton(ev, btn) {
  pressed.set(ev.pointerId, btn);
  btn.classList.add('pressed');
  press(btn);
}

layer.addEventListener('pointerdown', (ev) => {
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
  if (ev.pointerId !== stickId) return;
  const p = local(ev);
  moveStick(p.x, p.y);
});

function onUp(ev) {
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
  for (const btn of pressed.values()) btn.classList.remove('pressed');
  pressed.clear();
}
document.addEventListener('visibilitychange', releaseAll);

let visible = false, visibleTouch = false;
function setVisible(on) {
  const onTouch = on && isTouch();
  if (on === visible && onTouch === visibleTouch) return;
  visible = on; visibleTouch = onTouch;
  corner.classList.toggle('on', on);
  layer.classList.toggle('on', onTouch);
  releaseAll();
}

const glowEls = { recruit: document.getElementById('tGrab'), drop: document.getElementById('tDrop') };
function setGlow(name, on) { glowEls[name].classList.toggle('glow', !!on); }

applySettings();

G.touch = { setVisible, setGlow, getSettings, setSetting };
})(window.Game = window.Game || {});
