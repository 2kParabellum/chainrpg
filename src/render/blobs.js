// Блобы своих: Герой, дружочки, выбитые и ждущие вербовки. Стиль — в graphics.md.
// Анимация (ходьба, выпад, вспышка урона, радость) выводится из того, как меняется юнит между кадрами:
// у рисования свой кэш на юнита (WeakMap) и свои частицы-кусочки. Состояние игры только читается.
(function (G) {
'use strict';

const { state, allyTypes } = G;
const { clamp } = G.math;
const { ctx } = G.shapes;

const TAU = Math.PI * 2;
// цвета — из палитры fantasy-24 (graphics.md)
const C = {
  ink: '#2a1d0d', eye: '#fff4dc', body: '#efb775', shade: '#a56243',
  gold: '#efac28', cream: '#efd8a1', stone: '#927e6a', mud: '#684c3c', brown: '#724113',
  teal: '#3c9f9c', tealD: '#276468', olive: '#a58c27', green: '#39571c',
  red: '#ef3a0c', blood: '#9b1a0a', orange: '#ef692f',
};
// профессия → шапка и оружие в руке
const PROF = {
  shooter: { hat: 'cap', weapon: 'gun' },
  medic: { hat: 'nurse', weapon: 'kit' },
  spear: { hat: 'band', weapon: 'spear' },
  spark: { hat: 'wizard', weapon: 'orb' },
};
const BUFF_COL = { speed: C.gold, power: C.red, regen: C.teal, sturdy: C.stone, spiky: C.blood, will: C.cream };

const anim = new WeakMap();
const bits = [];       // кусочки от ударов и лопнувших тел: { x, y, vx, vy, life, max, r, col }
let bitsAt = 0;
let lastDrawn = new Set();
let baseA = 1;       // общая прозрачность рисуемого блоба (ждущий дружочек гаснет перед уходом)

function ell(x, y, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU);
}
function rr(x, y, w, h, rad) { ctx.beginPath(); ctx.roundRect(x, y, w, h, rad); }

// кэш анимации юнита: скорость, сторона взгляда, когда ранен / ударил / обрадовался
function track(u) {
  const t = state.time;
  let a = anim.get(u);
  if (!a) {
    a = { x: u.x, y: u.y, t, speed: 0, face: Math.cos(u.facing || 0) < 0 ? -1 : 1, hp: u.hp, hurtAt: -9, atkAt: -9,
      happyAt: -9, ph: Math.random() * 10, seed: Math.random() * 10, cds: [], kind: u.kind, lvl: u.abilityLevel || 0 };
    anim.set(u, a);
  }
  const dt = t - a.t;
  if (dt > 0) {
    const sp = Math.min(400, Math.hypot(u.x - a.x, u.y - a.y) / dt);
    a.speed += (sp - a.speed) * Math.min(1, dt * 10);
    if (a.speed > 15) a.ph += dt * 8;
  }
  a.x = u.x; a.y = u.y; a.t = t;
  // Герой смотрит туда, куда едет; звенья — туда, куда целится оружие
  const f = allyTypes[u.type].anchor && u.heading !== undefined ? u.heading : (u.facing || 0);
  const cx = Math.cos(f);
  if (cx > 0.25) a.face = 1; else if (cx < -0.25) a.face = -1;
  a.look = f;
  if (u.hp < a.hp - 0.3 && t - a.hurtAt > 0.4) { a.hurtAt = t; burst(u, a.face); }
  a.hp = u.hp;
  (u.gear || []).forEach((w, i) => {
    if (a.cds[i] !== undefined && w.cd > a.cds[i] + 0.05) a.atkAt = t;
    a.cds[i] = w.cd;
  });
  if (a.kind !== u.kind) { if (a.kind === 'neutral' || a.kind === 'downed') a.happyAt = t; a.kind = u.kind; }
  const lvl = u.abilityLevel || 0;
  if (lvl > a.lvl) a.happyAt = t;
  a.lvl = lvl;
  return a;
}

// --- частицы ---
function burst(u, face) {
  for (let i = 0; i < 5; i++) {
    const ang = (face > 0 ? Math.PI : 0) + (Math.random() - 0.5) * 1.6, sp = 60 + Math.random() * 80;
    bits.push({ x: u.x, y: u.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 40, life: 0.45, max: 0.45,
      r: u.r * 0.16, col: i % 2 ? C.body : C.cream });
  }
}
function pop(u, c1 = C.body, c2 = C.shade) {
  for (let i = 0; i < 10; i++) {
    const ang = i / 10 * TAU, sp = 90 + Math.random() * 60;
    bits.push({ x: u.x, y: u.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * 0.8, life: 0.6, max: 0.6,
      r: u.r * 0.25, col: i % 2 ? c1 : c2 });
  }
}
function drawBits() {
  const dt = clamp(state.time - bitsAt, 0, 0.1);
  bitsAt = state.time;
  for (let i = bits.length - 1; i >= 0; i--) {
    const b = bits[i];
    b.life -= dt;
    if (b.life <= 0) { bits.splice(i, 1); continue; }
    b.x += b.vx * dt; b.y += b.vy * dt; b.vy += 300 * dt;
    const k = b.life / b.max;
    ctx.globalAlpha = k;
    ctx.fillStyle = b.col;
    ell(b.x, b.y, b.r * k + 0.5, b.r * k + 0.5);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
// погибшие с прошлого кадра лопаются кусочками
function sweep(list) {
  const now = new Set(list);
  for (const u of lastDrawn) if (!now.has(u) && u.hp <= 0) pop(u);
  lastDrawn = now;
}

// --- блоб ---
// mode: 'chain' (в цепочке), 'downed' (выбит, лежит), 'neutral' (ждёт вербовки)
function drawAlly(u, mode, alpha = 1) {
  baseA = alpha;
  ctx.globalAlpha = alpha;
  const a = track(u), t = state.time, T = allyTypes[u.type];
  const prof = u.ability ? PROF[u.ability] : null;
  const hat = T.anchor ? 'crown' : prof ? prof.hat : null;
  const weapon = T.anchor ? null : prof ? prof.weapon : 'fist';
  const lvl = clamp(u.abilityLevel || 1, 1, 3);
  const isLead = mode === 'chain' && u === state.party[0];
  const buffs = isLead ? Object.keys(u.buffs || {}).filter((k) => u.buffs[k] > 0) : [];
  const r = u.r, face = a.face;

  let hop = 0, sx = 1, sy = 1, lean = 0, dx = 0, swing = 0, eyes = 'normal', flash = 0, handFx = 0;
  if (mode !== 'downed' && a.speed > 15) {
    const k = Math.min(1, a.speed / 110), h = Math.abs(Math.sin(a.ph)), land = 1 - h;
    hop = h * r * 0.28 * k;
    sx = 1 + 0.12 * land * land * k; sy = 1 - 0.12 * land * land * k;
    lean = face * 0.1 * k * (buffs.includes('speed') ? 1.8 : 1);
    swing = Math.sin(a.ph * 2) * 0.6 * k;
  } else {
    const b = Math.sin(t * 3 + a.seed);
    sx = 1 - 0.03 * b; sy = 1 + 0.035 * b; swing = b * 0.3;
  }
  if (u.hp / u.maxHp < 0.3) eyes = 'tired';
  const sa = t - a.atkAt;
  if (sa >= 0 && sa < 0.35) {
    const k = sa < 0.1 ? sa / 0.1 : 1 - (sa - 0.1) / 0.25;
    dx = face * r * 0.18 * k; handFx = r * 0.6 * k; sx *= 1 - 0.08 * k; sy *= 1 + 0.08 * k; lean += face * 0.12 * k;
    eyes = 'focus';
  }
  const ha = t - a.hurtAt;
  if (ha >= 0 && ha < 0.35) {
    const k = 1 - ha / 0.35;
    dx -= face * r * 0.25 * k; sx *= 1 + 0.14 * k; sy *= 1 - 0.14 * k; lean -= face * 0.15 * k; eyes = 'hurt';
    if (ha < 0.1) flash = 1 - ha / 0.1;
  }
  const ja = t - a.happyAt;
  if (ja >= 0 && ja < 0.7) { hop += Math.sin(Math.min(ja / 0.5, 1) * Math.PI) * r * 0.7; eyes = 'happy'; swing = -1.2; }
  if (mode === 'downed') { sx = 1.3; sy = 0.62; hop = 0; lean = 0; eyes = 'ko'; }
  if (buffs.includes('power')) { sx *= 1.12; sy *= 1.12; }

  const x = u.x + dx, by = u.y - hop, rx = r * sx, ry = r * 0.95 * sy;

  // подобрать можно: мягкое светлое пятно под телом
  if (mode !== 'chain') {
    const k = 0.5 - 0.5 * Math.cos(t * 3);
    const g = ctx.createRadialGradient(u.x, u.y, r * 0.6, u.x, u.y, r * (1.9 + 0.3 * k));
    g.addColorStop(0, 'rgba(255,244,220,0.22)');
    g.addColorStop(1, 'rgba(255,244,220,0)');
    ctx.fillStyle = g;
    ell(u.x, u.y, r * (1.9 + 0.3 * k), r * (1.9 + 0.3 * k));
    ctx.fill();
  }
  // тень на полу
  const sk = 1 - hop / (r * 3);
  ctx.fillStyle = 'rgba(20,10,5,0.45)';
  ell(u.x, u.y + r * 0.85, r * 0.95 * sk, r * 0.3 * sk);
  ctx.fill();

  ctx.save();
  ctx.translate(x, by);
  ctx.rotate(lean);
  if (buffs.includes('power')) {
    const g = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 1.9);
    g.addColorStop(0, 'rgba(239,58,12,0.55)');
    g.addColorStop(1, 'rgba(239,58,12,0)');
    ctx.fillStyle = g;
    ell(0, 0, r * 1.9, r * 1.9);
    ctx.fill();
  }
  if (buffs.includes('speed')) {
    ctx.strokeStyle = C.gold; ctx.lineCap = 'round'; ctx.lineWidth = r * 0.14;
    for (let i = 0; i < 3; i++) {
      const yy = (i - 1) * r * 0.45, ph = (t * 3 + i * 0.37) % 1;
      ctx.globalAlpha = baseA * ((1 - ph) * 0.9);
      ctx.beginPath();
      ctx.moveTo(-face * (r * 1.1 + ph * r * 0.6), yy);
      ctx.lineTo(-face * (r * 1.9 + ph * r * 0.9), yy);
      ctx.stroke();
    }
    ctx.globalAlpha = baseA;
  }
  if (mode !== 'downed') drawHand(-face * r * 0.88, r * 0.3 - swing * r * 0.12, r, weapon);
  if (buffs.includes('spiky')) {
    ctx.fillStyle = C.blood; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5;
    for (let i = 0; i < 9; i++) {
      const ang = i / 9 * TAU + t * 0.4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang - 0.22) * rx * 0.9, Math.sin(ang - 0.22) * ry * 0.9);
      ctx.lineTo(Math.cos(ang) * rx * 1.35, Math.sin(ang) * ry * 1.35);
      ctx.lineTo(Math.cos(ang + 0.22) * rx * 0.9, Math.sin(ang + 0.22) * ry * 0.9);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }

  // тело: тёмный низ, светлый верх, блик
  ell(0, 0, rx, ry); ctx.fillStyle = C.shade; ctx.fill();
  ctx.save();
  ell(0, 0, rx, ry); ctx.clip();
  ctx.fillStyle = C.body; ell(-rx * 0.1, -ry * 0.16, rx * 0.95, ry * 0.86); ctx.fill();
  if (eyes === 'tired') { ctx.fillStyle = 'rgba(42,29,13,0.25)'; ctx.fillRect(-rx, -ry, rx * 2, ry * 2); }
  ctx.fillStyle = 'rgba(255,244,220,0.5)'; ell(-rx * 0.38, -ry * 0.5, rx * 0.24, ry * 0.13, -0.5); ctx.fill();
  if (flash > 0) { ctx.fillStyle = `rgba(255,250,240,${0.9 * flash})`; ctx.fillRect(-rx, -ry, rx * 2, ry * 2); }
  ctx.restore();
  ell(0, 0, rx, ry); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke();

  // зрачки смотрят по-настоящему: туда, куда едет Герой или целится звено; ждущий смотрит на Героя
  let lx = Math.cos(a.look), ly = Math.sin(a.look);
  const lead = state.party[0];
  if (mode === 'neutral' && lead) {
    const L = Math.hypot(lead.x - u.x, lead.y - u.y) || 1;
    lx = (lead.x - u.x) / L; ly = (lead.y - u.y) / L;
  }
  drawEyes(eyes, r, face, lx, ly, t, a.seed);
  drawHat(hat, rx, ry, r, face, t);
  if (buffs.includes('will')) {
    ctx.strokeStyle = C.cream; ctx.lineWidth = r * 0.14; ctx.globalAlpha = baseA * (0.75 + 0.25 * Math.sin(t * 4));
    ell(0, -ry * 1.75 + Math.sin(t * 2.5) * 1.5, r * 0.6, r * 0.18); ctx.stroke(); ctx.globalAlpha = baseA;
  }
  if (mode !== 'downed') {
    const hx = face * (r * 0.95 + handFx), hy = r * 0.22 + swing * r * 0.12;
    drawWeapon(weapon, lvl, hx, hy, r, face, t, sa >= 0 && sa < 0.15);
    drawHand(hx, hy, r, weapon);
  }
  ctx.restore();

  if (mode === 'downed') {
    for (let i = 0; i < 3; i++) {
      const ang = t * 3 + i / 3 * TAU;
      star(x + Math.cos(ang) * r * 0.8, by - ry - r * 0.35 + Math.sin(ang) * r * 0.2, r * 0.2, C.gold);
    }
  }
  if (eyes === 'tired' && mode !== 'downed') {
    const k = (t * 0.7 + a.seed) % 1, px = x - face * r * 0.8, py = by - r * 0.6 + k * r * 0.6;
    ctx.globalAlpha = baseA * (1 - k); ctx.fillStyle = C.teal; ctx.strokeStyle = C.ink; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px, py - r * 0.28); ctx.quadraticCurveTo(px + r * 0.17, py, px, py + r * 0.09);
    ctx.quadraticCurveTo(px - r * 0.17, py, px, py - r * 0.28); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = baseA;
  }
  if (buffs.includes('regen')) {
    for (let i = 0; i < 3; i++) {
      const k = (t * 0.8 + i / 3) % 1, px = x + (Math.sin(i * 12.9898) * 0.5) * r * 1.6;
      ctx.globalAlpha = baseA * (Math.sin(k * Math.PI));
      plus(px, by - k * r * 1.8, r * 0.22, C.teal);
    }
    ctx.globalAlpha = baseA;
  }

  // над головой: полоска HP (только у раненых), выше — значки усилений Героя
  let top = by - ry - (hat === 'wizard' ? r * 0.95 : hat ? r * 0.55 : 0) - (buffs.includes('will') ? r * 0.5 : 0) - 4;
  if (mode !== 'neutral' && u.hp < u.maxHp) { hpBar(x, top - 5, r, u.hp / u.maxHp); top -= 9; }
  if (buffs.length) {
    const gap = 17, y0 = top - 8;
    buffs.forEach((b, i) => {
      if (u.buffs[b] < 4 && Math.floor(t * 6) % 2) return;
      glyph(b, x + (i - (buffs.length - 1) / 2) * gap, y0, 6);
    });
  }
  ctx.globalAlpha = 1;
}

