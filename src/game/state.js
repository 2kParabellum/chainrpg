// Состояние партии: всё, что меняется по ходу игры, лежит в одном объекте state.
// Другие модули читают и правят его поля, но не хранят собственных копий списков:
// сброс партии подменяет массивы целиком, поэтому обращаться надо всегда как state.allies.
(function (G) {
'use strict';

const { CONFIG } = G;
const { clamp, dist } = G.math;
const { world, localToWorld, buildWorld } = G.world;
const { rollEnemies, rollAllies } = G.populate;
const { ROOM_PLANS } = G.level1;

const state = {
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
    cd: Math.random() * (cfg.cooldown || 1), facing: 0, regenTimer: 0, cfg,
  };
}

function resetGame() {
  buildWorld();
  state.allies = []; state.neutrals = []; state.downed = []; state.enemies = [];
  state.projectiles = []; state.effects = []; state.trail = [];
  state.clouds = [];
  state.status = 'play';
  state.menu.open = false; state.menu.drag = null;
  state.lightTime = 0;
  state.visibleEnemies = [];

  const spawn = localToWorld(0, 0.12, 0.5);
  state.player = {
    kind: 'player', type: 'player', x: spawn.x, y: spawn.y, vx: 0, vy: 0,
    r: CONFIG.PLAYER.radius, hp: CONFIG.PLAYER.hp, maxHp: CONFIG.PLAYER.hp, facing: 0,
    target: null, cfg: CONFIG.PLAYER,
  };

  ROOM_PLANS.forEach((plan, i) => {
    for (const [type, cx, cy] of rollAllies(plan)) {
      const p = localToWorld(i, cx, cy);
      state.neutrals.push(makeUnit('neutral', type, p.x, p.y, CONFIG.ALLIES[type]));
    }
    for (const [type, cx, cy] of rollEnemies(plan)) {
      const p = localToWorld(i, cx, cy);
      const e = makeUnit('enemy', type, p.x, p.y, CONFIG.ENEMIES[type]);
      e.room = i;
      if (type === 'bull') { e.state = 'idle'; e.timer = 0; e.travelled = 0; e.dir = { x: 0, y: 0 }; }
      state.enemies.push(e);
    }
    for (const [cx, cy] of plan.mines || []) {
      const p = localToWorld(i, cx, cy);
      const m = makeUnit('enemy', 'mine', p.x, p.y, CONFIG.ENEMIES.mine);
      m.room = i;
      m.revealed = false;
      state.enemies.push(m);
    }
  });

  state.camera.x = clamp(state.player.x - CONFIG.ROOM_W / 2, 0, world.width - CONFIG.ROOM_W);
  state.camera.y = 0;
}

function chainUnits() { return [state.player].concat(state.allies); }

// радиус фонаря с лёгким дрожанием пламени
function lightRadius() {
  const v = CONFIG.VISION;
  return v.radius + Math.sin(state.lightTime * v.flickerSpeed) * v.flicker
                  + Math.sin(state.lightTime * v.flickerSpeed * 2.7) * v.flicker * 0.5;
}

function isLit(u) { return dist(state.player, u) <= lightRadius(); }

function currentRoom() {
  const step = CONFIG.ROOM_W + CONFIG.CORRIDOR_LEN;
  return clamp(Math.floor((state.player.x + CONFIG.CORRIDOR_LEN / 2) / step), 0, CONFIG.ROOM_COUNT - 1);
}

G.state = state;
G.session = { makeUnit, resetGame, chainUnits, lightRadius, isLit, currentRoom };
})(window.Game = window.Game || {});
