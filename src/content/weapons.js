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

// стрела. Улучшения стрелка: «тройной выстрел» — каждый every-й выстрел ещё два снаряда веером (± spread от основного);
// «огненные стрелы» — попадание поджигает цель: за time секунд она теряет share урона стрелы;
// «Piercing Shots» — стрела с шансом passChance летит дальше сквозь врага (см. game/combat.js)
function arrow(u, w, foe, game) {
  const dmg = w.dmg * (u.dmgMul || 1);
  const fire = game.upgrade('fireArrows'), triple = game.upgrade('tripleShot');
  const pierce = game.upgrade('piercing');
  const extra = { burn: fire ? { dps: (dmg * fire.share) / fire.time, time: fire.time } : null };
  if (pierce) extra.passChance = pierce.chance;
  w.shots = (w.shots || 0) + 1;
  const spread = triple && w.shots % triple.every === 0 ? [0, -triple.spread, triple.spread] : [0];
  const base = Math.atan2(foe.y - u.y, foe.x - u.x);
  for (const a of spread) {
    game.spawnProjectile(u, u.x + Math.cos(base + a) * 100, u.y + Math.sin(base + a) * 100, w.projSpeed, dmg,
      'ally', w.projRadius, extra);
  }
}

const fist = {
  stats: { reach: 26, dmg: 11.5, cooldown: 0.9, color: COLORS.buddy },
  update: meleeUpdate,
};

// копьё: редкий сильный удар по всем обнаруженным врагам в зоне удара; без целей не тратит перезарядку.
// Бьёт в одну сторону — туда, где ближайший враг, до которого достаёт (улучшение «Double Edge» — в обе стороны).
// На ходу (в цепочке) — небольшая зона сбоку, поперёк движения, плюс вплотную (closeReach) с той же стороны, чтобы
// подошедший спереди или сзади тоже получил. Стоя на месте и выбитым — полукруг вокруг себя (aroundReach) в сторону
// врага (с «Double Edge» — круг). «Berserk» — урон растёт с потерей HP копейщика
const spear = {
  stats: { dmg: 27.6, cooldown: 1.33, zoneDist: 30, zoneRadius: 24, closeReach: 14, aroundReach: 40, color: COLORS.spear },
  update(u, w, dt, game) {
    if (!ready(w, dt)) return;
    const both = !!game.upgrade('doubleEdge');
    const gap = (e) => dist(u, e) - u.r - e.r;
    const moving = u.kind !== 'downed' && Math.hypot(u.vx, u.vy) > 5;
    const dir = Math.atan2(u.vy, u.vx);
    // на ходу: +1 / −1 — слева или справа от направления хода (знак векторного произведения)
    const sideOf = (e) => (Math.cos(dir) * (e.y - u.y) - Math.sin(dir) * (e.x - u.x) >= 0 ? 1 : -1);
    const zones = {};
    for (const side of [1, -1]) {
      zones[side] = { x: u.x + Math.cos(dir + side * Math.PI / 2) * (u.r + w.zoneDist),
                      y: u.y + Math.sin(dir + side * Math.PI / 2) * (u.r + w.zoneDist) };
    }
    const inZone = moving
      ? (e) => gap(e) <= w.closeReach || [1, -1].some((side) => dist(zones[side], e) < w.zoneRadius + e.r)
      : (e) => gap(e) <= w.aroundReach;
    let hit = game.state.enemies.filter((e) => game.meleeHittable(e) && inZone(e));
    if (!hit.length) return;
    // в одну сторону: туда, где ближайший из достижимых
    const near = hit.reduce((a, b) => (gap(b) < gap(a) ? b : a));
    const toNear = Math.atan2(near.y - u.y, near.x - u.x);
    let sides = [1, -1];
    if (!both && moving) {
      const side = sideOf(near);
      sides = [side];
      hit = hit.filter((e) => sideOf(e) === side && (gap(e) <= w.closeReach || dist(zones[side], e) < w.zoneRadius + e.r));
    } else if (!both) {
      hit = hit.filter((e) => Math.cos(Math.atan2(e.y - u.y, e.x - u.x) - toNear) >= 0);
    }
    const bers = game.upgrade('berserk');
    const rage = bers ? 1 + (bers.maxMul - 1) * Math.max(0, 1 - u.hp / u.maxHp) : 1;
    for (const e of hit) game.damageUnit(e, w.dmg * (u.dmgMul || 1) * rage);
    w.cd = w.cooldown;
    // заметный удар: на ходу — выпад копья из тела в каждую зону удара, стоя — круговой взмах или полукруг (см. render)
    const fx = (x, y, r, from, half) => game.state.effects.push({ type: 'spearHit', x, y, r, from, half, life: 0.4, maxLife: 0.4, color: w.color });
    if (moving) for (const side of sides) fx(zones[side].x, zones[side].y, w.zoneRadius, { x: u.x, y: u.y });
    else fx(u.x, u.y, u.r + w.aroundReach, null, both ? undefined : toNear);
  },
};

