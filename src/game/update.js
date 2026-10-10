// Обновление кадра: порядок шагов и правила партии (активация врагов, победа, камера).
// Порядок в update() менять нельзя — он влияет на баланс, см. architecture.md.
(function (G) {
'use strict';

const { CONFIG, COLORS, state } = G;
const { clamp, dist, removeFrom, pickWeighted } = G.math;
const { moveAndCollide, slideAlongWall, circleRectOverlap } = G.collision;
const { world, setDoorsOpen } = G.world;
const { leader, leaderSpeedMul, currentRoom, chainUnits, enemyTargets, isSpotted, spawnEnemy, upgrade, cameraTarget } = G.session;
const { freeSpotNear } = G.world;
const { pushTrail, followChain, touchPads, updateBuffs, updateDowned, knockOutAlly, displaceAlly, cutChain, canBeDisplaced } = G.chain;
const { updatePads, updateAllySpawns } = G.pads;
const { updateWaves } = G.waves;
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

// случайный тип для порождения порталом: подвижные типы с весами уровня (enemyWeights)
function pickChaser() { return pickWeighted(chaserTypes, state.level.enemyWeights || {}); }

// то, что игра даёт записям типов из content/ параметром: сами они game/ не подключают
const game = {
  state, world, chainUnits, isSpotted, meleeHittable, upgrade,
  nearestTarget: combat.nearestTarget, damageUnit: combat.damageUnit, blast: combat.blast,
  spawnProjectile: combat.spawnProjectile, spawnMortar: combat.spawnMortar,
  spawnBigMortar: combat.spawnBigMortar, spawnHook: combat.spawnHook,
  spawnFirewall: combat.spawnFirewall,
  knockOutAlly, displaceAlly, cutChain, canBeDisplaced, wanderStep, stepOffSpikes, chaseStep, removeFrom,
  spawnEnemy, freeSpotNear, pickChaser,
};

// «танковое» движение Героя с инерцией: A/D поворачивают направление (heading), W/S дают газ
// вперёд/назад вдоль него. Скорость тянется к желаемой с разгоном, без газа — накат и торможение.
// heading отдельно от facing: оружие поворачивает facing к цели, но не должно разворачивать Героя
function updateLeader(dt) {
  const lead = leader();
  const mv = lead.moveMul || 1;   // усиление подиума скорости: быстрее ход и разворот
  const speedMul = leaderSpeedMul(); // длинная цепочка едет медленнее (разворот не замедляется), но под «скоростью» — не ниже базовой
  const cfg = CONFIG.LEADER;
  const { throttle, turn } = state.moveInput;

  // в экранных координатах (y вниз) уменьшение угла — поворот налево
  lead.heading += turn * cfg.turnSpeed * mv * dt;
  lead.facing = lead.heading;

  const k = throttle > 0 ? 1 : throttle < 0 ? -cfg.reverseMul : 0;
  const wantX = Math.cos(lead.heading) * cfg.speed * speedMul * k;
  const wantY = Math.sin(lead.heading) * cfg.speed * speedMul * k;
  const dx = wantX - lead.vx, dy = wantY - lead.vy;
  const gap = Math.hypot(dx, dy);
  const step = (k ? cfg.accel : cfg.brake) * mv * dt;
  if (gap <= step) { lead.vx = wantX; lead.vy = wantY; }
  else { lead.vx += (dx / gap) * step; lead.vy += (dy / gap) * step; }

  const sp = Math.hypot(lead.vx, lead.vy);
  if (sp > 0.5) {
    // упёршись в стену, не тормозим в ноль, а скользим вдоль неё
    const normal = moveAndCollide(lead, lead.vx * dt, lead.vy * dt, world.moveBlockers);
    if (normal) slideAlongWall(lead, normal, cfg.wallFriction);
  }
}

// улучшение «таран»: Герой, врезавшись во врага, ранит его — тем сильнее, чем быстрее сближался (на полной
// скорости хода — dmg); одного врага — не чаще раза в cooldown. Тела у края касаются после расталкивания прошлого кадра
function applyHeroRam() {
  const up = upgrade('ram');
  if (!up) return;
  const lead = leader();
  for (const e of state.enemies.slice()) {
    if (!meleeHittable(e)) continue;
    const d = dist(lead, e);
    if (d > lead.r + e.r + 2 || state.time - (e.rammedAt || -99) < up.cooldown) continue;
    const closing = (lead.vx * (e.x - lead.x) + lead.vy * (e.y - lead.y)) / (d || 1);
    if (closing < up.minSpeed) continue;
    e.rammedAt = state.time;
    combat.damageUnit(e, up.dmg * Math.min(1.3, closing / CONFIG.LEADER.speed) * (lead.dmgMul || 1));
    state.effects.push({ type: 'ring', x: (lead.x + e.x) / 2, y: (lead.y + e.y) / 2, r: 16, life: 0.25, color: COLORS.speed });
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
    if (dist(a, e) <= a.r + e.r) { combat.damageUnit(e, def.contactDmg); hit = true; }
  }
  if (hit) {
    a.spikyCd = def.contactInterval;
    state.effects.push({ type: 'ring', x: a.x, y: a.y, r: a.r + 6, life: 0.15, color: def.color });
  }
}

// оружие союзника (в цепочке или выбитого): работает оружие текущей способности, шипастость бьёт касанием
function updateWeapons(a, dt) {
  for (const w of a.gear) weapons[w.type].update(a, w, dt * (a.rateMul || 1), game);
  if (a.buffs.spiky > 0) applySpikyContact(a, dt);
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
  // продержаться заданное время (база цела — иначе партия уже проиграна)
  if (rule.kind === 'survive') return state.time >= rule.time;
  if (rule.kind === 'destroyType') return !state.enemies.some((e) => e.type === rule.type);
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
  for (const d of state.downed) updateDowned(d, dt);
  // выбитые союзники не выходят из боя: стреляют, рубят и лечат лёжа
  for (const d of state.downed.slice()) updateWeapons(d, dt);
  updateDoors();
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
