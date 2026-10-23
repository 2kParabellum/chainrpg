// Флаги уровней «Capture the Flags» и «Seal the Gates»: площадки на полу (кнопки мира с flag: true). Флаг горит, пока на
// площадке кто-то из своих: лежит союзник — брошенный (X) или выбитый, он часовой и держит флаг, пока лежит, — или по ней
// едет цепочка (любое звено, и Герой): съехала — флаг гаснет, если часового нет. Часового убили, утащил Скорпион, сбили с
// площадки — «флаг потерян»; подобрал сам Герой — без плашки. Горят все разом — условие победы (game/update.js).
// «Seal the Gates» (у уровня есть seals): флаг держит только часовой, и он закрывает ближайшее гнездо — часовой пролежал
// seals.time секунд, гнездо закрыто (флаг поднимается вместе с заслонкой); часового не стало — гнездо сразу открыто.
// Закрыты все гнёзда — условие победы. Площадки — у мира, кто их держит и насколько поднят флаг — в state.flags, заслонка
// гнезда — в самом гнезде (state.nests).
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

// «Seal the Gates»: сколько гнёзд закрыто и закрыты ли все
function gatesSealed() { return state.nests.filter((n) => n.sealed).length; }
function allGatesSealed() { return state.nests.length > 0 && state.nests.every((n) => n.sealed); }

// заслонка гнезда флага f: пока лежит часовой, закрывается за seals.time секунд; часового нет — закрытое гнездо сразу
// открыто, а заслонка быстро отходит (FLAGS.unsealTime). Флаг поднят ровно настолько, насколько закрыта заслонка.
// Плашки — гнездо закрылось или открылось снова (после победы — нет)
function updateSeal(f, dt, seals) {
  const n = f.nest, c = { x: n.x, y: n.y };
  n.guarded = !!f.guard;
  n.seal = f.guard ? Math.min(1, n.seal + dt / seals.time) : Math.max(0, n.seal - dt / CONFIG.FLAGS.unsealTime);
  f.raise = n.seal;
  if (f.guard && n.seal >= 1 && !n.sealed) {
    n.sealed = true;
    state.effects.push({ type: 'ring', ...c, r: 110, life: 0.6, color: COLORS.flag });
    if (!state.cleared) state.flagNews = { kind: 'sealed', count: gatesSealed(), at: state.time };
  } else if (!f.guard && n.sealed) {
    n.sealed = false;
    n.openedAt = state.time;
    state.effects.push({ type: 'ring', ...c, r: 110, life: 0.6, color: COLORS.nest });
    if (!state.cleared) state.flagNews = { kind: 'open', count: gatesSealed(), at: state.time };
  }
}

function updateFlags(dt) {
  const cfg = CONFIG.FLAGS, seals = state.level.seals;
  for (const f of state.flags) {
    const was = f.guard, wasHeld = f.held;
    // держит тот же часовой, пока лежит на площадке; иначе — первый лежачий на ней
    f.guard = was && lies(was, f) ? was : state.downed.find((u) => lies(u, f)) || null;
    // в «Seal the Gates» проезд цепочки флаг не зажигает — гнездо закрывает только часовой
    f.held = !!f.guard || (!seals && state.party.some((u) => onPlate(u, f)));
    // нажата, как кнопка, только лежачим: стоя на площадке без часового, Герой видит подсказку «оставь дружочка»
    f.btn.pressed = !!f.guard;
    if (f.guard && f.guard === was && f.guard.hp < f.guardHp) f.hitAt = state.time;
    f.guardHp = f.guard ? f.guard.hp : 0;
    if (seals && f.nest) updateSeal(f, dt, seals);
    else f.raise = f.held ? Math.min(1, f.raise + dt / cfg.raiseTime) : Math.max(0, f.raise - dt / cfg.dropTime);
    if (f.held !== wasHeld) {
      state.effects.push({ type: 'ring', x: f.btn.x + f.btn.w / 2, y: f.btn.y + f.btn.h / 2, r: f.btn.w * 0.8, life: 0.5,
                           color: f.held ? COLORS.flag : COLORS.enemyShot });
    }
    // плашка — только про часовых: лёг — «флаг поднят»; пропал, а флаг погас — «флаг потерян» (если часового подобрал
    // сам Герой — без плашки). Цепочка, проехавшая по площадке, плашек не зовёт; после победы их нет. В «Seal the Gates»
    // плашки — про гнёзда (updateSeal)
    if (seals || !f.guard === !was || state.cleared) continue;
    if (f.guard) state.flagNews = { kind: 'up', count: flagsHeld(), at: state.time };
    else if (!f.held && !state.party.includes(was)) state.flagNews = { kind: 'lost', count: flagsHeld(), at: state.time };
  }
}

G.flags = { updateFlags, flagsHeld, allFlagsHeld, gatesSealed, allGatesSealed };
})(window.Game = window.Game || {});
