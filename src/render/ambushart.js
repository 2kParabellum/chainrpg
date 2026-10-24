// Враги «Ambush» — тёмная раса (graphics.md), рисуются целиком живьём (их немного): улитка-рыцарь на сноуборде
// (замах — копьё вниз, глаза и забрало жёлтые, линия рывка; рывок — пламя из-под доски; после рывка — занос), дудочник-
// сирена (играет — нотный стан к дружочку и золотое кольцо вокруг него; пьёт — красный ручеёк в дудку), черепаха-циклоп
// (турель за целью, отдача и вспышка; прячется — голова, лапы и ствол уходят в панцирь, блик, облако из щелей, удары по
// панцирю высекают искры). Ещё — свечение и ноты над зазомбированным дружочком (его тело — render/blobs.js).
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
// Тёмная слизистая улитка в рыцарском шлеме на сноуборде. Глаза на стебельках торчат из шлема, на раковине шипы и
// флажок, из-под шлема вперёд — турнирное копьё. st: idle | walk | aim | charge | skid; k — доля состояния (0..1)
function flameDecal(x, y, L, h) {
  ctx.beginPath(); ctx.moveTo(x + L * 0.35, y);
  ctx.quadraticCurveTo(x, y - h * 1.6, x - L * 0.65, y - h * 0.5);
  ctx.quadraticCurveTo(x - L * 0.2, y - h * 0.1, x - L * 0.45, y + h * 0.9);
  ctx.quadraticCurveTo(x, y + h * 1.5, x + L * 0.35, y);
  ctx.closePath(); ctx.fill();
}
function snailBoard(r) {
  const y0 = r * 0.7, y1 = r * 0.92;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(-r * 1.3, y0);
    ctx.lineTo(r * 1.15, y0);
    ctx.quadraticCurveTo(r * 1.55, y0, r * 1.72, y0 - r * 0.3);
    ctx.quadraticCurveTo(r * 1.8, y1, r * 1.2, y1);
    ctx.lineTo(-r * 1.2, y1);
    ctx.quadraticCurveTo(-r * 1.58, y1, -r * 1.58, y0 - r * 0.14);
    ctx.quadraticCurveTo(-r * 1.5, y0, -r * 1.3, y0);
    ctx.closePath();
  };
  path(); ctx.fillStyle = C.wine; ctx.fill();
  ctx.save(); path(); ctx.clip();
  ctx.fillStyle = C.blood; ctx.fillRect(-r * 2, y0 - r * 0.5, r * 4, r * 0.58);
  for (let i = 0; i < 4; i++) {
    const fx = -r * 0.7 + i * r * 0.62, fy = y0 + r * 0.14;
    ctx.fillStyle = C.gold; flameDecal(fx, fy, r * 0.46, r * 0.075);
    ctx.fillStyle = C.orange; flameDecal(fx - r * 0.05, fy + r * 0.01, r * 0.26, r * 0.04);
  }
  ctx.fillStyle = 'rgba(239,216,161,0.4)'; ctx.fillRect(-r * 1.2, y0 + r * 0.02, r * 2.35, r * 0.035);
  ctx.restore();
  path(); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke();
}
function spiralPath(cx, cy, R, turns, a0) {
  ctx.beginPath();
  for (let i = 0; i <= 64; i++) { const q = i / 64, a = a0 + q * turns * TAU, rr = R * q; const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.95; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
}
function snailShell(r) {
  const cx = -r * 0.42, cy = -r * 0.12, R = r * 0.7;
  ctx.fillStyle = C.cream; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5;
  for (const a of [-2.8, -2.3, -1.8, -1.32]) {
    const px = Math.cos(a + Math.PI / 2) * r * 0.11, py = Math.sin(a + Math.PI / 2) * r * 0.11;
    const bx = cx + Math.cos(a) * R * 0.9, by = cy + Math.sin(a) * R * 0.9;
    ctx.beginPath(); ctx.moveTo(bx + px, by + py);
    ctx.lineTo(cx + Math.cos(a) * (R + r * 0.3), cy + Math.sin(a) * (R + r * 0.3));
    ctx.lineTo(bx - px, by - py); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ell(cx, cy, R, R * 0.95); ctx.fillStyle = C.choc; ctx.fill();
  ctx.save(); ell(cx, cy, R, R * 0.95); ctx.clip();
  ctx.fillStyle = C.rust; ell(cx - R * 0.08, cy - R * 0.1, R * 0.9, R * 0.84); ctx.fill();
  ctx.lineCap = 'round';
  ctx.strokeStyle = C.choc; ctx.lineWidth = r * 0.1; spiralPath(cx + R * 0.05, cy + R * 0.05, R * 0.86, 2.2, 0.6); ctx.stroke();
  ctx.strokeStyle = C.amber; ctx.lineWidth = r * 0.04; spiralPath(cx + R * 0.05 - r * 0.05, cy + R * 0.05 - r * 0.06, R * 0.8, 2.2, 0.6); ctx.stroke();
  ctx.fillStyle = 'rgba(239,216,161,0.25)'; ell(cx - R * 0.42, cy - R * 0.5, R * 0.26, R * 0.13, -0.6); ctx.fill();
  ctx.save(); ctx.translate(cx, cy); flashFill(R, R); ctx.restore();
  ctx.restore();
  ell(cx, cy, R, R * 0.95); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke();
}
function snailPennant(r, t, st) {
  const px = -r * 0.6, py = -r * 0.6, tx = -r * 0.86, ty = -r * 1.78;
  ctx.lineCap = 'round';
  for (const [lw, col] of [[r * 0.15, C.ink], [r * 0.07, C.stone]]) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(tx, ty); ctx.stroke(); }
  const fast = st === 'charge' ? 3.2 : st === 'aim' ? 1.8 : 1, f = Math.sin(t * 5 * fast), f2 = Math.sin(t * 5 * fast + 1.4);
  const L = r * (st === 'charge' ? 1.0 : 0.82), droop = st === 'charge' ? 0.02 : 0.24;
  const bx = tx + (px - tx) * 0.3, by = ty + (py - ty) * 0.3;
  const flag = () => {
    ctx.beginPath(); ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(tx - L * 0.5, ty - r * 0.06 + f * r * 0.1, tx - L, ty + r * droop + f2 * r * 0.1);
    ctx.quadraticCurveTo(tx - L * 0.5, by + f * r * 0.1, bx, by);
    ctx.closePath();
  };
  flag(); ctx.fillStyle = C.red; ctx.fill();
  ctx.save(); flag(); ctx.clip();
  ctx.fillStyle = C.blood; ctx.fillRect(tx - L * 1.2, (ty + by) / 2 + r * 0.06, L * 1.3, r * 0.6);
  ctx.strokeStyle = C.gold; ctx.lineWidth = r * 0.06; ctx.beginPath(); ctx.moveTo(tx, (ty + by) / 2); ctx.quadraticCurveTo(tx - L * 0.5, (ty + by) / 2 + f * r * 0.08, tx - L * 0.9, ty + r * droop * 0.7 + f2 * r * 0.08); ctx.stroke();
  ctx.restore();
  flag(); ctx.strokeStyle = C.ink; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.fillStyle = C.gold; ell(tx, ty, r * 0.08, r * 0.08); ctx.fill(); ctx.stroke();
}
function snailLance(r, t, st, k) {
  let a = -0.5 + Math.sin(t * 2) * 0.04;
  if (st === 'walk') a = -0.44 + Math.sin(t * 5) * 0.05;
  if (st === 'aim') a = lerp(-0.45, 0.02, ease(k * 3)) + Math.sin(t * 40) * 0.02;
  if (st === 'charge') a = 0.03;
  if (st === 'skid') a = lerp(0.03, -0.45, ease(k)) + Math.sin(k * 22) * 0.06 * (1 - k);
  ctx.save(); ctx.translate(r * 0.95, r * 0.2); ctx.rotate(a);
  ctx.lineCap = 'round';
  for (const [lw, col] of [[r * 0.2, C.ink], [r * 0.11, C.brown]]) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(-r * 0.4, 0); ctx.lineTo(r * 0.3, 0); ctx.stroke(); }
  const L0 = r * 0.3, L1 = r * 1.95, w0 = r * 0.15;
  const cone = () => { ctx.beginPath(); ctx.moveTo(L0, -w0); ctx.lineTo(L1, -r * 0.025); ctx.lineTo(L1, r * 0.025); ctx.lineTo(L0, w0); ctx.closePath(); };
  cone(); ctx.fillStyle = C.cream; ctx.fill();
  ctx.save(); cone(); ctx.clip();
  ctx.fillStyle = C.red;
  for (let i = 0; i < 5; i++) { const x0 = L0 + r * 0.1 + i * r * 0.34; ctx.beginPath(); ctx.moveTo(x0, -w0); ctx.lineTo(x0 + r * 0.14, -w0); ctx.lineTo(x0 + r * 0.02, w0); ctx.lineTo(x0 - r * 0.12, w0); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle = 'rgba(42,29,13,0.28)'; ctx.fillRect(L0, r * 0.03, L1, w0);
  ctx.restore();
  ctx.strokeStyle = C.ink; ctx.lineWidth = 1.8; cone(); ctx.stroke();
  ctx.fillStyle = C.stone; ctx.beginPath(); ctx.moveTo(L1 - r * 0.24, -r * 0.065); ctx.lineTo(L1 + r * 0.2, 0); ctx.lineTo(L1 - r * 0.24, r * 0.065); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.stone; ell(L0, 0, r * 0.08, r * 0.27); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.gold; ell(L0 - r * 0.015, -r * 0.06, r * 0.03, r * 0.11); ctx.fill();
  if (st === 'aim' || st === 'charge') { const q = Math.sin(t * 14) * 0.5 + 0.5; gl(L1 + r * 0.1, 0, r * 0.5, C.cream, 0.35 + 0.3 * q); }
  ctx.restore();
}
function snailStalks(r, t, st, eye) {
  const back = st === 'charge' ? 1 : st === 'aim' ? 0.35 : 0, wild = st === 'skid' ? 1 : 0;
  [[r * 0.5, -r * 0.84, r * 0.36, -r * 1.52, 0], [r * 0.84, -r * 0.86, r * 1.02, -r * 1.58, 1.7]].forEach(([bx, by, tx, ty, ph]) => {
    const sw = Math.sin(t * 2.4 + ph) * r * 0.08 + wild * Math.sin(t * 17 + ph) * r * 0.18;
    const ex = tx + sw - back * r * 0.5, ey = ty + back * r * 0.32;
    const mx = (bx + ex) / 2 + r * 0.06, my = (by + ey) / 2;
    ctx.lineCap = 'round';
    for (const [lw, col] of [[r * 0.21, C.ink], [r * 0.12, C.wine]]) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke(); }
    glowEye(ex, ey, r * 0.14, eye);
    ctx.fillStyle = C.dark; ell(ex + r * 0.04, ey + r * 0.005, r * 0.035, r * 0.1); ctx.fill();
  });
}
function snailHelmet(r, t, st, eye) {
  const L = r * 0.24, R = r * 1.12, T = -r * 0.98, B = r * 0.08;
  const path = () => {
    ctx.beginPath(); ctx.moveTo(L, B);
    ctx.lineTo(L - r * 0.02, -r * 0.5);
    ctx.quadraticCurveTo(L, T, (L + R) / 2, T);
    ctx.quadraticCurveTo(R, T, R + r * 0.02, -r * 0.5);
    ctx.lineTo(R + r * 0.04, B - r * 0.02);
    ctx.quadraticCurveTo((L + R) / 2, B + r * 0.12, L, B);
    ctx.closePath();
  };
  path(); ctx.fillStyle = C.mud; ctx.fill();
  ctx.save(); path(); ctx.clip();
  ctx.fillStyle = C.stone; ell((L + R) / 2 - r * 0.12, -r * 0.52, r * 0.44, r * 0.56); ctx.fill();
  ctx.fillStyle = 'rgba(239,216,161,0.45)'; ctx.fillRect(L + r * 0.08, -r * 0.8, r * 0.07, r * 0.66);
  ctx.fillStyle = C.gold; ctx.fillRect(L - r, B - r * 0.15, r * 3, r * 0.3);
  ctx.restore();
  path(); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke();
  ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(L - r * 0.01, B - r * 0.15); ctx.lineTo(R + r * 0.04, B - r * 0.16); ctx.stroke();
  // широкая прорезь забрала, изнутри светится; золотое ребро по лицу, дырочки для дыхания
  const vy = -r * 0.42, hot = st === 'aim' || st === 'charge';
  gl(r * 0.8, vy, r * 0.6, eye, hot ? 0.6 : 0.32);
  ctx.fillStyle = C.dark;
  ctx.beginPath(); ctx.roundRect(r * 0.4, vy - r * 0.09, R - r * 0.3, r * 0.18, r * 0.07); ctx.fill(); ctx.stroke();
  ctx.fillStyle = hexA(eye, hot ? 1 : 0.7);
  ctx.beginPath(); ctx.roundRect(r * 0.47, vy - r * 0.025, R - r * 0.42, r * 0.05, r * 0.025); ctx.fill();
  ctx.strokeStyle = C.ink; ctx.lineWidth = r * 0.13; ctx.beginPath(); ctx.moveTo(r * 0.8, vy + r * 0.14); ctx.lineTo(r * 0.8, B - r * 0.16); ctx.stroke();
  ctx.strokeStyle = C.gold; ctx.lineWidth = r * 0.06; ctx.stroke();
  ctx.fillStyle = C.dark; for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { ell(r * (0.93 + j * 0.1), -r * 0.2 + i * r * 0.1, r * 0.028, r * 0.028); ctx.fill(); }
  // золотой гребень по макушке
  ctx.strokeStyle = C.ink; ctx.lineWidth = r * 0.17; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(L + r * 0.12, T + r * 0.22); ctx.quadraticCurveTo((L + R) / 2, T - r * 0.08, R - r * 0.06, T + r * 0.26); ctx.stroke();
  ctx.strokeStyle = C.gold; ctx.lineWidth = r * 0.08; ctx.stroke();
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
  ctx.fillStyle = 'rgba(20,10,5,0.5)'; ell(o.x, o.y + r * 0.96, r * 1.65, r * 0.3); ctx.fill();
  ctx.save(); ctx.translate(o.x + face * dx, o.y - bob); ctx.scale(face, 1); ctx.rotate(lean);
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (charge) {
    ctx.strokeStyle = C.cream; ctx.lineWidth = r * 0.08;
    for (let i = 0; i < 4; i++) {
      const q = (t * 4 + i * 0.27) % 1, yy = -r * 1.0 + i * r * 0.48;
      ctx.globalAlpha = 0.55 * (1 - q); ctx.beginPath(); ctx.moveTo(-r * (1.45 + q * 0.6), yy); ctx.lineTo(-r * (2.2 + q * 1.2), yy); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    tailFire(-r * 1.5, r * 0.8, r, t);
  }
  if (aim) {
    for (let i = 0; i < 3; i++) {
      const q = (t * 2.2 + i / 3) % 1;
      ctx.globalAlpha = 0.55 * (1 - q); ctx.fillStyle = i % 2 ? C.stone : C.mud;
      ell(-r * (1.65 + q * 0.7), r * (0.75 - q * 0.55), r * (0.14 + q * 0.2), r * (0.12 + q * 0.16)); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 5; i++) { const q = (t * 5 + i / 5) % 1; ctx.fillStyle = hexA(i % 2 ? C.gold : C.orange, 1 - q); ctx.fillRect(-r * (1.45 + q * 0.8), r * (0.88 - q * 0.45) + Math.sin(i * 3) * r * 0.08, 2.5, 2.5); }
  }
  snailBoard(r);
  snailPennant(r, t, st);
  // тело: слизистая «нога» вдоль доски и шея под шлемом
  ctx.save(); ctx.translate(r * 0.05, r * 0.45); ctx.scale(sx, sy);
  foeBody(r * 1.1, r * 0.3, t, 'wobble', 1, C.wine, C.dark, C.red);
  ctx.fillStyle = 'rgba(239,216,161,0.4)'; for (const [px, pr] of [[-0.6, 0.06], [-0.2, 0.04], [0.35, 0.05]]) { ell(px * r, -r * 0.1, r * pr * 1.6, r * pr); ctx.fill(); }
  ctx.restore();
  ctx.save(); ctx.translate(r * 0.66, r * 0.02); ctx.scale(sx, sy);
  foeBody(r * 0.42, r * 0.48, t, 'wobble', 2, C.wine, C.dark, C.red);
  ctx.restore();
  snailShell(r);
  snailLance(r, t, st, k);
  snailStalks(r, t, st, eye);
  snailHelmet(r, t, st, eye);
  if (skid) for (let i = 0; i < 4; i++) {
    const q = (k * 2 + i / 4) % 1;
    ctx.globalAlpha = 0.6 * (1 - q) * (1 - k); ctx.fillStyle = i % 2 ? C.stone : C.mud;
    ell(r * (1.5 + q * 0.6), r * (0.85 - q * 0.6) - i * r * 0.05, r * (0.15 + q * 0.25), r * (0.12 + q * 0.18)); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  ctx.lineCap = 'butt';
  if (o.hp !== undefined && o.hp < 1) hpBar(o.x, o.y - r * 2.05, r, o.hp);
}

// ===== дудочник-сирена =====
// Патлатый демон-сатир: волосы до пола (пряди висят вниз и качаются), козлиные рожки, глаза светятся из-под чёлки,
// лапками держит дудку. st: idle | walk | play | drink. aim — мировой угол на цель (дудка смотрит на неё)
// копна: макушка круглая, книзу шире; по низу и бокам пряди висят до пола и качаются, на макушке — мягкие вихры
function hairPath(rx, ry, t, sway, seed) {
  const N = 40, pts = [];
  for (let i = 0; i < N; i++) {
    const ang = i / N * TAU + 0.04, c = Math.cos(ang), s = Math.sin(ang);
    const k = 1 + 0.03 * Math.sin(3 * ang + t * 3 + seed);
    const wide = 1 + 0.18 * Math.max(0, s);
    let x = c * rx * k * wide, y = s * ry * k + ry * 0.05;
    if (i % 2 === 0) {
      if (s > -0.45) {
        const hang = (0.06 + 0.26 * Math.max(0, s + 0.2)) * ry;
        x += (Math.sin(t * 3 + i * 0.9 + seed) * 0.05 + sway * 0.08 * (s + 0.45)) * rx;
        y += hang;
      } else { x += c * rx * 0.06; y += s * ry * 0.06; }
    } else { x *= 0.96; y = y * 0.96 + (s > 0 ? ry * 0.04 : 0); }
    pts.push([x, y]);
  }
  ctx.beginPath();
  for (let i = 0; i <= N; i += 2) {
    const [vx, vy] = pts[(i + N - 1) % N], [tx, ty] = pts[i % N], [nx, ny] = pts[(i + 1) % N];
    if (i === 0) ctx.moveTo(vx, vy);
    ctx.quadraticCurveTo(vx + (tx - vx) * 0.25, vy + (ty - vy) * 0.65, tx, ty);
    ctx.quadraticCurveTo(nx + (tx - nx) * 0.25, ny + (ty - ny) * 0.65, nx, ny);
  }
  ctx.closePath();
}
function piperHorn(bx, by, r, far) {
  ctx.fillStyle = far ? C.stone : C.cream; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.8;
  const tx = bx - r * 0.7, ty = by - r * 0.9;
  ctx.beginPath(); ctx.moveTo(bx - r * 0.17, by);
  ctx.quadraticCurveTo(bx - r * 0.3, by - r * 0.5, tx, ty);
  ctx.quadraticCurveTo(bx + r * 0.12, by - r * 0.8, bx + r * 0.17, by);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.lineWidth = 1.1;
  for (let i = 1; i <= 3; i++) {
    const q = i / 4.4, x = lerp(bx - r * 0.05, tx + r * 0.05, q * q * 0.9 + q * 0.1), y = lerp(by, ty + r * 0.05, Math.sqrt(q));
    ctx.beginPath(); ctx.moveTo(x - r * 0.13, y - r * 0.06); ctx.lineTo(x + r * 0.11, y + r * 0.05); ctx.stroke();
  }
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
// дудка: смотрит на цель (если есть); в местных координатах (взгляд вправо) — начало у рта, конец и подскок тела
function piperFlute(o) {
  const r = o.r, face = o.face, t = o.t + (o.seed || 0);
  const bob = o.st === 'walk' || o.moving ? Math.abs(Math.sin(t * 6)) * r * 0.08 : 0;
  let a = 0.3;
  if (o.aim !== undefined) a = clamp(Math.atan2(Math.sin(o.aim), Math.cos(o.aim) * face), -0.25, 0.75);
  if (o.st === 'play') a += Math.sin(t * 4.5) * 0.06;
  const mx = r * 0.4, my = r * 0.1, L = r * 1.15;
  return { a, mx, my, ex: mx + Math.cos(a) * L, ey: my + Math.sin(a) * L, bob };
}
// конец дудки в мире — к нему тянется связь
function piperMouth(o) {
  const f = piperFlute(o), r = o.r;
  return { x: o.x + o.face * (f.ex + Math.cos(f.a) * r * 0.14), y: o.y - f.bob + f.ey + Math.sin(f.a) * r * 0.14 };
}
function drawPiper(o) {
  const r = o.r, face = o.face, t = o.t + (o.seed || 0), st = o.st;
  const play = st === 'play', drink = st === 'drink', moving = st === 'walk' || o.moving;
  const w = Math.sin(t * 4);
  let sx = 1 + 0.04 * w, sy = 1 - 0.04 * w, sway = Math.sin(t * 1.7) * 0.4;
  const fl = piperFlute(o), bob = fl.bob;
  if (moving) sway = Math.sin(t * 6);
  if (play) { const beat = Math.sin(t * 9); sway = Math.sin(t * 4.5) * 0.9; sy *= 1 + 0.03 * beat; sx *= 1 - 0.02 * beat; }
  let gulp = 0;
  if (drink) { gulp = Math.max(0, Math.sin(t * 5)); sx *= 1 + 0.07 * gulp; sy *= 1 + 0.03 * gulp; }
  ctx.fillStyle = 'rgba(20,10,5,0.5)'; ell(o.x, o.y + r * 1.0, r * 1.1, r * 0.3); ctx.fill();
  ctx.save(); ctx.translate(o.x, o.y - bob); ctx.scale(face, 1);
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // копытца из-под волос
  for (const s of [-1, 1]) {
    const lift = moving ? Math.max(0, Math.sin(t * 6 + (s > 0 ? Math.PI : 0))) * r * 0.14 : 0;
    const hx = s * r * 0.36 + r * 0.06, hy = r * 1.22 - lift;
    ctx.fillStyle = C.dark; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.roundRect(hx - r * 0.14, hy - r * 0.12, r * 0.28, r * 0.2, r * 0.06); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(hx + r * 0.02, hy - r * 0.02); ctx.lineTo(hx + r * 0.02, hy + r * 0.08); ctx.stroke();
  }
  piperHorn(-r * 0.02, -r * 0.7, r, true);
  piperHorn(r * 0.4, -r * 0.74, r, false);
  // волосы-тело
  ctx.save(); ctx.scale(sx, sy);
  const rx = r * 0.92, ry = r;
  hairPath(rx, ry, t, sway, o.seed || 0); ctx.fillStyle = C.tealDD; ctx.fill();
  ctx.save(); hairPath(rx, ry, t, sway, o.seed || 0); ctx.clip();
  ctx.fillStyle = C.tealD; ell(-rx * 0.12, -ry * 0.25, rx * 0.86, ry * 0.85); ctx.fill();
  ctx.lineWidth = r * 0.065;
  for (let i = 0; i < 11; i++) {
    const x0 = -rx * 1.0 + i * rx * 0.2, sw = Math.sin(t * 3 + i) * r * 0.05 + sway * r * 0.08;
    ctx.strokeStyle = i % 2 ? hexA(C.teal, 0.5) : hexA(C.tealDD, 0.9);
    ctx.beginPath(); ctx.moveTo(x0 * 0.45, -ry * 0.95); ctx.quadraticCurveTo(x0 * 1.1, -ry * 0.1, x0 * 1.12 + sw, ry * 1.4); ctx.stroke();
  }
  ctx.strokeStyle = hexA(C.teal, 0.55); ctx.lineWidth = r * 0.09;
  ctx.beginPath(); ctx.arc(-rx * 0.1, -ry * 0.05, ry * 0.78, Math.PI * 1.12, Math.PI * 1.5); ctx.stroke();
  if (drink) gl(-r * 0.05, r * 0.3, r * 0.85, C.red, 0.25 + 0.3 * gulp);
  ctx.strokeStyle = hexA(C.teal, 0.22); ctx.lineWidth = r * 0.22; ell(0, -r * 0.1, rx * 1.2, ry * 1.25); ctx.stroke();
  flashFill(rx * 1.3, ry * 1.4);
  ctx.restore();
  hairPath(rx, ry, t, sway, o.seed || 0); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
  // лицо в тени под чёлкой
  const fx = r * 0.3, fy = -r * 0.1;
  ctx.fillStyle = C.dark; ell(fx, fy, r * 0.5, r * 0.33); ctx.fill();
  const ey = fy - r * 0.01, eyes = [fx - r * 0.18, fx + r * 0.2];
  const lookY = o.aim !== undefined ? Math.sin(o.aim) : 0.2, lookX = o.aim !== undefined ? Math.cos(o.aim) * face : 1;
  if (play) {
    for (const ex of eyes) {
      gl(ex, ey, r * 0.32, C.gold, 0.5);
      ctx.strokeStyle = C.gold; ctx.lineWidth = r * 0.075; ctx.beginPath(); ctx.arc(ex, ey + r * 0.06, r * 0.1, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    }
  } else {
    const sq = drink ? 0.5 : 1;
    for (const ex of eyes) {
      glowEye(ex, ey, r * 0.1, C.gold, 0, sq);
      ctx.fillStyle = C.dark; ell(ex + lookX * r * 0.035, ey + lookY * r * 0.02, r * 0.03, r * 0.075 * sq); ctx.fill();
    }
  }
  // чёлка свисает на глаза
  for (let i = 0; i < 5; i++) {
    const bx = fx - r * 0.44 + i * r * 0.22, sw = Math.sin(t * 3 + i * 1.3) * r * 0.03 + sway * r * 0.03;
    const len = r * (0.24 + 0.12 * h2(i, 3)), top = fy - r * 0.42;
    ctx.beginPath(); ctx.moveTo(bx - r * 0.14, top);
    ctx.quadraticCurveTo(bx - r * 0.06, top + len * 0.6, bx + sw, top + len);
    ctx.quadraticCurveTo(bx + r * 0.06, top + len * 0.5, bx + r * 0.14, top);
    ctx.fillStyle = C.tealD; ctx.fill();
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(bx - r * 0.14, top + r * 0.04); ctx.quadraticCurveTo(bx - r * 0.06, top + len * 0.6, bx + sw, top + len);
    ctx.quadraticCurveTo(bx + r * 0.06, top + len * 0.5, bx + r * 0.14, top + r * 0.04); ctx.stroke();
  }
  // дудка: смотрит на цель (если есть), лапки держат и перебирают пальцами
  const { a, mx, my, ex, ey: ey2 } = fl;
  ctx.lineCap = 'round';
  for (const [lw, col] of [[r * 0.2, C.ink], [r * 0.11, C.cream]]) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(ex, ey2); ctx.stroke(); }
  ctx.fillStyle = C.dark; for (let i = 0; i < 4; i++) { const q = 0.3 + i * 0.14; ell(mx + (ex - mx) * q, my + (ey2 - my) * q, r * 0.03, r * 0.03); ctx.fill(); }
  ctx.strokeStyle = C.gold; ctx.lineWidth = r * 0.05; ctx.lineCap = 'butt';
  for (const q of [0.14, 0.9]) {
    const px = mx + (ex - mx) * q, py = my + (ey2 - my) * q, nx = -Math.sin(a) * r * 0.07, ny = Math.cos(a) * r * 0.07;
    ctx.beginPath(); ctx.moveTo(px - nx, py - ny); ctx.lineTo(px + nx, py + ny); ctx.stroke();
  }
  ctx.save(); ctx.translate(ex, ey2); ctx.rotate(a);
  ctx.fillStyle = C.gold; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-r * 0.04, -r * 0.065); ctx.lineTo(r * 0.14, -r * 0.14); ctx.lineTo(r * 0.14, r * 0.14); ctx.lineTo(-r * 0.04, r * 0.065); ctx.closePath(); ctx.fill(); ctx.stroke();
  if (drink) { gl(r * 0.14, 0, r * 0.3, C.red, 0.6); }
  ctx.restore();
  for (const [q, ph] of [[0.4, 0], [0.68, Math.PI]]) {
    const lift = play ? Math.max(0, Math.sin(t * 9 + ph)) * r * 0.07 : 0;
    const px = mx + (ex - mx) * q, py = my + (ey2 - my) * q + r * 0.07 - lift;
    ctx.fillStyle = C.cream; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2;
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(px + d * r * 0.06 - r * 0.03, py - r * 0.05); ctx.lineTo(px + d * r * 0.06, py - r * 0.15); ctx.lineTo(px + d * r * 0.06 + r * 0.03, py - r * 0.05); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = C.tealDD; ctx.lineWidth = 1.6; ell(px, py, r * 0.12, r * 0.1); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
  ctx.lineCap = 'butt';
  o.mouth = piperMouth(o);
  if (play && !o.noNotes) for (let i = 0; i < 3; i++) {
    const q = (t * 0.8 + i / 3) % 1;
    note(o.mouth.x + face * (q * r * 0.6) + Math.sin(q * 6 + i) * r * 0.2, o.mouth.y - q * r * 1.6, r * 0.13, C.gold, Math.sin(q * Math.PI), i === 1);
  }
  if (o.hp !== undefined && o.hp < 1) hpBar(o.x, o.y - r * 1.75, r, o.hp);
}
// нотный стан от дудки к дружочку: три волнистые линии, по ним бегут ноты; prog 0..1 — насколько дозвался
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
// ручеёк жизни: от дружочка в дудку, по нему бегут капли
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
// Красный одноглазый демон под бронированным панцирем на четырёх лапках, на панцире — турель.
// hide 0..1 — насколько спрятался; aim — мировой угол ствола; shot 0..1 — отдача и вспышка выстрела
function turtleLegs(r, t, moving, h) {
  [[-0.66, 1, 0], [0.62, 1, 2], [-1.0, 0, 1], [0.98, 0, 3]].forEach(([lx, far, ph]) => {
    const lift = moving ? Math.max(0, Math.sin(t * 8 + ph * Math.PI / 2)) * r * 0.14 : 0;
    const s = 1 - 0.8 * h, x = lx * r * (1 - 0.25 * h), y = r * (far ? 0.5 : 0.62) - lift - h * r * 0.24;
    if (s < 0.1) return;
    ctx.fillStyle = far ? C.wine : C.blood; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(x - r * 0.2 * s, y - r * 0.14, r * 0.4 * s, r * 0.38 * s + r * 0.1, r * 0.12 * s); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.cream; ctx.lineWidth = 1;
    for (const d of [-1, 0, 1]) { const cx = x + d * r * 0.12 * s, cy = y + r * 0.34 * s + r * 0.02; ctx.beginPath(); ctx.moveTo(cx - r * 0.045 * s, cy - r * 0.02); ctx.lineTo(cx, cy + r * 0.08 * s); ctx.lineTo(cx + r * 0.045 * s, cy - r * 0.02); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  });
}
function turtleShell(r, t, h, sheen) {
  const rimY = r * 0.36;
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
  ell(0, rimY + r * 0.07, r * 1.12, r * 0.33); ctx.fillStyle = C.choc; ctx.fill(); ctx.stroke();
  ell(0, rimY, r * 1.12, r * 0.31); ctx.fillStyle = C.mud; ctx.fill(); ctx.stroke();
  const dome = () => { ctx.beginPath(); ctx.ellipse(0, rimY, r * 0.98, r * 1.08, 0, Math.PI, 0); ctx.ellipse(0, rimY, r * 0.98, r * 0.24, 0, 0, Math.PI); ctx.closePath(); };
  dome(); ctx.fillStyle = C.deep; ctx.fill();
  ctx.save(); dome(); ctx.clip();
  ctx.fillStyle = C.brown; ell(-r * 0.18, -r * 0.32, r * 0.86, r * 0.78); ctx.fill();
  // пластины: шестиугольник на макушке, от него швы к ободу
  ctx.strokeStyle = C.choc; ctx.lineWidth = r * 0.07; ctx.lineJoin = 'round';
  const hx = 0, hy = -r * 0.24, hr = r * 0.38, hv = [];
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + Math.PI / 6; hv.push([hx + Math.cos(a) * hr, hy + Math.sin(a) * hr * 0.72]); }
  ctx.beginPath(); hv.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.stroke();
  ctx.beginPath();
  for (const [x, y] of hv) { const dx = x - hx, dy = y - hy, d = Math.hypot(dx, dy); ctx.moveTo(x, y); ctx.lineTo(x + dx / d * r * 1.2, y + dy / d * r * 1.0); }
  ctx.stroke();
  ctx.fillStyle = hexA(C.amber, 0.55);
  ell(-r * 0.62, -r * 0.08, r * 0.16, r * 0.1, -0.5); ctx.fill(); ell(hx - r * 0.1, hy - r * 0.08, r * 0.16, r * 0.08); ctx.fill();
  flashFill(r * 1.2, r * 1.2);
  if (sheen > 0 && sheen < 1) { const x = lerp(-r * 1.4, r * 1.4, sheen); ctx.fillStyle = 'rgba(239,216,161,0.45)'; ctx.beginPath(); ctx.moveTo(x - r * 0.1, -r * 1); ctx.lineTo(x + r * 0.15, -r * 1); ctx.lineTo(x - r * 0.15, r * 0.6); ctx.lineTo(x - r * 0.4, r * 0.6); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  dome(); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke();
  // шипы на боковых пластинах
  ctx.fillStyle = C.cream; ctx.lineWidth = 1.5;
  for (const [x, y, s] of [[-r * 0.62, -r * 0.12, 1], [r * 0.62, -r * 0.12, 1], [-r * 0.28, r * 0.2, 0.75], [r * 0.3, r * 0.22, 0.75]]) {
    ctx.beginPath(); ctx.moveTo(x - r * 0.1 * s, y + r * 0.03); ctx.lineTo(x, y - r * 0.24 * s); ctx.lineTo(x + r * 0.1 * s, y + r * 0.03); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // заклёпки по ободу
  ctx.fillStyle = C.stone;
  for (let i = 0; i < 7; i++) { const a = Math.PI * (0.1 + i / 6 * 0.8); ell(Math.cos(a) * r * 1.07, rimY + Math.sin(a) * r * 0.26, r * 0.055, r * 0.045); ctx.fill(); }
}
function turtleHead(r, t, hd, aimL, angry) {
  ctx.save(); ctx.translate(hd.x, hd.y); ctx.scale(hd.s, hd.s);
  const hr = r * 0.54;
  foeBody(hr, hr * 0.88, t, 'wobble', 3, C.blood, C.wine, C.gold);
  const ex = r * 0.08, ey = -r * 0.1, er = r * 0.25;
  glowEye(ex, ey, er, angry ? C.cream : C.gold, 0, angry ? 0.75 : 1);
  ctx.fillStyle = C.ink; ell(ex + Math.cos(aimL) * er * 0.32, ey + Math.sin(aimL) * er * 0.22, er * 0.28, er * 0.72 * (angry ? 0.75 : 1)); ctx.fill();
  ctx.strokeStyle = C.ink; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(ex - er * 1.25, ey - er * 1.3); ctx.lineTo(ex + er * 1.3, ey - er * 0.85); ctx.stroke();
  ctx.lineWidth = 2; ctx.fillStyle = C.dark;
  ctx.beginPath(); ctx.ellipse(r * 0.14, r * 0.24, r * 0.24, r * 0.1, 0, 0, Math.PI); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.cream;
  for (const d of [-1, 1]) { const x = r * 0.14 + d * r * 0.12; ctx.beginPath(); ctx.moveTo(x - r * 0.045, r * 0.24); ctx.lineTo(x, r * 0.33); ctx.lineTo(x + r * 0.045, r * 0.24); ctx.closePath(); ctx.fill(); }
  ctx.restore();
}
function turtleTurret(r, t, a, h, shot) {
  const bx = -r * 0.08, by = -r * 0.66 + h * r * 0.22;
  const L = r * (1.0 - 0.72 * h) - shot * r * 0.22;
  const ux = Math.cos(a), uy = Math.sin(a) * 0.6, d = Math.hypot(ux, uy), aa = Math.atan2(uy, ux);
  const sx0 = bx, sy0 = by - r * 0.06, ex = sx0 + ux / d * L, ey = sy0 + uy / d * L;
  const barrel = () => {
    if (L < r * 0.12) return;
    ctx.lineCap = 'round';
    for (const [lw, col] of [[r * 0.36, C.ink], [r * 0.25, C.mud]]) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.lineTo(ex, ey); ctx.stroke(); }
    const nx = Math.sin(aa) * r * 0.06, ny = -Math.cos(aa) * r * 0.06;
    ctx.strokeStyle = hexA(C.stone, 0.9); ctx.lineWidth = r * 0.06; ctx.beginPath(); ctx.moveTo(sx0 + nx, sy0 + ny); ctx.lineTo(ex + nx - ux / d * r * 0.1, ey + ny - uy / d * r * 0.1); ctx.stroke();
    const q = 0.55, rx0 = sx0 + (ex - sx0) * q, ry0 = sy0 + (ey - sy0) * q;
    ctx.fillStyle = C.stone; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5;
    ell(rx0, ry0, r * 0.07, r * 0.17, aa); ctx.fill(); ctx.stroke();
    ell(ex, ey, r * 0.09, r * 0.17, aa); ctx.fill(); ctx.stroke();
    ctx.fillStyle = shot > 0.3 ? C.orange : C.dark; ell(ex, ey, r * 0.05, r * 0.1, aa); ctx.fill();
  };
  if (uy < 0) barrel();
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
  ell(bx, by, r * 0.38, r * 0.25); ctx.fillStyle = C.mud; ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.stone; ell(bx - r * 0.06, by - r * 0.07, r * 0.22, r * 0.1); ctx.fill();
  ctx.fillStyle = C.choc; for (const d of [-1, 0, 1]) { ell(bx + d * r * 0.25, by + r * 0.12 - Math.abs(d) * r * 0.04, r * 0.035, r * 0.03); ctx.fill(); }
  if (uy >= 0) barrel();
  if (shot > 0.45 && L > r * 0.2) {
    const fx = ex + ux / d * r * 0.28, fy = ey + uy / d * r * 0.28;
    gl(fx, fy, r * 0.7, C.gold, 0.6 * shot);
    star(fx, fy, r * 0.34 * shot, C.orange);
    ctx.fillStyle = C.cream; ell(fx, fy, r * 0.08 * shot, r * 0.08 * shot); ctx.fill();
  }
  return { x: ex, y: ey };
}
function drawTurtle(o) {
  const r = o.r, face = o.face, t = o.t + (o.seed || 0), h = ease(o.hide || 0), shot = o.shot || 0;
  const w = Math.sin(t * 4) * (1 - h);
  const sx = 1 + 0.03 * w + 0.05 * h, sy = 1 - 0.03 * w - 0.08 * h;
  const aimL = face > 0 ? o.aim : Math.PI - o.aim;
  ctx.fillStyle = 'rgba(20,10,5,0.5)'; ell(o.x, o.y + r * 0.86, r * 1.3, r * 0.33); ctx.fill();
  ctx.save(); ctx.translate(o.x, o.y + h * r * 0.14 + (o.moving ? -Math.abs(Math.sin(t * 8)) * r * 0.03 : 0)); ctx.scale(face, 1);
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  turtleLegs(r, t, o.moving, h);
  ctx.save(); ctx.scale(sx, sy); turtleShell(r, t, h, o.sheen || 0); ctx.restore();
  // проём панциря спереди: голова выглядывает или прячется
  const ox = r * 0.84, oy = r * 0.18;
  ctx.fillStyle = C.dark; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
  ell(ox, oy, r * 0.26, r * 0.22); ctx.fill(); ctx.stroke();
  if (h < 0.6) {
    const k = h / 0.6, hx = lerp(r * 1.2, ox, k), hy = lerp(-r * 0.02, oy, k);
    // шея из проёма к голове
    ctx.lineCap = 'round';
    for (const [lw, col] of [[r * 0.4 * (1 - k) + 2, C.ink], [r * 0.4 * (1 - k), C.wine]]) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(hx - r * 0.1, hy + r * 0.08); ctx.stroke(); }
    turtleHead(r, t, { x: hx, y: hy, s: lerp(1, 0.35, k) }, aimL, shot > 0.3);
  } else {
    const blink = (t % 2.6) < 0.12;
    if (!blink) glowEye(ox + r * 0.03, oy, r * 0.075, C.gold, 0, 0.55);
  }
  const m = turtleTurret(r, t, aimL, h, shot);
  if (h > 0.5) for (let i = 0; i < 6; i++) {
    const q = (t * 0.9 + i / 6) % 1, side = i % 2 ? 1 : -1, vx = side * r * (0.75 + (i % 3) * 0.12), vy = r * 0.3;
    ctx.globalAlpha = 0.55 * (1 - q) * (h - 0.5) * 2; ctx.fillStyle = C.olive;
    ell(vx + side * q * r * 0.6, vy - q * r * 0.7, r * (0.14 + q * 0.3), r * (0.12 + q * 0.22)); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  o.muzzle = { x: o.x + face * m.x, y: o.y + m.y };
  if (o.hp !== undefined && o.hp < 1) hpBar(o.x, o.y - r * 1.55, r, o.hp);
}


// ===== связь с игрой =====

const anim = new WeakMap();
// кэш анимации врага: скорость, сторона взгляда, когда ранен / выстрелил, конец рывка, когда спрятался
function track(e) {
  const t = state.time;
  let a = anim.get(e);
  if (!a) {
    a = { x: e.x, y: e.y, t, speed: 0, seed: Math.random() * 10, face: Math.cos(e.facing || 0) < 0 ? -1 : 1,
      hp: e.hp, cd: e.cd, hurtAt: -9, atkAt: -9, st: e.state, skidAt: -9, shut: false, sheenAt: -9 };
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
  const shut = e.hide >= 1;
  if (shut && !a.shut) a.sheenAt = t;
  a.shut = shut;
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
    const f = e.facing || 0, L = e.cfg.chargeMaxDist, y0 = e.y + e.r * 0.3;
    ctx.strokeStyle = hexA(C.gold, 0.3 + 0.35 * k); ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.moveTo(e.x, y0); ctx.lineTo(e.x + Math.cos(f) * L, y0 + Math.sin(f) * L); ctx.stroke();
    ctx.setLineDash([]);
  }
  drawSnail({ x: e.x, y: e.y, r: e.r, face: a.face, t: now, seed: a.seed, st, k, hp: e.hp / e.maxHp });
}

// дудочник: связь — под телом, кольцо дозыва — поверх зазываемого; пьёт — ручеёк от зазомбированного в дудку
function piperFoe(e, a) {
  const now = state.time, cfg = e.cfg, target = e.charm ? e.charm.target : e.victim;
  const o = {
    x: e.x, y: e.y, r: e.r * 1.3, face: target ? (target.x >= e.x ? 1 : -1) : a.face, t: now, seed: a.seed,
    st: e.drinking ? 'drink' : e.charm ? 'play' : a.speed > 10 ? 'walk' : 'idle', hp: e.hp / e.maxHp,
    aim: target ? Math.atan2(target.y - e.y, target.x - e.x) : undefined, noNotes: !e.charm,
  };
  const prog = e.charm ? clamp(e.charm.t / cfg.charmTime, 0, 1) : 1;
  if (target && !e.drinking) { const m = piperMouth(o); charmLink(m.x, m.y, target.x, target.y - 4, now, prog); }
  drawPiper(o);
  if (e.drinking) drainStream(target.x + (o.face > 0 ? 1 : -1) * target.r * 0.5, target.y - 2, o.mouth.x, o.mouth.y, now);
  if (e.charm) charmRing(target.x, target.y + 2, target.r * 1.25 + 9, prog, now);
}

// черепаха: выстрел — по скачку перезарядки; удар по спрятавшейся — искры с той стороны, где ближний союзник
function turtleFoe(e, a) {
  const now = state.time, since = now - a.atkAt, r = e.r * 1.1;
  drawTurtle({
    x: e.x, y: e.y, r, face: a.face, t: now, seed: a.seed, aim: e.facing || 0, hide: e.hide || 0,
    shot: since >= 0 && since < 0.14 ? 1 - since / 0.14 : 0, moving: a.speed > 8,
    sheen: clamp((now - a.sheenAt) / 0.4, 0, 1.01), hp: e.hp / e.maxHp,
  });
  const ck = (now - a.hurtAt) / 0.3;
  if (!e.hidden || ck < 0 || ck >= 1) return;
  let near = null, nd = Infinity;
  for (const u of state.party) { const d = Math.hypot(u.x - e.x, u.y - e.y); if (d < nd) { nd = d; near = u; } }
  const ang = near ? Math.atan2(near.y - e.y, near.x - e.x) : -Math.PI / 2;
  const hx = e.x + Math.cos(ang) * r * 1.0, hy = e.y - r * 0.2 + Math.sin(ang) * r * 0.55;
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
const POP = { snail: [C.wine, C.rust], piper: [C.tealD, C.tealDD], turtle: [C.brown, C.blood] };

function has(type) { return !!DRAW[type]; }

function draw(e) {
  const a = track(e), ha = state.time - a.hurtAt;
  flashNow = ha >= 0 && ha < 0.1 ? 1 - ha / 0.1 : 0;
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  DRAW[e.type](e, a);
  flashNow = 0;
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
