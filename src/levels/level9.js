// Данные тестового уровня «Ambush» (в прохождение не входит): небольшая прямоугольная комната, по гнезду у левой и
// правой стены. Волн ровно пять, раз в 30 с, каждая сложнее прошлой; новые враги (улитка-рыцарь, дудочник-сирена,
// черепаха-циклоп) занимают в волне по два места. Победа — все пять волн вышли и все враги перебиты. Здесь только данные — никакой игровой
// логики (волны — game/waves.js, их состав — populate.rollSlots).
(function (G) {
'use strict';

// ============================================================================
//  ПЛАН КОМНАТЫ
//  Координаты — пиксели внутреннего прямоугольника (units: 'px'): 0..1800 по x, 0..1200 по y, центр — (900, 600).
//  pillars: [cx, cy, w, h]; nests: [cx, cy].
//  Гнёзда — посередине коротких стен. Четыре колонны-укрытия стоят квадратом вокруг центра: за ними прячутся от турели
//  черепахи и от рывка улитки, но середина и проходы вдоль стен свободны.
// ============================================================================

const W = 1800, H = 1200;

const ROOM_PLAN = {
  units: 'px',
  pillars: [
    [560, 360, 90, 90], [W - 560, 360, 90, 90],
    [560, H - 360, 90, 90], [W - 560, H - 360, 90, 90],
  ],
  nests: [[140, H / 2], [W - 140, H / 2]],
};

// новые враги и старые, которые могут прийти с ними в первых волнах
const NEW = ['snail', 'piper', 'turtle'];
const OLD = ['bull', 'scorpion'];

G.level9 = {
  name: 'Ambush',
  blurb: 'A small room, two nests and five waves of the new demons',
  goal: 'Survive five waves from the two nests — defeat every enemy',
  geometry: { kind: 'rect', width: W + 80, height: H + 80, wall: 40 },
  spawn: { room: 0, at: [W / 2, H - 220], heading: -Math.PI / 2 }, // у южной стены посередине, лицом к центру
  enemyPool: OLD.concat(NEW),
  zoneNames: ['AMBUSH'],
  // волны раз в 30 с, все гнёзда разом, первая — на 15-й секунде; size — сколько мест в волне (новый враг — два),
  // kinds — сколько разных типов, pool — из кого. 1–2: два типа из старых и новых, 3–4: два типа только новых,
  // 5: три типа только новых. Состав каждой волны делится между гнёздами
  waves: {
    firstAt: 15, interval: 30,
    script: [
      { size: 4, kinds: 2, pool: OLD.concat(NEW) },
      { size: 6, kinds: 2, pool: OLD.concat(NEW) },
      { size: 6, kinds: 2, pool: NEW },
      { size: 8, kinds: 2, pool: NEW },
      { size: 10, kinds: 3, pool: NEW },
    ],
    spawnRadius: 90,
    telegraph: 4,
  },
  // победа: все волны вышли и все враги перебиты
  victory: { kind: 'waves', label: 'WAVE' },
  exit: { room: 0, at: [W / 2, H / 2] },
  // засада: дружочки ждут чаще и их больше разом, профессии — тоже
  padSpawn: { jobs: { maxActive: 5, interval: [4, 9] } },
  allySpawn: { maxActive: 4, interval: [4, 8] },
  rooms: [ROOM_PLAN],
};
})(window.Game = window.Game || {});
