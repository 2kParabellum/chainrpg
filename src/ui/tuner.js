// Панель настройки цепочки (тестовый уровень с флагом tuner): ползунки параметров движения Героя и цепочки
// из CONFIG поверх верхней части экрана. Ползунок меняет значение в CONFIG сразу — игра читает его каждый кадр.
// Значения по умолчанию запоминаются при загрузке; подвинутые сохраняются в браузере и возвращаются при следующем
// заходе на уровень, а на любом другом уровне в CONFIG снова значения по умолчанию. Знает только про config/.
//
// sync(active, visible) — каждый кадр: active — идёт уровень с панелью (подставить свои значения, иначе вернуть
// по умолчанию), visible — показывать ли панель.
(function (G) {
'use strict';

const { CONFIG } = G;

// группа, путь в CONFIG, подпись, мин, макс, шаг; без пределов — галочка (true / false)
const PARAMS = [
  ['Hero', 'LEADER.speed', 'speed', 60, 400, 5],
  ['Hero', 'LEADER.accel', 'accel', 100, 2000, 10],
  ['Hero', 'LEADER.brake', 'brake', 50, 2000, 10],
  ['Hero', 'LEADER.turnSpeed', 'turn', 0.5, 8, 0.1],
  ['Hero', 'LEADER.wallFriction', 'wall slide', 0.5, 1, 0.01],
  ['Weight', 'CHAIN.heft.freeLinks', 'free links', 0, 20, 1],
  ['Weight', 'CHAIN.heft.linkMass', 'link mass', 0, 1, 0.01],
  ['Weight', 'CHAIN.heft.brakeLinkMass', 'brake mass', 0, 1, 0.01],
  ['Weight', 'CHAIN.heft.minSpeed', 'min speed', 0.2, 1, 0.01],
  ['Weight', 'CHAIN.heft.fade', 'speed fade', 1, 30, 0.5],
  ['Chain', 'CHAIN.spacing', 'spacing', 16, 80, 1],
  ['Chain', 'CHAIN.trailStep', 'trail step', 1, 20, 1],
  ['Chain', 'CHAIN.followSpeed', 'follow speed', 50, 600, 10],
  ['Chain', 'CHAIN.catchUpGain', 'catch-up', 1, 20, 0.5],
  ['Whip', 'CHAIN.whip.enabled', 'whip on'],
  ['Whip', 'CHAIN.whip.stiffness', 'stiffness', 10, 400, 5],
  ['Whip', 'CHAIN.whip.tailSoftness', 'tail softness', 0, 1, 0.01],
  ['Whip', 'CHAIN.whip.dampingHead', 'damping head', 0, 2, 0.01],
  ['Whip', 'CHAIN.whip.dampingTail', 'damping tail', 0, 2, 0.01],
  ['Whip', 'CHAIN.whip.maxSpeed', 'max speed', 100, 1500, 10],
  ['Whip', 'CHAIN.whip.maxLag', 'max lag', 20, 300, 5],
].map(([group, path, label, min, max, step]) => ({ group, path, label, min, max, step, toggle: min === undefined }));

const STORE_KEY = 'chain.tuner.v1';
const panel = document.getElementById('tuner');

function owner(path) {
  const keys = path.split('.');
  const last = keys.pop();
  return [keys.reduce((o, k) => o[k], CONFIG), last];
}
function get(path) { const [o, k] = owner(path); return o[k]; }
function set(path, v) { const [o, k] = owner(path); o[k] = v; }

const defaults = Object.fromEntries(PARAMS.map((p) => [p.path, get(p.path)]));

// хранилище браузера может быть недоступно (приватное окно) — тогда просто без сохранения
function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
}
function save(obj) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(obj)); } catch (e) { /* без сохранения */ }
}
let saved = load();
let collapsed = !!saved.__collapsed;

