// Реестр оружий и умений персонажей. Одна запись = одно оружие: стартовые характеристики
// и поведение. Персонаж (content/allies.js) перечисляет, какое оружие у него в каком режиме
// (ведущий — «с факелом», или звено цепи), и при необходимости переопределяет числа.
//
// Поля записи:
//   stats   — характеристики; юнит получает их личной копией вместе со своей перезарядкой (w.cd,
//             сначала случайной; readyAtStart — сразу готово)
//   update  — (u, w, dt, game): действие за кадр; u — носитель, w — его личная копия оружия
//   block   — (u, w, p): необязательно; true, если оружие остановило вражеский снаряд p (щит)
//   draw    — (u, w, g): необязательно; рисует оружие поверх тела (g — примитивы из render/shapes.js)
// Пассивные особенности (сапоги) — тоже записи здесь, но работают в любом режиме.
// Одно имя оружия у персонажа — одна копия, даже если оно есть в обоих режимах (перезарядка общая).
// Всё, что нужно от игры, запись получает параметром game и никогда не подключает game/ сама.
(function (G) {
'use strict';

const { COLORS } = G;
const { dist } = G.math;
const { distToSegment } = G.collision;

// перезарядка: true, когда оружие готово действовать
function ready(w, dt) {
  w.cd = Math.max(0, w.cd - dt);
  return w.cd === 0;
}

// ближний удар по одной цели: ближайший обнаруженный враг вплотную. Свет не нужен
function meleeUpdate(u, w, dt, game) {
  if (!ready(w, dt)) return;
  let foe = null, best = Infinity;
  for (const e of game.state.enemies) {
    if (!game.isSpotted(e)) continue;
    const gap = dist(u, e) - u.r - e.r;
    if (gap <= w.reach && gap < best) { best = gap; foe = e; }
  }
  if (!foe) return;
  u.facing = Math.atan2(foe.y - u.y, foe.x - u.x);
  game.damageUnit(foe, w.dmg);
  w.cd = w.cooldown;
  game.state.effects.push({ type: 'beam', x1: u.x, y1: u.y, x2: foe.x, y2: foe.y, life: 0.12, color: w.color });
}

// дальний выстрел: только по освещённым врагам
function shootUpdate(fire) {
  return function (u, w, dt, game) {
    if (!ready(w, dt)) return;
    const foe = game.nearestTarget(u, game.state.visibleEnemies, w.range);
    if (!foe) return;
    u.facing = Math.atan2(foe.y - u.y, foe.x - u.x);
    fire(u, w, foe, game);
    w.cd = w.cooldown;
  };
}

const arrow = (u, w, foe, game) => game.spawnProjectile(u, foe.x, foe.y, w.projSpeed, w.dmg, 'ally', w.projRadius);

const sword = {
  stats: { reach: 30, dmg: 8, cooldown: 1.0, color: COLORS.hero },
  update: meleeUpdate,
};

const revolver = {
  stats: { range: 280, dmg: 4, cooldown: 0.9, projSpeed: 520, projRadius: 3 },
  update: shootUpdate(arrow),
};

const bow = {
  stats: { range: 560, dmg: 14, cooldown: 1.3, projSpeed: 620, projRadius: 4 },
  update: shootUpdate(arrow),
};

const knives = {
  stats: { range: 190, dmg: 9, cooldown: 0.7, projSpeed: 480, projRadius: 4 },
  update: shootUpdate(arrow),
};

const spear = {
  stats: { reach: 45, dmg: 16, cooldown: 1.1, color: COLORS.warrior },
  update: meleeUpdate,
};

// пассивная регенерация всей цепочки
const regen = {
  stats: { rate: 1.2 },      // HP в секунду каждому звену
  update(u, w, dt, game) {
    for (const m of game.state.party) {
      if (m.hp < m.maxHp) m.hp = Math.min(m.maxHp, m.hp + w.rate * dt);
    }
  },
};

// активное лечение: раз в перезарядку лечит того, у кого ниже всего доля HP
const heal = {
  stats: { range: 220, cooldown: 2.2, heal: 9 },
  update(u, w, dt, game) {
    if (!ready(w, dt)) return;
    let worst = null;
    for (const m of game.chainUnits()) {
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

// рассеивает вонючие облака рядом с собой
const dispel = {
  stats: { radius: 110, fade: 0.3 },   // облако с центром ближе radius гаснет за fade секунд
  update(u, w, dt, game) {
    for (const c of game.state.clouds) {
      if (dist(u, c) < w.radius && c.life > w.fade) c.life = w.fade;
    }
  },
  draw(u, w, g) {
    const { ctx } = g;
    ctx.strokeStyle = COLORS.medic;
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.arc(u.x, u.y, w.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  },
};

// щит в цепи: круг вокруг Воина, раз в перезарядку останавливает один вражеский снаряд
const shieldAura = {
  stats: { radius: 50, cooldown: 1.5, readyAtStart: true },
  update(u, w, dt) { w.cd = Math.max(0, w.cd - dt); },
  block(u, w, p) {
    if (w.cd > 0 || dist(u, p) > w.radius + p.r) return false;
    w.cd = w.cooldown;
    return true;
  },
  draw(u, w, g) {
    const { ctx } = g;
    ctx.strokeStyle = COLORS.shield;
    ctx.globalAlpha = w.cd > 0 ? 0.12 : 0.35;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.arc(u.x, u.y, w.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  },
};

// щит ведущего: сектор перед лицом по направлению движения, блокирует всё без перезарядки
const shieldFront = {
  stats: { radius: 36, arc: Math.PI / 3 },   // радиус и половина угла сектора
  update() {},
  block(u, w, p) {
    if (dist(u, p) > w.radius + p.r) return false;
    const twoPi = Math.PI * 2;
    const diff = Math.abs((((Math.atan2(p.y - u.y, p.x - u.x) - u.heading + Math.PI) % twoPi) + twoPi) % twoPi - Math.PI);
    return diff <= w.arc;
  },
  draw(u, w, g) {
    const { ctx } = g;
    ctx.strokeStyle = COLORS.shield;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(u.x, u.y, w.radius, u.heading - w.arc, u.heading + w.arc);
    ctx.stroke();
  },
};

// железные сапоги: шипы под ногами уничтожаются, цепочка за Воином идёт по ним безопасно
const ironBoots = {
  stats: { pad: 4 },
  update(u, w, dt, game) { game.trampleSpikes(u.x, u.y, u.r + w.pad); },
};

// бросок огня: неточный навесной снаряд; на месте падения бьёт по площади и оставляет светящийся огонь
const firebomb = {
  stats: { range: 360, cooldown: 2.6, flight: 0.6, miss: 45, radius: 50, dmg: 16, edgeDmg: 8,
           fireRadius: 45, fireLife: 4, fireLight: 130, burnDps: 0 },
  update: shootUpdate((u, w, foe, game) => {
    const a = Math.random() * Math.PI * 2, d = Math.random() * w.miss;
    game.spawnFirebomb(u, foe.x + Math.cos(a) * d, foe.y + Math.sin(a) * d, w);
  }),
};

// огненный луч ведущего: короткий, всегда горит вперёд по направлению движения и упирается в стены
const flameBeam = {
  stats: { length: 80, width: 8, dps: 14 },
  update(u, w, dt, game) {
    const len = game.rayLength(u.x, u.y, u.heading, w.length);
    const x2 = u.x + Math.cos(u.heading) * len, y2 = u.y + Math.sin(u.heading) * len;
    u.beam = { x2, y2 };
    for (const e of game.state.enemies.slice()) {
      if (!game.isSpotted(e)) continue;
      if (distToSegment(e.x, e.y, u.x, u.y, x2, y2) <= e.r + w.width / 2) game.damageUnit(e, w.dps * dt);
    }
  },
  draw(u, w, g) {
    if (!u.beam) return;
    const { ctx } = g;
    ctx.lineCap = 'round';
    ctx.strokeStyle = COLORS.fire;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = w.width;
    ctx.beginPath();
    ctx.moveTo(u.x, u.y);
    ctx.lineTo(u.beam.x2, u.beam.y2);
    ctx.stroke();
    ctx.strokeStyle = '#ffe9a0';
    ctx.lineWidth = w.width * 0.4;
    ctx.beginPath();
    ctx.moveTo(u.x, u.y);
    ctx.lineTo(u.beam.x2, u.beam.y2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';
  },
};

G.weapons = { sword, revolver, bow, knives, spear, regen, heal, dispel, shieldAura, shieldFront, ironBoots, firebomb, flameBeam };
})(window.Game = window.Game || {});
