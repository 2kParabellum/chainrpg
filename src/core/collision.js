// Столкновения: чистая геометрия кругов и прямоугольников, без знания о мире и состоянии.
(function (G) {
'use strict';

const { clamp } = G.math;

function circleRectOverlap(x, y, r, rect) {
  const cx = clamp(x, rect.x, rect.x + rect.w);
  const cy = clamp(y, rect.y, rect.y + rect.h);
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

// выталкивает круг из прямоугольника и возвращает нормаль выталкивания
function resolveCircleRect(e, rect) {
  const cx = clamp(e.x, rect.x, rect.x + rect.w);
  const cy = clamp(e.y, rect.y, rect.y + rect.h);
  const dx = e.x - cx, dy = e.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 > e.r * e.r) return null;

  if (d2 > 1e-6) {
    const d = Math.sqrt(d2);
    const nx = dx / d, ny = dy / d;
    e.x = cx + nx * e.r;
    e.y = cy + ny * e.r;
    return { x: nx, y: ny };
  }

  const left = e.x - rect.x, right = rect.x + rect.w - e.x;
  const top = e.y - rect.y, bottom = rect.y + rect.h - e.y;
  const m = Math.min(left, right, top, bottom);
  if (m === left) { e.x = rect.x - e.r; return { x: -1, y: 0 }; }
  if (m === right) { e.x = rect.x + rect.w + e.r; return { x: 1, y: 0 }; }
  if (m === top) { e.y = rect.y - e.r; return { x: 0, y: -1 }; }
  e.y = rect.y + rect.h + e.r;
  return { x: 0, y: 1 };
}

// Раскладка прямоугольников по клеткам cell×cell: near(x0, y0, x1, y1) — те, что задевают клетки области,
// в том же порядке, что и в списке (порядок важен для выталкивания). Отдаёт один и тот же массив — пользоваться
// сразу, до следующего вызова
function indexRects(list, cell = 160) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of list) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); }
  if (!list.length) { x0 = y0 = 0; x1 = y1 = 1; }
  const cols = Math.max(1, Math.ceil((x1 - x0) / cell)), rows = Math.max(1, Math.ceil((y1 - y0) / cell));
  const cells = Array.from({ length: cols * rows }, () => []);
  const ci = (x) => clamp(Math.floor((x - x0) / cell), 0, cols - 1), cj = (y) => clamp(Math.floor((y - y0) / cell), 0, rows - 1);
  list.forEach((r, k) => {
    for (let j = cj(r.y); j <= cj(r.y + r.h); j++) for (let i = ci(r.x); i <= ci(r.x + r.w); i++) cells[j * cols + i].push(k);
  });
  const seen = new Uint32Array(list.length), ids = [], out = [];
  let stamp = 0;
  return {
    near(ax, ay, bx, by) {
      ids.length = 0; out.length = 0;
      if (bx < x0 || by < y0 || ax > x1 || ay > y1) return out;
      stamp++;
      for (let j = cj(ay), j1 = cj(by); j <= j1; j++) for (let i = ci(ax), i1 = ci(bx); i <= i1; i++) {
        for (const k of cells[j * cols + i]) if (seen[k] !== stamp) { seen[k] = stamp; ids.push(k); }
      }
      ids.sort((a, b) => a - b);
      for (const k of ids) out.push(list[k]);
      return out;
    },
  };
}

// двигает круг и возвращает суммарную нормаль столкновений (или null). У списка с раскладкой (blockers.index —
// indexRects) проверяются только прямоугольники рядом; если выталкивание унесло круг дальше запаса — весь список
// заново с исходной точки (так результат всегда тот же, что и без раскладки)
function moveAndCollide(e, dx, dy, blockers) {
  const sx = e.x, sy = e.y;
  e.x += dx; e.y += dy;
  const idx = blockers.index;
  if (idx) {
    const qx = e.x, qy = e.y, m = e.r * 2 + 16, reach = e.r + m;
    const n = collideAll(e, idx.near(qx - reach, qy - reach, qx + reach, qy + reach), qx, qy, m);
    if (n !== undefined) return n;
    e.x = sx + dx; e.y = sy + dy;
  }
  return collideAll(e, blockers);
}
// два прохода выталкивания по списку; с запасом m — undefined, если круг ушёл от (qx, qy) дальше m
function collideAll(e, list, qx, qy, m) {
  let nx = 0, ny = 0, hit = false;
  for (let pass = 0; pass < 2; pass++) {
    for (const rect of list) {
      const n = resolveCircleRect(e, rect);
      if (!n) continue;
      hit = true;
      nx += n.x; ny += n.y;
      if (m !== undefined && (Math.abs(e.x - qx) > m || Math.abs(e.y - qy) > m)) return undefined;
    }
  }
  if (!hit) return null;
  const len = Math.hypot(nx, ny);
  return len > 1e-6 ? { x: nx / len, y: ny / len } : { x: 0, y: 0 };
}

// убирает из скорости составляющую, направленную в стену, оставляя движение вдоль неё
function slideAlongWall(unit, normal, friction) {
  const into = unit.vx * normal.x + unit.vy * normal.y;
  if (into < 0) {
    unit.vx -= normal.x * into;
    unit.vy -= normal.y * into;
  }
  unit.vx *= friction;
  unit.vy *= friction;
}

// пересечение отрезка с прямоугольником (slab method): доля отрезка (0..1), на которой он входит
// в прямоугольник, или null, если не пересекает
function segmentHitT(x1, y1, x2, y2, rect) {
  const dx = x2 - x1, dy = y2 - y1;
  const s = { t0: 0, t1: 1 };
  if (!slab(-dx, x1 - rect.x, s) || !slab(dx, rect.x + rect.w - x1, s)) return null;
  if (!slab(-dy, y1 - rect.y, s) || !slab(dy, rect.y + rect.h - y1, s)) return null;
  return s.t0;
}
// одна сторона прямоугольника для segmentHitT: сужает [t0, t1]; false — отрезок мимо
function slab(p, q, s) {
  if (Math.abs(p) < 1e-9) return q >= 0;
  const t = q / p;
  if (p < 0) { if (t > s.t1) return false; if (t > s.t0) s.t0 = t; }
  else { if (t < s.t0) return false; if (t < s.t1) s.t1 = t; }
  return true;
}

function segmentHitsRect(x1, y1, x2, y2, rect) {
  return segmentHitT(x1, y1, x2, y2, rect) !== null;
}

// расстояние от точки до отрезка
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? clamp(((px - x1) * dx + (py - y1) * dy) / len2, 0, 1) : 0;
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}

G.collision = { circleRectOverlap, indexRects, moveAndCollide, slideAlongWall, segmentHitT, segmentHitsRect, distToSegment };
})(window.Game = window.Game || {});
