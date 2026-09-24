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

// уровни в порядке их показа в меню; за фоном меню при запуске стоит первый
const LEVELS = [G.level1, G.level2];
const START_LEVEL = LEVELS[0];

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
      if (row >= 1 && row <= state.party.length - 1 && p.x >= r.x && p.x <= r.x + r.w) {
        state.menu.drag = { from: row, y: p.y };
      }
      return;
    }
    mouseDown = true;
    state.moveTarget = toWorld(p);
  },
  onPointerMove(p) {
    if (state.menu.open) { if (state.menu.drag) state.menu.drag.y = p.y; return; }
    if (mouseDown) state.moveTarget = toWorld(p);
  },
  onPointerUp(p) {
    mouseDown = false;
    if (state.menu.drag) {
      state.menu.drag.y = p.y;
      state.party = menuPreviewOrder();
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
const panels = {
  main: document.getElementById('panelMain'),
  levels: document.getElementById('panelLevels'),
  controls: document.getElementById('panelControls'),
};

function showPanel(name) {
  for (const [key, el] of Object.entries(panels)) el.classList.toggle('active', key === name);
}
function syncOverlay() { overlay.classList.toggle('hidden', state.status !== 'menu'); }

function onClick(id, handler) {
  document.getElementById(id).addEventListener('click', (ev) => { ev.currentTarget.blur(); handler(); });
}

function startLevel(level) {
  resetGame(level);
  syncOverlay();
}

// кнопки выбора уровня строятся из списка уровней
const levelList = document.getElementById('levelList');
LEVELS.forEach((level, i) => {
  const btn = document.createElement('button');
  btn.className = 'level';
  btn.append(`${i + 1}. ${level.name}`);
  const blurb = document.createElement('small');
  blurb.textContent = level.blurb;
  btn.append(blurb);
  btn.addEventListener('click', (ev) => { ev.currentTarget.blur(); startLevel(level); });
  levelList.append(btn);
});

onClick('restart', () => { if (state.status !== 'menu') resetGame(state.level); });
// возврат в меню посреди партии: пока меню открыто, игра стоит на паузе
onClick('menuBtn', () => {
  state.menu.open = false; state.menu.drag = null;
  mouseDown = false;
  state.status = 'menu';
  showPanel('main');
  syncOverlay();
});
onClick('startBtn', () => showPanel('levels'));
onClick('levelsBackBtn', () => showPanel('main'));
onClick('controlsBtn', () => showPanel('controls'));
onClick('backBtn', () => showPanel('main'));

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
