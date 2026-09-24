// Реестр типов союзников. Один тип = одна запись: характеристики тела, набор оружия по режимам,
// метка на теле. Все союзники уникальны: в партии каждый тип встречается не больше одного раза.
// Новый союзник добавляется записью сюда (плюс цвет в палитре и строка в пуле уровня),
// остальной код не меняется. Оружие описано в content/weapons.js.
//
// Поля записи:
//   color    — цвет тела и подписей
//   anchor   — нельзя выбить, утащить и бросить; смерть такого звена — поражение (Герой)
//   stats    — характеристики тела: имя, HP, радиус; юнит получает их как cfg
//   lead     — режим «с факелом» (звено идёт первым): light — радиус факела,
//              weapons — { имя оружия: {переопределения его характеристик} }
//   chain    — режим «в цепи» (звено идёт следом): weapons — как выше
//   traits   — пассивные особенности, которые работают в любом режиме (тот же формат, что weapons)
//   mark     — (u, f, ctx, mode): рисует знак на теле; f — направление взгляда, mode — 'lead' | 'chain'
// Всё, что нужно от игры, оружие получает параметром game и никогда не подключает game/ само.
(function (G) {
'use strict';

const { COLORS } = G;

// Герой: с него начинается партия, всегда в цепочке (его нельзя выбить и бросить), его смерть — поражение.
// С факелом — самый большой обзор и меч; в цепи — меч и слабый револьвер
const hero = {
  color: COLORS.hero,
  anchor: true,
  stats: { name: 'Герой', hp: 75, radius: 14 },
  lead: { light: 300, weapons: { sword: {} } },
  chain: { weapons: { sword: {}, revolver: {} } },
  // треугольник-«нос» показывает направление; в цепи добавлен ствол револьвера
  mark(u, f, ctx, mode) {
    ctx.beginPath();
    ctx.moveTo(u.x + Math.cos(f) * u.r * 0.9, u.y + Math.sin(f) * u.r * 0.9);
    ctx.lineTo(u.x + Math.cos(f + 2.5) * u.r * 0.7, u.y + Math.sin(f + 2.5) * u.r * 0.7);
    ctx.lineTo(u.x + Math.cos(f - 2.5) * u.r * 0.7, u.y + Math.sin(f - 2.5) * u.r * 0.7);
    ctx.closePath();
    ctx.stroke();
    if (mode === 'chain') {
      ctx.beginPath();
      ctx.moveTo(u.x, u.y);
      ctx.lineTo(u.x + Math.cos(f) * u.r * 1.25, u.y + Math.sin(f) * u.r * 1.25);
      ctx.stroke();
    }
  },
};

// Лучник: в цепи — лук на очень большую дальность; с факелом — только метательные ножи
const archer = {
  color: COLORS.archer,
  stats: { name: 'Лучник', hp: 50, radius: 13 },
  lead: { light: 210, weapons: { knives: {} } },
  chain: { weapons: { bow: {} } },
  mark(u, f, ctx, mode) {
    ctx.beginPath();
    if (mode === 'chain') {
      ctx.arc(u.x, u.y, u.r * 0.95, f - 1.0, f + 1.0);
      ctx.moveTo(u.x + Math.cos(f - 1.0) * u.r * 0.95, u.y + Math.sin(f - 1.0) * u.r * 0.95);
      ctx.lineTo(u.x + Math.cos(f + 1.0) * u.r * 0.95, u.y + Math.sin(f + 1.0) * u.r * 0.95);
    } else {
      ctx.moveTo(u.x - Math.cos(f) * u.r * 0.4, u.y - Math.sin(f) * u.r * 0.4);
      ctx.lineTo(u.x + Math.cos(f) * u.r * 0.9, u.y + Math.sin(f) * u.r * 0.9);
      ctx.moveTo(u.x + Math.cos(f + 1.6) * u.r * 0.45, u.y + Math.sin(f + 1.6) * u.r * 0.45);
      ctx.lineTo(u.x + Math.cos(f - 1.6) * u.r * 0.45, u.y + Math.sin(f - 1.6) * u.r * 0.45);
    }
    ctx.stroke();
  },
};

// Медик: регенерация цепочки в любом режиме; в цепи ещё лечит активно, с факелом — рассеивает облака
const medic = {
  color: COLORS.medic,
  stats: { name: 'Медик', hp: 49, radius: 13 },
  lead: { light: 210, weapons: { regen: {}, dispel: {} } },
  chain: { weapons: { regen: {}, heal: {} } },
  mark(u, f, ctx, mode) {
    ctx.beginPath();
    ctx.moveTo(u.x - u.r * 0.55, u.y); ctx.lineTo(u.x + u.r * 0.55, u.y);
    ctx.moveTo(u.x, u.y - u.r * 0.55); ctx.lineTo(u.x, u.y + u.r * 0.55);
    ctx.stroke();
    if (mode === 'lead') {
      ctx.beginPath();
      ctx.arc(u.x, u.y, u.r * 0.85, 0, Math.PI * 2);
      ctx.stroke();
    }
  },
};

// Воин: копьё и щит вокруг цепочки; с факелом — только щит перед лицом. Железные сапоги топчут шипы
const warrior = {
  color: COLORS.warrior,
  stats: { name: 'Воин', hp: 95, radius: 16 },
  lead: { light: 190, weapons: { shieldFront: {} } },
  chain: { weapons: { spear: {}, shieldAura: {} } },
  traits: { ironBoots: {} },
  mark(u, f, ctx, mode) {
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(u.x, u.y, u.r * 0.85, f - 0.9, f + 0.9);
    ctx.stroke();
    ctx.lineWidth = 2;
    if (mode === 'chain') {
      ctx.beginPath();
      ctx.moveTo(u.x - Math.cos(f) * u.r * 0.2, u.y - Math.sin(f) * u.r * 0.2);
      ctx.lineTo(u.x + Math.cos(f) * u.r * 1.3, u.y + Math.sin(f) * u.r * 1.3);
      ctx.stroke();
    }
  },
};

// Факир: в цепи бросает огонь; с факелом — короткий огненный луч вперёд
const fakir = {
  color: COLORS.fakir,
  stats: { name: 'Факир', hp: 55, radius: 13 },
  lead: { light: 240, weapons: { flameBeam: {} } },
  chain: { weapons: { firebomb: {} } },
  // язычок пламени; с факелом добавлена линия луча
  mark(u, f, ctx, mode) {
    ctx.beginPath();
    ctx.moveTo(u.x, u.y - u.r * 0.6);
    ctx.quadraticCurveTo(u.x + u.r * 0.55, u.y - u.r * 0.05, u.x, u.y + u.r * 0.55);
    ctx.quadraticCurveTo(u.x - u.r * 0.55, u.y - u.r * 0.05, u.x, u.y - u.r * 0.6);
    ctx.stroke();
    if (mode === 'lead') {
      ctx.beginPath();
      ctx.moveTo(u.x + Math.cos(f) * u.r * 0.5, u.y + Math.sin(f) * u.r * 0.5);
      ctx.lineTo(u.x + Math.cos(f) * u.r * 1.1, u.y + Math.sin(f) * u.r * 1.1);
      ctx.stroke();
    }
  },
};

G.allyTypes = { hero, archer, medic, warrior, fakir };
})(window.Game = window.Game || {});
