// Мир: статическая геометрия комнат и запросы к ней.
// Только здесь известно, что комнаты стоят в линию слева направо: остальной код
// спрашивает у этого модуля, а не пересчитывает раскладку сам.
(function (G) {
'use strict';

const { CONFIG } = G;
const { circleRectOverlap, segmentHitsRect } = G.collision;
const { ROOM_PLANS } = G.level1;

const world = {
  walls: [], pillars: [], pits: [], spikes: [], floors: [], warnings: [],
  moveBlockers: [], sightBlockers: [],
  width: 0, height: CONFIG.ROOM_H,
};

function roomOriginX(i) { return i * (CONFIG.ROOM_W + CONFIG.CORRIDOR_LEN); }

function roomInterior(i) {
  const ox = roomOriginX(i), W = CONFIG.WALL;
  return { x: ox + W, y: W, w: CONFIG.ROOM_W - 2 * W, h: CONFIG.ROOM_H - 2 * W };
}

function localToWorld(i, cx, cy) {
  const r = roomInterior(i);
  return { x: r.x + cx * r.w, y: r.y + cy * r.h };
}

function buildWorld() {
  world.walls = []; world.pillars = []; world.pits = []; world.spikes = [];
  world.floors = []; world.warnings = [];
  const { ROOM_W, ROOM_H, WALL, CORRIDOR_LEN, CORRIDOR_H, ROOM_COUNT } = CONFIG;
  const gapTop = (ROOM_H - CORRIDOR_H) / 2;
  const gapBottom = (ROOM_H + CORRIDOR_H) / 2;

  for (let i = 0; i < ROOM_COUNT; i++) {
    const ox = roomOriginX(i);
    const last = i === ROOM_COUNT - 1;

    world.floors.push({ x: ox + WALL, y: WALL, w: ROOM_W - 2 * WALL, h: ROOM_H - 2 * WALL });
    world.walls.push({ x: ox, y: 0, w: ROOM_W, h: WALL });
    world.walls.push({ x: ox, y: ROOM_H - WALL, w: ROOM_W, h: WALL });

    // левая стена
    if (i === 0) world.walls.push({ x: ox, y: 0, w: WALL, h: ROOM_H });
    else {
      world.walls.push({ x: ox, y: 0, w: WALL, h: gapTop });
      world.walls.push({ x: ox, y: gapBottom, w: WALL, h: ROOM_H - gapBottom });
    }
    // правая стена
    const rx = ox + ROOM_W - WALL;
    if (last) world.walls.push({ x: rx, y: 0, w: WALL, h: ROOM_H });
    else {
      world.walls.push({ x: rx, y: 0, w: WALL, h: gapTop });
      world.walls.push({ x: rx, y: gapBottom, w: WALL, h: ROOM_H - gapBottom });
    }

    // проход направо
    if (!last) {
      const cx0 = ox + ROOM_W;
      world.floors.push({ x: cx0, y: gapTop, w: CORRIDOR_LEN, h: CORRIDOR_H });
      world.walls.push({ x: cx0, y: gapTop - WALL, w: CORRIDOR_LEN, h: WALL });
      world.walls.push({ x: cx0, y: gapBottom, w: CORRIDOR_LEN, h: WALL });
    }

    // препятствия комнаты
    const plan = ROOM_PLANS[i];
    const inner = roomInterior(i);
    for (const [cx, cy, w, h] of plan.pillars) {
      world.pillars.push({
        x: inner.x + (cx - w / 2) * inner.w, y: inner.y + (cy - h / 2) * inner.h,
        w: w * inner.w, h: h * inner.h,
      });
    }
    for (const [cx, cy, w, h] of plan.pits) {
      world.pits.push({
        x: inner.x + (cx - w / 2) * inner.w, y: inner.y + (cy - h / 2) * inner.h,
        w: w * inner.w, h: h * inner.h,
      });
    }
    for (const [cx, cy, w, h] of plan.spikes) {
      world.spikes.push({
        x: inner.x + (cx - w / 2) * inner.w, y: inner.y + (cy - h / 2) * inner.h,
        w: w * inner.w, h: h * inner.h,
      });
    }
    // в заминированных комнатах на полу у входа нарисованы предупреждающие знаки
    if ((plan.mines || []).length) {
      for (const [cx, cy] of [[0.09, 0.30], [0.09, 0.70]]) {
        world.warnings.push(localToWorld(i, cx, cy));
      }
    }
  }

  world.width = ROOM_COUNT * (ROOM_W + CORRIDOR_LEN) - CORRIDOR_LEN;
  world.sightBlockers = world.walls.concat(world.pillars);
  world.moveBlockers = world.sightBlockers.concat(world.pits);
}

function hasLineOfSight(a, b) {
  for (const rect of world.sightBlockers) {
    if (segmentHitsRect(a.x, a.y, b.x, b.y, rect)) return false;
  }
  return true;
}

// прямоугольник шипов, на котором стоит юнит (или null); касаются только «ноги» — 0.6 радиуса
function spikeRectAt(u) {
  for (const rect of world.spikes) {
    if (circleRectOverlap(u.x, u.y, u.r * 0.6, rect)) return rect;
  }
  return null;
}

function standsOnSpikes(u) { return spikeRectAt(u) !== null; }

function freeSpotInRoom(e) {
  const room = roomInterior(e.room);
  const pad = e.r + 12;
  let fallback = null;
  // враги не выбирают точки на шипах и в препятствиях, чтобы не убиваться о них сами
  for (let tries = 0; tries < 10; tries++) {
    const p = {
      x: room.x + pad + Math.random() * (room.w - pad * 2),
      y: room.y + pad + Math.random() * (room.h - pad * 2),
      r: e.r,
    };
    if (!fallback) fallback = p;
    if (standsOnSpikes(p)) continue;
    if (world.moveBlockers.some((rect) => circleRectOverlap(p.x, p.y, p.r, rect))) continue;
    return p;
  }
  return fallback;
}


G.world = {
  world, roomInterior, localToWorld, buildWorld, hasLineOfSight,
  spikeRectAt, standsOnSpikes, freeSpotInRoom,
};
})(window.Game = window.Game || {});
