// Враги «Ambush» — тёмная раса (graphics.md), рисуются целиком живьём (их немного) и чуть крупнее тела (SIZE): улитка-
// рыцарь на доске (замах — копьё выравнивается, глаза жёлтые, линия рывка; рывок — пламя из-под доски; после — занос),
// дудочник-сирена (поёт — нотный стан от морды к дружочку и золотое кольцо вокруг него; пьёт — красный ручеёк в морду),
// черепаха-циклоп — мозг в панцире-чаше на толстых ногах (пулемёт за целью, крутится при стрельбе; прячется — половинки
// панциря смыкаются в шар, облако; удары по панцирю высекают искры). Ещё — свечение и ноты над зазомбированным
// дружочком (его тело — render/blobs.js). Мелочи нет нарочно: на телефоне враг — пара десятков точек.
// Анимация выводится из изменений врага между кадрами (свой кэш, состояние игры только читается). Приёмы рисования
// тёмной расы (колышущийся край, светящийся глаз, полоска HP) — из render/foes.js (G.foes.kit)
(function (G) {
'use strict';

const { state } = G;
let ctx = G.shapes.ctx;
G.shapes.onCtx((c) => { ctx = c; });
const { ell, hexA, edgePath, glowEye, star, hpBar } = G.foes.kit;
const gl = (x, y, R, col, alpha = 1, q = 0, to) => G.shapes.glow(ctx, x, y, R, col, alpha, q, to);

const TAU = Math.PI * 2;
const C = {
  ink: '#2a1d0d', cream: '#efd8a1', stone: '#927e6a', mud: '#684c3c', gold: '#efac28', red: '#ef3a0c', orange: '#ef692f',
  olive: '#a58c27', brown: '#724113', dark: '#300f0a', wine: '#550f0a', blood: '#9b1a0a', rust: '#773421',
  amber: '#ab5c1c', choc: '#36170c', deep: '#45230d', teal: '#3c9f9c', tealD: '#276468', tealDD: '#183f39',
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
const h2 = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); };

// вспышка от удара: белым поверх тела внутри его обрезки (flashNow — у врага, которого сейчас рисуем)
let flashNow = 0;
function flashFill(rx, ry) {
  if (flashNow > 0) { ctx.fillStyle = `rgba(255,250,240,${0.85 * flashNow})`; ctx.fillRect(-rx * 1.6, -ry * 1.6, rx * 3.2, ry * 3.2); }
}

// тело тёмной расы: тень, цвет, подсветка снизу цветом глаз, обводка
function foeBody(rx, ry, t, kind, seed, col, sh, eye, glowA = 0.35) {
  edgePath(rx, ry, t, kind, seed); ctx.fillStyle = sh; ctx.fill();
  ctx.save(); edgePath(rx, ry, t, kind, seed); ctx.clip();
  ctx.fillStyle = col; ell(-rx * 0.05, -ry * 0.12, rx * 0.92, ry * 0.85); ctx.fill();
  ctx.strokeStyle = hexA(eye, glowA); ctx.lineWidth = Math.min(rx, ry) * 0.26; ell(0, -ry * 0.18, rx * 1.02, ry); ctx.stroke();
  flashFill(rx, ry);
  ctx.restore();
  edgePath(rx, ry, t, kind, seed); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke();
}

// ===== улитка-рыцарь =====
// Бордовый слизняк на красной доске (одна золотая полоса): раковина с толстой спиралью и тремя шипами, простой красный
// флажок, крупная голова с клыкастой пастью, глаза на толстых стебельках; копьё на переднем плане — поверх тела, под
// пастью, наружу выходит кончик. st: idle | walk | aim | charge | skid; k — доля состояния (0..1)
function snailBoard(r) {
  const y0 = r * 0.66, y1 = r * 0.92;
  const path = () => {
    ctx.beginPath(); ctx.moveTo(-r * 1.3, y0); ctx.lineTo(r * 1.15, y0);
    ctx.quadraticCurveTo(r * 1.55, y0, r * 1.7, y0 - r * 0.32); ctx.quadraticCurveTo(r * 1.78, y1, r * 1.15, y1);
    ctx.lineTo(-r * 1.2, y1); ctx.quadraticCurveTo(-r * 1.55, y1, -r * 1.52, y0 - r * 0.12);
    ctx.quadraticCurveTo(-r * 1.45, y0, -r * 1.3, y0); ctx.closePath();
  };
  path(); ctx.fillStyle = C.blood; ctx.fill();
  ctx.save(); path(); ctx.clip();
  ctx.fillStyle = C.red; ctx.fillRect(-r * 2, y0 - r * 0.5, r * 4, r * 0.6);
  ctx.fillStyle = C.gold; ctx.fillRect(-r * 2, y0 + r * 0.12, r * 4, r * 0.06);
  ctx.restore();
  path(); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke();
}

function spiralPath(cx, cy, R, turns, a0) {
  ctx.beginPath();
  for (let i = 0; i <= 64; i++) { const q = i / 64, a = a0 + q * turns * TAU, rr = R * q; const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.95; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
}

function snailShell(r) {
  const cx = -r * 0.45, cy = -r * 0.16, R = r * 0.76;
  ctx.fillStyle = C.cream; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
  for (const a of [-2.55, -1.95, -1.35]) {
    const px = Math.cos(a + Math.PI / 2) * r * 0.16, py = Math.sin(a + Math.PI / 2) * r * 0.16;
    const bx = cx + Math.cos(a) * R * 0.85, by = cy + Math.sin(a) * R * 0.85;
    ctx.beginPath(); ctx.moveTo(bx + px, by + py); ctx.lineTo(cx + Math.cos(a) * (R + r * 0.36), cy + Math.sin(a) * (R + r * 0.36));
    ctx.lineTo(bx - px, by - py); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ell(cx, cy, R, R * 0.95); ctx.fillStyle = C.choc; ctx.fill();
  ctx.save(); ell(cx, cy, R, R * 0.95); ctx.clip();
  ctx.fillStyle = C.rust; ell(cx - R * 0.08, cy - R * 0.1, R * 0.9, R * 0.84); ctx.fill();
  ctx.lineCap = 'round'; ctx.strokeStyle = C.choc; ctx.lineWidth = r * 0.15;
  spiralPath(cx + R * 0.06, cy + R * 0.05, R * 0.8, 1.6, 0.9); ctx.stroke();
  ctx.save(); ctx.translate(cx, cy); flashFill(R, R); ctx.restore();
  ctx.restore();
  ell(cx, cy, R, R * 0.95); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke();
}

function snailFlag(r, t, st) {
  const px = -r * 0.62, py = -r * 0.85, tx = -r * 0.78, ty = -r * 1.6;
  ctx.lineCap = 'round';
  for (const [lw, col] of [[r * 0.15, C.ink], [r * 0.07, C.stone]]) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(tx, ty); ctx.stroke(); }
  const fast = st === 'charge' ? 3 : 1, f = Math.sin(t * 6 * fast), L = r * (st === 'charge' ? 0.85 : 0.72);
  ctx.fillStyle = C.red; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx - L, ty + r * (st === 'charge' ? 0.1 : 0.22) + f * r * 0.1); ctx.lineTo(tx + (px - tx) * 0.38, ty + (py - ty) * 0.38);
  ctx.closePath(); ctx.fill(); ctx.stroke();
}

function snailStalks(r, t, st, eye) {
  const back = st === 'charge' ? 1 : st === 'aim' ? 0.35 : 0, wild = st === 'skid' ? 1 : 0;
  [[r * 0.56, -r * 0.42, r * 0.4, -r * 1.12, 0], [r * 0.9, -r * 0.44, r * 1.06, -r * 1.16, 1.7]].forEach(([bx, by, tx, ty, ph]) => {
    const sw = Math.sin(t * 2.4 + ph) * r * 0.07 + wild * Math.sin(t * 17 + ph) * r * 0.16;
    const ex = tx + sw - back * r * 0.45, ey = ty + back * r * 0.28;
    ctx.lineCap = 'round';
    for (const [lw, col] of [[r * 0.26, C.ink], [r * 0.16, C.wine]]) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo((bx + ex) / 2 + r * 0.05, (by + ey) / 2, ex, ey); ctx.stroke(); }
    glowEye(ex, ey, r * 0.21, eye);
    ctx.fillStyle = C.dark; ell(ex + r * 0.05, ey, r * 0.05, r * 0.14); ctx.fill();
  });
}

