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
  stats: { reach: 30, dmg: 16, cooldown: 1.0, color: COLORS.hero },
  update: meleeUpdate,
};

const revolver = {
  stats: { range: 280, dmg: 8, cooldown: 0.9, projSpeed: 520, projRadius: 3 },
  update: shootUpdate(arrow),
};

const bow = {
  stats: { range: 560, dmg: 28, cooldown: 1.3, projSpeed: 620, projRadius: 4 },
  update: shootUpdate(arrow),
};

const knives = {
  stats: { range: 190, dmg: 18, cooldown: 0.7, projSpeed: 480, projRadius: 4 },
  update: shootUpdate(arrow),
};

const spear = {
  stats: { reach: 45, dmg: 32, cooldown: 1.1, color: COLORS.warrior },
  update: meleeUpdate,
};

// пассивная регенерация всей цепочки
const regen = {
  stats: { rate: 2.4 },      // HP в секунду каждому звену
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
  stats: { range: 360, cooldown: 2.6, flight: 0.6, miss: 45, radius: 50, dmg: 32, edgeDmg: 16,
           fireRadius: 45, fireLife: 4, fireLight: 130, burnDps: 0 },
  update: shootUpdate((u, w, foe, game) => {
    const a = Math.random() * Math.PI * 2, d = Math.random() * w.miss;
    game.spawnFirebomb(u, foe.x + Math.cos(a) * d, foe.y + Math.sin(a) * d, w);
  }),
};

// огненный конус ведущего: горит вперёд по направлению движения, расходится веером и упирается в стены
const flameBeam = {
  stats: { length: 130, arc: 0.4, dps: 28, rays: 7 },   // длина, половина угла раствора, урон в секунду
  update(u, w, dt, game) {
    // контур конуса: лучи веером, каждый обрезан о стены и колонны
    const pts = [];
    for (let i = 0; i < w.rays; i++) {
      const a = u.heading + (i / (w.rays - 1) - 0.5) * 2 * w.arc;
      const len = game.rayLength(u.x, u.y, a, w.length);
      pts.push({ x: u.x + Math.cos(a) * len, y: u.y + Math.sin(a) * len });
    }
    u.beam = { pts };
    for (const e of game.state.enemies.slice()) {
      if (!game.isSpotted(e)) continue;
      const d = dist(u, e);
      if (d > w.length + e.r) continue;
      // цель в конусе, если её центр (с учётом размера) попадает в угол, и до неё нет стены
      const a = Math.atan2(e.y - u.y, e.x - u.x);
      const diff = Math.abs(Math.atan2(Math.sin(a - u.heading), Math.cos(a - u.heading)));
      if (diff > w.arc + Math.asin(Math.min(1, e.r / Math.max(d, e.r)))) continue;
      if (game.rayLength(u.x, u.y, a, d) < d - e.r) continue;
      game.damageUnit(e, w.dps * dt);
    }
  },
  draw(u, w, g) {
    if (!u.beam) return;
    const { ctx } = g;
    const { pts } = u.beam;
    ctx.beginPath();
    ctx.moveTo(u.x, u.y);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.fillStyle = COLORS.fire;
    ctx.globalAlpha = 0.32;
    ctx.fill();
    ctx.strokeStyle = COLORS.fire;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 2;
    ctx.stroke();
    // яркая жила по центру
    const mid = pts[Math.floor(pts.length / 2)];
    ctx.strokeStyle = '#ffe9a0';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(u.x, u.y);
    ctx.lineTo(mid.x, mid.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  },
};

G.weapons = { sword, revolver, bow, knives, spear, regen, heal, dispel, shieldAura, shieldFront, ironBoots, firebomb, flameBeam };
})(window.Game = window.Game || {});
