// База «Обороны» — избушка дружочков: светлые стены с балками, соломенная крыша с флажком-короной, труба с дымом,
// круглые окна с тёплым светом (из них выглядывают и моргают дружочки), ящики с цветами, дверь с сердечком.
// Стоит на месте здания world.base (200×200): фасад — нижняя часть, крыша поднята над ним, как верх стен.
// Урон виден: с 70% HP — дыра в соломе и трещина, с 40% — пластырь и ещё трещина, с 30% — окно заколочено,
// крыша горит, дым из трубы чёрный, дружочки в окнах хмурятся. При попадании дом краснеет.
// Рисуется в слое стен (render/terrain.js) — с окошком для тех, кто за ним. Состояние только читается.
(function (G) {
'use strict';

const { state } = G;
let ctx = G.shapes.ctx;   // холст, в который рисуем сейчас (сцена или временный холст окошка)
const TAU = Math.PI * 2, INK = '#2a1d0d';
const C = { ink: INK, cream: '#efd8a1', peach: '#efb775', stone: '#927e6a', gold: '#efac28', red: '#ef3a0c', orange: '#ef692f', dark: '#300f0a',
  brown: '#724113', wood: '#ab5c1c', teal: '#3c9f9c', olive: '#a58c27', green: '#39571c' };
function hexA(h, a) { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
function ell(x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU); }
const h2 = (x, y, k = 0) => { const s = Math.sin(x * 12.9898 + y * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

function smoke(x, y, t, n = 3, col = '#927e6a', s = 1) {
  for (let i = 0; i < n; i++) { const q = (t * 0.45 + i / n) % 1; ctx.globalAlpha = 0.55 * Math.sin(q * Math.PI); ctx.fillStyle = col; ell(x + Math.sin(t * 1.3 + i * 2) * 6 * q, y - q * 50 * s, (6 + 10 * q) * s, (5 + 8 * q) * s); ctx.fill(); }
  ctx.globalAlpha = 1;
}
function fire(x, y, t, s = 1) {
  for (const [col, k, dy] of [['#ef3a0c', 1.2, -2], ['#ef692f', 0.9, 0], ['#efac28', 0.55, 3]]) for (let i = -1; i <= 1; i++) {
    const h = (16 + 6 * Math.sin(t * 12 + i * 2 + k)) * k * s, w = 6 * s;
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x + i * 7 * s - w, y + dy); ctx.quadraticCurveTo(x + i * 7 * s - w * 0.8, y + dy - h * 0.5, x + i * 7 * s + Math.sin(t * 8 + i) * 2, y + dy - h); ctx.quadraticCurveTo(x + i * 7 * s + w * 0.8, y + dy - h * 0.5, x + i * 7 * s + w, y + dy); ctx.fill();
  }
}
function crack(x, y, s, seed) {
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y);
  let px = x, py = y;
  for (let i = 1; i <= 3; i++) { px += (h2(i, seed) - 0.3) * 12 * s; py += (6 + h2(i, seed + 1) * 6) * s; ctx.lineTo(px, py); if (i === 2) { ctx.moveTo(px, py); ctx.lineTo(px + 8 * s, py + 3 * s); ctx.moveTo(px, py); } }
  ctx.stroke(); ctx.lineCap = 'butt';
}
function plaster(x, y, s, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.fillStyle = C.cream; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
  for (const a of [0.6, -0.6]) { ctx.save(); ctx.rotate(a); rr(-11 * s, -3.5 * s, 22 * s, 7 * s, 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = C.peach; ctx.fillRect(-3 * s, -3 * s, 6 * s, 6 * s); ctx.fillStyle = C.cream; ctx.restore(); }
  ctx.restore();
}
// лицо дружочка в окне (центр — (x, y)); blink — моргнул, worried — брови домиком
function peekFace(x, y, s, blink, worried) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = C.peach; ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ell(0, 0, 9 * s, 8 * s); ctx.fill(); ctx.stroke();
  for (const sx of [-1, 1]) {
    if (blink) { ctx.beginPath(); ctx.moveTo(sx * 3.5 * s - 2 * s, -1 * s); ctx.lineTo(sx * 3.5 * s + 2 * s, -1 * s); ctx.stroke(); continue; }
    ctx.fillStyle = '#fff4dc'; ell(sx * 3.5 * s, -1 * s, 2.6 * s, 3 * s); ctx.fill(); ctx.fillStyle = INK; ell(sx * 3.5 * s + 0.6 * s, -0.6 * s, 1.3 * s, 1.6 * s); ctx.fill();
    if (worried) { ctx.beginPath(); ctx.moveTo(sx * 1.5 * s, -5 * s); ctx.lineTo(sx * 5.5 * s, -4 * s + (sx > 0 ? 1 : 1) * s); ctx.stroke(); }
  }
  ctx.restore();
}
// Круглое окно с тёплым светом. Рама и тёмный проём — в картинке фасада, перекладины, обвод и блик (у заколоченного —
// доски) — в картинке перед ним; живьём — мерцание света и дружочек, который выглядывает, прячется и моргает
function windowBack(x, y, w, h) {
  ctx.fillStyle = INK; ell(x, y, w / 2 + 3, h / 2 + 3); ctx.fill();
  ctx.fillStyle = '#45230d'; ell(x, y, w / 2, h / 2); ctx.fill();
}
function windowFront(x, y, w, h, broken) {
  if (broken) { ctx.fillStyle = C.brown; ctx.strokeStyle = INK; ctx.lineWidth = 1.5; for (const a of [0.5, -0.4]) { ctx.save(); ctx.translate(x, y); ctx.rotate(a); rr(-w * 0.65, -3, w * 1.3, 6, 1); ctx.fill(); ctx.stroke(); ctx.restore(); } return; }
  ctx.strokeStyle = C.brown; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y - h / 2); ctx.lineTo(x, y + h / 2); ctx.moveTo(x - w / 2, y); ctx.lineTo(x + w / 2, y); ctx.stroke();
  ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ell(x, y, w / 2, h / 2); ctx.stroke();
  // свет из окна на полу не нужен — оно на стене; блик
  ctx.fillStyle = 'rgba(255,244,220,0.35)'; ell(x - w * 0.22, y - h * 0.25, w * 0.12, h * 0.08, -0.5); ctx.fill();
}
function windowLight(x, y, w, h, t, seed, worried, broken, dx) {
  const box = [-w / 2 - 1, -h / 2 - 1, w / 2 + 1, h / 2 + 1];
  ctx.globalAlpha = 0.85 + 0.15 * Math.sin(t * 7 + seed);
  part(ctx, `light|${w}|${h}`, ...box, x + dx, y, () => {
    ctx.save(); ell(0, 0, w / 2, h / 2); ctx.clip();
    const g = ctx.createRadialGradient(0, h * 0.2, 0, 0, 0, w); g.addColorStop(0, hexA('#efac28', 0.95)); g.addColorStop(1, hexA('#ef692f', 0.6));
    ctx.fillStyle = g; ctx.fillRect(-w, -h, w * 2, h * 2);
    ctx.restore();
  });
  ctx.globalAlpha = 1;
  if (broken) return;
  const ph = (t * 0.35 + h2(seed, 1)) % 1, up = ph < 0.6 ? Math.min(1, ph / 0.1) : Math.max(0, 1 - (ph - 0.6) / 0.1);
  if (up <= 0) return;
  const blink = Math.sin(t * 2 + seed * 3) > 0.95, uq = Math.round(up * 10), s = w / 22;
  part(ctx, `peek|${w}|${h}|${uq}|${blink ? 1 : 0}|${worried ? 1 : 0}`, ...box, x + dx, y, () => {
    ctx.save(); ell(0, 0, w / 2, h / 2); ctx.clip();
    peekFace(0, h * 0.3 + (1 - uq / 10) * 10 * s, s, blink, worried);
    ctx.restore();
  });
}
function flag(x, y, t, s = 1, torn = 0) {
  ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 40 * s); ctx.stroke();
  ctx.strokeStyle = C.stone; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = C.teal; ctx.strokeStyle = INK; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, y - 40 * s);
  for (let i = 0; i <= 6; i++) { const q = i / 6; ctx.lineTo(x + q * 28 * s * (1 - torn * 0.4), y - 40 * s + Math.sin(t * 5 - q * 4) * 3 * q); }
  for (let i = 6; i >= 0; i--) { const q = i / 6; ctx.lineTo(x + q * 28 * s * (1 - torn * 0.4), y - 24 * s + Math.sin(t * 5 - q * 4) * 3 * q + (torn && i === 5 ? -5 : 0)); }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // корона на флаге
  const cx = x + 12 * s, cy = y - 32 * s + Math.sin(t * 5 - 1.7) * 1.5;
  ctx.fillStyle = C.gold; ctx.beginPath(); ctx.moveTo(cx - 6 * s, cy + 3 * s); ctx.lineTo(cx - 6 * s, cy - 3 * s); ctx.lineTo(cx - 3 * s, cy); ctx.lineTo(cx, cy - 4 * s); ctx.lineTo(cx + 3 * s, cy); ctx.lineTo(cx + 6 * s, cy - 3 * s); ctx.lineTo(cx + 6 * s, cy + 3 * s); ctx.closePath(); ctx.fill();
}
function hpBar(x, y, w, k) {
  ctx.fillStyle = INK; rr(x - 2, y - 2, w + 4, 12, 4); ctx.fill();
  ctx.fillStyle = '#6fae3a'; rr(x, y, w * k, 8, 3); ctx.fill();
}
function shadowRect(x, y, w, d) { ctx.fillStyle = 'rgba(20,10,5,0.4)'; rr(x - 6, y + d - 18, w + 18, 28, 12); ctx.fill(); }

