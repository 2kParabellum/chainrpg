// Точка входа: связывает ввод, экраны и игровой цикл.
// Устройство кода и правила зависимостей — в architecture.md.
//
// Экран определяет state.status (menu | play | dead | win) — это единственный источник правды.
// Оверлей главного меню в HTML только отражает его и сам ничего не решает: при menu — меню, при win —
// экран «уровень пройден» с тремя карточками улучшений и переходом к следующему уровню (после последнего —
// «вы прошли игру»). Прохождение — это цепочка уровней подряд через этот экран; уровень, выбранный из меню,
// начинает новое прохождение: с первого — без улучшений, с N-го — сперва N−1 раз выбор карточки (как будто
// предыдущие уровни пройдены), потом сам уровень.
(function (G) {
'use strict';

const { state } = G;
const { initInput, moveAxes } = G.input;
const { resetGame, startRun } = G.session;
const { shuffled } = G.math;
const { drawCard, whoOf } = G.cards;
const { tryRecruit, dropLastAlly } = G.chain;
const { update } = G.update;
const { canvas } = G.shapes;
const { drawScene, drawCannonShots } = G.renderer;
const { drawHud } = G.hud;

// уровни в порядке их показа в меню; за фоном меню при запуске стоит первый
const LEVELS = [G.level1, G.level2, G.level3, G.level4, G.level5];
const START_LEVEL = LEVELS[0];

// --- ввод: намерения игрока ---

initInput(canvas, {
  onCommand(name) {
    // на экране карточек (уровень пройден или выбор перед стартом): 1/2/3 — выбрать карточку, пробел — дальше
    if (state.status === 'win' || (state.status === 'menu' && afterPick)) {
      if (name === 'recruit') goNext();
      else if (name.startsWith('pick')) pickCard(Number(name.slice(4)) - 1);
      return;
    }
    if (state.status === 'menu' || name.startsWith('pick')) return;
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

// --- карточки улучшений ---
const UPGRADE_OFFERS = 3;
const cardsEl = document.getElementById('cards');
let offers = [];   // ключи улучшений на карточках
let picked = null; // выбранное; без выбора дальше не пускает
// что делать после выбора: на экране «уровень пройден» — следующий уровень; перед стартом не с первого уровня —
// следующая карточка или сам уровень. null — дальше идти некуда (игра пройдена)
let afterPick = null;

// три случайных улучшения из тех, что ещё не взяты в этом прохождении
function rollOffers() {
  return shuffled(Object.keys(G.upgrades).filter((k) => !state.upgrades.includes(k))).slice(0, UPGRADE_OFFERS);
}

function renderCards() {
  cardsEl.replaceChildren();
  offers.forEach((key, i) => {
    const def = G.upgrades[key], who = whoOf(key);
    const card = document.createElement('div');
    card.className = 'card' + (picked === key ? ' selected' : '');
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = i + 1;
    const whoEl = document.createElement('span');
    whoEl.className = 'who';
    whoEl.style.color = who.color;
    whoEl.textContent = who.label;
    const canvasEl = document.createElement('canvas');
    drawCard(canvasEl, key);
    const title = document.createElement('h3');
    title.textContent = def.name;
    const desc = document.createElement('p');
    desc.className = 'desc';
    desc.textContent = def.desc;
    card.append(num, whoEl, canvasEl, title, desc);
    card.addEventListener('click', () => pickCard(i));
    cardsEl.append(card);
  });
  document.getElementById('nextBtn').disabled = offers.length > 0 && !picked;
}

function pickCard(i) {
  if (!offers[i]) return;
  picked = offers[i];
  renderCards();
}

// экран «уровень пройден»: какой пройден, карточки улучшений и что дальше; после последнего — «вы прошли игру»
function showWin() {
  const i = LEVELS.indexOf(state.level), next = nextLevel();
  document.getElementById('winTitle').textContent = next ? `УРОВЕНЬ ${i + 1} ПРОЙДЕН` : 'ВЫ ПРОШЛИ ИГРУ!';
  document.getElementById('winText').textContent = next
    ? `Дальше — уровень ${i + 2}: ${next.name}`
    : 'Все уровни позади. Спасибо за игру!';
  const btn = document.getElementById('nextBtn');
  btn.style.display = next ? '' : 'none';
  btn.textContent = next ? 'Играть дальше (ПРОБЕЛ)' : '';
  offers = next ? rollOffers() : [];
  picked = null;
  afterPick = next ? () => startLevel(next) : null;
  renderCards();
  showPanel('win');
}

// старт не с первого уровня (для проверки уровней): перед ним picksLeft раз выбор карточки из total,
// как будто предыдущие уровни пройдены; потом сам уровень
function prepareLevel(level, picksLeft, total) {
  if (picksLeft <= 0) { startLevel(level); return; }
  const n = total - picksLeft + 1;
  document.getElementById('winTitle').textContent = `ПЕРЕД УРОВНЕМ ${LEVELS.indexOf(level) + 1}`;
  document.getElementById('winText').textContent = `Улучшение ${n} из ${total} — за пропущенные уровни`;
  const btn = document.getElementById('nextBtn');
  btn.style.display = '';
  btn.textContent = picksLeft > 1 ? 'Дальше (ПРОБЕЛ)' : 'Начать (ПРОБЕЛ)';
  offers = rollOffers();
  picked = null;
  afterPick = () => prepareLevel(level, picksLeft - 1, total);
  renderCards();
  showPanel('win');
}

// дальше после экрана карточек: выбранное улучшение остаётся с игроком до конца прохождения
function goNext() {
  if (!afterPick) { toMenu(); return; }
  if (offers.length && !picked) return; // карточку выбрать обязательно
  if (picked) state.upgrades.push(picked);
  offers = []; picked = null;
  const then = afterPick;
  afterPick = null;
  then();
}

function toMenu() {
  afterPick = null;
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
  // уровень из меню — новое прохождение; с N-го уровня сперва N−1 карточка улучшений
  btn.addEventListener('click', (ev) => { ev.currentTarget.blur(); startRun(); prepareLevel(level, i, i); });
  levelList.append(btn);
});

onClick('restart', () => { if (state.status !== 'menu') resetGame(state.level); });
// возврат в меню посреди партии: пока меню открыто, игра стоит на паузе
onClick('menuBtn', toMenu);
onClick('nextBtn', goNext);
onClick('winMenuBtn', toMenu);
// «Играть» — новое прохождение с первого уровня; «Выбор уровня» — список уровней
onClick('startBtn', () => { startRun(); startLevel(LEVELS[0]); });
onClick('levelsBtn', () => showPanel('levels'));
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
