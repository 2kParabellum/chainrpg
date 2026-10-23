// Гнездо врагов — нора в полу: земляной вал, тёмная дыра (видна дальняя стенка), комья по краю, кости
// и скорлупа вокруг. Перед волной (telegraph) комья дрожат, дыра разгорается красным и изнутри глядят глаза;
// при выходе волны летят земля и пыль. Вокруг — зона, где появляются враги волны (только по полу),
// над норой — плашка: сколько врагов в следующей волне и через сколько секунд.
// «Seal the Gates»: гнездо закрывает каменная заслонка-диафрагма — шесть лепестков выходят из-под края дыры и,
// докручиваясь, сходятся к середине, зона выхода гаснет; сомкнулась — посередине бирюзовая печать с короной, как на
// флаге, плашка — замок и «SEALED» (пока закрывается — замок и секунды). Открыли снова — лепестки отскакивают под край,
// дыра вспыхивает красным, летят земля и пыль, как при выходе волны.
// Нора видна только на полу: стены и их поднятый верх её закрывают. Вырезать это каждый кадр по всем стенам дорого
// (на трассе «Dead Race» их сотни), поэтому у норы один раз готовятся маска пола вокруг неё, заливка зоны по этой маске
// и спокойная нора (до волны дальше telegraph, выход давно прошёл) уже по маске; бегущий пунктир зоны — дугами по тем
// местам круга, что на полу. Перед волной и при выходе нора рисуется заново во временном холсте и обрезается маской.
// Закрытая нора — тоже готовой картинкой (по той же маске); заново рисуется только, пока заслонка движется.
// Состояние только читается (state.nests, level.waves, level.seals).
(function (G) {
'use strict';

const { state } = G;
let { ctx } = G.shapes;      // холст, в который рисуем сейчас (экран, готовая картинка норы или временный холст)
const { world } = G.world;
const { clamp } = G.math;

const TAU = Math.PI * 2, INK = '#2a1d0d', STONE = '#927e6a', TEAL = G.COLORS.flag, GOLD = '#efac28';
const NEST_R = 68; // полуширина вала
const HOLE_RX = 42, HOLE_RY = 27; // полуоси дыры

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
  G.shapes.glow(ctx, x, y, rad * 2.8, '#efac28', 0.5);
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

// заслонка-диафрагма над дырой (k — 0..1, насколько закрыта): шесть каменных лепестков, у каждого прямое внутреннее
// ребро; ребра образуют шестиугольный просвет, он сжимается к середине, а лепестки докручиваются. Рисуется под обрезкой
// по дыре — лишнее уходит под её край. Сомкнулась — посередине бирюзовая печать с короной
function lid(x, y, k) {
  if (k <= 0) return;
  const e = smooth(k), N = 6, R = HOLE_RX * 2.4, r = HOLE_RX * 1.05 * (1 - e), tw = (1 - e) * 1.1;
  ctx.save();
  ctx.translate(x, y); ctx.scale(1, HOLE_RY / HOLE_RX); // круг в перспективе, как сама дыра
  // лепесток i: вершина просвета, вдоль ребра к следующей вершине (edge) и наружу назад (back)
  const blade = (i) => {
    const a = tw + i / N * TAU;
    return { ax: Math.cos(a) * r, ay: Math.sin(a) * r, edge: a + Math.PI / 2 + Math.PI / N, back: a - Math.PI / N };
  };
  for (let i = 0; i < N; i++) {
    const { ax, ay, edge, back } = blade(i), mid = (edge + back) / 2;
    ctx.fillStyle = i % 2 ? STONE : '#84705e';
    ctx.beginPath(); ctx.moveTo(ax, ay);
    for (const d of [edge, mid, back]) ctx.lineTo(ax + Math.cos(d) * R, ay + Math.sin(d) * R);
    ctx.closePath(); ctx.fill();
  }
  // рёбра — поверх всех лепестков: тёмная обводка и светлая кромка вдоль неё (стыки закручиваются вертушкой)
  for (let i = 0; i < N; i++) {
    const { ax, ay, edge } = blade(i), bx = ax + Math.cos(edge) * R, by = ay + Math.sin(edge) * R;
    const nx = Math.cos(edge - Math.PI / 2) * 2.5, ny = Math.sin(edge - Math.PI / 2) * 2.5;
    ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.strokeStyle = 'rgba(239,216,161,0.3)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(ax + nx, ay + ny); ctx.lineTo(bx + nx, by + ny); ctx.stroke();
  }
  if (k >= 1) {
    // печать: бирюзовый круг с тёмной обводкой, на нём золотая корона
    ctx.fillStyle = TEAL; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, 15, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(239,216,161,0.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, 11, Math.PI * 1.1, Math.PI * 1.7); ctx.stroke();
    ctx.restore(); ctx.save(); ctx.translate(x, y); // корона — без сжатия перспективы
    ctx.fillStyle = GOLD; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-7, 4); ctx.lineTo(-7, -3); ctx.lineTo(-3.5, 0.5); ctx.lineTo(0, -5); ctx.lineTo(3.5, 0.5); ctx.lineTo(7, -3);
    ctx.lineTo(7, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

// seal — насколько закрыта заслонка, op — секунд с тех пор, как гнездо открыли снова
function burrow(x, y, soon, just, p, t, seed, seal = 0, op = 99) {
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
  const opened = clamp(1 - op / 1.2, 0, 1);
  const glow = Math.min(0.9, 0.15 + 0.6 * soon + 0.6 * Math.max(just, opened));
  const g = ctx.createRadialGradient(x, y + 10, 0, x, y + 10, 40);
  g.addColorStop(0, hexA('#ef3a0c', glow)); g.addColorStop(1, 'rgba(155,26,10,0)');
  ctx.fillStyle = g; ell(x, y + 10, 40, 26); ctx.fill();
  eyes(x, y + 4, Math.max(soon, opened), t, 40);
  lid(x + sh * 0.5, y - 2, seal);
  ctx.restore();
  if (seal > 0) { ctx.strokeStyle = INK; ctx.lineWidth = 2.5; hole(); ctx.stroke(); }
  if (seal >= 1) G.shapes.glow(ctx, x, y - 2, 46, TEAL, 0.35);
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
  burst(x, y, op, 9);
}

// плашка над норой: череп, сколько врагов и через сколько секунд; перед волной краснеет и пульсирует.
// Готовой картинкой на каждый текст (спокойная и красная)
const chips = G.shapes.spriteCache(paintOn, 200);
const CHIP_FONT = 'bold 14px "Trebuchet MS", "Segoe UI", system-ui, sans-serif';
function chip(x, y, n, sec, soon, t) {
  const txt = `×${n}  ${sec}s`, hot = soon > 0, key = (hot ? 'h' : 'c') + txt;
  let sp = chips.get(key);
  if (!sp) {
    ctx.font = CHIP_FONT;
    const w = ctx.measureText(txt).width + 34;
    sp = chips.bake(key, 1, [-w / 2 - 1, -13, w / 2 + 1, 13], () => {
      ctx.fillStyle = hot ? '#550f0a' : INK; ctx.strokeStyle = hot ? '#ef3a0c' : '#684c3c'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(-w / 2, -12, w, 24, 12); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#efd8a1'; ell(-w / 2 + 13, -1, 6, 5.5); ctx.fill(); ctx.fillRect(-w / 2 + 9.5, 2, 7, 4);
      ctx.fillStyle = INK; ell(-w / 2 + 10.8, -1, 1.6, 1.8); ctx.fill(); ell(-w / 2 + 15.2, -1, 1.6, 1.8); ctx.fill();
      ctx.font = CHIP_FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = hot ? '#efac28' : '#efd8a1'; ctx.fillText(txt, -w / 2 + 24, 1);
    });
  }
  if (!hot) { G.shapes.stamp(sp, x, y); return; }
  const k = 1 + 0.08 * soon * (0.5 + 0.5 * Math.sin(t * 12));
  G.shapes.stamp(sp, x, y, k, k);
}

// плашка закрытого или закрывающегося гнезда: бирюзовая, замок и текст («SEALED» или секунды до закрытия)
function sealChip(x, y, txt) {
  const key = 's' + txt;
  let sp = chips.get(key);
  if (!sp) {
    ctx.font = CHIP_FONT;
    const w = ctx.measureText(txt).width + 34;
    sp = chips.bake(key, 1, [-w / 2 - 1, -13, w / 2 + 1, 13], () => {
      ctx.fillStyle = '#183f39'; ctx.strokeStyle = TEAL; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(-w / 2, -12, w, 24, 12); ctx.fill(); ctx.stroke();
      const lx = -w / 2 + 13;
      ctx.strokeStyle = '#efd8a1'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(lx, -2, 3.6, Math.PI, 0); ctx.lineTo(lx + 3.6, 0); ctx.moveTo(lx - 3.6, 0); ctx.lineTo(lx - 3.6, -2); ctx.stroke();
      ctx.fillStyle = '#efd8a1'; ctx.beginPath(); ctx.roundRect(lx - 5.5, -0.5, 11, 8, 2); ctx.fill();
      ctx.fillStyle = INK; ctx.fillRect(lx - 0.8, 2, 1.6, 3);
      ctx.font = CHIP_FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#efd8a1'; ctx.fillText(txt, -w / 2 + 24, 1);
    });
  }
  G.shapes.stamp(sp, x, y);
}

// --- готовое для норы: квадрат вокруг неё в пикселях холста, маска пола (стены и их поднятый верх — не пол),
// заливка зоны по маске, спокойная нора по маске и дуги круга зоны, лежащие на полу ---
const KEEP = 3;              // готовое держится для стольких нор, что были на экране последними
const prepared = new Map();  // гнездо → готовое; порядок — от давно нужного к свежему
let scratch = null;          // временный холст для норы перед волной
const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const inRect = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
function paintOn(g, paint) { const main = ctx; ctx = g; paint(); ctx = main; }

function prepare(n, R) {
  const s = G.screen.pixelScale();
  let P = prepared.get(n);
  if (P && P.s === s) { prepared.delete(n); prepared.set(n, P); return P; }
  const B = Math.max(R + 2, 112);   // с запасом на кости вокруг вала
  const x0 = Math.floor((n.x - B) * s) / s, y0 = Math.floor((n.y - B) * s) / s;
  const cw = Math.ceil((n.x + B - x0) * s), ch = Math.ceil((n.y + B - y0) * s);
  const box = { x: x0, y: y0, w: cw / s, h: ch / s }, WH = G.terrain.WALL_H;
  const walls = world.walls.map((w) => ({ x: w.x, y: w.y - WH, w: w.w, h: w.h + WH })).filter((r) => hit(r, box));
  const canvas = () => {
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const g = c.getContext('2d'); g.setTransform(s, 0, 0, s, -x0 * s, -y0 * s);
    return [c, g];
  };
  const [mask, mg] = canvas();
  mg.fillStyle = '#000';
  for (const f of world.floors) mg.fillRect(f.x, f.y, f.w, f.h);
  mg.globalCompositeOperation = 'destination-out';
  for (const r of walls) mg.fillRect(r.x, r.y, r.w, r.h);
  const masked = (paint) => {
    const [c, g] = canvas();
    paintOn(g, paint);
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'destination-in'; g.drawImage(mask, 0, 0);
    return c;
  };
  const fill = masked(() => { ctx.fillStyle = '#9b1a0a'; ell(n.x, n.y, R, R); ctx.fill(); });
  const idle = masked(() => burrow(n.x, n.y, 0, 0, 99, 0, seedOf(n)));
  // закрытая нора — по надобности, при первом показе (см. draw)
  let sealedImg = null;
  const sealed = () => sealedImg || (sealedImg = masked(() => burrow(n.x, n.y, 0, 0, 99, 0, seedOf(n), 1)));
  // дуги круга зоны на полу: [от, до] по углу, через градус
  const floorAt = (x, y) => world.floors.some((f) => inRect(f, x, y)) && !walls.some((r) => inRect(r, x, y));
  const N = 360, on = [];
  for (let i = 0; i < N; i++) { const a = (i + 0.5) / N * TAU; on.push(floorAt(n.x + Math.cos(a) * R, n.y + Math.sin(a) * R)); }
  let arcs = [];
  for (let i = 0; i < N; i++) {
    if (!on[i]) continue;
    const last = arcs[arcs.length - 1];
    if (last && last[1] === i / N * TAU) last[1] = (i + 1) / N * TAU; else arcs.push([i / N * TAU, (i + 1) / N * TAU]);
  }
  if (arcs.length > 1 && on[0] && on[N - 1]) { const tail = arcs.pop(); arcs[0][0] = tail[0] - TAU; }
  P = { s, x0, y0, cw, ch, w: cw / s, h: ch / s, mask, fill, idle, sealed, arcs };
  prepared.set(n, P);
  for (const k of prepared.keys()) { if (prepared.size <= KEEP) break; prepared.delete(k); }
  return P;
}
const seedOf = (n) => (n.x * 7 + n.y) % 3;

// зона выхода волны: заливка по полу и бегущий пунктир по дугам на полу; fade — насколько видна (гаснет, пока гнездо
// закрывается)
function zone(n, P, R, soon, just, fade) {
  ctx.globalAlpha = (0.05 + 0.08 * soon + 0.15 * just) * fade;
  ctx.drawImage(P.fill, P.x0, P.y0, P.w, P.h);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = hexA('#ef3a0c', (0.35 + 0.45 * soon) * fade); ctx.lineWidth = 2;
  ctx.setLineDash([12, 9]);
  const off = -state.time * (15 + 60 * soon);
  for (const [a0, a1] of P.arcs) {
    ctx.lineDashOffset = off + a0 * R;
    ctx.beginPath(); ctx.arc(n.x, n.y, R, a0, a1); ctx.stroke();
  }
  ctx.setLineDash([]); ctx.lineDashOffset = 0;
}

// нора перед волной, при выходе и пока движется заслонка: заново во временном холсте, по маске пола
function liveBurrow(n, P, soon, just, p, t, seal, op) {
  if (!scratch) scratch = document.createElement('canvas');
  if (scratch.width < P.cw || scratch.height < P.ch) { scratch.width = Math.max(scratch.width, P.cw); scratch.height = Math.max(scratch.height, P.ch); }
  const g = scratch.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, P.cw, P.ch);
  g.setTransform(P.s, 0, 0, P.s, -P.x0 * P.s, -P.y0 * P.s);
  paintOn(g, () => burrow(n.x, n.y, soon, just, p, t, seedOf(n), seal, op));
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'destination-in'; g.drawImage(P.mask, 0, 0); g.globalCompositeOperation = 'source-over';
  ctx.drawImage(scratch, 0, 0, P.cw, P.ch, P.x0, P.y0, P.w, P.h);
}

// n — гнездо из state.nests, cfg — level.waves
function draw(n, cfg) {
  const t = state.time, p = t - n.releasedAt, seal = n.seal, op = t - n.openedAt;
  const soon = n.sealed ? 0 : clamp(1 - n.nextIn / cfg.telegraph, 0, 1), just = clamp(1 - p / 1.2, 0, 1);
  const R = cfg.spawnRadius + 24, P = prepare(n, R);
  if (seal < 1) zone(n, P, R, soon, just, 1 - seal);
  const still = soon === 0 && just === 0 && op > 1.2; // ни волны, ни вспышки открытия: нора не шевелится
  if (still && seal === 0) ctx.drawImage(P.idle, P.x0, P.y0, P.w, P.h);
  else if (still && seal >= 1) ctx.drawImage(P.sealed(), P.x0, P.y0, P.w, P.h);
  else liveBurrow(n, P, soon, just, p, t, seal, op);
  if (n.sealed) sealChip(n.x, n.y - 74, 'SEALED');
  else if (n.guarded && seal > 0) sealChip(n.x, n.y - 74, `${Math.ceil((1 - seal) * state.level.seals.time)}s`);
  else chip(n.x, n.y - 74, G.waves.nextCount(cfg, n), Math.max(0, Math.ceil(n.nextIn)), soon, t);
}

G.nestArt = { draw, R: NEST_R };
})(window.Game = window.Game || {});
