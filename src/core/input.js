// Ввод: единственное место, где игра слушает клавиатуру; касания слушает core/touch.js и передаёт сюда же
// (command и setStick). События превращаются в намерения; что они значат для игры, решает вызывающий код.
// Клавиши определяются по физическому положению (ev.code), поэтому раскладка не важна.
//
// handlers:
//   onCommand(name)   'restart' | 'recruit' | 'drop' | 'pause' | 'pick1' | 'pick2' | 'pick3' (выбор карточки улучшения)
// moveAxes() -> { throttle, turn, aim } — опрос зажатых клавиш движения и джойстика:
//   throttle  +1 вперёд (W), -1 назад (S), 0 — ни одной или обе
//   turn      -1 налево (A), +1 направо (D), 0 — ни одной или обе; от джойстика — дробное (плавный поворот)
//   aim       угол, куда тянут джойстик в режиме «Направление» (Герой разворачивается туда и едет), иначе null
// keyLabel(command) — как назвать игроку кнопку команды: на клавиатуре «ПРОБЕЛ», при касаниях «ВЗЯТЬ»
(function (G) {
'use strict';

const { isTouch } = G.screen;

const KEY_COMMANDS = {
  KeyR: { name: 'restart', repeatable: true },
  Space: { name: 'recruit', repeatable: true, preventDefault: true },
  KeyX: { name: 'drop' },
  Escape: { name: 'pause' }, KeyP: { name: 'pause' },
  Digit1: { name: 'pick1' }, Digit2: { name: 'pick2' }, Digit3: { name: 'pick3' },
  Numpad1: { name: 'pick1' }, Numpad2: { name: 'pick2' }, Numpad3: { name: 'pick3' },
};

// подписи кнопок команд в подсказках: клавиатура / сенсорные кнопки
const LABELS = {
  recruit: { keys: 'ПРОБЕЛ', touch: 'ВЗЯТЬ' },
  drop: { keys: 'X', touch: 'БРОСИТЬ' },
  restart: { keys: 'R', touch: '↻' },
};

// клавиши движения дублируются стрелками
const MOVE_KEYS = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};

const held = new Set();
let handlers = null;
// джойстик: { throttle, turn, aim } от core/touch.js; null — не тянут
let stick = null;

function moveAxes() {
  const has = (dir) => [...held].some((code) => MOVE_KEYS[code] === dir);
  const keys = {
    throttle: (has('forward') ? 1 : 0) - (has('back') ? 1 : 0),
    turn: (has('right') ? 1 : 0) - (has('left') ? 1 : 0),
    aim: null,
  };
  if (!stick) return keys;
  // клавиатура и джойстик вместе: по каждой оси — что сильнее; клавиши движения зажаты — направление джойстика не нужно
  return {
    throttle: keys.throttle || stick.throttle,
    turn: Math.abs(keys.turn) >= Math.abs(stick.turn) ? keys.turn : stick.turn,
    aim: keys.throttle || keys.turn ? null : stick.aim,
  };
}

function setStick(axes) { stick = axes; }

function command(name) { if (handlers) handlers.onCommand(name); }

function keyLabel(name) { return LABELS[name][isTouch() ? 'touch' : 'keys']; }

// «{recruit} — взять» -> «ПРОБЕЛ — взять» или «ВЗЯТЬ — взять» по способу ввода
function withKeys(text) { return text.replace(/\{(\w+)\}/g, (m, name) => (LABELS[name] ? keyLabel(name) : m)); }

function initInput(canvas, h) {
  handlers = h;
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

  window.addEventListener('keydown', (ev) => {
    if (MOVE_KEYS[ev.code]) {
      held.add(ev.code);
      if (ev.code.startsWith('Arrow')) ev.preventDefault();
      return;
    }
    const cmd = KEY_COMMANDS[ev.code];
    if (!cmd) return;
    if (cmd.preventDefault) ev.preventDefault();
    if (ev.repeat && !cmd.repeatable) return;
    handlers.onCommand(cmd.name);
  });
  window.addEventListener('keyup', (ev) => held.delete(ev.code));
  // окно потеряло фокус (Alt+Tab): отпускания клавиш не придёт, иначе Герой поедет сам
  window.addEventListener('blur', () => { held.clear(); stick = null; });
}

G.input = { initInput, moveAxes, setStick, command, keyLabel, withKeys };
})(window.Game = window.Game || {});
