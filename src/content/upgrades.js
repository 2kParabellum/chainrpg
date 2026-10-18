// Реестр улучшений. Улучшение выбирают карточкой на экране «уровень пройден»; оно действует до конца прохождения
// (на всех следующих уровнях). Одна запись = одно улучшение; ключ записи — то, что лежит в state.upgrades.
//
// Поля записи:
//   name  — название на карточке
//   who   — чьё улучшение: ключ способности (стрелок, искра…) или 'hero'; от него цвет и подпись карточки
//   desc  — что даёт, в несколько слов; {команда} заменяется подписью кнопки ({pack} — «C» или «BAG»)
//   tier  — ранг: без поля — 1-й; 2 — выпадает, только если у того же who уже взято улучшение 1-го ранга
//   art   — (ctx, k): рисунок карточки 200 × 120; k — заготовки рисования из render/cards.js (свои, враги и
//           подиумы — те же картинки, что на поле)
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
    k.ally(40, 66, 'shooter', 0);
    for (const a of [-0.3, 0, 0.3]) {
      k.trail(62, 64, 62 + Math.cos(a) * 100, 64 + Math.sin(a) * 100, COLORS.allyShot);
      k.shot(62 + Math.cos(a) * 110, 64 + Math.sin(a) * 110, COLORS.allyShot, a);
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
    k.ally(36, 66, 'shooter', 0);
    k.trail(58, 64, 112, 64, COLORS.fire);
    k.shot(116, 64, COLORS.fire);
    k.enemy(160, 66);
    k.flame(150, 50, 8); k.flame(164, 44, 10); k.flame(174, 56, 7);
  },
};

const doubleSpark = {
  name: 'Double Voltage',
  who: 'spark',
  tier: 2,
  desc: 'Lightning hits two targets at once',
  targets: 2,        // сколько разных целей держит молния
  art(ctx, k) {
    k.ally(40, 66, 'spark', 0);
    k.enemy(160, 32); k.enemy(160, 94);
    k.bolt(58, 58, 146, 34, COLORS.spark);
    k.bolt(58, 70, 146, 92, COLORS.spark);
  },
};

const arc = {
  name: 'Long Arc',
  who: 'spark',
  desc: 'Lightning holds on from farther away',
  breakMul: 1.25,    // расстояние, на котором молния рвётся, больше во столько раз; заметить цель — как прежде
  art(ctx, k) {
    k.ring(34, 64, 92, COLORS.spark, true);
    k.ring(34, 64, 128, COLORS.spark, false);
    k.ally(34, 66, 'spark', 0);
    k.enemy(166, 66);
    k.bolt(52, 62, 152, 62, COLORS.spark);
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
    k.ally(30, 66, 'spark', 0);
    k.ring(112, 64, 14, COLORS.spark, true);
    k.pop(112, 64);
    k.enemy(164, 66);
    k.bolt(46, 62, 108, 62, COLORS.spark);
    k.bolt(118, 62, 150, 62, COLORS.spark);
  },
};

const medicRegen = {
  name: 'Self-Heal',
  who: 'medic',
  desc: 'The Doc slowly heals itself',
  share: 0.5,        // в секунду — такая доля его лечения в секунду
  art(ctx, k) {
    k.ring(100, 66, 32, COLORS.hpAlly, true);
    k.ally(100, 68, 'medic', 0);
    k.plus(60, 42, 8, COLORS.regen); k.plus(142, 34, 6, COLORS.regen); k.plus(146, 88, 7, COLORS.regen);
  },
};

const adrenaline = {
  name: 'Adrenaline',
  who: 'medic',
  desc: 'Heals badly wounded mates more',
  below: 0.4,        // цель с долей HP ниже этой ..
  mul: 1.5,          // .. лечится во столько раз сильнее
  art(ctx, k) {
    k.ally(38, 68, 'medic', 0);
    k.beam(56, 64, 140, 64, COLORS.medic);
    k.ally(158, 68, null, Math.PI, 0.25);
    k.plus(100, 34, 11, COLORS.regen);
  },
};

// копейщик без него бьёт только в одну сторону — туда, где ближайший враг
const doubleEdge = {
  name: 'Double Edge',
  who: 'spear',
  desc: 'The Brawler strikes both sides at once',
  art(ctx, k) {
    k.enemy(26, 68, 'hunter', 0);
    k.enemy(174, 68, 'hunter');
    k.trail(80, 66, 46, 66, COLORS.spear);
    k.trail(120, 66, 154, 66, COLORS.spear);
    k.ally(100, 68, 'spear', 0);
    k.impact(42, 64, COLORS.spear); k.impact(158, 64, COLORS.spear);
  },
};

const cover = {
  name: 'Cover',
  who: 'spear',
  desc: 'The Brawler’s neighbors take less damage',
  cut: 0.3,          // на такую долю меньше урона от любых атак получают оба соседа копейщика в цепочке (не он сам)
  art(ctx, k) {
    k.enemy(14, 68, 'hunter', 0);
    k.enemy(186, 68, 'hunter');
    k.ally(56, 68, null, 0);
    k.ally(100, 68, 'spear', 0);
    k.ally(144, 68, null, 0);
    k.shield(56, 66, 24, true);
    k.shield(144, 66, 24);
  },
};

const march = {
  name: 'March',
  who: 'hero',
  desc: 'A long chain is lighter to drive',
  links: 1,          // столько звеньев сверх обычного не утяжеляют цепочку
  art(ctx, k) {
    k.speedLines(10, 64);
    for (let i = 4; i >= 1; i--) k.ally(170 - i * 30, 68, null, 0);
    k.hero(170, 68, 0);
  },
};

const luckyFoot = {
  name: 'Lucky Foot',
  who: 'hero',
  desc: 'Boost pads show up more often',
  mul: 1.25,         // подиумы усилений появляются во столько раз чаще (пауза между ними — во столько же раз короче)
  art(ctx, k) {
    k.pad(40, 36, 'speed', 0.42); k.pad(160, 36, 'power', 0.42); k.pad(40, 94, 'regen', 0.42); k.pad(160, 94, 'will', 0.42);
    k.hero(100, 68, 0);
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
    k.speedLines(22, 64);
    k.hero(92, 66, 0);
    k.enemy(150, 66, 'bull');
    k.impact(120, 62, COLORS.power);
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
    k.ally(28, 66, 'shooter', 0);
    k.trail(48, 64, 180, 64, COLORS.allyShot);
    k.enemy(96, 66);
    k.enemy(146, 66);
    k.shot(184, 64, COLORS.allyShot);
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
    k.ally(38, 68, 'medic', 0);
    k.beam(56, 64, 132, 64, COLORS.medic);
    k.ring(152, 66, 26, COLORS.regen, true);
    k.ally(152, 68, null, Math.PI);
    k.plus(152, 28, 7, COLORS.regen); k.plus(180, 44, 5, COLORS.regen);
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
    k.ally(76, 72, 'spear', 0, 0.25);
    k.enemy(152, 72, 'hunter');
    k.impact(124, 68, COLORS.spear);
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
    k.ring(56, 66, 26, COLORS.hero, true);
    k.hero(56, 68, 0);
    k.trail(132, 64, 86, 64, COLORS.power);
    k.pad(152, 66, 'power', 0.55);
  },
};

G.upgrades = { tripleShot, fireArrows, arc, sticky, medicRegen, adrenaline, doubleEdge, cover, march, luckyFoot, ram,
               piercing, lastingCure, berserk, doubleSpark, backpack };
})(window.Game = window.Game || {});
