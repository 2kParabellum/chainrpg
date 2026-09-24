// Обновление кадра: порядок шагов и правила партии (активация врагов, победа, камера).
// Порядок в update() менять нельзя — он влияет на баланс, см. architecture.md.
(function (G) {
'use strict';

const { CONFIG, state } = G;
const { clamp, dist, removeFrom, pickWeighted } = G.math;
const { moveAndCollide, slideAlongWall } = G.collision;
const { world } = G.world;
const { leader, isLit, currentRoom, chainUnits, isSpotted, spawnEnemy } = G.session;
const { freeSpotNear, trampleSpikes, rayLength } = G.world;
const { pushTrail, followChain, updateDowned, knockOutAlly } = G.chain;
const combat = G.combat;
const { updateProjectiles, updateClouds, updateFires, applySpikes, updateEffects } = combat;
const { wanderStep, stepOffSpikes, chaseStep } = G.roaming;
const { enemyTypes, weapons } = G;

// типы, которые может породить портал: только те, что умеют гнаться за игроком
const chaserTypes = Object.keys(enemyTypes).filter((k) => enemyTypes[k].chaseSpeed !== undefined);

// случайный тип для порождения порталом: подвижные типы с весами уровня (enemyWeights)
function pickChaser() { return pickWeighted(chaserTypes, state.level.enemyWeights || {}); }

// то, что игра даёт записям типов из content/ параметром: сами они game/ не подключают
const game = {
  state, world, chainUnits, isSpotted,
  nearestTarget: combat.nearestTarget, damageUnit: combat.damageUnit, blast: combat.blast,
  spawnProjectile: combat.spawnProjectile, spawnMortar: combat.spawnMortar, spawnHook: combat.spawnHook,
  spawnFirebomb: combat.spawnFirebomb, trampleSpikes, rayLength,
  knockOutAlly, wanderStep, stepOffSpikes, chaseStep, removeFrom,
  spawnEnemy, freeSpotNear, pickChaser,
};

// движение ведущего с инерцией: разгон к точке и накат после отпускания газа
function updateLeader(dt) {
  const lead = leader();
  const cfg = CONFIG.LEADER;
  let ax = 0, ay = 0;

  if (state.moveTarget) {
    const dx = state.moveTarget.x - lead.x, dy = state.moveTarget.y - lead.y;
    const d = Math.hypot(dx, dy);
    if (d <= cfg.arriveRadius) state.moveTarget = null;
    else { ax = dx / d; ay = dy / d; }
  }

  if (ax || ay) {
    lead.vx += ax * cfg.accel * dt;
    lead.vy += ay * cfg.accel * dt;
    const sp = Math.hypot(lead.vx, lead.vy);
    if (sp > cfg.speed) {
      lead.vx = (lead.vx / sp) * cfg.speed;
      lead.vy = (lead.vy / sp) * cfg.speed;
    }
  } else {
    const sp = Math.hypot(lead.vx, lead.vy);
    const drop = cfg.brake * dt;
    if (sp <= drop) { lead.vx = 0; lead.vy = 0; }
    else { lead.vx -= (lead.vx / sp) * drop; lead.vy -= (lead.vy / sp) * drop; }
  }

  const sp = Math.hypot(lead.vx, lead.vy);
  if (sp > 0.5) {
    lead.facing = lead.heading = Math.atan2(lead.vy, lead.vx);
    // упёршись в стену, не тормозим в ноль, а скользим вдоль неё
    const normal = moveAndCollide(lead, lead.vx * dt, lead.vy * dt, world.moveBlockers);
    if (normal) slideAlongWall(lead, normal, cfg.wallFriction);
  }
}

// звено цепочки: ведущий идёт сам, остальные бегут за ним; оружие работает по режиму звена
// (ведущий — «с факелом», остальные — «в цепи»), пассивные особенности — всегда
function updateAlly(a, dt, i) {
  if (i > 0) followChain(a, dt, i);

  a.beam = null;
  for (const w of a.gear.passive) weapons[w.type].update(a, w, dt, game);
  for (const w of a.gear[i === 0 ? 'lead' : 'chain']) weapons[w.type].update(a, w, dt, game);
}

// общая часть любого врага: регенерация и активация, дальше — поведение по типу
function updateEnemy(e, dt) {
  const type = enemyTypes[e.type];
  if (!type.update) return; // сам ничего не делает (мина)

  // регенерация: если врага давно не задевали, он отлечивается до полного
  if (!type.noRegen) {
    e.regenTimer += dt;
    if (e.regenTimer > CONFIG.ENEMY_REGEN.delay && e.hp < e.maxHp) {
      e.hp = Math.min(e.maxHp, e.hp + (e.maxHp / CONFIG.ENEMY_REGEN.fullTime) * dt);
    }
  }

  // порталы и порождённые ими охотники действуют на любом расстоянии, остальные спят вдали от игрока
  if (!type.alwaysActive && !e.hunter && dist(e, leader()) > CONFIG.ACTIVATION_DIST) return;
  type.update(e, dt, chainUnits(), game);
}

// условие победы задаёт уровень
function isVictory() {
  const rule = state.level.victory;
  if (rule.kind === 'destroyType') return !state.enemies.some((e) => e.type === rule.type);
  // мины добивать необязательно: достаточно перебить всё живое
  const living = state.enemies.filter((e) => !enemyTypes[e.type].ignoredForVictory).length;
  return living === 0 && currentRoom() === rule.finalRoom;
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
  state.swapCd = Math.max(0, state.swapCd - dt);
  updateLeader(dt);
  pushTrail();

  // союзники бьют только по освещённому (факелом ведущего или огнём Факира), а мину — ещё и только после обнаружения
  state.visibleEnemies = state.enemies.filter((e) => isLit(e) && isSpotted(e));

  for (const a of state.party.slice()) {
    const i = state.party.indexOf(a);
    if (i >= 0) updateAlly(a, dt, i);
  }
  for (const d of state.downed) updateDowned(d, dt);
  for (const e of state.enemies.slice()) updateEnemy(e, dt);
  updateProjectiles(dt);
  updateClouds(dt);
  updateFires(dt);
  applySpikes(dt);
  updateLate();
  updateEffects(dt);

  if (state.status === 'play' && isVictory()) state.status = 'win';

  // камера
  const targetX = clamp(leader().x - CONFIG.VIEW.w / 2, 0, world.width - CONFIG.VIEW.w);
  const targetY = clamp(leader().y - CONFIG.VIEW.h / 2, 0, world.height - CONFIG.VIEW.h);
  const k = Math.min(1, CONFIG.CAMERA_LERP * dt);
  state.camera.x += (targetX - state.camera.x) * k;
  state.camera.y += (targetY - state.camera.y) * k;
}

G.update = { update };
})(window.Game = window.Game || {});