// искра: молния средней дальности. Заметив врага в пределах range, целится aimTime секунд, затем бьёт
// молнией, которая держится на цели и жжёт её непрерывно (dps в секунду). Чем цель ближе, тем больнее:
// ближе fullRange — полный урон, к краю дальности падает до farMul и дальше не меняется. Цель ушла
// дальше breakMul·range или погибла — молния рвётся, искра ищет новую цель и снова целится.
// Босс (Демон) получает от молнии только bossMul урона.
// Разгон: каждая полная секунда непрерывного удара по одной цели прибавляет rampStep базового урона
// (через 1 с — 120%, через 2 с — 140% …), но не дольше rampMax секунд (дальше — 180%, не растёт);
// новая цель или разрыв молнии сбрасывают разгон.
// Молний — w.beams ({ target, aim, aimTotal, held }): обычно одна; улучшение «двойное напряжение» — до двух на разных
// целях, «электрическая дуга» — во столько же раз дальше и замечает цель, и рвётся (урон к краю падает, как без неё),
// «Quick Charge» — прицеливание короче в aimMul раз; «Shock» — враг под молнией бьёт слабее (game.shockFoe);
// «Power Grid» — под усилением buff урон больше на per за каждую искру в цепочке
const spark = {
  stats: { range: 230, fullRange: 110, farMul: 0.5, breakMul: 1.25, aimTime: 1.2, dps: 31.2, bossMul: 0.3,
           rampStep: 0.2, rampMax: 4, color: COLORS.spark },
  update(u, w, dt, game) {
    const two = game.upgrade('doubleSpark'), arc = game.upgrade('arc'), quick = game.upgrade('quickCharge');
    const shock = game.upgrade('shock'), grid = game.upgrade('powerGrid');
    const gridMul = grid && u.buffs[grid.buff] > 0 ? 1 + grid.per * game.state.party.filter((a) => a.ability === 'spark').length : 1;
    const reach = w.range * (arc ? arc.rangeMul : 1);
    const aimTime = w.aimTime * (quick ? quick.aimMul : 1);
    const breakDist = reach * w.breakMul;
    w.beams = (w.beams || []).filter((b) => game.state.enemies.includes(b.target) && dist(u, b.target) <= breakDist);
    while (w.beams.length < (two ? two.targets : 1)) {
      const taken = w.beams.map((b) => b.target);
      const free = game.state.targetableEnemies.filter((e) => !taken.includes(e));
      const foe = game.nearestTarget(u, free, reach);
      if (!foe) break;
      w.beams.push({ target: foe, aim: aimTime, aimTotal: aimTime, held: 0 });
    }
    if (!w.beams.length) return;
    u.facing = Math.atan2(w.beams[0].target.y - u.y, w.beams[0].target.x - u.x);
    for (const b of w.beams) {
      if (b.aim > 0) { b.aim -= dt; continue; }
      const foe = b.target;
      const k = Math.min(1, Math.max(0, (dist(u, foe) - w.fullRange) / (w.range - w.fullRange)));
      const bossMul = foe.type === 'boss' ? w.bossMul : 1;
      const ramp = 1 + w.rampStep * Math.min(w.rampMax, Math.floor(b.held));
      b.held += dt;
      if (shock) game.shockFoe(foe);
      game.damageUnit(foe, w.dps * ramp * (1 - (1 - w.farMul) * k) * (u.dmgMul || 1) * gridMul * bossMul * dt);
    }
  },
  // прицел — пунктир, который разгорается к выстрелу; молния — ломаная, каждый кадр новая
  draw(u, w, g) {
    for (const b of w.beams || []) spark.drawBeam(u, w, b, g);
  },
  drawBeam(u, w, b, g) {
    const foe = b.target;
    const { ctx } = g;
    const dx = foe.x - u.x, dy = foe.y - u.y;
    const d = Math.hypot(dx, dy) || 1;
    if (b.aim > 0) {
      ctx.globalAlpha = 0.2 + 0.6 * (1 - b.aim / b.aimTotal);
      ctx.strokeStyle = w.color;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(u.x, u.y);
      ctx.lineTo(foe.x, foe.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(foe.x, foe.y, foe.r + 4 + 10 * (b.aim / b.aimTotal), 0, Math.PI * 2);
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
    const thick = Math.min(2.2, 1 + 0.25 * Math.floor(b.held || 0));
    // тёмная обводка, цветной ореол, светлая середина — молния видна на любом полу
    for (const [width, color, alpha] of [[6 * thick, '#2a1d0d', 0.6], [4 * thick, w.color, 0.75], [1.6 * thick, '#fff4dc', 1]]) {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
      ctx.stroke();
    }
    // на цели — искры
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff4dc';
    for (let i = 0; i < 3; i++) {
      const ang = Math.random() * Math.PI * 2, rr = foe.r * (0.4 + Math.random() * 0.6);
      ctx.fillRect(foe.x + Math.cos(ang) * rr - 1.5, foe.y + Math.sin(ang) * rr - 1.5, 3, 3);
    }
  },
};

const bow = {
  stats: { range: 345, dmg: 9.26, cooldown: 1.0, projSpeed: 560, projRadius: 4 },
  update: shootUpdate(arrow),
};

// активное лечение: раз в перезарядку лечит того, у кого ниже всего доля HP.
// Улучшения медика: «регенерация» — медик сам лечится на share своего лечения в секунду;
// «адреналин» — цель с долей HP ниже below лечится в mul раз сильнее;
// «Lasting Cure» — вылеченный ещё time секунд долечивается на share лечения (не складывается — заменяет прежнее)
const heal = {
  stats: { range: 220, cooldown: 2.0, heal: 9.6 },
  update(u, w, dt, game) {
    const regen = game.upgrade('medicRegen');
    if (regen) u.hp = Math.min(u.maxHp, u.hp + (w.heal / w.cooldown) * regen.share * dt);
    if (!ready(w, dt)) return;
    let worst = null;
    // лечит и цепочку, и выбитых союзников, которые лежат рядом
    for (const m of game.chainUnits().concat(game.state.downed)) {
      if (m.hp >= m.maxHp) continue;
      if (dist(u, m) > w.range) continue;
      if (!worst || m.hp / m.maxHp < worst.hp / worst.maxHp) worst = m;
    }
    if (!worst) return;
    const adr = game.upgrade('adrenaline');
    const amount = w.heal * (adr && worst.hp / worst.maxHp < adr.below ? adr.mul : 1);
    worst.hp = Math.min(worst.maxHp, worst.hp + amount);
    const cure = game.upgrade('lastingCure');
    if (cure) worst.cure = { left: cure.time, rate: (amount * cure.share) / cure.time };
    w.cd = w.cooldown;
    u.facing = Math.atan2(worst.y - u.y, worst.x - u.x);
    game.state.effects.push({ type: 'beam', x1: u.x, y1: u.y, x2: worst.x, y2: worst.y, life: 0.25, color: COLORS.medic });
  },
};

G.weapons = { fist, spear, spark, bow, heal };
})(window.Game = window.Game || {});
