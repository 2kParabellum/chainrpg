// Точка входа: связывает ввод, экраны и игровой цикл.
// Устройство кода и правила зависимостей — в architecture.md.
//
// Экран определяет state.status (menu | play | dead | win) — это единственный источник правды.
// Оверлей главного меню в HTML только отражает его и сам ничего не решает.
(function (G) {
'use strict';

const { state } = G;
const { initInput } = G.input;
const { resetGame } = G.session;
const { tryRecruit, dropLastAlly, MENU, menuRect, menuRowY, menuPreviewOrder } = G.chain;
const { update } = G.update;
const { canvas } = G.shapes;
const { drawScene } = G.renderer;
const { drawLight, drawHud } = G.hud;

const START_LEVEL = G.level1;

// --- ввод: намерения игрока ---

let mouseDown = false;

// координаты канваса -> координаты мира
function toWorld(p) { return { x: p.x + state.camera.x, y: p.y + state.camera.y }; }

function toggleMenu() {
  if (state.menu.open) { state.menu.open = false; state.menu.drag = null; return; }
  if (state.status !== 'play') return;
  state.menu.open = true;
  state.menu.drag = null;
  mouseDown = false;
}

initInput(canvas, {
  onPointerDown(p) {
    if (state.menu.open) {
      const row = Math.floor((p.y - menuRowY(0)) / MENU.rowH);
      const r = menuRect();
      if (row >= 1 && row <= state.allies.length && p.x >= r.x && p.x <= r.x + r.w) {
        state.menu.drag = { from: row - 1, y: p.y };
      }
      return;
    }
    mouseDown = true;
    state.player.target = toWorld(p);
  },
  onPointerMove(p) {
    if (state.menu.open) { if (state.menu.drag) state.menu.drag.y = p.y; return; }
    if (mouseDown) state.player.target = toWorld(p);
  },
  onPointerUp(p) {
    mouseDown = false;
    if (state.menu.drag) {
      state.menu.drag.y = p.y;
      state.allies = menuPreviewOrder();
      state.menu.drag = null;
    }
  },
  onCommand(name) {
    if (state.status === 'menu') return;
    if (name === 'restart') resetGame(state.level);
    else if (name === 'recruit') { if (!state.menu.open) tryRecruit(); }
    else if (name === 'toggleMenu') toggleMenu();
    else if (name === 'cancel') { if (state.menu.open) toggleMenu(); }
    else if (name === 'drop') dropLastAlly();
  },
});

// --- экраны: кнопки и оверлей главного меню ---

const overlay = document.getElementById('overlay');
const panelMain = document.getElementById('panelMain');
const panelControls = document.getElementById('panelControls');

function showPanel(controls) {
  panelMain.classList.toggle('active', !controls);
  panelControls.classList.toggle('active', controls);
}
function syncOverlay() { overlay.classList.toggle('hidden', state.status !== 'menu'); }

document.getElementById('restart').addEventListener('click', (ev) => {
  ev.currentTarget.blur();
  if (state.status !== 'menu') resetGame(state.level);
});
document.getElementById('startBtn').addEventListener('click', (ev) => {
  ev.currentTarget.blur();
  resetGame(START_LEVEL);
  syncOverlay();
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
  syncOverlay();
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

resetGame(START_LEVEL);
state.status = 'menu';
syncOverlay();
requestAnimationFrame(loop);
})(window.Game = window.Game || {});
