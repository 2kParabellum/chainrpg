// ВРЕМЕННЫЙ файл (этап 1): поведение врагов по типам, перенесено как есть.
// На этапе 2 каждая ветка переедет в запись своего типа в content/enemies.js, а файл исчезнет.
(function (G) {
'use strict';

const { CONFIG, state } = G;
const { dist } = G.math;
const { moveAndCollide } = G.collision;
const { world, spikeRectAt, standsOnSpikes, freeSpotInRoom } = G.world;
const { knockOutAlly } = G.chain;
const { damageUnit, nearestTarget, spawnProjectile, spawnMortar, spawnHook } = G.combat;

// враг, оказавшийся на шипах не в рывке, сходит с них кратчайшим путём
function stepOffSpikes(e, dt, speed) {
  const rect = spikeRectAt(e);
  if (!rect) return false;

  const left = e.x - rect.x, right = rect.x + rect.w - e.x;
  const top = e.y - rect.y, bottom = rect.y + rect.h - e.y;
  const m = Math.min(left, right, top, bottom);
  const dx = m === left ? -1 : m === right ? 1 : 0;
  const dy = m === top ? -1 : m === bottom ? 1 : 0;
  moveAndCollide(e, dx * speed * dt, dy * speed * dt, world.moveBlockers);
  e.wanderTarget = null;
  return true;
}

// случайные перебежки врага в пределах своей комнаты
function wanderStep(e, dt, speed) {
  if (e.pauseTimer > 0 && !standsOnSpikes(e)) { e.pauseTimer -= dt; return; }

  if (!e.wanderTarget || dist(e, e.wanderTarget) < CONFIG.WANDER.arrive) {
    e.wanderTarget = freeSpotInRoom(e);
    e.pauseTimer = standsOnSpikes(e) ? 0
      : CONFIG.WANDER.pauseMin + Math.random() * (CONFIG.WANDER.pauseMax - CONFIG.WANDER.pauseMin);
    return;
  }

  const dx = e.wanderTarget.x - e.x, dy = e.wanderTarget.y - e.y;
  const d = Math.hypot(dx, dy);
  const step = Math.min(d, speed * dt);
  const from = { x: e.x, y: e.y };
  moveAndCollide(e, (dx / d) * step, (dy / d) * step, world.moveBlockers);

  // вдоль стены враг скользит, и только застряв окончательно выбирает новую точку
  e.stuckTimer = dist(e, from) < step * 0.35 ? (e.stuckTimer || 0) + dt : 0;
  if (e.stuckTimer > 0.5) {
    e.wanderTarget = null;
    e.stuckTimer = 0;
  }
}

// зомби норовит встать рядом с цепочкой, но не вплотную, и травит всё вокруг облаком
function updateZombie(e, dt, chain) {
  const foe = nearestTarget(e, chain, e.cfg.aggro);
  e.cd -= dt;

  if (!foe) {
    if (!stepOffSpikes(e, dt, CONFIG.WANDER.zombieSpeed * 1.6)) {
      wanderStep(e, dt, CONFIG.WANDER.zombieSpeed);
    }
    return;
  }

  const d = dist(e, foe);
  e.facing = Math.atan2(foe.y - e.y, foe.x - e.x);
  const near = e.cfg.standoff;
  const sign = d > near * 1.15 ? 1 : d < near * 0.8 ? -1 : 0;
  if (sign) {
    moveAndCollide(e, Math.cos(e.facing) * e.cfg.walkSpeed * sign * dt,
      Math.sin(e.facing) * e.cfg.walkSpeed * sign * dt, world.moveBlockers);
  }

  if (e.cd <= 0 && d < near * 1.6) {
    state.clouds.push({ x: e.x, y: e.y, r: e.cfg.cloudRadius, cur: 0, t: 0, life: e.cfg.cloudLife });
    e.cd = e.cfg.cooldown;
  }
}

function updateBull(e, dt, chain) {
  const foe = nearestTarget(e, chain, e.cfg.aggro);

  if (e.state === 'idle') {
    if (stepOffSpikes(e, dt, CONFIG.WANDER.bullSpeed * 1.6)) return;
    if (!foe) { wanderStep(e, dt, CONFIG.WANDER.bullSpeed); return; }
    e.facing = Math.atan2(foe.y - e.y, foe.x - e.x);
    moveAndCollide(e, Math.cos(e.facing) * e.cfg.walkSpeed * dt,
      Math.sin(e.facing) * e.cfg.walkSpeed * dt, world.moveBlockers);
    e.timer -= dt;
    if (e.timer <= 0) { e.state = 'telegraph'; e.timer = e.cfg.telegraph; }
    return;
  }

  if (e.state === 'telegraph') {
    if (foe) e.facing = Math.atan2(foe.y - e.y, foe.x - e.x);
    e.timer -= dt;
    if (e.timer <= 0) {
      e.state = 'charge';
      e.dir = { x: Math.cos(e.facing), y: Math.sin(e.facing) };
      e.travelled = 0;
      e.hitThisCharge = [];
      e.chargeSpeed = e.cfg.chargeStartSpeed;
    }
    return;
  }

  // рывок: сначала разгон, после первого столкновения бычок начинает тормозить
  const cfg = e.cfg;
  e.chargeSpeed += (e.hitThisCharge.length ? -cfg.chargeBrake : cfg.chargeAccel) * dt;
  e.chargeSpeed = Math.min(e.chargeSpeed, cfg.chargeSpeed);

  const step = e.chargeSpeed * dt;
  const normal = moveAndCollide(e, e.dir.x * step, e.dir.y * step, world.moveBlockers);
  e.travelled += step;

  // лобовой удар в стену обрывает рывок, косой — только сворачивает бычка вдоль неё
  let crashed = false;
  if (normal) {
    const into = e.dir.x * normal.x + e.dir.y * normal.y;
    if (into < -0.5) crashed = true;
    else {
      e.dir.x -= normal.x * into;
      e.dir.y -= normal.y * into;
      const len = Math.hypot(e.dir.x, e.dir.y) || 1;
      e.dir.x /= len; e.dir.y /= len;
      e.facing = Math.atan2(e.dir.y, e.dir.x);
    }
  }

  // проезжает насквозь: первому достаётся полный урон, остальным — половинный
  for (const u of chain.concat(state.downed)) {
    if (e.hitThisCharge.includes(u)) continue;
    if (dist(e, u) >= e.r + u.r) continue;
    const dmg = e.hitThisCharge.length ? cfg.dmg * cfg.repeatDamage : cfg.dmg;
    e.hitThisCharge.push(u);
    damageUnit(u, dmg);
    if (u.kind === 'ally' && u.hp > 0 && Math.random() < cfg.knockoutChance) {
      knockOutAlly(u, Math.atan2(u.y - e.y, u.x - e.x), cfg.knockbackSpeed);
    }
  }

  if (crashed || e.travelled > cfg.chargeMaxDist || e.chargeSpeed < cfg.chargeStopSpeed) {
    e.state = 'idle';
    e.timer = cfg.chargeCooldown;
  }
}

// действие врага за кадр: движение и атака по типу (реген и активацию решает game/update.js)
function act(e, dt, chain) {
  if (e.type === 'bull') {
    updateBull(e, dt, chain);
    return;
  }

  if (e.type === 'zombie') {
    updateZombie(e, dt, chain);
    return;
  }

  const wanderSpeed = e.type === 'scorpion' ? CONFIG.WANDER.scorpionSpeed : CONFIG.WANDER.shooterSpeed;
  if (e.type !== 'tower' && !stepOffSpikes(e, dt, wanderSpeed * 1.6)) {
    wanderStep(e, dt, wanderSpeed);
  }

  e.cd -= dt;
  const foe = nearestTarget(e, chain, e.cfg.range);
  if (!foe) return;
  e.facing = Math.atan2(foe.y - e.y, foe.x - e.x);
  if (e.cd > 0) return;

  if (e.type === 'tower') {
    spawnMortar(e, foe.x, foe.y);
  } else if (e.type === 'scorpion') {
    spawnHook(e, foe);
  } else {
    spawnProjectile(e, foe.x, foe.y, e.cfg.projSpeed, e.cfg.dmg, 'enemy', e.cfg.projRadius);
  }
  e.cd = e.cfg.cooldown;
}

G.enemyAi = { act };
})(window.Game = window.Game || {});
