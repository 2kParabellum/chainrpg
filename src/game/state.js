// Состояние партии: всё, что меняется по ходу игры, лежит в одном объекте state.
// Другие модули читают и правят его поля, но не хранят собственных копий списков:
// сброс партии подменяет массивы целиком, поэтому обращаться надо всегда как state.party.
(function (G) {
'use strict';

const { CONFIG } = G;
const { clamp, dist } = G.math;
const { world, localToWorld, buildWorld, roomIndexAt, scatterSpot } = G.world;
const { rollEnemies, rollLevelAllies } = G.populate;
const { allyTypes, enemyTypes, weapons, abilities } = G;

const state = {
  level: null,       // данные текущего уровня
  party: [],         // вся цепочка по порядку: [0] — Герой (им управляет игрок), остальные бегут по его следу
  moveTarget: null,  // куда идёт Герой: цель управления
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
  padRequest: false, // нажат ПРОБЕЛ: в этом кадре звенья на подиумах берут их способность или усиление
  targetableEnemies: [], // враги, по которым можно стрелять: считаются раз за кадр
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

// оружие юнита плоским списком: личные копии оружия способности key или, если её нет, базового
function makeGear(u, key) {
  const spec = key ? abilities[key] : allyTypes[u.type].base;
  return Object.entries((spec && spec.weapons) || {}).map(([name, over]) => makeWeapon(name, over));
}

// союзник (в цепи, нейтрал или лежачий): тело + базовое оружие без способности
function makeAlly(kind, type, x, y) {
  const t = allyTypes[type];
  const u = makeUnit(kind, type, x, y, t.stats);
  u.ability = null;              // ключ способности от подиума; null — базовое оружие
  u.prevTarget = null;           // прошлая точка следа: по ней плётка считает скорость точки
  u.gear = makeGear(u, null);
  return u;
}

// сменить способность звена: оружие пересобирается новыми личными копиями; null — снова базовое
function setAbility(u, key) {
  u.ability = key;
  u.gear = makeGear(u, key);
}

function makeEnemy(type, x, y, room) {
  const t = enemyTypes[type];
  const e = makeUnit('enemy', type, x, y, t.stats);
  e.room = room;
  if (t.init) t.init(e);
  return e;
}

// новый враг посреди партии (его порождает портал); extra — личные поля вроде hunter и spawnedBy
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
  state.party = []; state.moveTarget = null; state.neutrals = []; state.downed = []; state.enemies = [];
  state.projectiles = []; state.effects = []; state.trail = [];
  state.clouds = []; state.firewalls = [];
  state.cannons = world.cannons.map((c) => ({ cd: c.interval * Math.random(), telegraph: 0 }));
  state.status = 'play';
  state.time = 0;
  state.targetableEnemies = [];

  const spawn = localToWorld(level.spawn.room, level.spawn.at[0], level.spawn.at[1]);
  state.party.push(makeAlly('ally', 'hero', spawn.x, spawn.y));
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

// ведущий — всегда Герой, первое звено цепочки: от него считаются камера, активация врагов и цель охотников
function leader() { return state.party[0]; }

function chainUnits() { return state.party.slice(); }

// враг, которого уже можно видеть, целить и рубить: скрытые типы (мина) — только после обнаружения
function isSpotted(e) { return !enemyTypes[e.type].hiddenUntilRevealed || e.revealed; }

// сколько тел в цепочке вместе с Героем: уровень может задать свой предел, иначе общий
function maxParty() { return state.level.maxParty || CONFIG.CHAIN.maxParty; }

function currentRoom() { return roomIndexAt(leader().x, leader().y); }

G.state = state;
G.session = { makeUnit, makeAlly, setAbility, spawnEnemy, resetGame, leader, chainUnits, isSpotted, currentRoom, maxParty };
})(window.Game = window.Game || {});
