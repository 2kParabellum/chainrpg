// Враги — другая раса, чем свои (graphics.md): тёмные тела с колышущимся краем, светящиеся глаза
// без белков, вместо рук — лапы, клешни, хвост, рога, ствол. Целиком рисует Стрелка, Бычка, Колесницу, Скорпиона,
// Зомби, Хантера, катапульту, мину, портал и турель. Демону и Спруту даёт тела (demon, kraken): прицелы, тентакли,
// лужи и прочее вокруг них рисуют их записи в реестре.
// Анимация выводится из изменений врага между кадрами (свой кэш, состояние игры только читается).
(function (G) {
'use strict';

const { state } = G;
const { glow, stamp, snap, frameAt, dirOf } = G.shapes;
let ctx = G.shapes.ctx; // на время рисования готовой картинки — её холст (bake)
G.shapes.onCtx((c) => { ctx = c; });

const TAU = Math.PI * 2;
const C = {
  ink: '#2a1d0d', cream: '#efd8a1', stone: '#927e6a', gold: '#efac28', red: '#ef3a0c', orange: '#ef692f',
  olive: '#a58c27', brown: '#724113', dark: '#300f0a',
};
// тело, тень тела, цвет глаз
const LOOK = {
  shooter: { col: '#9b1a0a', sh: '#550f0a', eye: C.gold, edge: 'wobble' },
  bull: { col: '#773421', sh: '#300f0a', eye: C.red, edge: 'wobble' },
  chariot: { col: '#773421', sh: '#300f0a', eye: C.red, edge: 'wobble' },
  hunter: { col: '#ef692f', sh: '#9b1a0a', eye: C.cream, edge: 'spiky' }, // мелкий — яркий, чтобы не терялся на полу
  zombie: { col: '#39571c', sh: '#1f240a', eye: C.gold, edge: 'drip' },
  scorpion: { col: '#ef692f', sh: '#ab5c1c', eye: C.red, edge: 'wobble' }, // громила с большой лапой, ярко-оранжевый
};

const anim = new WeakMap();
let lastDrawn = new Set();

function ell(x, y, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU);
}
function hexA(h, a) { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }

function track(e) {
  const t = state.time;
  let a = anim.get(e);
  if (!a) {
    a = { x: e.x, y: e.y, t, speed: 0, ph: Math.random() * 10, seed: Math.random() * 10,
      face: Math.cos(e.facing || 0) < 0 ? -1 : 1, hp: e.hp, cd: e.cd, hurtAt: -9, atkAt: -9 };
    anim.set(e, a);
  }
  const dt = t - a.t;
  if (dt > 0) {
    const sp = Math.min(600, Math.hypot(e.x - a.x, e.y - a.y) / dt);
    a.speed += (sp - a.speed) * Math.min(1, dt * 10);
    a.ph += dt * (4 + a.speed * 0.06);
  }
  a.x = e.x; a.y = e.y; a.t = t;
  const cx = Math.cos(e.facing || 0);
  if (cx > 0.25) a.face = 1; else if (cx < -0.25) a.face = -1;
  if (e.hp < a.hp - 0.3 && t - a.hurtAt > 0.4) a.hurtAt = t; // молния жжёт каждый кадр — вспышка не чаще
  a.hp = e.hp;
  if (e.cd !== undefined && a.cd !== undefined && e.cd > a.cd + 0.05) a.atkAt = t;
  a.cd = e.cd;
  return a;
}

// колышущийся край вместо гладкого эллипса
function edgePath(rx, ry, t, kind, seed) {
  ctx.beginPath();
  const N = kind === 'spiky' ? 26 : 32;
  for (let i = 0; i <= N; i++) {
    const ang = i / N * TAU;
    let k = 1 + 0.05 * Math.sin(3 * ang + t * 3 + seed) + 0.035 * Math.sin(5 * ang - t * 4.5 + seed);
    if (kind === 'spiky') k += i % 2 ? -0.1 : 0.16;
    if (kind === 'drip') { const s = Math.sin(ang); if (s > 0.3) k += 0.1 * Math.max(0, Math.sin(ang * 9 + t * 1.5 + seed)) * s; }
    const x = Math.cos(ang) * rx * k, y = Math.sin(ang) * ry * k;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

// светящийся глаз без белка: ореол, тёмная глазница, цветная радужка, блик
function glowEye(x, y, rad, col, rot = 0, squash = 1) {
  glow(ctx, x, y, rad * 2.8, col, 0.5);
  ctx.fillStyle = C.dark; ell(x, y, rad * 1.3, rad * 1.3 * squash, rot); ctx.fill();
  ctx.fillStyle = col; ell(x, y, rad, rad * squash, rot); ctx.fill();
  ctx.fillStyle = C.cream; ell(x - rad * 0.3, y - rad * 0.3 * squash, rad * 0.3, rad * 0.3 * squash); ctx.fill();
}

function star(x, y, s, col) {
  ctx.fillStyle = col; ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.beginPath();
  for (let i = 0; i < 10; i++) { const ang = i / 10 * TAU - Math.PI / 2, q = i % 2 ? s * 0.45 : s; ctx.lineTo(x + Math.cos(ang) * q, y + Math.sin(ang) * q); }
  ctx.closePath(); ctx.fill(); ctx.stroke();
}

function hpBar(x, y, r, k) {
  const w = Math.max(22, r * 2), h = 4, bx = x - w / 2;
  ctx.fillStyle = C.ink; ctx.beginPath(); ctx.roundRect(bx - 1.5, y - 1.5, w + 3, h + 3, 3); ctx.fill();
  ctx.fillStyle = C.red; ctx.beginPath(); ctx.roundRect(bx, y, w * Math.max(0.03, Math.min(1, k)), h, 2); ctx.fill();
}

// куда улетела лапа Скорпиона: летящий гарпун или пойманный и подтягиваемый союзник
function armTarget(e) {
  for (const p of state.projectiles) if (p.kind === 'hook' && p.owner === e) return { x: p.x, y: p.y };
  for (const d of state.downed) if (d.drag === e) return { x: d.x, y: d.y };
  return null;
}

// пружина между двумя точками: витки поперёк линии, тёмная обводка и металл
function spring(x1, y1, x2, y2, w) {
  const d = Math.hypot(x2 - x1, y2 - y1) || 1, nx = -(y2 - y1) / d, ny = (x2 - x1) / d;
  const n = Math.max(6, Math.round(d / 7));
  for (const [lw, col] of [[4.5, C.ink], [2.2, C.stone]]) {
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1);
    for (let i = 1; i < n; i++) {
      const q = i / n, o = (i % 2 ? 1 : -1) * w;
      ctx.lineTo(x1 + (x2 - x1) * q + nx * o, y1 + (y2 - y1) * q + ny * o);
    }
    ctx.lineTo(x2, y2); ctx.stroke();
  }
}

// огромная когтистая лапа Скорпиона
function drawPaw(px, py, pr, face, L) {
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.fillStyle = C.cream;
  for (let i = -1; i <= 1; i++) {
    const cy = py + i * pr * 0.45;
    ctx.beginPath(); ctx.moveTo(px + face * pr * 0.7, cy - pr * 0.14); ctx.lineTo(px + face * pr * 1.35, cy + i * pr * 0.12);
    ctx.lineTo(px + face * pr * 0.7, cy + pr * 0.14); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.fillStyle = L.col; ell(px, py, pr, pr * 0.9); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = L.sh;
  for (const i of [-1, 1]) { ctx.beginPath(); ctx.moveTo(px + face * pr * 0.25, py + i * pr * 0.25); ctx.lineTo(px + face * pr * 0.75, py + i * pr * 0.25); ctx.stroke(); }
  ctx.fillStyle = hexA(L.eye, 0.35); ell(px - face * pr * 0.3, py - pr * 0.35, pr * 0.3, pr * 0.18); ctx.fill();
}

function drawsHook(owner) { return owner && owner.type === 'scorpion' && state.enemies.includes(owner); }

// докуда тянется рисунок врага, кроме тела: лапа Скорпиона на пружине (летит гарпуном или тащит пойманного),
// линия разгона целящегося Бычка. Сцена рисует врага, если в кадр попадает хоть что-то от тела до этой точки
function farPoint(e) {
  if (e.type === 'scorpion') return armTarget(e);
  if ((e.type === 'bull' || e.type === 'chariot') && e.state === 'telegraph') {
    const f = e.facing || 0, d = e.cfg.chargeMaxDist * 0.4;
    return { x: e.x + Math.cos(f) * d, y: e.y + Math.sin(f) * d };
  }
  return null;
}

function has(type) { return !!LOOK[type] || !!SPECIAL[type]; }

// --- готовые картинки частей тела ---
// Обычный враг из 40–60 рисований каждый кадр — дорого, в толпе это больше половины кадра. Поэтому части
// (лапки, тело, лицо) рисуются один раз в готовую картинку в разрешении экрана и дальше только копируются:
// сплющивание и рывок — растяжкой картинки, вспышка от удара — готовым белым силуэтом поверх тела.
// Колыхание края — BODY_FRAMES кадров на цикл: за BODY_CYCLE секунд обе волны края проходят целое число раз,
// так что кадры зацикливаются без скачка
const BODY_FRAMES = 32, BODY_CYCLE = 4 * Math.PI / 3, LEG_FRAMES = 12, BOB_FRAMES = 12, MOUTH_FRAMES = 8, DIRS = 16;
const sprites = G.shapes.spriteCache((g, paint) => { const main = ctx; ctx = g; paint(); ctx = main; });
const cached = sprites.get, bake = sprites.bake;

// рамки картинок в долях r; лицо — для взгляда вправо, влево отражается
const BOX = {
  body: [-1.3, -1.3, 1.3, 1.3], legs: [-0.9, 0.4, 0.9, 0.95],
  shooter: [-1.2, -1.25, 2, 0.85], bull: [-1.45, -1.55, 2, 0.85], chariot: [-1.45, -1.55, 2, 0.85],
  hunter: [-1.1, -0.75, 1.1, 0.6], zombie: [-1.25, -0.95, 1.25, 0.65], scorpion: [-1, -0.75, 1, 0.45], arm: [0.2, -0.4, 2, 0.95],
};
const mirror = (b, face) => (face > 0 ? b : [-b[2], b[1], -b[0], b[3]]);

// тело без сплющивания: тёмная тень, цвет, подсветка снизу цветом глаз (у Зомби — пятна)
function paintBody(type, L, r, t, tele) {
  const rx = r, ry = r * 0.92;
  edgePath(rx, ry, t, L.edge, 0); ctx.fillStyle = L.sh; ctx.fill();
  ctx.save();
  edgePath(rx, ry, t, L.edge, 0); ctx.clip();
  ctx.fillStyle = tele ? '#ab5c1c' : L.col; ell(-rx * 0.05, -ry * 0.12, rx * 0.92, ry * 0.85); ctx.fill();
  ctx.strokeStyle = hexA(L.eye, tele ? 0.6 : 0.35); ctx.lineWidth = r * 0.24; ell(0, -r * 0.18, rx * 1.02, ry); ctx.stroke();
  if (type === 'zombie') { ctx.fillStyle = C.olive; ell(-rx * 0.45, ry * 0.3, rx * 0.2, ry * 0.12); ctx.fill(); ell(rx * 0.5, -ry * 0.45, rx * 0.12, ry * 0.08); ctx.fill(); }
  ctx.restore();
  edgePath(rx, ry, t, L.edge, 0); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke();
}

// белый силуэт тела под обводкой — вспышка от удара
function paintFlash(L, r, t) {
  edgePath(r, r * 0.92, t, L.edge, 0); ctx.fillStyle = 'rgb(255,250,240)'; ctx.fill();
  ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = 2; ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}

// лапки; ph — кадр шага (−1 — стоит)
function paintLegs(L, r, ph) {
  ctx.fillStyle = L.sh;
  for (let i = 0; i < 2; i++) for (const s of [-1, 1]) {
    const lift = ph >= 0 ? Math.max(0, Math.sin(ph / LEG_FRAMES * TAU + i + (s > 0 ? Math.PI : 0))) * r * 0.14 : 0;
    ell(s * r * (0.35 + i * 0.3), r * 0.75 - lift, r * 0.18, r * 0.14); ctx.fill(); ctx.stroke();
  }
}

function paintShooter(L, r, face, f, rec) {
  const fx = face * r * 0.22;
  glowEye(fx * 0.6, -r * 0.2, r * 0.36, L.eye);
  ctx.fillStyle = C.ink; ell(fx * 0.6 + Math.cos(f) * r * 0.1, -r * 0.2 + Math.sin(f) * r * 0.08, r * 0.09, r * 0.27); ctx.fill();
  const back = rec ? -r * 0.15 : 0;
  ctx.save(); ctx.scale(face, 1);
  ctx.fillStyle = L.sh; ctx.beginPath(); ctx.roundRect(r * 0.65 + back, r * 0.05, r * 0.65, r * 0.42, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.dark; ell(r * 1.3 + back, r * 0.26, r * 0.1, r * 0.2); ctx.fill(); ctx.stroke();
  if (rec) star(r * 1.55, r * 0.26, r * 0.38, C.orange);
  ctx.restore();
}

// Бычок и Колесница: глаза, нос, сигарета в углу рта (длинная белая, оранжевый фильтр, тлеющий кончик), рога
function paintBull(L, r, face, tele) {
  const fx = face * r * 0.22;
  for (const s of [-1, 1]) glowEye(fx + s * r * 0.33, -r * 0.2, r * 0.16, tele ? C.gold : L.eye, s * face * 0.5, 0.45);
  ctx.fillStyle = L.sh; ell(fx + face * r * 0.2, r * 0.32, r * 0.42, r * 0.24); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.dark; for (const s of [-1, 1]) { ell(fx + face * r * 0.2 + s * r * 0.15, r * 0.32, r * 0.06, r * 0.08); ctx.fill(); }
  const [cx0, cy0, len, ang] = cigarette(r, face), th = r * 0.17;
  ctx.save(); ctx.translate(cx0, cy0); ctx.rotate(ang);
  ctx.fillStyle = '#fff4dc'; ctx.beginPath(); ctx.rect(0, -th / 2, len, th); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ab5c1c'; ctx.fillRect(0, -th / 2, len * 0.3, th); ctx.strokeRect(0, -th / 2, len * 0.3, th);
  ctx.fillStyle = C.stone; ctx.fillRect(len * 0.9, -th / 2, len * 0.07, th);
  ctx.fillStyle = tele ? C.gold : C.red; ctx.fillRect(len * 0.96, -th / 2, len * 0.06, th);
  ctx.restore();
  ctx.fillStyle = C.cream;
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(s * r * 0.45, -r * 0.62); ctx.quadraticCurveTo(s * r * 1.35, -r * 0.75, s * r * 1.2, -r * 1.45);
    ctx.quadraticCurveTo(s * r * 0.95, -r * 0.95, s * r * 0.2, -r * 0.85); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
}
// где сигарета: начало у рта, длина, наклон
function cigarette(r, face) { return [face * r * 0.62, r * 0.42, r * 1.15, face > 0 ? 0.2 : Math.PI - 0.2]; }

function paintHunter(L, r, face) {
  const fx = face * r * 0.22;
  for (const s of [-1, 1]) glowEye(fx + s * r * 0.24, -r * 0.22, r * 0.16, L.eye);
  ctx.fillStyle = C.dark; ctx.beginPath(); ctx.ellipse(fx, r * 0.18, r * 0.52, r * 0.32, 0, 0, Math.PI); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.cream;
  for (let i = 0; i < 4; i++) {
    const tx = fx - r * 0.44 + i * r * 0.22;
    ctx.beginPath(); ctx.moveTo(tx, r * 0.2); ctx.lineTo(tx + r * 0.11, r * 0.4); ctx.lineTo(tx + r * 0.22, r * 0.2); ctx.closePath(); ctx.fill();
  }
}

// Зомби: eye — большой глаз: 'n' целый, 's' пустая глазница, 'd' глазница с потёком, 'x' нет (рисуется живьём);
// mq — кадр дыхания рта
function paintZombie(L, r, face, eye, mq) {
  const fx = face * r * 0.22, ex = fx - r * 0.3, ey = -r * 0.2, er = r * 0.24;
  if (eye === 'n') glowEye(ex, ey, er, L.eye);
  else if (eye !== 'x') {
    ctx.fillStyle = C.dark; ell(ex, ey, er * 1.1, er); ctx.fill(); ctx.stroke();
    if (eye === 'd') { ctx.fillStyle = C.olive; ell(ex, ey + er * 0.9, er * 0.25, er * 0.35); ctx.fill(); }
  }
  ctx.fillStyle = C.dark; ell(fx + r * 0.33, -r * 0.15, r * 0.14, r * 0.12); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.red; ell(fx + r * 0.33, -r * 0.15, r * 0.05, r * 0.05); ctx.fill();
  ctx.fillStyle = C.dark; ell(fx, r * 0.33, r * 0.28, r * 0.18 + 0.04 * r * Math.sin(mq / MOUTH_FRAMES * TAU)); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.cream; ctx.fillRect(fx - r * 0.08, r * 0.17, r * 0.12, r * 0.12);
}

// Скорпион: глаза, бровь, рот с клыками; armOut — лапа улетела, у плеча только обрубок с креплением
function paintScorpion(L, r, face, armOut) {
  const fx = face * r * 0.22;
  for (const sx2 of [-1, 1]) glowEye(fx + sx2 * r * 0.24, -r * 0.25, r * 0.13, L.eye, 0, 0.7);
  ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(fx - r * 0.42, -r * 0.48); ctx.lineTo(fx + r * 0.42, -r * 0.48); ctx.stroke();
  ctx.fillStyle = C.dark; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(fx, r * 0.22, r * 0.3, r * 0.14, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.cream;
  for (const sx2 of [-1, 1]) { ctx.beginPath(); ctx.moveTo(fx + sx2 * r * 0.2, r * 0.25); ctx.lineTo(fx + sx2 * r * 0.13, r * 0.05); ctx.lineTo(fx + sx2 * r * 0.06, r * 0.25); ctx.closePath(); ctx.fill(); }
  if (armOut) { ctx.fillStyle = C.stone; ell(face * r * 0.75, r * 0.1, r * 0.2, r * 0.2); ctx.fill(); ctx.stroke(); }
}

// огромная лапа Скорпиона у плеча: покачивается (кадр bob), при щипке (pinch 0..1) выбрасывается вперёд
function paintArm(L, r, face, py, pinch) {
  let px = face * r * 1.1, pk = 1;
  if (pinch > 0) { px = face * r * (1.1 + 0.45 * pinch); py = r * (0.3 + 0.25 * pinch); pk = 1 + 0.15 * pinch; }
  for (const [lw, col] of [[r * 0.42, C.ink], [r * 0.28, L.sh]]) {
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(face * r * 0.55, r * 0.1); ctx.lineTo(px, py); ctx.stroke();
  }
  drawPaw(px, py, r * 0.55 * pk, face, L);
  if (pinch > 0.5) star(px + face * r * 0.75, py, r * 0.35, C.orange);
}

function draw(e) {
  if (SPECIAL[e.type]) { drawSpecial(e); return; }
  // Зомби и Хантер рисуются крупнее своего тела (столкновения те же): Зомби — громадина, Хантера видно издалека
  const L = LOOK[e.type], a = track(e), t = state.time + a.seed, face = a.face, type = e.type;
  const r = e.r * (type === 'zombie' ? 1.35 : type === 'hunter' ? 1.15 : 1);
  const w = Math.sin(t * 4);
  let sx = 1 + 0.045 * w, sy = 1 - 0.045 * w, dx = 0, flash = 0;
  const sa = state.time - a.atkAt;
  if (sa >= 0 && sa < 0.35) {
    const k = sa < 0.1 ? sa / 0.1 : 1 - (sa - 0.1) / 0.25;
    dx = face * r * 0.25 * k; sx *= 1 - 0.1 * k; sy *= 1 + 0.1 * k;
  }
  const ha = state.time - a.hurtAt;
  if (ha >= 0 && ha < 0.3) {
    const k = 1 - ha / 0.3;
    sx *= 1 + 0.15 * k; sy *= 1 - 0.13 * k;
    if (ha < 0.1) flash = 1 - ha / 0.1;
  }
  const telegraph = (type === 'bull' || type === 'chariot') && e.state === 'telegraph';
  const armOut = type === 'scorpion' ? armTarget(e) : null;
  if (telegraph) { const k = Math.sin(state.time * 30) * 0.5 + 0.5; sx *= 1.08 + 0.04 * k; sy *= 0.92; dx -= face * r * 0.12; }
  const x = e.x + dx, y = e.y, rx = r * sx, ry = r * 0.92 * sy;

  // Колесница: две оглобли к катапульте — под телом
  if (type === 'chariot' && e.cart && e.cart.hp > 0) {
    const c = e.cart, ang = Math.atan2(c.y - e.y, c.x - e.x), nx = -Math.sin(ang), ny = Math.cos(ang);
    for (const [lw, col] of [[6, C.ink], [3, C.brown]]) {
      ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.beginPath();
      for (const s of [1, -1]) {
        ctx.moveTo(e.x + nx * e.r * 0.6 * s, e.y + ny * e.r * 0.6 * s);
        ctx.lineTo(c.x + nx * c.r * 0.7 * s, c.y + ny * c.r * 0.7 * s);
      }
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }
  // Бычок целится: линия разгона
  if (telegraph) {
    const f = e.facing || 0;
    ctx.strokeStyle = hexA(C.gold, 0.55); ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.moveTo(e.x, e.y);
    ctx.lineTo(e.x + Math.cos(f) * e.cfg.chargeMaxDist * 0.4, e.y + Math.sin(f) * e.cfg.chargeMaxDist * 0.4);
    ctx.stroke(); ctx.setLineDash([]);
  }

  // тень
  ctx.fillStyle = 'rgba(20,10,5,0.5)';
  ell(e.x, y + r * 0.85, r * 1.05, r * 0.32); ctx.fill();

  // лапки, тело (растянуто), вспышка от удара — готовые картинки
  const rk = Math.round(r * 4) / 4;
  if (type !== 'shooter' && type !== 'zombie') {
    const ph = a.speed > 10 ? frameAt(a.ph * 2.5, TAU, LEG_FRAMES) : -1, k = `l|${type}|${rk}|${ph}`;
    stamp(cached(k) || bake(k, r, BOX.legs, () => paintLegs(L, r, ph)), x, y);
  }
  const fr = frameAt(t, BODY_CYCLE, BODY_FRAMES), tf = fr * BODY_CYCLE / BODY_FRAMES;
  const kb = `b|${type}|${rk}|${fr}|${telegraph ? 1 : 0}`;
  stamp(cached(kb) || bake(kb, r, BOX.body, () => paintBody(type, L, r, tf, telegraph)), x, y, sx, sy);
  if (flash > 0) {
    const kf = `f|${type}|${rk}|${fr}`;
    ctx.globalAlpha = 0.9 * flash;
    stamp(cached(kf) || bake(kf, r, BOX.body, () => paintFlash(L, r, tf)), x, y, sx, sy);
    ctx.globalAlpha = 1;
  }

  ctx.save();
  ctx.translate(snap(x), snap(y));
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (type === 'zombie') for (let i = 0; i < 2; i++) {
    const k = (t * 0.6 + i * 0.5) % 1, px = (i ? 0.35 : -0.25) * rx;
    ctx.globalAlpha = 1 - k; ctx.fillStyle = L.col; ell(px, ry * 0.95 + k * r * 0.5, r * 0.1, r * 0.13); ctx.fill(); ctx.stroke(); ctx.globalAlpha = 1;
  }

  // лицо: зрачки и глаза смотрят туда, куда смотрит враг; готовая картинка на сторону и состояние,
  // живьём — только то, что меняется плавно
  const fx = face * r * 0.22, box = mirror(BOX[type], face);
  let kl;
  if (type === 'shooter') {
    const dir = dirOf(e.facing || 0, DIRS), rec = sa >= 0 && sa < 0.12;
    kl = `s|${rk}|${face}|${dir}|${rec ? 1 : 0}`;
    stamp(cached(kl) || bake(kl, r, box, () => paintShooter(L, r, face, dir / DIRS * TAU, rec)), 0, 0);
  } else if (type === 'bull' || type === 'chariot') {
    kl = `u|${rk}|${face}|${telegraph ? 1 : 0}`;
    stamp(cached(kl) || bake(kl, r, box, () => paintBull(L, r, face, telegraph)), 0, 0);
    // струйка дыма с кончика сигареты
    const [cx0, cy0, len, ang] = cigarette(r, face), tx = cx0 + Math.cos(ang) * len, ty = cy0 + Math.sin(ang) * len;
    ctx.strokeStyle = hexA(C.stone, 0.6); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(tx, ty);
    for (let i = 1; i <= 6; i++) ctx.lineTo(tx + Math.sin(t * 3 + i) * r * 0.12 + face * i * r * 0.04, ty - i * r * 0.22);
    ctx.stroke();
  } else if (type === 'hunter') {
    kl = `h|${rk}|${face}`;
    stamp(cached(kl) || bake(kl, r, box, () => paintHunter(L, r, face)), 0, 0);
  } else if (type === 'zombie') {
    // при атаке (облако) жёлтый глаз раздувается и лопается брызгами; глазница пустая, потом глаз отрастает
    const ex = fx - r * 0.3, ey = -r * 0.2, er = r * 0.24;
    const eye = sa >= 0 && sa < 0.15 ? 'x' : sa >= 0.15 && sa < 3.6 ? (sa >= 0.8 && sa <= 2.6 ? 'd' : 's') : 'n';
    const mq = frameAt(t * 2, TAU, MOUTH_FRAMES);
    kl = `z|${rk}|${face}|${eye}|${mq}`;
    stamp(cached(kl) || bake(kl, r, box, () => paintZombie(L, r, face, eye, mq)), 0, 0);
    if (eye === 'x') glowEye(ex, ey, er * (1 + 0.7 * sa / 0.15), L.eye);
    else if (eye === 's' && sa < 0.8) {
      const k = (sa - 0.15) / 0.65;
      for (let i = 0; i < 8; i++) {
        const ang = i / 8 * TAU + 0.4, d = er * (1 + k * 4);
        ctx.globalAlpha = 1 - k; ctx.fillStyle = i % 2 ? L.eye : C.olive;
        ell(ex + Math.cos(ang) * d, ey + Math.sin(ang) * d + k * k * r * 0.8, er * 0.35 * (1 - k * 0.5), er * 0.35 * (1 - k * 0.5)); ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (eye === 's') glowEye(ex, ey, er * (sa - 2.6), L.eye);
  } else if (type === 'scorpion') {
    // громила с одной огромной лапой: ей бьёт вплотную (pinchFx) и замахивается, бросая гарпун (выстрел)
    kl = `c|${rk}|${face}|${armOut ? 1 : 0}`;
    stamp(cached(kl) || bake(kl, r, box, () => paintScorpion(L, r, face, !!armOut)), 0, 0);
    if (!armOut) {
      if (e.pinchFx > 0) paintArm(L, r, face, 0, e.pinchFx / 0.2);
      else {
        const bq = frameAt(t * 3, TAU, BOB_FRAMES), ka = `a|${rk}|${face}|${bq}`;
        stamp(cached(ka) || bake(ka, r, mirror(BOX.arm, face), () => paintArm(L, r, face, r * 0.3 + Math.sin(bq / BOB_FRAMES * TAU) * r * 0.05, 0)), 0, 0);
      }
    }
  }
  ctx.restore();
  ctx.lineCap = 'butt';
  // лапа Скорпиона летит на пружине к цели (гарпун) или тащит пойманного
  if (armOut) {
    const sx0 = x + face * r * 0.75, sy0 = y + r * 0.1, pf = armOut.x >= x ? 1 : -1;
    spring(sx0, sy0, armOut.x - pf * r * 0.3, armOut.y, r * 0.22);
    drawPaw(armOut.x - pf * r * 0.3, armOut.y, r * 0.5, pf, L);
  }

  if (e.hp < e.maxHp) {
    const top = y - ry - r * (type === 'bull' || type === 'chariot' ? 0.75 : type === 'scorpion' ? 0.5 : 0.35);
    hpBar(x, top - 8, r, e.hp / e.maxHp);
  }
}

// --- машины и громадины ---

function flashOver(rx, ry, flash) {
  if (flash > 0) { ctx.fillStyle = `rgba(255,250,240,${0.85 * flash})`; ctx.fillRect(-rx * 1.6, -ry * 1.6, rx * 3.2, ry * 3.2); }
}
function hurtFlash(a) {
  const ha = state.time - a.hurtAt;
  return ha >= 0 && ha < 0.1 ? 1 - ha / 0.1 : 0;
}

// Миномётчик (вместо катапульты, тип tower): красный одноглазый стрелок сидит на каменной платформе, из платформы
// сзади торчит мортира. Сам не ходит. Перед броском копит заряд (cd → 0): глаз разгорается и щурится, жерло светится;
// при броске — клуб дыма, отдача ствола, ком слизи уходит вверх
function drawCatapult(e, a) {
  const r = e.r * 1.2, t = state.time + a.seed, fl = hurtFlash(a), face = a.face, f = e.facing || 0;
  const since = state.time - a.atkAt;
  const charge = e.cd !== undefined && e.cd < 1 ? 1 - Math.max(0, e.cd) : 0;
  const shot = since >= 0 && since < 0.4 ? 1 - since / 0.4 : 0;
  ctx.fillStyle = 'rgba(20,10,5,0.5)'; ell(e.x, e.y + r * 0.85, r * 1.45, r * 0.38); ctx.fill();
  ctx.save(); ctx.translate(e.x, e.y);
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  // мортира за платформой: ствол вверх-назад, железные обручи, отдача при выстреле
  const rec = shot * r * 0.18;
  ctx.save(); ctx.translate(-face * r * 0.55, r * 0.05); ctx.rotate(-face * 0.5);
  ctx.fillStyle = '#45230d'; ctx.beginPath(); ctx.roundRect(-r * 0.36, -r * 1.25 + rec, r * 0.72, r * 1.3, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.stone;
  for (const k of [-0.95, -0.45]) { ctx.fillRect(-r * 0.38, k * r + rec, r * 0.76, r * 0.13); ctx.strokeRect(-r * 0.38, k * r + rec, r * 0.76, r * 0.13); }
  ell(0, -r * 1.25 + rec, r * 0.42, r * 0.15); ctx.fill(); ctx.stroke();
  const hot = Math.max(charge, shot);
  ctx.fillStyle = hot > 0 ? hexA(C.orange, 0.45 + 0.55 * hot) : C.dark; ell(0, -r * 1.25 + rec, r * 0.28, r * 0.09); ctx.fill();
  if (shot > 0) for (let i = 0; i < 5; i++) {
    const k = 1 - shot; ctx.globalAlpha = shot * 0.75; ctx.fillStyle = i % 2 ? C.stone : '#684c3c';
    ell((i - 2) * r * 0.22 * (1 + k), -r * (1.45 + k * 0.9) - (i % 2) * r * 0.15, r * (0.2 + k * 0.3), r * (0.17 + k * 0.25)); ctx.fill();
  }
  ctx.globalAlpha = 1;
  launchGlob(0, -r * 1.3, r, shot);
  ctx.restore();

  // каменная платформа: светлый верх, тёмная передняя грань, заклёпки
  ctx.fillStyle = '#684c3c';
  ctx.beginPath(); ctx.ellipse(0, r * 0.62, r * 1.25, r * 0.4, 0, 0, Math.PI); ctx.lineTo(-r * 1.25, r * 0.35);
  ctx.ellipse(0, r * 0.35, r * 1.25, r * 0.4, 0, Math.PI, 0, true); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.stone; ell(0, r * 0.35, r * 1.25, r * 0.4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#684c3c'; for (const k of [-0.8, 0, 0.8]) { ell(k * r, r * 0.68 + Math.abs(k) * -r * 0.08, r * 0.06, r * 0.06); ctx.fill(); }

  // сам стрелок: тёмно-красный слизистый блоб с одним большим глазом, сидит на платформе
  const w = Math.sin(t * 4), bx = 0, by = -r * 0.05;
  const rx = r * 0.78 * (1 + 0.04 * w + 0.12 * shot), ry = r * 0.72 * (1 - 0.04 * w - 0.12 * shot + 0.06 * charge);
  ctx.save(); ctx.translate(bx, by);
  edgePath(rx, ry, t, 'wobble', a.seed); ctx.fillStyle = '#550f0a'; ctx.fill();
  ctx.save(); edgePath(rx, ry, t, 'wobble', a.seed); ctx.clip();
  ctx.fillStyle = '#9b1a0a'; ell(-rx * 0.05, -ry * 0.12, rx * 0.92, ry * 0.85); ctx.fill();
  ctx.strokeStyle = hexA(C.gold, 0.35); ctx.lineWidth = r * 0.2; ell(0, -r * 0.15, rx * 1.02, ry); ctx.stroke();
  flashOver(rx, ry, fl);
  ctx.restore();
  edgePath(rx, ry, t, 'wobble', a.seed); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke();
  const ex = face * r * 0.12, ey = -r * 0.12, er = r * (0.34 + 0.06 * charge);
  glowEye(ex, ey, er, charge > 0.4 ? C.cream : C.gold, 0, 1 - 0.45 * charge);
  ctx.fillStyle = C.ink; ell(ex + Math.cos(f) * er * 0.25, ey + Math.sin(f) * er * 0.2, er * 0.25, er * 0.75 * (1 - 0.45 * charge)); ctx.fill();
  if (charge > 0.3) { ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(ex - er * 1.1, ey - er * 1.1); ctx.lineTo(ex + er * 1.1, ey - er * 0.8); ctx.stroke(); }
  ctx.restore();
  ctx.restore(); ctx.lineCap = 'butt';
}

// летящий снаряд в момент броска: ком слизи с глазом уходит вверх из точки (x, y)
function launchGlob(x, y, r, shot) {
  if (shot <= 0.25) return;
  const k = 1 - shot, gy = y - k * r * 2.2;
  ctx.fillStyle = '#550f0a'; ell(x, gy, r * 0.24, r * 0.24); ctx.fill(); ctx.stroke();
  glowEye(x, gy, r * 0.09, C.red);
}

// мина: тёмный колючий комок, наполовину в земле, красный глаз часто мигает
function drawMine(m, a) {
  const r = m.r, t = state.time + a.seed;
  ctx.fillStyle = 'rgba(20,10,5,0.6)'; ell(m.x, m.y + r * 0.3, r * 1.25, r * 0.6); ctx.fill();
  ctx.save(); ctx.translate(m.x, m.y);
  ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.fillStyle = C.stone;
  for (let i = 0; i < 8; i++) {
    const ang = i / 8 * TAU + 0.2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(ang - 0.3) * r * 0.65, Math.sin(ang - 0.3) * r * 0.6);
    ctx.lineTo(Math.cos(ang) * r * 1.2, Math.sin(ang) * r * 1.1);
    ctx.lineTo(Math.cos(ang + 0.3) * r * 0.65, Math.sin(ang + 0.3) * r * 0.6);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  edgePath(r * 0.72, r * 0.66, t, 'wobble', a.seed); ctx.fillStyle = '#36170c'; ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
  if (Math.sin(t * 9) > -0.3) glowEye(0, -r * 0.05, r * 0.24, C.red);
  ctx.restore();
}

// портал: тёмный водоворот с красными рукавами стоит в каменной арке (колонны, свод из 9 камней, порог).
// Перед выходом врага ядро разгорается, изнутри глядят глаза, руна на замковом камне светится.
// Урон виден: из свода выпадают камни (до 5), их обломки лежат у порога; при попадании — вспышка и осколки
const p2 = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); };
function portalRune(x, y, s, soon) {
  if (soon > 0) glow(ctx, x, y, s * 2.5, C.red, 0.5 * soon);
  ctx.strokeStyle = soon > 0.1 ? C.orange : '#9b1a0a'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(x, y, s * 0.6, 0, TAU); ctx.moveTo(x, y - s); ctx.lineTo(x, y + s); ctx.stroke();
  ctx.lineCap = 'butt';
}
function portalRubble(x, y, n, seed) {
  ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5;
  for (let i = 0; i < n; i++) {
    const px = x + (p2(i, seed) - 0.5) * 26, py = y + (p2(i, seed + 1) - 0.5) * 12, rx = 3.5 + p2(i, seed + 3) * 3, ry = 2.5 + p2(i, seed + 4) * 2;
    ctx.fillStyle = p2(i, seed + 2) > 0.5 ? '#684c3c' : C.stone;
    ctx.beginPath();
    for (let k = 0; k < 6; k++) { const ang = k / 6 * TAU, q = 0.75 + 0.5 * p2(k, seed + i); ctx.lineTo(px + Math.cos(ang) * rx * q, py + Math.sin(ang) * ry * q); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
}
function portalSwirl(r, age, soon) {
  ctx.fillStyle = '#300f0a'; ell(0, 0, r, r); ctx.fill();
  ctx.lineCap = 'round';
  for (let arm = 0; arm < 3; arm++) {
    for (const [lw, col] of [[r * 0.2, '#550f0a'], [r * 0.08, '#9b1a0a']]) {
      ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath();
      for (let k = 0; k <= 20; k++) {
        const q = k / 20, ang = arm / 3 * TAU - age * 1.5 + q * 3.2, rr = r * (0.15 + 0.9 * q);
        if (k) ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr); else ctx.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
      }
      ctx.stroke();
    }
  }
  ctx.lineCap = 'butt';
  const core = r * (0.22 + 0.04 * Math.sin(age * 3) + soon * 0.15);
  glow(ctx, 0, 0, core * 2, '#ef692f', 0.6 + soon * 0.4, 0, '#ef3a0c');
}
function drawPortal(e, a) {
  const k = e.r / 46, age = e.age || 0, fl = hurtFlash(a), hp = Math.max(0, e.hp / e.maxHp);
  const soon = e.spawnIn < 1.5 ? 1 - Math.max(0, e.spawnIn) / 1.5 : 0;
  glow(ctx, e.x, e.y, e.r * 2.4, '#9b1a0a', 0.3, 0.25);
  ctx.save(); ctx.translate(e.x, e.y); ctx.scale(k, k);
  const baseY = 16, colH = 56, R0 = 40, R1 = 58, cyA = baseY - colH;
  // порог
  ctx.fillStyle = 'rgba(20,10,5,0.45)'; ell(0, baseY + 4, 74, 18); ctx.fill();
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5;
  ctx.fillStyle = '#45230d'; ctx.beginPath(); ctx.roundRect(-66, baseY - 8, 132, 14, 5); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.stone; ctx.beginPath(); ctx.roundRect(-66, baseY - 12, 132, 8, 4); ctx.fill(); ctx.stroke();
  // проём с водоворотом
  const inner = () => { ctx.beginPath(); ctx.moveTo(-R0, baseY - 10); ctx.lineTo(-R0, cyA); ctx.arc(0, cyA, R0, Math.PI, 0); ctx.lineTo(R0, baseY - 10); ctx.closePath(); };
  ctx.save(); inner(); ctx.clip();
  ctx.save(); ctx.translate(0, cyA + 10); ctx.scale(1, (colH + R0) * 0.62 / (R0 + 6)); portalSwirl(R0 + 6, age, soon); ctx.restore();
  if (soon > 0.2) {
    ctx.globalAlpha = Math.min(1, (soon - 0.2) * 2);
    for (let i = 0; i < 3; i++) {
      const ang = i * 2.1 + 0.5;
      for (const s of [-1, 1]) glowEye(Math.cos(ang) * 25 + s * 3.2, cyA + 10 + Math.sin(ang) * 33, 2.2, C.gold);
    }
    ctx.globalAlpha = 1;
  }
  flashOver(R0 * 1.6, colH + R0, fl);
  ctx.restore();
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; inner(); ctx.stroke();
  // колонны
  for (const sx of [-1, 1]) {
    const cx = sx * (R0 + 9);
    ctx.fillStyle = '#684c3c'; ctx.beginPath(); ctx.rect(cx - 9, cyA, 18, colH - 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(20,10,5,0.25)'; ctx.fillRect(cx + (sx > 0 ? 2 : -9), cyA, 7, colH - 2);
    ctx.strokeStyle = hexA(C.ink, 0.5); ctx.lineWidth = 1.5;
    for (let n = 1; n < 4; n++) { ctx.beginPath(); ctx.moveTo(cx - 9, cyA + n * 14); ctx.lineTo(cx + 9, cyA + n * 14); ctx.stroke(); }
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5;
  }
  // свод из 9 камней: с уроном выпадают по одному
  const miss = new Set([3, 6, 1, 7, 2].slice(0, Math.round((1 - hp) * 5)));
  for (let n = 0; n < 9; n++) {
    if (miss.has(n)) continue;
    const a0 = Math.PI + n / 9 * Math.PI, a1 = Math.PI + (n + 1) / 9 * Math.PI;
    ctx.fillStyle = n === 4 ? '#45230d' : '#684c3c';
    ctx.beginPath(); ctx.arc(0, cyA, R1, a0, a1); ctx.arc(0, cyA, R0, a1, a0, true); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.stone;
    ctx.beginPath(); ctx.arc(0, cyA, R1, a0, a1); ctx.arc(0, cyA - 5, R1, a1, a0, true); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  portalRune(0, cyA - (R0 + R1) / 2, 5, soon);
  [...miss].forEach((n, i) => portalRubble((i % 2 ? 1 : -1) * (60 + i * 6), baseY + 10, 5, n * 13));
  // осколки от попадания
  const ha = state.time - a.hurtAt;
  if (ha >= 0 && ha < 0.6) {
    const q = ha / 0.6;
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
      const ang = i / 5 * TAU + a.seed, d = 40 * (0.5 + 0.8 * p2(i, a.seed)) * q;
      ctx.fillStyle = i % 2 ? C.stone : '#684c3c';
      ctx.save(); ctx.translate(Math.cos(ang) * d, cyA + Math.sin(ang) * d * 0.6 - Math.sin(q * Math.PI) * 18); ctx.rotate(q * 6 + i);
      ctx.beginPath(); ctx.moveTo(-4, -3); ctx.lineTo(4, -4); ctx.lineTo(5, 3); ctx.lineTo(-3, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
}

const SPECIAL = { tower: drawCatapult, mine: drawMine, portal: drawPortal };

function drawSpecial(e) {
  const a = track(e);
  SPECIAL[e.type](e, a);
  if (e.type !== 'mine' && e.hp < e.maxHp) hpBar(e.x, e.y - e.r * (e.type === 'portal' ? 2.4 : 1.3) - 8, Math.min(e.r, 40), e.hp / e.maxHp);
}

// Демон — Пасть: тёмно-красная голова парит над полом (под ней тёмный дым), почти вся — пасть с клыками,
// над пастью россыпь глаз, на спине гребень шипов. Глаза моргают каждый в своём ритме; урон выбивает их
// по одному (тёмная глазница с трещинками и потёком). Замах виден по телу (k — доля замаха 0..1):
//  обстрел — шипы топорщатся, дрожат и раскаляются, при выстреле улетают (снаряды-шипы рисует сцена) и отрастают;
//  большой снаряд — надувается, щёки светятся, потом разевает пасть; луч — пасть открывается и светится,
//  пока растёт огонь — изо рта бьёт струя; подкрепление — пасть открывается; таран — глаза красные и щурятся,
//  пасть разинута, в конце броска захлопывается.
const MAW_EYES = [[-0.6, -0.42, 0.1], [-0.3, -0.6, 0.13], [0.05, -0.66, 0.16], [0.4, -0.55, 0.12], [0.66, -0.34, 0.08], [-0.78, -0.18, 0.07], [0.22, -0.32, 0.07]];
const MAW_KNOCK = [4, 1, 6, 3, 0, 5];                       // порядок, в котором урон выбивает глаза
const MAW_SPIKES = [-2.75, -2.45, -2.15, -1.85, -1.55, -1.25, -0.95, -0.65].map((ang, i) => [ang, 0.42 + 0.16 * Math.sin(i / 7 * Math.PI)]);
const MAW_SHOT = [3, 4, 2, 5, 1, 6, 0, 7];                  // какие шипы улетают первыми
const p01 = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); };
function mawBlink(t, i) {
  const per = 2.6 + p01(i, 7) * 2.4, ph = (t + p01(i, 8) * per) % per;
  return ph < 0.16 ? Math.abs(Math.cos(ph / 0.16 * Math.PI)) : 1;
}
function mawSocket(x, y, rr) {
  ctx.fillStyle = C.dark; ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ell(x, y, rr * 1.25, rr * 1.1); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(8,5,2,0.8)'; ell(x + rr * 0.15, y + rr * 0.15, rr * 0.8, rr * 0.7); ctx.fill();
  ctx.lineWidth = 1.5; ctx.beginPath();
  ctx.moveTo(x - rr * 1.2, y - rr * 0.5); ctx.lineTo(x - rr * 1.8, y - rr * 0.9);
  ctx.moveTo(x + rr * 1.1, y - rr * 0.7); ctx.lineTo(x + rr * 1.6, y - rr * 1.3); ctx.lineTo(x + rr * 1.9, y - rr * 1.2); ctx.stroke();
  ctx.fillStyle = '#9b1a0a'; ctx.beginPath(); ctx.moveTo(x - rr * 0.35, y + rr * 0.9); ctx.quadraticCurveTo(x - rr * 0.4, y + rr * 2.2, x - rr * 0.1, y + rr * 2.4);
  ctx.quadraticCurveTo(x + rr * 0.2, y + rr * 2.2, x + rr * 0.15, y + rr * 0.9); ctx.closePath(); ctx.fill();
}
// шип: основание в (0, 0), остриё вверх на len; glow — раскалённый кончик
function mawSpike(len, w, glow) {
  ctx.fillStyle = '#300f0a'; ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(-w, 0); ctx.quadraticCurveTo(-w * 0.4, -len * 0.5, 0, -len); ctx.quadraticCurveTo(w * 0.5, -len * 0.5, w, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#550f0a'; ctx.beginPath(); ctx.moveTo(w * 0.2, -len * 0.1); ctx.quadraticCurveTo(w * 0.45, -len * 0.5, 0, -len * 0.95);
  ctx.quadraticCurveTo(w * 0.15, -len * 0.5, w * 0.6, -len * 0.05); ctx.closePath(); ctx.fill();
  ctx.fillStyle = glow > 0.1 ? (glow > 0.6 ? C.gold : C.orange) : C.cream;
  ctx.beginPath(); ctx.moveTo(-w * 0.32, -len * 0.68); ctx.lineTo(0, -len); ctx.lineTo(w * 0.32, -len * 0.68); ctx.closePath(); ctx.fill();
  if (glow > 0.1) G.shapes.glow(ctx, 0, -len, w * 3, C.red, 0.5 * glow);
}
function mawFang(x, y, w, h, dir) { ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x, y + h * dir); ctx.lineTo(x + w / 2, y); ctx.closePath(); ctx.fill(); ctx.stroke(); }
// e — Демон, k — доля замаха текущей атаки (0..1)
function maw(e, k) {
  const a = track(e), r = e.r, now = state.time, t = now + a.seed, fl = hurtFlash(a);
  // переходы между состояниями: когда что выстрелило (свой кэш, состояние игры только читается)
  if (a.mState !== e.state) {
    if (a.mState === 'telegraph') {
      if (a.mAttack === 'barrage') { a.shotAt = now; a.shotN = state.projectiles.filter((p) => p.kind === 'mortar' && p.owner === e && p.t < 0.15).length; }
      if (a.mAttack === 'mega') a.megaAt = now;
      if (a.mAttack === 'summon') a.summonAt = now;
    }
    if (a.mState === 'beamFire') a.beamEndAt = now;
    if (a.mState === 'ram') a.snapAt = now;
    a.mState = e.state;
  }
  a.mAttack = e.attack;
  const st = e.state, att = e.attack, since = (at) => (at === undefined ? 99 : now - at);
  const angry = st === 'ramAim' || st === 'ram';
  // насколько открыта пасть
  let open = 0.14 + 0.04 * Math.sin(t * 1.5), swell = 1;
  if (st === 'telegraph' && att === 'barrage') open = 0.14 + 0.12 * k;
  if (st === 'telegraph' && att === 'mega') { open = 0.04; swell = 1 + 0.16 * k; }
  if (st === 'telegraph' && att === 'summon') open = 0.14 + 0.6 * k;
  if (st === 'beamAim') open = 0.15 + 0.45 * k;
  if (st === 'beamFire') open = 0.62;
  if (st === 'ramAim') open = 0.25 + 0.55 * k;
  if (st === 'ram') open = 0.85;
  if (st === 'idle') {
    const m = since(a.megaAt), su = since(a.summonAt), be = since(a.beamEndAt), sn = since(a.snapAt);
    if (m < 1) open = Math.max(open, m < 0.35 ? 0.85 : 0.85 - (m - 0.35) * 1.2);
    if (su < 1.4) open = Math.max(open, su < 0.6 ? 0.75 : 0.75 - (su - 0.6));
    if (be < 0.6) open = Math.max(open, 0.62 - be);
    if (sn < 0.35) open = 0.04;
  }
  const bob = Math.sin(t * 2) * 5;
  // тень на полу и тёмный дым снизу
  ctx.fillStyle = 'rgba(20,10,5,0.45)'; ell(e.x, e.y + r * 1.0, r * 0.9 - bob, r * 0.24); ctx.fill();
  for (let i = 0; i < 4; i++) {
    const q = (t * 0.7 + i / 4) % 1;
    ctx.globalAlpha = 0.5 * (1 - q); ctx.fillStyle = '#300f0a';
    ell(e.x + (i - 1.5) * r * 0.3, e.y + r * (0.65 + q * 0.3) + bob, r * 0.2 * (1 - q * 0.5), r * 0.12); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.save(); ctx.translate(e.x, e.y + bob); ctx.scale(swell, swell);
  ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.lineJoin = 'round';
  const cy = open * r * 0.28, ry = r * (0.86 + open * 0.32);
  // шипы на спине
  const fired = new Set(MAW_SHOT.slice(0, Math.min(8, a.shotN || 0))), ss = since(a.shotAt);
  MAW_SPIKES.forEach(([ang, L], i) => {
    let len = 1, glow = 0, jit = 0;
    if (st === 'telegraph' && att === 'barrage') { len = 1 + 0.3 * k; glow = k; jit = Math.sin(t * 60 + i * 2) * 0.05 * k; }
    else if (fired.has(i) && ss < 2) len = ss < 1.3 ? 0 : (ss - 1.3) / 0.7;
    const bx = Math.cos(ang) * r * 1.02, by = cy + Math.sin(ang) * ry * 0.98;
    if (len <= 0.02) { ctx.fillStyle = C.dark; ell(bx, by, r * 0.07, r * 0.05, ang); ctx.fill(); return; }
    ctx.save(); ctx.translate(bx, by); ctx.rotate(ang + Math.PI / 2 + jit); mawSpike(r * L * len, r * 0.11, glow); ctx.restore();
  });
  // голова: при открытой пасти вытягивается вниз
  ctx.save(); ctx.translate(0, cy);
  edgePath(r * 1.12, ry, t, 'wobble', a.seed); ctx.fillStyle = '#300f0a'; ctx.fill();
  ctx.save(); edgePath(r * 1.12, ry, t, 'wobble', a.seed); ctx.clip();
  ctx.fillStyle = '#550f0a'; ell(-r * 0.09, -ry * 0.12, r * 1.0, ry * 0.84); ctx.fill();
  ctx.fillStyle = 'rgba(239,216,161,0.12)'; ell(-r * 0.4, -ry * 0.45, r * 0.4, ry * 0.2, -0.4); ctx.fill();
  if (swell > 1) { ctx.fillStyle = hexA(C.orange, 0.3 * k); ctx.fillRect(-r * 1.5, -ry * 1.5, r * 3, ry * 3); }
  flashOver(r * 1.12, ry, fl);
  ctx.restore();
  edgePath(r * 1.12, ry, t, 'wobble', a.seed); ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.stroke();
  ctx.restore();
  // щёки светятся перед большим снарядом
  if (swell > 1) for (const s of [-1, 1]) { ctx.fillStyle = hexA(C.orange, 0.35 * k); ell(s * r * 0.7, r * 0.15, r * 0.25 * k + 1, r * 0.2 * k + 1); ctx.fill(); }
  // пасть
  const ty = r * 0.05, by = ty + open * r * 1.25, mw = r * 0.88;
  const mouth = () => {
    ctx.beginPath(); ctx.moveTo(-mw, ty - r * 0.06); ctx.quadraticCurveTo(0, ty + r * 0.2, mw, ty - r * 0.06);
    ctx.quadraticCurveTo(mw * 0.6, by + r * 0.1, 0, by + r * 0.12); ctx.quadraticCurveTo(-mw * 0.6, by + r * 0.1, -mw, ty - r * 0.06); ctx.closePath();
  };
  ctx.fillStyle = C.dark; mouth(); ctx.fill();
  ctx.save(); mouth(); ctx.clip();
  const hot = st === 'beamAim' ? k : st === 'beamFire' ? 1 : st === 'idle' && since(a.megaAt) < 0.5 ? 1 : 0;
  if (hot > 0) glow(ctx, 0, (ty + by) / 2, r * 0.8, C.gold, 0.85 * hot, 0, C.red);
  ctx.fillStyle = '#9b1a0a'; ell(r * 0.1, by + r * 0.05, r * 0.42, r * 0.2 + open * r * 0.1); ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; mouth(); ctx.stroke();
  ctx.fillStyle = C.cream; ctx.lineWidth = 1.5;
  for (let i = 0; i < 9; i++) {
    const q = (i + 0.5) / 9, big = i === 2 || i === 6;
    mawFang(-mw + q * mw * 2, ty - r * 0.06 + Math.sin(q * Math.PI) * r * 0.13, r * (big ? 0.2 : 0.16), r * (big ? 0.32 : 0.18), 1);
  }
  for (let i = 0; i < 8; i++) {
    const q = (i + 0.5) / 8, yy = by + r * 0.12 - Math.sin(q * Math.PI) * r * 0.02 - (1 - Math.sin(q * Math.PI)) * r * 0.08;
    mawFang(-mw * 0.85 + q * mw * 1.7, yy, r * 0.15, r * (i === 1 || i === 6 ? 0.24 : 0.14), -1);
  }
  // глаза: выбитые уроном и целые (моргают, перед тараном красные и щурятся)
  const knocked = new Set(MAW_KNOCK.slice(0, Math.round((1 - Math.max(0, e.hp) / e.maxHp) * 7)));
  MAW_EYES.forEach(([ex, ey, er], i) => {
    const x = ex * r, y = ey * r, rr = er * r;
    if (knocked.has(i)) { mawSocket(x, y, rr); return; }
    const op = angry ? 0.6 : mawBlink(t, i);
    if (op < 0.15) {
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x - rr * 1.2, y); ctx.quadraticCurveTo(x, y + rr * 0.5, x + rr * 1.2, y); ctx.stroke();
      return;
    }
    glowEye(x, y, rr, angry ? C.red : C.gold, 0, op);
    if (op < 0.95) {
      ctx.save(); ell(x, y, rr * 1.35, rr * 1.35); ctx.clip();
      ctx.fillStyle = '#300f0a'; ctx.fillRect(x - rr * 1.4, y - rr * 1.4, rr * 2.8, rr * 1.4 * (1 - op));
      ctx.restore();
    }
  });
  ctx.restore();
  // струя огня изо рта, пока растёт луч
  if (st === 'beamFire' && e.beam) {
    const mx = e.x, my = e.y + bob + (ty + by) / 2 * swell, d = e.beam.dir, L = Math.min(e.beam.len, r * 1.6);
    const ex2 = mx + Math.cos(d) * L, ey2 = my + Math.sin(d) * L * 0.6 + (e.y - my) * 0.6;
    ctx.strokeStyle = hexA(C.orange, 0.8); ctx.lineCap = 'round'; ctx.lineWidth = r * 0.3;
    ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(ex2, ey2); ctx.stroke();
    ctx.strokeStyle = hexA(C.gold, 0.9); ctx.lineWidth = r * 0.14; ctx.stroke(); ctx.lineCap = 'butt';
  }
}

// снаряд обстрела Демона — шип: остриём по ходу полёта
function mawSpikeShot(x, y, ang, s) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang + Math.PI / 2); mawSpike(s * 3.2, s * 0.9, 0.7); ctx.restore();
}

// тело Спрута: шевелящиеся щупальца с присосками, тёмно-бирюзовый колышущийся блоб, светящиеся глаза над пастью,
// круглая пасть с зубами (mouth — её радиус). swell — вспухание после глотка или пука, col — цвет тела
function kraken(e, swell, col, mouth) {
  const a = track(e), r = e.r, t = state.time + a.seed, fl = hurtFlash(a), age = e.age || 0;
  ctx.save(); ctx.translate(e.x, e.y);
  ctx.lineCap = 'round';
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * TAU + 0.2, wob = Math.sin(age * 2.2 + i * 1.7) * 0.5;
    const x0 = Math.cos(ang) * r * 0.8, y0 = Math.sin(ang) * r * 0.8;
    const x1 = Math.cos(ang + wob * 0.4) * r * 1.45, y1 = Math.sin(ang + wob * 0.4) * r * 1.45;
    const x2 = Math.cos(ang + wob) * r * 1.8, y2 = Math.sin(ang + wob) * r * 1.8;
    for (const [lw, c] of [[16, C.ink], [11, '#276468']]) {
      ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x1, y1, x2, y2); ctx.stroke();
    }
    ctx.fillStyle = C.cream;
    for (const q of [0.55, 0.8]) {
      const bx = (1 - q) * (1 - q) * x0 + 2 * (1 - q) * q * x1 + q * q * x2, by = (1 - q) * (1 - q) * y0 + 2 * (1 - q) * q * y1 + q * q * y2;
      ell(bx, by, 2, 2); ctx.fill();
    }
  }
  const rx = r * swell, ry = r * swell * 0.95;
  edgePath(rx, ry, t, 'wobble', a.seed); ctx.fillStyle = '#183f39'; ctx.fill();
  ctx.save(); edgePath(rx, ry, t, 'wobble', a.seed); ctx.clip();
  ctx.fillStyle = col; ell(-rx * 0.05, -ry * 0.12, rx * 0.92, ry * 0.85); ctx.fill();
  ctx.strokeStyle = hexA(C.gold, 0.3); ctx.lineWidth = r * 0.2; ell(0, -r * 0.18, rx * 1.02, ry); ctx.stroke();
  flashOver(rx, ry, fl);
  ctx.restore();
  edgePath(rx, ry, t, 'wobble', a.seed); ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.stroke();
  for (const [ex, ey, er] of [[-0.42, -0.55, 0.13], [0.42, -0.55, 0.13], [-0.18, -0.72, 0.09], [0.18, -0.72, 0.09]]) glowEye(ex * r, ey * r, er * r, C.gold);
  ctx.fillStyle = C.dark; ell(0, r * 0.08, mouth, mouth); ctx.fill(); ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = C.cream;
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * TAU + age * 0.3;
    ctx.beginPath();
    ctx.moveTo(Math.cos(ang - 0.15) * mouth, r * 0.08 + Math.sin(ang - 0.15) * mouth);
    ctx.lineTo(Math.cos(ang + 0.15) * mouth, r * 0.08 + Math.sin(ang + 0.15) * mouth);
    ctx.lineTo(Math.cos(ang) * mouth * 0.6, r * 0.08 + Math.sin(ang) * mouth * 0.6);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore(); ctx.lineCap = 'butt';
}

// проглатываемый дружочек: персиковый комок, сжимается по дороге в пасть
function swallowed(x, y, r) {
  ctx.fillStyle = '#efb775'; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5;
  ell(x, y, r, r * 0.95); ctx.fill(); ctx.stroke();
}

// погибшие с прошлого кадра лопаются тёмными кусочками
function sweep() {
  const now = new Set();
  for (const e of state.enemies) if (LOOK[e.type]) now.add(e);
  for (const e of lastDrawn) if (!now.has(e) && e.hp <= 0) G.blobs.pop(e, LOOK[e.type].col, LOOK[e.type].sh);
  lastDrawn = now;
}

// kit — приёмы рисования тёмной расы для render/ambushart.js (колышущийся край, светящийся глаз, звёздочка, полоска HP)
G.foes = { has, draw, drawsHook, farPoint, sweep, maw, mawSpikeShot, kraken, swallowed, kit: { ell, hexA, edgePath, glowEye, star, hpBar } };
})(window.Game = window.Game || {});
