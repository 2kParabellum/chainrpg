// Бой: всё, что наносит урон, — снаряды, взрывы, облака, шипы, мины, смерть юнита.
(function (G) {
'use strict';

const { CONFIG, state } = G;
const { dist, removeFrom } = G.math;
const { circleRectOverlap } = G.collision;
const { world, hasLineOfSight, standsOnSpikes } = G.world;
const { chainUnits } = G.session;
const { hookAlly } = G.chain;

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
    if (u.kind === 'player') state.status = 'dead';
    else if (u.kind === 'ally') removeFrom(state.allies, u);
    else if (u.kind === 'enemy') removeFrom(state.enemies, u);
    else if (u.kind === 'neutral') removeFrom(state.neutrals, u);
  }
}

// урон по площади: центр взрыва, радиус, урон и список тех, кого он может задеть;
// вспышка рисуется в fxAt (по умолчанию — в центре)
function blast(center, radius, dmg, victims, fxAt = center) {
  state.effects.push({ type: 'blast', x: fxAt.x, y: fxAt.y, r: radius, life: 0.35 });
  for (const u of victims) {
    if (dist(center, u) < radius + u.r) damageUnit(u, dmg);
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
    dmg: from.cfg.dmg, blast: from.cfg.blastRadius,
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

function explodeMortar(p) {
  blast(p, p.blast, p.dmg, chainUnits().concat(state.downed), { x: p.tx, y: p.ty });
}

function updateProjectiles(dt) {
  const chain = chainUnits();
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const p = state.projectiles[i];

    // снаряд катапульты летит поверх стен и взрывается в точке прицеливания
    if (p.kind === 'mortar') {
      p.t += dt;
      const k = Math.min(1, p.t / p.flight);
      p.x = p.sx + (p.tx - p.sx) * k;
      p.y = p.sy + (p.ty - p.sy) * k;
      if (k >= 1) { explodeMortar(p); state.projectiles.splice(i, 1); }
      continue;
    }

    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    let dead = p.life <= 0;

    if (!dead) {
      for (const rect of world.sightBlockers) {
        if (circleRectOverlap(p.x, p.y, p.r, rect)) { dead = true; break; }
      }
    }
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

// --- мины ---

// мины: обнаруживаются вблизи, взрываются под ногами цепочки, простреливаются союзниками
function updateMines() {
  const chain = chainUnits();
  for (const m of state.enemies.slice()) {
    if (m.type !== 'mine') continue;
    for (const u of chain) {
      const d = dist(m, u);
      if (d < m.cfg.detectRadius) m.revealed = true;
      if (d < m.cfg.triggerRadius + u.r) { explodeMine(m); break; }
    }
  }
}

function explodeMine(m) {
  removeFrom(state.enemies, m);
  blast(m, m.cfg.blastRadius, m.cfg.dmg, chainUnits().concat(state.downed, state.enemies));
}

// --- среда ---

// шипы колют всех подряд, пока с них не сойдут
function applySpikes(dt) {
  const victims = chainUnits().concat(state.downed, state.enemies);
  for (const u of victims) {
    if (!standsOnSpikes(u)) { u.spikeCd = 0; continue; }
    u.spikeCd = (u.spikeCd || 0) - dt;
    if (u.spikeCd <= 0) {
      u.spikeCd = CONFIG.SPIKES.interval;
      damageUnit(u, CONFIG.SPIKES.damage);
    }
  }
}

// вонючее облако висит на месте и травит только цепочку — своих оно не задевает
function updateClouds(dt) {
  const cfg = CONFIG.ENEMIES.zombie;
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

function updateEffects(dt) {
  for (let i = state.effects.length - 1; i >= 0; i--) {
    state.effects[i].life -= dt;
    if (state.effects[i].life <= 0) state.effects.splice(i, 1);
  }
}

G.combat = {
  nearestTarget, damageUnit,
  spawnProjectile, spawnMortar, spawnHook,
  updateProjectiles, updateMines, applySpikes, updateClouds, updateEffects,
};
})(window.Game = window.Game || {});
