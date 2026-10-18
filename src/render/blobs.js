// Блобы своих: Герой, дружочки, выбитые и ждущие вербовки. Стиль — в graphics.md.
// Анимация (ходьба, выпад, вспышка урона, радость) выводится из того, как меняется юнит между кадрами:
// у рисования свой кэш на юнита (WeakMap) и свои частицы-кусочки. Состояние игры только читается.
(function (G) {
'use strict';

const { state, allyTypes } = G;
const { clamp } = G.math;
const { glow, stamp, snap, frameAt, dirOf } = G.shapes;
let ctx = G.shapes.ctx; // на время рисования готовой картинки — её холст

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
const VIS = 1.25;      // блоб рисуется крупнее тела-хитбокса
const HAT = 1.35;      // шапки крупнее, чтобы профессию было видно издалека
// цвета значков усилений и шапок профессий — из палитры игры (G.COLORS), чтобы подиумы и интерфейс совпадали
const BUFF_COL = {};
for (const k of Object.keys(G.buffs)) BUFF_COL[k] = G.buffs[k].color;
BUFF_COL.will = C.gold; // значок «воли» — золотой нимб

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

// --- готовые картинки частей ---
// Блоб из 30–60 рисований каждый кадр — дорого, в толпе своих это треть кадра. Поэтому части (тело, глаза, шапка,
// оружие с рукой, вторая рука, «!» над выбитым) рисуются один раз в готовую картинку и дальше только копируются:
// сплющивание — растяжкой картинки, прыжок и выпад — сдвигом, наклон — поворотом. Зрачки смотрят в одно из 16
// направлений, хвосты повязки, кончик колпака, кисточка копья, свет посоха и шара колышутся кадрами
const sprites = G.shapes.spriteCache((g, paint) => { const main = ctx; ctx = g; paint(); ctx = main; });
const DIRS = 16, WAVE = 12;
// рамки в долях r: шапка — вокруг середины тела, оружие с рукой — вокруг руки (для взгляда вправо)
const BOX = {
  body: [-1.05, -1.05, 1.05, 1.05], eyes: [-0.85, -0.6, 0.85, 0.3], hand: [-0.4, -0.4, 0.4, 0.4], mark: [-0.45, -1.1, 0.45, 0.3],
  crown: [-0.95, -1.7, 0.95, -0.5], cap: [-1.5, -1.25, 1.5, -0.35], band: [-1.95, -1, 1.95, 1], nurse: [-0.85, -1.45, 0.85, -0.55],
  wizard: [-1.1, -2.3, 1.1, -0.45],
  fist: [-0.4, -0.4, 0.4, 0.4], gun: [-1, -0.8, 2.2, 0.9], spear: [-0.8, -2, 2.4, 0.9], kit: [-1.1, -3, 1.3, 0.9], orb: [-1.4, -3.1, 1.6, 0.9],
};
const mirror = (b, face) => (face > 0 ? b : [-b[2], b[1], -b[0], b[3]]);
function part(key, r, box, paint) { return sprites.get(key) || sprites.bake(key, r, box, paint); }
// частота колыхания шапки и оружия (рад/с) — кадр WAVE-кадрового цикла
const HAT_WAVE = { band: 7, wizard: 2 }, WEAPON_WAVE = { spear2: 6, kit3: 5, orb1: 8, orb2: 8, orb3: 8 };

// тело без сплющивания: тёмный низ, светлый верх, блик; tired — в тени
function paintBody(r, tired) {
  const rx = r, ry = r * 0.95;
  ell(0, 0, rx, ry); ctx.fillStyle = C.shade; ctx.fill();
  ctx.save();
  ell(0, 0, rx, ry); ctx.clip();
  ctx.fillStyle = C.body; ell(-rx * 0.1, -ry * 0.16, rx * 0.95, ry * 0.86); ctx.fill();
  if (tired) { ctx.fillStyle = 'rgba(42,29,13,0.25)'; ctx.fillRect(-rx, -ry, rx * 2, ry * 2); }
  ctx.fillStyle = 'rgba(255,244,220,0.5)'; ell(-rx * 0.38, -ry * 0.5, rx * 0.24, ry * 0.13, -0.5); ctx.fill();
  ctx.restore();
  ell(0, 0, rx, ry); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke();
}

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
  // обрадуется, когда на голову прилетит шапка с подиума профессии (render/jobart.js)
  if (lvl > a.lvl) a.happyAt = t + (G.jobArt ? G.jobArt.hatFlight(u) : 0);
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
// mode: 'chain' (в цепочке), 'downed' (выбит или брошен: стоит один и дерётся, над ним «!»), 'neutral' (ждёт вербовки)
function drawAlly(u, mode, alpha = 1) {
  baseA = alpha;
  ctx.globalAlpha = alpha;
  const a = track(u), t = state.time, T = allyTypes[u.type];
  const prof = u.ability ? PROF[u.ability] : null;
  // новая профессия: пока её шапка летит с подиума, на голове пусто
  const flying = !T.anchor && u.abilityLevel === 1 && G.jobArt && G.jobArt.hatFlight(u) > 0;
  const hat = T.anchor ? 'crown' : prof && !flying ? prof.hat : null;
  const weapon = T.anchor ? null : prof ? prof.weapon : 'fist';
  const lvl = clamp(u.abilityLevel || 1, 1, 3);
  const isLead = mode === 'chain' && u === state.party[0];
  const buffs = isLead ? Object.keys(u.buffs || {}).filter((k) => u.buffs[k] > 0) : [];
  const r = u.r * VIS, face = a.face;

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
  if (buffs.includes('power')) { sx *= 1.12; sy *= 1.12; }

  const x = u.x + dx, by = u.y - hop, rx = r * sx, ry = r * 0.95 * sy;

  // подобрать можно: мягкое светлое пятно под телом
  if (mode !== 'chain') {
    const k = 0.5 - 0.5 * Math.cos(t * 3), R = r * (1.9 + 0.3 * k);
    glow(ctx, u.x, u.y, R, '#fff4dc', 0.22, r * 0.6 / R);
  }
  // тень на полу
  const sk = 1 - hop / (r * 3);
  ctx.fillStyle = 'rgba(20,10,5,0.45)';
  ell(u.x, u.y + r * 0.85, r * 0.95 * sk, r * 0.3 * sk);
  ctx.fill();

  ctx.save();
  ctx.translate(lean ? x : snap(x), lean ? by : snap(by));
  ctx.rotate(lean);
  if (buffs.includes('power')) glow(ctx, 0, 0, r * 1.9, '#ef3a0c', 0.55, 0.6 / 1.9);
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
  if (buffs.includes('will')) drawWings(rx, ry, r, t);
  const rk = Math.round(r * 4) / 4, fist = weapon === 'fist' ? 1 : 0;
  stamp(part(`k|${rk}|${fist}`, r, BOX.hand, () => drawHand(0, 0, r, weapon)), -face * r * 0.88, r * 0.3 - swing * r * 0.12);
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

  // тело: тёмный низ, светлый верх, блик — готовой картинкой, растянутой на сплющивание; вспышка от удара — поверх
  const tired = eyes === 'tired' ? 1 : 0;
  stamp(part(`b|${rk}|${tired}`, r, BOX.body, () => paintBody(r, tired)), 0, 0, sx, sy);
  if (flash > 0) { ctx.globalAlpha = baseA * 0.9 * flash; ctx.fillStyle = 'rgb(255,250,240)'; ell(0, 0, rx - 1, ry - 1); ctx.fill(); ctx.globalAlpha = baseA; }

  // зрачки смотрят по-настоящему: туда, куда едет Герой или целится звено; ждущий смотрит на Героя
  let look = a.look;
  const lead = state.party[0];
  if (mode === 'neutral' && lead) look = Math.atan2(lead.y - u.y, lead.x - u.x);
  const pupils = eyes === 'normal' || eyes === 'tired' || eyes === 'focus';
  const dir = pupils ? dirOf(look, DIRS) : 0, blink = eyes === 'normal' && ((t + a.seed * 1.7) % 3.3) < 0.12 ? 1 : 0;
  const lx = Math.cos(dir / DIRS * TAU), ly = Math.sin(dir / DIRS * TAU);
  stamp(part(`e|${rk}|${face}|${eyes}|${dir}|${blink}`, r, BOX.eyes, () => drawEyes(eyes, r, face, lx, ly, t, blink)), 0, 0);
  if (hat) {
    const k = HAT_WAVE[hat], fr = k ? frameAt(t * k, TAU, WAVE) : 0, tf = k ? fr / WAVE * TAU / k : 0;
    stamp(part(`h|${hat}|${rk}|${face}|${fr}`, r, BOX[hat], () => drawHat(hat, r, r * 0.95, r, face, tf)), 0, 0, sx, sy);
  }
  if (buffs.includes('will')) drawHalo(ry, r, t);
  else if (mode === 'chain' && state.party[0] && state.party[0].buffs && state.party[0].buffs.will > 0) drawMiniHalo(ry, r, t, a.seed);
  // оружие в передней руке и сама рука — готовой картинкой; искры шара — живьём
  const hx = face * (r * 0.95 + handFx), hy = r * 0.22 + swing * r * 0.12, firing = sa >= 0 && sa < 0.15 ? 1 : 0;
  const wk = WEAPON_WAVE[weapon + lvl], wf = wk ? frameAt(t * wk, TAU, WAVE) : 0, wt = wk ? wf / WAVE * TAU / wk : 0;
  stamp(part(`w|${weapon}|${lvl}|${rk}|${face}|${firing}|${wf}`, r, mirror(BOX[weapon || 'fist'], face), () => {
    drawWeapon(weapon, lvl, 0, 0, r, face, wt, firing, false);
    drawHand(0, 0, r, weapon);
  }), hx, hy);
  if (weapon === 'orb' && lvl === 3) {
    ctx.save(); ctx.translate(hx, hy); ctx.scale(face * 1.2, 1.2);
    orbSparks(r * 0.1, -r * 1.35, r * 0.42, t);
    ctx.restore();
  }
  ctx.restore();

  if (eyes === 'tired') {
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
  // долечивание после лечения медика («Lasting Cure»): один розовый плюсик поднимается над телом
  if (u.cure && u.cure.left > 0 && u.hp < u.maxHp) {
    const k = (t * 1.2 + a.seed) % 1;
    ctx.globalAlpha = baseA * Math.sin(k * Math.PI);
    plus(x + r * 0.5, by - k * r * 1.6, r * 0.2, G.abilities.medic.color);
    ctx.globalAlpha = baseA;
  }

  // над головой: полоска HP (только у раненых), выше — значки усилений Героя
  let top = by - ry - (hat === 'wizard' ? r * 1.3 : hat && hat !== 'band' ? r * 0.75 : 0) - (buffs.includes('will') ? r * 0.7 : 0) - 4;
  if (mode !== 'neutral' && u.hp < u.maxHp) { hpBar(x, top - 5, r, u.hp / u.maxHp); top -= 9; }
  // выбитый или брошенный: «!» над головой — он один, его можно подобрать
  if (mode === 'downed') {
    const bob = Math.sin(t * 5) * 2, ey = top - 8 + bob, px = Math.round(r * 1.1);
    stamp(part(`x|${px}`, r, BOX.mark, () => {
      ctx.font = `bold ${px}px "Trebuchet MS", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = C.ink; ctx.lineJoin = 'round';
      ctx.strokeText('!', 0, 0); ctx.fillStyle = C.gold; ctx.fillText('!', 0, 0);
    }), x, ey);
    top -= r * 1.1;
  }
  if (buffs.length) {
    const gap = 17, y0 = top - 8;
    buffs.forEach((b, i) => {
      if (u.buffs[b] < 4 && Math.floor(t * 6) % 2) return;
      glyph(b, x + (i - (buffs.length - 1) / 2) * gap, y0, 6);
    });
  }
  ctx.globalAlpha = 1;
}

// «воля»: ангельские крылья за спиной — веер из пяти перьев от плеча и пушистое плечо сверху; машут
function feather(a, L, w) {
  const cx = Math.cos(a) * L / 2, cy = Math.sin(a) * L / 2;
  ctx.beginPath(); ctx.ellipse(cx, cy, L / 2, w, a, 0, TAU);
  ctx.fillStyle = C.eye; ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 1.3; ctx.stroke();
  ctx.strokeStyle = 'rgba(146,126,106,0.85)'; ctx.lineWidth = 0.9; ctx.beginPath();
  ctx.moveTo(Math.cos(a) * L * 0.2, Math.sin(a) * L * 0.2); ctx.lineTo(Math.cos(a) * L * 0.85, Math.sin(a) * L * 0.85); ctx.stroke();
}
function drawWings(rx, ry, r, t) {
  const flap = Math.sin(t * 6) * 0.22;
  for (const s of [-1, 1]) {
    ctx.save(); ctx.translate(s * rx * 0.62, -ry * 0.12); ctx.rotate(s * (-0.2 + flap)); ctx.scale(s, 1);
    for (let i = 5; i >= 0; i--) feather(-1.15 + i * 0.27, r * (1.45 - i * 0.12), r * 0.17);
    ell(r * 0.32, -r * 0.18, r * 0.38, r * 0.27, -0.4); ctx.fillStyle = C.eye; ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 1.3; ctx.stroke();
    ctx.restore();
  }
}
// мини-нимб над звеном цепочки, пока у Героя «воля» (она действует на всю цепочку)
function drawMiniHalo(ry, r, t, seed) {
  const y = -ry * 1.45 + Math.sin(t * 3 + seed) * 1.2;
  ctx.strokeStyle = C.ink; ctx.lineWidth = r * 0.17; ell(0, y, r * 0.42, r * 0.13); ctx.stroke();
  ctx.strokeStyle = C.gold; ctx.lineWidth = r * 0.09; ell(0, y, r * 0.42, r * 0.13); ctx.stroke();
}
function drawHalo(ry, r, t) {
  const y = -ry * 1.75 + Math.sin(t * 2.5) * 1.5;
  const g = ctx.createRadialGradient(0, y, r * 0.2, 0, y, r * 1.1);
  g.addColorStop(0, 'rgba(239,172,40,0.45)'); g.addColorStop(1, 'rgba(239,172,40,0)');
  ctx.fillStyle = g; ell(0, y, r * 1.1, r * 0.6); ctx.fill();
  ctx.strokeStyle = C.ink; ctx.lineWidth = r * 0.22; ell(0, y, r * 0.6, r * 0.19); ctx.stroke();
  ctx.strokeStyle = C.gold; ctx.lineWidth = r * 0.13; ell(0, y, r * 0.6, r * 0.19); ctx.stroke();
}

function hpBar(x, y, r, k) {
  const w = Math.max(22, r * 2), h = 4, bx = x - w / 2;
  ctx.fillStyle = C.ink; rr(bx - 1.5, y - 1.5, w + 3, h + 3, 3); ctx.fill();
  ctx.fillStyle = k < 0.35 ? C.orange : G.COLORS.hpAlly; rr(bx, y, w * clamp(k, 0.03, 1), h, 2); ctx.fill();
}

function drawHand(hx, hy, r, weapon) {
  const hr = r * (weapon === 'fist' ? 0.32 : 0.26);
  ell(hx, hy, hr, hr); ctx.fillStyle = C.body; ctx.fill();
  ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.stroke();
}

function drawEyes(mode, r, face, lx, ly, t, blink) {
  const cx = face * r * 0.14, cy = -r * 0.1, sp = r * 0.36;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const s of [-1, 1]) {
    const x = cx + s * sp, y = cy;
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1.6;
    if (mode === 'hurt') {
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - s * r * 0.17, y - r * 0.17); ctx.lineTo(x + s * r * 0.08, y);
      ctx.lineTo(x - s * r * 0.17, y + r * 0.17); ctx.stroke(); continue;
    }
    if (mode === 'happy') { ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y + r * 0.08, r * 0.17, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); continue; }
    if (mode === 'ko') {
      ctx.lineWidth = 1.2; ctx.beginPath();
      for (let k = 0; k < 12; k += 0.4) { const q = r * 0.02 * k; ctx.lineTo(x + Math.cos(k + t * 6 * s) * q, y + Math.sin(k + t * 6 * s) * q); }
      ctx.stroke(); continue;
    }
    const h = (blink ? 0.12 : 1) * (mode === 'focus' ? 0.7 : 1);
    ctx.fillStyle = C.eye; ell(x, y, r * 0.24, r * 0.3 * h); ctx.fill(); ctx.lineWidth = 1.4; ctx.stroke();
    if (!blink) {
      const pr = r * (mode === 'focus' ? 0.1 : 0.13);
      ctx.fillStyle = C.ink; ell(x + lx * r * 0.09, y + ly * r * 0.1 * h, pr, pr); ctx.fill();
      ctx.fillStyle = C.eye; ell(x + lx * r * 0.09 - pr * 0.35, y + ly * r * 0.1 * h - pr * 0.4, pr * 0.32, pr * 0.32); ctx.fill();
    }
    if (mode === 'tired') {
      ctx.fillStyle = C.shade; ctx.beginPath(); ctx.ellipse(x, y, r * 0.24 + 1, r * 0.3 + 1, 0, Math.PI, 0); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - r * 0.24, y); ctx.lineTo(x + r * 0.24, y); ctx.stroke();
    }
    if (mode === 'focus') {
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + s * r * 0.26, y - r * 0.4); ctx.lineTo(x - s * r * 0.22, y - r * 0.32); ctx.stroke();
    }
  }
}

// шапки профессий: цвет шапки = цвет профессии (graphics.md)
function drawHat(hat, rx, ry, r, face, t) {
  if (!hat) return;
  if (hat !== 'band') {
    ctx.save(); ctx.translate(0, -ry * 0.75); ctx.scale(HAT, HAT); ctx.translate(0, ry * 0.75);
    drawHatShape(hat, rx, ry, r, face, t);
    ctx.restore();
    return;
  }
  drawHatShape(hat, rx, ry, r, face, t);
}

function drawHatShape(hat, rx, ry, r, face, t) {
  ctx.strokeStyle = C.ink; ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
  if (hat === 'crown') {
    ctx.fillStyle = C.gold;
    const w = r * 0.62, b = -ry * 0.82, h = r * 0.5;
    ctx.beginPath(); ctx.moveTo(-w, b); ctx.lineTo(-w, b - h); ctx.lineTo(-w * 0.45, b - h * 0.5); ctx.lineTo(0, b - h * 1.15);
    ctx.lineTo(w * 0.45, b - h * 0.5); ctx.lineTo(w, b - h); ctx.lineTo(w, b); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.red; ell(0, b - h * 0.35, r * 0.09, r * 0.09); ctx.fill();
  } else if (hat === 'cap') {
    ctx.fillStyle = C.olive; ctx.beginPath(); ctx.ellipse(0, -ry * 0.5, rx * 0.8, ry * 0.58, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.green; ell(face * rx * 0.62, -ry * 0.52, rx * 0.42, ry * 0.12); ctx.fill(); ctx.stroke();
  } else if (hat === 'band') {
    const sw = Math.sin(t * 7) * r * 0.16;
    ctx.fillStyle = C.orange;
    ctx.beginPath(); ctx.moveTo(-face * rx * 0.85, -ry * 0.62); ctx.quadraticCurveTo(-face * rx * 1.6, -ry * 0.7 + sw, -face * rx * 1.85, -ry * 0.2 + sw);
    ctx.lineTo(-face * rx * 1.45, -ry * 0.2 + sw * 0.5); ctx.lineTo(-face * rx * 0.85, -ry * 0.38); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.save(); ell(0, 0, rx, ry); ctx.clip();
    ctx.fillRect(-rx, -ry * 0.78, rx * 2, ry * 0.36); ctx.strokeRect(-rx * 1.2, -ry * 0.78, rx * 2.4, ry * 0.36);
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
    star(rx * 0.05, -ry * 1.05, r * 0.18, C.cream);
  }
}

// шапка профессии отдельно, без тела (подиум профессии): x, y — где была бы середина тела радиуса r
// под шапкой — оружие профессии первого уровня, чтобы было видно, чем звено будет драться
function hatIcon(ability, x, y, r, face = 1) {
  const p = PROF[ability];
  if (!p) return;
  ctx.save(); ctx.translate(x, y);
  drawHat(p.hat, r, r * 0.95, r, face, state.time);
  const wx = p.weapon === 'spear' ? -r * 0.55 : p.weapon === 'gun' ? -r * 0.45 : -r * 0.2;
  drawWeapon(p.weapon, 1, wx, r * 0.05, r * 1.15, face, state.time, false);
  ctx.restore();
}

// оружие в передней руке, растёт с уровнем профессии; рисуется в системе руки, смотрит по face
function drawWeapon(w, lvl, hx, hy, r, face, t, firing, sparks = true) {
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
      glow(ctx, r * 0.1, -r * 1.45, r * 0.9, C.teal, 0.5 + 0.2 * Math.sin(t * 5));
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
    glow(ctx, ox, oy, orr * 2.6, C.teal, 0.8);
    ctx.fillStyle = C.teal; ctx.strokeStyle = C.ink; ctx.lineWidth = lw; ell(ox, oy, orr * p, orr * p); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.eye; ell(ox - orr * 0.25, oy - orr * 0.25, orr * 0.35, orr * 0.35); ctx.fill();
    if (lvl === 3 && sparks) orbSparks(ox, oy, orr, t);
  }
  ctx.restore();
}
// искры вокруг шара Spark Mate 3-го уровня — в системе оружия
function orbSparks(ox, oy, orr, t) {
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
      // нимб: золотое кольцо в перспективе
      ctx.lineWidth = pass ? 2.6 : 6; ell(x, y, s * 1.05, s * 0.42); ctx.stroke();
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

// крылья с нимбом отдельно, без тела (подиум «воли»): x, y — где была бы середина тела радиуса r
function drawWingsAt(x, y, r, t) {
  ctx.save(); ctx.translate(x, y);
  drawWings(r, r * 0.95, r, t); drawHalo(r * 0.95, r, t);
  ctx.restore();
}

G.blobs = { drawWingsAt, drawAlly, drawLinks, drawBits, sweep, pop, hatIcon, glyph, BUFF_COL };
})(window.Game = window.Game || {});
