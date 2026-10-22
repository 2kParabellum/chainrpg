// Объёмное окружение (graphics.md) — как оно выглядит: тёмная скала за пределами уровня, пол из плит и подсветка зон,
// стены уровня (верх — та же скала, кирпичная грань только над полом), высокие колонны и двери, шипы,
// пропасть-колодец в перспективе с мостками и декор на полу.
// Каждый кадр это не рисуется: render/ground.js один раз рисует неподвижное (paintGround) кусками и потом только
// копирует их. Живое здесь — туман и камешки пропасти (drawPitLife).
// Всё только рисуется: столкновения и проходимость — по прямоугольникам мира, как раньше.
(function (G) {
'use strict';

const { CONFIG, COLORS, state } = G;
let { ctx } = G.shapes;      // холст, в который рисуем сейчас (кусок земли, скала для него или временный холст окошка)
const { world } = G.world;
const TAU = Math.PI * 2, INK = '#2a1d0d';
const WALL_H = CONFIG.WALL_LIFT; // на сколько рисунок стены поднят над её основанием — выше дружочка
function hexA(h, a) { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
function ell(c, x, y, rx, ry, rot = 0) { c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU); }
const h2 = (x, y, k = 0) => { const s = Math.sin(x * 12.9898 + y * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };
const lerp = (a, b, k) => a + (b - a) * k;
const P = (a, b, k) => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });
function poly(pts) { ctx.beginPath(); pts.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](p.x, p.y)); ctx.closePath(); }
// прямоугольники мира пересекаются
const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const grow = (r, d) => ({ x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d });

