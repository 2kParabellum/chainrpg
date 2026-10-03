// Состояние партии: всё, что меняется по ходу игры, лежит в одном объекте state.
// Другие модули читают и правят его поля, но не хранят собственных копий списков:
// сброс партии подменяет массивы целиком, поэтому обращаться надо всегда как state.party.
(function (G) {
'use strict';

const { CONFIG } = G;
const { clamp, dist, shuffled } = G.math;
const { world, localToWorld, buildWorld, roomIndexAt, scatterSpot } = G.world;
const { rollEnemies, rollLevelAllies } = G.populate;
const { allyTypes, enemyTypes, weapons, abilities } = G;

const state = {
  level: null,       // данные текущего уровня
  party: [],         // вся цепочка по порядку: [0] — Герой (им управляет игрок), остальные бегут по его следу
  moveInput: { throttle: 0, turn: 0 }, // зажатые клавиши движения: газ (+1/-1) и поворот (-1/+1)
  neutrals: [],      // ждут вербовки
  downed: [],        // выбитые из цепочки, лежат до подбора
  enemies: [],
  projectiles: [],
  effects: [],
  clouds: [],
  firewalls: [],     // стенки огня от луча босса: горят некоторое время на месте
  cannons: [],       // таймеры неуязвимых пушек-ловушек мира, по одному на world.cannons
  trail: [],         // след Героя, по которому бегут остальные звенья
  camera: { x: 0, y: 0 },
  status: 'play',    // menu | play | dead | win
  time: 0,           // время партии: для анимаций
  pads: [],          // подиумы на карте: появляются и исчезают по ходу партии (см. game/pads.js)
  padMarks: [],      // метки-тени будущих подиумов: через несколько секунд на их месте появится подиум
  jobSpawnIn: null,  // секунд до следующего подиума профессии; null — партия только началась
  buffSpawnIn: null, // то же для подиумов усилений
  allySpawnIn: null, // то же для случайных дружочков
  targetableEnemies: [], // враги, по которым можно стрелять: считаются раз за кадр
  base: null,        // уровень «Оборона»: база — цель врагов с запасом HP (null на других уровнях)
  nests: [],         // гнёзда врагов: таймер следующей волны и сколько волн уже вышло (см. game/waves.js)
  allyFlow: null,    // поле путей к союзникам и когда оно посчитано (см. game/roaming.js); null — посчитать заново
};

function makeUnit(kind, type, x, y, cfg) {
  return {
    kind, type, x, y, vx: 0, vy: 0, r: cfg.radius, hp: cfg.hp, maxHp: cfg.hp,
    cd: Math.random() * (cfg.cooldown || 1), facing: 0, regenTimer: 0,
    cfg: { ...cfg }, // у каждого юнита свои характеристики: прокачка одного не трогает остальных
  };
}

// личная копия оружия: характеристики из реестра с переопределениями персонажа и своя перезарядка
function makeWeapon(name, over) {
  const w = { type: name, ...weapons[name].stats, ...over };
  w.cd = w.readyAtStart ? 0 : Math.random() * (w.cooldown || 0);
  return w;
}

// переопределения уровня level (1..) способности key; у первого уровня их нет
function abilityLevelSpec(key, level) {
  const levels = (key && abilities[key].levels) || [];
  return levels[level - 1] || {};
}

// оружие юнита плоским списком: личные копии оружия способности key (с прокачкой уровня level) или базового
function makeGear(u, key, level = 1) {
  const spec = key ? abilities[key] : allyTypes[u.type].base;
  const up = key ? abilityLevelSpec(key, level).weapons || {} : {};
  return Object.entries((spec && spec.weapons) || {}).map(([name, over]) => makeWeapon(name, { ...over, ...up[name] }));
}

// пересчитать производные характеристики звена: множители активных усилений и прибавку HP от уровня
// способности. Рост предела HP прибавляет столько же текущего HP, падение — только обрезает текущее
function recalcStats(u) {
  let dmg = 1, hp = 1, move = 1, rate = 1;
  for (const [key, left] of Object.entries(u.buffs)) {
    if (!(left > 0)) continue;
    const d = G.buffs[key];
    dmg *= d.dmg || 1; hp *= d.hp || 1; move *= d.move || 1; rate *= d.rate || 1;
  }
  if (u.ability) hp *= abilityLevelSpec(u.ability, u.abilityLevel).hp || 1;
  u.dmgMul = dmg; u.moveMul = move; u.rateMul = rate;
  const max = Math.round(u.cfg.hp * hp);
  if (max > u.maxHp) u.hp += max - u.maxHp; else u.hp = Math.min(u.hp, max);
  u.maxHp = max;
}

// союзник (в цепи, нейтрал или лежачий): тело + базовое оружие без способности
function makeAlly(kind, type, x, y) {
  const t = allyTypes[type];
  const u = makeUnit(kind, type, x, y, t.stats);
  u.ability = null;              // ключ способности от подиума; null — базовое оружие
  u.abilityLevel = 0;            // уровень прокачки способности (1..), 0 — способности нет
  u.buffs = {};                  // усиление -> сколько секунд осталось
  u.buffOrder = [];              // активные усиления в порядке взятия: первым снимается самое давнее
  u.prevTarget = null;           // прошлая точка следа: по ней плётка считает скорость точки
  u.gear = makeGear(u, null);
  return u;
}

// сменить способность звена (или её уровень): оружие пересобирается новыми личными копиями; null — снова базовое
function setAbility(u, key, level = 1) {
  u.ability = key;
  u.abilityLevel = key ? level : 0;
  u.gear = makeGear(u, key, level);
  recalcStats(u);
}

// база уровня «Оборона» на месте здания world.base: для врагов она цель наравне с союзниками;
// круг цели вписан в здание. regenTimer — сколько секунд её не задевали (для вспышки при попадании)
function makeBase(b) {
  return { kind: 'base', type: 'base', x: b.x + b.w / 2, y: b.y + b.h / 2, r: Math.min(b.w, b.h) / 2,
           vx: 0, vy: 0, hp: b.hp, maxHp: b.hp, regenTimer: 99, cfg: { name: 'База' } };
}

function makeEnemy(type, x, y, room) {
  const t = enemyTypes[type];
  const e = makeUnit('enemy', type, x, y, t.stats);
  e.room = room;
  if (t.init) t.init(e);
  return e;
}

// новый враг посреди партии (его порождает портал); extra — личные поля вроде chasing и spawnedBy
function spawnEnemy(type, x, y, room, extra) {
  const e = makeEnemy(type, x, y, room);
  Object.assign(e, extra);
  state.enemies.push(e);
  return e;
}

// новая партия на уровне level; игрок и состав бойцов бросаются заново
function resetGame(level) {
  state.level = level;
  buildWorld(level);
  state.party = []; state.moveInput = { throttle: 0, turn: 0 }; state.neutrals = []; state.downed = []; state.enemies = [];
  state.projectiles = []; state.effects = []; state.trail = [];
  state.clouds = []; state.firewalls = [];
  state.pads = []; state.padMarks = []; state.jobSpawnIn = null; state.buffSpawnIn = null; state.allySpawnIn = null;
  state.cannons = world.cannons.map((c) => ({ cd: c.interval * Math.random(), telegraph: 0 }));
  state.status = 'play';
  state.time = 0;
  state.targetableEnemies = [];
  state.base = world.base ? makeBase(world.base) : null;
  state.allyFlow = null;
  // у каждого гнезда свой таймер волн; порядок, в котором гнёзда выпускают первые волны, бросается заново
  const waves = level.waves;
  state.nests = waves ? shuffled(world.nests).map((p, k) => ({
    x: p.x, y: p.y, wave: 0, nextIn: waves.firstAt + k * waves.stagger, releasedAt: -99, lastCount: 0,
  })) : [];

  const spawn = localToWorld(level.spawn.room, level.spawn.at[0], level.spawn.at[1]);
  const hero = makeAlly('ally', 'hero', spawn.x, spawn.y);
  // куда смотрит Герой и куда едет по W; по умолчанию вверх
  hero.heading = level.spawn.heading === undefined ? -Math.PI / 2 : level.spawn.heading;
  hero.facing = hero.heading;
  state.party.push(hero);
  // уровень может начинаться с уже собранной цепочкой: дружочки встают в хвост чуть позади героя
  // и сразу же подтягиваются на своё место плёткой
  for (let i = 0; i < (level.startParty || 0); i++) {
    state.party.push(makeAlly('ally', 'buddy', spawn.x - (i + 1) * 14, spawn.y));
  }

  // каждый союзник существует в одном экземпляре: состав бросается один раз на весь уровень
  const roster = rollLevelAllies(level);

  level.rooms.forEach((plan, i) => {
    for (const [type, cx, cy] of roster.rooms[i]) {
      const p = localToWorld(i, cx, cy);
      state.neutrals.push(makeAlly('neutral', type, p.x, p.y));
    }
    // занятые точки комнаты: враги без фиксированного места расставляются мимо них
    const taken = [];
    // порталы ставятся первыми, чтобы вокруг них оставалось свободное место
    for (const [cx, cy] of plan.portals || []) {
      const p = localToWorld(i, cx, cy);
      const portal = makeEnemy('portal', p.x, p.y, i);
      state.enemies.push(portal);
      taken.push({ x: p.x, y: p.y, r: portal.r + CONFIG.SCATTER.portalClearance });
    }
    for (const [type, cx, cy, extra] of rollEnemies(plan, level)) {
      let p;
      if (cx === undefined) {
        p = scatterSpot(i, enemyTypes[type].stats.radius, taken, CONFIG.SCATTER.gap);
        taken.push({ x: p.x, y: p.y, r: p.r });
      } else {
        p = localToWorld(i, cx, cy);
      }
      state.enemies.push(Object.assign(makeEnemy(type, p.x, p.y, i), extra));
    }
    for (const [cx, cy] of plan.mines || []) {
      const p = localToWorld(i, cx, cy);
      state.enemies.push(makeEnemy('mine', p.x, p.y, i));
    }
  });

  // союзники, разбросанные по зонам: ставятся после всех, мимо уже стоящих бойцов
  for (const [type, zone] of roster.scatter) {
    const taken = state.enemies.concat(state.neutrals)
      .filter((u) => roomIndexAt(u.x, u.y) === zone)
      .map((u) => ({ x: u.x, y: u.y, r: u.r }));
    const p = scatterSpot(zone, allyTypes[type].stats.radius, taken, CONFIG.SCATTER.gap);
    state.neutrals.push(makeAlly('neutral', type, p.x, p.y));
  }

  state.camera.x = clamp(state.party[0].x - CONFIG.VIEW.w / 2, 0, world.width - CONFIG.VIEW.w);
  state.camera.y = clamp(state.party[0].y - CONFIG.VIEW.h / 2, 0, world.height - CONFIG.VIEW.h);
}

// ведущий — всегда Герой, первое звено цепочки: от него считаются камера, активация врагов и цель порождённых порталами
function leader() { return state.party[0]; }

function chainUnits() { return state.party.slice(); }

// по кому бьют враги: цепочка (первым — Герой), лежачие и база уровня «Оборона»
function enemyTargets() {
  const list = chainUnits().concat(state.downed);
  if (state.base) list.push(state.base);
  return list;
}

// враг, которого уже можно видеть, целить и рубить: скрытые типы (мина) — только после обнаружения
function isSpotted(e) { return !enemyTypes[e.type].hiddenUntilRevealed || e.revealed; }

// множитель скорости Героя от длины цепочки: замедление — сумма первых k членов арифметической прогрессии
// (first, first + step, ...), k — сколько звеньев сверх fromLink; см. CHAIN.slowdown
function chainSpeedMul() {
  const { fromLink, first, step, max } = CONFIG.CHAIN.slowdown;
  const k = Math.max(0, state.party.length - fromLink);
  return 1 - Math.min(max, k * first + (step * k * (k - 1)) / 2);
}

function currentRoom() { return roomIndexAt(leader().x, leader().y); }

G.state = state;
G.session = { makeUnit, makeAlly, setAbility, recalcStats, spawnEnemy, resetGame, leader, chainUnits, enemyTargets, isSpotted, currentRoom, chainSpeedMul };
})(window.Game = window.Game || {});