// Неподвижные части избушки — готовые картинки в разрешении холста: сзади (тень, фасад с балками и камнями) и спереди
// (ящики с цветами, дверь, крыша, конёк, труба, следы урона — своя картинка на каждую стадию урона). Каждый кадр
// они только копируются, а живьём рисуются окна (свет мерцает, дружочки выглядывают), флаг, дым, огонь и покраснение
// от попадания. Картинка ложится на целые пиксели холста — пиксель в пиксель. (x0, y0)–(x1, y1) — её рамка,
// (ox, oy) — куда её сдвинуть
const parts = new Map();
let partScale = 0;
function part(c, key, x0, y0, x1, y1, ox, oy, paint) {
  const s = c.getTransform().a;
  if (s !== partScale) { parts.clear(); partScale = s; }
  let p = parts.get(key);
  if (!p) {
    const X0 = Math.floor(x0 * s) / s, Y0 = Math.floor(y0 * s) / s, cv = document.createElement('canvas');
    cv.width = Math.ceil((x1 - X0) * s); cv.height = Math.ceil((y1 - Y0) * s);
    const g = cv.getContext('2d'), keep = ctx;
    g.setTransform(s, 0, 0, s, -X0 * s, -Y0 * s);
    ctx = g; paint(); ctx = keep;
    p = { cv, x: X0, y: Y0, w: cv.width / s, h: cv.height / s };
    parts.set(key, p);
  }
  c.drawImage(p.cv, Math.round((p.x + ox) * s) / s, Math.round((p.y + oy) * s) / s, p.w, p.h);
}

