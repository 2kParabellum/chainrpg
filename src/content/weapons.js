// Реестр оружий и умений. Одна запись = одно оружие: стартовые характеристики и поведение.
// Базовое оружие задаёт запись союзника (content/allies.js), оружие способности — запись
// подиума (content/abilities.js); обе при необходимости переопределяют числа.
//
// Поля записи:
//   stats   — характеристики; юнит получает их личной копией вместе со своей перезарядкой (w.cd,
//             сначала случайной; readyAtStart — сразу готово)
//   update  — (u, w, dt, game): действие за кадр; u — носитель, w — его личная копия оружия
//   draw    — (u, w, g): необязательно; рисует оружие поверх тела (g — примитивы из render/shapes.js)
// Всё, что нужно от игры, запись получает параметром game и никогда не подключает game/ сама.
(function (G) {
'use strict';

const { COLORS } = G;
const { dist } = G.math;

// перезарядка: true, когда оружие готово действовать
function ready(w, dt) {
  w.cd = Math.max(0, w.cd - dt);
  return w.cd === 0;
}

// ближний удар по одной цели: ближайший враг вплотную, которого можно бить вблизи (game.meleeHittable)
function meleeUpdate(u, w, dt, game) {
  if (!ready(w, dt)) return;
  let foe = null, best = Infinity;
  for (const e of game.state.enemies) {
    if (!game.meleeHittable(e)) continue;
    const gap = dist(u, e) - u.r - e.r;
    if (gap <= w.reach && gap < best) { best = gap; foe = e; }
  }
  if (!foe) return;
  u.facing = Math.atan2(foe.y - u.y, foe.x - u.x);
  game.damageUnit(foe, w.dmg * (u.dmgMul || 1));
  w.cd = w.cooldown;
  game.state.effects.push({ type: 'beam', x1: u.x, y1: u.y, x2: foe.x, y2: foe.y, life: 0.12, color: w.color });
}

// дальний выстрел: ближайший обнаруженный враг в пределах дальности оружия и на прямой видимости
function shootUpdate(fire) {
  return function (u, w, dt, game) {
    if (!ready(w, dt)) return;
    const foe = game.nearestTarget(u, game.state.targetableEnemies, w.range);
    if (!foe) return;
    u.facing = Math.atan2(foe.y - u.y, foe.x - u.x);
    fire(u, w, foe, game);
    w.cd = w.cooldown;
  };
}

// усиление «сила» пробивает выстрелом щит (босса, турели) насквозь (см. game/combat.js)
const arrow = (u, w, foe, game) => game.spawnProjectile(u, foe.x, foe.y, w.projSpeed, w.dmg * (u.dmgMul || 1),
  'ally', w.projRadius, { pierceShield: !!(u.buffs && u.buffs.power > 0) });

const sword = {
  stats: { reach: 30, dmg: 15.4, cooldown: 1.0, color: COLORS.hero },
  update: meleeUpdate,
};

const fist = {
  stats: { reach: 26, dmg: 11.5, cooldown: 0.9, color: COLORS.buddy },
  update: meleeUpdate,
};

// копьё: редкий сильный удар по всем обнаруженным врагам в зоне удара; без целей не тратит перезарядку.
// На ходу (в цепочке) — две небольшие зоны по бокам, поперёк движения, плюс вплотную со всех сторон (closeReach),
// чтобы подошедший спереди или сзади тоже получил. Стоя на месте и выбитым — круг вокруг себя (aroundReach)
const spear = {
  stats: { dmg: 32, cooldown: 2.0, zoneDist: 30, zoneRadius: 24, closeReach: 14, aroundReach: 40, color: COLORS.spear },
  update(u, w, dt, game) {
    if (!ready(w, dt)) return;
    const gap = (e) => dist(u, e) - u.r - e.r;
    const moving = u.kind !== 'downed' && Math.hypot(u.vx, u.vy) > 5;
    let zones = [], inZone;
    if (moving) {
      const dir = Math.atan2(u.vy, u.vx);
      zones = [1, -1].map((side) => ({
        x: u.x + Math.cos(dir + side * Math.PI / 2) * (u.r + w.zoneDist),
        y: u.y + Math.sin(dir + side * Math.PI / 2) * (u.r + w.zoneDist),
      }));
      inZone = (e) => gap(e) <= w.closeReach || zones.some((z) => dist(z, e) < w.zoneRadius + e.r);
    } else {
      inZone = (e) => gap(e) <= w.aroundReach;
    }
    const hit = game.state.enemies.filter((e) => game.meleeHittable(e) && inZone(e));
    if (!hit.length) return;
    for (const e of hit) game.damageUnit(e, w.dmg * (u.dmgMul || 1));
    w.cd = w.cooldown;
    // заметный удар: на ходу — выпад копья из тела в каждую боковую зону, стоя — круговой взмах (см. render)
    const fx = (x, y, r, from) => game.state.effects.push({ type: 'spearHit', x, y, r, from, life: 0.4, maxLife: 0.4, color: w.color });
    if (moving) for (const z of zones) fx(z.x, z.y, w.zoneRadius, { x: u.x, y: u.y });
    else fx(u.x, u.y, u.r + w.aroundReach, null);
  },
};

// искра: молния средней дальности. Заметив врага в пределах range, целится aimTime секунд, затем бьёт
// молнией, которая держится на цели и жжёт её непрерывно (dps в секунду). Чем цель ближе, тем больнее:
// ближе fullRange — полный урон, к краю дальности падает до farMul и дальше не меняется. Цель ушла
// дальше breakMul·range или погибла — молния рвётся, искра ищет новую цель и снова целится.
// Щит босса молнию не гасит, но босс всегда получает от неё только bossMul урона (с «силой» или без).
// Разгон: каждая полная секунда непрерывного удара по одной цели прибавляет rampStep базового урона
// (через 1 с — 120%, через 2 с — 140% …); новая цель или разрыв молнии сбрасывают разгон
const spark = {
  stats: { range: 230, fullRange: 110, farMul: 0.5, breakMul: 1.25, aimTime: 1.2, dps: 31.2, bossMul: 0.3,
           rampStep: 0.2, color: COLORS.spark },
  update(u, w, dt, game) {
    const t = w.target;
    if (t && (!game.state.enemies.includes(t) || dist(u, t) > w.range * w.breakMul)) w.target = null;
    if (!w.target) {
      const foe = game.nearestTarget(u, game.state.targetableEnemies, w.range);
      if (!foe) return;
      w.target = foe;
      w.aim = w.aimTime;
      w.held = 0;
    }
    const foe = w.target;
    u.facing = Math.atan2(foe.y - u.y, foe.x - u.x);
    if (w.aim > 0) { w.aim -= dt; return; }

    const k = Math.min(1, Math.max(0, (dist(u, foe) - w.fullRange) / (w.range - w.fullRange)));
    const bossMul = foe.type === 'boss' ? w.bossMul : 1;
    const ramp = 1 + w.rampStep * Math.floor(w.held);
    w.held += dt;
    game.damageUnit(foe, w.dps * ramp * (1 - (1 - w.farMul) * k) * (u.dmgMul || 1) * bossMul * dt);
  },
  // прицел — пунктир, который разгорается к выстрелу; молния — ломаная, каждый кадр новая
  draw(u, w, g) {
    const foe = w.target;
    if (!foe) return;
    const { ctx } = g;
    const dx = foe.x - u.x, dy = foe.y - u.y;
    const d = Math.hypot(dx, dy) || 1;
    if (w.aim > 0) {
      ctx.globalAlpha = 0.2 + 0.6 * (1 - w.aim / w.aimTime);
      ctx.strokeStyle = w.color;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(u.x, u.y);
      ctx.lineTo(foe.x, foe.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(foe.x, foe.y, foe.r + 4 + 10 * (w.aim / w.aimTime), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }
    const nx = -dy / d, ny = dx / d;
    const n = Math.max(3, Math.round(d / 18));
    const pts = [[u.x, u.y]];
    for (let i = 1; i < n; i++) {
      const j = (Math.random() - 0.5) * 14;
      pts.push([u.x + (dx * i) / n + nx * j, u.y + (dy * i) / n + ny * j]);
    }
    pts.push([foe.x, foe.y]);
    // чем дольше держится молния (чем сильнее разогналась), тем она толще
    const thick = Math.min(2.2, 1 + 0.25 * Math.floor(w.held || 0));
    for (const [width, color, alpha] of [[5 * thick, w.color, 0.35], [1.6 * thick, '#eef4ff', 0.95]]) {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
};

const bow = {
  stats: { range: 300, dmg: 8.05, cooldown: 1.0, projSpeed: 560, projRadius: 4 },
  update: shootUpdate(arrow),
};

// активное лечение: раз в перезарядку лечит того, у кого ниже всего доля HP
const heal = {
  stats: { range: 220, cooldown: 2.0, heal: 9.6 },
  update(u, w, dt, game) {
    if (!ready(w, dt)) return;
    let worst = null;
    // лечит и цепочку, и выбитых союзников, которые лежат рядом
    for (const m of game.chainUnits().concat(game.state.downed)) {
      if (m.hp >= m.maxHp) continue;
      if (dist(u, m) > w.range) continue;
      if (!worst || m.hp / m.maxHp < worst.hp / worst.maxHp) worst = m;
    }
    if (!worst) return;
    worst.hp = Math.min(worst.maxHp, worst.hp + w.heal);
    w.cd = w.cooldown;
    u.facing = Math.atan2(worst.y - u.y, worst.x - u.x);
    game.state.effects.push({ type: 'beam', x1: u.x, y1: u.y, x2: worst.x, y2: worst.y, life: 0.25, color: COLORS.medic });
  },
};

G.weapons = { sword, fist, spear, spark, bow, heal };
})(window.Game = window.Game || {});
