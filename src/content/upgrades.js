// Реестр улучшений. Улучшение выбирают карточкой на экране «уровень пройден»; оно действует до конца прохождения
// (на всех следующих уровнях). Одна запись = одно улучшение; ключ записи — то, что лежит в state.upgrades.
//
// Поля записи:
//   name  — название на карточке
//   who   — чьё улучшение: ключ способности (стрелок, искра…) или 'hero'; от него цвет и подпись карточки
//   desc  — что даёт, в несколько слов
//   art   — (ctx, k): рисунок карточки 200 × 120; k — заготовки рисования из render/cards.js
//   остальные поля — числа улучшения; их читает тот код, который улучшение меняет (оружие, урон, движение Героя)
(function (G) {
'use strict';

const { COLORS } = G;

const tripleShot = {
  name: 'Тройной выстрел',
  who: 'shooter',
  desc: 'Каждый 3-й выстрел — ещё два снаряда веером',
  every: 3,          // каждый какой выстрел тройной
  spread: 0.22,      // угол боковых снарядов от основного, рад
  art(ctx, k) {
    k.ally(46, 60, 'shooter', 0);
    for (const a of [-0.32, 0, 0.32]) {
      k.trail(66, 60, 66 + Math.cos(a) * 110, 60 + Math.sin(a) * 110, COLORS.allyShot);
      k.shot(66 + Math.cos(a) * 112, 60 + Math.sin(a) * 112, COLORS.allyShot);
    }
  },
};

const fireArrows = {
  name: 'Огненные стрелы',
  who: 'shooter',
  desc: 'Попадание поджигает цель',
  share: 0.6,        // за всё горение цель теряет такую долю урона стрелы
  time: 3,           // сколько секунд горит
  art(ctx, k) {
    k.ally(40, 60, 'shooter', 0);
    k.trail(60, 60, 128, 60, COLORS.fire);
    k.enemy(152, 60);
    k.flame(144, 46, 9); k.flame(160, 42, 11); k.flame(170, 54, 8);
  },
};

const doubleSpark = {
  name: 'Двойное напряжение',
  who: 'spark',
  desc: 'Молния бьёт две цели сразу',
  targets: 2,        // сколько разных целей держит молния
  art(ctx, k) {
    k.ally(46, 60, 'spark', 0);
    k.enemy(158, 28); k.enemy(158, 92);
    k.bolt(60, 56, 146, 30, COLORS.spark);
    k.bolt(60, 64, 146, 90, COLORS.spark);
  },
};

const arc = {
  name: 'Электрическая дуга',
  who: 'spark',
  desc: 'Молния не рвётся дольше',
  breakMul: 1.25,    // расстояние, на котором молния рвётся, больше во столько раз; заметить цель — как прежде
  art(ctx, k) {
    k.ally(36, 60, 'spark', 0);
    k.ring(36, 60, 92, COLORS.spark, true);
    k.ring(36, 60, 132, COLORS.spark, false);
    k.enemy(162, 60);
    k.bolt(50, 60, 150, 60, COLORS.spark);
  },
};

const medicRegen = {
  name: 'Регенерация',
  who: 'medic',
  desc: 'Медик сам понемногу лечится',
  share: 0.5,        // в секунду — такая доля его лечения в секунду
  art(ctx, k) {
    k.ally(100, 64, 'medic', -Math.PI / 2);
    k.ring(100, 64, 30, COLORS.hpAlly, true);
    k.plus(64, 40, 9, COLORS.hpAlly); k.plus(138, 34, 7, COLORS.hpAlly); k.plus(140, 86, 8, COLORS.hpAlly);
  },
};

const adrenaline = {
  name: 'Адреналин',
  who: 'medic',
  desc: 'Сильнее лечит тяжело раненых',
  below: 0.4,        // цель с долей HP ниже этой ..
  mul: 1.5,          // .. лечится во столько раз сильнее
  art(ctx, k) {
    k.ally(40, 64, 'medic', 0);
    k.ally(156, 64, null, Math.PI);
    k.hpBar(156, 40, 0.25);
    k.beam(54, 64, 142, 64, COLORS.medic);
    k.plus(100, 38, 13, COLORS.medic);
  },
};

const spikedArmor = {
  name: 'Шипастая броня',
  who: 'spear',
  desc: 'Укусы возвращаются врагу',
  art(ctx, k) {
    k.ally(70, 64, 'spear', 0);
    k.spikes(70, 64, 22);
    k.enemy(146, 64, COLORS.hunter, 10);
    k.trail(124, 52, 92, 52, COLORS.enemyShot);
    k.trail(92, 76, 130, 76, COLORS.spear);
    k.shot(132, 76, COLORS.spear);
  },
};

const cover = {
  name: 'Прикрытие',
  who: 'spear',
  desc: 'Звено перед копейщиком крепче вблизи',
  cut: 0.4,          // на такую долю меньше урона от ближних атак получает звено прямо перед копейщиком
  art(ctx, k) {
    k.ally(60, 64, 'spear', 0);
    k.ally(104, 64, null, 0);
    k.shield(104, 64, 24);
    k.enemy(158, 64, COLORS.hunter, 10);
  },
};

const march = {
  name: 'Марш',
  who: 'hero',
  desc: 'Длинная цепочка меньше тормозит',
  links: 1,          // замедление начинается на столько звеньев позже
  art(ctx, k) {
    for (let i = 5; i >= 1; i--) k.ally(150 - i * 24, 64, null, 0);
    k.hero(150, 64, 0);
    k.speedLines(20, 64);
  },
};

const ram = {
  name: 'Таран',
  who: 'hero',
  desc: 'Герой бьёт врагов, врезаясь в них',
  dmg: 30,           // урон на полной скорости хода; медленнее — меньше
  minSpeed: 40,      // медленнее этого (скорость сближения) не бьёт
  cooldown: 0.5,     // одного врага — не чаще
  art(ctx, k) {
    k.speedLines(40, 64);
    k.hero(96, 64, 0);
    k.impact(122, 64);
    k.enemy(146, 64);
  },
};

G.upgrades = { tripleShot, fireArrows, doubleSpark, arc, medicRegen, adrenaline, spikedArmor, cover, march, ram };
})(window.Game = window.Game || {});
