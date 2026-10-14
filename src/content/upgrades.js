// Реестр улучшений. Улучшение выбирают карточкой на экране «уровень пройден»; оно действует до конца прохождения
// (на всех следующих уровнях). Одна запись = одно улучшение; ключ записи — то, что лежит в state.upgrades.
//
// Поля записи:
//   name  — название на карточке
//   who   — чьё улучшение: ключ способности (стрелок, искра…) или 'hero'; от него цвет и подпись карточки
//   desc  — что даёт, в несколько слов; {команда} заменяется подписью кнопки ({pack} — «C» или «BAG»)
//   tier  — ранг: без поля — 1-й; 2 — выпадает, только если у того же who уже взято улучшение 1-го ранга
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
  tier: 2,
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

// цель молнии погибла — молния сразу, без прицеливания, перескакивает на врага вплотную к ней
// (просвет между телами не больше reach — примерно один дружочек); разгон урона начинается заново
const sticky = {
  name: 'Sticky Electricity',
  who: 'spark',
  desc: 'When the target dies, lightning jumps to a foe right next to it',
  reach: 36,
  art(ctx, k) {
    k.ally(36, 60, 'spark', 0);
    k.ring(118, 60, 12, COLORS.spark, true);
    k.enemy(160, 60);
    k.bolt(50, 60, 116, 60, COLORS.spark);
    k.bolt(122, 60, 148, 60, COLORS.spark);
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

// копейщик без него бьёт только в одну сторону — туда, где ближайший враг
const doubleEdge = {
  name: 'Double Edge',
  who: 'spear',
  desc: 'The Brawler strikes both sides at once',
  art(ctx, k) {
    k.ally(100, 64, 'spear', -Math.PI / 2);
    k.enemy(30, 64, COLORS.hunter, 10);
    k.enemy(170, 64, COLORS.hunter, 10);
    k.trail(84, 64, 46, 64, COLORS.spear);
    k.trail(116, 64, 154, 64, COLORS.spear);
    k.shot(46, 64, COLORS.spear);
    k.shot(154, 64, COLORS.spear);
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

const luckyFoot = {
  name: 'Lucky Foot',
  who: 'hero',
  desc: 'Boost pads show up more often',
  mul: 1.25,         // подиумы усилений появляются во столько раз чаще (пауза между ними — во столько же раз короче)
  art(ctx, k) {
    k.hero(100, 64, 0);
    k.pad(40, 36, COLORS.speed); k.pad(160, 36, COLORS.power); k.pad(40, 92, COLORS.regen); k.pad(160, 92, COLORS.will);
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

// --- 2-й ранг: выпадают, только если у того же персонажа уже есть улучшение 1-го ранга ---

// стрела с шансом chance проходит врага насквозь и летит дальше (на каждого следующего — бросок заново);
// каждого врага одна стрела ранит один раз; босса не пробивает — гаснет о него
const piercing = {
  name: 'Piercing Shots',
  who: 'shooter',
  tier: 2,
  desc: 'Shots often pass through to the next foe (not bosses)',
  chance: 0.6,
  art(ctx, k) {
    k.ally(30, 60, 'shooter', 0);
    k.enemy(96, 60);
    k.enemy(150, 60);
    k.trail(50, 60, 184, 60, COLORS.allyShot);
    k.shot(186, 60, COLORS.allyShot);
  },
};

// вылеченный ещё time секунд понемногу долечивается: всего share от размера лечения;
// новое лечение не складывается с прежним, а заменяет его
const lastingCure = {
  name: 'Lasting Cure',
  who: 'medic',
  tier: 2,
  desc: 'Each heal keeps healing for a few more seconds',
  share: 0.5,
  time: 3,
  art(ctx, k) {
    k.ally(40, 64, 'medic', 0);
    k.ally(150, 64, null, Math.PI);
    k.beam(54, 64, 136, 64, COLORS.medic);
    k.ring(150, 64, 24, COLORS.regen, true);
    k.plus(150, 30, 8, COLORS.regen); k.plus(176, 46, 6, COLORS.regen);
  },
};

// урон копья растёт с потерей HP копейщика: полное HP — ×1, у нуля — ×maxMul (линейно)
const berserk = {
  name: 'Berserk',
  who: 'spear',
  tier: 2,
  desc: 'The more HP the Brawler has lost, the harder it hits',
  maxMul: 1.5,
  art(ctx, k) {
    k.ally(80, 70, 'spear', 0);
    k.hpBar(80, 44, 0.25);
    k.enemy(150, 70, COLORS.hunter, 12);
    k.impact(126, 70);
  },
};

// рюкзак Героя: {pack} открывает его, следующий подиум усиления уходит в рюкзак (не действует);
// {pack} ещё раз — усиление включается на полное время. В рюкзаке одно усиление; к концу уровня оно сгорает
const backpack = {
  name: 'Backpack',
  who: 'hero',
  tier: 2,
  desc: '{pack} opens it: the next boost goes inside. {pack} again to use it',
  art(ctx, k) {
    k.hero(60, 64, 0);
    k.ring(60, 64, 24, COLORS.hero, true);
    k.pad(150, 64, COLORS.power);
    k.trail(132, 64, 84, 64, COLORS.power);
  },
};

G.upgrades = { tripleShot, fireArrows, arc, sticky, medicRegen, adrenaline, doubleEdge, cover, march, luckyFoot, ram,
               piercing, lastingCure, berserk, doubleSpark, backpack };
})(window.Game = window.Game || {});
