// Данные уровня «Hit the Count»: большой квадратный зал, в центре — Под (взводной механизм на полу), в углах —
// четыре гнезда. Проехал по Поду цепочкой из 15 дружочков — открылся портал выхода. Здесь только данные — никакой
// игровой логики (Под — game/pod.js).
(function (G) {
'use strict';

// ============================================================================
//  ПЛАН ЗАЛА
//  Координаты — пиксели внутреннего квадрата (units: 'px'): 0..2400 по обеим осям, центр — (1200, 1200).
//  pillars: [cx, cy, w, h]; nests: [cx, cy].
//  В центре — Под: круг радиусом radius, по нему надо проехать цепочкой. Вокруг него пусто — длинной цепочке нужен
//  разгон по прямой. Четыре колонны на диагоналях — укрытие от стрелков, к Поду по осям и между колоннами — свободно.
//  Гнёзда — в углах зала.
// ============================================================================

const S = 2400, C = S / 2;

const ROOM_PLAN = {
  units: 'px',
  pillars: [[640, 640, 100, 100], [S - 640, 640, 100, 100], [640, S - 640, 100, 100], [S - 640, S - 640, 100, 100]],
  nests: [[170, 170], [S - 170, 170], [170, S - 170], [S - 170, S - 170]],
  // Под: goal дружочков за один проезд — победа; после проезда взводится снова через cooldown секунд; каждое проехавшее
  // по готовому Поду звено лечится на heal своего HP (раз за проезд); проезд кончился, если gap секунд никто из цепочки
  // его не касается; ближе keepClear к центру не появляются ни дружочки, ни подиумы
  pod: { at: [C, C], radius: 120, goal: 15, cooldown: 15, heal: 0.5, gap: 1, keepClear: 330 },
};

G.level6 = {
  name: 'Hit the Count',
  blurb: 'A big square hall: drive a chain of 15 mates across the pod in the middle',
  goal: 'Gather 15 mates and drive the whole chain across the pod in the middle',
  geometry: { kind: 'rect', width: S + 80, height: S + 80, wall: 40 },
  spawn: { room: 0, at: [C, 2080], heading: -Math.PI / 2 }, // внизу посередине, лицом к Поду
  // враги гнёзд — подвижные типы, как в «Логове», только без колесницы
  enemyPool: ['shooter', 'bull', 'scorpion', 'zombie', 'hunter'],
  enemyWeights: { shooter: 4, zombie: 2, hunter: 2, bull: 1, scorpion: 1 },
  zoneNames: ['COUNT HALL'],
  // гнёзда: как в «Логове», чуть мягче — первая волна позже, пауза сокращается до 11 с за 8 минут
  waves: {
    firstAt: 20, stagger: 6, interval: 24,
    ramp: { to: 11, time: 480 },
    size: { first: 1, grow: 0.15 },
    kinds: 2,
    spawnRadius: 100,
    telegraph: 4,
    maxAlive: 30,
  },
  // победа: за один проезд по Поду прошло goal дружочков; портал выхода — на самом Поде
  victory: { kind: 'podCount', label: 'POD' },
  exit: { room: 0, at: [C, C] },
  // подиумы и дружочки — в случайном месте зала (не у Пода); дружочков больше и чаще обычного: их надо набрать 15
  padSpawn: { anywhere: true },
  allySpawn: { anywhere: true, maxActive: 6, interval: [3, 6], lifetime: [25, 35] },
  rooms: [ROOM_PLAN],
};
})(window.Game = window.Game || {});
