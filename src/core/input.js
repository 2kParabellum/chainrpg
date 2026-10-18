// Ввод: единственное место, где игра слушает клавиатуру и мышь; касания слушает core/touch.js и передаёт сюда же
// (command и setStick). События превращаются в намерения; что они значат для игры, решает вызывающий код.
// Клавиши определяются по физическому положению (ev.code), поэтому раскладка не важна.
//
// Действия (ACTIONS) игрок назначает сам: у каждого два места под клавишу или кнопку мыши ('Mouse0' — левая,
// 'Mouse2' — правая); назначения хранятся в localStorage. Одна клавиша — одно действие: назначил её другому —
// у прежнего она снимается. Без переназначения: ESC — пауза, 1 / 2 / 3 — выбор карточки улучшения.
// Мышь слушается только на канвасе (во время партии: в меню канвас закрыт оверлеем) и только не в режиме касаний.
//
// handlers:
//   onCommand(name)   'restart' | 'recruit' | 'drop' | 'pack' (рюкзак Героя) | 'pause' | 'pick1' | 'pick2' | 'pick3'
//                     (выбор карточки улучшения)
// moveAxes() -> { throttle, turn, aim, toward } — опрос зажатых клавиш движения, мыши и джойстика:
//   throttle  +1 вперёд, -1 «назад» (Герой назад не ездит, для него это просто без газа), 0 — ни одной или обе
//   turn      -1 налево, +1 направо, 0 — ни одной или обе; от джойстика — дробное (плавный поворот)
//   aim       угол, куда тянут джойстик в режиме «Направление» (Герой разворачивается туда и едет), иначе null
//   toward    точка курсора в единицах вида { x, y } (от левого верхнего угла экрана), пока зажата кнопка «ехать
//             к курсору», иначе null; как из неё получается движение, решает game/update.js
// keyLabel(command) — как назвать игроку кнопку команды: на клавиатуре — первая назначенная («SPACE»), при касаниях «GRAB»
// captureBinding(fn, el) — следующая клавиша не действует, а уходит в fn(code): ESC — fn(undefined) (отмена),
// Delete / Backspace — fn(null) (очистить); кнопка мыши — только нажатая над элементом el, нажатие мимо — отмена
(function (G) {
'use strict';

const { CONFIG } = G;
const { isTouch } = G.screen;

// действия, которые можно переназначить: move — держат (опрашивается каждый кадр), команда — срабатывает при нажатии
// (repeatable — и при автоповторе зажатой клавиши)
const ACTIONS = {
  forward: { move: true, defaults: ['KeyW', 'ArrowUp'] },
  back: { move: true, defaults: ['KeyS', 'ArrowDown'] },
  left: { move: true, defaults: ['KeyA', 'ArrowLeft'] },
  right: { move: true, defaults: ['KeyD', 'ArrowRight'] },
  cursor: { move: true, defaults: ['Mouse0', null] },
  recruit: { repeatable: true, defaults: ['Space', 'Mouse2'] },
  drop: { defaults: ['KeyX', null] },
  pack: { defaults: ['KeyC', null] },
  restart: { repeatable: true, defaults: ['KeyR', null] },
  pause: { defaults: ['KeyP', null] },
};

// клавиши, которые не переназначаются
const FIXED = {
  Escape: 'pause',
  Digit1: 'pick1', Digit2: 'pick2', Digit3: 'pick3',
  Numpad1: 'pick1', Numpad2: 'pick2', Numpad3: 'pick3',
};

// подписи сенсорных кнопок команд в подсказках
const TOUCH_LABELS = { recruit: 'GRAB', drop: 'DROP', pack: 'BAG', restart: '↻', pause: '❚❚' };

// --- назначения ---
const STORE_KEY = 'chain.keys';
const bindings = {};
function defaultBindings() {
  for (const [name, a] of Object.entries(ACTIONS)) bindings[name] = a.defaults.slice();
}
defaultBindings();
try {
  const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
  if (saved) for (const name of Object.keys(ACTIONS)) {
    if (Array.isArray(saved[name])) bindings[name] = [saved[name][0] || null, saved[name][1] || null];
  }
} catch (e) { /* без хранилища — по умолчанию */ }
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(bindings)); } catch (e) { /* не запомнится — не беда */ }
}

