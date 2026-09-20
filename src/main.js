// Точка входа: ввод, оверлей главного меню, игровой цикл.
// Устройство кода и правила зависимостей — в architecture.md.
// ВРЕМЕННО (этап 1): обработчики ввода живут здесь, на этапе 3 их заберёт core/input.js.
(function (G) {
'use strict';

const { state } = G;
const { resetGame } = G.session;
const { tryRecruit, dropLastAlly, MENU, menuRect, menuRowY, menuPreviewOrder } = G.chain;
const { update } = G.update;
const { canvas } = G.shapes;
const { drawScene } = G.renderer;
const { drawLight, drawHud } = G.hud;

// --- ввод ---

let mouseDown = false;

function canvasPos(ev) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (ev.clientX - rect.left) * (canvas.width / rect.width),
    y: (ev.clientY - rect.top) * (canvas.height / rect.height),
  };
}

function screenToWorld(ev) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (ev.clientX - rect.left) * (canvas.width / rect.width) + state.camera.x,
    y: (ev.clientY - rect.top) * (canvas.height / rect.height) + state.camera.y,
  };
}

function toggleMenu() {
  if (state.menu.open) { state.menu.open = false; state.menu.drag = null; return; }
  if (state.status !== 'play') return;
  state.menu.open = true;
  state.menu.drag = null;
  mouseDown = false;
}

canvas.addEventListener('mousedown', (ev) => {
  if (ev.button !== 0) return;
  if (state.menu.open) {
    const p = canvasPos(ev);
    const row = Math.floor((p.y - menuRowY(0)) / MENU.rowH);
    const r = menuRect();
    if (row >= 1 && row <= state.allies.length && p.x >= r.x && p.x <= r.x + r.w) {
      state.menu.drag = { from: row - 1, y: p.y };
    }
    return;
  }
  mouseDown = true;
  state.player.target = screenToWorld(ev);
});
canvas.addEventListener('mousemove', (ev) => {
  if (state.menu.open) { if (state.menu.drag) state.menu.drag.y = canvasPos(ev).y; return; }
  if (mouseDown) state.player.target = screenToWorld(ev);
});
window.addEventListener('mouseup', (ev) => {
  mouseDown = false;
  if (state.menu.drag) {
    state.menu.drag.y = canvasPos(ev).y;
    state.allies = menuPreviewOrder();
    state.menu.drag = null;
  }
});
canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

window.addEventListener('keydown', (ev) => {
  if (state.status === 'menu') return;
  if (ev.code === 'KeyR') { resetGame(); return; }
  if (ev.code === 'Space') { ev.preventDefault(); if (!state.menu.open) tryRecruit(); return; }
  if (ev.repeat) return;
  if (ev.code === 'KeyC') toggleMenu();
  else if (ev.code === 'Escape' && state.menu.open) toggleMenu();
  else if (ev.code === 'KeyX') dropLastAlly();
});
document.getElementById('restart').addEventListener('click', (ev) => {
  ev.currentTarget.blur();
  if (state.status !== 'menu') resetGame();
});

// --- главное меню: оверлей поверх канваса, пока status === 'menu' ---

const overlay = document.getElementById('overlay');
const panelMain = document.getElementById('panelMain');
const panelControls = document.getElementById('panelControls');
function showPanel(controls) {
  panelMain.classList.toggle('active', !controls);
  panelControls.classList.toggle('active', controls);
}
document.getElementById('startBtn').addEventListener('click', (ev) => {
  ev.currentTarget.blur();
  resetGame();
  overlay.classList.add('hidden');
});
document.getElementById('controlsBtn').addEventListener('click', (ev) => { ev.currentTarget.blur(); showPanel(true); });
document.getElementById('backBtn').addEventListener('click', (ev) => { ev.currentTarget.blur(); showPanel(false); });

// --- цикл ---

function draw() {
  drawScene();
  drawLight();
  drawHud();
}

let lastTime = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

resetGame();
state.status = 'menu';
requestAnimationFrame(loop);
})(window.Game = window.Game || {});