function hpBar(x, y, r, k) {
  const w = Math.max(22, r * 2), h = 4, bx = x - w / 2;
  ctx.fillStyle = C.ink; rr(bx - 1.5, y - 1.5, w + 3, h + 3, 3); ctx.fill();
  ctx.fillStyle = k < 0.35 ? C.orange : C.teal; rr(bx, y, w * clamp(k, 0.03, 1), h, 2); ctx.fill();
}

function drawHand(hx, hy, r, weapon) {
  const hr = r * (weapon === 'fist' ? 0.32 : 0.26);
  ell(hx, hy, hr, hr); ctx.fillStyle = C.body; ctx.fill();
  ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.stroke();
}

function drawEyes(mode, r, face, lx, ly, t, seed) {
  const cx = face * r * 0.16, cy = -r * 0.12, sp = r * 0.34;
  const blink = mode === 'normal' && ((t + seed * 1.7) % 3.3) < 0.12;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const s of [-1, 1]) {
    const x = cx + s * sp, y = cy;
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1.6;
    if (mode === 'hurt') {
      ctx.beginPath(); ctx.moveTo(x - s * r * 0.13, y - r * 0.13); ctx.lineTo(x + s * r * 0.06, y);
      ctx.lineTo(x - s * r * 0.13, y + r * 0.13); ctx.stroke(); continue;
    }
    if (mode === 'happy') { ctx.beginPath(); ctx.arc(x, y + r * 0.06, r * 0.13, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); continue; }
    if (mode === 'ko') {
      ctx.lineWidth = 1.2; ctx.beginPath();
      for (let k = 0; k < 12; k += 0.4) { const q = r * 0.016 * k; ctx.lineTo(x + Math.cos(k + t * 6 * s) * q, y + Math.sin(k + t * 6 * s) * q); }
      ctx.stroke(); continue;
    }
    const h = (blink ? 0.12 : 1) * (mode === 'focus' ? 0.7 : 1);
    ctx.fillStyle = C.eye; ell(x, y, r * 0.19, r * 0.24 * h); ctx.fill(); ctx.lineWidth = 1.3; ctx.stroke();
    if (!blink) {
      const pr = r * (mode === 'focus' ? 0.08 : 0.1);
      ctx.fillStyle = C.ink; ell(x + lx * r * 0.07, y + ly * r * 0.08 * h, pr, pr); ctx.fill();
    }
    if (mode === 'tired') {
      ctx.fillStyle = C.shade; ctx.beginPath(); ctx.ellipse(x, y, r * 0.19 + 1, r * 0.24 + 1, 0, Math.PI, 0); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - r * 0.19, y); ctx.lineTo(x + r * 0.19, y); ctx.stroke();
    }
    if (mode === 'focus') {
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + s * r * 0.2, y - r * 0.34); ctx.lineTo(x - s * r * 0.18, y - r * 0.27); ctx.stroke();
    }
  }
}

