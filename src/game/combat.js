// Бой: всё, что наносит урон, — снаряды, взрывы, облака, шипы, смерть юнита.
(function (G) {
'use strict';

const { CONFIG, COLORS, state } = G;
const { dist, removeFrom } = G.math;
const { circleRectOverlap, distToSegment } = G.collision;
const { world, hasLineOfSight, standsOnSpikes } = G.world;
const { chainUnits } = G.session;
const { hookAlly, knockOutAlly } = G.chain;
const { allyTypes, enemyTypes } = G;

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
      // усиление «воля»: смертельный урон не убивает, звено остаётся с 1 HP
      if (u.buffs && Object.keys(u.buffs).some((k) => u.buffs[k] > 0 && G.buffs[k].revive)) { u.hp = 1; return; }
      // гибель Героя — конец партии; его тело остаётся в цепочке, чтобы сцена и камера не остались без ведущего
      if (allyTypes[u.type].anchor) { state.status = 'dead'; return; }
      removeFrom(state.party, u);
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

// extra — необязательные дополнительные поля снаряда (например, pierceShield — пробивает щит босса)
function spawnProjectile(from, tx, ty, speed, dmg, team, radius, extra) {
  const a = Math.atan2(ty - from.y, tx - from.x);
  state.projectiles.push({
    x: from.x, y: from.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
    dmg, team, r: radius, life: 3, ...extra,
  });
}

// навесной снаряд катапульты: летит по дуге в точку, где цель была в момент выстрела.
// stats — необязательное переопределение урона/радиуса/времени полёта (иначе берутся из from.cfg);
// так им может стрелять не только сама катапульта, но и другая атака с иными числами (босс)
function spawnMortar(from, tx, ty, stats) {
  const s = stats || from.cfg;
  state.projectiles.push({
    kind: 'mortar', team: 'enemy', r: 5,
    sx: from.x, sy: from.y, x: from.x, y: from.y,
    tx, ty, t: 0, flight: s.flightTime,
    dmg: s.dmg, edgeDmg: s.edgeDmg, blast: s.blastRadius,
  });
}

// огромный навесной снаряд босса: как обычный, но при попадании выбивает задетых союзников
// из цепочки (см. explodeBigMortar), а не просто ранит
function spawnBigMortar(from, tx, ty, stats) {
  const s = stats || from.cfg;
  state.projectiles.push({
    kind: 'bigMortar', team: 'enemy', r: 9, color: COLORS.bossGlow,
    sx: from.x, sy: from.y, x: from.x, y: from.y,
    tx, ty, t: 0, flight: s.flightTime,
    dmg: s.dmg, edgeDmg: s.edgeDmg, blast: s.blastRadius, knockback: s.knockback,
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
  blast({ x: p.tx, y: p.ty }, p.blast, p.dmg, chainUnits().concat(state.downed), undefined, p.edgeDmg);
}

// взрыв большого снаряда босса: тот же урон по площади, что и у обычного, но каждого задетого
// и выжившего союзника ещё и вышибает из цепочки — как таран бычка, только без шанса, всегда
function explodeBigMortar(p) {
  const center = { x: p.tx, y: p.ty };
  state.effects.push({ type: 'blast', x: center.x, y: center.y, r: p.blast, life: 0.5 });
  for (const u of chainUnits().concat(state.downed)) {
    const d = dist(center, u);
    if (d >= p.blast + u.r) continue;
    damageUnit(u, p.dmg + (p.edgeDmg - p.dmg) * Math.min(1, d / p.blast));
    if (u.kind === 'ally' && u.hp > 0) {
      const angle = d > 1 ? Math.atan2(u.y - center.y, u.x - center.x) : Math.random() * Math.PI * 2;
      knockOutAlly(u, angle, p.knockback);
    }
  }
}

function updateProjectiles(dt) {
  const chain = chainUnits();
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const p = state.projectiles[i];

    // снаряд катапульты (и большой снаряд босса) летит поверх стен и взрывается в точке прицеливания
    if (p.kind === 'mortar' || p.kind === 'bigMortar') {
      p.t += dt;
      const k = Math.min(1, p.t / p.flight);
      p.x = p.sx + (p.tx - p.sx) * k;
      p.y = p.sy + (p.ty - p.sy) * k;
      if (k >= 1) {
        if (p.kind === 'bigMortar') explodeBigMortar(p); else explodeMortar(p);
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
    if (!dead) {
      const targets = p.team === 'ally' ? state.enemies : chain;
      for (const t of targets) {
        if (dist(p, t) >= p.r + t.r) continue;
        // щит босса гасит выстрелы, пока активен; усиление «сила» пробивает его насквозь
        if (t.type === 'boss' && t.shielded && !p.pierceShield) {
          state.effects.push({ type: 'ring', x: t.x, y: t.y, r: t.r + 6, life: 0.2, color: COLORS.shield });
        } else {
          damageUnit(t, p.dmg);
        }
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

// луч босса: мгновенно ранит всех, кто в момент выстрела оказался на линии
function beamHit(x1, y1, x2, y2, radius, dmg, victims) {
  for (const u of victims) {
    if (distToSegment(u.x, u.y, x1, y1, x2, y2) < radius + u.r) damageUnit(u, dmg);
  }
}

// стенка огня, которую луч босса оставляет после себя: горит life секунд, дальше решает applyFirewalls
function spawnFirewall(x1, y1, x2, y2, radius, dps, life) {
  state.firewalls.push({ x1, y1, x2, y2, r: radius, dps, life, maxLife: life });
}

// стенки огня наносят урон всем, кто их касается, пока не прогорят
function applyFirewalls(dt) {
  const victims = chainUnits().concat(state.downed);
  for (let i = state.firewalls.length - 1; i >= 0; i--) {
    const f = state.firewalls[i];
    f.life -= dt;
    if (f.life <= 0) { state.firewalls.splice(i, 1); continue; }
    for (const u of victims) {
      if (distToSegment(u.x, u.y, f.x1, f.y1, f.x2, f.y2) < f.r + u.r) damageUnit(u, f.dps * dt);
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
  spawnProjectile, spawnMortar, spawnBigMortar, spawnHook,
  beamHit, spawnFirewall, applyFirewalls,
  blast, updateProjectiles, applySpikes, updateClouds, updateEffects,
};
})(window.Game = window.Game || {});
