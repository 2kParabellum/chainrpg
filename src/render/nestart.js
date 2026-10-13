// Гнездо врагов — нора в полу: земляной вал, тёмная дыра (видна дальняя стенка), комья по краю, кости
// и скорлупа вокруг. Перед волной (telegraph) комья дрожат, дыра разгорается красным и изнутри глядят глаза;
// при выходе волны летят земля и пыль. Вокруг — зона, где появляются враги волны (только по полу),
// над норой — плашка: сколько врагов в следующей волне и через сколько секунд.
// Состояние только читается (state.nests, level.waves).
(function (G) {
'use strict';

const { state } = G;
const { ctx } = G.shapes;
const { world } = G.world;
const { clamp } = G.math;

const TAU = Math.PI * 2, INK = '#2a1d0d';
const NEST_R = 68; // полуширина вала

function hexA(h, a) { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
function ell(x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU); }
const h2 = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); };
const smooth = (k) => k * k * (3 - 2 * k);
// неровный контур (seed — свой рисунок края)
function blob(x, y, rx, ry, seed, amp, n = 18) {
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = i / n * TAU, k = 1 + amp * (h2(i % n, seed) * 2 - 1);
    const px = x + Math.cos(a) * rx * k, py = y + Math.sin(a) * ry * k;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
}
function glowEye(x, y, rad) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, rad * 2.8);
  g.addColorStop(0, 'rgba(239,172,40,0.5)'); g.addColorStop(1, 'rgba(239,172,40,0)');
  ctx.fillStyle = g; ell(x, y, rad * 2.8, rad * 2.8); ctx.fill();
  ctx.fillStyle = '#300f0a'; ell(x, y, rad * 1.3, rad * 1.3); ctx.fill();
  ctx.fillStyle = '#efac28'; ell(x, y, rad, rad); ctx.fill();
}
function bone(x, y, a, s) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(s, s);
  ctx.fillStyle = '#927e6a'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(-9, -2, 18, 4, 2); ctx.fill(); ctx.stroke();
  for (const sx of [-9, 9]) for (const sy of [-2.5, 2.5]) { ell(sx, sy, 2.6, 2.6); ctx.fill(); ctx.stroke(); }
  ctx.beginPath(); ctx.roundRect(-8, -1.5, 16, 3, 1.5); ctx.fill();
  ctx.restore();
}
function shell(x, y, a) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.fillStyle = '#a56243'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-7, 0); ctx.quadraticCurveTo(-7, 8, 0, 8); ctx.quadraticCurveTo(7, 8, 7, 0);
  ctx.lineTo(4, -2); ctx.lineTo(1, 1); ctx.lineTo(-2, -2); ctx.lineTo(-5, 1); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}
// глаза в темноте дыры: три пары, моргают
function eyes(x, y, soon, t, R) {
  if (soon < 0.25) return;
  ctx.globalAlpha = clamp((soon - 0.25) * 2, 0, 1);
  [[-0.45, 0.05], [0.4, -0.1], [0.05, 0.35]].forEach(([dx, dy], i) => {
    if (Math.sin(t * 2.3 + i * 2) > 0.85) return;
    for (const sx of [-1, 1]) glowEye(x + dx * R + sx * R * 0.09, y + dy * R * 0.6, R * 0.055);
  });
  ctx.globalAlpha = 1;
}
// выход волны: пыль кольцом и подброшенные комья (p — секунд с выхода)
function burst(x, y, p, seed) {
  if (p < 0 || p > 0.8) return;
  const k = p / 0.8;
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * TAU + h2(i, 4) * 0.5, d = 80 * (0.6 + 0.6 * h2(i, 5)) * smooth(k);
    ctx.globalAlpha = 0.5 * (1 - k); ctx.fillStyle = '#927e6a';
    ell(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6 - k * 8, 7 + 10 * k, 5 + 7 * k); ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (p > 0.75) return;
  const q = p / 0.75, cols = ['#724113', '#ab5c1c', '#45230d'];
  ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * TAU + h2(i, seed), d = 90 * (0.5 + 0.8 * h2(i, seed + 2)) * q, up = Math.sin(q * Math.PI) * (16 + 20 * h2(i, seed + 3));
    ctx.fillStyle = cols[i % 3];
    ctx.save(); ctx.translate(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6 - up); ctx.rotate(q * 6 + i);
    ctx.beginPath(); ctx.moveTo(-4, -3); ctx.lineTo(4, -4); ctx.lineTo(5, 3); ctx.lineTo(-3, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}

function burrow(x, y, soon, just, p, t, seed) {
  const sh = soon > 0.4 ? (soon - 0.4) * Math.sin(t * 47) * 2.2 : 0;
  bone(x - 92, y + 24, 0.6 + seed, 1); bone(x + 84, y - 40, -0.3, 0.8); shell(x + 70, y + 46, 0.4 + seed); shell(x - 66, y - 46, -0.8); bone(x + 30, y + 72, 1.9, 0.7);
  ctx.fillStyle = 'rgba(20,10,5,0.4)'; blob(x, y + 10, 76, 50, 3, 0.07); ctx.fill();
  // вал: передний скат темнее, верх светлее
  ctx.strokeStyle = INK; ctx.lineWidth = 3;
  ctx.fillStyle = '#45230d'; blob(x + sh, y + 7, 70, 46, 2, 0.08); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#724113'; blob(x + sh, y, NEST_R, 44, 2, 0.08); ctx.fill();
  ctx.save(); blob(x + sh, y, NEST_R, 44, 2, 0.08); ctx.clip();
  ctx.fillStyle = 'rgba(239,183,117,0.12)'; ell(x - 10, y - 26, 60, 18); ctx.fill();
  ctx.restore();
  // дыра: видна дальняя стенка, внизу темно, перед волной разгорается красным
  const hole = () => blob(x + sh * 0.5, y - 2, 42, 27, 7, 0.12);
  ctx.fillStyle = '#36170c'; hole(); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.save(); hole(); ctx.clip();
  ctx.fillStyle = 'rgba(8,5,2,0.85)'; ell(x, y + 9, 42, 24); ctx.fill();
  const glow = Math.min(0.9, 0.15 + 0.6 * soon + 0.6 * just);
  const g = ctx.createRadialGradient(x, y + 10, 0, x, y + 10, 40);
  g.addColorStop(0, hexA('#ef3a0c', glow)); g.addColorStop(1, 'rgba(155,26,10,0)');
  ctx.fillStyle = g; ell(x, y + 10, 40, 26); ctx.fill();
  eyes(x, y + 4, soon, t, 40);
  ctx.restore();
  // комья по краю: перед волной дрожат и подпрыгивают
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * TAU + h2(i, 11) * 0.3, rr = 0.72 + 0.12 * h2(i, 12);
    const jig = soon > 0.4 ? Math.sin(t * 40 + i * 3) * soon * 1.8 : 0;
    const hop = soon > 0.6 ? Math.abs(Math.sin(t * 23 + i)) * soon * 2 : 0;
    ctx.fillStyle = h2(i, 13) > 0.5 ? '#724113' : '#ab5c1c'; ctx.strokeStyle = INK;
    blob(x + sh + Math.cos(a) * 66 * rr, y + Math.sin(a) * 42 * rr + jig - hop, 5 + h2(i, 14) * 4, 4 + h2(i, 15) * 2.5, i + 30, 0.25, 7);
    ctx.fill(); ctx.stroke();
  }
  burst(x, y, p, 6);
}

