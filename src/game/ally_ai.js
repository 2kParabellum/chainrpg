// ВРЕМЕННЫЙ файл (этап 1): поведение союзников по типам, перенесено как есть.
// На этапе 2 каждая ветка переедет в запись своего типа в content/allies.js, а файл исчезнет.
(function (G) {
'use strict';

const { COLORS, state } = G;
const { dist, spreadAngle } = G.math;
const { chainUnits } = G.session;
const { followChain, attackRateMul } = G.chain;
const { damageUnit, nearestTarget, spawnProjectile } = G.combat;

function updateAlly(a, dt, i) {
  followChain(a, dt, i);

  if (a.type === 'booster') return; // сам не бьёт и не лечит, только усиливает соседей

  a.cd -= dt;
  if (a.cd > 0) return;
  const rate = attackRateMul(i);

  // лезвия по бокам рубят всех, кто оказался вплотную, — светить фонарём для этого не надо
  if (a.type === 'cutter') {
    let cut = false;
    for (const e of state.enemies.slice()) {
      if (e.type === 'mine' && !e.revealed) continue;
      if (dist(a, e) > a.cfg.reach + e.r) continue;
      damageUnit(e, a.cfg.dmg);
      cut = true;
    }
    if (cut) {
      a.cd = a.cfg.cooldown / rate;
      state.effects.push({ type: 'ring', x: a.x, y: a.y, r: a.cfg.reach, life: 0.16, color: COLORS.cutter });
    }
    return;
  }

  if (a.type === 'medic') {
    let worst = null;
    for (const u of chainUnits()) {
      if (u.hp >= u.maxHp) continue;
      if (dist(a, u) > a.cfg.range) continue;
      if (!worst || u.hp / u.maxHp < worst.hp / worst.maxHp) worst = u;
    }
    if (worst) {
      worst.hp = Math.min(worst.maxHp, worst.hp + a.cfg.heal);
      a.cd = a.cfg.cooldown / rate;
      a.facing = Math.atan2(worst.y - a.y, worst.x - a.x);
      state.effects.push({ type: 'beam', x1: a.x, y1: a.y, x2: worst.x, y2: worst.y, life: 0.25, color: COLORS.medic });
    }
    return;
  }

  // стрелять можно только по тому, что освещает фонарь игрока
  const foe = nearestTarget(a, state.visibleEnemies, a.cfg.range);
  if (!foe) return;
  a.facing = Math.atan2(foe.y - a.y, foe.x - a.x);
  if (a.type === 'shotgun') {
    for (let p = 0; p < a.cfg.pellets; p++) {
      const ang = a.facing + spreadAngle(p, a.cfg.pellets, a.cfg.spread);
      spawnProjectile(a, a.x + Math.cos(ang) * 100, a.y + Math.sin(ang) * 100,
        a.cfg.projSpeed, a.cfg.dmg, 'ally', a.cfg.projRadius);
    }
  } else {
    spawnProjectile(a, foe.x, foe.y, a.cfg.projSpeed, a.cfg.dmg, 'ally', a.cfg.projRadius);
  }
  a.cd = a.cfg.cooldown / rate;
}

G.allyAi = { updateAlly };
})(window.Game = window.Game || {});
