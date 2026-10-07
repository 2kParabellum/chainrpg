// Реестр способностей, которые выдают подиумы. Одна запись = одна способность; ключ записи —
// тип подиума. Звено, проехавшее по подиуму, получает его оружие вместо текущего и хранит его,
// пока остаётся в цепочке. Способность одинакова для Героя и дружочка.
//
// Поля записи:
//   name    — название для списка цепочки в интерфейсе
//   color   — цвет подиума и тела дружочка с этой способностью
//   weapons — { имя оружия: {переопределения его характеристик} }, как у base в allies.js
//   mark    — (u, f, ctx): знак на теле; f — направление взгляда
//   icon    — (ctx, x, y, size): значок в центре подиума
//   levels  — прокачка: тот же подиум профессии, взятый ещё раз подряд, поднимает уровень (до levels.length).
//             levels[n-1] — переопределения для уровня n: weapons — { оружие: {характеристики} }, hp — множитель HP
(function (G) {
'use strict';

const { COLORS } = G;

// Стрелок: дальняя атака вместо ближней, бьёт на дальность лука
const shooter = {
  name: 'стрелок',
  color: COLORS.shooter,
  weapons: { bow: {} },
  // прокачка: дальность и скорость стрельбы
  levels: [{}, { weapons: { bow: { range: 425, cooldown: 0.8 } } }, { weapons: { bow: { range: 506, cooldown: 0.64 } } }],
  mark(u, f, ctx) {
    ctx.beginPath();
    ctx.arc(u.x, u.y, u.r * 0.95, f - 1.0, f + 1.0);
    ctx.moveTo(u.x + Math.cos(f - 1.0) * u.r * 0.95, u.y + Math.sin(f - 1.0) * u.r * 0.95);
    ctx.lineTo(u.x + Math.cos(f + 1.0) * u.r * 0.95, u.y + Math.sin(f + 1.0) * u.r * 0.95);
    ctx.stroke();
  },
  icon(ctx, x, y, s) {
    ctx.beginPath();
    ctx.arc(x - s * 0.25, y, s * 0.55, -1.1, 1.1);
    ctx.moveTo(x - s * 0.25 + Math.cos(-1.1) * s * 0.55, y + Math.sin(-1.1) * s * 0.55);
    ctx.lineTo(x - s * 0.25 + Math.cos(1.1) * s * 0.55, y + Math.sin(1.1) * s * 0.55);
    ctx.moveTo(x - s * 0.45, y);
    ctx.lineTo(x + s * 0.6, y);
    ctx.stroke();
  },
};

// Медик: лечит цепочку и не атакует
const medic = {
  name: 'медик',
  color: COLORS.medic,
  weapons: { heal: {} },
  // прокачка: сила лечения, дальность и частота
  levels: [{}, { weapons: { heal: { heal: 14.4, range: 260 } } },
           { weapons: { heal: { heal: 19.2, range: 300, cooldown: 1.6 } } }],
  mark(u, f, ctx) {
    ctx.beginPath();
    ctx.moveTo(u.x - u.r * 0.55, u.y); ctx.lineTo(u.x + u.r * 0.55, u.y);
    ctx.moveTo(u.x, u.y - u.r * 0.55); ctx.lineTo(u.x, u.y + u.r * 0.55);
    ctx.stroke();
  },
  icon(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x - s * 0.5, y); ctx.lineTo(x + s * 0.5, y);
    ctx.moveTo(x, y - s * 0.5); ctx.lineTo(x, y + s * 0.5);
    ctx.stroke();
  },
};

// Копейщик: раз в 2 секунды сильно бьёт в две небольшие зоны по бокам от себя
const spear = {
  name: 'копейщик',
  color: COLORS.spear,
  weapons: { spear: {} },
  // прокачка: HP и урон
  levels: [{}, { hp: 1.3, weapons: { spear: { dmg: 33 } } }, { hp: 1.6, weapons: { spear: { dmg: 42 } } }],
  mark(u, f, ctx) {
    ctx.beginPath();
    ctx.moveTo(u.x - Math.cos(f) * u.r * 0.6, u.y - Math.sin(f) * u.r * 0.6);
    ctx.lineTo(u.x + Math.cos(f) * u.r * 0.9, u.y + Math.sin(f) * u.r * 0.9);
    ctx.stroke();
  },
  icon(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x - s * 0.55, y + s * 0.55);
    ctx.lineTo(x + s * 0.35, y - s * 0.35);
    ctx.moveTo(x + s * 0.6, y - s * 0.6);
    ctx.lineTo(x + s * 0.15, y - s * 0.45);
    ctx.lineTo(x + s * 0.45, y - s * 0.15);
    ctx.closePath();
    ctx.stroke();
  },
};

// Искра: молния средней дальности, которая присасывается к врагу и жжёт его, пока он рядом
const spark = {
  name: 'искра',
  color: COLORS.spark,
  weapons: { spark: {} },
  // прокачка: урон
  levels: [{}, { weapons: { spark: { dps: 41.6 } } }, { weapons: { spark: { dps: 54.6 } } }],
  // ломаная молния вдоль взгляда
  mark(u, f, ctx) {
    const px = Math.cos(f + Math.PI / 2), py = Math.sin(f + Math.PI / 2);
    const at = (t, s) => [u.x + Math.cos(f) * u.r * t + px * u.r * s, u.y + Math.sin(f) * u.r * t + py * u.r * s];
    ctx.beginPath();
    ctx.moveTo(...at(-0.7, 0));
    ctx.lineTo(...at(-0.2, 0.35));
    ctx.lineTo(...at(0.2, -0.35));
    ctx.lineTo(...at(0.75, 0));
    ctx.stroke();
  },
  // шар слева и ломаная молния из него вправо (у усиления «скорость» — замкнутая стрелка-молния)
  icon(ctx, x, y, s) {
    ctx.beginPath();
    ctx.arc(x - s * 0.4, y, s * 0.2, 0, Math.PI * 2);
    ctx.moveTo(x - s * 0.2, y);
    ctx.lineTo(x, y - s * 0.35);
    ctx.lineTo(x + s * 0.2, y + s * 0.35);
    ctx.lineTo(x + s * 0.4, y - s * 0.2);
    ctx.lineTo(x + s * 0.6, y);
    ctx.stroke();
  },
};

