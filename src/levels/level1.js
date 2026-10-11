// Данные обучающего уровня «Обучение»: шесть комнат в линию, каждая учит одной вещи.
// Выход из комнаты закрыт дверью: в первой её открывает кнопка (на неё надо бросить дружочка), в остальных —
// зачистка комнаты.
// Здесь только данные — никакой игровой логики.
(function (G) {
'use strict';

// ============================================================================
//  ПЛАН КОМНАТ
//  Координаты — пиксели внутреннего прямоугольника комнаты (units: 'px'); size — размер комнаты
//  вместе со стенами (стена 40). Проходы между комнатами — посередине высоты, по центрам комнат.
//  pillars / pits / spikes: [cx, cy, w, h]; pads: [cx, cy, ключ] — подиумы, которые стоят на своём
//  месте всю партию (взятый появляется снова через несколько секунд); allies.spots — ждущие дружочки.
//  hint — короткая подсказка: всплывает посреди экрана, когда Герой входит в комнату ({recruit}, {drop} — подпись
//  кнопки команды под способ ввода: «ПРОБЕЛ» / «ВЗЯТЬ», см. core/input.js); task — что сделать, чтобы
//  пройти комнату: всё время горит в строке под строкой состояния. exitByButton — выход открывает кнопка плана
//  (buttons: [cx, cy, [id дверей]]; выход комнаты i — дверь 'exit' + i), а не зачистка.
// ============================================================================

const ROOMS = [
  { // 1 — кнопка: дружочка можно бросить (X) на кнопку, и он держит дверь открытой
    units: 'px', size: [900, 640],
    hint: '{recruit} — grab a mate, {drop} — leave it on the button',
    task: 'TASK: leave a mate on the button to open the door',
    allies: { spots: [[300, 140]] },
    // кнопка открывает выход из этой комнаты (дверь 'exit0'); открывшись, дверь больше не закрывается
    exitByButton: true,
    buttons: [[600, 430, ['exit0']]],
  },
  { // 2 — дверь-мишень: ближний бой её не берёт, нужен стрелок
    units: 'px', size: [900, 640],
    hint: 'Grab a mate and turn it into a Gun Mate to open the door',
    task: 'TASK: make a Gun Mate and break the target door',
    allies: { spots: [[330, 170]] },
    pads: [[330, 400, 'shooter']],
    enemies: { spots: [[817, 280]], kinds: 1, pool: ['doorTarget'] },
  },
  { // 3 — стрелки, медик
    units: 'px', size: [1200, 800],
    hint: 'Grab another mate and make it a Doc',
    task: 'TASK: take out all the Shooters',
    pillars: [[540, 230, 40, 150], [540, 490, 40, 150]],
    allies: { spots: [[170, 560]] },
    pads: [[300, 170, 'medic']],
    enemies: { spots: [[760, 170], [780, 560], [980, 300], [990, 470]], kinds: 1, pool: ['shooter'] },
  },
  { // 4 — турель под щитом и «сила», которая его пробивает
    units: 'px', size: [1100, 800],
    hint: 'Grab “power” — it lets shots break through the shield',
    task: 'TASK: grab “power” and destroy the turret',
    pillars: [[470, 190, 40, 130], [470, 530, 40, 130]],
    pads: [[170, 150, 'power']],
    enemies: { spots: [[770, 360]], kinds: 1, pool: ['turret'] },
  },
  { // 5 — катапульты и «скорость»
    units: 'px', size: [1400, 900],
    hint: 'Keep moving — catapults fire where you were',
    task: 'TASK: destroy all the catapults',
    pillars: [[720, 410, 40, 170], [980, 190, 150, 40], [980, 630, 150, 40]],
    pads: [[720, 240, 'speed']], // в глубине комнаты, между катапультами: за ним надо съездить под обстрелом
    enemies: { spots: [[520, 140], [520, 680], [920, 410], [1180, 150], [1180, 670]], kinds: 1, pool: ['tower'] },
  },
  { // 6 — большая финальная комната: свой отряд, профессии, случайные подиумы и дружочки, 13 врагов
    units: 'px', size: [2000, 1400],
    hint: 'Build a squad and take out every enemy',
    task: 'TASK: take out every enemy to open the exit portal',
    pillars: [[800, 350, 40, 200], [800, 970, 40, 200], [1300, 660, 160, 40]],
    pits: [[1500, 660, 120, 160]],
    spikes: [[1000, 660, 120, 80]],
    // на старте — один дружочек и один подиум, остальное появляется по ходу боя
    allies: { spots: [[420, 400]] },
    pads: [[420, 920, 'spark']],
    // только простые враги: Стрелки, Хантеры (бегают и кусаются) и Бычки
    enemies: [
      { spots: [[1000, 250], [1050, 1070], [1520, 420], [1560, 900], [1780, 200], [1780, 1120]], kinds: 1, pool: ['shooter'] },
      { spots: [[1350, 320], [1350, 1000], [1820, 660], [1460, 170], [1460, 1150]], kinds: 1, pool: ['hunter'] },
      { spots: [[1120, 480], [1120, 860]], kinds: 1, pool: ['bull'] },
    ],
  },
];

G.level1 = {
  name: 'Tutorial',
  blurb: 'Six rooms: a button, Gun Mate, Doc, a shielded turret, catapults and a final fight',
  goal: 'Get through six rooms and beat everyone in the last one',
  // комнаты в линию; gates — выход из каждой комнаты закрыт, пока в ней есть враги
  geometry: { kind: 'line', wall: 40, corridorLen: 80, corridorH: 120, gates: true },
  spawn: { room: 0, at: [110, 280], heading: 0 }, // слева в первой комнате, лицом к двери
  enemyPool: ['shooter'],
  // случайные подиумы и дружочки — только в последней комнате (пока Герой в ней)
  spawnRooms: [5],
  // в последней комнате стартовой порции нет: всё появляется по таймерам, начиная с первого входа
  padSpawn: { jobs: { startCount: 0 }, buffs: { startCount: 0 } },
  allySpawn: { startCount: 0 },
  // победа: дойти до последней комнаты и перебить всех
  victory: { kind: 'clearFinalRoom', finalRoom: 5 },
  // светлый портал выхода: открывается после победы, в него надо заехать
  exit: { room: 5, at: [1720, 660] }, // у дальней стены последней комнаты
  rooms: ROOMS,
};
})(window.Game = window.Game || {});
