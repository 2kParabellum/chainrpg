// Флаги уровня «Capture the Flags»: площадки на полу (кнопки мира с flag: true). Флаг поднят, пока на площадке лежит
// союзник — брошенный (X) или выбитый: он часовой. Цепочка, проезжающая по площадке, флаг не поднимает. Часового убили,
// утащил Скорпион, сбили с площадки — флаг падает («флаг потерян»); подобрал сам Герой — опускается тихо. Подняты все
// разом — условие победы (game/update.js). Площадки — у мира, кто их держит и насколько поднят флаг — в state.flags.
(function (G) {
'use strict';

const { CONFIG, COLORS, state } = G;
const { circleRectOverlap } = G.collision;

// союзник лежит на площадке флага: тело задевает её квадрат, как у кнопки
function lies(u, f) { return state.downed.includes(u) && circleRectOverlap(u.x, u.y, u.r, f.btn); }

// сколько флагов сейчас поднято (у скольких есть часовой)
function flagsHeld() { return state.flags.filter((f) => f.guard).length; }

// подняты все флаги уровня
function allFlagsHeld() { return state.flags.length > 0 && state.flags.every((f) => f.guard); }

function updateFlags(dt) {
  const cfg = CONFIG.FLAGS;
  for (const f of state.flags) {
    const was = f.guard;
    // держит тот же часовой, пока лежит на площадке; иначе — первый лежачий на ней
    f.guard = was && lies(was, f) ? was : state.downed.find((u) => lies(u, f)) || null;
    f.btn.pressed = !!f.guard;
    if (f.guard && f.guard === was && f.guard.hp < f.guardHp) f.hitAt = state.time;
    f.guardHp = f.guard ? f.guard.hp : 0;
    f.raise = f.guard ? Math.min(1, f.raise + dt / cfg.raiseTime) : Math.max(0, f.raise - dt / cfg.dropTime);
    if (!f.guard === !was) continue;
    const x = f.btn.x + f.btn.w / 2, y = f.btn.y + f.btn.h / 2;
    state.effects.push({ type: 'ring', x, y, r: f.btn.w * 0.8, life: 0.5, color: f.guard ? COLORS.flag : COLORS.enemyShot });
    // часового подобрал сам Герой или уровень уже пройден — без плашки
    if ((!f.guard && state.party.includes(was)) || state.cleared) continue;
    state.flagNews = { up: !!f.guard, count: flagsHeld(), at: state.time };
  }
}

G.flags = { updateFlags, flagsHeld, allFlagsHeld };
})(window.Game = window.Game || {});
