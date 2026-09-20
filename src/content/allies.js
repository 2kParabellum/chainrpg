// Реестр типов союзников. Один тип = одна запись: характеристики, атака, метка на теле.
// Новый союзник добавляется записью сюда (плюс цвет в палитре и строка в пуле уровня),
// остальной код не меняется.
//
// Поля записи:
//   color    — цвет тела и подписей
//   stats    — характеристики; юнит получает их как cfg
//   attack   — (a, rate, game): вызывается, когда перезарядка кончилась; rate — множитель темпа.
//              Записи без attack ничего не делают сами (Усилок).
//   mark     — (u, f, ctx): рисует знак на теле; f — направление взгляда.
// Всё, что нужно от игры, запись получает параметром game и никогда не подключает game/ сама.
(function (G) {
'use strict';

const { COLORS } = G;
const { dist, spreadAngle } = G.math;

// стрелять можно только по тому, что освещает фонарь игрока
function shootNearest(a, rate, game, fire) {
  const foe = game.nearestTarget(a, game.state.visibleEnemies, a.cfg.range);
  if (!foe) return;
  a.facing = Math.atan2(foe.y - a.y, foe.x - a.x);
  fire(foe);
  a.cd = a.cfg.cooldown / rate;
}

const crossbow = {
  color: COLORS.crossbow,
  stats: { name: 'Арбалет', hp: 55, radius: 13, range: 330, cooldown: 1.0, dmg: 7, projSpeed: 430, projRadius: 4 },
  attack(a, rate, game) {
    shootNearest(a, rate, game, (foe) => {
      game.spawnProjectile(a, foe.x, foe.y, a.cfg.projSpeed, a.cfg.dmg, 'ally', a.cfg.projRadius);
    });
  },
  mark(u, f, ctx) {
    ctx.beginPath();
    ctx.moveTo(u.x, u.y);
    ctx.lineTo(u.x + Math.cos(f) * u.r, u.y + Math.sin(f) * u.r);
    ctx.moveTo(u.x + Math.cos(f + 1.5) * u.r * 0.7, u.y + Math.sin(f + 1.5) * u.r * 0.7);
    ctx.lineTo(u.x + Math.cos(f - 1.5) * u.r * 0.7, u.y + Math.sin(f - 1.5) * u.r * 0.7);
    ctx.stroke();
  },
};

const shotgun = {
  color: COLORS.shotgun,
  stats: { name: 'Дробовик', hp: 61, radius: 14, range: 165, cooldown: 1.3, dmg: 4, projSpeed: 380,
           projRadius: 4, pellets: 4, spread: 0.45 },
  attack(a, rate, game) {
    shootNearest(a, rate, game, () => {
      for (let p = 0; p < a.cfg.pellets; p++) {
        const ang = a.facing + spreadAngle(p, a.cfg.pellets, a.cfg.spread);
        game.spawnProjectile(a, a.x + Math.cos(ang) * 100, a.y + Math.sin(ang) * 100,
          a.cfg.projSpeed, a.cfg.dmg, 'ally', a.cfg.projRadius);
      }
    });
  },
  mark(u, f, ctx) {
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(u.x - Math.cos(f) * u.r * 0.3, u.y - Math.sin(f) * u.r * 0.3);
    ctx.lineTo(u.x + Math.cos(f) * u.r * 0.8, u.y + Math.sin(f) * u.r * 0.8);
    ctx.stroke();
  },
};

const medic = {
  color: COLORS.medic,
  stats: { name: 'Медик', hp: 49, radius: 13, range: 220, cooldown: 2.2, heal: 9 },
  attack(a, rate, game) {
    let worst = null;
    for (const u of game.chainUnits()) {
      if (u.hp >= u.maxHp) continue;
      if (dist(a, u) > a.cfg.range) continue;
      if (!worst || u.hp / u.maxHp < worst.hp / worst.maxHp) worst = u;
    }
    if (worst) {
      worst.hp = Math.min(worst.maxHp, worst.hp + a.cfg.heal);
      a.cd = a.cfg.cooldown / rate;
      a.facing = Math.atan2(worst.y - a.y, worst.x - a.x);
      game.state.effects.push({ type: 'beam', x1: a.x, y1: a.y, x2: worst.x, y2: worst.y, life: 0.25, color: COLORS.medic });
    }
  },
  mark(u, f, ctx) {
    ctx.beginPath();
    ctx.moveTo(u.x - u.r * 0.55, u.y); ctx.lineTo(u.x + u.r * 0.55, u.y);
    ctx.moveTo(u.x, u.y - u.r * 0.55); ctx.lineTo(u.x, u.y + u.r * 0.55);
    ctx.stroke();
  },
};

const cutter = {
  color: COLORS.cutter,
  stats: { name: 'Резак', hp: 92, radius: 15, cooldown: 0.5, dmg: 14,
           reach: 34 },         // лезвия торчат по бокам: рубит только вплотную
  // лезвия по бокам рубят всех, кто оказался вплотную, — светить фонарём для этого не надо
  attack(a, rate, game) {
    let cut = false;
    for (const e of game.state.enemies.slice()) {
      if (!game.isSpotted(e)) continue;
      if (dist(a, e) > a.cfg.reach + e.r) continue;
      game.damageUnit(e, a.cfg.dmg);
      cut = true;
    }
    if (cut) {
      a.cd = a.cfg.cooldown / rate;
      game.state.effects.push({ type: 'ring', x: a.x, y: a.y, r: a.cfg.reach, life: 0.16, color: COLORS.cutter });
    }
  },
  // лезвия-«копья» по кругу: видно, на какой дистанции он рубит
  mark(u, f, ctx) {
    ctx.strokeStyle = '#0e0e10';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + f * 0.5;
      ctx.moveTo(u.x + Math.cos(a) * u.r * 0.45, u.y + Math.sin(a) * u.r * 0.45);
      ctx.lineTo(u.x + Math.cos(a) * u.r * 1.05, u.y + Math.sin(a) * u.r * 1.05);
    }
    ctx.stroke();
  },
};

// Усилок сам не бьёт и не лечит (attack нет): каждый его сосед по цепочке получает
// +rateBonus к темпу атаки, бонусы нескольких Усилков складываются
const booster = {
  color: COLORS.booster,
  stats: { name: 'Усилок', hp: 58, radius: 13,
           rateBonus: 0.75 },   // насколько ускоряет соседей по цепочке
  mark(u, f, ctx) {
    ctx.beginPath();
    for (const off of [-0.45, 0.25]) {
      ctx.moveTo(u.x - u.r * 0.5, u.y + u.r * (off + 0.45));
      ctx.lineTo(u.x, u.y + u.r * off);
      ctx.lineTo(u.x + u.r * 0.5, u.y + u.r * (off + 0.45));
    }
    ctx.stroke();
  },
};

G.allyTypes = { crossbow, shotgun, medic, cutter, booster };
})(window.Game = window.Game || {});
