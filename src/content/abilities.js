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
(function (G) {
'use strict';

const { COLORS } = G;

// Стрелок: дальняя атака вместо ближней, стреляет только по освещённым
const shooter = {
  name: 'стрелок',
  color: COLORS.shooter,
  weapons: { bow: {} },
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

G.abilities = { shooter, medic };
})(window.Game = window.Game || {});
