// Мир: статическая геометрия уровня и запросы к ней.
// Только здесь известно, как устроена раскладка — комнаты в линию или поле из сетки зон:
// остальной код спрашивает у этого модуля, а не пересчитывает раскладку сам.
// «Комната» ниже — это и комната линейного уровня, и зона поля: номер и внутренний прямоугольник.
(function (G) {
'use strict';

const { clamp } = G.math;
const { circleRectOverlap, segmentHitsRect } = G.collision;

const world = {
  walls: [], pillars: [], pits: [], spikes: [], floors: [], warnings: [],
  moveBlockers: [], sightBlockers: [],
  width: 0, height: 0,
};

// раскладка текущего уровня; задаётся в buildWorld
//   line:  комнаты стоят в ряд слева направо и соединены проходами
//   field: одно поле из сетки cols × rows зон (по строкам слева направо, сверху вниз)
let layout = { kind: 'line', wall: 0, count: 0 };

function roomOriginX(i) { return i * (layout.roomW + layout.corridorLen); }

function roomCount() { return layout.count; }

// в какой комнате (зоне) находится точка; проход между комнатами относится к ближайшей комнате
function roomIndexAt(x, y) {
  if (layout.kind === 'field') {
    const col = clamp(Math.floor((x - layout.wall) / layout.cellW), 0, layout.cols - 1);
    const row = clamp(Math.floor((y - layout.wall) / layout.cellH), 0, layout.rows - 1);
    return row * layout.cols + col;
  }
  const step = layout.roomW + layout.corridorLen;
  return clamp(Math.floor((x + layout.corridorLen / 2) / step), 0, layout.count - 1);
}

function roomInterior(i) {
  if (layout.kind === 'field') {
    const col = i % layout.cols, row = Math.floor(i / layout.cols);
    return { x: layout.wall + col * layout.cellW, y: layout.wall + row * layout.cellH,
             w: layout.cellW, h: layout.cellH };
  }
  const ox = roomOriginX(i), W = layout.wall;
  return { x: ox + W, y: W, w: layout.roomW - 2 * W, h: layout.roomH - 2 * W };
}

function localToWorld(i, cx, cy) {
  const r = roomInterior(i);
  return { x: r.x + cx * r.w, y: r.y + cy * r.h };
}

// препятствия и знаки комнаты из её плана; координаты плана — доли внутреннего размера комнаты
function addRoomContent(plan, i) {
  const inner = roomInterior(i);
  const toRect = ([cx, cy, w, h]) => ({
    x: inner.x + (cx - w / 2) * inner.w, y: inner.y + (cy - h / 2) * inner.h,
    w: w * inner.w, h: h * inner.h,
  });
  for (const p of plan.pillars) world.pillars.push(toRect(p));
  for (const p of plan.pits) world.pits.push(toRect(p));
  for (const p of plan.spikes) world.spikes.push(toRect(p));
  // в заминированных комнатах на полу у входа нарисованы предупреждающие знаки
  if ((plan.mines || []).length) {
    for (const [cx, cy] of [[0.09, 0.30], [0.09, 0.70]]) {
      world.warnings.push(localToWorld(i, cx, cy));
    }
  }
}

// комнаты в линию: у каждой свои стены, справа узкий проход в следующую
function buildLine(level) {
  const g = level.geometry;
  const ROOM_W = g.roomW, ROOM_H = g.roomH, WALL = g.wall;
  const CORRIDOR_LEN = g.corridorLen, CORRIDOR_H = g.corridorH, ROOM_COUNT = level.rooms.length;
  layout = { kind: 'line', roomW: ROOM_W, roomH: ROOM_H, wall: WALL, corridorLen: CORRIDOR_LEN,
             corridorH: CORRIDOR_H, count: ROOM_COUNT };
  world.height = ROOM_H;
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

    addRoomContent(level.rooms[i], i);
  }

  world.width = ROOM_COUNT * (ROOM_W + CORRIDOR_LEN) - CORRIDOR_LEN;
}

// поле: внешняя стена по периметру, внутри сетка зон; на стыках зон стоят короткие стенки,
// которые лишь слегка отгораживают зоны друг от друга — проходы между ними широкие
function buildField(level) {
  const g = level.geometry;
  const W = g.wall;
  const cellW = (g.width - 2 * W) / g.cols, cellH = (g.height - 2 * W) / g.rows;
  layout = { kind: 'field', wall: W, cols: g.cols, rows: g.rows, cellW, cellH, count: g.cols * g.rows };
  world.width = g.width; world.height = g.height;

  world.walls.push({ x: 0, y: 0, w: g.width, h: W });
  world.walls.push({ x: 0, y: g.height - W, w: g.width, h: W });
  world.walls.push({ x: 0, y: 0, w: W, h: g.height });
  world.walls.push({ x: g.width - W, y: 0, w: W, h: g.height });

  for (let i = 0; i < layout.count; i++) {
    const plan = level.rooms[i];
    world.floors.push({ ...roomInterior(i), tint: plan.tint });
    addRoomContent(plan, i);
  }

  // на каждом стыке четыре стенки-заглушки в стороны, а сам стык остаётся свободным: без него
  // диагональный путь из угла в центр упирался бы во вогнутый «карман» креста
  const gap = g.dividerGap, len = g.dividerLen, t = g.dividerThick;
  for (let col = 1; col < g.cols; col++) {
    for (let row = 1; row < g.rows; row++) {
      const cx = W + col * cellW, cy = W + row * cellH;
      world.walls.push({ x: cx + gap, y: cy - t / 2, w: len, h: t });
      world.walls.push({ x: cx - gap - len, y: cy - t / 2, w: len, h: t });
      world.walls.push({ x: cx - t / 2, y: cy + gap, w: t, h: len });
      world.walls.push({ x: cx - t / 2, y: cy - gap - len, w: t, h: len });
    }
  }
}

function buildWorld(level) {
  world.walls = []; world.pillars = []; world.pits = []; world.spikes = [];
  world.floors = []; world.warnings = [];
  if (level.geometry.kind === 'field') buildField(level);
  else buildLine(level);
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

// случайная свободная точка комнаты для стартовой расстановки: не на шипах, не в препятствиях
// и не ближе gap к уже занятым точкам taken ([{ x, y, r }]); если места нет — последняя попытка
function scatterSpot(roomIdx, r, taken, gap) {
  const room = roomInterior(roomIdx);
  const pad = r + 24;
  let p = null;
  for (let tries = 0; tries < 40; tries++) {
    p = {
      x: room.x + pad + Math.random() * (room.w - pad * 2),
      y: room.y + pad + Math.random() * (room.h - pad * 2),
      r,
    };
    if (standsOnSpikes(p)) continue;
    if (world.moveBlockers.some((rect) => circleRectOverlap(p.x, p.y, r + 8, rect))) continue;
    if (taken.some((t) => Math.hypot(p.x - t.x, p.y - t.y) < t.r + r + gap)) continue;
    break;
  }
  return p;
}

// свободная точка в кольце minR..maxR вокруг (x, y) — куда встаёт враг, порождённый порталом;
// null, если за несколько попыток места не нашлось
function freeSpotNear(x, y, minR, maxR, r) {
  for (let tries = 0; tries < 12; tries++) {
    const a = Math.random() * Math.PI * 2;
    const d = minR + Math.random() * (maxR - minR);
    const p = { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, r };
    if (p.x < r || p.y < r || p.x > world.width - r || p.y > world.height - r) continue;
    if (world.moveBlockers.some((rect) => circleRectOverlap(p.x, p.y, r, rect))) continue;
    return p;
  }
  return null;
}


G.world = {
  world, roomCount, roomIndexAt, roomInterior, localToWorld, buildWorld, hasLineOfSight,
  spikeRectAt, standsOnSpikes, freeSpotInRoom, scatterSpot, freeSpotNear,
};
})(window.Game = window.Game || {});