function snailLance(r, t, st, k) {
  let a = -0.15 + Math.sin(t * 2) * 0.025;
  if (st === 'walk') a = -0.13 + Math.sin(t * 5) * 0.035;
  if (st === 'aim') a = lerp(-0.14, 0.02, ease(k * 3)) + Math.sin(t * 40) * 0.015;
  if (st === 'charge') a = 0.02;
  if (st === 'skid') a = lerp(0.02, -0.2, ease(k)) + Math.sin(k * 22) * 0.05 * (1 - k);
  ctx.save(); ctx.translate(r * 0.02, r * 0.44); ctx.rotate(a);
  const L0 = 0, L1 = r * 1.42, w0 = r * 0.17;
  const cone = () => { ctx.beginPath(); ctx.moveTo(L0, -w0); ctx.lineTo(L1, -r * 0.08); ctx.lineTo(L1, r * 0.08); ctx.lineTo(L0, w0); ctx.closePath(); };
  cone(); ctx.fillStyle = C.cream; ctx.fill();
  ctx.save(); cone(); ctx.clip();
  ctx.fillStyle = C.red; for (let i = 0; i < 4; i++) ctx.fillRect(L0 + r * 0.16 + i * r * 0.34, -w0, r * 0.15, w0 * 2);
  ctx.fillStyle = 'rgba(42,29,13,0.22)'; ctx.fillRect(L0, r * 0.03, L1, w0);
  ctx.restore();
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2; cone(); ctx.stroke();
  ctx.fillStyle = C.stone; ctx.beginPath(); ctx.moveTo(L1 - r * 0.05, -r * 0.14); ctx.lineTo(L1 + r * 0.38, 0); ctx.lineTo(L1 - r * 0.05, r * 0.14); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.stone; ell(L0, 0, r * 0.1, r * 0.2); ctx.fill(); ctx.stroke();
  if (st === 'aim' || st === 'charge') gl(L1 + r * 0.3, 0, r * 0.4, C.cream, 0.35 + 0.3 * (Math.sin(t * 14) * 0.5 + 0.5));
  ctx.restore();
}

function tailFire(x, y, r, t, k = 1) {
  for (const [col, L, h] of [[C.red, 1.35, 0.3], [C.orange, 1.0, 0.21], [C.gold, 0.6, 0.12]]) {
    const fl = 0.8 + 0.2 * Math.sin(t * 25 + L * 7), len = r * L * fl * k;
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x + r * 0.1, y - r * h);
    ctx.quadraticCurveTo(x - len * 0.5, y - r * h * 1.3 + Math.sin(t * 17 + L) * r * 0.06, x - len, y - r * 0.05 + Math.sin(t * 13 + L) * r * 0.06);
    ctx.quadraticCurveTo(x - len * 0.5, y + r * h * 0.9, x + r * 0.1, y + r * h * 0.5);
    ctx.closePath(); ctx.fill();
  }
}

