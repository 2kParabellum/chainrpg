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
  game.damageUnit(foe, w.dmg * (u.dmgMul || 1));
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

const arrow = (u, w, foe, game) => game.spawnProjectile(u, foe.x, foe.y, w.projSpeed, w.dmg * (u.dmgMul || 1), 'ally', w.projRadius);

const sword = {
  stats: { reach: 30, dmg: 15.4, cooldown: 1.0, color: COLORS.hero },
  update: meleeUpdate,
};

const fist = {
  stats: { reach: 26, dmg: 11.5, cooldown: 0.9, color: COLORS.buddy },
  update: meleeUpdate,
};

const bow = {
  stats: { range: 300, dmg: 11.5, cooldown: 1.0, projSpeed: 560, projRadius: 4 },
  update: shootUpdate(arrow),
};

// активное лечение: раз в перезарядку лечит того, у кого ниже всего доля HP
const heal = {
  stats: { range: 220, cooldown: 2.0, heal: 9.6 },
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

G.weapons = { sword, fist, bow, heal };
})(window.Game = window.Game || {});