// стены: фасад с балками и нижним рядом камней, тень под домом
function houseBack(x, y, w, d) {
  const Hh = 92, by = y + d, fy = by - Hh;
  shadowRect(x, y, w, d);
  ctx.fillStyle = C.cream; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.fillRect(x, fy, w, Hh);
  ctx.save(); ctx.beginPath(); ctx.rect(x, fy, w, Hh); ctx.clip();
  ctx.fillStyle = 'rgba(165,98,67,0.2)'; ctx.fillRect(x + w * 0.65, fy, w * 0.35, Hh);
  // балки
  ctx.strokeStyle = C.brown; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(x, fy + 6); ctx.lineTo(x + w, fy + 6); ctx.moveTo(x + 4, fy); ctx.lineTo(x + 4, by); ctx.moveTo(x + w - 4, fy); ctx.lineTo(x + w - 4, by);
  ctx.moveTo(x + w * 0.3, fy); ctx.lineTo(x + w * 0.3, by); ctx.moveTo(x + w * 0.7, fy); ctx.lineTo(x + w * 0.7, by);
  ctx.moveTo(x + 4, fy + 8); ctx.lineTo(x + w * 0.3, by - 6); ctx.moveTo(x + w - 4, fy + 8); ctx.lineTo(x + w * 0.7, by - 6); ctx.stroke();
  // нижний ряд камней
  ctx.fillStyle = C.stone; ctx.strokeStyle = INK; ctx.lineWidth = 1.5; for (let i = 0; i < 9; i++) { rr(x + i * w / 9, by - 12, w / 9 - 2, 12, 3); ctx.fill(); ctx.stroke(); }
  ctx.restore();
  ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeRect(x, fy, w, Hh);
  for (const k of [0.15, 0.85]) windowBack(x + w * k, fy + 44, 30, 30);
}

