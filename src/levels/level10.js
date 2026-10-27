// Данные уровня «Endless» — последнего в прохождении: как «Ambush» (по гнезду у левой и правой стены, все гнёзда выходят
// разом), только комната чуть больше, а волнам нет конца — каждая следующая больше, пестрее и крепче, пауза между ними
// сокращается. Враги — все обычные подвижные, с 4-й волны к ним присоединяются новые демоны «Ambush». Победы нет: партия
// идёт, пока жив Герой. Здесь только данные — никакой игровой логики (волны — game/waves.js, их состав — populate.rollSlots).
(function (G) {
'use strict';

// ============================================================================
//  ПЛАН КОМНАТЫ
//  Координаты — пиксели внутреннего прямоугольника (units: 'px'): 0..2200 по x, 0..1440 по y, центр — (1100, 720).
//  pillars: [cx, cy, w, h]; nests: [cx, cy].
//  Гнёзда — посередине коротких стен. Четыре колонны-укрытия стоят квадратом вокруг центра (как в «Ambush», только шире),
//  ещё две — посередине длинных стен, ближе к центру: за ними прячутся от стрелков и рывков, середина свободна.
// ============================================================================

const W = 2200, H = 1440;

const ROOM_PLAN = {
  units: 'px',
  pillars: [
    [700, 440, 90, 90], [W - 700, 440, 90, 90],
    [700, H - 440, 90, 90], [W - 700, H - 440, 90, 90],
    [W / 2, 230, 140, 60], [W / 2, H - 230, 140, 60],
  ],
  nests: [[150, H / 2], [W - 150, H / 2]],
};

// обычные подвижные враги (катапульта стоять на месте не умеет) и новые демоны «Ambush»
const BASE = ['shooter', 'bull', 'scorpion', 'zombie', 'hunter', 'chariot'];
const NEW = ['snail', 'piper', 'turtle'];

G.level10 = {
  name: 'Endless',
  blurb: 'A bigger room, two nests and waves that never end — each one harder',
  goal: 'Survive as long as you can — the waves never stop',
  geometry: { kind: 'rect', width: W + 80, height: H + 80, wall: 40 },
  spawn: { room: 0, at: [W / 2, H - 340], heading: -Math.PI / 2 }, // у южной стены посередине (над колонной), лицом к центру
  enemyPool: BASE.concat(NEW),
  enemyWeights: { shooter: 3, zombie: 2, hunter: 2, bull: 2, scorpion: 1, chariot: 1, snail: 2, piper: 2, turtle: 2 },
  zoneNames: ['ENDLESS'],
  // волны по формуле (k — номер волны с нуля): мест size.first + size.grow·k (новый враг и колесница — два), типов
  // kinds.first + kinds.grow·k (не больше max), пул — последний из pools с from ≤ k, HP врагов ×(1 + hpGrow·k).
  // Первая — на 15-й секунде, пауза — interval, за ramp.time секунд партии сокращается до ramp.to. Живых врагов волн
  // не больше maxAlive: лишние из волны пропадают. Состав каждой волны делится между гнёздами
  waves: {
    firstAt: 15, interval: 30,
    ramp: { to: 18, time: 600 },
    endless: {
      size: { first: 4, grow: 2 },
      kinds: { first: 2, grow: 0.25, max: 6 },
      pools: [{ from: 0, pool: BASE }, { from: 3, pool: BASE.concat(NEW) }],
      hpGrow: 0.05,
    },
    maxAlive: 40,
    spawnRadius: 110,
    telegraph: 4,
  },
  // победы нет: волны идут, пока жив Герой; счёт — сколько волн вышло
  victory: { kind: 'endless', label: 'WAVE' },
  // дружочки ждут чаще и их больше разом, профессии — тоже
  padSpawn: { jobs: { maxActive: 5, interval: [4, 9] } },
  allySpawn: { maxActive: 4, interval: [4, 8] },
  rooms: [ROOM_PLAN],
};
})(window.Game = window.Game || {});
