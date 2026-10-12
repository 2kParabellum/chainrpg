// Подиум усиления (graphics.md): каменная плита с болтами, гравировкой и трещинками, своё украшение и частицы
// у каждого усиления, над плитой парит значок (у «воли» — крылья с нимбом). Появление: размытая тень и контур
// квадрата (пока подиум только обещан, padMarks), затем плита падает сверху и поднимает пыль. Исчезновение:
// значок взлетает, по плите бегут трещины, она уходит в пол и рассыпается пылью — и когда подиум взяли, и когда
// его время вышло. Исчезнувшие из state.pads подиумы досматривают анимацию в своём списке (это не состояние игры).
(function (G) {
'use strict';

const { ctx } = G.shapes;
const { COLORS, state } = G;
const TAU = Math.PI * 2;
const INK = '#2a1d0d';
function hexA(h, a) { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
function ell(x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU); }
const hash = (n) => { const s = Math.sin(n * 127.1) * 43758.5; return s - Math.floor(s); };

// каменная плита с деталями: болты по углам, гравировка-рамка, трещинки, свечение верха, украшение под усиление,
// над плитой парит значок (у «воли» — крылья с нимбом)
function drawPad(pad, key, alpha, opt = {}) {
  const def = G.buffs[key], col = key === 'will' ? '#fff4dc' : def.color, t = state.time;
  const x = pad.x, y = pad.y + (opt.dy || 0), w = pad.w, h = pad.h, face = 11, topH = h - face;
  const cx = x + w / 2, cy = y + topH / 2, wave = Math.sin(t * 4);
  ctx.save();
  ctx.globalAlpha = alpha;
  if (opt.sx) { ctx.translate(cx, y + h); ctx.scale(opt.sx, opt.sy); ctx.translate(-cx, -(y + h)); }
  // свечение вокруг
  const g = ctx.createRadialGradient(cx, cy, w * 0.3, cx, cy, w);
  g.addColorStop(0, hexA(col, 0.35 + 0.08 * wave)); g.addColorStop(1, hexA(col, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, w, 0, TAU); ctx.fill();
  // передняя грань с кладкой
  ctx.fillStyle = '#45230d'; ctx.fillRect(x + 2, y + topH, w - 4, face);
  ctx.strokeStyle = '#36170c'; ctx.lineWidth = 1.5;
  ctx.beginPath(); for (const k of [0.33, 0.66]) { ctx.moveTo(x + w * k, y + topH); ctx.lineTo(x + w * k, y + h); } ctx.stroke();
  // верх: камень со светлым углом
  const tg = ctx.createLinearGradient(x, y, x + w, y + topH);
  tg.addColorStop(0, '#927e6a'); tg.addColorStop(1, '#684c3c');
  ctx.fillStyle = tg; ctx.fillRect(x + 2, y + 2, w - 4, topH - 2);
  // светящаяся вставка цвета усиления
  ctx.fillStyle = hexA(col, 0.32 + 0.1 * wave); ctx.fillRect(x + 9, y + 8, w - 18, topH - 14);
  ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.strokeRect(x + 8, y + 7, w - 16, topH - 12);
  ctx.strokeStyle = hexA('#efd8a1', 0.35); ctx.lineWidth = 1; ctx.strokeRect(x + 5, y + 4.5, w - 10, topH - 7);
  // украшение вставки
  decor(key, x + 9, y + 8, w - 18, topH - 14, col, t);
  // трещинки
  ctx.strokeStyle = hexA(INK, 0.6); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x + 3, y + topH * 0.3); ctx.lineTo(x + 7, y + topH * 0.38); ctx.lineTo(x + 5, y + topH * 0.5);
  ctx.moveTo(x + w - 4, y + topH * 0.7); ctx.lineTo(x + w - 8, y + topH * 0.62); ctx.stroke();
  // болты по углам
  for (const [bx, by] of [[x + 5, y + 5], [x + w - 5, y + 5], [x + 5, y + topH - 4], [x + w - 5, y + topH - 4]]) {
    ctx.fillStyle = '#efd8a1'; ell(bx, by, 2.2, 2.2); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
  }
  // контур
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
  ctx.beginPath(); ctx.moveTo(x + 2, y + topH); ctx.lineTo(x + w - 2, y + topH); ctx.stroke();
  // парящий значок со светлым пятном за ним
  if (!opt.noIcon) {
    const fy = cy - 8 + Math.sin(t * 2.5) * 3 + (opt.iconDy || 0);
    ctx.globalAlpha = alpha * (opt.iconA === undefined ? 1 : opt.iconA);
    const ig = ctx.createRadialGradient(cx, fy, 2, cx, fy, w * 0.42);
    ig.addColorStop(0, hexA('#fff4dc', 0.35)); ig.addColorStop(1, hexA('#fff4dc', 0));
    ctx.fillStyle = ig; ell(cx, fy, w * 0.42, w * 0.42); ctx.fill();
    if (key === 'will') G.blobs.drawWingsAt(cx, fy + 12, w * 0.33, t);
    else G.blobs.glyph(key, cx, fy, w * 0.26);
  }
  ctx.restore();
  particles(key, cx, cy, w, col, t, alpha);
}

// гравировка внутри вставки — у каждого усиления своя
function decor(key, x, y, w, h, col, t) {
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.strokeStyle = hexA(INK, 0.35); ctx.fillStyle = hexA(INK, 0.3); ctx.lineWidth = 2;
  if (key === 'speed') { // бегущие шевроны
    const off = (t * 20) % 14;
    for (let i = -1; i < 5; i++) { const xx = x + i * 14 + off; ctx.beginPath(); ctx.moveTo(xx, y + 4); ctx.lineTo(xx + 6, y + h / 2); ctx.lineTo(xx, y + h - 4); ctx.stroke(); }
  } else if (key === 'power') { // язычки пламени снизу
    for (let i = 0; i < 4; i++) { const xx = x + 5 + i * (w - 10) / 3, hh = h * (0.45 + 0.15 * Math.sin(t * 8 + i * 2)); ctx.beginPath(); ctx.moveTo(xx - 5, y + h); ctx.quadraticCurveTo(xx, y + h - hh * 1.6, xx + 5, y + h); ctx.fill(); }
  } else if (key === 'regen') { // плитка из плюсиков
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { const px = x + 7 + i * (w - 14) / 2, py = y + 7 + j * (h - 14); ctx.fillRect(px - 3, py - 1, 6, 2); ctx.fillRect(px - 1, py - 3, 2, 6); }
  } else if (key === 'sturdy') { // звенья цепи по кругу вставки
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) { ell(x + 6 + i * (w - 12) / 3, y + 4, 3.5, 2); ctx.stroke(); ell(x + 6 + i * (w - 12) / 3, y + h - 4, 3.5, 2); ctx.stroke(); }
  } else if (key === 'spiky') { // зубья по краям
    for (let i = 0; i < 5; i++) { const xx = x + 3 + i * (w - 6) / 4; ctx.beginPath(); ctx.moveTo(xx - 3, y); ctx.lineTo(xx, y + 6); ctx.lineTo(xx + 3, y); ctx.fill(); ctx.beginPath(); ctx.moveTo(xx - 3, y + h); ctx.lineTo(xx, y + h - 6); ctx.lineTo(xx + 3, y + h); ctx.fill(); }
  } else if (key === 'will') { // лучи из центра
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + t * 0.3; ctx.beginPath(); ctx.moveTo(x + w / 2, y + h / 2); ctx.lineTo(x + w / 2 + Math.cos(a) * w, y + h / 2 + Math.sin(a) * w); ctx.stroke(); }
  }
  ctx.restore();
}

