// Точка входа: связывает ввод, экраны и игровой цикл.
// Устройство кода и правила зависимостей — в architecture.md.
//
// Экран определяет state.status (menu | play | dead | win) — это единственный источник правды.
// Оверлей главного меню в HTML только отражает его и сам ничего не решает: при menu — меню, при win —
// экран «уровень пройден» с переходом к следующему уровню (после последнего — «вы прошли игру»).
(function (G) {
'use strict';

const { state } = G;
const { initInput, moveAxes } = G.input;
const { resetGame } = G.session;
const { tryRecruit, dropLastAlly } = G.chain;
const { update } = G.update;
const { canvas } = G.shapes;
const { drawScene, drawCannonShots } = G.renderer;
const { drawHud } = G.hud;

// уровни в порядке их показа в меню; за фоном меню при запуске стоит первый
const LEVELS = [G.level1, G.level2, G.level3, G.level4];
const START_LEVEL = LEVELS[0];

// --- ввод: намерения игрока ---

initInput(canvas, {
  onCommand(name) {
    if (state.status === 'menu') return;
    // на экране «уровень пройден» пробел — играть дальше
    if (state.status === 'win') { if (name === 'recruit') goNext(); return; }
    if (name === 'restart') resetGame(state.level);
    else if (name === 'recruit') tryRecruit();
    else if (name === 'drop') dropLastAlly();
  },
});

// --- экраны: кнопки и оверлей главного меню ---

const overlay = document.getElementById('overlay');
const panels = {
  main: document.getElementById('panelMain'),
  levels: document.getElementById('panelLevels'),
  controls: document.getElementById('panelControls'),
  win: document.getElementById('panelWin'),
};

function showPanel(name) {
  for (const [key, el] of Object.entries(panels)) el.classList.toggle('active', key === name);
}
function syncOverlay() {
  overlay.classList.toggle('hidden', state.status !== 'menu' && state.status !== 'win');
  overlay.classList.toggle('win', state.status === 'win');
}

// следующий уровень после текущего; null — текущий последний
function nextLevel() { return LEVELS[LEVELS.indexOf(state.level) + 1] || null; }

// экран «уровень пройден»: какой пройден и что дальше; после последнего — «вы прошли игру»
function showWin() {
  const i = LEVELS.indexOf(state.level), next = nextLevel();
  document.getElementById('winTitle').textContent = next ? `УРОВЕНЬ ${i + 1} ПРОЙДЕН` : 'ВЫ ПРОШЛИ ИГРУ!';
  document.getElementById('winText').textContent = next
    ? `Дальше — уровень ${i + 2}: ${next.name}`
    : 'Все уровни позади. Спасибо за игру!';
  const btn = document.getElementById('nextBtn');
  btn.style.display = next ? '' : 'none';
  btn.textContent = next ? `Играть дальше (ПРОБЕЛ)` : '';
  showPanel('win');
}

function goNext() {
  const next = nextLevel();
  if (next) startLevel(next);
  else toMenu();
}

function toMenu() {
  state.status = 'menu';
  showPanel('main');
  syncOverlay();
}

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
onClick('menuBtn', toMenu);
onClick('nextBtn', goNext);
onClick('winMenuBtn', toMenu);
onClick('startBtn', () => showPanel('levels'));
onClick('levelsBackBtn', () => showPanel('main'));
onClick('controlsBtn', () => showPanel('controls'));
onClick('backBtn', () => showPanel('main'));

// --- цикл ---

function draw() {
  drawScene();
  drawCannonShots();
  drawHud();
}

let lastTime = performance.now();
let lastStatus = null;
function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  state.moveInput = moveAxes();
  update(dt);
  // партия только что выиграна (цепочка ушла в портал) — экран «уровень пройден»
  if (state.status === 'win' && lastStatus !== 'win') showWin();
  lastStatus = state.status;
  syncOverlay();
  draw();
  requestAnimationFrame(loop);
}

resetGame(START_LEVEL);
state.status = 'menu';
syncOverlay();
requestAnimationFrame(loop);
})(window.Game = window.Game || {});
