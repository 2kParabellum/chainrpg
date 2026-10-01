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
const { tryRecruit, dropLastAlly } = G.chain;
const { update } = G.update;
const { canvas } = G.shapes;
const { drawScene, drawPadsInDark, drawCannonShots } = G.renderer;
const { drawLight, drawHud } = G.hud;

// уровни в порядке их показа в меню; за фоном меню при запуске стоит первый
const LEVELS = [G.level2, G.level3];
const START_LEVEL = LEVELS[0];

// --- ввод: намерения игрока ---

let mouseDown = false;

// координаты канваса -> координаты мира
function toWorld(p) { return { x: p.x + state.camera.x, y: p.y + state.camera.y }; }

initInput(canvas, {
  onPointerDown(p) {
    mouseDown = true;
    state.moveTarget = toWorld(p);
  },
  onPointerMove(p) {
    if (mouseDown) state.moveTarget = toWorld(p);
  },
  onPointerUp() {
    mouseDown = false;
  },
  onCommand(name) {
    if (state.status === 'menu') return;
    if (name === 'restart') resetGame(state.level);
    else if (name === 'recruit') { tryRecruit(); state.padRequest = true; }
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
  drawPadsInDark();
  drawCannonShots();
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
