// Обновление кадра: порядок шагов и правила партии (активация врагов, победа, камера).
// Порядок в update() менять нельзя — он влияет на баланс, см. architecture.md.
(function (G) {
'use strict';

const { CONFIG, state } = G;
const { clamp, dist, removeFrom } = G.math;
const { moveAndCollide, slideAlongWall } = G.collision;
const { world } = G.world;
const { lightRadius, currentRoom, chainUnits, isSpotted } = G.session;
const { pushTrail, followChain, attackRateMul, updateDowned, knockOutAlly } = G.chain;
const combat = G.combat;
const { updateProjectiles, updateClouds, applySpikes, updateEffects } = combat;
const { wanderStep, stepOffSpikes } = G.roaming;
const { allyTypes, enemyTypes } = G;

// то, что игра даёт записям типов из content/ параметром: сами они game/ не подключают
const game = {
  state, world, chainUnits, isSpotted,
  nearestTarget: combat.nearestTarget, damageUnit: combat.damageUnit, blast: combat.blast,
  spawnProjectile: combat.spawnProjectile, spawnMortar: combat.spawnMortar, spawnHook: combat.spawnHook,
  knockOutAlly, wanderStep, stepOffSpikes, removeFrom,
};

// движение игрока с инерцией: разгон к точке и накат после отпускания газа
function updatePlayer(dt) {
  const player = state.player;
  const cfg = player.cfg;
  let ax = 0, ay = 0;

  if (player.target) {
    const dx = player.target.x - player.x, dy = player.target.y - player.y;
    const d = Math.hypot(dx, dy);
    if (d <= cfg.arriveRadius) player.target = null;
    else { ax = dx / d; ay = dy / d; }
  }

  if (ax || ay) {
    player.vx += ax * cfg.accel * dt;
    player.vy += ay * cfg.accel * dt;
    const sp = Math.hypot(player.vx, player.vy);
    if (sp > cfg.speed) {
      player.vx = (player.vx / sp) * cfg.speed;
      player.vy = (player.vy / sp) * cfg.speed;
    }
  } else {
    const sp = Math.hypot(player.vx, player.vy);
    const drop = cfg.brake * dt;
    if (sp <= drop) { player.vx = 0; player.vy = 0; }
    else { player.vx -= (player.vx / sp) * drop; player.vy -= (player.vy / sp) * drop; }
  }

  const sp = Math.hypot(player.vx, player.vy);
  if (sp > 0.5) {
    player.facing = Math.atan2(player.vy, player.vx);
    // упёршись в стену, не тормозим в ноль, а скользим вдоль неё
    const normal = moveAndCollide(player, player.vx * dt, player.vy * dt, world.moveBlockers);
    if (normal) slideAlongWall(player, normal, cfg.wallFriction);
  }
}

// звено цепочки: бежит за игроком, а когда перезарядилось — действует по своему типу
function updateAlly(a, dt, i) {
  followChain(a, dt, i);

  const type = allyTypes[a.type];
  if (!type.attack) return; // сам не бьёт и не лечит (Усилок)

  a.cd -= dt;
  if (a.cd > 0) return;
  type.attack(a, attackRateMul(i), game);
}

// общая часть любого врага: регенерация и активация, дальше — поведение по типу
function updateEnemy(e, dt) {
  const type = enemyTypes[e.type];
  if (!type.update) return; // сам ничего не делает (мина)

  // регенерация: если врага давно не задевали, он отлечивается до полного
  e.regenTimer += dt;
  if (e.regenTimer > CONFIG.ENEMY_REGEN.delay && e.hp < e.maxHp) {
    e.hp = Math.min(e.maxHp, e.hp + (e.maxHp / CONFIG.ENEMY_REGEN.fullTime) * dt);
  }

  if (Math.abs(e.x - state.player.x) > CONFIG.ACTIVATION_DIST) return;
  type.update(e, dt, chainUnits(), game);
}

// шаг типов, которым нужно видеть итог боя и среды за кадр (мина)
function updateLate() {
  const chain = chainUnits();
  for (const e of state.enemies.slice()) {
    const type = enemyTypes[e.type];
    if (type.lateUpdate) type.lateUpdate(e, chain, game);
  }
}

function update(dt) {
  if (state.status !== 'play' || state.menu.open) return;

  state.lightTime += dt;
  updatePlayer(dt);
  pushTrail();

  const lit = lightRadius();
  // союзники бьют только по освещённому, а мину — ещё и только после обнаружения
  state.visibleEnemies = state.enemies.filter((e) => dist(state.player, e) <= lit && isSpotted(e));

  for (let i = 0; i < state.allies.length; i++) updateAlly(state.allies[i], dt, i);
  for (const d of state.downed) updateDowned(d, dt);
  for (const e of state.enemies.slice()) updateEnemy(e, dt);
  updateProjectiles(dt);
  updateClouds(dt);
  applySpikes(dt);
  updateLate();
  updateEffects(dt);

  // мины добивать необязательно: достаточно перебить всё живое
  const livingEnemies = state.enemies.filter((e) => !enemyTypes[e.type].ignoredForVictory).length;
  if (state.status === 'play' && livingEnemies === 0 && currentRoom() === state.level.victory.finalRoom) {
    state.status = 'win';
  }

  // камера
  const targetX = clamp(state.player.x - CONFIG.VIEW.w / 2, 0, world.width - CONFIG.VIEW.w);
  state.camera.x += (targetX - state.camera.x) * Math.min(1, CONFIG.CAMERA_LERP * dt);
}

G.update = { update };
})(window.Game = window.Game || {});
