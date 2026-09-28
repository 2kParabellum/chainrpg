// Мир: статическая геометрия уровня и запросы к ней.
// Только здесь известно, как устроена раскладка — комнаты в линию или поле из сетки зон:
// остальной код спрашивает у этого модуля, а не пересчитывает раскладку сам.
// «Комната» ниже — это и комната линейного уровня, и зона поля: номер и внутренний прямоугольник.
(function (G) {
'use strict';

const { clamp } = G.math;
const { CONFIG } = G;
const { circleRectOverlap, segmentHitsRect } = G.collision;

const world = {
  walls: [], pillars: [], pits: [], spikes: [], floors: [], warnings: [], pads: [],
  // двери, кнопки, неуязвимые пушки-ловушки и финишная зона — см. «Тропа над пропастью»
  doors: [], buttons: [], cannons: [], finish: null,
  bridges: [],       // проходимые тропы и островки комнат-пропастей (только для рисования)
  moveBlockers: [], sightBlockers: [],
  width: 0, height: 0,
};

// раскладка текущего уровня; задаётся в buildWorld
//   line:  комнаты стоят в ряд слева направо и соединены проходами; у каждой может быть свой размер,
//          центры комнат по высоте совпадают (на этой линии лежат проходы)
//   field: одно поле из сетки cols × rows зон (по строкам слева направо, сверху вниз)
//   arena: одна круглая комната (боссовая арена)
let layout = { kind: 'line', wall: 0, count: 0, rooms: [] };
// координаты плана комнаты в пикселях её внутреннего прямоугольника (units: 'px'), а не в долях
let roomPx = [];

function roomCount() { return layout.count; }

// в какой комнате (зоне) находится точка; проход между комнатами относится к ближайшей комнате
function roomIndexAt(x, y) {
  if (layout.kind === 'arena') return 0;
  if (layout.kind === 'field') {
    const col = clamp(Math.floor((x - layout.wall) / layout.cellW), 0, layout.cols - 1);
    const row = clamp(Math.floor((y - layout.wall) / layout.cellH), 0, layout.rows - 1);
    return row * layout.cols + col;
  }
  for (let i = 0; i < layout.count - 1; i++) {
    const r = layout.rooms[i];
    if (x < r.ox + r.w + layout.corridorLen / 2) return i;
  }
  return layout.count - 1;
}

function roomInterior(i) {
  if (layout.kind === 'arena') {
    // квадрат, описанный вокруг круга арены: координаты плана (0..1) ложатся на него,
    // как на прямоугольник обычной комнаты — автор плана сам следит, чтобы точки попали в круг
    return { x: layout.margin, y: layout.margin, w: layout.radius * 2, h: layout.radius * 2 };
  }
  if (layout.kind === 'field') {
    const col = i % layout.cols, row = Math.floor(i / layout.cols);
    return { x: layout.wall + col * layout.cellW, y: layout.wall + row * layout.cellH,
             w: layout.cellW, h: layout.cellH };
  }
  const r = layout.rooms[i], W = layout.wall;
  return { x: r.ox + W, y: r.oy + W, w: r.w - 2 * W, h: r.h - 2 * W };
}

// масштаб координат плана: доли внутреннего размера или, для комнат с units: 'px', пиксели
function planScale(i) {
  if (roomPx[i]) return { w: 1, h: 1 };
  const r = roomInterior(i);
  return { w: r.w, h: r.h };
}

function localToWorld(i, cx, cy) {
  const r = roomInterior(i), s = planScale(i);
  return { x: r.x + cx * s.w, y: r.y + cy * s.h };
}

// комната-пропасть: план перечисляет только проходимое — тропы (ломаные с шириной) и островки,
// а всё остальное внутри комнаты становится пропастью. Пропасть собирается из прямоугольников:
// сетка по всем краям проходимых кусков, непокрытые клетки склеиваются в полосы по строкам,
// одинаковые полосы соседних строк — в один прямоугольник
function addChasm(chasm, i, toRect) {
  const inner = roomInterior(i), s = planScale(i);
  const walk = [];
  for (const path of chasm.paths || []) {
    const hw = (path.width * s.w) / 2;
    const pts = path.points.map(([cx, cy]) => localToWorld(i, cx, cy));
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k];
      walk.push({ x: Math.min(a.x, b.x) - hw, y: Math.min(a.y, b.y) - hw,
                  w: Math.abs(a.x - b.x) + 2 * hw, h: Math.abs(a.y - b.y) + 2 * hw });
    }
  }
  for (const r of chasm.rects || []) walk.push(toRect(r));
  world.bridges.push(...walk);

  const x0 = inner.x, x1 = inner.x + inner.w, y0 = inner.y, y1 = inner.y + inner.h;
  const cut = (vals, lo, hi) => [...new Set([lo, hi, ...vals.map((v) => clamp(v, lo, hi))])].sort((a, b) => a - b);
  const xs = cut(walk.flatMap((r) => [r.x, r.x + r.w]), x0, x1);
  const ys = cut(walk.flatMap((r) => [r.y, r.y + r.h]), y0, y1);
  const covered = (x, y) => walk.some((r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h);

  let open = new Map(); // полосы предыдущей строки, ещё не закрытые: ключ «x0:x1» -> прямоугольник
  for (let j = 0; j < ys.length - 1; j++) {
    const ya = ys[j], yb = ys[j + 1], ym = (ya + yb) / 2;
    const next = new Map();
    let runStart = null;
    for (let k = 0; k < xs.length - 1; k++) {
      const pit = !covered((xs[k] + xs[k + 1]) / 2, ym);
      if (pit && runStart === null) runStart = xs[k];
      const end = !pit || k === xs.length - 2;
      if (end && runStart !== null) {
        const runEnd = pit ? xs[k + 1] : xs[k];
        const key = runStart + ':' + runEnd;
        const prev = open.get(key);
        if (prev) { prev.h = yb - prev.y; next.set(key, prev); open.delete(key); }
        else next.set(key, { x: runStart, y: ya, w: runEnd - runStart, h: yb - ya, seamless: true });
        runStart = null;
      }
    }
    for (const rect of open.values()) world.pits.push(rect);
    open = next;
  }
  for (const rect of open.values()) world.pits.push(rect);
}

// препятствия и знаки комнаты из её плана; координаты плана — доли внутреннего размера комнаты
// (или пиксели, если units: 'px')
function addRoomContent(plan, i) {
  const inner = roomInterior(i), s = planScale(i);
  const toRect = ([cx, cy, w, h]) => ({
    x: inner.x + cx * s.w - (w * s.w) / 2, y: inner.y + cy * s.h - (h * s.h) / 2,
    w: w * s.w, h: h * s.h,
  });
  for (const p of plan.pillars || []) world.pillars.push(toRect(p));
  for (const p of plan.pits || []) world.pits.push(toRect(p));
  for (const p of plan.spikes || []) world.spikes.push(toRect(p));
  if (plan.chasm) addChasm(plan.chasm, i, toRect);
  // подиумы: квадрат PADS.size с центром в точке плана, ничего не блокируют; padChoice — подиумы
  // со случайным набором (бросается заново при каждом старте, см. populate.rollPadChoice)
  const padSize = CONFIG.PADS.size;
  const pads = (plan.pads || []).concat(G.populate.rollPadChoice(plan.padChoice));
  for (const [cx, cy, ability] of pads) {
    const c = localToWorld(i, cx, cy);
    world.pads.push({ x: c.x - padSize / 2, y: c.y - padSize / 2, w: padSize, h: padSize, ability });
  }
  // в заминированных комнатах на полу у входа нарисованы предупреждающие знаки
  if ((plan.mines || []).length) {
    for (const [cx, cy] of [[0.09, 0.30], [0.09, 0.70]]) {
      world.warnings.push(localToWorld(i, cx, cy));
    }
  }

  // двери: блокируют движение и обзор, пока закрыты; открывает их связанная кнопка
  for (const [cx, cy, w, h, id] of plan.doors || []) {
    world.doors.push({ ...toRect([cx, cy, w, h]), id, open: false });
  }
  // кнопки: квадрат на полу, ничего не блокирует; список id дверей, которые она открывает
  const btnSize = CONFIG.BUTTONS.size;
  for (const [cx, cy, doorIds] of plan.buttons || []) {
    const c = localToWorld(i, cx, cy);
    world.buttons.push({ x: c.x - btnSize / 2, y: c.y - btnSize / 2, w: btnSize, h: btnSize, doorIds, pressed: false });
  }
  // неуязвимые пушки-ловушки: точка, направление (радианы), и необязательные числа поверх CONFIG.CANNON
  for (const [cx, cy, angle, interval, windup, dmg] of plan.cannons || []) {
    const c = localToWorld(i, cx, cy);
    world.cannons.push({
      x: c.x, y: c.y, angle,
      interval, windup, dmg,
      speed: CONFIG.CANNON.speed, radius: CONFIG.CANNON.radius,
    });
  }
  // финишная зона (уровни с целью «дойти до места», а не «зачистить комнату»)
  if (plan.finish) world.finish = toRect(plan.finish);
}

// сплошные препятствия и пропасти пересобираются заново: закрытая дверь блокирует движение
// и обзор как колонна, открытая — не блокирует ничего. Единственное место в игре, где мир
// меняется по ходу партии, а не только при сбросе; вызывается при сбросе и при каждом
// переключении хотя бы одной двери
function rebuildBlockers() {
  const closedDoors = world.doors.filter((d) => !d.open);
  world.sightBlockers = world.walls.concat(world.pillars, closedDoors);
  world.moveBlockers = world.sightBlockers.concat(world.pits);
}

// применить новое состояние дверей (id открытых); перестраивает блокеры, только если что-то изменилось
function setDoorsOpen(openIds) {
  let changed = false;
  for (const d of world.doors) {
    const open = openIds.has(d.id);
    if (d.open !== open) { d.open = open; changed = true; }
  }
  if (changed) rebuildBlockers();
}

// комнаты в линию: у каждой свои стены, справа узкий проход в следующую. Размер комнаты — общий
// из geometry или свой (plan.size = [ширина, высота] вместе со стенами); центры комнат по высоте
// совпадают, на этой линии и лежат проходы
function buildLine(level) {
  const g = level.geometry;
  const WALL = g.wall, CORRIDOR_LEN = g.corridorLen, CORRIDOR_H = g.corridorH;
  const ROOM_COUNT = level.rooms.length;
  const sizes = level.rooms.map((p) => p.size || [g.roomW, g.roomH]);
  const maxH = Math.max(...sizes.map((s) => s[1]));
  let ox = 0;
  const rooms = sizes.map(([w, h]) => {
    const r = { ox, oy: (maxH - h) / 2, w, h };
    ox += w + CORRIDOR_LEN;
    return r;
  });
  layout = { kind: 'line', wall: WALL, corridorLen: CORRIDOR_LEN, corridorH: CORRIDOR_H,
             count: ROOM_COUNT, rooms };
  world.height = maxH;
  const gapTop = (maxH - CORRIDOR_H) / 2;
  const gapBottom = (maxH + CORRIDOR_H) / 2;

  for (let i = 0; i < ROOM_COUNT; i++) {
    const { ox: x, oy: y, w, h } = rooms[i];
    const last = i === ROOM_COUNT - 1;

    world.floors.push({ x: x + WALL, y: y + WALL, w: w - 2 * WALL, h: h - 2 * WALL });
    world.walls.push({ x, y, w, h: WALL });
    world.walls.push({ x, y: y + h - WALL, w, h: WALL });

    // левая стена
    if (i === 0) world.walls.push({ x, y, w: WALL, h });
    else {
      world.walls.push({ x, y, w: WALL, h: gapTop - y });
      world.walls.push({ x, y: gapBottom, w: WALL, h: y + h - gapBottom });
    }
    // правая стена
    const rx = x + w - WALL;
    if (last) world.walls.push({ x: rx, y, w: WALL, h });
    else {
      world.walls.push({ x: rx, y, w: WALL, h: gapTop - y });
      world.walls.push({ x: rx, y: gapBottom, w: WALL, h: y + h - gapBottom });
    }

    // проход направо
    if (!last) {
      const cx0 = x + w;
      world.floors.push({ x: cx0, y: gapTop, w: CORRIDOR_LEN, h: CORRIDOR_H });
      world.walls.push({ x: cx0, y: gapTop - WALL, w: CORRIDOR_LEN, h: WALL });
      world.walls.push({ x: cx0, y: gapBottom, w: CORRIDOR_LEN, h: WALL });
    }

    addRoomContent(level.rooms[i], i);
  }

  world.width = ox - CORRIDOR_LEN;
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

// круглая арена: одна большая круглая комната. Стена — не тонкий контур, а сплошная заливка
// всего, что снаружи круга, полосами по строкам (ширина полосы каждой строки — по формуле окружности);
// с шагом строк в десяток-другой пикселей это на глаз неотличимо от настоящей круглой стены,
// а столкновения по-прежнему считаются обычной геометрией круг-прямоугольник, без новых примитивов
function buildArena(level) {
  const g = level.geometry;
  const R = g.radius, M = g.margin, S = 2 * (R + M);
  const cx = R + M, cy = R + M;
  layout = { kind: 'arena', cx, cy, radius: R, margin: M, count: 1 };
  world.width = S; world.height = S;

  world.floors.push({ x: M, y: M, w: 2 * R, h: 2 * R });

  const rowH = g.rowStep || 20;
  for (let y = 0; y < S; y += rowH) {
    const h = Math.min(rowH, S - y);
    const dy = Math.max(Math.abs(y - cy), Math.abs(y + h - cy));
    const half = dy < R ? Math.sqrt(R * R - dy * dy) : 0;
    const left = cx - half, right = cx + half;
    if (left > 0) world.walls.push({ x: 0, y, w: left, h });
    if (right < S) world.walls.push({ x: right, y, w: S - right, h });
  }

  addRoomContent(level.rooms[0], 0);
}

function buildWorld(level) {
  world.walls = []; world.pillars = []; world.pits = []; world.spikes = [];
  world.floors = []; world.warnings = []; world.pads = [];
  world.doors = []; world.buttons = []; world.cannons = []; world.finish = null; world.bridges = [];
  roomPx = level.rooms.map((p) => p.units === 'px');
  if (level.geometry.kind === 'field') buildField(level);
  else if (level.geometry.kind === 'arena') buildArena(level);
  else buildLine(level);
  rebuildBlockers();
}

function hasLineOfSight(a, b) {
  for (const rect of world.sightBlockers) {
    if (segmentHitsRect(a.x, a.y, b.x, b.y, rect)) return false;
  }
  return true;
}

// шипы, на которых стоит юнит (или null); касаются только «ноги» — 0.6 радиуса
function spikeRectAt(u) {
  for (const rect of world.spikes) {
    if (circleRectOverlap(u.x, u.y, u.r * 0.6, rect)) return rect;
  }
  return null;
}

// подиум, которого касается тело юнита (или null): берётся при пересечении круга тела и квадрата подиума
function padUnder(u) {
  for (const pad of world.pads) {
    if (circleRectOverlap(u.x, u.y, u.r, pad)) return pad;
  }
  return null;
}

// кнопка, на которой стоит юнит (или null)
function buttonUnder(u) {
  for (const b of world.buttons) {
    if (circleRectOverlap(u.x, u.y, u.r, b)) return b;
  }
  return null;
}

// пересекает ли круг какой-нибудь подиум: по ним не расставляют нейтралов
function overlapsPad(x, y, r) {
  return world.pads.some((pad) => circleRectOverlap(x, y, r, pad));
}

function standsOnSpikes(u) { return spikeRectAt(u) !== null; }

// точка для перебежки врага: сперва поближе к нему самому (на узких тропах так он бродит по своему
// куску тропы, а не целится в соседний через пропасть), потом по всей комнате
function freeSpotInRoom(e) {
  const room = roomInterior(e.room);
  const pad = e.r + 12;
  const near = 150;
  let fallback = null;
  // враги не выбирают точки на шипах и в препятствиях, чтобы не убиваться о них сами
  for (let tries = 0; tries < 30; tries++) {
    const local = tries < 20;
    const p = {
      x: local ? e.x + (Math.random() * 2 - 1) * near : room.x + pad + Math.random() * (room.w - pad * 2),
      y: local ? e.y + (Math.random() * 2 - 1) * near : room.y + pad + Math.random() * (room.h - pad * 2),
      r: e.r,
    };
    p.x = clamp(p.x, room.x + pad, room.x + room.w - pad);
    p.y = clamp(p.y, room.y + pad, room.y + room.h - pad);
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
    if (standsOnSpikes(p) || overlapsPad(p.x, p.y, r)) continue;
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
  spikeRectAt, standsOnSpikes, padUnder, buttonUnder, freeSpotInRoom, scatterSpot, freeSpotNear, setDoorsOpen,
};
})(window.Game = window.Game || {});