// шапки профессий: цвет шапки = цвет профессии (graphics.md)
function drawHat(hat, rx, ry, r, face, t) {
  if (!hat) return;
  ctx.strokeStyle = C.ink; ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
  if (hat === 'crown') {
    ctx.fillStyle = C.gold;
    const w = r * 0.62, b = -ry * 0.82, h = r * 0.5;
    ctx.beginPath(); ctx.moveTo(-w, b); ctx.lineTo(-w, b - h); ctx.lineTo(-w * 0.45, b - h * 0.5); ctx.lineTo(0, b - h * 1.15);
    ctx.lineTo(w * 0.45, b - h * 0.5); ctx.lineTo(w, b - h); ctx.lineTo(w, b); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.red; ell(0, b - h * 0.35, r * 0.09, r * 0.09); ctx.fill();
  } else if (hat === 'cap') {
    ctx.fillStyle = C.green; ctx.beginPath(); ctx.ellipse(0, -ry * 0.5, rx * 0.8, ry * 0.58, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.olive; ell(face * rx * 0.62, -ry * 0.52, rx * 0.42, ry * 0.12); ctx.fill(); ctx.stroke();
  } else if (hat === 'band') {
    const sw = Math.sin(t * 7) * r * 0.12;
    ctx.fillStyle = C.orange;
    ctx.beginPath(); ctx.moveTo(-face * rx * 0.85, -ry * 0.5); ctx.quadraticCurveTo(-face * rx * 1.4, -ry * 0.55 + sw, -face * rx * 1.6, -ry * 0.2 + sw);
    ctx.lineTo(-face * rx * 1.3, -ry * 0.25); ctx.lineTo(-face * rx * 0.85, -ry * 0.35); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.save(); ell(0, 0, rx, ry); ctx.clip();
    ctx.fillRect(-rx, -ry * 0.68, rx * 2, ry * 0.26); ctx.strokeRect(-rx * 1.2, -ry * 0.68, rx * 2.4, ry * 0.26);
    ctx.restore();
    ell(0, 0, rx, ry); ctx.lineWidth = 2; ctx.stroke();
  } else if (hat === 'nurse') {
    ctx.fillStyle = C.cream;
    ctx.beginPath(); ctx.moveTo(-rx * 0.55, -ry * 0.72); ctx.lineTo(-rx * 0.45, -ry * 1.25); ctx.lineTo(rx * 0.45, -ry * 1.25);
    ctx.lineTo(rx * 0.55, -ry * 0.72); ctx.closePath(); ctx.fill(); ctx.stroke();
    plus(0, -ry * 0.99, r * 0.19, C.red);
  } else if (hat === 'wizard') {
    const tip = Math.sin(t * 2) * r * 0.08;
    ctx.fillStyle = C.teal;
    ctx.beginPath(); ctx.moveTo(-rx * 0.75, -ry * 0.62); ctx.quadraticCurveTo(-rx * 0.2, -ry * 1.3, -face * rx * 0.45 + tip, -ry * 1.85);
    ctx.quadraticCurveTo(rx * 0.25, -ry * 1.2, rx * 0.75, -ry * 0.62); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.tealD; ell(0, -ry * 0.64, rx * 0.85, ry * 0.12); ctx.fill(); ctx.stroke();
    star(rx * 0.05, -ry * 1.05, r * 0.18, C.gold);
  }
}

// оружие в передней руке, растёт с уровнем профессии; рисуется в системе руки, смотрит по face
function drawWeapon(w, lvl, hx, hy, r, face, t, firing) {
  if (!w || w === 'fist') return;
  const lw = 1.3;
  ctx.save(); ctx.translate(hx, hy); ctx.scale(face * 1.2, 1.2);
  ctx.strokeStyle = C.ink; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (w === 'gun') {
    if (lvl === 1) { // пистолет
      ctx.fillStyle = C.brown; rr(-r * 0.05, 0, r * 0.28, r * 0.45, 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.stone; rr(-r * 0.15, -r * 0.3, r * 0.95, r * 0.36, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.mud; rr(r * 0.55, -r * 0.24, r * 0.38, r * 0.24, 2); ctx.fill(); ctx.stroke();
      if (firing) star(r * 1.15, -r * 0.12, r * 0.3, C.gold);
    } else if (lvl === 2) { // ружьё
      ctx.fillStyle = C.brown; ctx.beginPath(); ctx.moveTo(-r * 0.6, r * 0.2); ctx.lineTo(-r * 0.2, -r * 0.05); ctx.lineTo(-r * 0.15, r * 0.2);
      ctx.lineTo(-r * 0.6, r * 0.42); ctx.closePath(); ctx.fill(); ctx.stroke();
      rr(-r * 0.3, -r * 0.22, r * 0.9, r * 0.38, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.stone; rr(r * 0.5, -r * 0.17, r * 0.55, r * 0.2, 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.mud; rr(-r * 0.05, -r * 0.42, r * 0.45, r * 0.18, 2); ctx.fill(); ctx.stroke();
      if (firing) star(r * 1.25, -r * 0.07, r * 0.32, C.gold);
    } else { // пулемёт
      ctx.fillStyle = C.mud; rr(-r * 0.7, -r * 0.4, r * 0.55, r * 0.55, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.stone; rr(-r * 0.3, -r * 0.5, r * 1.0, r * 0.7, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.gold; rr(-r * 0.05, r * 0.15, r * 0.35, r * 0.5, 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.mud;
      for (let i = -1; i <= 1; i++) { rr(r * 0.65, -r * 0.2 + i * r * 0.17, r * 0.55, r * 0.13, 1); ctx.fill(); ctx.stroke(); }
      ctx.fillStyle = C.stone; rr(r * 0.95, -r * 0.42, r * 0.14, r * 0.45, 1); ctx.fill(); ctx.stroke();
      if (firing) star(r * 1.4, -r * 0.2, r * 0.32, C.gold);
    }
  } else if (w === 'spear') {
    const L = [0, 0.8, 0.95, 1.05][lvl], back = [0, 0.35, 0.45, 0.5][lvl];
    ctx.rotate(-0.55);
    ctx.strokeStyle = C.ink; ctx.lineWidth = r * 0.2;
    ctx.beginPath(); ctx.moveTo(-r * back, 0); ctx.lineTo(r * L, 0); ctx.stroke();
    ctx.strokeStyle = lvl === 3 ? C.mud : C.brown; ctx.lineWidth = r * 0.1;
    ctx.beginPath(); ctx.moveTo(-r * back, 0); ctx.lineTo(r * L, 0); ctx.stroke();
    ctx.lineWidth = lw; ctx.strokeStyle = C.ink;
    if (lvl === 1) {
      ctx.fillStyle = C.cream; ctx.beginPath(); ctx.moveTo(r * L, -r * 0.22); ctx.lineTo(r * (L + 0.55), 0); ctx.lineTo(r * L, r * 0.22); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (lvl === 2) {
      ctx.fillStyle = C.cream; ctx.beginPath(); ctx.moveTo(r * L, -r * 0.3); ctx.lineTo(r * (L + 0.8), 0); ctx.lineTo(r * L, r * 0.3); ctx.lineTo(r * (L + 0.15), 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.red; ctx.beginPath(); ctx.moveTo(r * (L - 0.05), 0); ctx.quadraticCurveTo(r * (L - 0.4), r * (0.4 + 0.1 * Math.sin(t * 6)), r * (L - 0.6), r * 0.55);
      ctx.lineTo(r * (L - 0.25), r * 0.1); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else { // алебарда
      ctx.fillStyle = C.cream; ctx.beginPath(); ctx.moveTo(r * L, -r * 0.18); ctx.lineTo(r * (L + 0.75), 0); ctx.lineTo(r * L, r * 0.18); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.stone; ctx.beginPath(); ctx.moveTo(r * (L - 0.55), -r * 0.08); ctx.quadraticCurveTo(r * (L - 0.3), -r * 0.95, r * (L + 0.1), -r * 0.8);
      ctx.quadraticCurveTo(r * (L - 0.05), -r * 0.4, r * (L - 0.05), -r * 0.08); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.gold; ctx.beginPath(); ctx.moveTo(r * (L - 0.5), r * 0.08); ctx.lineTo(r * (L - 0.25), r * 0.45); ctx.lineTo(r * (L - 0.1), r * 0.08); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  } else if (w === 'kit') {
    if (lvl === 1) {
      ctx.fillStyle = C.cream; rr(-r * 0.05, -r * 0.55, r * 0.6, r * 0.5, 2); ctx.fill(); ctx.stroke();
      plus(r * 0.25, -r * 0.3, r * 0.15, C.red);
    } else if (lvl === 2) {
      ctx.fillStyle = C.cream; rr(-r * 0.1, -r * 0.75, r * 0.95, r * 0.75, 3); ctx.fill(); ctx.stroke();
      ctx.lineWidth = r * 0.1; ctx.beginPath(); ctx.arc(r * 0.37, -r * 0.75, r * 0.2, Math.PI, 0); ctx.stroke(); ctx.lineWidth = lw;
      plus(r * 0.37, -r * 0.4, r * 0.22, C.red);
    } else { // посох с крестом
      ctx.strokeStyle = C.ink; ctx.lineWidth = r * 0.2; ctx.beginPath(); ctx.moveTo(r * 0.1, r * 0.5); ctx.lineTo(r * 0.1, -r * 1.2); ctx.stroke();
      ctx.strokeStyle = C.brown; ctx.lineWidth = r * 0.1; ctx.beginPath(); ctx.moveTo(r * 0.1, r * 0.5); ctx.lineTo(r * 0.1, -r * 1.2); ctx.stroke();
      const g = ctx.createRadialGradient(r * 0.1, -r * 1.45, 0, r * 0.1, -r * 1.45, r * 0.9);
      g.addColorStop(0, `rgba(60,159,156,${0.5 + 0.2 * Math.sin(t * 5)})`); g.addColorStop(1, 'rgba(60,159,156,0)');
      ctx.fillStyle = g; ell(r * 0.1, -r * 1.45, r * 0.9, r * 0.9); ctx.fill();
      plus(r * 0.1, -r * 1.45, r * 0.4, C.cream);
      plus(r * 0.1, -r * 1.45, r * 0.2, C.red);
    }
  } else if (w === 'orb') {
    const p = 0.85 + 0.15 * Math.sin(t * 8);
    let ox = r * 0.1, oy = -r * 0.45, orr = r * 0.26;
    if (lvl >= 2) {
      const len = lvl === 2 ? 0.8 : 1.2;
      oy = -r * (len + 0.15); orr = r * (lvl === 2 ? 0.32 : 0.42);
      ctx.strokeStyle = C.ink; ctx.lineWidth = r * 0.2; ctx.beginPath(); ctx.moveTo(r * 0.1, r * 0.45); ctx.lineTo(ox, oy + orr * 0.6); ctx.stroke();
      ctx.strokeStyle = lvl === 3 ? C.mud : C.brown; ctx.lineWidth = r * 0.1; ctx.beginPath(); ctx.moveTo(r * 0.1, r * 0.45); ctx.lineTo(ox, oy + orr * 0.6); ctx.stroke();
    }
    const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, orr * 2.6);
    g.addColorStop(0, 'rgba(239,172,40,0.75)'); g.addColorStop(1, 'rgba(239,172,40,0)');
    ctx.fillStyle = g; ell(ox, oy, orr * 2.6, orr * 2.6); ctx.fill();
    ctx.fillStyle = C.gold; ctx.strokeStyle = C.ink; ctx.lineWidth = lw; ell(ox, oy, orr * p, orr * p); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.eye; ell(ox - orr * 0.25, oy - orr * 0.25, orr * 0.35, orr * 0.35); ctx.fill();
    if (lvl === 3) {
      ctx.strokeStyle = C.cream; ctx.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) {
        const n = Math.floor(t * 12) + i * 7;
        if (Math.abs(Math.sin(n * 91.7)) < 0.4) continue;
        const ang = Math.sin(n * 13.3) * TAU;
        ctx.beginPath(); ctx.moveTo(ox + Math.cos(ang) * orr, oy + Math.sin(ang) * orr);
        ctx.lineTo(ox + Math.cos(ang + 0.3) * orr * 1.7, oy + Math.sin(ang + 0.3) * orr * 1.7);
        ctx.lineTo(ox + Math.cos(ang - 0.1) * orr * 2.3, oy + Math.sin(ang - 0.1) * orr * 2.3); ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function star(x, y, s, col) {
  ctx.fillStyle = col; ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.beginPath();
  for (let i = 0; i < 10; i++) { const ang = i / 10 * TAU - Math.PI / 2, q = i % 2 ? s * 0.45 : s; ctx.lineTo(x + Math.cos(ang) * q, y + Math.sin(ang) * q); }
  ctx.closePath(); ctx.fill(); ctx.stroke();
}
function plus(x, y, s, col) {
  const w = s * 0.38;
  ctx.fillStyle = col; ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.beginPath();
  ctx.moveTo(x - w, y - s); ctx.lineTo(x + w, y - s); ctx.lineTo(x + w, y - w); ctx.lineTo(x + s, y - w); ctx.lineTo(x + s, y + w); ctx.lineTo(x + w, y + w);
  ctx.lineTo(x + w, y + s); ctx.lineTo(x - w, y + s); ctx.lineTo(x - w, y + w); ctx.lineTo(x - s, y + w); ctx.lineTo(x - s, y - w); ctx.lineTo(x - w, y - w);
  ctx.closePath(); ctx.fill(); ctx.stroke();
}

// значок усиления над Героем: символ с тёмной обводкой, без кружка
function glyph(b, x, y, s) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const pass of [0, 1]) {
    const col = pass ? BUFF_COL[b] : C.ink;
    ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = pass ? 2.5 : 6;
    ctx.beginPath();
    if (b === 'speed') { ctx.moveTo(x + s * 0.35, y - s); ctx.lineTo(x - s * 0.45, y + s * 0.1); ctx.lineTo(x + s * 0.35, y + s * 0.1); ctx.lineTo(x - s * 0.35, y + s); ctx.stroke(); }
    if (b === 'power') { ctx.moveTo(x, y + s); ctx.lineTo(x, y - s); ctx.moveTo(x - s * 0.75, y - s * 0.2); ctx.lineTo(x, y - s); ctx.lineTo(x + s * 0.75, y - s * 0.2); ctx.stroke(); }
    if (b === 'regen') { ctx.moveTo(x - s, y); ctx.lineTo(x + s, y); ctx.moveTo(x, y - s); ctx.lineTo(x, y + s); ctx.stroke(); }
    if (b === 'sturdy') { ctx.lineWidth = pass ? 2 : 5; ell(x - s * 0.45, y, s * 0.6, s * 0.38); ctx.stroke(); ell(x + s * 0.45, y, s * 0.6, s * 0.38); ctx.stroke(); }
    if (b === 'spiky') {
      ctx.moveTo(x - s, y + s * 0.7); ctx.lineTo(x - s * 0.5, y - s * 0.8); ctx.lineTo(x, y + s * 0.7); ctx.lineTo(x + s * 0.5, y - s * 0.8); ctx.lineTo(x + s, y + s * 0.7);
      ctx.closePath(); ctx.lineWidth = pass ? 1 : 4; ctx.fill(); ctx.stroke();
    }
    if (b === 'will') {
      ctx.moveTo(x, y - s); ctx.quadraticCurveTo(x + s, y + s * 0.2, x, y + s); ctx.quadraticCurveTo(x - s, y + s * 0.2, x, y - s);
      ctx.lineWidth = pass ? 1 : 4; ctx.fill(); ctx.stroke();
    }
  }
}

// «крепкость»: стальная цепь между соседними звеньями цепочки
function drawLinks(pts) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const p = pts[i], q = pts[i + 1], d = Math.hypot(q.x - p.x, q.y - p.y), ang = Math.atan2(q.y - p.y, q.x - p.x);
    const n = Math.max(2, Math.round(d / 9));
    for (let k = 1; k < n; k++) {
      const f = k / n, x = p.x + (q.x - p.x) * f, y = p.y + (q.y - p.y) * f + Math.sin(f * Math.PI) * 3;
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
      ctx.lineWidth = 4.5; ctx.strokeStyle = C.ink; ell(0, 0, 5.5, k % 2 ? 3.2 : 1.4); ctx.stroke();
      ctx.lineWidth = 2; ctx.strokeStyle = k % 2 ? C.stone : C.cream; ell(0, 0, 5.5, k % 2 ? 3.2 : 1.4); ctx.stroke();
      ctx.restore();
    }
  }
}

G.blobs = { drawAlly, drawLinks, drawBits, sweep, pop, BUFF_COL };
})(window.Game = window.Game || {});