function getBindings() {
  const copy = {};
  for (const [name, codes] of Object.entries(bindings)) copy[name] = codes.slice();
  return copy;
}
// назначить code на место slot (0 или 1) действия name; null — очистить. Клавиша снимается с других действий
function setBinding(name, slot, code) {
  if (code) for (const codes of Object.values(bindings)) codes.forEach((c, i) => { if (c === code) codes[i] = null; });
  bindings[name][slot] = code;
  save();
}
function resetBindings() { defaultBindings(); save(); }

// действие, на которое назначена клавиша; null — ни на какое
function actionOf(code) {
  for (const [name, codes] of Object.entries(bindings)) if (codes.includes(code)) return name;
  return null;
}

// --- подписи ---
const MOUSE_NAMES = ['LMB', 'MMB', 'RMB', 'MOUSE 4', 'MOUSE 5'];
const KEY_NAMES = {
  Space: 'SPACE', Escape: 'ESC', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  ShiftLeft: 'L SHIFT', ShiftRight: 'R SHIFT', ControlLeft: 'L CTRL', ControlRight: 'R CTRL',
  AltLeft: 'L ALT', AltRight: 'R ALT', MetaLeft: 'L META', MetaRight: 'R META', Enter: 'ENTER', Tab: 'TAB',
  Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';',
  Quote: "'", Comma: ',', Period: '.', Slash: '/', CapsLock: 'CAPS',
};
// как назвать клавишу или кнопку мыши: 'KeyX' -> 'X', 'Mouse2' -> 'RMB', 'Numpad5' -> 'NUM 5'
function codeLabel(code) {
  if (!code) return '—';
  if (code.startsWith('Mouse')) return MOUSE_NAMES[Number(code.slice(5))] || `MOUSE ${Number(code.slice(5)) + 1}`;
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (code.startsWith('Numpad')) return 'NUM ' + code.slice(6).toUpperCase();
  return code.replace(/([a-z])([A-Z0-9])/g, '$1 $2').toUpperCase();
}

function keyLabel(name) {
  if (isTouch()) return TOUCH_LABELS[name];
  const code = (bindings[name] || []).find((c) => c);
  return code ? codeLabel(code) : name === 'pause' ? 'ESC' : '—';
}

// «{recruit} — взять» -> «SPACE — взять» или «GRAB — взять» по способу ввода
function withKeys(text) { return text.replace(/\{(\w+)\}/g, (m, name) => (TOUCH_LABELS[name] ? keyLabel(name) : m)); }

// --- опрос ---
const held = new Set();   // зажатые клавиши и кнопки мыши ('Mouse0')
let handlers = null;
let canvasEl = null;
let pointer = null;       // где курсор: { x, y } в координатах окна; null — ещё не двигали
// джойстик: { throttle, turn, aim } от core/touch.js; null — не тянут
let stick = null;
let capture = null;       // ждём клавишу для назначения: fn(code)
let captureEl = null;     // над ним нажатая кнопка мыши назначается

function holding(name) { return bindings[name].some((c) => c && held.has(c)); }

// курсор в единицах вида
function cursorView() {
  if (!pointer || !canvasEl) return null;
  const r = canvasEl.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return { x: (pointer.x - r.left) / r.width * CONFIG.VIEW.w, y: (pointer.y - r.top) / r.height * CONFIG.VIEW.h };
}

function moveAxes() {
  const keys = {
    throttle: (holding('forward') ? 1 : 0) - (holding('back') ? 1 : 0),
    turn: (holding('right') ? 1 : 0) - (holding('left') ? 1 : 0),
    aim: null,
    toward: null,
  };
  // клавиши движения зажаты — им и слушаемся; иначе мышь, иначе джойстик
  if (keys.throttle || keys.turn) return keys;
  if (holding('cursor') && !isTouch()) {
    const toward = cursorView();
    if (toward) return { throttle: 0, turn: 0, aim: null, toward };
  }
  if (!stick) return keys;
  return { throttle: stick.throttle, turn: stick.turn, aim: stick.aim, toward: null };
}

