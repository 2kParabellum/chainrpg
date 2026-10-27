// Обновление кадра: порядок шагов и правила партии (активация врагов, победа, камера).
// Порядок в update() менять нельзя — он влияет на баланс, см. architecture.md.
(function (G) {
'use strict';

const { CONFIG, COLORS, state } = G;
const { clamp, dist, removeFrom, pickWeighted, angleDiff } = G.math;
const { moveAndCollide, slideAlongWall, circleRectOverlap } = G.collision;
const { world, setDoorsOpen, hasLineOfSight } = G.world;
const { leader, leaderSpeedMul, chainMass, currentRoom, chainUnits, enemyTargets, isSpotted, spawnEnemy, upgrade, boostMul, cameraTarget } = G.session;
const { freeSpotNear } = G.world;
const { pushTrail, followChain, touchPads, updateBuffs, updateDowned, updateCharmed, knockOutAlly, displaceAlly, cutChain, canBeDisplaced, charmAlly } = G.chain;
const { updatePads, updateAllySpawns } = G.pads;
const { updateWaves, allWavesOut } = G.waves;
const { updatePod } = G.pod;
const { updateRace } = G.race;
const { updateFlags, allFlagsHeld, allGatesSealed } = G.flags;
const combat = G.combat;
const { updateProjectiles, updateBurns, updateClouds, applySpikes, applyFirewalls, updateEffects, updateCannons } = combat;
const { wanderStep, stepOffSpikes, chaseStep } = G.roaming;
const { separateBodies } = G.bodies;
const { onVictory, updateExit, updateLeavingLink } = G.exit;
const { enemyTypes, weapons } = G;

// типы, которые может породить портал: только те, что умеют гнаться за игроком
const chaserTypes = Object.keys(enemyTypes).filter((k) => enemyTypes[k].chaseSpeed !== undefined);

// враг, которого можно бить вплотную (кулаком, копьём, шипастостью, тараном Героя): обнаруженный и без флага rangedOnly
function meleeHittable(e) { return isSpotted(e) && !enemyTypes[e.type].rangedOnly; }

// случайный тип для порождения порталом: подвижные типы из пула уровня с его весами (enemyWeights)
function pickChaser() {
  const pool = state.level.enemyPool, list = chaserTypes.filter((k) => !pool || pool.includes(k));
  return pickWeighted(list.length ? list : chaserTypes, state.level.enemyWeights || {});
}

// то, что игра даёт записям типов из content/ параметром: сами они game/ не подключают
const game = {
  state, world, chainUnits, isSpotted, meleeHittable, upgrade,
  nearestTarget: combat.nearestTarget, damageUnit: combat.damageUnit, blast: combat.blast,
  spawnProjectile: combat.spawnProjectile, spawnMortar: combat.spawnMortar,
  spawnBigMortar: combat.spawnBigMortar, spawnHook: combat.spawnHook,
  spawnFirewall: combat.spawnFirewall,
  knockOutAlly, displaceAlly, cutChain, canBeDisplaced, charmAlly, wanderStep, stepOffSpikes, chaseStep, removeFrom,
  spawnEnemy, freeSpotNear, pickChaser, hasLineOfSight,
};

// джойстик: куда тянут (aim), туда Герой поворачивает с обычной скоростью поворота
// и всё время едет вперёд — тянут назад, он разворачивается дугой
function aimSteer(lead, aim, maxTurn) {
  const diff = angleDiff(aim, lead.heading);
  return {
    turn: maxTurn > 0 ? clamp(diff / maxTurn, -1, 1) : 0, // у самой цели — ровно до неё, без перелёта
    throttle: 1,
  };
}

// мышь: Герой поворачивает к точке (x, y в мире) и едет к ней. У самой точки (CONFIG.MOUSE.stopRadius) — приехал (reached);
// если точка внутри круга разворота (на этой скорости до неё не довернуть — Герой кружил бы вокруг) или близко за спиной,
// газ отпущен: Герой притормаживает и доворачивает. Точка на расстоянии d под углом diff внутри круга радиуса R = v/ω,
// если d < 2R·|sin diff|
function pointSteer(lead, x, y, maxTurn, turnSpeed) {
  const dx = x - lead.x, dy = y - lead.y, d = Math.hypot(dx, dy);
  if (d < CONFIG.MOUSE.stopRadius) return { turn: 0, throttle: 0, reached: true };
  const angle = Math.atan2(dy, dx), diff = angleDiff(angle, lead.heading);
  const steer = aimSteer(lead, angle, maxTurn);
  const R = Math.hypot(lead.vx, lead.vy) / Math.max(turnSpeed, 1e-6);
  if (d < 2 * R * Math.abs(Math.sin(diff)) || Math.abs(diff) > Math.PI / 2 && d < 2 * R) steer.throttle = 0;
  return steer;
}

// точка, куда Герой едет мышью (state.moveTarget, в мире): пока кнопка зажата — под курсором; отпустили — остаётся
// (с настройкой «ехать, пока держишь» — забыта). Клавиши движения и джойстик её отменяют
function updateMoveTarget() {
  const { throttle, turn, aim, toward, holdOnly } = state.moveInput;
  if (throttle || turn || (aim !== null && aim !== undefined)) state.moveTarget = null;
  else if (toward) state.moveTarget = { x: state.camera.x + toward.x, y: state.camera.y + toward.y };
  else if (holdOnly) state.moveTarget = null;
}

// «танковое» движение Героя с инерцией: A/D поворачивают направление (heading), W даёт газ вперёд вдоль него.
// Заднего хода нет: Герой ездит только вперёд, S — просто без газа.
// Скорость тянется к желаемой с разгоном, без газа — накат и торможение.
// heading отдельно от facing: оружие поворачивает facing к цели, но не должно разворачивать Героя.
// Джойстик задаёт угол aim, из которого получаются те же газ и поворот (aimSteer), мышь — точку state.moveTarget
// (pointSteer; доехал — точка снята).
// Длинная цепочка тяжелее (масса M, см. CHAIN.heft): разгон делится на M (торможение — на меньшую массу), а поворот на ходу упирается
// в предел сцепления — боковое ускорение v·ω не больше, чем у Героя налегке на полной скорости:
// ω ≤ turnSpeed·mv·min(1, speed·mv / (M·v)). Медленно тяжёлая цепочка поворачивает круто, на полном ходу — дугой.
// На скользком полу (world.ice, «Dead Race») его поля — торможение и занос — заменяют обычные.
// Улучшения «Speed Boost» прибавляют к полной скорости, как если бы базовая была выше
function updateLeader(dt) {
  const lead = leader();
  const mv = lead.moveMul || 1;   // усиление подиума скорости: быстрее ход, разгон и разворот
  const speedMul = leaderSpeedMul(); // длинная цепочка едет медленнее (не ниже 70%), но под «скоростью» — не ниже базовой
  const mass = chainMass();
  const cfg = { ...CONFIG.LEADER, ...world.ice };
  cfg.speed *= boostMul('moveAdd');
  const v = Math.hypot(lead.vx, lead.vy);
  const turnSpeed = cfg.turnSpeed * mv * Math.min(1, (cfg.speed * mv) / (mass * Math.max(v, 1)));
  let { throttle, turn } = state.moveInput;
  const aim = state.moveInput.aim;
  updateMoveTarget();
  const target = state.moveTarget;
  if (target) {
    const steer = pointSteer(lead, target.x, target.y, turnSpeed * dt, turnSpeed);
    ({ throttle, turn } = steer);
    if (steer.reached) state.moveTarget = null;
  } else if (aim !== null && aim !== undefined) ({ throttle, turn } = aimSteer(lead, aim, turnSpeed * dt));

  // в экранных координатах (y вниз) уменьшение угла — поворот налево
  lead.heading += turn * turnSpeed * dt;
  lead.facing = lead.heading;

  const k = throttle > 0 ? 1 : 0;
  const wantX = Math.cos(lead.heading) * cfg.speed * speedMul * k;
  const wantY = Math.sin(lead.heading) * cfg.speed * speedMul * k;
  const dx = wantX - lead.vx, dy = wantY - lead.vy;
  const step = (k ? cfg.accel * mv / mass : cfg.brake * mv / chainMass(true)) * dt;
  // занос (LEADER.drift): поперёк носа скорость поправляется в (1 − drift) раз слабее, чем вдоль, — боковая инерция
  // остаётся, Героя сносит. Шаг ограничен эллипсом: там, где боковая ось растянута в 1/(1 − drift) раз, он обычный
  // круговой; при drift 0 — ровно прежний шаг к желаемой скорости
  const side = Math.max(0.05, 1 - cfg.drift);
  const fx = Math.cos(lead.heading), fy = Math.sin(lead.heading);
  const ef = dx * fx + dy * fy, es = (dy * fx - dx * fy) / side;
  const gap = Math.hypot(ef, es);
  const t = gap <= step ? 1 : step / gap;
  const mf = ef * t, ms = es * t * side;
  const gx = mf * fx - ms * fy, gy = mf * fy + ms * fx;

  // тяга (LEADER.thrust): 0 — только поправка выше (колёса со сцеплением гасят движение не туда, куда нос, и с ним
  // часть скорости); 1 — чистая тяга: газ толкает вдоль носа, скорость сверх полной срезается, боковое движение никто
  // не гасит — на повороте скорость не теряется, а Героя сносит, тем сильнее, чем слабее разгон. Между — смесь двух.
  // Без газа — только торможение вдоль движения
  let tx = 0, ty = 0;
  if (cfg.thrust > 0) {
    const cur = Math.hypot(lead.vx, lead.vy);
    let nx = lead.vx + fx * step * k, ny = lead.vy + fy * step * k;
    const top = k ? Math.max(cfg.speed * speedMul, cur - step) : Math.max(0, cur - step);
    const len = Math.hypot(nx, ny);
    if (len > top) { nx *= top / len; ny *= top / len; }
    tx = nx - lead.vx; ty = ny - lead.vy;
  }
  lead.vx += (1 - cfg.thrust) * gx + cfg.thrust * tx;
  lead.vy += (1 - cfg.thrust) * gy + cfg.thrust * ty;

  const sp = Math.hypot(lead.vx, lead.vy);
  if (sp > 0.5) {
    // упёршись в стену, не тормозим в ноль, а скользим вдоль неё
    const normal = moveAndCollide(lead, lead.vx * dt, lead.vy * dt, world.moveBlockers);
    if (normal) slideAlongWall(lead, normal, cfg.wallFriction);
  }
}

// масса тарана: Герой (heroMass) плюс звенья подряд за ним, которые едут примерно туда же, куда Герой.
// Звено едет по следу к тому, кто впереди, поэтому его направление — отрезок до соседа спереди; первое
// звено, отклонившееся больше alignAngle, обрывает счёт
function ramMass(lead, up) {
  const sp = Math.hypot(lead.vx, lead.vy);
  const dx = sp > 1 ? lead.vx / sp : Math.cos(lead.heading), dy = sp > 1 ? lead.vy / sp : Math.sin(lead.heading);
  const minCos = Math.cos(up.alignAngle);
  let mass = up.heroMass;
  for (let i = 1; i < state.party.length; i++) {
    const a = state.party[i], ahead = state.party[i - 1];
    if (a.absorbed) break;
    const sx = ahead.x - a.x, sy = ahead.y - a.y, len = Math.hypot(sx, sy);
    if (len > 1 && (sx * dx + sy * dy) / len < minCos) break;
    mass++;
  }
  return mass;
}

// урон тарана без силы: скорость (в долях полной скорости хода, не больше speedCap) × масса, не больше maxDmg
function ramDamage(up, speed, mass) {
  return Math.min(up.maxDmg, up.dmgPerMass * Math.min(up.speedCap, speed / CONFIG.LEADER.speed) * mass);
}

// улучшение «таран»: Герой, врезавшись во врага, ранит его — скорость сближения × масса цепочки (ramDamage);
// одного врага — не чаще раза в cooldown. Тела у края касаются после расталкивания прошлого кадра.
// lead.ramPower (0..1) — сколько сейчас дал бы таран на текущей скорости от потолка: по нему светится дуга
function applyHeroRam() {
  const up = upgrade('ram');
  const lead = leader();
  if (!up) { lead.ramPower = 0; return; }
  const mass = ramMass(lead, up);
  lead.ramPower = ramDamage(up, Math.hypot(lead.vx, lead.vy), mass) / up.maxDmg;
  for (const e of state.enemies.slice()) {
    if (!meleeHittable(e)) continue;
    const d = dist(lead, e);
    if (d > lead.r + e.r + 2 || state.time - (e.rammedAt || -99) < up.cooldown) continue;
    const closing = (lead.vx * (e.x - lead.x) + lead.vy * (e.y - lead.y)) / (d || 1);
    if (closing < up.minSpeed) continue;
    e.rammedAt = state.time;
    combat.damageUnit(e, ramDamage(up, closing, mass) * (lead.dmgMul || 1),
      { ram: true, mass, speed: closing / CONFIG.LEADER.speed });
    state.effects.push({ type: 'ring', x: (lead.x + e.x) / 2, y: (lead.y + e.y) / 2, r: 12 + 10 * lead.ramPower, life: 0.25, color: COLORS.power });
  }
}

// усиление «шипастость»: раз в contactInterval бьёт всех врагов, которых сейчас касается тело
function applySpikyContact(a, dt) {
  a.spikyCd = (a.spikyCd || 0) - dt;
  if (a.spikyCd > 0) return;
  const def = G.buffs.spiky;
  let hit = false;
  for (const e of state.enemies) {
    if (!meleeHittable(e)) continue;
    if (dist(a, e) <= a.r + e.r) { combat.damageUnit(e, def.contactDmg * boostMul('dmgAdd')); hit = true; }
  }
  if (hit) {
    a.spikyCd = def.contactInterval;
    state.effects.push({ type: 'ring', x: a.x, y: a.y, r: a.r + 6, life: 0.15, color: def.color });
  }
}

// долечивание после лечения медика с улучшением «Lasting Cure»: rate HP в секунду, пока не выйдет время
function applyCure(a, dt) {
  const c = a.cure;
  if (!c || c.left <= 0) return;
  const t = Math.min(dt, c.left);
  c.left -= dt;
  a.hp = Math.min(a.maxHp, a.hp + c.rate * t);
}

// оружие союзника (в цепочке или выбитого): работает оружие текущей способности, шипастость бьёт касанием;
// заодно тикает долечивание
function updateWeapons(a, dt) {
  for (const w of a.gear) weapons[w.type].update(a, w, dt * (a.rateMul || 1), game);
  if (a.buffs.spiky > 0) applySpikyContact(a, dt);
  applyCure(a, dt);
}

// звено цепочки: Герой идёт сам, остальные бегут за ним; когда цепочка уходит в портал выхода — не дерутся,
// а втягиваются в него
function updateAlly(a, dt, i) {
  if (state.leaving) { if (i > 0) updateLeavingLink(a, dt, i); return; }
  if (i > 0) followChain(a, dt, i);
  updateWeapons(a, dt);
}

// общая часть любого врага: регенерация и активация, дальше — поведение по типу
function updateEnemy(e, dt) {
  const type = enemyTypes[e.type];
  if (!type.update) return; // сам ничего не делает (мина)

  // регенерация: если врага давно не задевали, он отлечивается до полного
  if (!type.noRegen) {
    e.regenTimer += dt;
    if (e.regenTimer > CONFIG.ENEMY_REGEN.delay && e.hp < e.maxHp) {
      e.hp = Math.min(e.maxHp, e.hp + (e.maxHp / CONFIG.ENEMY_REGEN.fullTime) * dt);
    }
  }

  // порталы и порождённые ими враги действуют на любом расстоянии, остальные спят вдали от игрока
  if (!type.alwaysActive && !e.chasing && dist(e, leader()) > CONFIG.ACTIVATION_DIST) return;
  // враги целятся в ближайшего союзника — и в цепочке, и выбитого (его добивают), а на «Обороне» — и в базу;
  // первым в списке всегда Герой (на него, например, смотрит босс)
  type.update(e, dt, enemyTargets(), game);
}

// в комнате не осталось врагов (мины не в счёт)
function roomCleared(room) {
  return !state.enemies.some((e) => e.room === room && !enemyTypes[e.type].ignoredForVictory);
}

// выход из комнаты (дверь с clearOpens) открывается навсегда, как только в комнате не осталось врагов.
// Кнопки открывают связанные двери, пока на них лежит брошенный (X) или выбитый союзник — вес тела держит дверь:
// подняли союзника обратно — дверь снова закрывается; дверь с latch, открывшись, больше не закрывается
function updateDoors() {
  if (!world.doors.length) return;
  const openIds = new Set();
  for (const d of world.doors) {
    if (d.open && d.latch) openIds.add(d.id);
    if (d.clearOpens && (d.open || roomCleared(d.room))) openIds.add(d.id);
  }
  for (const btn of world.buttons) {
    btn.pressed = state.downed.some((d) => circleRectOverlap(d.x, d.y, d.r, btn));
    if (btn.pressed) for (const id of btn.doorIds) openIds.add(id);
  }
  for (const d of world.doors) {
    if (!d.open && openIds.has(d.id)) {
      state.effects.push({ type: 'ring', x: d.x + d.w / 2, y: d.y + d.h / 2, r: d.h * 0.7, life: 0.6, color: COLORS.doorEdge });
    }
  }
  setDoorsOpen(openIds);
}

// условие победы задаёт уровень
function isVictory() {
  const rule = state.level.victory;
  if (rule.kind === 'none') return false; // тестовый уровень: играть, пока не надоест
  if (rule.kind === 'endless') return false; // «Endless»: волнам нет конца, партия идёт, пока жив Герой
  // продержаться заданное время (база цела — иначе партия уже проиграна)
  if (rule.kind === 'survive') return state.time >= rule.time;
  if (rule.kind === 'destroyType') return !state.enemies.some((e) => e.type === rule.type);
  // «Hit the Count»: за один проезд по Поду прошло столько дружочков, сколько он просит (см. game/pod.js)
  if (rule.kind === 'podCount') return !!state.pod && state.pod.count >= world.pod.goal;
  // «Dead Race»: пройдено laps кругов (см. game/race.js)
  if (rule.kind === 'laps') return !!state.race && state.race.laps.length >= rule.laps;
  // «Capture the Flags»: горят все флаги — на каждой площадке лежит союзник или едет цепочка (см. game/flags.js)
  if (rule.kind === 'flags') return allFlagsHeld();
  // «Seal the Gates»: закрыты все гнёзда — на каждом флаге часовой пролежал свои секунды и лежит до сих пор
  if (rule.kind === 'seals') return allGatesSealed();
  // «Ambush»: все заранее заданные волны вышли и все враги перебиты
  if (rule.kind === 'waves') return allWavesOut() && !state.enemies.some((e) => !enemyTypes[e.type].ignoredForVictory);
  // дойти до финишной зоны уровня (см. world.finish)
  if (rule.kind === 'reachPoint') {
    const lead = leader();
    return !!world.finish && circleRectOverlap(lead.x, lead.y, lead.r, world.finish);
  }
  // мины добивать необязательно: достаточно перебить всё живое
  const living = state.enemies.filter((e) => !enemyTypes[e.type].ignoredForVictory).length;
  return living === 0 && currentRoom() === rule.finalRoom;
}

// шаг типов, которым нужно видеть итог боя и среды за кадр (мина)
function updateLate() {
  const chain = chainUnits();
  for (const e of state.enemies.slice()) {
    const type = enemyTypes[e.type];
    if (type.lateUpdate) type.lateUpdate(e, chain, game);
  }
}

function update(dt) {
  if (state.status !== 'play') return;

  state.time += dt;
  if (!state.leaving) { updateLeader(dt); applyHeroRam(); } // в портале Герой уже не управляется
  pushTrail();

  // дальнее оружие бьёт по любому врагу в пределах своей дальности, а мину — только после обнаружения
  state.targetableEnemies = state.enemies.filter(isSpotted);

  for (const a of state.party.slice()) {
    const i = state.party.indexOf(a);
    if (i >= 0) updateAlly(a, dt, i);
  }
  touchPads();
  updateBuffs(dt);
  updatePads(dt);
  updateAllySpawns(dt);
  updatePod(dt);
  updateRace();
  for (const d of state.downed) updateDowned(d, dt);
  updateCharmed(dt);
  // выбитые союзники не выходят из боя: стреляют, рубят и лечат лёжа
  for (const d of state.downed.slice()) updateWeapons(d, dt);
  updateDoors();
  updateFlags(dt);
  updateWaves(dt);
  for (const e of state.enemies.slice()) updateEnemy(e, dt);
  separateBodies();
  updateCannons(dt);
  updateProjectiles(dt);
  updateBurns(dt);
  updateClouds(dt);
  applySpikes(dt);
  applyFirewalls(dt);
  updateLate();
  updateEffects(dt);

  // Герой перешёл в другую комнату — запомнить когда (по этому всплывает подсказка комнаты)
  const room = currentRoom();
  if (room !== state.room) { state.room = room; state.roomAt = state.time; }

  // победа открывает портал выхода (на «Обороне» — после волны от базы); заехал в него — уровень пройден
  if (state.status === 'play' && !state.cleared && isVictory()) onVictory();
  updateExit(dt);

  // камера
  const target = cameraTarget();
  const k = Math.min(1, CONFIG.CAMERA_LERP * dt);
  state.camera.x += (target.x - state.camera.x) * k;
  state.camera.y += (target.y - state.camera.y) * k;
}

G.update = { update };
})(window.Game = window.Game || {});
