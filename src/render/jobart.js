// Подиум профессии (graphics.md): круглый каменный постамент с ободком цвета профессии, над ним парит её шапка с
// оружием, снизу подпись. Пока отдать его некому (в цепочке нет пустого дружочка и нет звена этой профессии ниже
// максимального уровня) — серый и тусклый. Появление и исчезновение — как у подиума усиления (render/padart.js),
// только всё круглое: пунктирный эллипс основания и размытая тень, которая из круга становится эллипсом
// (пока подиум обещан, padMarks), затем постамент падает сверху и поднимает пыль; исчезая, шапка тает, по камню
// бегут трещины, постамент уходит в пол. Подбор (эффект jobGet): шапка слетает с подиума по дуге на голову
// получившего, вспышка, над ним возникают и гаснут ромбики уровня.
(function (G) {
'use strict';

const { COLORS, state } = G;
const { ctx } = G.shapes;
const TAU = Math.PI * 2, INK = '#2a1d0d';
function hexA(h, a) { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
function ell(x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU); }
const hash = (n) => { const s = Math.sin(n * 127.1) * 43758.5; return s - Math.floor(s); };

// геометрия постамента: центр верха, полуоси, высота боковины
function geo(pad) {
  const r = pad.w / 2, cx = pad.x + r, cy = pad.y + r;
  return { r, cx, cy, rx: r * 0.9, ry: r * 0.45, top: cy + r * 0.15, h: r * 0.28 };
}

// постамент: opt.dy — сдвиг (падение), opt.sx/sy — сплющивание, opt.noIcon / iconA / iconDy — шапка,
// opt.crack 0..1 — трещины, opt.grey — отдать некому, opt.labelA / noLabel — подпись
function drawBase(pad, key, alpha, opt = {}) {
  const def = G.abilities[key], g = geo(pad), active = !opt.grey;
  const cx = g.cx, top = g.top + (opt.dy || 0), rx = g.rx, ry = g.ry, h = g.h, r = g.r;
  const color = active ? def.color : COLORS.neutral, wave = Math.sin(state.time * 3);
  ctx.save();
  if (opt.sx) { ctx.translate(cx, top + h); ctx.scale(opt.sx, opt.sy); ctx.translate(-cx, -(top + h)); }
  if (active && !opt.noGlow) {
    ctx.globalAlpha = (0.3 + 0.08 * wave) * alpha;
    G.shapes.glow(ctx, cx, top, r * 1.4, color, 1, 0.3 / 1.4, '#000000');
  }
  ctx.globalAlpha = (active ? 1 : 0.55) * alpha;
  ctx.strokeStyle = COLORS.floorLine; ctx.lineWidth = 2;
  // боковина
  ctx.fillStyle = COLORS.wallSide;
  ctx.beginPath(); ctx.ellipse(cx, top + h, rx, ry, 0, 0, Math.PI); ctx.lineTo(cx - rx, top);
  ctx.ellipse(cx, top, rx, ry, 0, Math.PI, 0, true); ctx.closePath(); ctx.fill(); ctx.stroke();
  // верх и ободок цвета профессии
  ctx.fillStyle = COLORS.wall; ell(cx, top, rx, ry); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 4; ell(cx, top, rx - 3, ry - 2); ctx.stroke();
  ctx.strokeStyle = COLORS.floorLine; ctx.lineWidth = 2; ell(cx, top, rx, ry); ctx.stroke();
  if (opt.crack) {
    const k = opt.crack;
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(cx - 2, top - ry * 0.2); ctx.lineTo(cx - rx * 0.3 * k, top + ry * 0.2 * k); ctx.lineTo(cx - rx * 0.15 * k, top + ry * 0.7 * k);
    ctx.moveTo(cx + 3, top - ry * 0.1); ctx.lineTo(cx + rx * 0.45 * k, top - ry * 0.4 * k);
    ctx.moveTo(cx + rx * 0.6, top + ry * 0.9); ctx.lineTo(cx + rx * 0.55, top + ry * 0.9 + h * k);
    ctx.stroke();
  }
  // парящая шапка и её тень на постаменте
  if (!opt.noIcon) {
    const float = active ? Math.sin(state.time * 2.5) * 3 : 0;
    ctx.globalAlpha = (active ? 1 : 0.55) * alpha * (opt.iconA === undefined ? 1 : opt.iconA);
    ctx.fillStyle = 'rgba(20,10,5,0.35)'; ell(cx, top, rx * 0.45, ry * 0.4); ctx.fill();
    G.blobs.hatIcon(key, cx, top - r * 0.2 + float + (opt.iconDy || 0), r * 0.55);
  }
  if (!opt.noLabel) {
    ctx.fillStyle = color; ctx.globalAlpha = (active ? 0.95 : 0.7) * alpha * (opt.labelA === undefined ? 1 : opt.labelA);
    ctx.font = 'bold 12px "Trebuchet MS", "Segoe UI", system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(def.name, cx, pad.y + pad.h + 16 + (opt.dy || 0));
  }
  ctx.restore();
}

// появление (сек от начала): MARK с — пунктирный эллипс основания и тень из круга в эллипс; затем падение
function drawSpawn(pad, key, s) {
  const { MARK, FALL, SPAWN } = G.padArt;
  const g = geo(pad), fy = g.top + g.h;
  const lin = Math.min(1, s / MARK), m = lin * lin * (3 - 2 * lin), fall = s < MARK ? 0 : Math.min(1, (s - MARK) / FALL);
  const R0 = g.rx * 0.42, rx = R0 + (g.rx * 0.92 - R0) * m, ry = R0 + (g.ry * 0.92 - R0) * m;
  const blur = 16 - 13 * m - 2 * fall, a = 0.12 + 0.45 * m + 0.15 * fall, N = 7;
  ctx.fillStyle = 'rgb(20,10,5)';
  for (let i = 0; i < N; i++) {
    const e = blur * (1 - i / (N - 1));
    ctx.globalAlpha = a / N * 1.6; ell(g.cx, fy, rx + e, ry + e); ctx.fill();
  }
  ctx.globalAlpha = Math.min(1, s / 0.15) * 0.9 * (1 - fall);
  ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.setLineDash([7, 6]); ctx.lineDashOffset = -state.time * 10;
  ell(g.cx, fy, g.rx + 2, g.ry + 2); ctx.stroke();
  ctx.setLineDash([]); ctx.lineCap = 'butt'; ctx.globalAlpha = 1;
  if (s >= MARK && s < SPAWN) drawBase(pad, key, 1, { dy: -140 * (1 - fall * fall), noIcon: true, noLabel: true });
}
function dust(pad, s, dur) {
  if (s > dur) return;
  const g = geo(pad), k = s / dur, base = g.top + g.h + g.ry * 0.6;
  for (let i = 0; i < 10; i++) {
    const side = i % 2 ? 1 : -1, sp = 0.6 + hash(i) * 0.6, x0 = g.cx + side * g.rx * (0.3 + hash(i + 7) * 0.5);
    const x = x0 + side * k * pad.w * 0.75 * sp, y = base - Math.sin(k * Math.PI) * 10 * hash(i + 3) - hash(i + 5) * 10;
    const rr = 3 + k * 7 * sp;
    ctx.globalAlpha = (1 - k) * 0.75; ctx.fillStyle = i % 3 ? '#927e6a' : '#684c3c';
    ell(x, y, rr, rr * 0.75); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
// приземление: сплющивание, пыль, шапка опускается на место
function drawLanding(pad, key, s, grey) {
  const k = Math.min(1, s / 0.35), squash = Math.sin(k * Math.PI) * 0.16, ia = Math.min(1, s / 0.4);
  drawBase(pad, key, 1, { sx: 1 + squash, sy: 1 - squash, iconA: ia, iconDy: (1 - ia) * -14, labelA: ia, grey });
  dust(pad, s, 0.6);
}
// исчезновение (VANISH с): шапка взлетает и тает (или улетела к получившему — noIcon), трещины, в пол, пыль
const VANISH = 1.0;
function drawVanish(pad, key, s, noIcon) {
  const g = geo(pad), sink = s < 0.5 ? 0 : (s - 0.5) / 0.5;
  if (sink < 1) {
    ctx.save(); ctx.beginPath(); ctx.rect(pad.x - 60, pad.y - 100, pad.w + 120, g.top + g.h + g.ry + 1 - (pad.y - 100)); ctx.clip();
    drawBase(pad, key, 1 - sink * 0.5, { dy: sink * (g.h + g.ry * 2 + 4), noIcon: noIcon || s > 0.35, iconA: 1 - s / 0.35, iconDy: -s * 60,
      crack: s > 0.2 ? Math.min(1, (s - 0.2) / 0.3) : 0, labelA: 1 - Math.min(1, s / 0.3), noGlow: s > 0.3 });
    ctx.restore();
  }
  if (s > 0.5) dust(pad, s - 0.5, 0.6);
}

// --- подиум в игре: падение в первые секунды, исчезновение, когда пропал из state.pads ---
const seen = new WeakMap();       // подиум → когда впервые нарисован
let shown = new Set(), gone = [];  // пропавшие подиумы, которые ещё рассыпаются: { pad, at, taken }
function drawLive(pad, alpha, grey) {
  const t = state.time;
  let at = seen.get(pad);
  if (at === undefined) { at = t; seen.set(pad, at); }
  const { FALL, MARK } = G.padArt, age = t - at;
  if (age < FALL) drawSpawn(pad, pad.ability, MARK + age);
  else if (age < FALL + 0.6) drawLanding(pad, pad.ability, age - FALL, grey);
  else drawBase(pad, pad.ability, alpha, { grey });
}
// обещанный подиум (метка): k 0..1 — пунктир и тень
function drawMark(m, k) { drawSpawn(m, m.ability, Math.min(G.padArt.MARK, k * G.padArt.MARK)); }
// после основного прохода: пропавшие подиумы профессий рассыпаются; взятый — без шапки (она улетела к звену)
function drawGone(pads) {
  const t = state.time, now = new Set(pads);
  for (const p of shown) if (!now.has(p)) {
    gone.push({ pad: p, at: t, taken: state.effects.some((fx) => fx.type === 'jobGet' && fx.pad === p) });
  }
  shown = new Set(pads.filter((p) => G.abilities[p.ability]));
  gone = gone.filter((g) => t - g.at < VANISH + 0.6);
  for (const g of gone) drawVanish(g.pad, g.pad.ability, t - g.at, g.taken);
}

// --- подбор: эффект jobGet { unit, pad, key, lvl, max, life, total } ---
const FLY = 0.45;
function star(x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, rr = i % 2 ? r * 0.4 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill();
}
const pop = (e) => (e < 0.12 ? e / 0.12 * 1.3 : e < 0.25 ? 1.3 - (e - 0.12) / 0.13 * 0.3 : 1);
function drawGet(fx) {
  const u = fx.unit, key = fx.key, col = G.abilities[key].color, e = fx.total - fx.life;
  const fromX = fx.pad.x + fx.pad.w / 2, fromY = fx.pad.y + fx.pad.h / 2 - 16, toY = u.y - u.r * 1.8;
  // шапка летит по дуге с искрами следом
  if (e < FLY) {
    const at = (k) => ({ x: fromX + (u.x - fromX) * k, y: fromY + (toY - fromY) * k - Math.sin(k * Math.PI) * 60 });
    const k = e / FLY;
    for (let i = 1; i < 6; i++) {
      const p = at(Math.max(0, k - i * 0.05));
      ctx.globalAlpha = 0.7 - i * 0.12; ctx.fillStyle = col; ell(p.x, p.y, 4 - i * 0.5, 4 - i * 0.5); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const p = at(k);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.sin(k * Math.PI) * 0.8); G.blobs.hatIcon(key, 0, 0, 17); ctx.restore();
    return;
  }
  const d = e - FLY;
  // вспышка при попадании: кольцо цвета профессии и звёздочки
  if (d < 0.6) {
    const k = d / 0.6;
    ctx.globalAlpha = 1 - k; ctx.strokeStyle = col; ctx.lineWidth = 4 * (1 - k) + 1;
    ell(u.x, u.y, 18 + k * 30, (18 + k * 30) * 0.8); ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU + 0.3, r = 16 + k * 34;
      ctx.fillStyle = i % 2 ? col : '#fff4dc'; star(u.x + Math.cos(a) * r, u.y - 8 + Math.sin(a) * r * 0.8, 4 * (1 - k) + 1);
    }
    ctx.globalAlpha = 1;
  }
  // ромбики уровня: возникают по одному, новый выскакивает с искрами, в конце гаснут
  const left = fx.life, y = u.y - u.r * 1.25 - 30;
  for (let i = 0; i < fx.max; i++) {
    const x = u.x + (i - (fx.max - 1) / 2) * 16, isNew = i === fx.lvl - 1;
    const din = d - i * 0.06 - (isNew ? 0.2 : 0);
    if (din < 0) continue;
    const sc = pop(din) * Math.min(1, left / 0.35), on = i < fx.lvl;
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.globalAlpha = Math.min(1, left / 0.35);
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(6, 0); ctx.lineTo(0, 7); ctx.lineTo(-6, 0); ctx.closePath();
    ctx.fillStyle = on ? col : '#45230d'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    if (on) { ctx.fillStyle = 'rgba(255,244,220,0.6)'; ctx.fillRect(-2, -4, 2, 3); }
    ctx.restore();
    if (isNew && din < 0.5) {
      const k = din / 0.5; ctx.globalAlpha = 1 - k; ctx.fillStyle = '#fff4dc';
      for (let j = 0; j < 5; j++) { const a = j / 5 * TAU; star(x + Math.cos(a) * (8 + k * 14), y + Math.sin(a) * (8 + k * 14), 3 * (1 - k) + 1); }
      ctx.globalAlpha = 1;
    }
  }
}
// сколько ещё летит шапка к этому звену (0 — не летит); пока летит новая профессия, своей шапки на нём нет
function hatFlight(u) {
  for (const fx of state.effects) if (fx.type === 'jobGet' && fx.unit === u) return Math.max(0, FLY - (fx.total - fx.life));
  return 0;
}

G.jobArt = { drawBase, drawLive, drawMark, drawGone, drawGet, hatFlight };
})(window.Game = window.Game || {});