// соломенная крыша (вид сверху-спереди, свес над фасадом) — её контур; по нему же краснеет при попадании
function roofPath(x, y, w, d) {
  const fy = y + d - 92, ry1 = fy + 6, ridge = y + d * 0.18 - 30;
  ctx.beginPath(); ctx.moveTo(x - 14, ridge); ctx.lineTo(x + w + 14, ridge); ctx.quadraticCurveTo(x + w + 22, ry1, x + w + 16, ry1 + 4); ctx.lineTo(x - 16, ry1 + 4); ctx.quadraticCurveTo(x - 22, ry1, x - 14, ridge); ctx.closePath();
}

// перед: ящики с цветами, дверь, крыша, конёк, труба; tier — стадия урона (0 — цел, 1 — с 70% HP, 2 — с 40%, 3 — с 30%)
function houseFront(x, y, w, d, tier) {
  const Hh = 92, by = y + d, fy = by - Hh;
  windowFront(x + w * 0.15, fy + 44, 30, 30, tier >= 3);
  windowFront(x + w * 0.85, fy + 44, 30, 30, false);
  // ящики с цветами
  for (const wx of [x + w * 0.15, x + w * 0.85]) {
    ctx.fillStyle = C.wood; ctx.strokeStyle = INK; ctx.lineWidth = 2; rr(wx - 20, fy + 62, 40, 9, 2); ctx.fill(); ctx.stroke();
    for (let i = 0; i < 4; i++) { ctx.fillStyle = C.green; ell(wx - 14 + i * 9, fy + 60, 5, 4); ctx.fill(); ctx.fillStyle = [C.red, C.gold, C.cream, C.orange][i]; ell(wx - 14 + i * 9, fy + 57, 3, 3); ctx.fill(); }
  }
  // дверь с сердечком
  const dw = 44, dh = 64, dx = x + w / 2;
  ctx.fillStyle = C.wood; ctx.strokeStyle = INK; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(dx - dw / 2, by); ctx.lineTo(dx - dw / 2, by - dh + dw / 2); ctx.arc(dx, by - dh + dw / 2, dw / 2, Math.PI, 0); ctx.lineTo(dx + dw / 2, by); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = hexA(INK, 0.5); ctx.lineWidth = 1.5; for (const k of [-0.25, 0.25]) { ctx.beginPath(); ctx.moveTo(dx + k * dw, by); ctx.lineTo(dx + k * dw, by - dh + 12); ctx.stroke(); }
  ctx.fillStyle = C.red; ctx.beginPath(); ctx.moveTo(dx, by - dh + 30); ctx.bezierCurveTo(dx - 10, by - dh + 20, dx - 4, by - dh + 14, dx, by - dh + 20); ctx.bezierCurveTo(dx + 4, by - dh + 14, dx + 10, by - dh + 20, dx, by - dh + 30); ctx.fill();
  ctx.fillStyle = C.gold; ell(dx + 12, by - 30, 3, 3); ctx.fill();
  // крыша
  const ry0 = y - 30, ry1 = fy + 6, ridge = y + d * 0.18 - 30;
  ctx.fillStyle = C.olive; ctx.strokeStyle = INK; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x - 14, ridge); ctx.lineTo(x + w + 14, ridge); ctx.lineTo(x + w + 6, ry0 + 4); ctx.lineTo(x - 6, ry0 + 4); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.gold; roofPath(x, y, w, d); ctx.fill(); ctx.stroke();
  ctx.save(); ctx.clip();
  ctx.strokeStyle = hexA(C.brown, 0.55); ctx.lineWidth = 1.5;
  for (let i = 0; i < 40; i++) { const px = x - 14 + i * (w + 28) / 40; ctx.beginPath(); ctx.moveTo(px, ridge + 4); ctx.lineTo(px + (h2(i, 3) - 0.5) * 6, ry1 + 2); ctx.stroke(); }
  ctx.strokeStyle = hexA(C.brown, 0.8); ctx.lineWidth = 2; for (const q of [0.35, 0.7]) { ctx.beginPath(); ctx.moveTo(x - 20, ridge + (ry1 - ridge) * q); for (let i = 0; i <= 12; i++) ctx.lineTo(x - 20 + i * (w + 40) / 12, ridge + (ry1 - ridge) * q + (i % 2 ? 3 : -1)); ctx.stroke(); }
  ctx.fillStyle = 'rgba(255,244,220,0.18)'; ctx.fillRect(x - 20, ridge, w + 40, 10);
  ctx.restore();
  // конёк
  ctx.fillStyle = C.brown; ctx.strokeStyle = INK; ctx.lineWidth = 2.5; rr(x - 16, ridge - 5, w + 32, 10, 4); ctx.fill(); ctx.stroke();
  // труба
  const px = x + w * 0.74, py = ridge + 10;
  ctx.fillStyle = C.stone; ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.fillRect(px - 12, py - 36, 24, 36); ctx.strokeRect(px - 12, py - 36, 24, 36);
  ctx.strokeStyle = hexA(INK, 0.5); ctx.lineWidth = 1.5; for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(px - 12, py - 36 + i * 9); ctx.lineTo(px + 12, py - 36 + i * 9); ctx.stroke(); }
  ctx.fillStyle = INK; ctx.fillRect(px - 14, py - 40, 28, 6);
  // урон
  if (tier >= 1) { // дыра в соломе и трещина
    ctx.fillStyle = C.dark; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); const hx = x + w * 0.25, hy = ridge + (ry1 - ridge) * 0.55;
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU, q = 14 + h2(i, 9) * 8; ctx.lineTo(hx + Math.cos(a) * q, hy + Math.sin(a) * q * 0.55); } ctx.closePath(); ctx.fill(); ctx.stroke();
    crack(x + w * 0.52, fy + 18, 1.2, 4);
  }
  if (tier >= 2) { plaster(x + w * 0.4, fy + 70, 1.1, 0.2); crack(x + w * 0.9, fy + 72, 1, 8); }
}

