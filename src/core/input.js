// Ввод: единственное место, где игра слушает клавиатуру.
// События превращаются в намерения; что они значат для игры, решает вызывающий код.
// Клавиши определяются по физическому положению (ev.code), поэтому раскладка не важна.
//
// handlers:
//   onCommand(name)   'restart' | 'recruit' | 'drop'
// moveAxes() -> { throttle, turn } — опрос зажатых клавиш движения:
//   throttle  +1 вперёд (W), -1 назад (S), 0 — ни одной или обе
//   turn      -1 налево (A), +1 направо (D), 0 — ни одной или обе
(function (G) {
'use strict';

const KEY_COMMANDS = {
  KeyR: { name: 'restart', repeatable: true },
  Space: { name: 'recruit', repeatable: true, preventDefault: true },
  KeyX: { name: 'drop' },
};

// клавиши движения дублируются стрелками
const MOVE_KEYS = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};

const held = new Set();

function moveAxes() {
  const has = (dir) => [...held].some((code) => MOVE_KEYS[code] === dir);
  return {
    throttle: (has('forward') ? 1 : 0) - (has('back') ? 1 : 0),
    turn: (has('right') ? 1 : 0) - (has('left') ? 1 : 0),
  };
}

function initInput(canvas, handlers) {
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
  window.addEventListener('blur', () => held.clear());
}

G.input = { initInput, moveAxes };
})(window.Game = window.Game || {});