// частицы над плитой — у каждого усиления свои
function particles(key, cx, cy, w, col, t, alpha) {
  for (let i = 0; i < 4; i++) {
    const k = (t * 0.7 + i / 4 + hash(i + key.length)) % 1, px = cx + (hash(i * 3 + key.length) - 0.5) * w * 0.8;
    const py = cy - k * w * 0.9;
    ctx.globalAlpha = alpha * Math.sin(k * Math.PI) * 0.9;
    if (key === 'speed') { ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - 6, py + 3); ctx.stroke(); }
    else if (key === 'power') { ctx.fillStyle = i % 2 ? '#efac28' : col; ell(px, py, 1.8, 1.8); ctx.fill(); }
    else if (key === 'regen') { ctx.fillStyle = col; ctx.fillRect(px - 3, py - 1, 6, 2); ctx.fillRect(px - 1, py - 3, 2, 6); }
    else if (key === 'sturdy') { ctx.fillStyle = '#efd8a1'; ctx.fillRect(px - 1, py - 1, 2, 2); }
    else if (key === 'spiky') { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(px, py - 3); ctx.lineTo(px + 2, py + 2); ctx.lineTo(px - 2, py + 2); ctx.fill(); }
    else if (key === 'will') { // пёрышки
      ctx.save(); ctx.translate(px + Math.sin(t * 2 + i) * 4, cy - 10 + k * w * 0.6); ctx.rotate(Math.sin(t * 2 + i) * 0.6);
      ctx.fillStyle = '#fff4dc'; ell(0, 0, 4, 1.8); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 0.8; ctx.stroke(); ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

// Появление (сек от начала): 0–0.6 размытая тень растёт и темнеет; 0.45–0.9 проступает контур квадрата;
// 0.9–1.15 плита падает сверху; удар — сплющивание и пыль в стороны
const SPAWN = 1.15;
function drawSpawn(pad, key, s) {
  const cx = pad.x + pad.w / 2, base = pad.y + pad.h, col = key === 'will' ? '#fff4dc' : G.buffs[key].color;
  // тень
  const sh = Math.min(1, s / 0.6), fall = s < 0.9 ? 0 : Math.min(1, (s - 0.9) / 0.25);
  const rr = pad.w * (0.9 - 0.25 * fall);
  const g = ctx.createRadialGradient(cx, base - pad.h * 0.45, rr * 0.2, cx, base - pad.h * 0.45, rr);
  g.addColorStop(0, `rgba(20,10,5,${0.55 * sh})`); g.addColorStop(1, 'rgba(20,10,5,0)');
  ctx.fillStyle = g; ell(cx, base - pad.h * 0.45, rr, rr * 0.8); ctx.fill();
  // контур квадрата прорисовывается по периметру
  if (s > 0.45) {
    const k = Math.min(1, (s - 0.45) / 0.45), per = (pad.w + pad.h) * 2;
    ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.globalAlpha = s < 1.15 ? 0.9 : 0;
    ctx.setLineDash([per * k, per]); ctx.lineDashOffset = 0;
    ctx.strokeRect(pad.x + 2, pad.y + 2, pad.w - 4, pad.h - 4);
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  // падение
  if (s >= 0.9 && s < SPAWN) {
    const k = (s - 0.9) / 0.25;
    drawPad(pad, key, 1, { dy: -140 * (1 - k * k), noIcon: true });
  }
}
// приземление: 0–0.35 сплющивание, пыль 0–0.6
function drawLanding(pad, key, s) {
  const k = Math.min(1, s / 0.35), squash = Math.sin(k * Math.PI) * 0.16;
  drawPad(pad, key, 1, { sx: 1 + squash, sy: 1 - squash, iconA: Math.min(1, s / 0.4), iconDy: (1 - Math.min(1, s / 0.4)) * 10 });
  dust(pad, s, 0.6);
}
function dust(pad, s, dur) {
  if (s > dur) return;
  const k = s / dur, base = pad.y + pad.h - 2;
  for (let i = 0; i < 10; i++) {
    const side = i % 2 ? 1 : -1, sp = 0.6 + hash(i) * 0.6, x0 = pad.x + pad.w / 2 + side * pad.w * (0.2 + hash(i + 7) * 0.3);
    const x = x0 + side * k * pad.w * 0.75 * sp, y = base - Math.sin(k * Math.PI) * 10 * hash(i + 3) - hash(i + 5) * 8;
    const r = 3 + k * 7 * sp;
    ctx.globalAlpha = (1 - k) * 0.75; ctx.fillStyle = i % 3 ? '#927e6a' : '#684c3c';
    ell(x, y, r, r * 0.75); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Исчезновение (сек): 0–0.35 значок взлетает и тает; 0.2–0.5 по плите бегут трещины; 0.5–1.0 плита проседает
// в пол и рассыпается пылью
const VANISH = 1.0;
function drawVanish(pad, key, s) {
  const cx = pad.x + pad.w / 2;
  const sink = s < 0.5 ? 0 : (s - 0.5) / 0.5;
  if (sink < 1) {
    ctx.save(); ctx.beginPath(); ctx.rect(pad.x - 40, pad.y - 80, pad.w + 80, pad.h + 80 - 1); ctx.clip();
    drawPad(pad, key, 1 - sink * 0.6, { dy: sink * pad.h * 0.9, noIcon: s > 0.35, iconA: 1 - s / 0.35, iconDy: -s * 60 });
    ctx.restore();
    if (s > 0.2) {
      const k = Math.min(1, (s - 0.2) / 0.3), y = pad.y + sink * pad.h * 0.9;
      ctx.strokeStyle = '#2a1d0d'; ctx.lineWidth = 2; ctx.globalAlpha = 1 - sink;
      ctx.beginPath();
      ctx.moveTo(cx, y + 4); ctx.lineTo(cx - 6 * k, y + 16 * k); ctx.lineTo(cx + 4 * k, y + 28 * k); ctx.lineTo(cx - 3 * k, y + 40 * k);
      ctx.moveTo(pad.x + 6, y + 30); ctx.lineTo(pad.x + 6 + 14 * k, y + 30 - 6 * k);
      ctx.moveTo(pad.x + pad.w - 6, y + 12); ctx.lineTo(pad.x + pad.w - 6 - 16 * k, y + 12 + 8 * k);
      ctx.stroke(); ctx.globalAlpha = 1;
    }
  }
  if (s > 0.5) dust(pad, s - 0.5, 0.6);
}


// подиум усиления в игре: падение и пыль в первые секунды, исчезновение — как только его взяли
const seen = new WeakMap();      // подиум → когда впервые нарисован и когда начал исчезать
let shown = new Set(), gone = []; // исчезнувшие из игры подиумы, которые ещё рассыпаются: { pad, at }
function drawLive(pad, alpha) {
  const t = state.time;
  let s = seen.get(pad);
  if (!s) { s = { at: t, vAt: null }; seen.set(pad, s); }
  if (pad.usedLeft !== undefined && s.vAt === null && !pad.permanent) s.vAt = t;
  if (s.vAt !== null) { drawVanish(pad, pad.ability, t - s.vAt); return; }
  const age = t - s.at;
  if (age < 0.25) drawSpawn(pad, pad.ability, 0.9 + age);
  else if (age < 0.85) drawLanding(pad, pad.ability, age - 0.25);
  else drawPad(pad, pad.ability, alpha);
}
// обещанный подиум (метка): k 0..1 — тень и контур квадрата
function drawMark(m, k) { drawSpawn(m, m.ability, Math.min(0.9, k * 0.9)); }
// после основного прохода: подиумы, которые пропали из state.pads, рассыпаются ещё VANISH + 0.6 с
function drawGone(pads) {
  const t = state.time, now = new Set(pads);
  for (const p of shown) if (!now.has(p) && !p.permanent && G.buffs[p.ability]) {
    const s = seen.get(p);
    gone.push({ pad: p, at: s && s.vAt !== null ? s.vAt : t });
  }
  shown = new Set(pads.filter((p) => G.buffs[p.ability]));
  gone = gone.filter((g) => t - g.at < VANISH + 0.6);
  for (const g of gone) drawVanish(g.pad, g.pad.ability, t - g.at);
}

G.padArt = { drawPad, drawLive, drawMark, drawGone };
})(window.Game = window.Game || {});
