// Объёмное окружение (graphics.md): пропасть-колодец в перспективе, высокие стены и колонны, которые
// становятся полупрозрачными с мягким окошком вокруг того, кто за ними спрятался, и декор на полу.
// Всё только рисуется: столкновения и проходимость — по прямоугольникам мира, как раньше.
(function (G) {
'use strict';

const { CONFIG, COLORS, state } = G;
const { ctx, visible } = G.shapes;
const { world } = G.world;
const TAU = Math.PI * 2, INK = '#2a1d0d';
const WALL_H = 48;               // на сколько рисунок стены поднят над её основанием — выше дружочка
function hexA(h, a) { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
function ell(c, x, y, rx, ry, rot = 0) { c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU); }
const h2 = (x, y, k = 0) => { const s = Math.sin(x * 12.9898 + y * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };
const lerp = (a, b, k) => a + (b - a) * k;
const P = (a, b, k) => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });
function poly(pts) { ctx.beginPath(); pts.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](p.x, p.y)); ctx.closePath(); }

// ===================== ПРОПАСТЬ =====================
// Колодец: проём r, дно — меньший прямоугольник внутри, сдвинутый вверх (дальняя, северная стенка самая высокая).
// Четыре внутренние стенки — трапеции своего тона (свет слева сверху), по ним кладка: ряды параллельно кромке
// (сгущаются к дну) и швы, сходящиеся к дну; по углам тёмные рёбра, от северного и западного края — тень внутрь,
// у ближнего края видна толщина плиты пола. На дне плывёт туман, с кромки сыплются камешки
const INS = [0.42, 0.26, 0.26, 0.12];   // отступы дна от проёма: север, запад, восток, юг (доли меньшей стороны)
function drawPit(r) {
  const t = state.time, m = Math.min(r.w, r.h, 180);
  const A = { x: r.x, y: r.y }, B = { x: r.x + r.w, y: r.y }, C = { x: r.x + r.w, y: r.y + r.h }, D = { x: r.x, y: r.y + r.h };
  const a = { x: r.x + m * INS[1], y: r.y + m * INS[0] }, b = { x: r.x + r.w - m * INS[2], y: r.y + m * INS[0] };
  const c = { x: r.x + r.w - m * INS[2], y: r.y + r.h - m * INS[3] }, d = { x: r.x + m * INS[1], y: r.y + r.h - m * INS[3] };
  const walls = [[A, B, b, a, '#684c3c'], [B, C, c, b, '#45230d'], [D, A, a, d, '#36170c'], [C, D, d, c, '#300f0a']];
  const rows = [0.18, 0.34, 0.48, 0.6, 0.7, 0.79, 0.86, 0.92];
  ctx.save();
  for (const [p1, p2, q2, q1, col] of walls) {
    poly([p1, p2, q2, q1]); ctx.fillStyle = col; ctx.fill();
    const m1 = P(p1, p2, 0.5), m2 = P(q1, q2, 0.5);
    const g = ctx.createLinearGradient(m1.x, m1.y, m2.x, m2.y);
    g.addColorStop(0, 'rgba(20,10,5,0)'); g.addColorStop(1, 'rgba(20,10,5,0.85)');
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); poly([p1, p2, q2, q1]); ctx.clip();
    ctx.strokeStyle = hexA(INK, 0.75); ctx.lineWidth = 1.5;
    for (const k of rows) { const u = P(p1, q1, k), v = P(p2, q2, k); ctx.globalAlpha = 1 - k * 0.6; ctx.beginPath(); ctx.moveTo(u.x, u.y); ctx.lineTo(v.x, v.y); ctx.stroke(); }
    let prev = 0;
    rows.forEach((k, ri) => {
      const n = Math.max(2, Math.round(Math.hypot(p2.x - p1.x, p2.y - p1.y) / 22));
      for (let i = 0; i < n; i++) {
        const f = (i + (ri % 2) * 0.5) / n;
        if (f <= 0.02 || f >= 0.98) continue;
        const top = P(P(p1, q1, prev), P(p2, q2, prev), f), bot = P(P(p1, q1, k), P(p2, q2, k), f);
        ctx.globalAlpha = 1 - k * 0.7; ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(bot.x, bot.y); ctx.stroke();
      }
      prev = k;
    });
    ctx.restore();
  }
  // дно: почти чёрное, темнее к середине, по нему плывёт туман
  poly([a, b, c, d]); ctx.fillStyle = '#1f240a'; ctx.fill();
  const cx = (a.x + c.x) / 2, cy = (a.y + c.y) / 2;
  const bg = ctx.createRadialGradient(cx, cy, 2, cx, cy, Math.max(c.x - a.x, c.y - a.y) * 0.7);
  bg.addColorStop(0, 'rgba(10,5,2,0.9)'); bg.addColorStop(1, 'rgba(10,5,2,0.3)'); ctx.fillStyle = bg; ctx.fill();
  ctx.save(); poly([a, b, c, d]); ctx.clip();
  const bw = b.x - a.x, bh = d.y - a.y, seed = r.x * 0.01 + r.y * 0.013;
  for (let i = 0; i < 4; i++) {
    const x = a.x + ((h2(i, seed, 1) * bw + t * (6 + i * 3)) % (bw + 60)) - 30, y = a.y + h2(i, seed, 2) * bh;
    ctx.fillStyle = hexA('#684c3c', 0.16); ell(ctx, x, y, 30, 9); ctx.fill();
  }
  ctx.restore();
  // рёбра углов
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.globalAlpha = 0.9;
  for (const [p, q] of [[A, a], [B, b], [C, c], [D, d]]) { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
  ctx.globalAlpha = 0.5; poly([a, b, c, d]); ctx.stroke(); ctx.globalAlpha = 1;
  // тень от кромки: северный и западный край
  const sh = m * 0.16;
  ctx.fillStyle = 'rgba(20,10,5,0.45)';
  poly([A, B, { x: B.x - sh * 0.4, y: B.y + sh }, { x: A.x + sh, y: A.y + sh }]); ctx.fill();
  poly([A, { x: A.x + sh, y: A.y + sh }, { x: D.x + sh, y: D.y - sh * 0.2 }, D]); ctx.fill();
  // камешки срываются с северной кромки и тают в темноте
  for (let i = 0; i < 3; i++) {
    const k = (t * 0.5 + i / 3 + h2(seed, i)) % 1, n = Math.floor(t * 0.5 + i / 3 + h2(seed, i)), f = 0.15 + h2(n * 7 + i, seed, 3) * 0.7;
    const p = P(P(A, B, f), P(a, b, f), k * k);
    ctx.globalAlpha = 1 - k; ctx.fillStyle = '#927e6a'; ell(ctx, p.x, p.y, 2.4 * (1 - k * 0.6), 2 * (1 - k * 0.6)); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // кромка: светлый край у ближней стороны, тёмная обводка, толщина плиты пола у ближнего края
  ctx.strokeStyle = '#927e6a'; ctx.lineWidth = 3; ctx.globalAlpha = 0.85;
  ctx.beginPath(); ctx.moveTo(D.x, D.y - 1.5); ctx.lineTo(C.x, C.y - 1.5); ctx.stroke();
  ctx.globalAlpha = 1; ctx.strokeStyle = INK; ctx.lineWidth = 2.5; poly([A, B, C, D]); ctx.stroke();
  ctx.fillStyle = '#45230d'; ctx.fillRect(D.x + 1, D.y - 6, r.w - 2, 4.5);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(D.x, D.y - 6); ctx.lineTo(C.x, C.y - 6); ctx.stroke();
  ctx.restore();
}

// пропасти уровня. Комната-пропасть собрана из многих прямоугольников (seamless): она рисуется одним колодцем
// по их общей рамке, а тропы и островки поверх — мостками с толщиной
let chasmCache = { src: null, n: -1, boxes: [] };
function chasmBoxes() {
  if (chasmCache.src === world.pits && chasmCache.n === world.pits.length) return chasmCache.boxes;
  const boxes = [];
  for (const r of world.pits) {
    if (!r.seamless) continue;
    let box = boxes.find((b) => r.x <= b.x + b.w && r.x + r.w >= b.x && r.y <= b.y + b.h && r.y + r.h >= b.y);
    if (!box) { boxes.push({ x: r.x, y: r.y, w: r.w, h: r.h }); continue; }
    const x1 = Math.max(box.x + box.w, r.x + r.w), y1 = Math.max(box.y + box.h, r.y + r.h);
    box.x = Math.min(box.x, r.x); box.y = Math.min(box.y, r.y); box.w = x1 - box.x; box.h = y1 - box.y;
  }
  chasmCache = { src: world.pits, n: world.pits.length, boxes };
  return boxes;
}
function drawPits() {
  for (const r of world.pits) if (!r.seamless && visible(r)) drawPit(r);
  for (const b of chasmBoxes()) if (visible(b)) drawPit(b);
  // мостки над пропастью: сперва все боковины, потом все верхи
  for (const r of world.bridges) {
    if (!visible(r)) continue;
    ctx.fillStyle = COLORS.wallSide; ctx.fillRect(r.x, r.y + r.h, r.w, 10);
    ctx.fillStyle = 'rgba(20,10,5,0.4)'; ctx.fillRect(r.x, r.y + r.h + 6, r.w, 4);
  }
  for (const r of world.bridges) {
    if (!visible(r)) continue;
    ctx.fillStyle = COLORS.bridge; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(r.x, r.y, r.w, r.h + 10);
  }
}

// ===================== СТЕНЫ И КОЛОННЫ =====================
// Рисунок поднят на WALL_H вверх: верх — (x, y - H, w, h), передняя грань высотой H с кладкой кончается ровно
// по низу прямоугольника; у подножия тень на полу
function drawBlock(c, r, top, face, line, planks) {
  const H = WALL_H, fy = r.y + r.h - H;
  const g = c.createLinearGradient(0, r.y + r.h, 0, r.y + r.h + 14);
  g.addColorStop(0, 'rgba(20,10,5,0.45)'); g.addColorStop(1, 'rgba(20,10,5,0)');
  c.fillStyle = g; c.fillRect(r.x, r.y + r.h, r.w, 14);
  c.fillStyle = face; c.fillRect(r.x, fy, r.w, H);
  c.save(); c.beginPath(); c.rect(r.x, fy, r.w, H); c.clip();
  c.strokeStyle = line; c.lineWidth = 2; c.beginPath();
  if (planks) { // дверь: вертикальные доски и две поперечины
    for (let x = r.x + 12; x < r.x + r.w; x += 12) { c.moveTo(x, fy); c.lineTo(x, fy + H); }
    c.moveTo(r.x, fy + 10); c.lineTo(r.x + r.w, fy + 10); c.moveTo(r.x, fy + H - 10); c.lineTo(r.x + r.w, fy + H - 10);
  } else {
    for (let y = fy + 12; y < fy + H; y += 12) { c.moveTo(r.x, y); c.lineTo(r.x + r.w, y); }
    for (let row = 0; row * 12 < H; row++) {
      for (let x = r.x + (row & 1) * 12; x < r.x + r.w; x += 24) { c.moveTo(x, fy + row * 12); c.lineTo(x, fy + row * 12 + 12); }
    }
  }
  c.stroke();
  const sg = c.createLinearGradient(0, fy, 0, fy + H);
  sg.addColorStop(0, 'rgba(20,10,5,0)'); sg.addColorStop(1, 'rgba(20,10,5,0.35)');
  c.fillStyle = sg; c.fillRect(r.x, fy, r.w, H);
  c.restore();
  c.fillStyle = top; c.fillRect(r.x, r.y - H, r.w, r.h);
  c.fillStyle = 'rgba(255,244,220,0.12)'; c.fillRect(r.x + 3, r.y - H + 3, Math.max(0, r.w - 6), 3);
  c.strokeStyle = INK; c.lineWidth = 2;
  c.strokeRect(r.x + 1, r.y - H + 1, r.w - 2, r.h + H - 2);
  c.beginPath(); c.moveTo(r.x, fy); c.lineTo(r.x + r.w, fy); c.stroke();
}
const lifted = (r) => ({ x: r.x, y: r.y - WALL_H, w: r.w, h: r.h + WALL_H });
// все стены, колонны и закрытые двери: от дальних к ближним, чтобы ближняя закрывала грань дальней
function blocks() {
  return world.walls.map((r) => ({ r, top: COLORS.wall, face: COLORS.wallSide, line: '#36170c' }))
    .concat(world.pillars.map((r) => ({ r, top: COLORS.pillar, face: COLORS.pillarSide, line: '#45230d' })))
    .concat((world.doors || []).filter((d) => !d.open).map((r) => ({ r, top: COLORS.doorEdge, face: COLORS.door, line: '#45230d', planks: true })))
    .sort((a, b) => a.r.y + a.r.h - (b.r.y + b.r.h));
}
function drawWalls() {
  for (const b of blocks()) if (visible(lifted(b.r))) drawBlock(ctx, b.r, b.top, b.face, b.line, b.planks);
}

// Спрятанные за стеной. Стены нарисованы до тел, поэтому тела за стеной оказались поверх неё; здесь, после тел,
// такая стена рисуется ещё раз поверх: во временном холсте у спрятанных мягкие окошки, у стоящих перед стеной
// (их головы заходят на её грань) и у ближних стен — сквозные дыры, и вся она бледнеет (плавно, кэш рендера)
const fade = new WeakMap();
let lastT = 0, osc = null, octx = null;
function bodies() {
  const out = [];
  for (const u of state.party) out.push(u);
  for (const u of state.downed) out.push(u);
  for (const u of state.neutrals) out.push(u);
  for (const e of state.enemies) if (e.hp > 0 && e.r < 40) out.push(e);
  return out;
}
function drawOccluders() {
  const list = bodies(), all = blocks(), dt = Math.min(0.1, Math.max(0, state.time - lastT)); lastT = state.time;
  for (const b of all) {
    const r = b.r, L = lifted(r);
    if (!visible(L)) continue;
    const bottom = r.y + r.h, inX = (u) => u.x + u.r > r.x && u.x - u.r < r.x + r.w;
    const hidden = list.filter((u) => inX(u) && u.y < bottom && u.y + u.r > L.y);
    let f = fade.get(r) || 0;
    f = Math.max(0, Math.min(1, f + (hidden.length ? 6 : -4) * dt));
    fade.set(r, f);
    if (!hidden.length && f <= 0) continue;
    const front = list.filter((u) => inX(u) && u.y >= bottom && u.y - u.r * 3 < bottom);
    if (!osc || osc.width !== ctx.canvas.width || osc.height !== ctx.canvas.height) {
      osc = document.createElement('canvas'); osc.width = ctx.canvas.width; osc.height = ctx.canvas.height; octx = osc.getContext('2d');
    }
    octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, osc.width, osc.height);
    octx.setTransform(ctx.getTransform());
    drawBlock(octx, r, b.top, b.face, b.line, b.planks);
    octx.globalCompositeOperation = 'destination-out';
    for (const u of hidden) {
      const R = u.r * 2.6 + 6, g = octx.createRadialGradient(u.x, u.y - u.r * 0.6, R * 0.3, u.x, u.y - u.r * 0.6, R);
      g.addColorStop(0, 'rgba(0,0,0,0.85)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      octx.fillStyle = g; octx.fillRect(u.x - R, u.y - u.r * 0.6 - R, R * 2, R * 2);
    }
    octx.fillStyle = '#000';
    for (const u of front) { ell(octx, u.x, u.y - u.r * 0.9, u.r * 1.5, u.r * 2.1); octx.fill(); }
    // ближние стены, заходящие на эту, уже нарисованы поверх неё — не закрывать их
    for (const o of all) {
      if (o.r.y + o.r.h <= bottom) continue;
      const M = lifted(o.r);
      if (M.x < L.x + L.w && M.x + M.w > L.x && M.y < L.y + L.h && M.y + M.h > L.y) octx.fillRect(M.x, M.y, M.w, M.h);
    }
    octx.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1 - 0.35 * f; ctx.drawImage(osc, 0, 0); ctx.restore();
  }
}

// ===================== ДЕКОР =====================
// плоские мелочи на полу: низкие, без объёма и толстой обводки — не похожи на препятствия, ни на что не влияют
const DECOR = {
  crackLong(x, y) { ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - 30, y + 6); ctx.lineTo(x - 16, y + 2); ctx.lineTo(x - 10, y - 4); ctx.lineTo(x + 4, y - 2); ctx.lineTo(x + 12, y - 8); ctx.lineTo(x + 30, y - 6); ctx.moveTo(x - 10, y - 4); ctx.lineTo(x - 6, y - 12); ctx.moveTo(x + 4, y - 2); ctx.lineTo(x + 8, y + 6); ctx.stroke(); ctx.lineCap = 'butt'; },
  crackStar(x, y) { ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.3, l = 10 + h2(i, 4) * 12; ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l * 0.5 + 2, y + Math.sin(a) * l * 0.3); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l * 0.6); } ctx.stroke(); ctx.fillStyle = hexA(INK, 0.6); ell(ctx, x, y, 4, 2.5); ctx.fill(); ctx.lineCap = 'butt'; },
  crackChip(x, y) { ctx.fillStyle = hexA(INK, 0.75); ctx.beginPath(); ctx.moveTo(x - 10, y - 4); ctx.lineTo(x + 2, y - 8); ctx.lineTo(x + 10, y - 2); ctx.lineTo(x + 4, y + 6); ctx.lineTo(x - 8, y + 4); ctx.closePath(); ctx.fill(); ctx.strokeStyle = hexA('#684c3c', 0.6); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - 10, y + 4); ctx.lineTo(x + 4, y + 6); ctx.stroke(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 10, y - 2); ctx.lineTo(x + 22, y - 6); ctx.moveTo(x - 10, y - 4); ctx.lineTo(x - 22, y); ctx.stroke(); ctx.fillStyle = '#684c3c'; ell(ctx, x + 16, y + 6, 3, 2); ctx.fill(); ell(ctx, x + 22, y + 3, 2, 1.5); ctx.fill(); },
  pebbles(x, y) { for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#684c3c' : '#927e6a'; ell(ctx, x + (h2(i, 1) - 0.5) * 36, y + (h2(i, 2) - 0.5) * 20, 3 + h2(i, 3) * 3, 2 + h2(i, 4) * 2); ctx.fill(); } },
  rubble(x, y) { ctx.fillStyle = hexA('#927e6a', 0.25); ell(ctx, x, y + 6, 22, 5); ctx.fill(); for (let i = 0; i < 9; i++) { const px = x + (h2(i, 1) - 0.5) * 30, py = y + (h2(i, 2) - 0.5) * 14 - (i > 5 ? 4 : 0); ctx.fillStyle = ['#684c3c', '#927e6a', '#45230d'][i % 3]; ctx.beginPath(); ctx.moveTo(px - 4, py + 2); ctx.lineTo(px - 2, py - 3); ctx.lineTo(px + 4, py - 2); ctx.lineTo(px + 3, py + 3); ctx.closePath(); ctx.fill(); ctx.strokeStyle = hexA(INK, 0.6); ctx.lineWidth = 1; ctx.stroke(); } },
  shards(x, y) { for (let i = 0; i < 5; i++) { const px = x + (h2(i, 3) - 0.5) * 40, py = y + (h2(i, 4) - 0.5) * 18, s = 5 + h2(i, 5) * 5; ctx.save(); ctx.translate(px, py); ctx.rotate(h2(i, 6) * 3); ctx.fillStyle = '#684c3c'; ctx.fillRect(-s, -s * 0.6, s * 2, s * 1.2); ctx.strokeStyle = hexA(INK, 0.7); ctx.lineWidth = 1; ctx.strokeRect(-s, -s * 0.6, s * 2, s * 1.2); ctx.fillStyle = hexA('#927e6a', 0.4); ctx.fillRect(-s + 1, -s * 0.6 + 1, s * 2 - 2, 1.5); ctx.restore(); } },
  chains(x, y) { ctx.strokeStyle = '#684c3c'; ctx.lineWidth = 2.5; for (let i = 0; i < 6; i++) { ell(ctx, x - 25 + i * 9, y + Math.sin(i * 0.9) * 4, 5, 3, i % 2 ? 0 : 1.2); ctx.stroke(); } },
  shackle(x, y) { ctx.strokeStyle = '#684c3c'; ctx.lineWidth = 2.5; for (let i = 0; i < 4; i++) { ell(ctx, x - 22 + i * 9, y + i * 2, 5, 3, i % 2 ? 0 : 1.2); ctx.stroke(); } ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(x + 18, y + 8, 8, Math.PI * 0.9, Math.PI * 2.3); ctx.stroke(); ctx.fillStyle = '#45230d'; ctx.fillRect(x + 9, y + 8, 18, 4); ctx.strokeStyle = hexA(INK, 0.7); ctx.lineWidth = 1; ctx.strokeRect(x + 9, y + 8, 18, 4); },
  ringBolt(x, y) { ctx.fillStyle = '#45230d'; ell(ctx, x, y, 9, 5); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = '#684c3c'; ell(ctx, x, y - 1, 4, 2.5); ctx.fill(); ctx.strokeStyle = '#927e6a'; ctx.lineWidth = 3; ell(ctx, x + 8, y + 3, 9, 5); ctx.stroke(); ctx.strokeStyle = hexA(INK, 0.7); ctx.lineWidth = 1; ell(ctx, x + 8, y + 3, 10.5, 6.5); ctx.stroke(); ctx.strokeStyle = '#684c3c'; ctx.lineWidth = 2.5; for (let i = 0; i < 3; i++) { ell(ctx, x + 22 + i * 9, y + 6 + i, 5, 3, i % 2 ? 1.2 : 0); ctx.stroke(); } },
  missing(x, y) { ctx.fillStyle = '#45230d'; ctx.fillRect(x - 16, y - 12, 32, 24); ctx.fillStyle = hexA(INK, 0.8); ctx.fillRect(x - 16, y - 12, 32, 4); ctx.fillRect(x - 16, y - 12, 4, 24); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(x - 16, y - 12, 32, 24); for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? '#684c3c' : '#724113'; ell(ctx, x - 6 + h2(i, 1) * 14, y - 2 + h2(i, 2) * 10, 2.5, 1.8); ctx.fill(); } },
  grate(x, y) { ctx.fillStyle = INK; ctx.fillRect(x - 15, y - 10, 30, 20); ctx.strokeStyle = '#684c3c'; ctx.lineWidth = 2.5; ctx.strokeRect(x - 15, y - 10, 30, 20); ctx.beginPath(); for (let i = -9; i <= 9; i += 6) { ctx.moveTo(x + i, y - 9); ctx.lineTo(x + i, y + 9); } ctx.stroke(); ctx.fillStyle = hexA('#927e6a', 0.5); ctx.fillRect(x - 14, y - 9, 28, 1.5); },
  mossSeam(x, y) { ctx.fillStyle = hexA('#39571c', 0.85); for (let i = 0; i < 7; i++) { ell(ctx, x - 24 + i * 8, y + Math.sin(i * 1.3) * 2, 4 + h2(i, 2) * 3, 2.5); ctx.fill(); } ctx.fillStyle = hexA('#a58c27', 0.5); ell(ctx, x - 8, y - 1, 1.5, 1); ctx.fill(); ell(ctx, x + 10, y, 1.5, 1); ctx.fill(); },
  stain(x, y) { ctx.fillStyle = hexA(INK, 0.45); ctx.beginPath(); ctx.moveTo(x - 22, y); ctx.quadraticCurveTo(x - 18, y - 12, x - 2, y - 9); ctx.quadraticCurveTo(x + 16, y - 14, x + 22, y - 2); ctx.quadraticCurveTo(x + 18, y + 10, x + 2, y + 8); ctx.quadraticCurveTo(x - 16, y + 12, x - 22, y); ctx.fill(); ell(ctx, x + 26, y + 6, 3, 2); ctx.fill(); ell(ctx, x - 26, y - 6, 2, 1.5); ctx.fill(); },
};
const KINDS = Object.keys(DECOR);
const DECOR_SCALE = 1.4;
const DECOR_AREA = 600000;   // на комнату в среднем √(площадь / DECOR_AREA) вещей: в обучении ~1 на комнату, в большой ~2