function houseCottage(x, y, w, d, st, dx) {
  const { t, hp, hit } = st, Hh = 92, by = y + d, worried = hp < 0.6, fy = by - Hh;
  const ry1 = fy + 6, ridge = y + d * 0.18 - 30, tier = hp < 0.3 ? 3 : hp < 0.4 ? 2 : hp < 0.7 ? 1 : 0, k = `${x},${y},${w},${d}`;
  part(ctx, 'back|' + k, x - 8, fy - 3, x + w + 14, by + 12, dx, 0, () => houseBack(x, y, w, d));
  if (hit) { ctx.fillStyle = hexA(C.red, 0.4 * hit); ctx.fillRect(x + dx, fy, w, Hh); }
  windowLight(x + w * 0.15, fy + 44, 30, 30, t, 1, worried, hp < 0.3, dx);
  windowLight(x + w * 0.85, fy + 44, 30, 30, t, 2, worried, false, dx);
  part(ctx, `front|${k}|${tier}`, x - 26, y - 32, x + w + 26, by + 40, dx, 0, () => houseFront(x, y, w, d, tier));
  ctx.save(); ctx.translate(dx, 0);
  if (hit) { ctx.fillStyle = hexA(C.red, 0.35 * hit); roofPath(x, y, w, d); ctx.fill(); }
  flag(x + w * 0.3, ridge - 4, t, 1, hp < 0.3 ? 1 : 0);
  smoke(x + w * 0.74, ridge - 32, t, 3, hp < 0.3 ? '#45230d' : '#927e6a');
  if (hp < 0.3) { fire(x + w * 0.25, ridge + (ry1 - ridge) * 0.55, t, 1); smoke(x + w * 0.25, ridge + (ry1 - ridge) * 0.4, t, 3, '#45230d', 1.4); }
  ctx.restore();
  return ridge - 50;
}


// c — холст, r — прямоугольник здания
function draw(c, r) {
  const s = state.base;
  if (!s) return;
  ctx = c;
  const hit = s.regenTimer < 0.15 ? 1 - s.regenTimer / 0.15 : 0;
  houseCottage(r.x, r.y, r.w, r.h, { t: state.time, hp: Math.max(0, s.hp / s.maxHp), hit }, hit ? Math.sin(state.time * 80) * 2 : 0);
  ctx = G.shapes.ctx;
}

G.baseArt = { draw };
})(window.Game = window.Game || {});
