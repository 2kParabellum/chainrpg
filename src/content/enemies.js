// Реестр типов врагов. Один тип = одна запись: характеристики, поведение, вид.
// Новый враг добавляется записью сюда (плюс цвет в палитре и строка в пуле уровня),
// остальной код не меняется.
//
// Поля записи:
//   stats        — характеристики; юнит получает их как cfg
//   wanderSpeed  — скорость блуждания по комнате; нет поля — враг не блуждает
//   init         — (e): личные поля юнита при создании
//   update       — (e, dt, chain, game): поведение за кадр, когда враг активен и жив
//   lateUpdate   — (e, chain, game): шаг после боя и среды (мина: обнаружение и подрыв)
//   draw         — (e, g): тело врага; полоску HP рисует сцена
//   hiddenUntilRevealed — враг невидим и неуязвим для прицеливания, пока e.revealed не станет true
//   ignoredForVictory   — не считается в условии победы
// Всё, что нужно от игры, запись получает параметром game, а от рисования — параметром g
// и никогда не подключает game/ и render/ сама.
(function (G) {
'use strict';

const { COLORS } = G;
const { dist } = G.math;
const { moveAndCollide } = G.collision;

// общий шаблон стрелка, катапульты и скорпиона: блуждать, целиться, стрелять по перезарядке
function ranged(type, fire) {
  return function (e, dt, chain, game) {
    if (type.wanderSpeed !== undefined && !game.stepOffSpikes(e, dt, type.wanderSpeed * 1.6)) {
      game.wanderStep(e, dt, type.wanderSpeed);
    }

    e.cd -= dt;
    const foe = game.nearestTarget(e, chain, e.cfg.range);
    if (!foe) return;
    e.facing = Math.atan2(foe.y - e.y, foe.x - e.x);
    if (e.cd > 0) return;

    fire(e, foe, game);
    e.cd = e.cfg.cooldown;
  };
}

const shooter = {
  stats: { name: 'Стрелок', hp: 22, radius: 14, range: 340, cooldown: 1.7, dmg: 5, projSpeed: 300, projRadius: 4 },
  wanderSpeed: 45,
  draw(e, g) {
    const { ctx } = g;
    g.drawUnitBody(e, COLORS.enemy, true);
    // знак — как у Арбалета, только у врага
    g.drawMark(e, (u, f) => {
      ctx.beginPath();
      ctx.moveTo(u.x, u.y);
      ctx.lineTo(u.x + Math.cos(f) * u.r, u.y + Math.sin(f) * u.r);
      ctx.moveTo(u.x + Math.cos(f + 1.5) * u.r * 0.7, u.y + Math.sin(f + 1.5) * u.r * 0.7);
      ctx.lineTo(u.x + Math.cos(f - 1.5) * u.r * 0.7, u.y + Math.sin(f - 1.5) * u.r * 0.7);
      ctx.stroke();
    });
  },
};
shooter.update = ranged(shooter, (e, foe, game) => {
  game.spawnProjectile(e, foe.x, foe.y, e.cfg.projSpeed, e.cfg.dmg, 'enemy', e.cfg.projRadius);
});

const tower = {
  stats: { name: 'Катапульта', hp: 55, radius: 20, range: 430, cooldown: 3.2,
           dmg: 9,                  // урон в эпицентре
           blastRadius: 95,         // радиус поражения
           flightTime: 1.5 },       // сколько снаряд летит до земли
  draw(e, g) {
    const { ctx } = g;
    ctx.fillStyle = COLORS.tower;
    ctx.fillRect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2);
    // рычаг катапульты, направленный на цель
    ctx.strokeStyle = '#0e0e10';
    ctx.lineWidth = 3;
    const f = e.facing || 0;
    ctx.beginPath();
    ctx.moveTo(e.x - Math.cos(f) * e.r * 0.6, e.y - Math.sin(f) * e.r * 0.6);
    ctx.lineTo(e.x + Math.cos(f) * e.r * 0.8, e.y + Math.sin(f) * e.r * 0.8);
    ctx.stroke();
    ctx.fillStyle = '#0e0e10';
    ctx.beginPath();
    ctx.arc(e.x + Math.cos(f) * e.r * 0.8, e.y + Math.sin(f) * e.r * 0.8, 4, 0, Math.PI * 2);
    ctx.fill();
  },
};
tower.update = ranged(tower, (e, foe, game) => game.spawnMortar(e, foe.x, foe.y));

const scorpion = {
  stats: { name: 'Скорпион', hp: 30, radius: 15, range: 380, cooldown: 3.4, dmg: 6,
           projSpeed: 190,          // гарпун летит медленно, его видно заранее
           projRadius: 6,
           pullSpeed: 300 },        // с какой скоростью тащит выдернутого союзника
  wanderSpeed: 48,
  draw(e, g) {
    const { ctx } = g;
    g.drawUnitBody(e, COLORS.scorpion, true);
    ctx.strokeStyle = '#0e0e10';
    ctx.lineWidth = 2;
    const f = e.facing || 0;
    // две клешни вперёд и загнутый хвост с жалом назад
    ctx.beginPath();
    for (const s of [0.5, -0.5]) {
      ctx.moveTo(e.x + Math.cos(f + s) * e.r * 0.4, e.y + Math.sin(f + s) * e.r * 0.4);
      ctx.lineTo(e.x + Math.cos(f + s) * e.r * 1.1, e.y + Math.sin(f + s) * e.r * 1.1);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(e.x - Math.cos(f) * e.r * 0.8, e.y - Math.sin(f) * e.r * 0.8, e.r * 0.55,
      f - 1.2, f + 1.2);
    ctx.stroke();
  },
};
scorpion.update = ranged(scorpion, (e, foe, game) => game.spawnHook(e, foe));

// зомби норовит встать рядом с цепочкой, но не вплотную, и травит всё вокруг облаком
const zombie = {
  stats: { name: 'Зомби', hp: 70, radius: 17, aggro: 520, walkSpeed: 62, cooldown: 4.5,
           standoff: 55,            // держится рядом, но не вплотную — облако накрывает цепочку
           cloudRadius: 95,         // радиус вонючего облака
           cloudDps: 6,             // урон в секунду внутри облака
           cloudLife: 3.5,          // сколько облако висит
           cloudGrow: 0.5 },        // за сколько разрастается до полного радиуса
  wanderSpeed: 52,
  update(e, dt, chain, game) {
    const foe = game.nearestTarget(e, chain, e.cfg.aggro);
    e.cd -= dt;

    if (!foe) {
      if (!game.stepOffSpikes(e, dt, zombie.wanderSpeed * 1.6)) {
        game.wanderStep(e, dt, zombie.wanderSpeed);
      }
      return;
    }

    const d = dist(e, foe);
    e.facing = Math.atan2(foe.y - e.y, foe.x - e.x);
    const near = e.cfg.standoff;
    const sign = d > near * 1.15 ? 1 : d < near * 0.8 ? -1 : 0;
    if (sign) {
      moveAndCollide(e, Math.cos(e.facing) * e.cfg.walkSpeed * sign * dt,
        Math.sin(e.facing) * e.cfg.walkSpeed * sign * dt, game.world.moveBlockers);
    }

    if (e.cd <= 0 && d < near * 1.6) {
      game.state.clouds.push({ x: e.x, y: e.y, r: e.cfg.cloudRadius, cur: 0, t: 0, life: e.cfg.cloudLife });
      e.cd = e.cfg.cooldown;
    }
  },
  draw(e, g) {
    const { ctx } = g;
    g.drawUnitBody(e, COLORS.zombie, true);
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = COLORS.cloud;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r * 1.35, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#0e0e10';
    const f = e.facing || 0;
    for (const s of [0.55, -0.55]) {
      ctx.beginPath();
      ctx.arc(e.x + Math.cos(f + s) * e.r * 0.5, e.y + Math.sin(f + s) * e.r * 0.5, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  },
};

const bull = {
  stats: { name: 'Бычок', hp: 44, radius: 18, dmg: 12, aggro: 430, walkSpeed: 55,
           telegraph: 0.7, chargeSpeed: 540, chargeMaxDist: 720, chargeCooldown: 1.6,
           chargeStartSpeed: 150,   // с какой скорости начинается рывок
           chargeAccel: 780,        // разгон во время рывка
           chargeBrake: 620,        // торможение после того, как кого-то переехал
           chargeStopSpeed: 110,    // на какой скорости рывок заканчивается
           repeatDamage: 0.5,       // множитель урона для всех целей после первой
           knockoutChance: 0.3,     // шанс выбить из цепочки того, кого переехал
           knockbackSpeed: 380 },   // с какой силой отбрасывает выбитого
  wanderSpeed: 42,
  init(e) { e.state = 'idle'; e.timer = 0; e.travelled = 0; e.dir = { x: 0, y: 0 }; },
  update(e, dt, chain, game) {
    const foe = game.nearestTarget(e, chain, e.cfg.aggro);

    if (e.state === 'idle') {
      if (game.stepOffSpikes(e, dt, bull.wanderSpeed * 1.6)) return;
      if (!foe) { game.wanderStep(e, dt, bull.wanderSpeed); return; }
      e.facing = Math.atan2(foe.y - e.y, foe.x - e.x);
      moveAndCollide(e, Math.cos(e.facing) * e.cfg.walkSpeed * dt,
        Math.sin(e.facing) * e.cfg.walkSpeed * dt, game.world.moveBlockers);
      e.timer -= dt;
      if (e.timer <= 0) { e.state = 'telegraph'; e.timer = e.cfg.telegraph; }
      return;
    }

    if (e.state === 'telegraph') {
      if (foe) e.facing = Math.atan2(foe.y - e.y, foe.x - e.x);
      e.timer -= dt;
      if (e.timer <= 0) {
        e.state = 'charge';
        e.dir = { x: Math.cos(e.facing), y: Math.sin(e.facing) };
        e.travelled = 0;
        e.hitThisCharge = [];
        e.chargeSpeed = e.cfg.chargeStartSpeed;
      }
      return;
    }

    // рывок: сначала разгон, после первого столкновения бычок начинает тормозить
    const cfg = e.cfg;
    e.chargeSpeed += (e.hitThisCharge.length ? -cfg.chargeBrake : cfg.chargeAccel) * dt;
    e.chargeSpeed = Math.min(e.chargeSpeed, cfg.chargeSpeed);

    const step = e.chargeSpeed * dt;
    const normal = moveAndCollide(e, e.dir.x * step, e.dir.y * step, game.world.moveBlockers);
    e.travelled += step;

    // лобовой удар в стену обрывает рывок, косой — только сворачивает бычка вдоль неё
    let crashed = false;
    if (normal) {
      const into = e.dir.x * normal.x + e.dir.y * normal.y;
      if (into < -0.5) crashed = true;
      else {
        e.dir.x -= normal.x * into;
        e.dir.y -= normal.y * into;
        const len = Math.hypot(e.dir.x, e.dir.y) || 1;
        e.dir.x /= len; e.dir.y /= len;
        e.facing = Math.atan2(e.dir.y, e.dir.x);
      }
    }

    // проезжает насквозь: первому достаётся полный урон, остальным — половинный
    for (const u of chain.concat(game.state.downed)) {
      if (e.hitThisCharge.includes(u)) continue;
      if (dist(e, u) >= e.r + u.r) continue;
      const dmg = e.hitThisCharge.length ? cfg.dmg * cfg.repeatDamage : cfg.dmg;
      e.hitThisCharge.push(u);
      game.damageUnit(u, dmg);
      if (u.kind === 'ally' && u.hp > 0 && Math.random() < cfg.knockoutChance) {
        game.knockOutAlly(u, Math.atan2(u.y - e.y, u.x - e.x), cfg.knockbackSpeed);
      }
    }

    if (crashed || e.travelled > cfg.chargeMaxDist || e.chargeSpeed < cfg.chargeStopSpeed) {
      e.state = 'idle';
      e.timer = cfg.chargeCooldown;
    }
  },
  draw(e, g) {
    const { ctx } = g;
    const color = e.state === 'telegraph' ? '#ffe070' : COLORS.bull;
    g.drawUnitBody(e, color, true);
    ctx.strokeStyle = '#0e0e10';
    ctx.lineWidth = 3;
    const f = e.facing || 0;
    ctx.beginPath();
    ctx.moveTo(e.x + Math.cos(f + 0.6) * e.r * 0.5, e.y + Math.sin(f + 0.6) * e.r * 0.5);
    ctx.lineTo(e.x + Math.cos(f + 0.6) * e.r, e.y + Math.sin(f + 0.6) * e.r);
    ctx.moveTo(e.x + Math.cos(f - 0.6) * e.r * 0.5, e.y + Math.sin(f - 0.6) * e.r * 0.5);
    ctx.lineTo(e.x + Math.cos(f - 0.6) * e.r, e.y + Math.sin(f - 0.6) * e.r);
    ctx.stroke();
    if (e.state === 'telegraph') {
      ctx.strokeStyle = 'rgba(255,224,112,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x + Math.cos(f) * e.cfg.chargeMaxDist * 0.4, e.y + Math.sin(f) * e.cfg.chargeMaxDist * 0.4);
      ctx.stroke();
    }
  },
};

// мина: не блуждает и сама не действует; цепочка её замечает вблизи, она взрывается под ногами
// и простреливается союзниками, как любой враг — но только после обнаружения
const mine = {
  stats: { name: 'Мина', hp: 6, radius: 13,
           detectRadius: 110,       // с какого расстояния цепочка её замечает
           triggerRadius: 18,       // с какого расстояния срабатывает под ногами
           dmg: 20,                 // урон в эпицентре взрыва
           blastRadius: 80 },
  hiddenUntilRevealed: true,
  ignoredForVictory: true,
  init(m) { m.revealed = false; },
  lateUpdate(m, chain, game) {
    for (const u of chain) {
      const d = dist(m, u);
      if (d < m.cfg.detectRadius) m.revealed = true;
      if (d < m.cfg.triggerRadius + u.r) {
        game.removeFrom(game.state.enemies, m);
        game.blast(m, m.cfg.blastRadius, m.cfg.dmg,
          game.chainUnits().concat(game.state.downed, game.state.enemies));
        break;
      }
    }
  },
  draw(m, g) {
    const { ctx } = g;
    ctx.strokeStyle = COLORS.mine;
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(m.x + Math.cos(a) * m.r * 0.7, m.y + Math.sin(a) * m.r * 0.7);
      ctx.lineTo(m.x + Math.cos(a) * m.r * 1.25, m.y + Math.sin(a) * m.r * 1.25);
      ctx.stroke();
    }
    ctx.fillStyle = COLORS.mine;
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.r * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0e0e10';
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.r * 0.3, 0, Math.PI * 2);
    ctx.stroke();
  },
};

G.enemyTypes = { shooter, bull, tower, scorpion, zombie, mine };
})(window.Game = window.Game || {});
