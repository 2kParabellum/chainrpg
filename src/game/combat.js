// Бой: всё, что наносит урон, — снаряды, взрывы, облака, шипы, смерть юнита.
(function (G) {
'use strict';

const { CONFIG, COLORS, state } = G;
const { dist, removeFrom } = G.math;
const { circleRectOverlap, distToSegment } = G.collision;
const { world, hasLineOfSight, standsOnSpikes } = G.world;
const { chainUnits, enemyTargets, upgrade } = G.session;
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

// улучшения копейщика против ближних атак врага (hit.melee, hit.by — кто бьёт): «шипастая броня» — копейщик
// возвращает напавшему весь урон; «прикрытие» — звено прямо перед копейщиком в цепочке получает меньше.
// Шипы считаются от урона до прикрытия. Возвращает урон, который дойдёт до цели
function meleeDefense(u, dmg, hit) {
  if (u.ability === 'spear' && hit.by && state.enemies.includes(hit.by) && upgrade('spikedArmor')) {
    damageUnit(hit.by, dmg);
    state.effects.push({ type: 'beam', x1: u.x, y1: u.y, x2: hit.by.x, y2: hit.by.y, life: 0.2, color: COLORS.spiky });
  }
  const c = upgrade('cover');
  if (c && u.kind === 'ally') {
    const behind = state.party[state.party.indexOf(u) + 1];
    if (behind && behind.ability === 'spear') {
      dmg *= 1 - c.cut;
      state.effects.push({ type: 'ring', x: u.x, y: u.y, r: u.r + 5, life: 0.2, color: COLORS.sturdy });
    }
  }
  return dmg;
}

// hit — необязательно, откуда урон: { by: враг, melee: true } для ближних атак (укус, таран)
function damageUnit(u, dmg, hit) {
  if (u.hp <= 0) return;
  if (state.leaving && u.kind === 'ally') return; // цепочка уже уходит в портал выхода
  if (hit && hit.melee && (u.kind === 'ally' || u.kind === 'downed')) dmg = meleeDefense(u, dmg, hit);
  u.hp -= dmg;
  u.regenTimer = 0;
  if (u.hp <= 0) {
    // усиление «воля»: смертельный урон не убивает союзника (в цепочке или выбитого), он остаётся с 1 HP
    if ((u.kind === 'ally' || u.kind === 'downed') && Object.keys(u.buffs).some((k) => u.buffs[k] > 0 && G.buffs[k].revive)) { u.hp = 1; return; }
    if (u.kind === 'base') { state.status = 'dead'; return; } // разрушена база — поражение
    if (u.kind === 'ally') {
      // гибель Героя — конец партии; его тело остаётся в цепочке, чтобы сцена и камера не остались без ведущего
      if (allyTypes[u.type].anchor) { state.status = 'dead'; return; }
      removeFrom(state.party, u);
    }
    else if (u.kind === 'enemy') {
      removeFrom(state.enemies, u);
      // гибель всегда видна: большая вспышка у громадин (deathFlash), у остальных — короткое кольцо
      const flash = enemyTypes[u.type].deathFlash;
      if (flash) state.effects.push({ type: 'blast', x: u.x, y: u.y, r: flash, life: 0.35 });
      else state.effects.push({ type: 'ring', x: u.x, y: u.y, r: u.r + 8, life: 0.35, color: COLORS.enemyShot });
    }
    else if (u.kind === 'downed') removeFrom(state.downed, u);
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
  // вражеские выстрелы бьют и цепочку, и выбитых союзников (те дерутся и их добивают), и базу
  const allies = enemyTargets();
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
    // сквозной снаряд (ядро пушки-ловушки) не гаснет о цели: проходит насквозь и бьёт каждого
    // один раз — и звенья цепочки, и лежачих
    if (!dead && p.pierce) {
      for (const t of chain.concat(state.downed)) {
        if (p.hit.includes(t) || dist(p, t) >= p.r + t.r) continue;
        p.hit.push(t);
        damageUnit(t, p.dmg);
      }
    } else if (!dead) {
      const targets = p.team === 'ally' ? state.enemies : allies;
      for (const t of targets) {
        if (dist(p, t) >= p.r + t.r) continue;
        // щит (босса, турели) гасит выстрелы, пока активен; усиление «сила» пробивает его насквозь
        if (t.shielded && !p.pierceShield) {
          state.effects.push({ type: 'ring', x: t.x, y: t.y, r: t.r + 6, life: 0.2, color: COLORS.shield });
        } else {
          damageUnit(t, p.dmg);
          // огненная стрела поджигает: повторное попадание горение обновляет, не складывает
          if (p.burn && t.kind === 'enemy' && t.hp > 0) {
            t.burn = { left: p.burn.time, dps: Math.max(p.burn.dps, t.burn && t.burn.left > 0 ? t.burn.dps : 0) };
          }
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

// горение врагов (огненные стрелы): урон в секунду, пока не догорит
function updateBurns(dt) {
  for (const e of state.enemies.slice()) {
    const b = e.burn;
    if (!b || b.left <= 0) continue;
    b.left -= dt;
    damageUnit(e, b.dps * dt);
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

// вонючее облако висит на месте и травит только союзников (и базу) — своих оно не задевает
function updateClouds(dt) {
  const cfg = enemyTypes.zombie.stats;
  const victims = enemyTargets();
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

// стенка огня: жжёт всех, кто её касается. growing — пока true, жизнь не убывает и урон уже идёт
// (так луч босса прожигает свою линию по мере роста), а когда growing снимают — начинается 10-секундный
// отсчёт «дожигания» на месте. Возвращает созданный объект: вызывающий сам обновляет его x2/y2 по кадрам
function spawnFirewall(x1, y1, x2, y2, radius, dps, life, growing) {
  const f = { x1, y1, x2, y2, r: radius, dps, life, maxLife: life, growing: !!growing };
  state.firewalls.push(f);
  return f;
}

// стенки огня наносят урон всем, кто их касается, пока не прогорят
function applyFirewalls(dt) {
  const victims = chainUnits().concat(state.downed);
  for (let i = state.firewalls.length - 1; i >= 0; i--) {
    const f = state.firewalls[i];
    if (!f.growing) f.life -= dt;
    if (f.life <= 0) { state.firewalls.splice(i, 1); continue; }
    for (const u of victims) {
      if (distToSegment(u.x, u.y, f.x1, f.y1, f.x2, f.y2) < f.r + u.r) damageUnit(u, f.dps * dt);
    }
  }
}

// неуязвимая пушка-ловушка: не враг и не цель ни для кого, просто по таймеру стреляет строго
// по прямой в заданном направлении. Ядро медленное (чуть быстрее Героя) и большое, от него можно
// увернуться; оно проходит сквозь всех, кого задело (каждого ранит один раз), и гаснет только
// о стену, колонну или закрытую дверь. Перед выстрелом короткий предупреждающий луч
function updateCannons(dt) {
  const cannons = world.cannons;
  for (let i = 0; i < cannons.length; i++) {
    const c = cannons[i], s = state.cannons[i];
    if (s.telegraph > 0) {
      s.telegraph -= dt;
      if (s.telegraph <= 0) {
        const tx = c.x + Math.cos(c.angle) * 4000, ty = c.y + Math.sin(c.angle) * 4000;
        spawnProjectile(c, tx, ty, c.speed, c.dmg, 'enemy', c.radius,
          { kind: 'cannon', pierce: true, hit: [], life: 60 });
        s.cd = c.interval;
      }
      continue;
    }
    s.cd -= dt;
    if (s.cd <= 0) {
      s.telegraph = c.windup;
      const tx = c.x + Math.cos(c.angle) * 4000, ty = c.y + Math.sin(c.angle) * 4000;
      state.effects.push({ type: 'beam', x1: c.x, y1: c.y, x2: tx, y2: ty, life: c.windup, color: COLORS.enemyShot });
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
  spawnFirewall, applyFirewalls, updateCannons,
  blast, updateProjectiles, updateBurns, applySpikes, updateClouds, updateEffects,
};
})(window.Game = window.Game || {});
