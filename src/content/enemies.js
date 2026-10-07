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
//   onSpawn      — (e, game): после появления посреди партии (game.spawnEnemy, game.freeSpotNear) — например,
//                  поставить рядом связанного второго врага (колесница и её катапульта)
//   spawnCost    — сколько мест занимает в волне «Обороны» и в вызове подкрепления Демона (нет поля — 1)
//   update       — (e, dt, chain, game): поведение за кадр, когда враг активен и жив
//   lateUpdate   — (e, chain, game): шаг после боя и среды (мина: обнаружение и подрыв)
//   draw         — (e, g): тело врага; полоску HP рисует сцена
//   hiddenUntilRevealed — враг невидим и неуязвим для прицеливания, пока e.revealed не станет true
//   ignoredForVictory   — не считается в условии победы
//   rangedOnly   — ближний бой (кулак, копьё, шипастость, таран Героя) его не ранит, только выстрелы и молния
//   noRegen      — не отлечивается сам (портал)
//   alwaysActive — живёт и действует на любом расстоянии от игрока (портал)
//   deathFlash   — радиус вспышки при гибели (только вид)
//   drawReach    — рисовать, даже если тело дальше стольких px за краем экрана (у спрута тени и мины далеко от тела)
// В stats может быть keepClear — радиус вокруг громадины, где не появляются подиумы и дружочки.
// Ближние атаки (укус, таран) передают в game.damageUnit третий параметр { by: e, melee: true } —
// на них отвечают улучшения копейщика (см. game/combat.js).
// Всё, что нужно от игры, запись получает параметром game, а от рисования — параметром g
// и никогда не подключает game/ и render/ сама.
(function (G) {
'use strict';

const { COLORS } = G;
const { clamp, dist, pickOne } = G.math;
const { moveAndCollide, circleRectOverlap, distToSegment } = G.collision;

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
           dmg: 17,                 // урон в эпицентре
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
  stats: { name: 'Скорпион', hp: 60, radius: 20, mass: 1.2, range: 456, cooldown: 3.5, dmg: 12,
           projSpeed: 218,         // гарпун летит медленно, его видно заранее
           projRadius: 6,
           pullSpeed: 450,         // с какой скоростью тащит выдернутого союзника
           pinchDmg: 10,           // клешни: союзник совсем рядом — удар вплотную ..
           pinchCooldown: 1,       // .. раз в столько секунд ..
           pinchReach: 10 },       // .. если просвет между телами не больше этого
  wanderSpeed: 48,
  chaseSpeed: 75,
  // тело, две простые клешни вперёд (раскрытые «галочки»; при уколе смыкаются) и короткий хвост-крючок вбок с жалом
  draw(e, g) {
    const { ctx } = g;
    const f = e.facing || 0, r = e.r;
    const at = (a, d) => [e.x + Math.cos(f + a) * r * d, e.y + Math.sin(f + a) * r * d];
    ctx.strokeStyle = COLORS.scorpion;
    ctx.lineCap = 'round';
    // хвост: дуга из-за спины вбок, на конце тёмная точка-жало
    const [t0x, t0y] = at(Math.PI, 0.8), [t1x, t1y] = at(Math.PI + 0.45, 1.45), [t2x, t2y] = at(Math.PI + 1.05, 1.4);
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(t0x, t0y); ctx.quadraticCurveTo(t1x, t1y, t2x, t2y); ctx.stroke();
    ctx.fillStyle = '#5a2a1a';
    ctx.beginPath(); ctx.arc(t2x, t2y, 3, 0, Math.PI * 2); ctx.fill();
    // клешни: короткая рука и две чёрточки-щипцы
    const open = e.pinchFx > 0 ? 0.12 : 0.55;
    ctx.lineWidth = 3;
    for (const s of [1, -1]) {
      const [sx, sy] = at(s * 0.6, 0.85), [hx, hy] = at(s * 0.38, 1.3);
      ctx.beginPath();
      ctx.moveTo(sx, sy); ctx.lineTo(hx, hy);
      for (const jaw of [1, -1]) {
        const ja = f + jaw * open;
        ctx.moveTo(hx, hy); ctx.lineTo(hx + Math.cos(ja) * r * 0.4, hy + Math.sin(ja) * r * 0.4);
      }
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    g.drawUnitBody(e, COLORS.scorpion, true);
    ctx.fillStyle = '#0e0e10';
    for (const s of [0.35, -0.35]) {
      const [x, y] = at(s, 0.55);
      ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
    }
  },
};
const scorpionShoot = ranged(scorpion, (e, foe, game) => game.spawnHook(e, foe));
// гарпун издалека, а союзника, подошедшего вплотную (в цепочке или лежачего), — клешнями раз в pinchCooldown
scorpion.update = function (e, dt, chain, game) {
  e.pinchCd = (e.pinchCd || 0) - dt;
  e.pinchFx = (e.pinchFx || 0) - dt;
  if (e.pinchCd <= 0) {
    let foe = null, best = e.cfg.pinchReach;
    for (const u of chain) {
      if (u.kind === 'base') continue;
      const gap = dist(e, u) - e.r - u.r;
      if (gap <= best) { best = gap; foe = u; }
    }
    if (foe) {
      e.facing = Math.atan2(foe.y - e.y, foe.x - e.x);
      game.damageUnit(foe, e.cfg.pinchDmg, { by: e, melee: true });
      e.pinchCd = e.cfg.pinchCooldown;
      e.pinchFx = 0.2;
      game.state.effects.push({ type: 'beam', x1: e.x, y1: e.y, x2: foe.x, y2: foe.y, life: 0.15, color: COLORS.scorpion });
    }
  }
  scorpionShoot(e, dt, chain, game);
};

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
      game.damageUnit(foe, e.cfg.dmg, { by: e, melee: true });
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
  stats: { name: 'Бычок', hp: 88, radius: 18, mass: 3, dmg: 12, aggro: 430, walkSpeed: 55,
           telegraph: 0.7, chargeSpeed: 540, chargeMaxDist: 720, chargeCooldown: 1.6,
           chargeStartSpeed: 150,   // с какой скорости начинается рывок
           chargeAccel: 780,        // разгон во время рывка
           chargeBrake: 620,        // торможение после того, как кого-то переехал
           chargeStopSpeed: 110,    // на какой скорости рывок заканчивается
           repeatDamage: 0.5,       // множитель урона для всех целей после первой
           knockoutChance: 0.3,     // шанс выбить из цепочки того, кого переехал (лежачего — отбросить)
           maxPushes: 2,            // больше стольких союзников за один рывок не выбивает и не отбрасывает
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
        e.pushes = 0;
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
      game.damageUnit(u, dmg, { by: e, melee: true });
      if (u.hp > 0 && e.pushes < cfg.maxPushes && Math.random() < cfg.knockoutChance
          && game.displaceAlly(u, Math.atan2(u.y - e.y, u.x - e.x), cfg.knockbackSpeed)) e.pushes += 1;
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

// Колесница: Бычок, запряжённый в катапульту. Не разгоняется, а идёт вплотную и бодает; за собой на упряжи тащит
// катапульту — отдельного врага (обычная катапульта, стреляет сама; её можно бить и убить отдельно, e.cart).
// Погибла катапульта — дальше это обычный Бычок, с рывком; погиб бык — катапульта остаётся стоять, где была.
// Появляется только в волнах «Обороны» и занимает в волне два места (spawnCost); враг волны (e.chasing) без цели
// идёт к базе на своей скорости шага. Поля chaseSpeed нет нарочно: порталы Playground её не порождают
const chariot = {
  stats: { ...bull.stats, name: 'Колесница', aggro: 600,
           walkSpeed: 50,           // тянет катапульту — медленнее Бычка
           buttDmg: 9, buttCooldown: 1.1,
           reach: 6,                // с какого просвета между телами достаёт
           hitch: 50 },             // длина упряжи: между центрами быка и катапульты
  wanderSpeed: 34,
  spawnCost: 2,
  init(e) { bull.init(e); e.cart = null; },
  onSpawn(e, game) {
    const spot = game.freeSpotNear(e.x, e.y, e.cfg.hitch, e.cfg.hitch + 30, 22) || { x: e.x - e.cfg.hitch, y: e.y };
    e.cart = game.spawnEnemy('tower', spot.x, spot.y, e.room, { linked: e }); // linked — друг друга не толкают
    e.linked = e.cart;
  },
  update(e, dt, chain, game) {
    if (e.cart && !game.state.enemies.includes(e.cart)) e.cart = null;
    if (!e.cart) { bull.update(e, dt, chain, game); return; } // осталась без катапульты — обычный Бычок
    e.cd -= dt;
    const foe = game.nearestTarget(e, chain, e.cfg.aggro);
    if (!foe) {
      if (e.chasing) game.chaseStep(e, dt, e.cfg.walkSpeed);
      else if (!game.stepOffSpikes(e, dt, chariot.wanderSpeed * 1.6)) game.wanderStep(e, dt, chariot.wanderSpeed);
    } else {
      e.facing = Math.atan2(foe.y - e.y, foe.x - e.x);
      const gap = dist(e, foe) - e.r - foe.r;
      if (gap > e.cfg.reach * 0.5) game.chaseStep(e, dt, e.cfg.walkSpeed, e.r + foe.r + e.cfg.reach * 0.5, foe);
      if (gap <= e.cfg.reach && e.cd <= 0) {
        game.damageUnit(foe, e.cfg.buttDmg, { by: e, melee: true });
        e.cd = e.cfg.buttCooldown;
        game.state.effects.push({ type: 'beam', x1: e.x, y1: e.y, x2: foe.x, y2: foe.y, life: 0.15, color: COLORS.bull });
      }
    }
    // упряжь: катапульта тянется следом, если бык отошёл дальше её длины
    const c = e.cart, d = dist(e, c);
    if (d > e.cfg.hitch) {
      const k = (d - e.cfg.hitch) / d;
      moveAndCollide(c, (e.x - c.x) * k, (e.y - c.y) * k, game.world.moveBlockers);
    }
  },
  draw(e, g) {
    const c = e.cart;
    if (c && c.hp > 0) {
      // две оглобли от быка к катапульте
      const { ctx } = g;
      const a = Math.atan2(c.y - e.y, c.x - e.x), nx = -Math.sin(a), ny = Math.cos(a);
      ctx.strokeStyle = '#8a6a48';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (const s of [1, -1]) {
        ctx.moveTo(e.x + nx * e.r * 0.6 * s, e.y + ny * e.r * 0.6 * s);
        ctx.lineTo(c.x + nx * c.r * 0.7 * s, c.y + ny * c.r * 0.7 * s);
      }
      ctx.stroke();
    }
    bull.draw(e, g);
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

// щит (босс, турель): тот, кто подошёл вплотную (shieldAuraExtra от края тела), раз в shieldContactInterval
// получает shieldContactDmg. Выстрелы щит гасит сам (см. e.shielded в game/combat.js)
function shieldContact(e, dt, chain, game) {
  const cfg = e.cfg;
  e.shieldContactCd -= dt;
  if (e.shieldContactCd > 0) return;
  let hit = false;
  for (const u of chain) {
    if (dist(e, u) <= e.r + cfg.shieldAuraExtra + u.r) { game.damageUnit(u, cfg.shieldContactDmg); hit = true; }
  }
  if (hit) e.shieldContactCd = cfg.shieldContactInterval;
}

// кольцо щита вокруг тела: пульсирует, пока щит включён
function drawShield(e, g, extra) {
  const { ctx } = g;
  ctx.strokeStyle = COLORS.shield;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.65 + 0.2 * Math.sin(e.age * 4);
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.r + extra, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// Дверь-мишень (обучение): стоит в проходе из комнаты и не пускает дальше. Сама не действует, не лечится;
// ближний бой её не берёт — только выстрелы. Рисуется плитой двери во всю высоту прохода с мишенью
const doorTarget = {
  stats: { name: 'Дверь-мишень', hp: 60, radius: 20, mass: Infinity,
           slabW: 26, slabH: 120 },     // плита двери (только вид): ширина и высота прохода
  rangedOnly: true,
  noRegen: true,
  deathFlash: 90,
  draw(e, g) {
    const { ctx } = g;
    const w = e.cfg.slabW, h = e.cfg.slabH;
    ctx.fillStyle = COLORS.door;
    ctx.fillRect(e.x - w / 2, e.y - h / 2, w, h);
    ctx.strokeStyle = COLORS.doorEdge;
    ctx.lineWidth = 2;
    ctx.strokeRect(e.x - w / 2 + 1, e.y - h / 2 + 1, w - 2, h - 2);
    // мишень: красно-белые кольца
    for (const [r, color] of [[e.r, COLORS.enemy], [e.r * 0.66, '#f0f0f5'], [e.r * 0.33, COLORS.enemy]]) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  },
};

// Турель: неподвижная башня под щитом, часто стреляет по ближайшему союзнику. Щит гасит выстрелы цепочки
// (усиление «сила» пробивает), а тот, кто подошёл вплотную, обжигается о него, как о щит демона
const turret = {
  stats: { name: 'Турель', hp: 90, radius: 22, mass: Infinity, range: 400, cooldown: 0.45, dmg: 4,
           projSpeed: 380, projRadius: 4,
           shieldAuraExtra: 12, shieldContactDmg: 7, shieldContactInterval: 0.4 },
  noRegen: true,
  init(e) { e.shielded = true; e.shieldContactCd = 0; e.age = 0; },
  draw(e, g) {
    const { ctx } = g;
    // восьмиугольное основание и ствол к цели
    ctx.fillStyle = COLORS.turret;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      ctx.lineTo(e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r);
    }
    ctx.closePath();
    ctx.fill();
    const f = e.facing || 0;
    ctx.strokeStyle = '#0e0e10';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(e.x + Math.cos(f) * e.r * 1.25, e.y + Math.sin(f) * e.r * 1.25);
    ctx.stroke();
    ctx.fillStyle = '#0e0e10';
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r * 0.42, 0, Math.PI * 2);
    ctx.fill();
    drawShield(e, g, e.cfg.shieldAuraExtra);
  },
};
const turretFire = ranged(turret, (e, foe, game) => {
  game.spawnProjectile(e, foe.x, foe.y, e.cfg.projSpeed, e.cfg.dmg, 'enemy', e.cfg.projRadius);
});
turret.update = function (e, dt, chain, game) {
  e.age += dt;
  shieldContact(e, dt, chain, game);
  turretFire(e, dt, chain, game);
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
    // n мест; колесница занимает два (spawnCost)
    const cost = (type) => TYPES[type].spawnCost || 1;
    let slots = cfg.summonMin + Math.floor(Math.random() * (cfg.summonMax - cfg.summonMin + 1));
    while (slots > 0) {
      const type = pickOne(cfg.summonTypes.filter((t) => cost(t) <= slots));
      slots -= cost(type);
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
    game.damageUnit(u, cfg.ramDmg, { by: e, melee: true });
    if (u.hp <= 0) continue;
    // отлетает вперёд-вбок от линии тарана — в ту сторону, где тело и было
    const side = (u.x - e.x) * -e.dir.y + (u.y - e.y) * e.dir.x >= 0 ? 1 : -1;
    const a = Math.atan2(e.dir.y, e.dir.x) + side * Math.PI * 0.35;
    if (!game.displaceAlly(u, a, cfg.ramKnockback)) { u.vx = Math.cos(a) * cfg.ramShove; u.vy = Math.sin(a) * cfg.ramShove; }
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
           // на ramDmg; дружочков выбивает из цепочки в стороны, Героя отшвыривает вбок. Редкая: при сближении
           // срабатывает лишь с шансом ramChance, не вышло — следующая попытка через ramCooldown (как и после тарана)
           ramTrigger: 115, ramAim: 2, ramLock: 0.3, ramCooldown: 8, ramChance: 0.2,
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
    shieldContact(e, dt, chain, game);

    // Герой подошёл слишком близко — босс бросает всё (кроме уже начатой атаки) и готовит таран
    if (e.state === 'idle' && e.ramCd <= 0 && dist(e, lead) - e.r - lead.r <= cfg.ramTrigger) {
      if (Math.random() >= cfg.ramChance) e.ramCd = cfg.ramCooldown;
      else { e.state = 'ramAim'; e.attack = 'ram'; e.timer = cfg.ramAim; return; }
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
    drawShield(e, g, 10);
  },
};

// Спрут: босс «Логова», прикопан посреди зала — не ходит, но лечится очень быстро (cfg.regen HP в секунду, всегда),
// так что сбить его можно только всей цепочкой разом. Атаки идут независимо друг от друга:
//  - тентакля: на полу появляется тень полосы от спрута к союзнику, через tentacleAim — удар по ней. Задетых
//    ранит, а если задето звено цепочки — всё от него до хвоста отрезано от Героя и вылетает из цепи (game.cutChain);
//  - всасывание: дружочков не в цепи (лежачих и ждущих вербовки) ближе suckRadius тянет к телу, чем ближе — тем
//    быстрее; дотянуло — спрут их проглатывает (видно, как тело уходит в пасть, а сам он вспухает);
//  - пук: Герой подошёл совсем близко (fartTrigger) — раз в fartCooldown вокруг Героя кучно ложатся несколько
//    фиолетовых облаков, как у Зомби;
//  - плевок слизью: раз в globEvery навесом бросает ком слизи в Героя (если видит его, иначе — в ближайшего видимого
//    союзника) с упреждением по его ходу, но неточно (globError). Ком упал на союзника — сразу взрыв; промахнулся —
//    остаётся лежать лужей (мина) mineLife секунд. Въехало в лужу звено цепочки — через случайные mineFuse секунд
//    взрыв: урон по площади (никого не раскидывает).
// Тени, тентакли, летящие комья и лужи лежат в самом спруте (e.tentacles, e.globs, e.mines) и рисуются с ним,
// поэтому drawReach. Проглоченные дружочки досматривают анимацию в e.eating.
const rand = ([a, b]) => a + Math.random() * (b - a);

function tentacleEnd(e, t) {
  return { x: e.x + Math.cos(t.a) * e.cfg.tentacleRange, y: e.y + Math.sin(t.a) * e.cfg.tentacleRange };
}

// удар тентакли по своей полосе: всех задетых ранит, а цепочку перерубает перед первым задетым звеном (не Героем)
function tentacleSlam(e, t, game) {
  const cfg = e.cfg, end = tentacleEnd(e, t), party = game.state.party;
  const hit = (u) => distToSegment(u.x, u.y, e.x, e.y, end.x, end.y) < cfg.tentacleWidth / 2 + u.r;
  let cut = 0;
  party.forEach((u, i) => { if (i > 0 && !cut && hit(u)) cut = i; });
  for (const u of party.concat(game.state.downed)) {
    if (!hit(u)) continue;
    game.damageUnit(u, cfg.tentacleDmg, { by: e, melee: true });
    game.state.effects.push({ type: 'ring', x: u.x, y: u.y, r: u.r + 8, life: 0.3, color: COLORS.tentacle });
  }
  if (cut) game.cutChain(cut);
}

function krakenTentacles(e, dt, chain, game) {
  const cfg = e.cfg;
  for (const t of e.tentacles.slice()) {
    t.t += dt;
    if (t.phase === 'aim' && t.t >= cfg.tentacleAim) { tentacleSlam(e, t, game); t.phase = 'slam'; t.t = 0; }
    else if (t.phase === 'slam' && t.t >= cfg.tentacleShow) game.removeFrom(e.tentacles, t);
  }
  e.tentacleCd -= dt;
  if (e.tentacleCd > 0) return;
  // бьёт по случайному союзнику ближе tentacleTrigger — звену цепочки, Герою или лежачему; сам удар длиннее
  const reach = chain.filter((u) => u.kind !== 'base' && dist(e, u) <= cfg.tentacleTrigger);
  if (!reach.length) { e.tentacleCd = 0.3; return; }
  const foe = pickOne(reach);
  e.tentacles.push({ a: Math.atan2(foe.y - e.y, foe.x - e.x), t: 0, phase: 'aim' });
  e.tentacleCd = rand(cfg.tentacleCooldown);
}

// всасывание: лежачих и ждущих вербовки рядом тянет к телу — у края зоны со скоростью suckSpeed, у самого тела
// в suckAccel раз быстрее; дотянуло — проглатывает: дружочек гибнет, а его тело ещё eatTime секунд уходит в пасть
function krakenSuck(e, dt, game) {
  const cfg = e.cfg, st = game.state;
  for (const f of e.eating.slice()) { f.t += dt; if (f.t >= cfg.eatTime) game.removeFrom(e.eating, f); }
  e.gulp = Math.max(0, e.gulp - dt);
  e.sucking = [];
  for (const u of st.downed.concat(st.neutrals)) {
    const d = dist(e, u), touch = e.r + u.r + 2;
    if (d > cfg.suckRadius) continue;
    if (d <= touch + 1) {
      e.eating.push({ u, x: u.x, y: u.y, t: 0 });
      e.gulp = cfg.eatTime;
      game.damageUnit(u, u.hp + 1);
      continue;
    }
    e.sucking.push(u);
    const near = 1 - (d - touch) / (cfg.suckRadius - touch);
    const step = Math.min(cfg.suckSpeed * (1 + (cfg.suckAccel - 1) * near) * dt, d - touch);
    u.drag = null;
    moveAndCollide(u, ((e.x - u.x) / d) * step, ((e.y - u.y) / d) * step, game.world.moveBlockers);
  }
}

// пук: Герой совсем рядом (просвет до fartTrigger) — раз в fartCooldown вокруг него кучно ложатся fartCount облаков
function krakenFart(e, dt, game) {
  const cfg = e.cfg, st = game.state, lead = st.party[0];
  e.fartCd -= dt;
  e.fartFx = Math.max(0, e.fartFx - dt);
  if (e.fartCd > 0 || dist(e, lead) - e.r - lead.r > cfg.fartTrigger) return;
  e.fartCd = cfg.fartCooldown;
  e.fartFx = 0.6;
  for (let k = 0; k < cfg.fartCount; k++) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * cfg.fartSpread;
    const c = { x: lead.x + Math.cos(a) * d, y: lead.y + Math.sin(a) * d };
    st.clouds.push({ ...c, r: cfg.fartRadius, cur: 0, t: 0, life: cfg.fartLife, dps: cfg.fartDps, grow: 0.6,
                     color: COLORS.krakenFart });
    st.effects.push({ type: 'beam', x1: e.x, y1: e.y, x2: c.x, y2: c.y, life: 0.3, color: COLORS.krakenFart });
  }
  st.effects.push({ type: 'ring', x: e.x, y: e.y, r: e.r + 30, life: 0.5, color: COLORS.krakenFart });
}

// плевок слизью: цель — Герой, если его видно (через стены и колонны не плюёт — за укрытием можно спрятаться),
// иначе ближайший видимый союзник; точка — с упреждением по ходу цели
// (globLead от её смещения за время полёта) плюс случайный промах в globError
function krakenSpit(e, dt, chain, game) {
  const cfg = e.cfg;
  for (const b of e.globs.slice()) {
    b.t += dt;
    if (b.t < b.flight) continue;
    game.removeFrom(e.globs, b);
    globLand(e, b, game);
  }
  e.globCd -= dt;
  if (e.globCd > 0) return;
  const lead = chain[0];
  const foe = game.nearestTarget(e, [lead], cfg.globRange)
    || game.nearestTarget(e, chain.filter((u) => u.kind !== 'base'), cfg.globRange);
  if (!foe) { e.globCd = 0.5; return; }
  const a = Math.random() * Math.PI * 2, miss = rand(cfg.globError);
  const tx = foe.x + (foe.vx || 0) * cfg.globFlight * cfg.globLead + Math.cos(a) * miss;
  const ty = foe.y + (foe.vy || 0) * cfg.globFlight * cfg.globLead + Math.sin(a) * miss;
  e.globs.push({ sx: e.x, sy: e.y, tx, ty, t: 0, flight: cfg.globFlight });
  e.globCd = rand(cfg.globEvery);
}

// ком упал: задел союзника — взрыв сразу; иначе растекается лужей, если там пол, а не пропасть или стена.
// Луж не больше mineMax: лишняя высыхает самая старая
function globLand(e, b, game) {
  const cfg = e.cfg, st = game.state, at = { x: b.tx, y: b.ty };
  if (st.party.concat(st.downed).some((u) => dist(at, u) < cfg.mineRadius + u.r * 0.5)) { mineBlast(e, at, game); return; }
  if (game.world.moveBlockers.some((rect) => circleRectOverlap(at.x, at.y, cfg.mineRadius * 0.5, rect))) {
    st.effects.push({ type: 'ring', x: at.x, y: at.y, r: cfg.mineRadius * 0.6, life: 0.4, color: COLORS.krakenEdge });
    return;
  }
  e.mines.push({ x: at.x, y: at.y, r: cfg.mineRadius, age: 0, fuse: null, seed: Math.random() * 10 });
  if (e.mines.length > cfg.mineMax) e.mines.shift();
}

// взрыв слизи: только урон по площади (от mineDmg в центре до mineEdgeDmg на краю) — никого не раскидывает
function mineBlast(e, m, game) {
  const cfg = e.cfg, st = game.state;
  game.blast(m, cfg.mineBlast, cfg.mineDmg, st.party.concat(st.downed), m, cfg.mineEdgeDmg);
}

function krakenMines(e, dt, game) {
  const cfg = e.cfg, party = game.state.party;
  for (const m of e.mines.slice()) {
    m.age += dt;
    if (m.fuse === null) {
      // въехали — запал случайной длины; не тронутая до конца жизни мина гаснет сама
      if (m.age >= cfg.mineArm && party.some((u) => dist(m, u) < m.r + u.r * 0.5)) m.fuse = rand(cfg.mineFuse);
      else if (m.age >= cfg.mineLife) game.removeFrom(e.mines, m);
      continue;
    }
    m.fuse -= dt;
    if (m.fuse > 0) continue;
    game.removeFrom(e.mines, m);
    mineBlast(e, m, game);
  }
}

// летящий ком слизи: на земле — пунктирный круг, куда упадёт, внутренний круг растёт к падению; сам ком летит дугой,
// под ним тень
function drawGlob(e, b, g) {
  const { ctx } = g, R = e.cfg.mineRadius;
  const k = Math.min(1, b.t / b.flight);
  ctx.strokeStyle = COLORS.krakenEdge;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.3 + 0.5 * k;
  ctx.setLineDash([6, 6]);
  ctx.beginPath(); ctx.arc(b.tx, b.ty, R, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(b.tx, b.ty, R * k, 0, Math.PI * 2); ctx.stroke();
  const x = b.sx + (b.tx - b.sx) * k, y = b.sy + (b.ty - b.sy) * k, h = Math.sin(k * Math.PI) * 90;
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(x, y, 14, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = COLORS.kraken;
  ctx.beginPath(); ctx.arc(x, y - h, 13, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = COLORS.krakenEdge;
  ctx.lineWidth = 2.5;
  ctx.stroke();
}

// тень будущего удара: полоса от тела до конца досягаемости, темнеет и заполняется к удару; сам удар — толстая
// сужающаяся к концу тентакля с присосками, которая гаснет за tentacleShow
function drawTentacle(e, t, g) {
  const { ctx } = g, cfg = e.cfg, end = tentacleEnd(e, t);
  const hw = cfg.tentacleWidth / 2, nx = -Math.sin(t.a), ny = Math.cos(t.a);
  const sx = e.x + Math.cos(t.a) * e.r * 0.8, sy = e.y + Math.sin(t.a) * e.r * 0.8;
  const strip = (len, w0, w1) => {
    const ex = sx + (end.x - sx) * len, ey = sy + (end.y - sy) * len;
    ctx.beginPath();
    ctx.moveTo(sx + nx * w0, sy + ny * w0); ctx.lineTo(ex + nx * w1, ey + ny * w1);
    ctx.lineTo(ex - nx * w1, ey - ny * w1); ctx.lineTo(sx - nx * w0, sy - ny * w0);
    ctx.closePath();
  };
  if (t.phase === 'aim') {
    const k = clamp(t.t / cfg.tentacleAim, 0, 1);
    ctx.fillStyle = '#000';
    ctx.globalAlpha = 0.12 + 0.13 * k;
    strip(1, hw, hw);
    ctx.fill();
    ctx.fillStyle = COLORS.tentacle;
    ctx.globalAlpha = 0.12 + 0.18 * k;
    strip(k, hw, hw);
    ctx.fill();
    ctx.strokeStyle = COLORS.krakenEdge;
    ctx.globalAlpha = 0.35 + 0.5 * k;
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 7]);
    ctx.lineDashOffset = -t.t * 40;
    strip(1, hw, hw);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    ctx.globalAlpha = 1;
    return;
  }
  const fade = 1 - clamp(t.t / cfg.tentacleShow, 0, 1);
  ctx.globalAlpha = fade;
  ctx.fillStyle = COLORS.tentacle;
  strip(1, hw * 0.9, hw * 0.35);
  ctx.fill();
  ctx.strokeStyle = '#0e0e10';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#d8b0f0';
  for (let k = 1; k < 9; k++) {
    const f = k / 9, x = sx + (end.x - sx) * f, y = sy + (end.y - sy) * f;
    ctx.beginPath();
    ctx.arc(x, y, hw * (0.32 - 0.2 * f), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// мина: лужа фиолетовой слизи — того же цвета, что и сам спрут: неровная кромка колышется, внутри медленно всплывают
// пузыри. Появляется, растекаясь; въехали — слизь вспухает, мигает красным, пузыри кипят, видна кромка взрыва
function drawKrakenMine(e, m, g) {
  const { ctx } = g, cfg = e.cfg;
  const lit = m.fuse !== null;
  const t = m.age * (lit ? 6 : 1);
  const grow = clamp(m.age / cfg.mineArm, 0, 1) * (lit ? 1.08 + 0.06 * Math.sin(m.age * 30) : 1);
  const fade = lit ? 1 : clamp((cfg.mineLife - m.age) / 1.5, 0, 1);
  const R = m.r * grow;
  if (R < 1) return;
  // неровная кромка лужи: радиус гуляет суммой синусов со своим для каждой мины сдвигом
  const edge = (a) => R * (0.88 + 0.07 * Math.sin(a * 3 + m.seed + t * 0.8) + 0.05 * Math.sin(a * 5 - m.seed * 2 + t * 1.3));
  ctx.globalAlpha = 0.9 * fade;
  ctx.beginPath();
  for (let i = 0; i <= 36; i++) {
    const a = (i / 36) * Math.PI * 2, rr = edge(a);
    ctx.lineTo(m.x + Math.cos(a) * rr, m.y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = lit && Math.sin(m.age * 30) > 0 ? '#6a1a40' : COLORS.kraken;
  ctx.fill();
  ctx.strokeStyle = lit ? COLORS.krakenMine : COLORS.krakenEdge;
  ctx.lineWidth = 3;
  ctx.stroke();
  // пузыри: всплывают, растут и лопаются, каждый со своим ритмом
  ctx.fillStyle = COLORS.krakenEdge;
  for (let k = 0; k < 5; k++) {
    const ph = (t * 0.5 + k * 0.37 + m.seed) % 1;
    const a = m.seed * 3 + k * 2.4, d = R * (0.15 + 0.13 * k);
    ctx.globalAlpha = 0.55 * fade * Math.sin(ph * Math.PI);
    ctx.beginPath();
    ctx.arc(m.x + Math.cos(a) * d, m.y + Math.sin(a) * d, R * (0.05 + 0.1 * ph), 0, Math.PI * 2);
    ctx.fill();
  }
  if (lit) {
    ctx.strokeStyle = COLORS.krakenMine;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.arc(m.x, m.y, cfg.mineBlast, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.globalAlpha = 1;
}

// всасывание — по направлению к каждой жертве отдельно: от пасти к жертве раскрывается воронка (узкая у пасти,
// шире тела жертвы у неё), по воронке к пасти бегут уголки-шевроны и струйки, а жертву охватывает мерцающая скобка
// со стороны, противоположной спруту, — её словно толкает внутрь
function drawSuck(e, g) {
  const { ctx } = g;
  ctx.strokeStyle = COLORS.krakenSuck;
  ctx.fillStyle = COLORS.krakenSuck;
  ctx.lineCap = 'round';
  for (const u of e.sucking) {
    const a = Math.atan2(u.y - e.y, u.x - e.x), d = dist(e, u);
    const ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
    const at = (t, side) => {                       // точка воронки: t — от пасти (0) к жертве (1), side — от оси
      const w = e.r * 0.25 + (u.r * 1.6 - e.r * 0.25) * t;
      return [e.x + ux * d * t + nx * w * side, e.y + uy * d * t + ny * w * side];
    };
    // воронка
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    ctx.moveTo(...at(0, 1)); ctx.lineTo(...at(1, 1)); ctx.lineTo(...at(1, -1)); ctx.lineTo(...at(0, -1));
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1.5;
    for (const side of [1, -1]) { ctx.beginPath(); ctx.moveTo(...at(0, side)); ctx.lineTo(...at(1, side)); ctx.stroke(); }
    // шевроны, бегущие к пасти: остриём к спруту
    ctx.lineWidth = 3;
    for (let k = 0; k < 4; k++) {
      const t = 1 - ((e.age * 1.8 + k / 4) % 1);
      const [cx, cy] = at(t, 0), w = (e.r * 0.25 + (u.r * 1.6 - e.r * 0.25) * t) * 0.8;
      ctx.globalAlpha = 0.9 * Math.min(1, t * 3);
      ctx.beginPath();
      ctx.moveTo(cx + ux * w * 0.6 + nx * w, cy + uy * w * 0.6 + ny * w);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + ux * w * 0.6 - nx * w, cy + uy * w * 0.6 - ny * w);
      ctx.stroke();
    }
    // струйки — короткие чёрточки вдоль воронки
    ctx.lineWidth = 2;
    for (let k = 0; k < 3; k++) {
      const t = 1 - ((e.age * 2.6 + k / 3 + 0.15) % 1), side = (k - 1) * 0.55;
      const [x1, y1] = at(t, side), [x2, y2] = at(Math.min(1, t + 0.12), side);
      ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    // скобка за жертвой
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.5 + 0.4 * Math.sin(e.age * 14);
    ctx.beginPath(); ctx.arc(u.x, u.y, u.r + 7, a - 1.1, a + 1.1); ctx.stroke();
  }
  ctx.lineCap = 'butt';
  ctx.globalAlpha = 1;
}

const kraken = {
  stats: { name: 'Спрут', hp: 1800, radius: 58, mass: Infinity,
           regen: 250,              // HP в секунду, всегда, даже под огнём
           keepClear: 340,          // подиумы и дружочки не появляются ближе этого к спруту
           // тентакля: тень полосы длиной tentacleRange от центра (около 2/3 экрана), через tentacleAim — удар.
           // Замахивается, только если союзник ближе tentacleTrigger (72% длины удара)
           tentacleRange: 640, tentacleTrigger: 461, tentacleWidth: 46, tentacleAim: 1.5, tentacleDmg: 24,
           tentacleCooldown: [5, 8], // пауза между новыми ударами, сек — атака редкая
           tentacleShow: 0.6,       // сколько видна ударившая тентакля
           // всасывание: дружочков не в цепи ближе suckRadius тянет к телу — у края со скоростью suckSpeed, у тела
           // в suckAccel раз быстрее (с края зоны до пасти — около 1.5 с); проглоченный уходит в пасть за eatTime
           suckRadius: 320, suckSpeed: 110, suckAccel: 2.5, eatTime: 0.6,
           // пук: Герой ближе fartTrigger от края тела — раз в fartCooldown fartCount облаков вокруг Героя (в пределах
           // fartSpread), каждое радиусом fartRadius, fartDps урона в секунду, висит fartLife секунд
           fartTrigger: 110, fartCooldown: 14, fartCount: 5, fartSpread: 110, fartRadius: 70, fartDps: 10, fartLife: 4.5,
           // плевок слизью: раз в globEvery, на дальность globRange по видимой цели; летит globFlight секунд, целится
           // с упреждением (globLead — доля предсказанного смещения цели) и мажет на случайные globError px.
           // Промах — лужа (мина): лежит mineLife секунд, луж не больше mineMax; mineArm — сколько растекается
           globEvery: [2.2, 3.6], globRange: 1400, globFlight: 1.3, globLead: 0.7, globError: [40, 190],
           // взрыв радиусом mineBlast — только урон, никого не раскидывает
           mineMax: 8, mineRadius: 44, mineArm: 0.3, mineLife: 30,
           mineFuse: [0, 1], mineBlast: 62, mineDmg: 30, mineEdgeDmg: 12 },
  noRegen: true,           // общая регенерация врагов не нужна: у спрута своя, постоянная
  alwaysActive: true,
  deathFlash: 260,
  drawReach: 2000,         // тени тентаклей, летящие комья и лужи далеко от тела рисуются вместе с ним
  init(e) {
    e.age = 0;
    e.tentacles = []; e.tentacleCd = 2;
    e.sucking = []; e.eating = []; e.gulp = 0;
    e.fartCd = 3; e.fartFx = 0;
    e.globs = []; e.globCd = 3;
    e.mines = [];
  },
  update(e, dt, chain, game) {
    e.age += dt;
    e.hp = Math.min(e.maxHp, e.hp + e.cfg.regen * dt);
    krakenTentacles(e, dt, chain, game);
    krakenSuck(e, dt, game);
    krakenFart(e, dt, game);
    krakenSpit(e, dt, chain, game);
    krakenMines(e, dt, game);
  },
  draw(e, g) {
    const { ctx } = g, cfg = e.cfg;
    for (const m of e.mines) drawKrakenMine(e, m, g);
    // зона всасывания: неподвижный пунктир (пока кого-то тянет — ярче), к каждой жертве — своя воронка
    const sucking = e.sucking.length > 0, eating = e.eating.length > 0;
    ctx.strokeStyle = COLORS.krakenSuck;
    ctx.lineWidth = 2;
    ctx.globalAlpha = sucking ? 0.4 : 0.2;
    ctx.setLineDash([6, 10]);
    ctx.beginPath();
    ctx.arc(e.x, e.y, cfg.suckRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    if (sucking) drawSuck(e, g);
    ctx.globalAlpha = 1;
    for (const t of e.tentacles) if (t.phase === 'aim') drawTentacle(e, t, g);
    // щупальца-обрубки вокруг тела шевелятся
    ctx.strokeStyle = COLORS.tentacle;
    ctx.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2, wob = Math.sin(e.age * 2.2 + i * 1.7) * 0.5;
      const x0 = e.x + Math.cos(a) * e.r * 0.8, y0 = e.y + Math.sin(a) * e.r * 0.8;
      const x1 = e.x + Math.cos(a + wob * 0.4) * e.r * 1.45, y1 = e.y + Math.sin(a + wob * 0.4) * e.r * 1.45;
      const x2 = e.x + Math.cos(a + wob) * e.r * 1.75, y2 = e.y + Math.sin(a + wob) * e.r * 1.75;
      ctx.lineWidth = 12;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x1, y1, x2, y2); ctx.stroke();
    }
    ctx.lineCap = 'butt';
    const swell = 1 + 0.12 * Math.sin((e.gulp / cfg.eatTime) * Math.PI) + 0.08 * Math.sin((e.fartFx / 0.6) * Math.PI);
    const body = { x: e.x, y: e.y, r: e.r * swell };
    g.drawUnitBody(body, e.fartFx > 0 ? COLORS.krakenFart : COLORS.kraken, true);
    ctx.strokeStyle = COLORS.krakenEdge;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(e.x, e.y, body.r, 0, Math.PI * 2);
    ctx.stroke();
    // пасть: при всасывании раскрыта шире, по кругу зубы
    const mouth = e.r * (eating ? 0.6 : sucking ? 0.5 + 0.06 * Math.sin(e.age * 12) : 0.36);
    ctx.fillStyle = '#0e0e10';
    ctx.beginPath();
    ctx.arc(e.x, e.y, mouth, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8e0f0';
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + e.age * 0.3;
      ctx.beginPath();
      ctx.moveTo(e.x + Math.cos(a - 0.15) * mouth, e.y + Math.sin(a - 0.15) * mouth);
      ctx.lineTo(e.x + Math.cos(a + 0.15) * mouth, e.y + Math.sin(a + 0.15) * mouth);
      ctx.lineTo(e.x + Math.cos(a) * mouth * 0.6, e.y + Math.sin(a) * mouth * 0.6);
      ctx.closePath();
      ctx.fill();
    }
    // проглатываемые: тело по прямой втягивается в пасть, сжимаясь и вытягиваясь к ней
    for (const f of e.eating) {
      const k = clamp(f.t / cfg.eatTime, 0, 1), ease = k * k;
      const a = Math.atan2(f.y - e.y, f.x - e.x), d = dist(e, f) * (1 - ease);
      const u = { ...f.u, x: e.x + Math.cos(a) * d, y: e.y + Math.sin(a) * d, r: f.u.r * (1 - 0.8 * k), facing: a };
      ctx.globalAlpha = 1 - 0.5 * k;
      g.drawUnitBody(u, g.allyColor(f.u), true);
      ctx.globalAlpha = 1;
    }
    for (const b of e.globs) drawGlob(e, b, g);
    for (const t of e.tentacles) if (t.phase === 'slam') drawTentacle(e, t, g);
  },
};

const TYPES = { shooter, bull, tower, scorpion, zombie, hunter, chariot, mine, portal, boss, doorTarget, turret, kraken };
G.enemyTypes = TYPES;
})(window.Game = window.Game || {});