function drawSnail(o) {
  const r = o.r, face = o.face, t = o.t + (o.seed || 0), st = o.st, k = o.k || 0;
  const aim = st === 'aim', charge = st === 'charge', skid = st === 'skid';
  const w = Math.sin(t * 4);
  let sx = 1 + 0.035 * w, sy = 1 - 0.035 * w, dx = 0, lean = 0, bob = 0;
  if (st === 'walk') { bob = Math.abs(Math.sin(t * 4)) * r * 0.05; lean = Math.sin(t * 2.2) * 0.035; sx *= 1 + 0.05 * Math.sin(t * 6); sy *= 1 - 0.04 * Math.sin(t * 6); }
  if (aim) { const q = Math.sin(t * 30) * 0.5 + 0.5; sx *= 1.06 + 0.03 * q; sy *= 0.93; dx = -r * 0.14 * Math.min(1, k * 4); }
  if (charge) { sx *= 1.1; sy *= 0.92; lean = 0.09; }
  if (skid) lean = -0.13 * Math.sin(Math.min(1, k * 1.4) * Math.PI);
  const eye = aim || charge ? C.gold : C.red;
  ctx.fillStyle = 'rgba(20,10,5,0.5)'; ell(o.x, o.y + r * 0.96, r * 1.6, r * 0.3); ctx.fill();
  ctx.save(); ctx.translate(o.x + face * dx, o.y - bob); ctx.scale(face, 1); ctx.rotate(lean);
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (charge) {
    ctx.strokeStyle = C.cream; ctx.lineWidth = r * 0.09;
    for (let i = 0; i < 3; i++) { const q = (t * 4 + i * 0.33) % 1, yy = -r * 0.8 + i * r * 0.55; ctx.globalAlpha = 0.55 * (1 - q); ctx.beginPath(); ctx.moveTo(-r * (1.45 + q * 0.6), yy); ctx.lineTo(-r * (2.2 + q * 1.2), yy); ctx.stroke(); }
    ctx.globalAlpha = 1;
    tailFire(-r * 1.45, r * 0.8, r, t);
  }
  if (aim) {
    for (let i = 0; i < 3; i++) { const q = (t * 2.2 + i / 3) % 1; ctx.globalAlpha = 0.55 * (1 - q); ctx.fillStyle = i % 2 ? C.stone : C.mud; ell(-r * (1.6 + q * 0.7), r * (0.75 - q * 0.55), r * (0.16 + q * 0.2), r * (0.13 + q * 0.16)); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  snailBoard(r);
  snailFlag(r, t, st);
  ctx.save(); ctx.translate(r * 0.05, r * 0.44); ctx.scale(sx, sy); foeBody(r * 1.12, r * 0.3, t, 'wobble', 1, C.wine, C.dark, C.red); ctx.restore();
  snailShell(r);
  snailStalks(r, t, st, eye);
  ctx.save(); ctx.translate(r * 0.74, r * 0.02); ctx.scale(sx, sy); foeBody(r * 0.5, r * 0.56, t, 'wobble', 2, C.wine, C.dark, C.red); ctx.restore();
  ctx.fillStyle = C.dark; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(r * 0.9, r * 0.02, r * 0.24, r * 0.16, 0, 0, Math.PI); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.cream;
  for (const fx of [0.74, 0.9, 1.06]) { ctx.beginPath(); ctx.moveTo(r * (fx - 0.06), r * 0.02); ctx.lineTo(r * fx, r * 0.14); ctx.lineTo(r * (fx + 0.06), r * 0.02); ctx.closePath(); ctx.fill(); }
  snailLance(r, t, st, k);
  if (skid) for (let i = 0; i < 3; i++) {
    const q = (k * 2 + i / 3) % 1;
    ctx.globalAlpha = 0.6 * (1 - q) * (1 - k); ctx.fillStyle = i % 2 ? C.stone : C.mud;
    ell(r * (1.5 + q * 0.6), r * (0.85 - q * 0.6), r * (0.17 + q * 0.25), r * (0.13 + q * 0.18)); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  ctx.lineCap = 'butt';
}

// ===== дудочник-сирена =====
// Злой патлатый демон: чёрная копна с крупными космами (книзу шире, космы висят и качаются), большие кремовые рога,
// большая тёмная морда под чёлкой с двумя крупными красными раскосыми глазами. Дудки и рта нет — он поёт: глаза
// прищурены светящимися дугами, ноты и нотный стан идут от морды; пьёт — ручеёк втекает в морду, тело вспухает.
// st: idle | walk | play | drink
// чёрная копна, красные глаза (подсветка снизу — красная)
const P = { hair: C.choc, shade: C.ink, strand: C.mud, face: C.ink, eye: C.red, rim: C.red };

function hairPath(rx, ry, t, sway, seed) {
  const N = 26, pts = [];
  for (let i = 0; i < N; i++) {
    const ang = i / N * TAU + 0.06, c = Math.cos(ang), s = Math.sin(ang);
    const wide = 1 + 0.2 * Math.max(0, s);
    let x = c * rx * wide, y = s * ry + ry * 0.05;
    if (i % 2 === 0) {
      if (s > -0.45) { x += (Math.sin(t * 3 + i + seed) * 0.05 + sway * 0.08 * (s + 0.45)) * rx; y += (0.08 + 0.3 * Math.max(0, s + 0.2)) * ry; }
      else { x += c * rx * 0.08; y += s * ry * 0.08; }
    } else { x *= 0.95; y = y * 0.95 + (s > 0 ? ry * 0.05 : 0); }
    pts.push([x, y]);
  }
  ctx.beginPath();
  for (let i = 0; i <= N; i += 2) {
    const [vx, vy] = pts[(i + N - 1) % N], [tx, ty] = pts[i % N], [nx, ny] = pts[(i + 1) % N];
    if (i === 0) ctx.moveTo(vx, vy);
    ctx.quadraticCurveTo(vx + (tx - vx) * 0.2, vy + (ty - vy) * 0.7, tx, ty);
    ctx.quadraticCurveTo(nx + (tx - nx) * 0.2, ny + (ty - ny) * 0.7, nx, ny);
  }
  ctx.closePath();
}

function piperHorn(bx, by, r, s) {
  ctx.fillStyle = C.cream; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(bx - r * 0.18, by);
  ctx.quadraticCurveTo(bx - r * 0.1 * s - r * 0.25, by - r * 0.7, bx - r * 0.55 * s, by - r * 0.95);
  ctx.quadraticCurveTo(bx + r * 0.05, by - r * 0.6, bx + r * 0.18, by);
  ctx.closePath(); ctx.fill(); ctx.stroke();
}

function note(x, y, s, col, a = 1, dbl = false) {
  if (a <= 0.02) return;
  ctx.globalAlpha = a; ctx.lineCap = 'round';
  const stems = dbl ? [x + s * 0.4, x + s * 1.6] : [x + s * 0.4];
  for (const [lw, c] of [[s * 0.55, C.ink], [s * 0.26, col]]) {
    ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.beginPath();
    if (dbl) { ctx.moveTo(stems[0], y); ctx.lineTo(stems[0], y - s * 1.6); ctx.lineTo(stems[1], y - s * 1.85); ctx.lineTo(stems[1], y - s * 0.25); }
    else { ctx.moveTo(stems[0], y); ctx.lineTo(stems[0], y - s * 1.6); ctx.quadraticCurveTo(x + s * 1.0, y - s * 1.25, x + s * 1.05, y - s * 0.7); }
    ctx.stroke();
  }
  ctx.fillStyle = col; ctx.strokeStyle = C.ink; ctx.lineWidth = s * 0.24;
  ell(x, y, s * 0.52, s * 0.38, -0.4); ctx.fill(); ctx.stroke();
  if (dbl) { ell(x + s * 1.2, y - s * 0.25, s * 0.52, s * 0.38, -0.4); ctx.fill(); ctx.stroke(); }
  ctx.globalAlpha = 1;
}

// где морда в мире — к ней тянется связь и в неё течёт ручеёк
function piperFace(o) {
  const r = o.r, t = o.t + (o.seed || 0);
  const bob = o.st === 'walk' || o.moving ? Math.abs(Math.sin(t * 6)) * r * 0.08 : 0;
  return { x: o.x + o.face * r * 0.3, y: o.y - bob - r * 0.02 };
}

function drawPiper(o) {
  const r = o.r, face = o.face, t = o.t + (o.seed || 0), st = o.st;
  const play = st === 'play', drink = st === 'drink', moving = st === 'walk' || o.moving;
  const w = Math.sin(t * 4);
  let sx = 1 + 0.04 * w, sy = 1 - 0.04 * w, sway = Math.sin(t * 1.7) * 0.4;
  const bob = moving ? Math.abs(Math.sin(t * 6)) * r * 0.08 : 0;
  if (moving) sway = Math.sin(t * 6);
  if (play) { const beat = Math.sin(t * 9); sway = Math.sin(t * 4.5) * 0.9; sy *= 1 + 0.03 * beat; sx *= 1 - 0.02 * beat; }
  let gulp = 0;
  if (drink) { gulp = Math.max(0, Math.sin(t * 5)); sx *= 1 + 0.07 * gulp; sy *= 1 + 0.03 * gulp; }
  ctx.fillStyle = 'rgba(20,10,5,0.5)'; ell(o.x, o.y + r * 1.05, r * 1.1, r * 0.3); ctx.fill();
  ctx.save(); ctx.translate(o.x, o.y - bob); ctx.scale(face, 1);
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  piperHorn(-r * 0.22, -r * 0.62, r, 1);
  piperHorn(r * 0.45, -r * 0.66, r, -0.6);
  ctx.save(); ctx.scale(sx, sy);
  const rx = r * 0.92, ry = r;
  hairPath(rx, ry, t, sway, o.seed || 0); ctx.fillStyle = P.shade; ctx.fill();
  ctx.save(); hairPath(rx, ry, t, sway, o.seed || 0); ctx.clip();
  ctx.fillStyle = P.hair; ell(-rx * 0.12, -ry * 0.25, rx * 0.88, ry * 0.88); ctx.fill();
  ctx.lineWidth = r * 0.1; ctx.strokeStyle = P.strand;
  for (let i = 0; i < 4; i++) {
    const x0 = -rx * 0.75 + i * rx * 0.5, sw = Math.sin(t * 3 + i) * r * 0.05 + sway * r * 0.08;
    ctx.beginPath(); ctx.moveTo(x0 * 0.4, ry * 0.15); ctx.quadraticCurveTo(x0 * 1.05, ry * 0.5, x0 * 1.1 + sw, ry * 1.4); ctx.stroke();
  }
  if (drink) gl(r * 0.1, r * 0.1, r * 0.95, C.red, 0.3 + 0.3 * gulp);
  ctx.strokeStyle = hexA(P.rim, 0.3); ctx.lineWidth = r * 0.24; ell(0, -r * 0.1, rx * 1.2, ry * 1.25); ctx.stroke();
  flashFill(rx * 1.3, ry * 1.4);
  ctx.restore();
  hairPath(rx, ry, t, sway, o.seed || 0); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
  // морда: большая тень под чёлкой, в ней два крупных злых глаза
  const fx = r * 0.26, fy = -r * 0.02;
  ctx.fillStyle = P.face; ell(fx, fy, r * 0.66, r * 0.48); ctx.fill();
  if (play) {
    // поёт: глаза прищурены дугами, светятся
    for (const [ex, s] of [[fx - r * 0.25, -1], [fx + r * 0.25, 1]]) {
      gl(ex, fy, r * 0.42, P.eye, 0.55);
      ctx.strokeStyle = P.eye; ctx.lineWidth = r * 0.1;
      ctx.beginPath(); ctx.moveTo(ex - r * 0.15, fy + s * r * 0.0 - r * 0.02); ctx.quadraticCurveTo(ex, fy - r * 0.13, ex + r * 0.15, fy + r * 0.02 * s); ctx.stroke();
    }
  } else {
    const sq = drink ? 0.85 : 0.6;
    for (const [ex, s] of [[fx - r * 0.25, -1], [fx + r * 0.25, 1]]) {
      glowEye(ex, fy, r * 0.18, P.eye, s * 0.45, sq);
      ctx.fillStyle = C.dark; ell(ex + r * 0.04, fy, r * 0.045, r * 0.12 * sq); ctx.fill();
    }
  }
  // чёлка: три коротких космы над глазами
  ctx.fillStyle = P.hair; ctx.strokeStyle = C.ink;
  for (let i = 0; i < 3; i++) {
    const bx = fx - r * 0.42 + i * r * 0.42, top = fy - r * 0.56, len = r * (0.2 + 0.05 * (i % 2)), sw = Math.sin(t * 3 + i) * r * 0.03;
    ctx.beginPath(); ctx.moveTo(bx - r * 0.22, top); ctx.quadraticCurveTo(bx - r * 0.09, top + len * 0.6, bx + sw, top + len);
    ctx.quadraticCurveTo(bx + r * 0.09, top + len * 0.5, bx + r * 0.22, top); ctx.closePath(); ctx.fill();
    ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(bx - r * 0.22, top + r * 0.05); ctx.quadraticCurveTo(bx - r * 0.09, top + len * 0.6, bx + sw, top + len);
    ctx.quadraticCurveTo(bx + r * 0.09, top + len * 0.5, bx + r * 0.22, top + r * 0.05); ctx.stroke();
  }
  ctx.restore(); ctx.lineCap = 'butt';
  o.mouth = piperFace(o);
  if (play && !o.noNotes) for (let i = 0; i < 3; i++) {
    const q = (t * 0.7 + i / 3) % 1;
    note(o.mouth.x + face * (r * 0.4 + q * r * 0.5), o.mouth.y - r * 0.2 - q * r * 1.4, r * 0.18, C.gold, Math.sin(q * Math.PI), i === 1);
  }
}

// нотный стан от морды к дружочку: три волнистые линии, по ним бегут ноты; prog 0..1 — насколько дозвался
function charmLink(x1, y1, x2, y2, t, prog) {
  const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
  const amp = 4 + 3 * prog, waves = Math.max(1.5, d / 45);
  const at = (q, off) => { const wv = Math.sin(q * waves * TAU - t * 7) * amp * Math.sin(q * Math.PI); return [x1 + dx * q + nx * (wv + off), y1 + dy * q + ny * (wv + off)]; };
  ctx.lineCap = 'round';
  ctx.strokeStyle = hexA(C.gold, 0.12 + 0.12 * prog); ctx.lineWidth = 12;
  ctx.beginPath(); for (let i = 0; i <= 40; i++) { const [x, y] = at(i / 40, 0); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.stroke();
  for (const off of [-3.5, 0, 3.5]) {
    ctx.strokeStyle = hexA(C.gold, 0.35 + 0.5 * prog); ctx.lineWidth = 1.4;
    ctx.beginPath(); for (let i = 0; i <= 40; i++) { const [x, y] = at(i / 40, off); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.stroke();
  }
  for (let i = 0; i < 4; i++) {
    const q = (t * 0.6 + i / 4) % 1, [x, y] = at(q, 0);
    note(x - 2, y + 2, 4.2, C.gold, Math.sin(q * Math.PI), i % 2 === 1);
  }
}

function charmRing(x, y, R, prog, t) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(42,29,13,0.75)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke();
  if (prog > 0.8) gl(x, y, R * 1.3, C.gold, 0.25 * (0.5 + 0.5 * Math.sin(t * 20)));
  ctx.strokeStyle = C.gold; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(x, y, R, -Math.PI / 2, -Math.PI / 2 + TAU * prog); ctx.stroke();
  const a = -Math.PI / 2 + TAU * prog; note(x + Math.cos(a) * R - 1, y + Math.sin(a) * R + 2, 3.6, C.gold, 1);
  ctx.lineCap = 'butt';
}

// ручеёк жизни: от дружочка в морду, по нему бегут капли
function drainStream(x1, y1, x2, y2, t) {
  const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
  const at = (q) => { const wv = Math.sin(q * 3 * TAU - t * 9) * 2.5 * Math.sin(q * Math.PI); return [x1 + dx * q + nx * wv, y1 + dy * q + ny * wv - Math.sin(q * Math.PI) * 8]; };
  ctx.lineCap = 'round';
  for (const [lw, col] of [[4.5, C.ink], [2.6, C.blood], [1, C.red]]) {
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath();
    for (let i = 0; i <= 30; i++) { const [x, y] = at(i / 30); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.stroke();
  }
  for (let i = 0; i < 5; i++) {
    const q = (t * 1.3 + i / 5) % 1, [x, y] = at(q);
    ctx.fillStyle = C.red; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x - nx * 0, y - 3.2); ctx.quadraticCurveTo(x + 2.6, y + 0.5, x, y + 2.4); ctx.quadraticCurveTo(x - 2.6, y + 0.5, x, y - 3.2); ctx.fill(); ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

// ===== черепаха-циклоп =====
// Мозг-циклоп (красный, извилины, один жёлтый глаз со злой бровью углом) сидит в панцире-чаше: коричневые пластины со
// швами, по бокам кремовые шипы. Четыре толстые ноги без коленей (ближняя пара шире), под чашей — пулемёт с тремя
// стволами: смотрит на цель, при стрельбе крутится. Прячется — ноги поджимаются, мозг оседает, половинки панциря
// съезжаются с боков и смыкаются над ним в шар, в шве светится глаз, по бокам — облако. Вид спереди: зеркалить не надо.
// hide 0..1 — насколько спрятался; aim — мировой угол пулемёта и взгляда; shot 0..1 — выстрел
// панцирь: коричневые пластины, тёмные швы, светлая кромка
const SH = { shell: C.brown, shellSh: C.deep, shellHi: C.amber, seam: C.choc };

function thickLeg(hx, hy, fx, fy, w, col, foot) {
  ctx.lineCap = 'round';
  for (const [lw, c] of [[w + 4, C.ink], [w, col]]) { ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(fx, fy); ctx.stroke(); }
  ctx.fillStyle = foot; ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ell(fx, fy + w * 0.12, w * 0.66, w * 0.36); ctx.fill(); ctx.stroke();
}

function turtleLegs(r, t, by, walk, h, col, colBack, foot) {
  const fold = 1 - 0.55 * h;
  [[0.38, 0.62, 0.9, r * 0.32, colBack, 0], [0.66, 1.18, 0.82, r * 0.4, col, 1]].forEach(([hipX, footX, footY, w, c, ph]) => {
    for (const s of [-1, 1]) {
      const lift = walk * Math.max(0, Math.sin(t * 8 + ph * Math.PI + (s > 0 ? Math.PI : 0))) * r * 0.16;
      const hx = s * hipX * r, hy = by + r * 0.35;
      const fx = s * lerp(hipX, footX, fold) * r, fy = lerp(footY * r, hy + r * 0.12, h * 0.85) - lift;
      thickLeg(hx, hy, fx, fy, w * (1 - 0.3 * h), c, foot);
    }
  });
}

function gatling(gx, gy, r, ax, ay, h, shot, t) {
  const L = r * (0.8 - 0.65 * h) - shot * r * 0.15;
  if (L < r * 0.1) return;
  const ux = ax, uy = ay * 0.6, d = Math.hypot(ux, uy), nx = -uy / d, ny = ux / d, spin = shot > 0 ? t * 40 : 0;
  for (let i = -1; i <= 1; i++) {
    const off = i * r * 0.11;
    for (const [lw, c] of [[r * 0.15, C.ink], [r * 0.08, Math.round(spin + i) % 3 === 0 ? C.stone : C.mud]]) {
      ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(gx + nx * off, gy + ny * off); ctx.lineTo(gx + ux / d * L + nx * off, gy + uy / d * L + ny * off); ctx.stroke();
    }
  }
  ctx.fillStyle = C.deep; ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ell(gx, gy, r * 0.26, r * 0.2); ctx.fill(); ctx.stroke();
  if (shot > 0.4) {
    const fx = gx + ux / d * (L + r * 0.25), fy = gy + uy / d * (L + r * 0.25);
    gl(fx, fy, r * 0.8, C.gold, 0.6 * shot); star(fx, fy, r * 0.36 * shot, C.orange);
  }
}

function plates(cx, cy, W, Hh, r) {
  ctx.strokeStyle = SH.seam; ctx.lineWidth = r * 0.08; ctx.lineCap = 'round';
  ctx.beginPath();
  for (const k of [-0.5, 0, 0.5]) { ctx.moveTo(cx + k * W * 0.55, cy - Hh); ctx.quadraticCurveTo(cx + k * W * 1.05, cy, cx + k * W * 0.9, cy + Hh); }
  ctx.moveTo(cx - W, cy + Hh * 0.05); ctx.quadraticCurveTo(cx, cy + Hh * 0.35, cx + W, cy + Hh * 0.05);
  ctx.stroke();
}

function shellSpikes(xs, y, r) {
  ctx.fillStyle = C.cream; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
  for (const [x, s] of xs) { ctx.beginPath(); ctx.moveTo(x - r * 0.13, y + r * 0.1); ctx.lineTo(x + s * r * 0.12, y - r * 0.32); ctx.lineTo(x + r * 0.13, y + r * 0.08); ctx.closePath(); ctx.fill(); ctx.stroke(); }
}

function drawTurtle(o) {
  const r = o.r, t = o.t + (o.seed || 0), h = ease(o.hide || 0), shot = o.shot || 0;
  const ax = Math.cos(o.aim), ay = Math.sin(o.aim), walk = o.moving ? 1 : 0;
  const by = -r * 0.3 + h * r * 0.45 - walk * Math.abs(Math.sin(t * 8)) * r * 0.05;
  ctx.fillStyle = 'rgba(20,10,5,0.5)'; ell(o.x, o.y + r * 0.95, r * (1.5 - 0.3 * h), r * 0.32); ctx.fill();
  ctx.save(); ctx.translate(o.x, o.y);
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  turtleLegs(r, t, by, walk, h, C.blood, C.wine, C.dark);
  const gy = by + r * 0.62;
  if (ay < 0) gatling(0, gy, r, ax, ay, h, shot, t);
  // панцирь-чаша
  const R = r * 1.08, cy = by + r * 0.12;
  const bowl = () => { ctx.beginPath(); ctx.ellipse(0, cy, R, r * 0.68, 0, 0, Math.PI); ctx.ellipse(0, cy, R, r * 0.22, 0, Math.PI, 0, true); ctx.closePath(); };
  shellSpikes([[-R * 0.98, -1], [R * 0.98, 1]], cy - r * 0.02, r);
  bowl(); ctx.fillStyle = SH.shellSh; ctx.fill();
  ctx.save(); bowl(); ctx.clip();
  ctx.fillStyle = SH.shell; ell(-r * 0.1, cy + r * 0.1, R * 0.95, r * 0.5); ctx.fill();
  ctx.strokeStyle = SH.seam; ctx.lineWidth = r * 0.08;
  ctx.beginPath(); for (const k of [-0.45, 0.45]) { ctx.moveTo(k * R, cy); ctx.quadraticCurveTo(k * R * 1.1, cy + r * 0.4, k * R * 0.7, cy + r * 0.7); } ctx.stroke();
  ctx.save(); ctx.translate(0, cy); flashFill(R, r); ctx.restore();
  ctx.restore();
  bowl(); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke();
  // мозг с извилинами
  if (h < 0.98) {
    ctx.save(); ctx.translate(0, by - r * 0.22 + h * r * 0.3); ctx.scale(1 - 0.15 * h, 1 - 0.4 * h);
    foeBody(r * 0.92, r * 0.68, t, 'wobble', 3, C.blood, C.wine, C.gold, 0.2);
    ctx.strokeStyle = C.wine; ctx.lineWidth = r * 0.09; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -r * 0.6); ctx.quadraticCurveTo(r * 0.08, -r * 0.3, 0, -r * 0.05);
    ctx.moveTo(-r * 0.6, -r * 0.33); ctx.quadraticCurveTo(-r * 0.4, -r * 0.48, -r * 0.24, -r * 0.28);
    ctx.moveTo(r * 0.6, -r * 0.33); ctx.quadraticCurveTo(r * 0.4, -r * 0.48, r * 0.24, -r * 0.28);
    ctx.stroke();
    ctx.restore();
  }
  // кромка панциря поверх низа мозга
  ctx.fillStyle = SH.shellHi; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(0, cy, R, r * 0.22, 0, 0, Math.PI); ctx.ellipse(0, cy, R * 0.88, r * 0.12, 0, Math.PI, 0, true); ctx.closePath(); ctx.fill(); ctx.stroke();
  if (h < 0.85) {
    const ex = ax * r * 0.06, ey = by + r * 0.02, er = r * 0.3 * (1 - 0.5 * h);
    glowEye(ex, ey, er, shot > 0.3 ? C.cream : C.gold, 0, 1 - 0.85 * h);
    ctx.fillStyle = C.ink; ell(ex + ax * er * 0.35, ey + ay * er * 0.25, er * 0.28, er * 0.7 * (1 - 0.85 * h)); ctx.fill();
    ctx.strokeStyle = C.ink; ctx.lineWidth = r * 0.14; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ex - er * 1.3, ey - er * 1.25); ctx.lineTo(ex, ey - er * 0.85); ctx.lineTo(ex + er * 1.3, ey - er * 1.25); ctx.stroke();
  }
  // половинки панциря смыкаются над мозгом
  if (h > 0.02) {
    const top = by - r * 0.15, Ry = r * 0.92, open = R * (1 - h);
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.beginPath(); ctx.rect(-R - 2, top - Ry - 6, 2 * R + 4, Ry * 2 + r * 0.6); ctx.clip();
      ctx.translate(s * open, 0);
      ctx.beginPath(); ctx.rect(s < 0 ? -R - 4 : 0, top - Ry - 6, R + 4, Ry * 2 + r * 0.6); ctx.clip();
      const shell = () => { ctx.beginPath(); ctx.ellipse(0, top, R, Ry, 0, Math.PI, 0); ctx.lineTo(R, cy); ctx.ellipse(0, cy, R, r * 0.22, 0, 0, Math.PI); ctx.closePath(); };
      shell(); ctx.fillStyle = SH.shellSh; ctx.fill();
      ctx.save(); shell(); ctx.clip();
      ctx.fillStyle = SH.shell; ell(-r * 0.15, top - r * 0.1, R * 0.9, Ry * 0.85); ctx.fill();
      plates(0, top - r * 0.05, R, Ry * 0.85, r);
      if (s < 0) { ctx.fillStyle = hexA(SH.shellHi, 0.6); ell(-R * 0.45, top - Ry * 0.5, R * 0.22, Ry * 0.12, -0.4); ctx.fill(); }
      ctx.save(); ctx.translate(0, top); flashFill(R, Ry); ctx.restore();
      ctx.restore();
      shell(); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    }
    if (h > 0.6) {
      const k = (h - 0.6) / 0.4, blink = (t % 2.6) < 0.12;
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, top - Ry); ctx.lineTo(0, cy + r * 0.2); ctx.stroke();
      if (!blink) { gl(0, by - r * 0.05, r * 0.5, C.gold, 0.5 * k); ctx.fillStyle = hexA(C.gold, k); ell(0, by - r * 0.05, r * 0.05, r * 0.16); ctx.fill(); }
      for (let i = 0; i < 4; i++) {
        const q = (t * 0.9 + i / 4) % 1, side = i % 2 ? 1 : -1;
        ctx.globalAlpha = 0.5 * (1 - q) * k; ctx.fillStyle = C.olive;
        ell(side * (R + q * r * 0.5), top - q * r * 0.5, r * (0.18 + q * 0.3), r * (0.14 + q * 0.22)); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
  if (ay >= 0) gatling(0, gy, r, ax, ay, h, shot, t);
  ctx.restore(); ctx.lineCap = 'butt';
}

// ===== связь с игрой =====

// рисунок крупнее тела (столкновения те же), как у Зомби: на телефоне не теряются
const SIZE = { snail: 1.05, piper: 1.35, turtle: 1.22 };

const anim = new WeakMap();
// кэш анимации врага: скорость, сторона взгляда, когда ранен / выстрелил, конец рывка
function track(e) {
  const t = state.time;
  let a = anim.get(e);
  if (!a) {
    a = { x: e.x, y: e.y, t, speed: 0, seed: Math.random() * 10, face: Math.cos(e.facing || 0) < 0 ? -1 : 1,
      hp: e.hp, cd: e.cd, hurtAt: -9, atkAt: -9, st: e.state, skidAt: -9 };
    anim.set(e, a);
  }
  const dt = t - a.t;
  if (dt > 0) {
    const sp = Math.min(600, Math.hypot(e.x - a.x, e.y - a.y) / dt);
    a.speed += (sp - a.speed) * Math.min(1, dt * 10);
  }
  a.x = e.x; a.y = e.y; a.t = t;
  const cx = Math.cos(e.facing || 0);
  if (cx > 0.25) a.face = 1; else if (cx < -0.25) a.face = -1;
  if (e.hp < a.hp - 0.3 && t - a.hurtAt > 0.25) a.hurtAt = t;
  a.hp = e.hp;
  if (e.cd !== undefined && a.cd !== undefined && e.cd > a.cd + 0.05) a.atkAt = t;
  a.cd = e.cd;
  if (a.st === 'charge' && e.state !== 'charge') a.skidAt = t;
  a.st = e.state;
  return a;
}

// улитка: состояние рисунка — из рывка (замах, рывок, занос после него) и скорости
function snailFoe(e, a) {
  const now = state.time;
  let st = a.speed > 12 ? 'walk' : 'idle', k = 0;
  if (e.state === 'telegraph') { st = 'aim'; k = clamp(1 - e.timer / e.cfg.telegraph, 0, 1); }
  else if (e.state === 'charge') st = 'charge';
  else if (now - a.skidAt < 0.5) { st = 'skid'; k = (now - a.skidAt) / 0.5; }
  // замах: пунктир на всю длину рывка (он короче, чем у Бычка)
  if (st === 'aim') {
    const f = e.facing || 0, L = e.cfg.chargeMaxDist, y0 = e.y + e.r * 0.45;
    ctx.strokeStyle = hexA(C.gold, 0.3 + 0.35 * k); ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.moveTo(e.x, y0); ctx.lineTo(e.x + Math.cos(f) * L, y0 + Math.sin(f) * L); ctx.stroke();
    ctx.setLineDash([]);
  }
  drawSnail({ x: e.x, y: e.y, r: e.r * SIZE.snail, face: a.face, t: now, seed: a.seed, st, k });
}

// дудочник: связь от морды — под телом, кольцо дозыва — поверх зазываемого; пьёт — ручеёк от зазомбированного в морду
function piperFoe(e, a) {
  const now = state.time, cfg = e.cfg, target = e.charm ? e.charm.target : e.victim;
  const o = {
    x: e.x, y: e.y, r: e.r * SIZE.piper, face: target ? (target.x >= e.x ? 1 : -1) : a.face, t: now, seed: a.seed,
    st: e.drinking ? 'drink' : e.charm ? 'play' : a.speed > 10 ? 'walk' : 'idle', noNotes: !e.charm,
  };
  const prog = e.charm ? clamp(e.charm.t / cfg.charmTime, 0, 1) : 1;
  if (target && !e.drinking) { const m = piperFace(o); charmLink(m.x, m.y, target.x, target.y - 4, now, prog); }
  drawPiper(o);
  if (e.drinking) drainStream(target.x + o.face * target.r * 0.5, target.y - 2, o.mouth.x - o.face * o.r * 0.25, o.mouth.y + o.r * 0.1, now);
  if (e.charm) charmRing(target.x, target.y + 2, target.r * 1.25 + 9, prog, now);
}

// черепаха: выстрел — по скачку перезарядки; удар по спрятавшейся — искры с той стороны, где ближний союзник
function turtleFoe(e, a) {
  const now = state.time, since = now - a.atkAt, r = e.r * SIZE.turtle;
  drawTurtle({
    x: e.x, y: e.y, r, t: now, seed: a.seed, aim: e.facing || 0, hide: e.hide || 0,
    shot: since >= 0 && since < 0.14 ? 1 - since / 0.14 : 0, moving: a.speed > 8,
  });
  const ck = (now - a.hurtAt) / 0.3;
  if (!e.hidden || ck < 0 || ck >= 1) return;
  let near = null, nd = Infinity;
  for (const u of state.party) { const d = Math.hypot(u.x - e.x, u.y - e.y); if (d < nd) { nd = d; near = u; } }
  const ang = near ? Math.atan2(near.y - e.y, near.x - e.x) : -Math.PI / 2;
  const hx = e.x + Math.cos(ang) * r * 0.95, hy = e.y - r * 0.3 + Math.sin(ang) * r * 0.5;
  gl(hx, hy, r * 0.8, C.cream, 0.5 * (1 - ck));
  ctx.strokeStyle = hexA(C.cream, 1 - ck); ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const s = ang - 1 + i * 0.4, d0 = 3 + ck * 6, d1 = 7 + ck * 12;
    ctx.beginPath(); ctx.moveTo(hx + Math.cos(s) * d0, hy + Math.sin(s) * d0); ctx.lineTo(hx + Math.cos(s) * d1, hy + Math.sin(s) * d1); ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

const DRAW = { snail: snailFoe, piper: piperFoe, turtle: turtleFoe };
// цвета кусочков, на которые лопается погибший
const POP = { snail: [C.wine, C.rust], piper: [C.choc, C.red], turtle: [C.brown, C.blood] };
// полоска HP над головой: высота над центром тела в долях радиуса рисунка (над флажком, рогами, мозгом)
const BAR = { snail: 1.75, piper: 1.65, turtle: 1.45 };

function has(type) { return !!DRAW[type]; }

function draw(e) {
  const a = track(e), ha = state.time - a.hurtAt;
  flashNow = ha >= 0 && ha < 0.1 ? 1 - ha / 0.1 : 0;
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  DRAW[e.type](e, a);
  flashNow = 0;
  const r = e.r * SIZE[e.type];
  if (e.hp < e.maxHp) hpBar(e.x, e.y - r * BAR[e.type] - 6, r, e.hp / e.maxHp);
  ctx.lineCap = 'butt'; ctx.globalAlpha = 1;
}

// докуда тянется рисунок, кроме тела: линия рывка целящейся улитки, связь дудочника с дружочком
function farPoint(e) {
  if (e.type === 'snail' && e.state === 'telegraph') {
    const f = e.facing || 0, d = e.cfg.chargeMaxDist;
    return { x: e.x + Math.cos(f) * d, y: e.y + Math.sin(f) * d };
  }
  if (e.type === 'piper') { const u = e.charm ? e.charm.target : e.victim; if (u) return { x: u.x, y: u.y }; }
  return null;
}

// погибшие с прошлого кадра лопаются кусочками своих цветов
let lastDrawn = new Set();
function sweep() {
  const now = new Set();
  for (const e of state.enemies) if (POP[e.type]) now.add(e);
  for (const e of lastDrawn) if (!now.has(e) && e.hp <= 0) G.blobs.pop(e, POP[e.type][0], POP[e.type][1]);
  lastDrawn = now;
}

// зазомбированный дружочек: золотое свечение под ним (under) и ноты, кружащие над головой (over)
function charmedUnder(u) {
  const r = u.r * 1.25;
  gl(u.x, u.y + r * 0.3, r * 1.9, C.gold, 0.16 + 0.08 * Math.sin(state.time * 4));
}
function charmedOver(u) {
  const r = u.r * 1.25, t = state.time;
  for (let i = 0; i < 2; i++) {
    const ang = t * 2.2 + i * Math.PI;
    note(u.x + Math.cos(ang) * r * 0.95 - 2, u.y - r * 1.35 + Math.sin(ang) * r * 0.25, r * 0.17, C.gold, 0.6 + 0.4 * Math.sin(ang), i === 1);
  }
}

G.ambushArt = { has, draw, farPoint, sweep, charmedUnder, charmedOver };
})(window.Game = window.Game || {});
