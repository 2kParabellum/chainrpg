// Враги — другая раса, чем свои (graphics.md): тёмные тела с колышущимся краем, светящиеся глаза
// без белков, вместо рук — лапы, клешни, хвост, рога, ствол. Целиком рисует Стрелка, Бычка, Колесницу, Скорпиона,
// Зомби, Хантера, катапульту, мину, портал и турель. Демону и Спруту даёт тела (demon, kraken): прицелы, тентакли,
// лужи и прочее вокруг них рисуют их записи в реестре.
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

function has(type) { return !!LOOK[type] || !!SPECIAL[type]; }

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

  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  // лапки
  if (type !== 'shooter' && type !== 'zombie') {
    const n = 2, fast = a.speed > 10;
    ctx.fillStyle = L.sh;
    for (let i = 0; i < n; i++) for (const s of [-1, 1]) {
      const lift = fast ? Math.max(0, Math.sin(a.ph * 2.5 + i + (s > 0 ? Math.PI : 0))) * r * 0.14 : 0;
      ell(s * r * (0.35 + i * 0.3), r * 0.75 - lift, r * 0.18, r * 0.14); ctx.fill(); ctx.stroke();
    }
  }

  // тело: тёмная тень, цвет, подсветка снизу цветом глаз
  edgePath(rx, ry, t, L.edge, a.seed); ctx.fillStyle = L.sh; ctx.fill();
  ctx.save();
  edgePath(rx, ry, t, L.edge, a.seed); ctx.clip();
  ctx.fillStyle = telegraph ? '#ab5c1c' : L.col; ell(-rx * 0.05, -ry * 0.12, rx * 0.92, ry * 0.85); ctx.fill();
  ctx.strokeStyle = hexA(L.eye, telegraph ? 0.6 : 0.35); ctx.lineWidth = r * 0.24; ell(0, -r * 0.18, rx * 1.02, ry); ctx.stroke();
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
    // сигарета в углу рта: длинная белая, оранжевый фильтр у рта, тлеющий кончик, пепел и струйка дыма
    const cx0 = fx + face * r * 0.4, cy0 = r * 0.42, len = r * 1.15, ang = face > 0 ? 0.2 : Math.PI - 0.2, th = r * 0.17;
    const tx = cx0 + Math.cos(ang) * len, ty = cy0 + Math.sin(ang) * len;
    ctx.save(); ctx.translate(cx0, cy0); ctx.rotate(ang);
    ctx.fillStyle = '#fff4dc'; ctx.beginPath(); ctx.rect(0, -th / 2, len, th); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ab5c1c'; ctx.fillRect(0, -th / 2, len * 0.3, th); ctx.strokeRect(0, -th / 2, len * 0.3, th);
    ctx.fillStyle = C.stone; ctx.fillRect(len * 0.9, -th / 2, len * 0.07, th);
    ctx.fillStyle = telegraph ? C.gold : C.red; ctx.fillRect(len * 0.96, -th / 2, len * 0.06, th);
    ctx.restore();
    ctx.strokeStyle = hexA(C.stone, 0.6); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(tx, ty);
    for (let i = 1; i <= 6; i++) ctx.lineTo(tx + Math.sin(t * 3 + i) * r * 0.12 + face * i * r * 0.04, ty - i * r * 0.22);
    ctx.stroke();
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
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
    // при атаке (облако) жёлтый глаз раздувается и лопается брызгами; глазница пустая, потом глаз отрастает
    const ex = fx - r * 0.3, ey = -r * 0.2, er = r * 0.24;
    if (sa >= 0 && sa < 0.15) glowEye(ex, ey, er * (1 + 0.7 * sa / 0.15), L.eye);
    else if (sa >= 0.15 && sa < 3.6) {
      ctx.fillStyle = C.dark; ell(ex, ey, er * 1.1, er); ctx.fill(); ctx.stroke();
      if (sa < 0.8) {
        const k = (sa - 0.15) / 0.65;
        for (let i = 0; i < 8; i++) {
          const ang = i / 8 * TAU + 0.4, d = er * (1 + k * 4);
          ctx.globalAlpha = 1 - k; ctx.fillStyle = i % 2 ? L.eye : C.olive;
          ell(ex + Math.cos(ang) * d, ey + Math.sin(ang) * d + k * k * r * 0.8, er * 0.35 * (1 - k * 0.5), er * 0.35 * (1 - k * 0.5)); ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else if (sa > 2.6) glowEye(ex, ey, er * (sa - 2.6), L.eye);
      else { ctx.fillStyle = C.olive; ell(ex, ey + er * 0.9, er * 0.25, er * 0.35); ctx.fill(); }
    } else glowEye(ex, ey, er, L.eye);
    ctx.fillStyle = C.dark; ell(fx + r * 0.33, -r * 0.15, r * 0.14, r * 0.12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.red; ell(fx + r * 0.33, -r * 0.15, r * 0.05, r * 0.05); ctx.fill();
    ctx.fillStyle = C.dark; ell(fx, r * 0.33, r * 0.28, r * 0.18 + 0.04 * r * Math.sin(t * 2)); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.cream; ctx.fillRect(fx - r * 0.08, r * 0.17, r * 0.12, r * 0.12);
  } else if (type === 'scorpion') {
    // громила с одной огромной лапой: ей бьёт вплотную (pinchFx) и замахивается, бросая гарпун (выстрел)
    for (const sx2 of [-1, 1]) glowEye(fx + sx2 * r * 0.24, -r * 0.25, r * 0.13, L.eye, 0, 0.7);
    ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(fx - r * 0.42, -r * 0.48); ctx.lineTo(fx + r * 0.42, -r * 0.48); ctx.stroke();
    ctx.fillStyle = C.dark; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(fx, r * 0.22, r * 0.3, r * 0.14, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.cream;
    for (const sx2 of [-1, 1]) { ctx.beginPath(); ctx.moveTo(fx + sx2 * r * 0.2, r * 0.25); ctx.lineTo(fx + sx2 * r * 0.13, r * 0.05); ctx.lineTo(fx + sx2 * r * 0.06, r * 0.25); ctx.closePath(); ctx.fill(); }
    if (armOut) {
      // лапа улетела на пружине: у плеча — только обрубок с креплением
      ctx.fillStyle = C.stone; ell(face * r * 0.75, r * 0.1, r * 0.2, r * 0.2); ctx.fill(); ctx.stroke();
    } else {
      let px = face * r * 1.1, py = r * 0.3 + Math.sin(t * 3) * r * 0.05, pk = 1;
      if (e.pinchFx > 0) { const k = e.pinchFx / 0.2; px = face * r * (1.1 + 0.45 * k); py = r * (0.3 + 0.25 * k); pk = 1 + 0.15 * k; }
      for (const [lw, col] of [[r * 0.42, C.ink], [r * 0.28, L.sh]]) {
        ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(face * r * 0.55, r * 0.1); ctx.lineTo(px, py); ctx.stroke();
      }
      drawPaw(px, py, r * 0.55 * pk, face, L);
      if (e.pinchFx > 0.1) star(px + face * r * 0.75, py, r * 0.35, C.orange);
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

// портал: тёмный водоворот с красными рукавами; перед выходом врага ядро разгорается и изнутри глядят глаза
function drawPortal(e, a) {
  const r = e.r, age = e.age || 0, t = state.time + a.seed, fl = hurtFlash(a);
  const soon = e.spawnIn < 1.5 ? 1 - Math.max(0, e.spawnIn) / 1.5 : 0;
  const g = ctx.createRadialGradient(e.x, e.y, r * 0.8, e.x, e.y, r * 1.6);
  g.addColorStop(0, 'rgba(155,26,10,0.35)'); g.addColorStop(1, 'rgba(155,26,10,0)');
  ctx.fillStyle = g; ell(e.x, e.y, r * 1.6, r * 1.6); ctx.fill();
  ctx.save(); ctx.translate(e.x, e.y);
  edgePath(r, r, t, 'wobble', a.seed); ctx.fillStyle = '#300f0a'; ctx.fill();
  ctx.save(); edgePath(r, r, t, 'wobble', a.seed); ctx.clip();
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
  const core = r * (0.22 + 0.04 * Math.sin(age * 3) + soon * 0.15);
  const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, core * 2);
  cg.addColorStop(0, `rgba(239,105,47,${0.6 + soon * 0.4})`); cg.addColorStop(1, 'rgba(239,58,12,0)');
  ctx.fillStyle = cg; ell(0, 0, core * 2, core * 2); ctx.fill();
  if (soon > 0.2) for (let i = 0; i < 3; i++) {
    const ang = i * 2.1 + 0.5, d = r * 0.55;
    ctx.globalAlpha = Math.min(1, (soon - 0.2) * 2);
    for (const s of [-1, 1]) glowEye(Math.cos(ang) * d + s * r * 0.07, Math.sin(ang) * d, r * 0.045, C.gold);
    ctx.globalAlpha = 1;
  }
  flashOver(r, r, fl);
  ctx.restore();
  edgePath(r, r, t, 'wobble', a.seed); ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.stroke();
  ctx.restore(); ctx.lineCap = 'butt';
}

// кольцо щита (турель, Демон): пульсирует, пока щит включён
function shieldRing(e, extra) {
  ctx.strokeStyle = '#3c9f9c'; ctx.lineWidth = 3;
  ctx.globalAlpha = 0.6 + 0.25 * Math.sin((e.age || state.time) * 4);
  ell(e.x, e.y, e.r + extra, e.r + extra); ctx.stroke();
  ctx.globalAlpha = 1;
}

// турель: каменная восьмигранная башня, наверху тёмный купол с одним светящимся глазом и стволом к цели
function drawTurret(e, a) {
  const r = e.r, f = e.facing || 0, fl = hurtFlash(a), shot = state.time - a.atkAt < 0.08;
  ctx.fillStyle = 'rgba(20,10,5,0.5)'; ell(e.x, e.y + r * 0.8, r * 1.1, r * 0.35); ctx.fill();
  const oct = (cx, cy, rr) => { ctx.beginPath(); for (let i = 0; i < 8; i++) { const ang = i / 8 * TAU + Math.PI / 8; ctx.lineTo(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr * 0.85); } ctx.closePath(); };
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
  oct(e.x, e.y + 6, r); ctx.fillStyle = '#684c3c'; ctx.fill(); ctx.stroke();
  oct(e.x, e.y, r); ctx.fillStyle = C.stone; ctx.fill(); ctx.stroke();
  ctx.save(); ctx.translate(e.x, e.y - 2);
  for (const [lw, col] of [[9, C.ink], [5, '#45230d']]) {
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(f) * r * (shot ? 1.05 : 1.25), Math.sin(f) * r * (shot ? 1.05 : 1.25)); ctx.stroke();
  }
  if (shot) star(Math.cos(f) * r * 1.4, Math.sin(f) * r * 1.4, r * 0.3, C.orange);
  edgePath(r * 0.55, r * 0.5, state.time + a.seed, 'wobble', a.seed); ctx.fillStyle = '#550f0a'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = C.ink; ctx.stroke();
  if (fl > 0) { ctx.save(); edgePath(r * 0.55, r * 0.5, state.time + a.seed, 'wobble', a.seed); ctx.clip(); flashOver(r * 0.6, r * 0.6, fl); ctx.restore(); }
  glowEye(Math.cos(f) * r * 0.12, Math.sin(f) * r * 0.1 - r * 0.05, r * 0.2, C.gold);
  ctx.restore(); ctx.lineCap = 'butt';
  if (e.shielded) shieldRing(e, e.cfg.shieldAuraExtra);
}

const SPECIAL = { tower: drawCatapult, mine: drawMine, portal: drawPortal, turret: drawTurret };

function drawSpecial(e) {
  const a = track(e);
  SPECIAL[e.type](e, a);
  if (e.type !== 'mine' && e.hp < e.maxHp) hpBar(e.x, e.y - e.r * (e.type === 'portal' ? 1.15 : 1.3) - 8, Math.min(e.r, 40), e.hp / e.maxHp);
}

// тело Демона: громадный тёмный блоб с рогами, светящимися глазами, зубастой пастью и когтистыми лапами.
// color — цвет тела (при замахе — цвет атаки), angry — злобный взгляд перед тараном
function demon(e, color, angry, glowing) {
  const a = track(e), r = e.r, t = state.time + a.seed, face = a.face, f = e.facing || -Math.PI / 2, fl = hurtFlash(a);
  const w = Math.sin(t * 2.5);
  const rx = r * (1 + 0.03 * w), ry = r * 0.92 * (1 - 0.03 * w);
  ctx.fillStyle = 'rgba(20,10,5,0.5)'; ell(e.x, e.y + r * 0.85, r * 1.1, r * 0.33); ctx.fill();
  ctx.save(); ctx.translate(e.x, e.y);
  ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // рога
  ctx.fillStyle = C.cream;
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(s * r * 0.35, -r * 0.7); ctx.quadraticCurveTo(s * r * 1.1, -r * 0.9, s * r * 0.95, -r * 1.55);
    ctx.quadraticCurveTo(s * r * 0.75, -r * 1.05, s * r * 0.1, -r * 0.85); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // лапы с когтями по бокам
  for (const s of [-1, 1]) {
    const px = s * r * 1.02, py = r * 0.25 + Math.sin(t * 3 + s) * r * 0.05;
    ctx.fillStyle = '#300f0a'; ell(px, py, r * 0.26, r * 0.22); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.cream;
    for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(px + s * r * 0.15, py + k * r * 0.1 - r * 0.04); ctx.lineTo(px + s * r * 0.36, py + k * r * 0.12); ctx.lineTo(px + s * r * 0.15, py + k * r * 0.1 + r * 0.04); ctx.closePath(); ctx.fill(); }
  }
  edgePath(rx, ry, t, 'wobble', a.seed); ctx.fillStyle = '#300f0a'; ctx.fill();
  ctx.save(); edgePath(rx, ry, t, 'wobble', a.seed); ctx.clip();
  ctx.fillStyle = color; ell(-rx * 0.05, -ry * 0.12, rx * 0.92, ry * 0.85); ctx.fill();
  ctx.strokeStyle = hexA(glowing ? C.gold : C.orange, glowing ? 0.6 : 0.35); ctx.lineWidth = r * 0.22; ell(0, -r * 0.18, rx * 1.02, ry); ctx.stroke();
  flashOver(rx, ry, fl);
  ctx.restore();
  edgePath(rx, ry, t, 'wobble', a.seed); ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.stroke();
  // глаза: перед тараном больше и с бровями
  const fx = face * r * 0.15, er = r * (angry ? 0.17 : 0.13), ec = glowing ? C.cream : C.orange;
  for (const s of [-1, 1]) {
    glowEye(fx + s * r * 0.32, -r * 0.22, er, ec, 0, 0.8);
    ctx.fillStyle = C.ink; ell(fx + s * r * 0.32 + Math.cos(f) * er * 0.35, -r * 0.22 + Math.sin(f) * er * 0.3, er * 0.25, er * 0.7); ctx.fill();
  }
  if (angry) {
    ctx.strokeStyle = C.ink; ctx.lineWidth = 5;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(fx + s * r * 0.55, -r * 0.5); ctx.lineTo(fx + s * r * 0.12, -r * 0.36); ctx.stroke(); }
  }
  // пасть с зубами
  const mw = r * 0.5, my = r * 0.22, open = angry ? r * 0.28 : r * 0.18;
  ctx.fillStyle = C.dark; ctx.beginPath(); ctx.moveTo(fx - mw, my); ctx.quadraticCurveTo(fx, my + open * 2, fx + mw, my); ctx.closePath(); ctx.fill();
  ctx.lineWidth = 2.5; ctx.stroke();
  ctx.fillStyle = C.cream;
  for (let i = 0; i < 6; i++) { const tx = fx - mw + (i + 0.5) * (mw * 2 / 6); ctx.beginPath(); ctx.moveTo(tx - mw / 7, my); ctx.lineTo(tx, my + open * 0.6); ctx.lineTo(tx + mw / 7, my); ctx.closePath(); ctx.fill(); }
  ctx.restore(); ctx.lineCap = 'butt';
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

G.foes = { has, draw, drawsHook, sweep, demon, kraken, swallowed, shieldRing };
})(window.Game = window.Game || {});
