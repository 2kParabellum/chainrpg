// Панель «Управление» главного меню: вкладки «Компьютер» и «Телефон» (открывается та, на чём играют).
// Компьютер — таблица действий, у каждого два места под клавишу или кнопку мыши: щелчок по месту — ждёт клавишу
// (core/input.js captureBinding), «Сбросить» — назначения по умолчанию. Телефон — кнопки и джойстик, режим джойстика,
// сторона, «Автоход» и расстановка кнопок (core/touch.js editLayout). Знает только про core/ — про игру ничего.
//
// open() — перед показом панели: выбрать вкладку, обновить таблицу и выбор; close() — при уходе с панели.
(function (G) {
'use strict';

const input = G.input;
const touchUI = G.touch;
const { isTouch } = G.screen;

// строки таблицы клавиш: действие и что оно делает
const ROWS = [
  ['forward', 'Drive forward — the Hero can’t reverse, let go to brake'],
  ['back', 'Brake'],
  ['left', 'Turn left'],
  ['right', 'Turn right'],
  ['cursor', 'Hold — drive toward the mouse cursor'],
  ['recruit', 'Recruit a mate or pick up a knocked-out one'],
  ['drop', 'Drop the last mate (on a button it stays and holds it down)'],
  ['pack', 'Backpack (with its upgrade): open / use the boost'],
  ['restart', 'Restart the level'],
  ['pause', 'Pause'],
];

const MODE_HINTS = {
  aim: 'Steer: the Hero turns toward where you drag and drives that way. No reverse — drag back and the Hero turns around in an arc.',
  tank: 'Tank: up — throttle, left / right — turn (like W / A / D). The Hero can’t reverse.',
};
const CRUISE_HINT = ' Auto-drive: let go of the joystick and the Hero keeps going; tap without dragging to stop.';

const tabButtons = document.querySelectorAll('.tabs button');
const tabs = { pc: document.getElementById('ctlPc'), mobile: document.getElementById('ctlMobile') };
const table = document.getElementById('bindTable');
const optButtons = document.querySelectorAll('#ctlMobile .opts button');

function showTab(name) {
  for (const b of tabButtons) b.classList.toggle('sel', b.dataset.tab === name);
  for (const [key, el] of Object.entries(tabs)) el.classList.toggle('active', key === name);
  // кнопки внизу — только своей вкладки («Сбросить» / «Расставить кнопки»)
  for (const el of document.querySelectorAll('#panelControls [data-for]')) el.style.display = el.dataset.for === name ? '' : 'none';
  input.cancelCapture();
}

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
  renderBinds();
});

// --- телефон ---
function syncOpts() {
  const { mode, mirror, cruise } = touchUI.getSettings();
  for (const b of optButtons) {
    const d = b.dataset;
    b.classList.toggle('sel', d.mode ? d.mode === mode : d.mirror ? (d.mirror === '1') === mirror : (d.cruise === '1') === cruise);
  }
  document.getElementById('modeHint').textContent = MODE_HINTS[mode] + (cruise ? CRUISE_HINT : '');
}
for (const b of optButtons) {
  b.addEventListener('click', () => {
    const d = b.dataset;
    if (d.mode) touchUI.setSetting('mode', d.mode);
    else if (d.mirror) touchUI.setSetting('mirror', d.mirror === '1');
    else touchUI.setSetting('cruise', d.cruise === '1');
    syncOpts();
  });
}
document.getElementById('layoutBtn').addEventListener('click', (ev) => {
  ev.currentTarget.blur();
  touchUI.editLayout(() => {});
});

for (const b of tabButtons) b.addEventListener('click', () => { b.blur(); showTab(b.dataset.tab); });

function open() {
  waiting = null;
  renderBinds();
  syncOpts();
  showTab(isTouch() ? 'mobile' : 'pc');
}
function close() { input.cancelCapture(); }

G.controlsPanel = { open, close };
})(window.Game = window.Game || {});
