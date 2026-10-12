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
  name: 'Triple Shot',
  who: 'shooter',
  desc: 'Every 3rd shot adds two more in a spread',
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
  name: 'Fire Shots',
  who: 'shooter',
  desc: 'Hits set the target on fire',
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
  name: 'Double Voltage',
  who: 'spark',
  desc: 'Lightning hits two targets at once',
  targets: 2,        // сколько разных целей держит молния
  art(ctx, k) {
    k.ally(46, 60, 'spark', 0);
    k.enemy(158, 28); k.enemy(158, 92);
    k.bolt(60, 56, 146, 30, COLORS.spark);
    k.bolt(60, 64, 146, 90, COLORS.spark);
  },
};

const arc = {
  name: 'Long Arc',
  who: 'spark',
  desc: 'Lightning holds on from farther away',
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
  name: 'Self-Heal',
  who: 'medic',
  desc: 'The Doc slowly heals itself',
  share: 0.5,        // в секунду — такая доля его лечения в секунду
  art(ctx, k) {
    k.ally(100, 64, 'medic', -Math.PI / 2);
    k.ring(100, 64, 30, COLORS.hpAlly, true);
    k.plus(64, 40, 9, COLORS.hpAlly); k.plus(138, 34, 7, COLORS.hpAlly); k.plus(140, 86, 8, COLORS.hpAlly);
  },
};

const adrenaline = {
  name: 'Adrenaline',
  who: 'medic',
  desc: 'Heals badly wounded mates more',
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
  name: 'Spiked Armor',
  who: 'spear',
  desc: 'Melee hits hurt the attacker back',
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
  name: 'Cover',
  who: 'spear',
  desc: 'The Brawler’s neighbors take less damage',
  cut: 0.3,          // на такую долю меньше урона от любых атак получают оба соседа копейщика в цепочке (не он сам)
  art(ctx, k) {
    k.ally(56, 64, null, 0);
    k.ally(100, 64, 'spear', 0);
    k.ally(144, 64, null, 0);
    k.shield(56, 64, 24, true);
    k.shield(144, 64, 24);
    k.enemy(20, 64, COLORS.hunter, 9);
    k.enemy(182, 64, COLORS.hunter, 9);
  },
};

const march = {
  name: 'March',
  who: 'hero',
  desc: 'A long chain is lighter to drive',
  links: 1,          // столько звеньев сверх обычного не утяжеляют цепочку
  art(ctx, k) {
    for (let i = 5; i >= 1; i--) k.ally(150 - i * 24, 64, null, 0);
    k.hero(150, 64, 0);
    k.speedLines(20, 64);
  },
};

const accumulate = {
  name: 'Stockpile',
  who: 'hero',
  desc: 'Three boosts at once instead of two',
  extra: 1,          // сколько усилений сверх CONFIG.BUFFS.maxActive держит звено
  art(ctx, k) {
    k.hero(100, 62, -Math.PI / 2);
    k.ring(100, 62, 22, COLORS.speed, false);
    k.ring(100, 62, 29, COLORS.power, false);
    k.ring(100, 62, 36, COLORS.regen, false);
    k.pad(38, 62, COLORS.speed); k.pad(162, 40, COLORS.power); k.pad(162, 86, COLORS.regen);
  },
};

const ram = {
  name: 'Ram',
  who: 'hero',
  desc: 'The Hero rams enemies: the faster and the straighter the chain, the harder',
  // урон = dmgPerMass × скорость × масса, не больше maxDmg (сила усиливает сверху).
  // скорость — скорость сближения в долях полной скорости хода, не больше speedCap;
  // масса — Герой (heroMass) плюс звенья подряд за ним, идущие примерно туда же, куда едет Герой
  // (отклонение не больше alignAngle); на повороте цепочка гнётся, и масса падает
  dmgPerMass: 6,     // 6 на единицу массы: Герой один — 12, Герой и 4 звена по прямой — 36
  heroMass: 2,
  alignAngle: 0.52,  // рад (~30°)
  speedCap: 1.3,     // с усилением скорости
  maxDmg: 40,        // потолок урона
  minSpeed: 40,      // медленнее этого (скорость сближения) не бьёт
  cooldown: 0.5,     // одного врага — не чаще
  art(ctx, k) {
    k.speedLines(40, 64);
    k.hero(96, 64, 0);
    k.impact(122, 64);
    k.enemy(146, 64);
  },
};

G.upgrades = { tripleShot, fireArrows, doubleSpark, arc, medicRegen, adrenaline, spikedArmor, cover, march, accumulate, ram };
})(window.Game = window.Game || {});
