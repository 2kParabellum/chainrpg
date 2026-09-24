// Бой: всё, что наносит урон, — снаряды, взрывы, облака, шипы, смерть юнита.
(function (G) {
'use strict';

const { CONFIG, COLORS, state } = G;
const { dist, removeFrom } = G.math;
const { circleRectOverlap } = G.collision;
const { world, hasLineOfSight, standsOnSpikes } = G.world;
const { chainUnits, activeWeapons, isSpotted } = G.session;
const { hookAlly, rebuildTrail } = G.chain;
const { allyTypes, enemyTypes, weapons } = G;

// --- цели и урон ---

function nearestTarget(from, list, range) {
  let best = null, bestD = range;
  for (const t of list) {
    const d = dist(from, t);
    if (d < bestD && hasLineOfSight(from, t)) { bestD = d; best = t; }
  }
  return best;
}

function damageUnit(u, dmg) {
  if (u.hp <= 0) return;
  u.hp -= dmg;
  u.regenTimer = 0;
  if (u.hp <= 0) {
    if (u.kind === 'ally') {
      // гибель Героя — конец партии; его тело остаётся в цепочке, чтобы сцена и камера не остались без ведущего
      if (allyTypes[u.type].anchor) { state.status = 'dead'; return; }
      const wasLeader = state.party[0] === u;
      removeFrom(state.party, u);
      if (wasLeader) rebuildTrail();
    }
    else if (u.kind === 'enemy') {
      removeFrom(state.enemies, u);
      const flash = enemyTypes[u.type].deathFlash;
      if (flash) state.effects.push({ type: 'blast', x: u.x, y: u.y, r: flash, life: 0.35 });
    }
    else if (u.kind === 'neutral') removeFrom(state.neutrals, u);
  }
}

// урон по площади: центр взрыва, радиус, урон и список тех, кого он может задеть;
// вспышка рисуется в fxAt (по умолчанию — в центре). Если задан edgeDmg, урон линейно
// падает от dmg в эпицентре до edgeDmg на краю радиуса
function blast(center, radius, dmg, victims, fxAt = center, edgeDmg = dmg) {
  state.effects.push({ type: 'blast', x: fxAt.x, y: fxAt.y, r: radius, life: 0.35 });
  for (const u of victims) {
    const d = dist(center, u);
    if (d >= radius + u.r) continue;
    damageUnit(u, dmg + (edgeDmg - dmg) * Math.min(1, d / radius));
  }
}

// --- снаряды ---

function spawnProjectile(from, tx, ty, speed, dmg, team, radius) {
  const a = Math.atan2(ty - from.y, tx - from.x);
  state.projectiles.push({
    x: from.x, y: from.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
    dmg, team, r: radius, life: 3,
  });
}

// навесной снаряд катапульты: летит по дуге в точку, где цель была в момент выстрела
function spawnMortar(from, tx, ty) {
  state.projectiles.push({
    kind: 'mortar', team: 'enemy', r: 5,
    sx: from.x, sy: from.y, x: from.x, y: from.y,
    tx, ty, t: 0, flight: from.cfg.flightTime,
    dmg: from.cfg.dmg, edgeDmg: from.cfg.edgeDmg, blast: from.cfg.blastRadius,
  });
}

// гарпун Скорпиона: медленная нить, которая выдёргивает союзника из цепочки
function spawnHook(from, foe) {
  const a = Math.atan2(foe.y - from.y, foe.x - from.x);
  state.projectiles.push({
    kind: 'hook', team: 'enemy', owner: from,
    x: from.x, y: from.y,
    vx: Math.cos(a) * from.cfg.projSpeed, vy: Math.sin(a) * from.cfg.projSpeed,
    dmg: from.cfg.dmg, r: from.cfg.projRadius, life: 4,
  });
}

// огненный горшок Факира: летит по дуге, как снаряд катапульты, но бьёт врагов и оставляет огонь
function spawnFirebomb(from, tx, ty, w) {
  state.projectiles.push({
    kind: 'firebomb', team: 'ally', r: 5,
    sx: from.x, sy: from.y, x: from.x, y: from.y,
    tx, ty, t: 0, flight: w.flight,
    dmg: w.dmg, edgeDmg: w.edgeDmg, blast: w.radius,
    fireRadius: w.fireRadius, fireLife: w.fireLife, fireLight: w.fireLight, burnDps: w.burnDps,
  });
}

function explodeFirebomb(p) {
  blast({ x: p.tx, y: p.ty }, p.blast, p.dmg, state.enemies.filter(isSpotted), undefined, p.edgeDmg);
  state.fires.push({ x: p.tx, y: p.ty, r: p.fireRadius, life: p.fireLife, light: p.fireLight, burnDps: p.burnDps, t: 0 });
}

// щиты цепочки: первый, кто останавливает вражеский снаряд, гасит его
function blockedByShield(p) {
  for (const u of state.party) {
    for (const w of activeWeapons(u)) {
      const def = weapons[w.type];
      if (def.block && def.block(u, w, p)) {
        state.effects.push({ type: 'ring', x: p.x, y: p.y, r: 12, life: 0.2, color: COLORS.shield });
        return true;
      }
    }
  }
  return false;
}

function explodeMortar(p) {
  blast({ x: p.tx, y: p.ty }, p.blast, p.dmg, chainUnits().concat(state.downed), undefined, p.edgeDmg);
}

function updateProjectiles(dt) {
  const chain = chainUnits();
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const p = state.projectiles[i];

    // снаряд катапульты и горшок Факира летят поверх стен и взрываются в точке прицеливания
    if (p.kind === 'mortar' || p.kind === 'firebomb') {
      p.t += dt;
      const k = Math.min(1, p.t / p.flight);
      p.x = p.sx + (p.tx - p.sx) * k;
      p.y = p.sy + (p.ty - p.sy) * k;
      if (k >= 1) {
        if (p.kind === 'mortar') explodeMortar(p); else explodeFirebomb(p);
        state.projectiles.splice(i, 1);
      }
      continue;
    }

    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    let dead = p.life <= 0;

    if (!dead) {
      for (const rect of world.sightBlockers) {
        if (circleRectOverlap(p.x, p.y, p.r, rect)) { dead = true; break; }
      }
    }
    if (!dead && p.team === 'enemy' && blockedByShield(p)) dead = true;
    if (!dead) {
      const targets = p.team === 'ally' ? state.enemies : chain;
      for (const t of targets) {
        if (dist(p, t) >= p.r + t.r) continue;
        damageUnit(t, p.dmg);
        // игрока гарпун только ранит, а вот союзника уносит к Скорпиону
        if (p.kind === 'hook' && t.kind === 'ally' && t.hp > 0) hookAlly(t, p.owner);
        dead = true;
        break;
      }
    }
    if (dead) state.projectiles.splice(i, 1);
  }
}

// --- среда ---

// шипы колют всех, кто движется по ним; стоящего на месте не трогают
function applySpikes(dt) {
  const victims = chainUnits().concat(state.downed, state.enemies);
  for (const u of victims) {
    const moved = u.spikeX === undefined || Math.hypot(u.x - u.spikeX, u.y - u.spikeY) > CONFIG.SPIKES.moveSpeed * dt;
    u.spikeX = u.x; u.spikeY = u.y;
    if (!standsOnSpikes(u)) { u.spikeCd = 0; continue; }
    if (!moved) continue;
    u.spikeCd = (u.spikeCd || 0) - dt;
    if (u.spikeCd <= 0) {
      u.spikeCd = CONFIG.SPIKES.interval;
      damageUnit(u, CONFIG.SPIKES.damage);
    }
  }
}

// вонючее облако висит на месте и травит только цепочку — своих оно не задевает
function updateClouds(dt) {
  const cfg = enemyTypes.zombie.stats;
  const victims = chainUnits().concat(state.downed);
  for (let i = state.clouds.length - 1; i >= 0; i--) {
    const c = state.clouds[i];
    c.t += dt;
    c.life -= dt;
    if (c.life <= 0) { state.clouds.splice(i, 1); continue; }
    c.cur = c.r * (0.35 + 0.65 * Math.min(1, c.t / cfg.cloudGrow));
    for (const u of victims) {
      if (dist(c, u) < c.cur + u.r) damageUnit(u, cfg.cloudDps * dt);
    }
  }
}

// огонь на земле: гаснет по времени; урон горения — только если он задан (по умолчанию огонь лишь светит)
function updateFires(dt) {
  for (let i = state.fires.length - 1; i >= 0; i--) {
    const f = state.fires[i];
    f.t += dt;
    f.life -= dt;
    if (f.life <= 0) { state.fires.splice(i, 1); continue; }
    if (!f.burnDps) continue;
    for (const e of state.enemies.slice()) {
      if (isSpotted(e) && dist(f, e) < f.r + e.r) damageUnit(e, f.burnDps * dt);
    }
  }
}

function updateEffects(dt) {
  for (let i = state.effects.length - 1; i >= 0; i--) {
    state.effects[i].life -= dt;
    if (state.effects[i].life <= 0) state.effects.splice(i, 1);
  }
}

G.combat = {
  nearestTarget, damageUnit,
  spawnProjectile, spawnMortar, spawnHook, spawnFirebomb,
  blast, updateProjectiles, applySpikes, updateClouds, updateFires, updateEffects,
};
})(window.Game = window.Game || {});