// плашка над норой: череп, сколько врагов и через сколько секунд; перед волной краснеет и пульсирует
function chip(x, y, n, sec, soon, t) {
  const txt = `×${n}  ${sec}s`;
  ctx.font = 'bold 14px "Trebuchet MS", "Segoe UI", system-ui, sans-serif';
  const w = ctx.measureText(txt).width + 34, k = soon > 0 ? 1 + 0.08 * soon * (0.5 + 0.5 * Math.sin(t * 12)) : 1;
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  ctx.fillStyle = soon > 0 ? '#550f0a' : INK; ctx.strokeStyle = soon > 0 ? '#ef3a0c' : '#684c3c'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(-w / 2, -12, w, 24, 12); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#efd8a1'; ell(-w / 2 + 13, -1, 6, 5.5); ctx.fill(); ctx.fillRect(-w / 2 + 9.5, 2, 7, 4);
  ctx.fillStyle = INK; ell(-w / 2 + 10.8, -1, 1.6, 1.8); ctx.fill(); ell(-w / 2 + 15.2, -1, 1.6, 1.8); ctx.fill();
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = soon > 0 ? '#efac28' : '#efd8a1'; ctx.fillText(txt, -w / 2 + 24, 1);
  ctx.restore(); ctx.textBaseline = 'alphabetic';
}

// всё гнездо рисуется только по полу уровня: стены и их поднятый верх — не пол
function clipFloor(n, R) {
  ctx.beginPath();
  for (const f of world.floors) ctx.rect(f.x, f.y, f.w, f.h);
  ctx.clip();
  const H = G.terrain.WALL_H;
  ctx.beginPath();
  ctx.rect(n.x - R - 1, n.y - R - 1, R * 2 + 2, R * 2 + 2);
  for (const w of world.walls) ctx.rect(w.x, w.y - H, w.w, w.h + H);
  ctx.clip('evenodd');
}
// зона выхода волны: заливка и бегущий пунктир
function zone(n, R, soon, just) {
  ctx.fillStyle = hexA('#9b1a0a', 0.05 + 0.08 * soon + 0.15 * just); ell(n.x, n.y, R, R); ctx.fill();
  ctx.strokeStyle = hexA('#ef3a0c', 0.35 + 0.45 * soon); ctx.lineWidth = 2;
  ctx.setLineDash([12, 9]); ctx.lineDashOffset = -state.time * (15 + 60 * soon);
  ell(n.x, n.y, R, R); ctx.stroke();
  ctx.setLineDash([]); ctx.lineDashOffset = 0;
}

// n — гнездо из state.nests, cfg — level.waves
function draw(n, cfg) {
  const t = state.time, p = t - n.releasedAt;
  const soon = clamp(1 - n.nextIn / cfg.telegraph, 0, 1), just = clamp(1 - p / 1.2, 0, 1);
  const R = cfg.spawnRadius + 24;
  ctx.save();
  clipFloor(n, R);
  zone(n, R, soon, just);
  burrow(n.x, n.y, soon, just, p, t, (n.x * 7 + n.y) % 3);
  ctx.restore();
  chip(n.x, n.y - 74, G.waves.waveSize(cfg, n.wave), Math.max(0, Math.ceil(n.nextIn)), soon, t);
}

G.nestArt = { draw, R: NEST_R };
})(window.Game = window.Game || {});
