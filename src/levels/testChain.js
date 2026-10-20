// Тестовый уровень «Chain Tuning»: пустая квадратная комната, где всё время появляются дружочки, и подиумы «скорости»
// по углам — чтобы собирать цепочку и крутить ползунки её параметров (панель сверху, флаг tuner).
// В прохождение не входит — запускается только из меню выбора уровней. Здесь только данные — никакой игровой логики.
(function (G) {
'use strict';

// ============================================================================
//  ПЛАН КОМНАТЫ
//  Координаты — пиксели внутреннего квадрата (units: 'px'): 0..1360 по обеим осям, центр — (680, 680).
//  Четыре постоянных подиума «скорости» по углам (взятый гаснет на 12 с), старт в центре. Врагов нет.
// ============================================================================

const S = 1360, C = S / 2, P = 167;

const ROOM_PLAN = {
  units: 'px',
  pads: [[P, P], [S - P, P], [P, S - P], [S - P, S - P]].map(([x, y]) => [x, y, 'speed', { permanent: true, cooldown: 12 }]),
};

G.levelTestChain = {
  name: 'Chain Tuning',
  blurb: 'Test room: mates keep spawning, speed pads in the corners, sliders for every chain parameter on top',
  goal: 'Grab mates and tweak the chain with the sliders on top',
  geometry: { kind: 'rect', width: S + 80, height: S + 80, wall: 40 },
  spawn: { room: 0, at: [C, C], heading: -Math.PI / 2 },
  zoneNames: ['TUNING'],
  victory: { kind: 'none' },       // цели нет: играть, пока не надоест
  tuner: true,                     // сверху панель ползунков параметров цепочки (ui/tuner.js)
  // случайных подиумов нет; дружочки появляются часто по всей комнате и ждут подольше
  padSpawn: { jobs: { startCount: 0, maxActive: 0 }, buffs: { startCount: 0, maxActive: 0 } },
  allySpawn: { anywhere: true, startCount: 10, maxActive: 24, interval: [1, 2.5], lifetime: [60, 90] },
  rooms: [ROOM_PLAN],
};
})(window.Game = window.Game || {});
