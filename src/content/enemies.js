// Реестр типов врагов. Один тип = одна запись: характеристики, поведение, вид.
// Новый враг добавляется записью сюда (плюс цвет в палитре и строка в пуле уровня),
// остальной код не меняется.
//
// Поля записи:
//   stats        — характеристики; юнит получает их как cfg. mass — масса тела при расталкивании
//                  (см. game/bodies.js; нет поля — 1, Infinity — неподвижен)
//   wanderSpeed  — скорость блуждания по комнате; нет поля — враг не блуждает
//   chaseSpeed   — скорость погони за игроком; есть поле — тип «подвижный»: такого врага может
//                  породить портал, и порождённый (e.chasing) идёт к игроку через всю карту
//   init         — (e): личные поля юнита при создании
//   update       — (e, dt, chain, game): поведение за кадр, когда враг активен и жив
//   lateUpdate   — (e, chain, game): шаг после боя и среды (мина: обнаружение и подрыв)
//   draw         — (e, g): тело врага; полоску HP рисует сцена
//   hiddenUntilRevealed — враг невидим и неуязвим для прицеливания, пока e.revealed не станет true
//   ignoredForVictory   — не считается в условии победы
//   noRegen      — не отлечивается сам (портал)
//   alwaysActive — живёт и действует на любом расстоянии от игрока (портал)
//   deathFlash   — радиус вспышки при гибели (только вид)
// Всё, что нужно от игры, запись получает параметром game, а от рисования — параметром g
// и никогда не подключает game/ и render/ сама.
(function (G) {
'use strict';

const { COLORS } = G;
const { dist, pickOne } = G.math;
const { moveAndCollide, circleRectOverlap } = G.collision;

// общий шаблон стрелка, катапульты и скорпиона: блуждать, целиться, стрелять по перезарядке;
// порождённый порталом вместо блуждания идёт к игроку и держит дистанцию 0.6 дальности
function ranged(type, fire) {
  return function (e, dt, chain, game) {
    if (type.wanderSpeed !== undefined) {
      if (e.chasing) game.chaseStep(e, dt, type.chaseSpeed, e.cfg.range * 0.6);
      else if (!game.stepOffSpikes(e, dt, type.wanderSpeed * 1.6)) game.wanderStep(e, dt, type.wanderSpeed);
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
  stats: { name: 'Стрелок', hp: 22, radius: 14, mass: 1, range: 340, cooldown: 1.7, dmg: 5, projSpeed: 300, projRadius: 4 },
  wanderSpeed: 45,
  chaseSpeed: 80,
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
  stats: { name: 'Катапульта', hp: 55, radius: 20, mass: Infinity, range: 430, cooldown: 3.2,
           dmg: 13,                 // урон в эпицентре
           edgeDmg: 5,              // урон на краю радиуса (между ними урон падает линейно)
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
  stats: { name: 'Скорпион', hp: 30, radius: 15, mass: 1.2, range: 456, cooldown: 3.5, dmg: 6,
           projSpeed: 218,         // гарпун летит медленно, его видно заранее
           projRadius: 6,
           pullSpeed: 450 },        // с какой скоростью тащит выдернутого союзника
  wanderSpeed: 48,
  chaseSpeed: 75,
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
  stats: { name: 'Зомби', hp: 70, radius: 17, mass: 2, aggro: 520, walkSpeed: 62, cooldown: 4.5,
           standoff: 24,            // просвет между телами: держится рядом, но не вплотную — облако накрывает
                                    // цепочку; меряется от края цели, чтобы так же стоять и у большой базы
           cloudRadius: 95,         // радиус вонючего облака
           cloudDps: 8,            // урон в секунду внутри облака
           cloudLife: 3.5,          // сколько облако висит
           cloudGrow: 0.5 },        // за сколько разрастается до полного радиуса
  wanderSpeed: 52,
  chaseSpeed: 70,
  update(e, dt, chain, game) {
    const foe = game.nearestTarget(e, chain, e.cfg.aggro);
    e.cd -= dt;

    if (!foe) {
      if (e.chasing) { game.chaseStep(e, dt, zombie.chaseSpeed); return; }
      if (!game.stepOffSpikes(e, dt, zombie.wanderSpeed * 1.6)) {
        game.wanderStep(e, dt, zombie.wanderSpeed);
      }
      return;
    }

    const gap = dist(e, foe) - e.r - foe.r;
    e.facing = Math.atan2(foe.y - e.y, foe.x - e.x);
    const near = e.cfg.standoff;
    const sign = gap > near + 8 ? 1 : gap < near - 11 ? -1 : 0;
    // подходит, обходя пропасти и стены; отходит по прямой
    if (sign > 0) game.chaseStep(e, dt, e.cfg.walkSpeed, 0, foe);
    else if (sign < 0) {
      moveAndCollide(e, -Math.cos(e.facing) * e.cfg.walkSpeed * dt,
        -Math.sin(e.facing) * e.cfg.walkSpeed * dt, game.world.moveBlockers);
    }

    if (e.cd <= 0 && gap < near + 33) {
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

// Хантер: мелкий и быстрый (чуть медленнее Героя). Видит далеко: заметив ближайшего союзника,
// бежит к нему, обходя препятствия, и кусает вплотную
const hunter = {
  stats: { name: 'Хантер', hp: 40, radius: 10, mass: 0.6, aggro: 720, runSpeed: 165,
           dmg: 5, cooldown: 0.8,
           reach: 8 },              // с какого просвета между телами достаёт укусом
  wanderSpeed: 60,
  chaseSpeed: 165,
  update(e, dt, chain, game) {
    e.cd -= dt;
    const foe = game.nearestTarget(e, chain, e.cfg.aggro);
    if (!foe) {
      if (e.chasing) game.chaseStep(e, dt, hunter.chaseSpeed);
      else if (!game.stepOffSpikes(e, dt, hunter.wanderSpeed * 1.6)) game.wanderStep(e, dt, hunter.wanderSpeed);
      return;
    }
    e.facing = Math.atan2(foe.y - e.y, foe.x - e.x);
    const gap = dist(e, foe) - e.r - foe.r;
    if (gap > e.cfg.reach * 0.5) game.chaseStep(e, dt, e.cfg.runSpeed, e.r + foe.r + e.cfg.reach * 0.5, foe);
    if (gap <= e.cfg.reach && e.cd <= 0) {
      game.damageUnit(foe, e.cfg.dmg);
      e.cd = e.cfg.cooldown;
      game.state.effects.push({ type: 'beam', x1: e.x, y1: e.y, x2: foe.x, y2: foe.y, life: 0.12, color: COLORS.hunter });
    }
  },
  draw(e, g) {
    const { ctx } = g;
    g.drawUnitBody(e, COLORS.hunter, true);
    // острая морда вперёд и два уха назад
    const f = e.facing || 0;
    ctx.fillStyle = '#0e0e10';
    ctx.beginPath();
    ctx.moveTo(e.x + Math.cos(f) * e.r * 1.5, e.y + Math.sin(f) * e.r * 1.5);
    ctx.lineTo(e.x + Math.cos(f + 0.5) * e.r * 0.8, e.y + Math.sin(f + 0.5) * e.r * 0.8);
    ctx.lineTo(e.x + Math.cos(f - 0.5) * e.r * 0.8, e.y + Math.sin(f - 0.5) * e.r * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#0e0e10';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const s of [2.4, -2.4]) {
      ctx.moveTo(e.x + Math.cos(f + s) * e.r * 0.5, e.y + Math.sin(f + s) * e.r * 0.5);
      ctx.lineTo(e.x + Math.cos(f + s * 0.9) * e.r * 1.4, e.y + Math.sin(f + s * 0.9) * e.r * 1.4);
    }
    ctx.stroke();
  },
};

const bull = {
  stats: { name: 'Бычок', hp: 44, radius: 18, mass: 3, dmg: 12, aggro: 430, walkSpeed: 55,
           telegraph: 0.7, chargeSpeed: 540, chargeMaxDist: 720, chargeCooldown: 1.6,
           chargeStartSpeed: 150,   // с какой скорости начинается рывок
           chargeAccel: 780,        // разгон во время рывка
           chargeBrake: 620,        // торможение после того, как кого-то переехал
           chargeStopSpeed: 110,    // на какой скорости рывок заканчивается
           repeatDamage: 0.5,       // множитель урона для всех целей после первой
           knockoutChance: 0.3,     // шанс выбить из цепочки того, кого переехал
           knockbackSpeed: 380 },   // с какой силой отбрасывает выбитого
  wanderSpeed: 42,
  chaseSpeed: 95,
  init(e) { e.state = 'idle'; e.timer = 0; e.travelled = 0; e.dir = { x: 0, y: 0 }; },
  update(e, dt, chain, game) {
    const foe = game.nearestTarget(e, chain, e.cfg.aggro);

    if (e.state === 'idle') {
      if (e.chasing && !foe) { game.chaseStep(e, dt, bull.chaseSpeed); return; }
      if (!e.chasing && game.stepOffSpikes(e, dt, bull.wanderSpeed * 1.6)) return;
      if (!foe) { game.wanderStep(e, dt, bull.wanderSpeed); return; }
      e.facing = Math.atan2(foe.y - e.y, foe.x - e.x);
      game.chaseStep(e, dt, e.cfg.walkSpeed, 0, foe); // подходит к цели, обходя пропасти и стены
      e.timer -= dt;
      if (e.timer <= 0) { e.state = 'telegraph'; e.timer = e.cfg.telegraph; }
      return;
    }

    if (e.state === 'telegraph') {
      if (foe) e.facing = Math.atan2(foe.y - e.y, foe.x - e.x);
      e.timer -= dt;
      if (e.timer <= 0) {
        e.state = 'charge';
        e.passThrough = true; // в рывке проезжает сквозь союзников (см. game/bodies.js)
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
      e.passThrough = false;
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
  stats: { name: 'Мина', hp: 12, radius: 13, mass: Infinity,
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

// портал: неподвижная громадина с кучей HP. Раз в несколько секунд выпускает рядом с собой
// подвижного врага, и тот идёт прямо к игроку. Сам не блуждает, не лечится и всегда «включён».
// Темп зависит от числа живых порталов: чем меньше их осталось, тем чаще выпускает каждый.
const portal = {
  stats: { name: 'Портал', hp: 540, radius: 46, mass: Infinity,
           // пауза между выходами врагов у каждого портала; номер = сколько порталов живо (1, 2, 3, 4);
           // при большем числе порталов берётся последнее значение
           spawnEvery: [2.5, 10, 15, 20],
           stagger: 6,              // разброс первого выхода (сек), чтобы порталы не стреляли залпом
           maxChasing: 24,          // предел порождённых на всей карте: пока их столько, порталы не выпускают новых
           spawnRingMin: 25,        // враг появляется в кольце от края портала: от ..
           spawnRingMax: 80,        // .. до этих расстояний
           spawnClearance: 22 },    // радиус свободного места под появляющегося врага
  noRegen: true,
  alwaysActive: true,
  deathFlash: 170,
  init(e) {
    e.age = 0;
    e.sinceSpawn = Math.random() * e.cfg.stagger; // сколько прошло с прошлого выхода врага
    e.spawnIn = 99;                               // сколько осталось до следующего (для вида)
  },
  update(e, dt, chain, game) {
    e.age += dt;
    e.sinceSpawn += dt;

    const cfg = e.cfg;
    // интервал пересчитывается каждый кадр: когда соседний портал разрушен, остальные ускоряются сразу
    const alive = game.state.enemies.filter((x) => x.type === e.type).length;
    const every = cfg.spawnEvery[Math.min(alive, cfg.spawnEvery.length) - 1];
    e.spawnIn = every - e.sinceSpawn;
    if (e.spawnIn > 0) return;

    e.sinceSpawn = 0;
    if (game.state.enemies.filter((x) => x.chasing).length >= cfg.maxChasing) return;

    const spot = game.freeSpotNear(e.x, e.y, e.r + cfg.spawnRingMin, e.r + cfg.spawnRingMax, cfg.spawnClearance);
    if (!spot) { e.sinceSpawn = every - 1; return; } // всё занято — пробуем ещё раз через секунду
    game.spawnEnemy(game.pickChaser(), spot.x, spot.y, e.room, { chasing: true, spawnedBy: e });
    game.state.effects.push({ type: 'ring', x: spot.x, y: spot.y, r: 26, life: 0.35, color: COLORS.portal });
  },
  draw(e, g) {
    const { ctx } = g;
    // перед выходом врага ядро разгорается
    const soon = e.spawnIn < 1.5 ? 1 - Math.max(0, e.spawnIn) / 1.5 : 0;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1024';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.portal;
    ctx.stroke();

    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -e.age * 30;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineDashOffset = e.age * 45;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r * 0.46, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;

    ctx.globalAlpha = 0.35 + soon * 0.55;
    ctx.fillStyle = COLORS.portal;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r * (0.2 + 0.05 * Math.sin(e.age * 3) + soon * 0.12), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  },
};

// Демон: единственный враг боссовой арены. Медленно идёт к игроку и держит дистанцию, а раз
// в несколько секунд бьёт одной из четырёх атак: обстрел множеством снарядов по случайным точкам
// арены, один огромный снаряд, который вышибает задетых союзников из цепочки, луч, оставляющий
// стенку огня, и вызов подкрепления. Между атаками — короткий замах (see TELEGRAPH), по цвету
// тела видно, что сейчас готовится.
const BOSS_ATTACKS = ['barrage', 'mega', 'beam', 'summon'];
const BOSS_TELEGRAPH = { barrage: 0.6, mega: 1.1, summon: 0.5 };
const BOSS_ATTACK_COLOR = { barrage: COLORS.blast, mega: COLORS.bossGlow, beam: COLORS.fire, summon: COLORS.portal,
                            ram: COLORS.bossRam };

function pickBossAttack(e) {
  const options = BOSS_ATTACKS.filter((a) => a !== e.lastAttack);
  return pickOne(options);
}

// случайная точка рядом с (cx, cy) в пределах radius, не в стене и не в колонне —
// для обстрела барражом: снаряды ложатся близко к игроку, а не по всей арене
function randomSpotNear(game, cx, cy, radius, r) {
  const w = game.world;
  for (let tries = 0; tries < 10; tries++) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * radius;
    const p = { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d };
    if (p.x < r || p.y < r || p.x > w.width - r || p.y > w.height - r) continue;
    if (!w.moveBlockers.some((rect) => circleRectOverlap(p.x, p.y, r, rect))) return p;
  }
  return { x: cx, y: cy };
}

function bossExecuteAttack(e, game, lead) {
  const cfg = e.cfg;
  if (e.attack === 'barrage') {
    // случайное число снарядов на каждый обстрел, все ложатся близко к игроку
    const count = cfg.barrageMinCount + Math.floor(Math.random() * (cfg.barrageMaxCount - cfg.barrageMinCount + 1));
    for (let i = 0; i < count; i++) {
      const t = randomSpotNear(game, lead.x, lead.y, cfg.barrageSpread, 40);
      game.spawnMortar(e, t.x, t.y,
        { flightTime: cfg.barrageFlight, dmg: cfg.barrageDmg, edgeDmg: cfg.barrageEdgeDmg, blastRadius: cfg.barrageBlast });
    }
  } else if (e.attack === 'mega') {
    // прицел ведётся по ходу игрока (чуть предсказывает, куда тот идёт), сверху ещё случайный сдвиг —
    // точнее, чем стрельба по текущей точке, но всё равно не гарантированное попадание
    const px = lead.x + (lead.vx || 0) * cfg.megaFlight * cfg.megaLeadFactor;
    const py = lead.y + (lead.vy || 0) * cfg.megaFlight * cfg.megaLeadFactor;
    const aimA = Math.random() * Math.PI * 2, aimD = Math.random() * cfg.megaAimError;
    const tx = px + Math.cos(aimA) * aimD, ty = py + Math.sin(aimA) * aimD;
    game.spawnBigMortar(e, tx, ty,
      { flightTime: cfg.megaFlight, dmg: cfg.megaDmg, edgeDmg: cfg.megaEdgeDmg,
        blastRadius: cfg.megaBlast, knockback: cfg.megaKnockback });
  } else if (e.attack === 'summon') {
    const n = cfg.summonMin + Math.floor(Math.random() * (cfg.summonMax - cfg.summonMin + 1));
    for (let i = 0; i < n; i++) {
      const type = pickOne(cfg.summonTypes);
      const spot = game.freeSpotNear(e.x, e.y, e.r + 30, e.r + 160, 20);
      if (!spot) continue;
      game.spawnEnemy(type, spot.x, spot.y, e.room, {});
      game.state.effects.push({ type: 'ring', x: spot.x, y: spot.y, r: 26, life: 0.4, color: COLORS.boss });
    }
  }
  e.lastAttack = e.attack;
  e.attack = null;
  e.state = 'idle';
  e.timer = cfg.attackCooldownMin + Math.random() * (cfg.attackCooldownMax - cfg.attackCooldownMin);
}

// шаг тарана демона: разгон по прямой, вдоль стены — скольжение, лобовой удар в стену или пройденный
// ramDist — конец. Задетых ранит; дружочков выбивает из цепочки в сторону от линии тарана, Героя отшвыривает
function bossRamStep(e, dt, chain, game) {
  const cfg = e.cfg;
  e.chargeSpeed = Math.min(cfg.ramSpeed, e.chargeSpeed + cfg.ramAccel * dt);
  const step = e.chargeSpeed * dt;
  const normal = moveAndCollide(e, e.dir.x * step, e.dir.y * step, game.world.moveBlockers);
  e.travelled += step;
  let crashed = false;
  if (normal) {
    const into = e.dir.x * normal.x + e.dir.y * normal.y;
    if (into < -0.5) crashed = true;
    else {
      e.dir.x -= normal.x * into; e.dir.y -= normal.y * into;
      const len = Math.hypot(e.dir.x, e.dir.y) || 1;
      e.dir.x /= len; e.dir.y /= len;
      e.facing = Math.atan2(e.dir.y, e.dir.x);
    }
  }
  for (const u of chain.concat(game.state.downed)) {
    if (e.hitThisCharge.includes(u) || dist(e, u) >= e.r + u.r) continue;
    e.hitThisCharge.push(u);
    game.damageUnit(u, cfg.ramDmg);
    if (u.hp <= 0) continue;
    // отлетает вперёд-вбок от линии тарана — в ту сторону, где тело и было
    const side = (u.x - e.x) * -e.dir.y + (u.y - e.y) * e.dir.x >= 0 ? 1 : -1;
    const a = Math.atan2(e.dir.y, e.dir.x) + side * Math.PI * 0.35;
    if (game.canBeDisplaced(u)) game.knockOutAlly(u, a, cfg.ramKnockback);
    else { u.vx = Math.cos(a) * cfg.ramShove; u.vy = Math.sin(a) * cfg.ramShove; }
    game.state.effects.push({ type: 'ring', x: u.x, y: u.y, r: u.r + 10, life: 0.35, color: COLORS.bossRam });
  }
  if (crashed || e.travelled >= cfg.ramDist) {
    e.state = 'idle';
    e.passThrough = false;
    e.attack = null;
    e.ramCd = cfg.ramCooldown;
    e.timer = cfg.attackCooldownMin + Math.random() * (cfg.attackCooldownMax - cfg.attackCooldownMin);
  }
}

const boss = {
  stats: { name: 'Демон', hp: 1800, radius: 50, mass: Infinity, walkSpeed: 40, approachStop: 260,
           attackCooldownMin: 2.6, attackCooldownMax: 4.2,
           // атака 1 — катапультный обстрел: от 1 до 7 снарядов (каждый раз случайно), ложатся
           // кучно рядом с игроком (в пределах barrageSpread), а не по всей арене; долгий подлёт
           barrageMinCount: 1, barrageMaxCount: 7, barrageSpread: 200,
           barrageDmg: 18, barrageEdgeDmg: 6, barrageBlast: 70, barrageFlight: 2.2,
           // атака 2 — один огромный снаряд в игрока: выбивает задетых из цепочки; прицел ведётся
           // с упреждением по скорости игрока (megaLeadFactor — доля предсказанного смещения),
           // сверху ещё случайный сдвиг в пределах megaAimError — не гарантированное попадание, но точнее «в лоб»
           megaDmg: 26, megaEdgeDmg: 10, megaBlast: 171, megaFlight: 1.8, megaKnockback: 420,
           megaLeadFactor: 0.5, megaAimError: 90,
           // атака 3 — луч: сперва секунда прицеливания (боссу видно, куда целится), затем луч растёт
           // от босса с постоянной скоростью 820 px/с — ровно столько, чтобы из центра арены (её радиус
           // тоже 820) дойти до стены за секунду; на прожаренной земле остаётся стена огня на 10 с
           beamAimTime: 1, beamSpeed: 820, beamRange: 820, beamRadius: 24, fireDps: 11, fireLife: 10,
           // атака 4 — вызов подкрепления
           summonMin: 4, summonMax: 6, summonTypes: ['zombie', 'hunter'],
           // щит: включён постоянно. Ранит выстрелами босса не достать (кроме усиления «сила»),
           // а тот, кто подошёл вплотную (на полдружочка от тела), получает урон сам
           shieldAuraExtra: 12, shieldContactDmg: 7, shieldContactInterval: 0.4,
           // таран — не из очереди атак: стоит Герою подойти ближе ramTrigger (от края до края), босс
           // ramAim секунд злобно целится в него (последние ramLock секунд направление уже не меняется),
           // потом бросается по прямой, как Бычок, и проносится насквозь на ramDist. Каждого задетого ранит
           // на ramDmg; дружочков выбивает из цепочки в стороны, Героя отшвыривает вбок. Снова — не раньше ramCooldown
           ramTrigger: 115, ramAim: 2, ramLock: 0.3, ramCooldown: 8,
           ramStartSpeed: 220, ramAccel: 1600, ramSpeed: 780, ramDist: 800,
           ramDmg: 20, ramKnockback: 460, ramShove: 340 },
  noRegen: true,
  alwaysActive: true,
  deathFlash: 220,
  init(e) {
    e.state = 'idle'; e.timer = 2; e.attack = null; e.lastAttack = null; e.age = 0;
    e.shielded = true;
    e.shieldContactCd = 0;
    e.beam = null;
    e.ramCd = 0;
  },
  update(e, dt, chain, game) {
    const cfg = e.cfg;
    e.age += dt;
    const lead = chain[0];
    e.ramCd -= dt;
    // во время тарана и в последние мгновения прицела направление зафиксировано
    const locked = e.state === 'ram' || (e.state === 'ramAim' && e.timer <= cfg.ramLock);
    if (!locked) e.facing = Math.atan2(lead.y - e.y, lead.x - e.x);

    // щит держится постоянно: всё, что подошло слишком близко, получает урон сам
    e.shieldContactCd -= dt;
    if (e.shieldContactCd <= 0) {
      let hit = false;
      for (const u of chain) {
        if (dist(e, u) <= e.r + cfg.shieldAuraExtra + u.r) { game.damageUnit(u, cfg.shieldContactDmg); hit = true; }
      }
      if (hit) e.shieldContactCd = cfg.shieldContactInterval;
    }

    // Герой подошёл слишком близко — босс бросает всё (кроме уже начатой атаки) и готовит таран
    if (e.state === 'idle' && e.ramCd <= 0 && dist(e, lead) - e.r - lead.r <= cfg.ramTrigger) {
      e.state = 'ramAim'; e.attack = 'ram'; e.timer = cfg.ramAim;
      return;
    }
    if (e.state === 'ramAim') {
      e.timer -= dt;
      if (e.timer <= 0) {
        e.state = 'ram';
        e.passThrough = true; // проносится сквозь цепочку (см. game/bodies.js)
        e.dir = { x: Math.cos(e.facing), y: Math.sin(e.facing) };
        e.travelled = 0;
        e.hitThisCharge = [];
        e.chargeSpeed = cfg.ramStartSpeed;
      }
      return;
    }
    if (e.state === 'ram') { bossRamStep(e, dt, chain, game); return; }

    if (e.state === 'idle') {
      if (dist(e, lead) > cfg.approachStop) {
        moveAndCollide(e, Math.cos(e.facing) * cfg.walkSpeed * dt, Math.sin(e.facing) * cfg.walkSpeed * dt,
          game.world.moveBlockers);
      }
      e.timer -= dt;
      if (e.timer <= 0) {
        e.attack = pickBossAttack(e);
        if (e.attack === 'beam') { e.state = 'beamAim'; e.timer = cfg.beamAimTime; }
        else { e.state = 'telegraph'; e.timer = BOSS_TELEGRAPH[e.attack]; }
      }
      return;
    }

    // прицеливание луча: секунда, в течение которой прицел (e.facing) следит за игроком
    if (e.state === 'beamAim') {
      e.timer -= dt;
      if (e.timer <= 0) {
        // растущая стенка огня: полыхает по мере роста и ещё fireLife секунд после того, как дорос до конца
        const fw = game.spawnFirewall(e.x, e.y, e.x, e.y, cfg.beamRadius, cfg.fireDps, cfg.fireLife, true);
        e.beam = { dir: e.facing, len: 0, fw };
        e.state = 'beamFire';
      }
      return;
    }

    // луч растёт от босса с постоянной скоростью, прожигая всё по пути (урон даёт applyFirewalls)
    if (e.state === 'beamFire') {
      const b = e.beam;
      b.len = Math.min(cfg.beamRange, b.len + cfg.beamSpeed * dt);
      b.fw.x1 = e.x; b.fw.y1 = e.y;
      b.fw.x2 = e.x + Math.cos(b.dir) * b.len;
      b.fw.y2 = e.y + Math.sin(b.dir) * b.len;
      if (b.len >= cfg.beamRange) {
        b.fw.growing = false; // дорос до конца — теперь fireLife секунд догорает на месте
        e.beam = null;
        e.lastAttack = 'beam';
        e.attack = null;
        e.state = 'idle';
        e.timer = cfg.attackCooldownMin + Math.random() * (cfg.attackCooldownMax - cfg.attackCooldownMin);
      }
      return;
    }

    // telegraph: короткий замах перед атакой (обстрел/большой снаряд/вызов), тело светится её цветом
    e.timer -= dt;
    if (e.timer <= 0) bossExecuteAttack(e, game, lead);
  },
  draw(e, g) {
    const { ctx } = g;
    const glowing = e.state === 'telegraph' || e.state === 'beamAim' || e.state === 'beamFire'
      || e.state === 'ramAim' || e.state === 'ram';
    const angry = e.state === 'ramAim' || e.state === 'ram';
    // таран: прицел — коридор шириной в тело на всю длину броска, к концу прицела ярче; зафиксирован — сплошной
    if (e.state === 'ramAim') {
      const fa = e.facing, k = 1 - e.timer / e.cfg.ramAim, locked = e.timer <= e.cfg.ramLock;
      const nx = -Math.sin(fa) * e.r, ny = Math.cos(fa) * e.r;
      const ex = e.x + Math.cos(fa) * e.cfg.ramDist, ey = e.y + Math.sin(fa) * e.cfg.ramDist;
      ctx.fillStyle = COLORS.bossRam;
      ctx.globalAlpha = 0.05 + 0.12 * k;
      ctx.beginPath();
      ctx.moveTo(e.x + nx, e.y + ny); ctx.lineTo(ex + nx, ey + ny);
      ctx.lineTo(ex - nx, ey - ny); ctx.lineTo(e.x - nx, e.y - ny);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = COLORS.bossRam;
      ctx.globalAlpha = 0.3 + 0.5 * k;
      ctx.lineWidth = 2;
      if (!locked) { ctx.setLineDash([10, 8]); ctx.lineDashOffset = -e.age * 60; }
      for (const s of [1, -1]) {
        ctx.beginPath();
        ctx.moveTo(e.x + nx * s, e.y + ny * s);
        ctx.lineTo(ex + nx * s, ey + ny * s);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
      ctx.globalAlpha = 1;
    }
    // в броске за ним тянутся полосы скорости
    if (e.state === 'ram') {
      ctx.strokeStyle = COLORS.bossRam;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.45;
      for (const s of [-0.6, 0, 0.6]) {
        const px = e.x - e.dir.y * e.r * s, py = e.y + e.dir.x * e.r * s;
        ctx.beginPath();
        ctx.moveTo(px - e.dir.x * e.r * 0.8, py - e.dir.y * e.r * 0.8);
        ctx.lineTo(px - e.dir.x * e.r * 2.6, py - e.dir.y * e.r * 2.6);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    const color = glowing ? BOSS_ATTACK_COLOR[e.attack] : COLORS.boss;
    g.drawUnitBody(e, color, true);
    ctx.strokeStyle = '#0e0e10';
    ctx.lineWidth = 3;
    const f = e.facing || -Math.PI / 2;
    for (const s of [0.75, -0.75]) {
      ctx.beginPath();
      ctx.moveTo(e.x + Math.cos(f + s) * e.r * 0.55, e.y + Math.sin(f + s) * e.r * 0.55);
      ctx.lineTo(e.x + Math.cos(f + s) * e.r * 1.25, e.y + Math.sin(f + s) * e.r * 1.25);
      ctx.stroke();
    }
    // злобный взгляд перед тараном: глаза больше, над ними сведённые к переносице брови
    ctx.fillStyle = glowing ? '#fff3c0' : COLORS.bossGlow;
    for (const s of [0.35, -0.35]) {
      ctx.beginPath();
      ctx.arc(e.x + Math.cos(f + s) * e.r * 0.5, e.y + Math.sin(f + s) * e.r * 0.5, e.r * (angry ? 0.17 : 0.13), 0, Math.PI * 2);
      ctx.fill();
    }
    if (angry) {
      ctx.strokeStyle = '#0e0e10';
      ctx.lineWidth = 4;
      for (const s of [1, -1]) {
        ctx.beginPath();
        ctx.moveTo(e.x + Math.cos(f + s * 0.75) * e.r * 0.62, e.y + Math.sin(f + s * 0.75) * e.r * 0.62);
        ctx.lineTo(e.x + Math.cos(f + s * 0.12) * e.r * 0.78, e.y + Math.sin(f + s * 0.12) * e.r * 0.78);
        ctx.stroke();
      }
    }
    // прицел луча: пока целится, видно линию, куда он выстрелит
    if (e.state === 'beamAim') {
      ctx.strokeStyle = COLORS.fire;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x + Math.cos(f) * e.cfg.beamRange, e.y + Math.sin(f) * e.cfg.beamRange);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    // щит: включён постоянно, вокруг тела пульсирующее кольцо
    ctx.strokeStyle = COLORS.shield;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.65 + 0.2 * Math.sin(e.age * 4);
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r + 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  },
};

G.enemyTypes = { shooter, bull, tower, scorpion, zombie, hunter, mine, portal, boss };
})(window.Game = window.Game || {});
