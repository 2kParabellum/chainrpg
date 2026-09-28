// Обновление кадра: порядок шагов и правила партии (активация врагов, победа, камера).
// Порядок в update() менять нельзя — он влияет на баланс, см. architecture.md.
(function (G) {
'use strict';

const { CONFIG, state } = G;
const { clamp, dist, removeFrom, pickWeighted } = G.math;
const { moveAndCollide, slideAlongWall, circleRectOverlap } = G.collision;
const { world, setDoorsOpen } = G.world;
const { leader, isLit, currentRoom, chainUnits, isSpotted, spawnEnemy } = G.session;
const { freeSpotNear } = G.world;
const { pushTrail, followChain, touchPads, updateBuffs, updateDowned, knockOutAlly } = G.chain;
const combat = G.combat;
const { updateProjectiles, updateClouds, applySpikes, applyFirewalls, updateEffects, updateCannons } = combat;
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
  spawnProjectile: combat.spawnProjectile, spawnMortar: combat.spawnMortar,
  spawnBigMortar: combat.spawnBigMortar, spawnHook: combat.spawnHook,
  spawnFirewall: combat.spawnFirewall,
  knockOutAlly, wanderStep, stepOffSpikes, chaseStep, removeFrom,
  spawnEnemy, freeSpotNear, pickChaser,
};

// движение Героя с инерцией: разгон к точке и накат после отпускания газа
function updateLeader(dt) {
  const lead = leader();
  const mv = lead.moveMul || 1;   // усиление подиума скорости: быстрее ход и разворот
  const cfg = { ...CONFIG.LEADER, speed: CONFIG.LEADER.speed * mv, accel: CONFIG.LEADER.accel * mv, brake: CONFIG.LEADER.brake * mv };
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
    lead.facing = Math.atan2(lead.vy, lead.vx);
    // упёршись в стену, не тормозим в ноль, а скользим вдоль неё
    const normal = moveAndCollide(lead, lead.vx * dt, lead.vy * dt, world.moveBlockers);
    if (normal) slideAlongWall(lead, normal, cfg.wallFriction);
  }
  if (state.level.solidEnemies) pushOutOfEnemies(lead);
}

// уровень с твёрдыми врагами: Герой не проходит сквозь тела врагов — на узкой тропе один
// враг перекрывает её целиком, пока его не убьют или не оттеснят
function pushOutOfEnemies(u) {
  for (const e of state.enemies) {
    if (!isSpotted(e)) continue;
    const dx = u.x - e.x, dy = u.y - e.y;
    const d = Math.hypot(dx, dy), min = u.r + e.r;
    if (d >= min) continue;
    const nx = d > 0.01 ? dx / d : 1, ny = d > 0.01 ? dy / d : 0;
    moveAndCollide(u, nx * (min - d), ny * (min - d), world.moveBlockers);
    const into = u.vx * nx + u.vy * ny;
    if (into < 0) { u.vx -= nx * into; u.vy -= ny * into; }
  }
}

// усиление «шипастость»: раз в contactInterval бьёт всех врагов, которых сейчас касается тело
function applySpikyContact(a, dt) {
  a.spikyCd = (a.spikyCd || 0) - dt;
  if (a.spikyCd > 0) return;
  const def = G.buffs.spiky;
  let hit = false;
  for (const e of state.enemies) {
    if (!isSpotted(e)) continue;
    if (dist(a, e) <= a.r + e.r) { combat.damageUnit(e, def.contactDmg); hit = true; }
  }
  if (hit) {
    a.spikyCd = def.contactInterval;
    state.effects.push({ type: 'ring', x: a.x, y: a.y, r: a.r + 6, life: 0.15, color: def.color });
  }
}

// звено цепочки: Герой идёт сам, остальные бегут за ним; работает оружие текущей способности звена
function updateAlly(a, dt, i) {
  if (i > 0) followChain(a, dt, i);
  for (const w of a.gear) weapons[w.type].update(a, w, dt * (a.rateMul || 1), game);
  if (a.buffs && a.buffs.spiky > 0) applySpikyContact(a, dt);
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

// кнопки открывают связанные двери, пока на них лежит брошенный (X) или выбитый союзник —
// вес тела держит дверь: подняли союзника обратно — дверь снова закрывается
function updateDoors() {
  if (!world.buttons.length) return;
  const openIds = new Set();
  for (const btn of world.buttons) {
    btn.pressed = state.downed.some((d) => circleRectOverlap(d.x, d.y, d.r, btn));
    if (btn.pressed) for (const id of btn.doorIds) openIds.add(id);
  }
  setDoorsOpen(openIds);
}

// условие победы задаёт уровень
function isVictory() {
  const rule = state.level.victory;
  if (rule.kind === 'destroyType') return !state.enemies.some((e) => e.type === rule.type);
  // дойти до финишной зоны уровня (см. world.finish)
  if (rule.kind === 'reachPoint') {
    const lead = leader();
    return !!world.finish && circleRectOverlap(lead.x, lead.y, lead.r, world.finish);
  }
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
  if (state.status !== 'play') return;

  state.lightTime += dt;
  updateLeader(dt);
  pushTrail();

  // дальнее оружие бьёт только по освещённому (факелом Героя), а мину — ещё и только после обнаружения
  state.visibleEnemies = state.enemies.filter((e) => isLit(e) && isSpotted(e));

  for (const a of state.party.slice()) {
    const i = state.party.indexOf(a);
    if (i >= 0) updateAlly(a, dt, i);
  }
  touchPads();
  updateBuffs(dt);
  for (const d of state.downed) updateDowned(d, dt);
  updateDoors();
  for (const e of state.enemies.slice()) updateEnemy(e, dt);
  updateCannons(dt);
  updateProjectiles(dt);
  updateClouds(dt);
  applySpikes(dt);
  applyFirewalls(dt);
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