function setStick(axes) { stick = axes; }

function command(name) { if (handlers) handlers.onCommand(name); }

function captureBinding(fn, el) { capture = fn; captureEl = el; }
function cancelCapture() { if (capture) { const fn = capture; capture = null; fn(undefined); } }

function finishCapture(code) {
  const fn = capture;
  capture = null;
  fn(code);
}

// нажатие клавиши или кнопки мыши code: команда (или выбор карточки) срабатывает; repeat — автоповтор клавиши
function press(code, repeat) {
  const name = actionOf(code);
  if (name && !ACTIONS[name].move && (!repeat || ACTIONS[name].repeatable)) handlers.onCommand(name);
  if (FIXED[code] && !repeat && FIXED[code] !== name) handlers.onCommand(FIXED[code]);
}

const MODIFIERS = /^(Shift|Control|Alt|Meta)/;
// клавиши, у которых у браузера своё действие (прокрутка, поиск), — его не нужно, если клавиша в игре
const BROWSER_KEYS = /^(Space|Arrow|Tab|Slash|Quote|Backspace|PageUp|PageDown|Home|End)/;

function initInput(canvas, h) {
  handlers = h;
  canvasEl = canvas;
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

  window.addEventListener('keydown', (ev) => {
    // с Ctrl / Alt / Cmd — сочетания браузера (Ctrl+R — обновить), игре не нужны
    if ((ev.ctrlKey || ev.metaKey || ev.altKey) && !MODIFIERS.test(ev.code)) return;
    if (capture) {
      ev.preventDefault();
      if (ev.repeat) return;
      finishCapture(ev.code === 'Escape' ? undefined : ev.code === 'Delete' || ev.code === 'Backspace' ? null : ev.code);
      return;
    }
    const known = actionOf(ev.code) || FIXED[ev.code];
    if (!known) return;
    if (BROWSER_KEYS.test(ev.code)) ev.preventDefault();
    held.add(ev.code);
    press(ev.code, ev.repeat);
  });
  window.addEventListener('keyup', (ev) => held.delete(ev.code));

  // мышь: кнопки — на канвасе (во время партии), отпускание и курсор — где угодно
  canvas.addEventListener('mousedown', (ev) => {
    if (isTouch() || capture) return;
    ev.preventDefault();
    const code = 'Mouse' + ev.button;
    held.add(code);
    press(code, false);
  });
  window.addEventListener('mouseup', (ev) => held.delete('Mouse' + ev.button));
  window.addEventListener('mousemove', (ev) => { pointer = { x: ev.clientX, y: ev.clientY }; });
  // назначение на кнопку мыши: нажатие над ожидающим элементом, и щелчок после него ничего не нажимает;
  // нажатие мимо — отмена, а щелчок срабатывает как обычно
  window.addEventListener('mousedown', (ev) => {
    if (!capture) return;
    if (!captureEl || !captureEl.contains(ev.target)) { cancelCapture(); return; }
    ev.preventDefault(); ev.stopPropagation();
    // щелчок, меню правой кнопки и щелчок средней приходят после нажатия — до конца этого отпускания их не пускаем
    const swallow = (e) => { e.preventDefault(); e.stopPropagation(); };
    const types = ['click', 'auxclick', 'contextmenu'];
    for (const t of types) window.addEventListener(t, swallow, true);
    window.addEventListener('mouseup', () => setTimeout(() => {
      for (const t of types) window.removeEventListener(t, swallow, true);
    }, 0), { capture: true, once: true });
    finishCapture('Mouse' + ev.button);
  }, true);

  // окно потеряло фокус (Alt+Tab): отпускания клавиш не придёт, иначе Герой поедет сам
  window.addEventListener('blur', () => { held.clear(); stick = null; });
}

G.input = {
  ACTIONS, initInput, moveAxes, setStick, command, keyLabel, withKeys, codeLabel,
  getBindings, setBinding, resetBindings, captureBinding, cancelCapture,
};
})(window.Game = window.Game || {});
