// Обычные враги — другая раса, чем свои (graphics.md): тёмные тела с колышущимся краем, светящиеся глаза
// без белков, вместо рук — лапы, клешни, хвост, рога, ствол. Рисует Стрелка, Бычка, Колесницу, Скорпиона,
// Зомби и Хантера; остальных (катапульта, порталы, боссы, турели, мины) по-прежнему рисуют их записи в реестре.
// Анимация выводится из изменений врага между кадрами (свой кэш, состояние игры только читается).
(function (G) {
'use strict';

const { state } = G;
const { ctx } = G.shapes;

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
  hunter: { col: '#550f0a', sh: '#300f0a', eye: C.gold, edge: 'spiky' },
  zombie: { col: '#39571c', sh: '#1f240a', eye: C.gold, edge: 'drip' },
  scorpion: { col: '#724113', sh: '#36170c', eye: C.red, edge: 'wobble' },
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
    let k = 1 + 0.05 * Math.sin(3 * ang + t * 3 + seed) + 0.035 * Math.sin(5 * ang - t * 4.3 + seed);
    if (kind === 'spiky') k += i % 2 ? -0.1 : 0.16;
    if (kind === 'drip') { const s = Math.sin(ang); if (s > 0.3) k += 0.1 * Math.max(0, Math.sin(ang * 9 + t * 1.5 + seed)) * s; }
    const x = Math.cos(ang) * rx * k, y = Math.sin(ang) * ry * k;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

// светящийся глаз без белка: ореол, тёмная глазница, цветная радужка, блик
function glowEye(x, y, rad, col, rot = 0, squash = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, rad * 2.8);
  g.addColorStop(0, hexA(col, 0.5));
  g.addColorStop(1, hexA(col, 0));
  ctx.fillStyle = g; ell(x, y, rad * 2.8, rad * 2.8); ctx.fill();
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

function has(type) { return !!LOOK[type]; }

function draw(e) {
  const L = LOOK[e.type], a = track(e), t = state.time + a.seed, r = e.r, face = a.face, type = e.type;
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

  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  // хвост Скорпиона и лапки
  if (type === 'scorpion') {
    const segs = 5;
    for (let i = segs; i >= 1; i--) {
      const k = i / segs, ang = Math.PI * (0.15 + 0.75 * k), sw = Math.sin(t * 3 + i * 0.5) * 0.1;
      const px = -face * Math.cos(ang + sw) * r * 1.2, py = r * 0.1 - Math.sin(ang + sw) * r * 1.25;
      ctx.fillStyle = i % 2 ? L.col : L.sh; ell(px, py, r * (0.3 - k * 0.08), r * (0.3 - k * 0.08)); ctx.fill(); ctx.stroke();
      if (i === segs) {
        ctx.fillStyle = C.red; ctx.beginPath(); ctx.moveTo(px - face * r * 0.1, py - r * 0.2); ctx.lineTo(px + face * r * 0.45, py - r * 0.05);
        ctx.lineTo(px, py + r * 0.15); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
  }
  if (type !== 'shooter' && type !== 'zombie') {
    const n = type === 'scorpion' ? 3 : 2, fast = a.speed > 10;
    ctx.fillStyle = L.sh;
    for (let i = 0; i < n; i++) for (const s of [-1, 1]) {
      const lift = fast ? Math.max(0, Math.sin(a.ph * 2.5 + i + (s > 0 ? Math.PI : 0))) * r * 0.14 : 0;
      ell(s * r * (0.35 + i * 0.3) * (type === 'scorpion' ? 1.2 : 1), r * 0.75 - lift, r * 0.18, r * 0.14); ctx.fill(); ctx.stroke();
    }
  }

  // тело: тёмная тень, цвет, подсветка снизу цветом глаз
  edgePath(rx, ry, t, L.edge, a.seed); ctx.fillStyle = L.sh; ctx.fill();
  ctx.save();
  edgePath(rx, ry, t, L.edge, a.seed); ctx.clip();
  ctx.fillStyle = telegraph ? '#ab5c1c' : L.col; ell(-rx * 0.05, -ry * 0.12, rx * 0.92, ry * 0.85); ctx.fill();
  ctx.strokeStyle = hexA(L.eye, telegraph ? 0.6 : 0.35); ctx.lineWidth = r * 0.24; ell(0, -r * 0.18, rx * 1.02, ry); ctx.stroke();
  if (type === 'scorpion') {
    ctx.strokeStyle = L.sh; ctx.lineWidth = r * 0.1;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-face * r * 0.4, 0, r * (0.45 + i * 0.3), -1.1, 1.1); ctx.stroke(); }
  }
  if (type === 'zombie') { ctx.fillStyle = C.olive; ell(-rx * 0.45, ry * 0.3, rx * 0.2, ry * 0.12); ctx.fill(); ell(rx * 0.5, -ry * 0.45, rx * 0.12, ry * 0.08); ctx.fill(); }
  if (flash > 0) { ctx.fillStyle = `rgba(255,250,240,${0.9 * flash})`; ctx.fillRect(-rx * 1.5, -ry * 1.5, rx * 3, ry * 3); }
  ctx.restore();
  edgePath(rx, ry, t, L.edge, a.seed); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke();

  if (type === 'zombie') for (let i = 0; i < 2; i++) {
    const k = (t * 0.6 + i * 0.5) % 1, px = (i ? 0.35 : -0.25) * rx;
    ctx.globalAlpha = 1 - k; ctx.fillStyle = L.col; ell(px, ry * 0.95 + k * r * 0.5, r * 0.1, r * 0.13); ctx.fill(); ctx.stroke(); ctx.globalAlpha = 1;
  }

  // лицо: зрачки и глаза смотрят туда, куда смотрит враг
  const fx = face * r * 0.22;
  if (type === 'shooter') {
    const f = e.facing || 0;
    glowEye(fx * 0.6, -r * 0.2, r * 0.36, L.eye);
    ctx.fillStyle = C.ink; ell(fx * 0.6 + Math.cos(f) * r * 0.1, -r * 0.2 + Math.sin(f) * r * 0.08, r * 0.09, r * 0.27); ctx.fill();
    const rec = sa >= 0 && sa < 0.12 ? -r * 0.15 : 0;
    ctx.save(); ctx.scale(face, 1);
    ctx.fillStyle = L.sh; ctx.beginPath(); ctx.roundRect(r * 0.65 + rec, r * 0.05, r * 0.65, r * 0.42, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.dark; ell(r * 1.3 + rec, r * 0.26, r * 0.1, r * 0.2); ctx.fill(); ctx.stroke();
    if (sa >= 0 && sa < 0.12) star(r * 1.55, r * 0.26, r * 0.38, C.orange);
    ctx.restore();
  } else if (type === 'bull' || type === 'chariot') {
    for (const s of [-1, 1]) glowEye(fx + s * r * 0.33, -r * 0.2, r * 0.16, telegraph ? C.gold : L.eye, s * face * 0.5, 0.45);
    ctx.fillStyle = L.sh; ell(fx + face * r * 0.2, r * 0.32, r * 0.42, r * 0.24); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.dark; for (const s of [-1, 1]) { ell(fx + face * r * 0.2 + s * r * 0.15, r * 0.32, r * 0.06, r * 0.08); ctx.fill(); }
    const k = (t * (telegraph ? 3 : 0.9)) % 1;
    ctx.globalAlpha = (1 - k) * 0.5; ctx.fillStyle = C.stone;
    ell(fx + face * r * (0.6 + k * 0.7), r * (0.3 - k * 0.3), r * (0.1 + k * 0.2), r * (0.1 + k * 0.2)); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = C.cream;
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(s * r * 0.45, -r * 0.62); ctx.quadraticCurveTo(s * r * 1.35, -r * 0.75, s * r * 1.2, -r * 1.45);
      ctx.quadraticCurveTo(s * r * 0.95, -r * 0.95, s * r * 0.2, -r * 0.85); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  } else if (type === 'hunter') {
    for (const s of [-1, 1]) glowEye(fx + s * r * 0.24, -r * 0.22, r * 0.16, L.eye);
    ctx.fillStyle = C.dark; ctx.beginPath(); ctx.ellipse(fx, r * 0.18, r * 0.52, r * 0.32, 0, 0, Math.PI); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.cream;
    for (let i = 0; i < 4; i++) {
      const tx = fx - r * 0.44 + i * r * 0.22;
      ctx.beginPath(); ctx.moveTo(tx, r * 0.2); ctx.lineTo(tx + r * 0.11, r * 0.4); ctx.lineTo(tx + r * 0.22, r * 0.2); ctx.closePath(); ctx.fill();
    }
  } else if (type === 'zombie') {
    glowEye(fx - r * 0.3, -r * 0.2, r * 0.24, L.eye);
    ctx.fillStyle = C.dark; ell(fx + r * 0.33, -r * 0.15, r * 0.14, r * 0.12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.red; ell(fx + r * 0.33, -r * 0.15, r * 0.05, r * 0.05); ctx.fill();
    ctx.fillStyle = C.dark; ell(fx, r * 0.33, r * 0.28, r * 0.18 + 0.04 * r * Math.sin(t * 2)); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.cream; ctx.fillRect(fx - r * 0.08, r * 0.17, r * 0.12, r * 0.12);
  } else if (type === 'scorpion') {
    for (const [ex, ey, er] of [[-0.2, -0.25, 0.12], [0.2, -0.25, 0.12], [-0.08, -0.48, 0.08], [0.2, -0.48, 0.08]]) glowEye(fx + ex * r, ey * r, er * r, L.eye);
    // клешни смыкаются при уколе
    const snap = e.pinchFx > 0 ? 0.1 : 0.45 + 0.08 * Math.sin(t * 5);
    for (const s of [-1, 1]) {
      const px = face * r * 1.05, py = s * r * 0.45 + r * 0.15;
      ctx.fillStyle = L.col;
      ctx.beginPath(); ctx.moveTo(face * r * 0.7, py); ctx.lineTo(px, py); ctx.stroke();
      ctx.beginPath(); ctx.arc(px + face * r * 0.2, py, r * 0.3, face > 0 ? -Math.PI + snap : snap, face > 0 ? Math.PI - snap : TAU - snap);
      ctx.lineTo(px + face * r * 0.2, py); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
  ctx.restore();
  ctx.lineCap = 'butt';

  if (e.hp < e.maxHp) {
    const top = y - ry - r * (type === 'bull' || type === 'chariot' ? 0.75 : type === 'scorpion' ? 0.95 : 0.35);
    hpBar(x, top - 8, r, e.hp / e.maxHp);
  }
}

// погибшие с прошлого кадра лопаются тёмными кусочками
function sweep() {
  const now = new Set();
  for (const e of state.enemies) if (LOOK[e.type]) now.add(e);
  for (const e of lastDrawn) if (!now.has(e) && e.hp <= 0) G.blobs.pop(e, LOOK[e.type].col, LOOK[e.type].sh);
  lastDrawn = now;
}

G.foes = { has, draw, sweep };
})(window.Game = window.Game || {});
