// Состояние партии: всё, что меняется по ходу игры, лежит в одном объекте state.
// Другие модули читают и правят его поля, но не хранят собственных копий списков:
// сброс партии подменяет массивы целиком, поэтому обращаться надо всегда как state.allies.
(function (G) {
'use strict';

const { CONFIG } = G;
const { clamp, dist } = G.math;
const { world, localToWorld, buildWorld, roomIndexAt, scatterSpot } = G.world;
const { rollEnemies, rollAllies, rollScatterAllies } = G.populate;
const { allyTypes, enemyTypes } = G;

const state = {
  level: null,       // данные текущего уровня
  player: null,
  allies: [],        // звенья цепочки по порядку: первый идёт сразу за игроком
  neutrals: [],      // ждут вербовки
  downed: [],        // выбитые из цепочки, лежат до подбора
  enemies: [],
  projectiles: [],
  effects: [],
  clouds: [],
  trail: [],         // след игрока, по которому бегут союзники
  camera: { x: 0, y: 0 },
  status: 'play',    // menu | play | dead | win
  lightTime: 0,
  visibleEnemies: [], // освещённые враги: считаются раз за кадр, по ним стреляют союзники
  menu: { open: false, drag: null }, // меню порядка цепочки; drag: { from, y }
};

function makeUnit(kind, type, x, y, cfg) {
  return {
    kind, type, x, y, vx: 0, vy: 0, r: cfg.radius, hp: cfg.hp, maxHp: cfg.hp,
    cd: Math.random() * (cfg.cooldown || 1), facing: 0, regenTimer: 0,
    cfg: { ...cfg }, // у каждого юнита свои характеристики: прокачка одного не трогает остальных
  };
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
  state.allies = []; state.neutrals = []; state.downed = []; state.enemies = [];
  state.projectiles = []; state.effects = []; state.trail = [];
  state.clouds = [];
  state.status = 'play';
  state.menu.open = false; state.menu.drag = null;
  state.lightTime = 0;
  state.visibleEnemies = [];

  const spawn = localToWorld(level.spawn.room, level.spawn.at[0], level.spawn.at[1]);
  state.player = {
    kind: 'player', type: 'player', x: spawn.x, y: spawn.y, vx: 0, vy: 0,
    r: CONFIG.PLAYER.radius, hp: CONFIG.PLAYER.hp, maxHp: CONFIG.PLAYER.hp, facing: 0,
    target: null, cfg: { ...CONFIG.PLAYER },
  };

  level.rooms.forEach((plan, i) => {
    for (const [type, cx, cy] of rollAllies(plan, level)) {
      const p = localToWorld(i, cx, cy);
      state.neutrals.push(makeUnit('neutral', type, p.x, p.y, allyTypes[type].stats));
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
    for (const [type, cx, cy] of rollEnemies(plan, level)) {
      let p;
      if (cx === undefined) {
        p = scatterSpot(i, enemyTypes[type].stats.radius, taken, CONFIG.SCATTER.gap);
        taken.push({ x: p.x, y: p.y, r: p.r });
      } else {
        p = localToWorld(i, cx, cy);
      }
      state.enemies.push(makeEnemy(type, p.x, p.y, i));
    }
    for (const [cx, cy] of plan.mines || []) {
      const p = localToWorld(i, cx, cy);
      state.enemies.push(makeEnemy('mine', p.x, p.y, i));
    }
  });

  // союзники, разбросанные по зонам: ставятся после всех, мимо уже стоящих бойцов
  for (const [type, zone] of rollScatterAllies(level)) {
    const taken = state.enemies.concat(state.neutrals)
      .filter((u) => roomIndexAt(u.x, u.y) === zone)
      .map((u) => ({ x: u.x, y: u.y, r: u.r }));
    const stats = allyTypes[type].stats;
    const p = scatterSpot(zone, stats.radius, taken, CONFIG.SCATTER.gap);
    state.neutrals.push(makeUnit('neutral', type, p.x, p.y, stats));
  }

  state.camera.x = clamp(state.player.x - CONFIG.VIEW.w / 2, 0, world.width - CONFIG.VIEW.w);
  state.camera.y = clamp(state.player.y - CONFIG.VIEW.h / 2, 0, world.height - CONFIG.VIEW.h);
}

function chainUnits() { return [state.player].concat(state.allies); }

// радиус фонаря с лёгким дрожанием пламени
function lightRadius() {
  const v = CONFIG.VISION;
  return v.radius + Math.sin(state.lightTime * v.flickerSpeed) * v.flicker
                  + Math.sin(state.lightTime * v.flickerSpeed * 2.7) * v.flicker * 0.5;
}

function isLit(u) { return dist(state.player, u) <= lightRadius(); }

// враг, которого уже можно видеть, целить и рубить: скрытые типы (мина) — только после обнаружения
function isSpotted(e) { return !enemyTypes[e.type].hiddenUntilRevealed || e.revealed; }

// сколько союзников можно тащить за собой: уровень может задать свой предел, иначе общий
function maxAllies() { return state.level.maxAllies || CONFIG.CHAIN.maxAllies; }

function currentRoom() { return roomIndexAt(state.player.x, state.player.y); }

G.state = state;
G.session = { makeUnit, spawnEnemy, resetGame, chainUnits, lightRadius, isLit, isSpotted, currentRoom, maxAllies };
})(window.Game = window.Game || {});
