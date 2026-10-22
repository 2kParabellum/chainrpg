// Флаги уровня «Capture the Flags»: площадки на полу (кнопки мира с flag: true). Флаг горит, пока на площадке кто-то из
// своих: лежит союзник — брошенный (X) или выбитый, он часовой и держит флаг, пока лежит, — или по ней едет цепочка
// (любое звено, и Герой): съехала — флаг гаснет, если часового нет. Часового убили, утащил Скорпион, сбили с площадки —
// «флаг потерян»; подобрал сам Герой — без плашки. Горят все разом — условие победы (game/update.js). Площадки — у мира,
// кто их держит и насколько поднят флаг — в state.flags.
(function (G) {
'use strict';

const { CONFIG, COLORS, state } = G;
const { circleRectOverlap } = G.collision;

// тело союзника задевает квадрат площадки, как у кнопки
function onPlate(u, f) { return !u.absorbed && circleRectOverlap(u.x, u.y, u.r, f.btn); }

// союзник лежит на площадке флага
function lies(u, f) { return state.downed.includes(u) && onPlate(u, f); }

// сколько флагов сейчас горит
function flagsHeld() { return state.flags.filter((f) => f.held).length; }

// горят все флаги уровня
function allFlagsHeld() { return state.flags.length > 0 && state.flags.every((f) => f.held); }

function updateFlags(dt) {
  const cfg = CONFIG.FLAGS;
  for (const f of state.flags) {
    const was = f.guard, wasHeld = f.held;
    // держит тот же часовой, пока лежит на площадке; иначе — первый лежачий на ней
    f.guard = was && lies(was, f) ? was : state.downed.find((u) => lies(u, f)) || null;
    f.held = !!f.guard || state.party.some((u) => onPlate(u, f));
    // нажата, как кнопка, только лежачим: стоя на площадке без часового, Герой видит подсказку «оставь дружочка»
    f.btn.pressed = !!f.guard;
    if (f.guard && f.guard === was && f.guard.hp < f.guardHp) f.hitAt = state.time;
    f.guardHp = f.guard ? f.guard.hp : 0;
    f.raise = f.held ? Math.min(1, f.raise + dt / cfg.raiseTime) : Math.max(0, f.raise - dt / cfg.dropTime);
    if (f.held !== wasHeld) {
      state.effects.push({ type: 'ring', x: f.btn.x + f.btn.w / 2, y: f.btn.y + f.btn.h / 2, r: f.btn.w * 0.8, life: 0.5,
                           color: f.held ? COLORS.flag : COLORS.enemyShot });
    }
    // плашка — только про часовых: лёг — «флаг поднят»; пропал, а флаг погас — «флаг потерян» (если часового подобрал
    // сам Герой — без плашки). Цепочка, проехавшая по площадке, плашек не зовёт; после победы их нет
    if (!f.guard === !was || state.cleared) continue;
    if (f.guard) state.flagNews = { up: true, count: flagsHeld(), at: state.time };
    else if (!f.held && !state.party.includes(was)) state.flagNews = { up: false, count: flagsHeld(), at: state.time };
  }
}

G.flags = { updateFlags, flagsHeld, allFlagsHeld };
})(window.Game = window.Game || {});