// декор раскладывается один раз на уровень (заново — когда мир перестроен): случайно, но с зерном от названия уровня
let decor = { src: null, items: [] };
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let q = Math.imul(s ^ (s >>> 15), 1 | s); q = (q + Math.imul(q ^ (q >>> 7), 61 | q)) ^ q; return ((q ^ (q >>> 14)) >>> 0) / 4294967296; }; }
function layoutDecor() {
  if (decor.src === world.floors) return decor.items;
  const name = (state.level && state.level.name) || '';
  let seed = 7; for (const ch of name) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rand = rng(seed), items = [];
  const busy = world.walls.map(lifted).concat(world.pillars.map(lifted), world.pits, world.spikes, world.bridges, world.doors || [], world.buttons || []);
  const free = (x, y) => !busy.some((r) => x > r.x - 50 && x < r.x + r.w + 50 && y > r.y - 30 && y < r.y + r.h + 30);
  for (const f of world.floors) {
    if (f.w * f.h < 200000) continue;   // коридоры и закутки — без декора
    const n = Math.floor(Math.sqrt(f.w * f.h / DECOR_AREA) + rand());
    for (let i = 0; i < n; i++) {
      for (let tries = 0; tries < 20; tries++) {
        const x = f.x + 60 + rand() * (f.w - 120), y = f.y + 60 + rand() * (f.h - 120);
        if (!free(x, y) || items.some((it) => Math.hypot(it.x - x, it.y - y) < 160)) continue;
        items.push({ x, y, kind: KINDS[Math.floor(rand() * KINDS.length)], flip: rand() < 0.5 ? -1 : 1 });
        break;
      }
    }
  }
  decor = { src: world.floors, items };
  return items;
}
function drawDecor() {
  for (const it of layoutDecor()) {
    if (!visible({ x: it.x - 60, y: it.y - 40, w: 120, h: 80 })) continue;
    ctx.save(); ctx.translate(it.x, it.y); ctx.scale(DECOR_SCALE * it.flip, DECOR_SCALE);
    DECOR[it.kind](0, 0); ctx.restore();
  }
}

G.terrain = { drawPits, drawWalls, drawOccluders, drawDecor, WALL_H };
})(window.Game = window.Game || {});
