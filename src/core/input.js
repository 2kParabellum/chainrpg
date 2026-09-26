// Ввод: единственное место, где игра слушает мышь и клавиатуру.
// События превращаются в намерения и отдаются обработчикам; что они значат для игры,
// решает вызывающий код. Координаты указателя — в системе канваса, не страницы.
//
// handlers:
//   onPointerDown(p), onPointerMove(p), onPointerUp(p)   p = { x, y } в пикселях канваса
//   onCommand(name)   'restart' | 'recruit' | 'drop' | 'lock'
(function (G) {
'use strict';

const KEY_COMMANDS = {
  KeyR: { name: 'restart', repeatable: true },
  Space: { name: 'recruit', repeatable: true, preventDefault: true },
  KeyX: { name: 'drop' },
  KeyC: { name: 'lock' },
};

function initInput(canvas, handlers) {
  function canvasPos(ev) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (ev.clientX - rect.left) * (canvas.width / rect.width),
      y: (ev.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  canvas.addEventListener('mousedown', (ev) => {
    if (ev.button !== 0) return;
    handlers.onPointerDown(canvasPos(ev));
  });
  canvas.addEventListener('mousemove', (ev) => handlers.onPointerMove(canvasPos(ev)));
  window.addEventListener('mouseup', (ev) => handlers.onPointerUp(canvasPos(ev)));
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

  window.addEventListener('keydown', (ev) => {
    const cmd = KEY_COMMANDS[ev.code];
    if (!cmd) return;
    if (cmd.preventDefault) ev.preventDefault();
    if (ev.repeat && !cmd.repeatable) return;
    handlers.onCommand(cmd.name);
  });
}

G.input = { initInput };
})(window.Game = window.Game || {});