// Временные усиления: у звена, коснувшегося подиума, на `duration` секунд
// включается эффект. Ключ записи — тип подиума. Не заменяют способность; у звена не больше
// CONFIG.BUFFS.maxActive усилений разом — лишнее снимает самое давнее (см. giveBuff в game/chain.js).
//   desc  — что даёт, коротко: надпись на экране, когда подиум взят
//   move  — множитель скорости и разворота Героя; rate — множитель скорости атаки (перезарядка идёт быстрее);
//   dmg   — множитель урона; hp — множитель текущего и максимального HP (на время действия)
//   regenRate  — сколько HP в секунду восстанавливает себе звено, пока действует
//   sturdy     — true: звено нельзя выбить из цепочки (таран, гарпун, X), пока действует
//   contactDmg, contactInterval — звено наносит этот урон каждому врагу, который его касается,
//                                 не чаще, чем раз в contactInterval секунд
//   revive     — true: если HP звена падает до 0, оно не погибает, а остаётся с 1 HP
const speed = {
  name: 'скорость',
  desc: 'быстрее ход и атаки',
  color: COLORS.speed,
  duration: 30,
  move: 1.3, rate: 1.25,
  icon(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x + s * 0.15, y - s * 0.6);
    ctx.lineTo(x - s * 0.35, y + s * 0.1);
    ctx.lineTo(x, y + s * 0.1);
    ctx.lineTo(x - s * 0.15, y + s * 0.6);
    ctx.lineTo(x + s * 0.35, y - s * 0.1);
    ctx.lineTo(x, y - s * 0.1);
    ctx.closePath();
    ctx.stroke();
  },
};

const power = {
  name: 'сила',
  desc: 'больше урона и здоровья',
  color: COLORS.power,
  duration: 30,
  dmg: 1.5, hp: 1.3,
  icon(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y - s * 0.6);
    ctx.lineTo(x + s * 0.5, y);
    ctx.lineTo(x + s * 0.2, y);
    ctx.lineTo(x + s * 0.2, y + s * 0.6);
    ctx.lineTo(x - s * 0.2, y + s * 0.6);
    ctx.lineTo(x - s * 0.2, y);
    ctx.lineTo(x - s * 0.5, y);
    ctx.closePath();
    ctx.stroke();
  },
};

// Регенерация: сильно лечит себя, пока действует
const regen = {
  name: 'регенерация',
  desc: 'быстро лечит само себя',
  color: COLORS.regen,
  duration: 15,
  regenRate: 18,
  icon(ctx, x, y, s) {
    ctx.beginPath();
    ctx.arc(x, y, s * 0.55, 0.6, -0.6, true);
    ctx.moveTo(x - s * 0.5, y); ctx.lineTo(x + s * 0.5, y);
    ctx.moveTo(x, y - s * 0.3); ctx.lineTo(x, y + s * 0.3);
    ctx.stroke();
  },
};

// Крепкость: пока действует, звено нельзя выбить из цепочки никаким способом
const sturdy = {
  name: 'крепкость',
  desc: 'звено нельзя выбить из цепочки',
  color: COLORS.sturdy,
  duration: 30,
  sturdy: true,
  icon(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y - s * 0.6);
    ctx.lineTo(x + s * 0.55, y - s * 0.3);
    ctx.lineTo(x + s * 0.55, y + s * 0.25);
    ctx.lineTo(x, y + s * 0.6);
    ctx.lineTo(x - s * 0.55, y + s * 0.25);
    ctx.lineTo(x - s * 0.55, y - s * 0.3);
    ctx.closePath();
    ctx.stroke();
  },
};

// Шипастость: наносит урон каждому врагу, который касается тела
const spiky = {
  name: 'шипастость',
  desc: 'ранит врагов, которые касаются тела',
  color: COLORS.spiky,
  duration: 30,
  contactDmg: 40,
  contactInterval: 0.35,
  icon(ctx, x, y, s) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * s * 0.25, y + Math.sin(a) * s * 0.25);
      ctx.lineTo(x + Math.cos(a) * s * 0.65, y + Math.sin(a) * s * 0.65);
      ctx.stroke();
    }
  },
};

// Воля: пока действует, смертельный урон не убивает звено — оно остаётся с 1 HP
const will = {
  name: 'воля',
  desc: 'смертельный удар оставляет 1 HP',
  color: COLORS.will,
  duration: 20,
  revive: true,
  icon(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y - s * 0.6);
    ctx.quadraticCurveTo(x + s * 0.65, y - s * 0.1, x, y + s * 0.6);
    ctx.quadraticCurveTo(x - s * 0.65, y - s * 0.1, x, y - s * 0.6);
    ctx.stroke();
  },
};

G.abilities = { shooter, medic, spear, spark };
G.buffs = { speed, power, regen, sturdy, spiky, will };
})(window.Game = window.Game || {});
