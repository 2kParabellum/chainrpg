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

// двигает круг и возвращает суммарную нормаль столкновений (или null)
function moveAndCollide(e, dx, dy, blockers) {
  e.x += dx; e.y += dy;
  let nx = 0, ny = 0, hit = false;
  for (let pass = 0; pass < 2; pass++) {
    for (const rect of blockers) {
      const n = resolveCircleRect(e, rect);
      if (!n) continue;
      hit = true;
      nx += n.x; ny += n.y;
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
  let t0 = 0, t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - rect.x, rect.x + rect.w - x1, y1 - rect.y, rect.y + rect.h - y1];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-9) { if (q[i] < 0) return null; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
    else { if (t < t0) return null; if (t < t1) t1 = t; }
  }
  return t0;
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

G.collision = { circleRectOverlap, moveAndCollide, slideAlongWall, segmentHitT, segmentHitsRect, distToSegment };
})(window.Game = window.Game || {});
