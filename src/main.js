// Точка входа: связывает ввод, экраны и игровой цикл.
// Устройство кода и правила зависимостей — в architecture.md.
//
// Экран определяет state.status (menu | play | pause | dead | win) — это единственный источник правды.
// Оверлей главного меню в HTML только отражает его и сам ничего не решает: при menu — меню, при win —
// экран «уровень пройден» с тремя карточками улучшений и переходом к следующему уровню (после последнего —
// «вы прошли игру»). Прохождение — это цепочка уровней подряд через этот экран; уровень, выбранный из меню,
// начинает новое прохождение: с первого — без улучшений, с N-го — сперва N−1 раз выбор карточки (как будто
// предыдущие уровни пройдены), потом сам уровень. Пауза (ESC, кнопка паузы, свернули вкладку, телефон повернули
// вертикально) — тот же оверлей с панелью «Продолжить / Заново / Управление / В меню»; пока пауза, игра стоит.
(function (G) {
'use strict';

const { CONFIG, state } = G;
const { initInput, moveAxes, keyLabel, withKeys } = G.input;
const { resetGame, startRun } = G.session;
const { shuffled, pickWeighted, removeFrom } = G.math;
const { drawCard, whoOf } = G.cards;
const { tryRecruit, dropLastAlly, nearestPickup, usePack } = G.chain;
const { buttonUnder } = G.world;
const { leader, upgrade } = G.session;
const touchUI = G.touch;
const controlsPanel = G.controlsPanel;
const tuner = G.tuner;
const { update } = G.update;
const { canvas } = G.shapes;
const { drawScene, drawCannonShots } = G.renderer;
const { drawHud } = G.hud;
const screenInfo = G.screen;

// уровни в порядке их показа в меню; за фоном меню при запуске стоит первый
const LEVELS = [G.level1, G.level2, G.level6, G.level3, G.level8, G.level7, G.level4, G.level5, G.level9, G.level10];
const START_LEVEL = LEVELS[0];
// тестовые уровни: только из меню выбора уровней, в прохождение не входят; стартуют с улучшениями level.upgrades
const TEST_LEVELS = [G.levelTestRam, G.levelTestChain, G.levelTestRace];

// --- ввод: намерения игрока ---

initInput(canvas, {
  onCommand(name) {
    // на экране карточек (уровень пройден или выбор перед стартом): 1/2/3 — выбрать карточку, пробел — дальше
    if (state.status === 'win' || (state.status === 'menu' && afterPick)) {
      if (name === 'recruit') goNext();
      else if (name.startsWith('pick')) pickCard(Number(name.slice(4)) - 1);
      return;
    }
    // ESC (пауза) на панели «Управление» — назад, туда, откуда её открыли
    if (name === 'pause' && controlsFrom) { closeControls(); return; }
    if (name === 'pause') { if (state.status === 'pause') resume(); else pause(); return; }
    if (state.status === 'menu' || state.status === 'pause' || name.startsWith('pick')) return;
    if (name === 'restart') resetGame(state.level);
    else if (name === 'recruit') tryRecruit();
    else if (name === 'drop') dropLastAlly();
    else if (name === 'pack') usePack();
  },
});

// --- экраны: кнопки и оверлей главного меню ---

const overlay = document.getElementById('overlay');
const panels = {
  main: document.getElementById('panelMain'),
  levels: document.getElementById('panelLevels'),
  controls: document.getElementById('panelControls'),
  win: document.getElementById('panelWin'),
  pause: document.getElementById('panelPause'),
  dead: document.getElementById('panelDead'),
};

function showPanel(name) {
  for (const [key, el] of Object.entries(panels)) el.classList.toggle('active', key === name);
}
function syncOverlay() {
  overlay.classList.toggle('hidden', !['menu', 'win', 'pause', 'dead'].includes(state.status));
  overlay.classList.toggle('menu', state.status === 'menu');
  overlay.classList.toggle('win', state.status === 'win');
  overlay.classList.toggle('pause', state.status === 'pause');
  overlay.classList.toggle('dead', state.status === 'dead');
}

// подпись клавиши в скобках на кнопке экрана: « (ПРОБЕЛ)»; на телефоне клавиш нет — без неё
function keyHint(name) { return screenInfo.isTouch() ? '' : ` (${keyLabel(name)})`; }

// рекорд «Endless» — до какой волны дошли; хранится в этом браузере (нет хранилища — рекорд только этой партии).
// Дошли до волны n: прежний рекорд побит — запоминается; возвращает прежний рекорд
const BEST_KEY = 'chainrpg.endlessBest';
function recordWave(n) {
  let best = 0;
  try { best = Number(localStorage.getItem(BEST_KEY)) || 0; } catch (e) { /* без рекорда */ }
  if (n > best) { try { localStorage.setItem(BEST_KEY, String(n)); } catch (e) { /* не запомнится */ } }
  return best;
}

// поражение: Герой выбит или база разрушена — кнопки «Заново» и «В меню» поверх замершей партии;
// в «Endless» — ещё до какой волны дошли и рекорд
function showDead() {
  const lostBase = state.base && state.base.hp <= 0;
  document.getElementById('deadTitle').textContent = lostBase ? 'BASE DESTROYED' : 'DEFEAT';
  const n = state.waveNo, endless = state.level.victory.kind === 'endless', best = endless ? recordWave(n) : 0;
  document.getElementById('deadText').textContent = !endless ? ''
    : `Reached wave ${n}` + (n > best && best > 0 ? ' — new best!' : n > best ? '' : ` · best: wave ${best}`);
  document.getElementById('deadRestartBtn').textContent = 'Restart' + keyHint('restart');
  showPanel('dead');
}

// пауза только посреди партии; после поражения ставить на паузу нечего
function pause() {
  if (state.status !== 'play') return;
  state.status = 'pause';
  showPanel('pause');
  syncOverlay();
}
function resume() {
  if (state.status !== 'pause' || screenInfo.needsRotate()) return;
  state.status = 'play';
  syncOverlay();
}
function restart() {
  if (state.status === 'menu' || state.status === 'win') return;
  resetGame(state.level);
  syncOverlay();
}

// следующий уровень после текущего; null — текущий последний
function nextLevel() { return LEVELS[LEVELS.indexOf(state.level) + 1] || null; }

// --- карточки улучшений ---
const cardsEl = document.getElementById('cards');
let offers = [];   // ключи улучшений на карточках
let picked = null; // выбранное; без выбора дальше не пускает
// что делать после выбора: на экране «уровень пройден» — следующий уровень; перед стартом не с первого уровня —
// следующая карточка или сам уровень. null — дальше идти некуда (игра пройдена)
let afterPick = null;

// улучшение можно предложить: ещё не взято, а 2-й ранг — только если у того же персонажа уже есть 1-й
// (с полем needs — только если взято именно то улучшение)
function offerable(key) {
  const def = G.upgrades[key];
  if (state.upgrades.includes(key)) return false;
  if (def.needs) return state.upgrades.includes(def.needs);
  return def.tier !== 2 || state.upgrades.some((k) => G.upgrades[k].who === def.who && G.upgrades[k].tier !== 2);
}

// случайные улучшения из тех, что можно предложить (см. CONFIG.UPGRADE_CARDS): каждая карточка — сперва класс (who),
// потом улучшение в нём по весу ранга. Класс уже лежащей карточки не берётся, пока есть другие; класс улучшений,
// взятых в последние recentPicks выборов (хвост state.upgrades), весит recentWeight
function rollOffers() {
  const cfg = CONFIG.UPGRADE_CARDS;
  const whoOfKey = (k) => G.upgrades[k].who;
  const recent = state.upgrades.slice(-cfg.recentPicks).map(whoOfKey);
  const pool = Object.keys(G.upgrades).filter(offerable);
  const offers = [];
  while (offers.length < cfg.offers && pool.length) {
    const used = offers.map(whoOfKey);
    const fresh = pool.filter((k) => !used.includes(whoOfKey(k)));
    const from = fresh.length ? fresh : pool;
    const classes = [...new Set(from.map(whoOfKey))];
    const who = pickWeighted(classes, Object.fromEntries(classes.map((c) => [c, recent.includes(c) ? cfg.recentWeight : 1])));
    const inClass = from.filter((k) => whoOfKey(k) === who);
    const key = pickWeighted(inClass, Object.fromEntries(inClass.map((k) => [k, cfg.tierWeight[G.upgrades[k].tier || 1]])));
    offers.push(key);
    removeFrom(pool, key);
  }
  return shuffled(offers);
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
    // ярлыки: чьё улучшение (его цветом) и ранг; текст — отдельным блоком, чтобы на вертикальном экране встать справа
    const tags = document.createElement('div');
    tags.className = 'tags';
    const whoEl = document.createElement('span');
    whoEl.className = 'who';
    whoEl.style.color = who.color;
    whoEl.textContent = who.label;
    tags.append(whoEl);
    if (def.tier === 2) {
      const tier = document.createElement('span');
      tier.className = 'tier';
      tier.textContent = '★ TIER 2';
      tags.append(tier);
    }
    const canvasEl = document.createElement('canvas');
    drawCard(canvasEl, key);
    const title = document.createElement('h3');
    title.textContent = def.name;
    const desc = document.createElement('p');
    desc.className = 'desc';
    desc.textContent = withKeys(def.desc);
    const txt = document.createElement('div');
    txt.className = 'txt';
    txt.append(tags, title, desc);
    card.append(num, canvasEl, txt);
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

// экран «уровень пройден»: какой пройден, карточки улучшений и что дальше; после последнего — «вы прошли игру».
// Тестовый уровень (в прохождение не входит) — свой экран: итоги и «ещё раз»
function showWin() {
  if (!LEVELS.includes(state.level)) { showTestWin(); return; }
  const i = LEVELS.indexOf(state.level), next = nextLevel();
  document.getElementById('winTitle').textContent = next ? `LEVEL ${i + 1} COMPLETE` : 'YOU BEAT THE GAME!';
  document.getElementById('winText').textContent = next
    ? `Next up — level ${i + 2}: ${next.name}`
    : 'All levels done. Thanks for playing!';
  const btn = document.getElementById('nextBtn');
  btn.style.display = next ? '' : 'none';
  btn.textContent = next ? 'Continue' + keyHint('recruit') : '';
  offers = next ? rollOffers() : [];
  picked = null;
  afterPick = next ? () => startLevel(next) : null;
  renderCards();
  showPanel('win');
}

// тестовый уровень пройден: без карточек; итоги гонки («Dead Race»: общее время, по кругам время и дружочки), если она
// была; «Again» — тот же уровень заново
function showTestWin() {
  const level = state.level;
  document.getElementById('winTitle').textContent = `${level.name.toUpperCase()} COMPLETE`;
  document.getElementById('winText').textContent = G.race.raceSummary().join('\n');
  const btn = document.getElementById('nextBtn');
  btn.style.display = '';
  btn.textContent = 'Again' + keyHint('recruit');
  offers = [];
  picked = null;
  afterPick = () => startLevel(level);
  renderCards();
  showPanel('win');
}

// старт не с первого уровня (для проверки уровней): перед ним picksLeft раз выбор карточки из total,
// как будто предыдущие уровни пройдены; потом сам уровень
function prepareLevel(level, picksLeft, total) {
  if (picksLeft <= 0) { startLevel(level); return; }
  const n = total - picksLeft + 1;
  document.getElementById('winTitle').textContent = `BEFORE LEVEL ${LEVELS.indexOf(level) + 1}`;
  document.getElementById('winText').textContent = `Upgrade ${n} of ${total} — for the levels you skipped`;
  const btn = document.getElementById('nextBtn');
  btn.style.display = '';
  btn.textContent = (picksLeft > 1 ? 'Next' : 'Start') + keyHint('recruit');
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
  screenInfo.enterFullscreen();
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
  btn.addEventListener('click', (ev) => {
    ev.currentTarget.blur();
    screenInfo.enterFullscreen();
    startRun();
    prepareLevel(level, i, i);
  });
  levelList.append(btn);
});

const testLevelList = document.getElementById('testLevelList');
for (const level of TEST_LEVELS) {
  const btn = document.createElement('button');
  btn.className = 'level test';
  btn.append(`Test: ${level.name}`);
  const blurb = document.createElement('small');
  blurb.textContent = level.blurb;
  btn.append(blurb);
  btn.addEventListener('click', (ev) => {
    ev.currentTarget.blur();
    startRun();
    state.upgrades.push(...(level.upgrades || []));
    startLevel(level);
  });
  testLevelList.append(btn);
}

onClick('resumeBtn', () => { screenInfo.enterFullscreen(); resume(); });
onClick('pauseRestartBtn', restart);
onClick('pauseMenuBtn', toMenu);
onClick('deadRestartBtn', restart);
onClick('deadMenuBtn', toMenu);
onClick('nextBtn', goNext);
onClick('winMenuBtn', toMenu);
// «Играть» — новое прохождение с первого уровня; «Выбор уровня» — список уровней
onClick('startBtn', () => { startRun(); startLevel(LEVELS[0]); });
onClick('levelsBtn', () => showPanel('levels'));
onClick('levelsBackBtn', () => showPanel('main'));
// «Управление» — из главного меню и из паузы; «Назад» возвращает туда же
let controlsFrom = null; // 'main' | 'pause' — откуда открыта панель «Управление»; null — она закрыта
function openControls(from) {
  controlsFrom = from;
  controlsPanel.open();
  showPanel('controls');
}
function closeControls() {
  controlsPanel.close();
  showPanel(controlsFrom);
  controlsFrom = null;
}
onClick('controlsBtn', () => openControls('main'));
onClick('pauseControlsBtn', () => openControls('pause'));
onClick('backBtn', closeControls);

// свернули вкладку, заблокировали телефон или повернули его вертикально — пауза
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
screenInfo.onChange(() => { if (screenInfo.needsRotate()) pause(); });

// --- цикл ---

// сенсорные кнопки: видны только во время партии; «ВЗЯТЬ» горит, когда рядом есть кого взять,
// «БРОСИТЬ» — когда Герой на кнопке (или площадке флага) и можно оставить на ней дружочка (те же условия, что у подсказок внизу экрана).
// На компьютере во время партии курсор над полем — прицел (мышью Героя ведут к нему)
function syncTouch() {
  const playing = state.status === 'play';
  document.body.classList.toggle('playing', playing);
  touchUI.setVisible(playing);
  // ползунки параметров цепочки — только на уровне с панелью (tuner); на остальных параметры по умолчанию
  tuner.sync(!!state.level.tuner, playing);
  if (!playing) return;
  const btn = buttonUnder(leader());
  touchUI.setGlow('recruit', !state.leaving && nearestPickup());
  touchUI.setGlow('drop', !state.leaving && btn && !btn.pressed && state.party.length > 1);
  // кнопка рюкзака — только с улучшением «Backpack»; горит, пока рюкзак открыт или в нём лежит усиление
  touchUI.setShown('pack', !!upgrade('backpack'));
  touchUI.setGlow('pack', state.backpack.open || state.backpack.stored);
}

function draw() {
  drawScene();
  drawCannonShots();
  drawHud();
}

// кадр рисуется, только когда картинка может измениться: идёт партия, сменился экран или размер холста
// (смена размера стирает холст). В меню, на паузе, после поражения игра стоит — время не идёт, кадр тот же
let drawnStatus = null, drawnTime = -1, resized = true;
screenInfo.onChange(() => { resized = true; });
function needsDraw() {
  return state.status === 'play' || state.status !== drawnStatus || state.time !== drawnTime || resized;
}

let lastTime = performance.now();
let lastStatus = null;
function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  G.debug.frame(now);
  state.moveInput = moveAxes();
  update(dt);
  // партия только что выиграна (цепочка ушла в портал) — экран «уровень пройден»
  if (state.status === 'win' && lastStatus !== 'win') showWin();
  if (state.status === 'dead' && lastStatus !== 'dead') showDead();
  lastStatus = state.status;
  syncOverlay();
  syncTouch();
  if (needsDraw()) {
    draw();
    drawnStatus = state.status; drawnTime = state.time; resized = false;
  }
  requestAnimationFrame(loop);
}

resetGame(START_LEVEL);
state.status = 'menu';
syncOverlay();
requestAnimationFrame(loop);
})(window.Game = window.Game || {});