// ===================== ПРОПАСТЬ =====================
// Колодец: проём r, дно — меньший прямоугольник внутри, сдвинутый вверх (дальняя, северная стенка самая высокая).
// Четыре внутренние стенки — трапеции своего тона (свет слева сверху), по ним кладка: ряды параллельно кромке
// (сгущаются к дну) и швы, сходящиеся к дну; по углам тёмные рёбра, от северного и западного края — тень внутрь,
// у ближнего края видна толщина плиты пола. На дне плывёт туман, с кромки сыплются камешки
const INS = [0.42, 0.26, 0.26, 0.12];   // отступы дна от проёма: север, запад, восток, юг (доли меньшей стороны)
// углы проёма (A B C D) и дна (a b c d)
function pitShape(r) {
  const m = Math.min(r.w, r.h, 180);
  const A = { x: r.x, y: r.y }, B = { x: r.x + r.w, y: r.y }, C = { x: r.x + r.w, y: r.y + r.h }, D = { x: r.x, y: r.y + r.h };
  const a = { x: r.x + m * INS[1], y: r.y + m * INS[0] }, b = { x: r.x + r.w - m * INS[2], y: r.y + m * INS[0] };
  const c = { x: r.x + r.w - m * INS[2], y: r.y + r.h - m * INS[3] }, d = { x: r.x + m * INS[1], y: r.y + r.h - m * INS[3] };
  return { m, A, B, C, D, a, b, c, d, seed: r.x * 0.01 + r.y * 0.013 };
}
// неподвижная часть колодца — всё, кроме тумана и камешков
function drawPitStatic(r) {
  const { m, A, B, C, D, a, b, c, d } = pitShape(r);
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
  // дно: почти чёрное, темнее к середине (туман по нему — drawPitAnim)
  poly([a, b, c, d]); ctx.fillStyle = '#1f240a'; ctx.fill();
  const cx = (a.x + c.x) / 2, cy = (a.y + c.y) / 2;
  const bg = ctx.createRadialGradient(cx, cy, 2, cx, cy, Math.max(c.x - a.x, c.y - a.y) * 0.7);
  bg.addColorStop(0, 'rgba(10,5,2,0.9)'); bg.addColorStop(1, 'rgba(10,5,2,0.3)'); ctx.fillStyle = bg; ctx.fill();
  // рёбра углов
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.globalAlpha = 0.9;
  for (const [p, q] of [[A, a], [B, b], [C, c], [D, d]]) { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
  ctx.globalAlpha = 0.5; poly([a, b, c, d]); ctx.stroke(); ctx.globalAlpha = 1;
  // тень от кромки: северный и западный край
  const sh = m * 0.16;
  ctx.fillStyle = 'rgba(20,10,5,0.45)';
  poly([A, B, { x: B.x - sh * 0.4, y: B.y + sh }, { x: A.x + sh, y: A.y + sh }]); ctx.fill();
  poly([A, { x: A.x + sh, y: A.y + sh }, { x: D.x + sh, y: D.y - sh * 0.2 }, D]); ctx.fill();
  // кромка: светлый край у ближней стороны, тёмная обводка, толщина плиты пола у ближнего края
  ctx.strokeStyle = '#927e6a'; ctx.lineWidth = 3; ctx.globalAlpha = 0.85;
  ctx.beginPath(); ctx.moveTo(D.x, D.y - 1.5); ctx.lineTo(C.x, C.y - 1.5); ctx.stroke();
  ctx.globalAlpha = 1; ctx.strokeStyle = INK; ctx.lineWidth = 2.5; poly([A, B, C, D]); ctx.stroke();
  ctx.fillStyle = '#45230d'; ctx.fillRect(D.x + 1, D.y - 6, r.w - 2, 4.5);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(D.x, D.y - 6); ctx.lineTo(C.x, C.y - 6); ctx.stroke();
  ctx.restore();
}
// живая часть колодца, поверх готовой: по дну плывёт туман, с северной кромки срываются камешки и тают в темноте
// (под тёмной обводкой кромки их не видно)
function drawPitAnim(r) {
  const t = state.time, { A, B, a, b, c, d, seed } = pitShape(r);
  ctx.save(); poly([a, b, c, d]); ctx.clip();
  const bw = b.x - a.x, bh = d.y - a.y;
  for (let i = 0; i < 4; i++) {
    const x = a.x + ((h2(i, seed, 1) * bw + t * (6 + i * 3)) % (bw + 60)) - 30, y = a.y + h2(i, seed, 2) * bh;
    ctx.fillStyle = hexA('#684c3c', 0.16); ell(ctx, x, y, 30, 9); ctx.fill();
  }
  ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y + 1.25, r.w, r.h); ctx.clip();
  for (let i = 0; i < 3; i++) {
    const k = (t * 0.5 + i / 3 + h2(seed, i)) % 1, n = Math.floor(t * 0.5 + i / 3 + h2(seed, i)), f = 0.15 + h2(n * 7 + i, seed, 3) * 0.7;
    const p = P(P(A, B, f), P(a, b, f), k * k);
    ctx.globalAlpha = 1 - k; ctx.fillStyle = '#927e6a'; ell(ctx, p.x, p.y, 2.4 * (1 - k * 0.6), 2 * (1 - k * 0.6)); ctx.fill();
  }
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
// проёмы всех колодцев: отдельные пропасти и комнаты-пропасти целиком
function pitRects() {
  return world.pits.filter((r) => !r.seamless).concat(chasmBoxes());
}
// мостки над пропастью: сперва все боковины, потом все верхи (с боковиной и обводкой — на 12 ниже прямоугольника)
const bridgeBox = (r) => ({ x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 14 });
function drawBridges(area) {
  const list = world.bridges.filter((r) => hit(bridgeBox(r), area));
  for (const r of list) {
    ctx.fillStyle = COLORS.wallSide; ctx.fillRect(r.x, r.y + r.h, r.w, 10);
    ctx.fillStyle = 'rgba(20,10,5,0.4)'; ctx.fillRect(r.x, r.y + r.h + 6, r.w, 4);
  }
  for (const r of list) {
    ctx.fillStyle = COLORS.bridge; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(r.x, r.y, r.w, r.h + 10);
  }
}
// туман и камешки всех колодцев, которые заходят в прямоугольник мира view, — на холсте c
function drawPitLife(c, view) {
  const keep = ctx; ctx = c;
  for (const r of pitRects()) if (hit(r, view)) drawPitAnim(r);
  ctx = keep;
}

// ===================== НЕИГРАБЕЛЬНАЯ ЗОНА =====================
// всё вне пола — очень тёмная скала; ею же покрыт верх стен уровня. Скала — бесшовная текстура: рисуется один раз
// квадратом VOID_PERIOD × VOID_PERIOD единиц мира и повторяется (на тёмной, едва читаемой скале повтора не видно).
// Чтобы края квадрата сходились, у каждого слоя целое число клеток на квадрат, а номера клеток для случайных
// чисел берутся по кругу (wrap)
const VOID_PERIOD = 1024;
let period = VOID_PERIOD;        // точная сторона квадрата текстуры в единицах мира (под целое число пикселей)
function cells(s0) {
  const n = Math.max(1, Math.round(period / s0));
  return { s: period / n, w: (i) => ((i % n) + n) % n };
}
const VOID = {
  // тёмная скала: неровные камни с бликом, сверху всё сильно притемнено — рисунок едва читается
  rock(r) {
    ctx.fillStyle = '#2a1d0d'; ctx.fillRect(r.x, r.y, r.w, r.h);
    const { s, w } = cells(56);
    for (let ty = Math.floor(r.y / s) - 1; ty * s < r.y + r.h + s; ty++) for (let tx = Math.floor(r.x / s) - 1; tx * s < r.x + r.w + s; tx++) {
      const u = w(tx), v = w(ty);
      const cx = tx * s + s / 2 + (h2(u, v) - 0.5) * 20, cy = ty * s + s / 2 + (h2(u, v, 1) - 0.5) * 20, rad = 22 + h2(u, v, 2) * 12;
      ctx.fillStyle = h2(u, v, 3) > 0.5 ? '#300f0a' : '#36170c'; ctx.globalAlpha = 0.8;
      ell(ctx, cx, cy, rad, rad * 0.8, h2(u, v, 4) * 3); ctx.fill();
      ctx.globalAlpha = 0.15; ctx.fillStyle = '#684c3c'; ell(ctx, cx - rad * 0.3, cy - rad * 0.35, rad * 0.4, rad * 0.16, -0.3); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(8,5,2,0.62)'; ctx.fillRect(r.x, r.y, r.w, r.h);
  },
};
// поверх тёмной скалы — тихое разнообразие без узнаваемых предметов: всё на 1–2 тона светлее или темнее основы
const VX = {
  // пятна: крупные размытые области чуть светлее и чуть темнее (ломают ровный ритм камней)
  patches(r) {
    const { s, w } = cells(220);
    for (let ty = Math.floor(r.y / s) - 1; ty * s < r.y + r.h + s; ty++) for (let tx = Math.floor(r.x / s) - 1; tx * s < r.x + r.w + s; tx++) {
      const u = w(tx), v = w(ty);
      const x = tx * s + h2(u, v, 81) * s, y = ty * s + h2(u, v, 82) * s, rad = 70 + h2(u, v, 83) * 70, light = h2(u, v, 84) > 0.5;
      const g = ctx.createRadialGradient(x, y, 4, x, y, rad);
      g.addColorStop(0, light ? 'rgba(104,76,60,0.10)' : 'rgba(5,3,1,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ell(ctx, x, y, rad, rad * 0.7, h2(u, v, 85) * 3); ctx.fill();
    }
  },
  // обломки плит: угловатые тёмные куски с еле заметной светлой гранью
  slabsBroken(r) {
    const { s, w } = cells(90);
    for (let ty = Math.floor(r.y / s) - 1; ty * s < r.y + r.h + s; ty++) for (let tx = Math.floor(r.x / s) - 1; tx * s < r.x + r.w + s; tx++) {
      const u = w(tx), v = w(ty);
      if (h2(u, v, 91) > 0.6) continue;
      const x = tx * s + h2(u, v, 92) * s, y = ty * s + h2(u, v, 93) * s, n = 2 + Math.floor(h2(u, v, 94) * 3);
      for (let i = 0; i < n; i++) {
        const px = x + (h2(i, u, 95) - 0.5) * 34, py = y + (h2(i, v, 96) - 0.5) * 20, wd = 8 + h2(i, u + v, 97) * 14, hh = 5 + h2(i, 98) * 8;
        ctx.save(); ctx.translate(px, py); ctx.rotate((h2(i, u, 99) - 0.5) * 0.9);
        ctx.beginPath(); ctx.moveTo(-wd / 2, -hh / 2); ctx.lineTo(wd / 2 - 2, -hh / 2 + 1); ctx.lineTo(wd / 2, hh / 2); ctx.lineTo(-wd / 2 + 3, hh / 2); ctx.closePath();
        ctx.fillStyle = 'rgba(54,23,12,0.75)'; ctx.fill();
        ctx.strokeStyle = 'rgba(104,76,60,0.18)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-wd / 2, -hh / 2); ctx.lineTo(wd / 2 - 2, -hh / 2 + 1); ctx.stroke();
        ctx.fillStyle = 'rgba(5,3,1,0.4)'; ctx.fillRect(-wd / 2 + 2, hh / 2, wd - 2, 2);
        ctx.restore();
      }
    }
  },
  // щебень: россыпи мелких камешков чуть светлее основы
  gravel(r) {
    const { s, w } = cells(55);
    for (let ty = Math.floor(r.y / s) - 1; ty * s < r.y + r.h + s; ty++) for (let tx = Math.floor(r.x / s) - 1; tx * s < r.x + r.w + s; tx++) {
      const u = w(tx), v = w(ty);
      if (h2(u, v, 101) > 0.55) continue;
      const x = tx * s + h2(u, v, 102) * s, y = ty * s + h2(u, v, 103) * s;
      for (let i = 0; i < 7; i++) { ctx.fillStyle = i % 3 ? 'rgba(54,23,12,0.8)' : 'rgba(104,76,60,0.16)'; ell(ctx, x + (h2(i, u, 104) - 0.5) * 30, y + (h2(i, v, 105) - 0.5) * 16, 1.5 + h2(i, 106) * 2.2, 1.2 + h2(i, 107) * 1.4); ctx.fill(); }
    }
  },
  // трещины: тонкие ветвящиеся тёмные линии и сколы
  cracks(r) {
    const { s, w } = cells(130);
    ctx.lineCap = 'round';
    for (let ty = Math.floor(r.y / s) - 1; ty * s < r.y + r.h + s; ty++) for (let tx = Math.floor(r.x / s) - 1; tx * s < r.x + r.w + s; tx++) {
      const u = w(tx), v = w(ty);
      if (h2(u, v, 111) > 0.65) continue;
      const x = tx * s + h2(u, v, 112) * s, y = ty * s + h2(u, v, 113) * s;
      let a = h2(u, v, 114) * TAU, px = x, py = y;
      ctx.strokeStyle = 'rgba(5,3,1,0.7)'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(px, py);
      const pts = [];
      for (let i = 0; i < 6; i++) { a += (h2(u + i, v, 115) - 0.5) * 1.4; px += Math.cos(a) * 14; py += Math.sin(a) * 14; ctx.lineTo(px, py); pts.push([px, py, a]); }
      ctx.stroke();
      const [bx, by, ba] = pts[2]; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(ba + 1.1) * 12, by + Math.sin(ba + 1.1) * 12); ctx.stroke();
      ctx.strokeStyle = 'rgba(104,76,60,0.12)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 1, y + 1.5); pts.slice(0, 4).forEach(([qx, qy]) => ctx.lineTo(qx + 1, qy + 1.5)); ctx.stroke();
    }
    ctx.lineCap = 'butt';
  },
  // серые вкрапления: мелкие угловатые камешки светлее основы, по одному и кучками
  flecks(r) {
    const { s, w } = cells(34);
    for (let ty = Math.floor(r.y / s) - 1; ty * s < r.y + r.h + s; ty++) for (let tx = Math.floor(r.x / s) - 1; tx * s < r.x + r.w + s; tx++) {
      const u = w(tx), v = w(ty);
      const q = h2(u, v, 121); if (q > 0.42) continue;
      const x = tx * s + h2(u, v, 122) * s, y = ty * s + h2(u, v, 123) * s, n = q < 0.1 ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const px = x + (i ? (h2(i, u, 124) - 0.5) * 12 : 0), py = y + (i ? (h2(i, v, 125) - 0.5) * 8 : 0), wd = 2 + h2(u + i, v, 126) * 3.5, hh = 1.5 + h2(u, v + i, 127) * 2;
        ctx.save(); ctx.translate(px, py); ctx.rotate(h2(u, v, 128 + i) * 3);
        ctx.fillStyle = h2(u, v, 130 + i) > 0.5 ? 'rgba(146,126,106,0.38)' : 'rgba(104,76,60,0.5)';
        ctx.beginPath(); ctx.moveTo(-wd, 0); ctx.lineTo(-wd * 0.3, -hh); ctx.lineTo(wd, -hh * 0.4); ctx.lineTo(wd * 0.6, hh); ctx.lineTo(-wd * 0.5, hh * 0.8); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(5,3,1,0.45)'; ctx.fillRect(-wd * 0.5, hh * 0.8, wd, 1.2);
        ctx.restore();
      }
    }
  },
};
// текстура скалы под масштаб экрана scale (пикселей холста на единицу мира): квадрат целого числа пикселей,
// рисуется один раз на масштаб
let voidTex = { scale: 0, canvas: null };
function voidTexture(scale) {
  if (voidTex.scale === scale) return voidTex.canvas;
  const px = Math.round(VOID_PERIOD * scale);
  const c = voidTex.canvas || document.createElement('canvas');
  c.width = px; c.height = px;
  period = px / scale;
  const keep = ctx; ctx = c.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const r = { x: 0, y: 0, w: period, h: period };
  VOID.rock(r); VX.patches(r); VX.slabsBroken(r); VX.cracks(r); VX.gravel(r); VX.flecks(r);
  ctx = keep;
  voidTex = { scale, canvas: c };
  return c;
}
// заливка скалой для холста c (кусок земли): текстура привязана к началу мира, пиксель текстуры — пиксель холста
let voidFill = null;
function prepareVoid(c) {
  const scale = c.getTransform().a;
  const p = c.createPattern(voidTexture(scale), 'repeat');
  p.setTransform(new DOMMatrix([1 / scale, 0, 0, 1 / scale, 0, 0]));
  voidFill = p;
}
// скала в прямоугольнике мира r
function paintVoid(r) {
  if (!voidFill) return;
  ctx.fillStyle = voidFill; ctx.fillRect(r.x, r.y, r.w, r.h);
}

// ===================== ПОЛ И ШИПЫ =====================
// пол из каменных плит: тёмные швы и редкие плиты потемнее (рисунок привязан к миру); area — какой кусок рисуем
function drawFloor(f, area) {
  const x0 = Math.max(f.x, area.x), y0 = Math.max(f.y, area.y);
  const x1 = Math.min(f.x + f.w, area.x + area.w), y1 = Math.min(f.y + f.h, area.y + area.h);
  if (x1 <= x0 || y1 <= y0) return;
  const v = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  ctx.fillStyle = COLORS.floor;
  ctx.fillRect(v.x, v.y, v.w, v.h);
  const s = 64;
  ctx.save();
  ctx.beginPath(); ctx.rect(v.x, v.y, v.w, v.h); ctx.clip();
  ctx.fillStyle = COLORS.floorStone;
  ctx.strokeStyle = COLORS.floorLine;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.55;
  for (let ty = Math.floor(v.y / s); ty * s < v.y + v.h; ty++) {
    const off = (ty & 1) * s / 2;
    for (let tx = Math.floor((v.x - off) / s); tx * s + off < v.x + v.w; tx++) {
      const x = tx * s + off, y = ty * s;
      const n = Math.sin(tx * 12.9898 + ty * 78.233) * 43758.5453;
      if (n - Math.floor(n) > 0.82) ctx.fillRect(x + 6, y + 6, s - 12, s - 12);
      ctx.strokeRect(x, y, s, s);
    }
  }
  ctx.restore();
}

// шипы: тёмно-красная плита с рамкой, на ней ряды металлических конусов — светлый бок, тёмный бок, блик на острие
function drawSpikes(r) {
  ctx.fillStyle = COLORS.spikeFloor;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = COLORS.floorLine;
  ctx.lineWidth = 2;
  ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  const s = 16, hw = 5, h = 11;
  ctx.lineWidth = 1.2;
  ctx.lineJoin = 'round';
  for (let y = r.y + s * 0.85; y < r.y + r.h - 2; y += s) {
    const row = Math.round((y - r.y) / s);
    for (let x = r.x + s / 2 + (row % 2) * s / 2; x < r.x + r.w - 4; x += s) {
      ctx.fillStyle = 'rgba(20,10,5,0.5)';
      ctx.beginPath(); ctx.ellipse(x, y, hw + 1, 2.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = COLORS.spikeTeeth;
      ctx.beginPath(); ctx.moveTo(x - hw, y); ctx.lineTo(x, y - h); ctx.lineTo(x, y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = COLORS.pillarSide;
      ctx.beginPath(); ctx.moveTo(x + hw, y); ctx.lineTo(x, y - h); ctx.lineTo(x, y); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = COLORS.floorLine;
      ctx.beginPath(); ctx.moveTo(x - hw, y); ctx.lineTo(x, y - h); ctx.lineTo(x + hw, y); ctx.stroke();
      ctx.fillStyle = COLORS.allyShot;
      ctx.fillRect(x - 1, y - h + 1, 1.5, 2.5);
    }
  }
}

// «Dead Race»: линия старта-финиша поперёк дороги — шахматная полоса в два ряда клеток, концы уходят под стены
// (ворота шире дороги). Невидимые чекпоинты не рисуются
const LINE_CELL = 14;
function startLineBox() {
  const g = world.track && world.track.gates[0];
  if (!g) return null;
  const d = g.half + LINE_CELL * 2;
  return { x: g.x - d, y: g.y - d, w: d * 2, h: d * 2 };
}
function drawStartLine(area) {
  const box = startLineBox();
  if (!box || !hit(box, area)) return;
  const g = world.track.gates[0], n = Math.ceil((g.half * 2) / LINE_CELL);
  ctx.save();
  ctx.translate(g.x, g.y);
  ctx.rotate(Math.atan2(g.ty, g.tx));   // ось x — по ходу гонки, ось y — поперёк дороги
  ctx.fillStyle = 'rgba(20,10,5,0.4)';
  ctx.fillRect(-LINE_CELL - 3, -g.half, LINE_CELL * 2 + 6, g.half * 2);
  for (let j = 0; j < n; j++) {
    for (let row = 0; row < 2; row++) {
      ctx.fillStyle = (j + row) % 2 ? COLORS.raceDark : COLORS.raceLight;
      ctx.fillRect(-LINE_CELL + row * LINE_CELL, -g.half + j * LINE_CELL, LINE_CELL, LINE_CELL);
    }
  }
  ctx.restore();
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

// Стена уровня: верх — тёмная плитка «нигде» (поднят на WALL_H), кирпичная грань — только там, где прямо под стеной
// пол (а не другая стена), светлая кромка — по краям верха, которые выходят на пол. Так край уровня читается как
// стенка, над которой уже тёмная плитка, а лесенка из многих прямоугольников (круглая арена) — как уступы.
// Открытые куски краёв считаются один раз на мир (и заново, когда открылась дверь)
let edgeCache = { key: '', map: new Map() };
function inFloor(x, y) { return world.floors.some((f) => x > f.x && x < f.x + f.w && y > f.y && y < f.y + f.h); }
// куски отрезка [a, b], не закрытые интервалами cut
function subtract(a, b, cut) {
  let segs = [[a, b]];
  for (const [c0, c1] of cut) segs = segs.flatMap(([s0, s1]) => (c1 <= s0 || c0 >= s1) ? [[s0, s1]] : [[s0, Math.max(s0, c0)], [Math.min(s1, c1), s1]].filter(([u, v]) => v - u > 1));
  return segs;
}
function wallEdges() {
  const solid = world.walls.concat((world.doors || []).filter((d) => !d.open));
  const key = world.walls.length + ':' + solid.length + ':' + (world.floors[0] && world.floors[0].x);
  if (edgeCache.src === world.walls && edgeCache.key === key) return edgeCache.map;
  const map = new Map(), e = 0.5;
  for (const r of world.walls) {
    const others = solid.filter((o) => o !== r);
    const xs = (y) => others.filter((o) => o.y < y && o.y + o.h > y).map((o) => [o.x, o.x + o.w]);
    const ys = (x) => others.filter((o) => o.x < x && o.x + o.w > x).map((o) => [o.y, o.y + o.h]);
    const S = subtract(r.x, r.x + r.w, xs(r.y + r.h + e)), N = subtract(r.x, r.x + r.w, xs(r.y - e));
    const W = subtract(r.y, r.y + r.h, ys(r.x - e)), E = subtract(r.y, r.y + r.h, ys(r.x + r.w + e));
    const floorS = (g) => inFloor((g[0] + g[1]) / 2, r.y + r.h + 4);
    map.set(r, { face: S.filter(floorS), S: S.filter(floorS), N: N.filter((g) => inFloor((g[0] + g[1]) / 2, r.y - 4)),
      W: W.filter((g) => inFloor(r.x - 4, (g[0] + g[1]) / 2)), E: E.filter((g) => inFloor(r.x + r.w + 4, (g[0] + g[1]) / 2)) });
  }
  edgeCache = { src: world.walls, key, map };
  return map;
}
// c — холст (основной или временный для окошка)
// area — какой кусок земли рисуем: длинная грань рисуется только в его пределах (края обрезки за ним, кладка привязана к миру)
function drawLevelWall(c, r, area) {
  const H = WALL_H, ed = wallEdges().get(r) || { face: [], S: [], N: [], W: [], E: [] };
  const keep = ctx; ctx = c;
  paintVoid({ x: r.x, y: r.y - H, w: r.w, h: r.h + H });   // верх и всё под ним до основания
  // кирпичные грани над полом
  const vr = grow(area, 60);
  for (const [a0, a1] of ed.face) {
    const x0 = Math.max(a0, vr.x), x1 = Math.min(a1, vr.x + vr.w);
    if (x1 <= x0) continue;
    const fy = r.y + r.h - H, w = x1 - x0;
    const g = c.createLinearGradient(0, r.y + r.h, 0, r.y + r.h + 14);
    g.addColorStop(0, 'rgba(20,10,5,0.45)'); g.addColorStop(1, 'rgba(20,10,5,0)');
    c.fillStyle = g; c.fillRect(x0, r.y + r.h, w, 14);
    c.fillStyle = COLORS.wallSide; c.fillRect(x0, fy, w, H);
    c.save(); c.beginPath(); c.rect(x0, fy, w, H); c.clip();
    c.strokeStyle = '#36170c'; c.lineWidth = 2; c.beginPath();
    for (let y = fy + 12; y < fy + H; y += 12) { c.moveTo(x0, y); c.lineTo(x1, y); }
    for (let row = 0; row * 12 < H; row++) for (let x = Math.floor(x0 / 24) * 24 + (row & 1) * 12; x < x1; x += 24) { c.moveTo(x, fy + row * 12); c.lineTo(x, fy + row * 12 + 12); }
    c.stroke();
    const sg = c.createLinearGradient(0, fy, 0, fy + H); sg.addColorStop(0, 'rgba(20,10,5,0)'); sg.addColorStop(1, 'rgba(20,10,5,0.35)');
    c.fillStyle = sg; c.fillRect(x0, fy, w, H);
    c.restore();
    c.strokeStyle = INK; c.lineWidth = 2; c.strokeRect(x0, fy, w, H);
  }
  // светлая кромка верха там, где он выходит на пол
  c.lineCap = 'square';
  const rim = (x0, y0, x1, y1) => { c.strokeStyle = INK; c.lineWidth = 4; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.strokeStyle = '#684c3c'; c.lineWidth = 2; c.stroke(); };
  const top = r.y - H, bot = r.y + r.h - H;
  for (const [a, b] of ed.S) rim(a, bot, b, bot);
  for (const [a, b] of ed.N) rim(a, top, b, top);
  for (const [a, b] of ed.W) rim(r.x, a - H, r.x, b - H);
  for (const [a, b] of ed.E) rim(r.x + r.w, a - H, r.x + r.w, b - H);
  c.lineCap = 'butt';
  ctx = keep;
}
// все стены, колонны и закрытые двери: от дальних к ближним, чтобы ближняя закрывала грань дальней
// список собирается заново, только когда мир перестроен, открылась или закрылась дверь, появилась или пропала база
let blockCache = { walls: null, pillars: null, key: '', list: [] };
function blocks() {
  let key = world.base && state.base ? 'b' : '';
  for (const d of world.doors || []) key += d.open ? '1' : '0';
  const bc = blockCache;
  if (bc.walls === world.walls && bc.pillars === world.pillars && bc.key === key) return bc.list;
  const list = world.walls.map((r) => ({ r, level: true }))
    .concat(world.pillars.map((r) => ({ r, top: COLORS.pillar, face: COLORS.pillarSide, line: '#45230d' })))
    .concat((world.doors || []).filter((d) => !d.open).map((r) => ({ r, top: COLORS.doorEdge, face: COLORS.door, line: '#45230d', planks: true })))
    .concat(world.base && state.base ? [{ r: world.base, house: true }] : [])
    .sort((a, b) => a.r.y + a.r.h - (b.r.y + b.r.h));
  blockCache = { walls: world.walls, pillars: world.pillars, key, list };
  return list;
}
function drawOne(c, b, area) {
  if (b.house) G.baseArt.draw(c, b.r);   // база «Обороны» — избушка (render/baseart.js)
  else if (b.level) drawLevelWall(c, b.r, area);
  else drawBlock(c, b.r, b.top, b.face, b.line, b.planks);
}
// сколько рисунок блока выходит за поднятый прямоугольник: слева, сверху, справа, снизу (тень у подножия, обводка;
// у избушки — крыша, флаг и дым из трубы)
const PAD_BLOCK = [6, 6, 6, 20], PAD_HOUSE = [40, 130, 40, 24];
function blockBox(b) {
  const L = lifted(b.r), p = b.house ? PAD_HOUSE : PAD_BLOCK;
  return { x: L.x - p[0], y: L.y - p[1], w: L.w + p[0] + p[2], h: L.h + p[1] + p[3] };
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
  const busy = world.walls.map(lifted).concat(world.pillars.map(lifted), world.pits, world.spikes, world.bridges, world.doors || [], world.buttons || [],
    startLineBox() || []);
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
// вещь декора целиком (масштаб DECOR_SCALE, самые длинные — цепи и кольцо с цепью) помещается в этот прямоугольник
const decorBox = (it) => ({ x: it.x - 90, y: it.y - 60, w: 180, h: 120 });
function drawDecor(area) {
  for (const it of layoutDecor()) {
    if (!hit(decorBox(it), area)) continue;
    ctx.save(); ctx.translate(it.x, it.y); ctx.scale(DECOR_SCALE * it.flip, DECOR_SCALE);
    DECOR[it.kind](0, 0); ctx.restore();
  }
}

// ===================== ЗЕМЛЯ ЦЕЛИКОМ =====================
// Всё неподвижное в прямоугольнике мира area на холсте c (кусок земли; холст уже сдвинут и отмасштабирован под него).
// part: 'all' — всё; 'lower' — до пропастей включительно; 'upper' — то, что над пропастью и её живой частью
// (мостки, шипы, стены, колонны, закрытые двери). Избушка базы живая — её здесь нет
// части прямоугольника area, не закрытые полом (пол непрозрачный — под ним скалы не видно); комнаты уровня стоят
// встык, поэтому кусок часто закрыт полом нескольких комнат сразу
function bareParts(area) {
  let parts = [area];
  for (const f of world.floors) {
    const next = [];
    for (const p of parts) {
      if (!hit(p, f)) { next.push(p); continue; }
      const x0 = Math.max(p.x, f.x), x1 = Math.min(p.x + p.w, f.x + f.w), y0 = Math.max(p.y, f.y), y1 = Math.min(p.y + p.h, f.y + f.h);
      if (y0 > p.y) next.push({ x: p.x, y: p.y, w: p.w, h: y0 - p.y });
      if (y1 < p.y + p.h) next.push({ x: p.x, y: y1, w: p.w, h: p.y + p.h - y1 });
      if (x0 > p.x) next.push({ x: p.x, y: y0, w: x0 - p.x, h: y1 - y0 });
      if (x1 < p.x + p.w) next.push({ x: x1, y: y0, w: p.x + p.w - x1, h: y1 - y0 });
    }
    parts = next;
  }
  return parts.filter((p) => p.w > 0.01 && p.h > 0.01);
}
// общая рамка прямоугольников (с запасом d) внутри area или null
function frameOf(list, area, d) {
  if (!list.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of list) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); }
  x0 = Math.max(area.x, x0 - d); y0 = Math.max(area.y, y0 - d);
  x1 = Math.min(area.x + area.w, x1 + d); y1 = Math.min(area.y + area.h, y1 + d);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}
function paintGround(c, area, part) {
  const lower = part !== 'upper', upper = part !== 'lower';
  const keep = ctx; ctx = c;
  c.save();
  c.lineJoin = 'round';   // так рисует и сцена: круглые стыки линий — общий вид всего окружения
  // скала — там, где нет пола (общей рамкой: без швов между частями, пол потом ляжет сверху), и на верхе стен
  const bare = lower ? frameOf(bareParts(area), area, 2) : null;
  const walled = upper && world.walls.some((w) => hit(lifted(w), grow(area, 6)));
  if (bare || walled) prepareVoid(c);
  if (bare) paintVoid(bare);
  if (lower) {
    for (const f of world.floors) drawFloor(f, area);
    // зоны поля подсвечены по степени опасности
    for (const f of world.floors) {
      if (!f.tint || !hit(f, area)) continue;
      c.fillStyle = COLORS.zoneTint[f.tint];
      c.fillRect(f.x, f.y, f.w, f.h);
    }
    drawStartLine(area);
    drawDecor(area);
    for (const r of pitRects()) if (hit(grow(r, 4), area)) drawPitStatic(r);
  }
  if (upper) {
    drawBridges(area);
    for (const r of world.spikes) if (hit(grow(r, 4), area)) drawSpikes(r);
    for (const b of blocks()) if (!b.house && hit(blockBox(b), area)) drawOne(c, b, area);
  }
  c.restore();
  voidFill = null; ctx = keep;
}
// кусок задевает проём пропасти: её живая часть рисуется между нижним и верхним слоем
function splitAt(area) { return pitRects().some((r) => hit(r, area)); }
// в куске есть что-то из верхнего слоя
function hasUpperAt(area) {
  return world.bridges.some((r) => hit(bridgeBox(r), area)) || world.spikes.some((r) => hit(grow(r, 4), area))
    || blocks().some((b) => !b.house && hit(blockBox(b), area));
}

G.terrain = { paintGround, splitAt, hasUpperAt, drawPitLife, blocks, blockBox, drawOne, lifted, WALL_H };
})(window.Game = window.Game || {});
