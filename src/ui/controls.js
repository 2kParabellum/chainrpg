// Панель «Управление» (из главного меню и из паузы): сразу настройки своего устройства — на компьютере клавиши
// и мышь, на телефоне кнопки и джойстик (что показывать, решает CSS по классу touch у body, его ставит core/screen.js).
// Компьютер — таблица действий, у каждого два места под клавишу или кнопку мыши: щелчок по месту — ждёт клавишу
// (core/input.js captureBinding), «Сбросить» — назначения по умолчанию; мышь — «щелчок — едет в точку» или «едет,
// пока держишь». Телефон — сторона джойстика и расстановка кнопок (core/touch.js editLayout). Знает только про core/.
//
// open() — перед показом панели: обновить таблицу и выбор; close() — при уходе с панели.
(function (G) {
'use strict';

const input = G.input;
const touchUI = G.touch;

// строки таблицы клавиш: действие и что оно делает
const ROWS = [
  ['cursor', 'Drive to the cursor'],
  ['forward', 'Drive forward — the Hero can’t reverse, let go to brake'],
  ['back', 'Brake'],
  ['left', 'Turn left'],
  ['right', 'Turn right'],
  ['recruit', 'Recruit a mate or pick up a knocked-out one'],
  ['drop', 'Drop the last mate (on a button it stays and holds it down)'],
  ['pack', 'Backpack (with its upgrade): open / use the boost'],
  ['restart', 'Restart the level'],
  ['pause', 'Pause'],
];

const table = document.getElementById('bindTable');
const optButtons = document.querySelectorAll('#panelControls .opts button');

// --- клавиши ---
let waiting = null; // { name, slot } — это место ждёт клавишу
const keyButtons = []; // { name, slot, btn }

// таблица строится один раз; дальше только обновляются подписи (кнопки не пересоздаются — щелчок не теряется)
for (const [name, text] of ROWS) {
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.textContent = text;
  tr.append(td);
  for (const slot of [0, 1]) {
    const cell = document.createElement('td');
    cell.className = 'k';
    const btn = document.createElement('button');
    btn.addEventListener('click', () => { btn.blur(); startWaiting(name, slot, btn); });
    cell.append(btn);
    tr.append(cell);
    keyButtons.push({ name, slot, btn });
  }
  table.append(tr);
}

function renderBinds() {
  const binds = input.getBindings();
  for (const { name, slot, btn } of keyButtons) {
    const code = binds[name][slot];
    const wait = waiting && waiting.name === name && waiting.slot === slot;
    btn.className = 'key' + (wait ? ' wait' : code ? '' : ' empty');
    btn.textContent = wait ? 'press…' : input.codeLabel(code);
  }
}

function startWaiting(name, slot, btn) {
  input.cancelCapture();
  waiting = { name, slot };
  renderBinds();
  input.captureBinding((code) => {
    waiting = null;
    if (code !== undefined) input.setBinding(name, slot, code);
    renderBinds();
  }, btn);
}

document.getElementById('bindResetBtn').addEventListener('click', (ev) => {
  ev.currentTarget.blur();
  input.cancelCapture();
  input.resetBindings();
  input.setMouseHold(false);
  renderBinds();
  syncOpts();
});

// --- выбор: мышь (компьютер), сторона джойстика (телефон) ---
function syncOpts() {
  const { mirror } = touchUI.getSettings();
  const hold = input.getMouseHold();
  for (const b of optButtons) {
    const d = b.dataset;
    b.classList.toggle('sel', d.hold ? (d.hold === '1') === hold : (d.mirror === '1') === mirror);
  }
}
for (const b of optButtons) {
  b.addEventListener('click', () => {
    b.blur();
    if (b.dataset.hold) input.setMouseHold(b.dataset.hold === '1');
    else touchUI.setSetting('mirror', b.dataset.mirror === '1');
    syncOpts();
  });
}
document.getElementById('layoutBtn').addEventListener('click', (ev) => {
  ev.currentTarget.blur();
  touchUI.editLayout(() => {});
});

function open() {
  waiting = null;
  input.cancelCapture();
  renderBinds();
  syncOpts();
}
function close() { input.cancelCapture(); }

G.controlsPanel = { open, close };
})(window.Game = window.Game || {});
