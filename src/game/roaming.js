// Общие движения врагов: блуждание по своей комнате, сход с шипов, погоня за игроком.
// Ими пользуются записи типов из content/enemies.js.
(function (G) {
'use strict';

const { CONFIG, state } = G;
const { dist } = G.math;
const { moveAndCollide, circleRectOverlap } = G.collision;
const { leader, chainUnits } = G.session;
const { world, spikeRectAt, standsOnSpikes, freeSpotInRoom, hasLineOfSight, flowDir } = G.world;
const { nearestTarget } = G.combat;

// враг, оказавшийся на шипах не в рывке, сходит с них кратчайшим путём
function stepOffSpikes(e, dt, speed) {
  const rect = spikeRectAt(e);
  if (!rect) return false;

  const left = e.x - rect.x, right = rect.x + rect.w - e.x;
  const top = e.y - rect.y, bottom = rect.y + rect.h - e.y;
  const m = Math.min(left, right, top, bottom);
  const dx = m === left ? -1 : m === right ? 1 : 0;
  const dy = m === top ? -1 : m === bottom ? 1 : 0;
  moveAndCollide(e, dx * speed * dt, dy * speed * dt, world.moveBlockers);
  e.wanderTarget = null;
  return true;
}

// случайные перебежки врага в пределах своей комнаты
function wanderStep(e, dt, speed) {
  if (e.anchored) return; // стоит на своём месте (островок), не бродит
  if (e.pauseTimer > 0 && !standsOnSpikes(e)) { e.pauseTimer -= dt; return; }

  if (!e.wanderTarget || dist(e, e.wanderTarget) < CONFIG.WANDER.arrive) {
    e.wanderTarget = freeSpotInRoom(e);
    e.pauseTimer = standsOnSpikes(e) ? 0
      : CONFIG.WANDER.pauseMin + Math.random() * (CONFIG.WANDER.pauseMax - CONFIG.WANDER.pauseMin);
    return;
  }

  const dx = e.wanderTarget.x - e.x, dy = e.wanderTarget.y - e.y;
  const d = Math.hypot(dx, dy);
  const step = Math.min(d, speed * dt);
  const from = { x: e.x, y: e.y };
  moveAndCollide(e, (dx / d) * step, (dy / d) * step, world.moveBlockers);

  // вдоль стены враг скользит, и только застряв окончательно выбирает новую точку
  e.stuckTimer = dist(e, from) < step * 0.35 ? (e.stuckTimer || 0) + dt : 0;
  if (e.stuckTimer > 0.5) {
    e.wanderTarget = null;
    e.stuckTimer = 0;
  }
}

// погоня: враг идёт к цели напрямую, где бы та ни была (по умолчанию — к Герою: так идут порождённые
// порталом). Поиска пути нет: упёршись в препятствие, враг идёт вдоль него, пока путь к цели снова
// не освободится; если обход упёрся в тупик или затянулся, меняет сторону.
// stopDist — на каком расстоянии от цели остановиться, если её видно (стрелки держат дистанцию)
const DETOUR_MAX = 3;       // дольше этого одну сторону обхода не держим
const DETOUR_MIN = 0.4;     // раньше этого обход не заканчиваем, чтобы не дёргаться у стены
const STUCK_TIME = 0.25;    // сколько стоим без продвижения, прежде чем считать, что упёрлись

function pathAheadBlocked(e, ux, uy) {
  const px = e.x + ux * (e.r + 24), py = e.y + uy * (e.r + 24);
  return world.moveBlockers.some((rect) => circleRectOverlap(px, py, e.r, rect));
}

// враг волны (уровень «Оборона», e.siege) идёт к базе, но, увидев союзника ближе waves.sight, — к нему;
// потерял из виду — снова к базе
function siegeTarget(e) {
  return nearestTarget(e, chainUnits().concat(state.downed), state.level.waves.sight) || state.base;
}

// путь по прямой свободен для тела радиуса r: ни стены, ни колонны на средней линии и на краях тела
function clearPath(a, b, r) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
  const nx = (-dy / d) * r, ny = (dx / d) * r;
  return [0, 1, -1].every((k) => hasLineOfSight({ x: a.x + nx * k, y: a.y + ny * k }, { x: b.x + nx * k, y: b.y + ny * k }));
}

function chaseStep(e, dt, speed, stopDist, target) {
  if (!target && e.siege && state.base) {
    target = siegeTarget(e);
    // к базе по прямой — только если путь до неё свободен; иначе по полю направлений через проходы двора
    if (target === state.base && !clearPath(e, target, e.r)) {
      const dir = flowDir(e.x, e.y);
      if (dir) {
        e.detour = 0;
        moveAndCollide(e, dir.x * speed * dt, dir.y * speed * dt, world.moveBlockers);
        return;
      }
    }
  }
  target = target || leader();
  const dx = target.x - e.x, dy = target.y - e.y;
  const d = Math.hypot(dx, dy);
  if (d < 1) return;
  if (stopDist && d < stopDist && hasLineOfSight(e, target)) return;

  let ux = dx / d, uy = dy / d;
  if (e.detour > 0) {
    e.detour -= dt;
    e.detourAge += dt;
    if (e.detourAge > DETOUR_MIN && !pathAheadBlocked(e, ux, uy)) e.detour = 0; // путь свободен
    else {
      // идём вдоль препятствия, слегка прижимаясь к нему в сторону цели
      const px = -uy * e.detourSide, py = ux * e.detourSide;
      const len = Math.hypot(ux * 0.35 + px, uy * 0.35 + py);
      ux = (ux * 0.35 + px) / len;
      uy = (uy * 0.35 + py) / len;
      if (e.detour <= 0) e.detourSide = -e.detourSide;   // затянулось — пробуем с другой стороны
    }
  }

  const step = speed * dt;
  const from = { x: e.x, y: e.y };
  moveAndCollide(e, ux * step, uy * step, world.moveBlockers);

  e.chaseStuck = dist(e, from) < step * 0.35 ? (e.chaseStuck || 0) + dt : 0;
  if (e.chaseStuck > STUCK_TIME) {
    e.chaseStuck = 0;
    if (e.detour > 0) e.detourSide = -e.detourSide;      // обход упёрся в тупик — идём в другую сторону
    else if (!e.detourSide) e.detourSide = Math.random() < 0.5 ? -1 : 1;
    e.detour = DETOUR_MAX;
    e.detourAge = 0;
  }
}

G.roaming = { wanderStep, stepOffSpikes, chaseStep };
})(window.Game = window.Game || {});