function fmt(p, v) {
  if (p.toggle) return v ? 'on' : 'off';
  const digits = p.step < 0.1 ? 2 : p.step < 1 ? 1 : 0;
  return v.toFixed(digits);
}

// --- разметка ---

const head = document.createElement('div');
head.className = 'tnHead';
const title = document.createElement('b');
title.textContent = 'CHAIN TUNING';
const toggleBtn = document.createElement('button');
const resetBtn = document.createElement('button');
resetBtn.textContent = 'Reset';
const copyBtn = document.createElement('button');
copyBtn.textContent = 'Copy';
head.append(title, toggleBtn, resetBtn, copyBtn);
const grid = document.createElement('div');
grid.className = 'tnGrid';
panel.append(head, grid);

const rows = PARAMS.map((p) => {
  const row = document.createElement('label');
  row.className = 'tnRow tn' + p.group;
  row.title = `${p.path} (default ${fmt(p, defaults[p.path])}) — click the value to reset`;
  const name = document.createElement('span');
  name.className = 'tnName';
  name.textContent = p.label;
  const val = document.createElement('span');
  val.className = 'tnVal';
  const input = document.createElement('input');
  if (p.toggle) input.type = 'checkbox';
  else Object.assign(input, { type: 'range', min: p.min, max: p.max, step: p.step });
  input.addEventListener('input', () => change(p, p.toggle ? input.checked : Number(input.value)));
  // отпустил ползунок — фокус обратно игре, чтобы клавиши не крутили его дальше
  input.addEventListener('change', () => input.blur());
  val.addEventListener('click', (ev) => { ev.preventDefault(); change(p, defaults[p.path]); });
  row.append(name, val, input);
  grid.append(row);
  return { p, row, val, input };
});

function show(r) {
  const v = get(r.p.path);
  if (r.p.toggle) r.input.checked = v; else r.input.value = v;
  r.val.textContent = fmt(r.p, v);
  r.row.classList.toggle('changed', v !== defaults[r.p.path]);
}

function change(p, v) {
  set(p.path, v);
  if (v === defaults[p.path]) delete saved[p.path]; else saved[p.path] = v;
  save(saved);
  show(rows.find((r) => r.p === p));
}

function syncCollapsed() {
  panel.classList.toggle('collapsed', collapsed);
  toggleBtn.textContent = collapsed ? 'Show' : 'Hide';
}

toggleBtn.addEventListener('click', () => {
  collapsed = !collapsed;
  saved.__collapsed = collapsed;
  save(saved);
  syncCollapsed();
  toggleBtn.blur();
});
resetBtn.addEventListener('click', () => {
  for (const p of PARAMS) change(p, defaults[p.path]);
  resetBtn.blur();
});
// подвинутые значения текстом — чтобы переслать или перенести в config/tuning.js
copyBtn.addEventListener('click', () => {
  copyBtn.blur();
  const lines = PARAMS.filter((p) => get(p.path) !== defaults[p.path])
    .map((p) => `${p.path}: ${defaults[p.path]} -> ${get(p.path)}`);
  const text = lines.length ? lines.join('\n') : 'all defaults';
  const done = () => { copyBtn.textContent = 'Copied!'; setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1200); };
  const fallback = () => window.prompt('Changed parameters:', text.replace(/\n/g, '; '));
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, fallback);
  else fallback();
});
// касания и щелчки по панели не доходят до игры под ней
for (const t of ['pointerdown', 'mousedown', 'touchstart', 'contextmenu']) panel.addEventListener(t, (ev) => ev.stopPropagation());

syncCollapsed();

// --- включение ---

let active = false;
function sync(on, visible) {
  if (on !== active) {
    active = on;
    for (const p of PARAMS) set(p.path, on && p.path in saved ? saved[p.path] : defaults[p.path]);
    rows.forEach(show);
  }
  panel.classList.toggle('on', on && visible);
}

G.tuner = { sync };
})(window.Game = window.Game || {});
