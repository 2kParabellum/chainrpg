// Реестр типов союзников. Один тип = одна запись: характеристики тела, базовое оружие, знак на теле.
// Союзники не уникальны: дружочков на карте много. Способности выдают подиумы (content/abilities.js),
// а не сам тип. Оружие описано в content/weapons.js.
//
// Поля записи:
//   color    — цвет тела и подписей
//   anchor   — нельзя выбить, утащить и бросить; смерть такого звена — поражение (Герой)
//   stats    — характеристики тела: имя, HP, радиус; юнит получает их как cfg
//   base     — оружие без способности: weapons — { имя оружия: {переопределения его характеристик} }
//   mark     — (u, f, ctx): рисует знак на теле; f — направление взгляда
// Всё, что нужно от игры, оружие получает параметром game и никогда не подключает game/ само.
(function (G) {
'use strict';

const { COLORS } = G;

// Герой: с него начинается партия, всегда ведёт цепочку; его нельзя выбить
// и бросить, его смерть — поражение. Подиумы действуют и на него
const hero = {
  color: COLORS.hero,
  anchor: true,
  stats: { name: 'Герой', hp: 120, radius: 14 },
  base: { weapons: { sword: {} } },
  // треугольник-«нос» показывает направление
  mark(u, f, ctx) {
    ctx.beginPath();
    ctx.moveTo(u.x + Math.cos(f) * u.r * 0.9, u.y + Math.sin(f) * u.r * 0.9);
    ctx.lineTo(u.x + Math.cos(f + 2.5) * u.r * 0.7, u.y + Math.sin(f + 2.5) * u.r * 0.7);
    ctx.lineTo(u.x + Math.cos(f - 2.5) * u.r * 0.7, u.y + Math.sin(f - 2.5) * u.r * 0.7);
    ctx.closePath();
    ctx.stroke();
  },
};

// Дружочек: обычный союзник, в базовом виде бьёт кулаком в ближнем бою
const buddy = {
  color: COLORS.buddy,
  stats: { name: 'Дружочек', hp: 80, radius: 12 },
  base: { weapons: { fist: {} } },
  // точка-«кулачок» впереди
  mark(u, f, ctx) {
    ctx.beginPath();
    ctx.arc(u.x + Math.cos(f) * u.r * 0.5, u.y + Math.sin(f) * u.r * 0.5, u.r * 0.28, 0, Math.PI * 2);
    ctx.stroke();
  },
};

G.allyTypes = { hero, buddy };
})(window.Game = window.Game || {});
