// Тестовый уровень «Ram Test»: квадратная комната с мишенью-манекеном посередине, чтобы проверять таран.
// В прохождение не входит — запускается только из меню выбора уровней. Здесь только данные — никакой игровой логики.
(function (G) {
'use strict';

// ============================================================================
//  ПЛАН КОМНАТЫ
//  Координаты — пиксели внутреннего квадрата (units: 'px'): 0..1360 по обеим осям, центр — (680, 680).
//  В левом нижнем углу — постоянный подиум «скорости», как в «Логове» (не исчезает, взятый гаснет на 40 с),
//  рядом с ним старт. Десять дружочков лежат кольцом вокруг мишени и не уходят; новые появляются по ходу.
// ============================================================================

const S = 1360, C = S / 2;

const ROOM_PLAN = {
  units: 'px',
  pads: [[167, S - 167, 'speed', { permanent: true, cooldown: 40 }]],
  allies: {
    spots: Array.from({ length: 10 }, (_, k) => {
      const a = (k / 10) * Math.PI * 2;
      return [Math.round(C + Math.cos(a) * 380), Math.round(C + Math.sin(a) * 380)];
    }),
  },
  enemies: { spots: [[C, C]], kinds: 1, pool: ['dummy'] },
};

G.levelTestRam = {
  name: 'Ram Test',
  blurb: 'Test room: a dummy to ram, ten mates, a speed pad. Starts with the Ram upgrade',
  goal: 'Ram the dummy: straighter chain and higher speed — harder hit',
  geometry: { kind: 'rect', width: S + 80, height: S + 80, wall: 40 },
  spawn: { room: 0, at: [299, S - 299], heading: -Math.PI / 4 }, // у подиума скорости, лицом к мишени
  enemyPool: ['dummy'],
  zoneNames: ['TEST ROOM'],
  victory: { kind: 'none' },       // цели нет: играть, пока не надоест
  upgrades: ['ram'],               // улучшения, с которыми уровень стартует
  // случайных подиумов нет; дружочки появляются по всей комнате и ждут подольше
  padSpawn: { jobs: { startCount: 0, maxActive: 0 }, buffs: { startCount: 0, maxActive: 0 } },
  allySpawn: { anywhere: true, startCount: 0, maxActive: 16, interval: [3, 6], lifetime: [40, 60] },
  rooms: [ROOM_PLAN],
};
})(window.Game = window.Game || {});
