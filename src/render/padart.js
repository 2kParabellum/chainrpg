// Подиум усиления (graphics.md): каменная плита с болтами, гравировкой и трещинками, своё украшение и частицы
// у каждого усиления, над плитой парит значок (у «воли» — крылья с нимбом). Появление: тёмный пунктирный квадрат и размытая
// тень, которая из круга становится квадратом (пока подиум только обещан, padMarks), затем плита падает сверху и поднимает пыль. Исчезновение:
// значок взлетает, по плите бегут трещины, она уходит в пол и рассыпается пылью — и когда подиум взяли, и когда
// его время вышло. Исчезнувшие из state.pads подиумы досматривают анимацию в своём списке (это не состояние игры).
(function (G) {
'use strict';

const { stamp, frameAt } = G.shapes;
let ctx = G.shapes.ctx; // на время рисования готовой картинки — её холст
const { COLORS, state } = G;
const TAU = Math.PI * 2;
const INK = '#2a1d0d';
function hexA(h, a) { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
function ell(x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU); }
const hash = (n) => { const s = Math.sin(n * 127.1) * 43758.5; return s - Math.floor(s); };

// Плита — готовые картинки: зад (передняя грань с кладкой, каменный верх), узор вставки (у бегущих шевронов,
// пламени и лучей — кадрами) и перед (рамки вставки, неподвижный узор, трещинки, болты, контур). Живьём —
// свечение вокруг, мерцание вставки, парящий значок (сам значок — картинкой) и частицы
const sprites = G.shapes.spriteCache((g, paint) => { const main = ctx; ctx = g; paint(); ctx = main; });
function part(key, box, paint) { return sprites.get(key) || sprites.bake(key, 1, box, paint); }
const FACE = 11;
// узор вставки, который движется: период (с) и сколько кадров на него (лучи «воли» тянутся далеко — кадров больше)
const DECOR_CYCLE = { speed: [0.7, 12], power: [Math.PI / 4, 12], will: [Math.PI * 2 / 0.3 / 8, 32] };

// передняя грань с кладкой и каменный верх; (0, 0) — левый верхний угол плиты
function paintBack(w, h) {
  const topH = h - FACE;
  ctx.fillStyle = '#45230d'; ctx.fillRect(2, topH, w - 4, FACE);
  ctx.strokeStyle = '#36170c'; ctx.lineWidth = 1.5;
  ctx.beginPath(); for (const k of [0.33, 0.66]) { ctx.moveTo(w * k, topH); ctx.lineTo(w * k, h); } ctx.stroke();
  const tg = ctx.createLinearGradient(0, 0, w, topH);
  tg.addColorStop(0, '#927e6a'); tg.addColorStop(1, '#684c3c');
  ctx.fillStyle = tg; ctx.fillRect(2, 2, w - 4, topH - 2);
}
// рамки вставки (у погасшей — тусклая), неподвижный узор, трещинки, болты по углам, контур
function paintFront(key, col, w, h, dormant) {
  const topH = h - FACE;
  ctx.strokeStyle = dormant ? hexA(col, 0.5) : col; ctx.lineWidth = 2.5; ctx.strokeRect(8, 7, w - 16, topH - 12);
  ctx.strokeStyle = hexA('#efd8a1', 0.35); ctx.lineWidth = 1; ctx.strokeRect(5, 4.5, w - 10, topH - 7);
  if (!dormant && !DECOR_CYCLE[key]) decor(key, 9, 8, w - 18, topH - 14, col, 0);
  ctx.strokeStyle = hexA(INK, 0.6); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(3, topH * 0.3); ctx.lineTo(7, topH * 0.38); ctx.lineTo(5, topH * 0.5);
  ctx.moveTo(w - 4, topH * 0.7); ctx.lineTo(w - 8, topH * 0.62); ctx.stroke();
  for (const [bx, by] of [[5, 5], [w - 5, 5], [5, topH - 4], [w - 5, topH - 4]]) {
    ctx.fillStyle = '#efd8a1'; ell(bx, by, 2.2, 2.2); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
  }
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(2, 2, w - 4, h - 4);
  ctx.beginPath(); ctx.moveTo(2, topH); ctx.lineTo(w - 2, topH); ctx.stroke();
}

// каменная плита с деталями: болты по углам, гравировка-рамка, трещинки, свечение верха, украшение под усиление,
// над плитой парит значок (у «воли» — крылья с нимбом)
function drawPad(pad, key, alpha, opt = {}) {
  const def = G.buffs[key], col = key === 'will' ? '#fff4dc' : def.color, t = state.time;
  const x = pad.x, y = pad.y + (opt.dy || 0), w = pad.w, h = pad.h, topH = h - FACE;
  const cx = x + w / 2, cy = y + topH / 2, wave = Math.sin(t * 4), box = [0, 0, w, h];
  ctx.save();
  ctx.globalAlpha = alpha;
  if (opt.sx) { ctx.translate(cx, y + h); ctx.scale(opt.sx, opt.sy); ctx.translate(-cx, -(y + h)); }
  const dormant = opt.charge !== undefined;
  // свечение вокруг
  if (!dormant) G.shapes.glow(ctx, cx, cy, w, col, 0.35 + 0.08 * wave, 0.3);
  stamp(part(`back|${w}|${h}`, box, () => paintBack(w, h)), x, y);
  // светящаяся вставка цвета усиления
  if (dormant) { // погасла: тёмная вставка, снизу набирается цвет усиления
    const ih = topH - 14, fh = ih * opt.charge;
    ctx.fillStyle = hexA(INK, 0.75); ctx.fillRect(x + 9, y + 8, w - 18, ih);
    ctx.fillStyle = hexA(col, 0.55); ctx.fillRect(x + 9, y + 8 + ih - fh, w - 18, fh);
    ctx.fillStyle = hexA('#fff4dc', 0.5); ctx.fillRect(x + 9, y + 8 + ih - fh, w - 18, Math.min(2, fh));
  } else {
    ctx.fillStyle = col; ctx.globalAlpha = alpha * (0.32 + 0.1 * wave); ctx.fillRect(x + 9, y + 8, w - 18, topH - 14);
    ctx.globalAlpha = alpha;
    const cyc = DECOR_CYCLE[key];
    if (cyc) {
      const [period, n] = cyc, f = frameAt(t, period, n);
      stamp(part(`decor|${key}|${w}|${h}|${f}`, box, () => decor(key, 9, 8, w - 18, topH - 14, col, f / n * period)), x, y);
    }
  }
  stamp(part(`front|${key}|${w}|${h}|${dormant ? 1 : 0}`, box, () => paintFront(key, col, w, h, dormant)), x, y);
  // парящий значок со светлым пятном за ним
  if (!opt.noIcon && !dormant) {
    const fy = cy - 8 + Math.sin(t * 2.5) * 3 + (opt.iconDy || 0);
    ctx.globalAlpha = alpha * (opt.iconA === undefined ? 1 : opt.iconA);
    G.shapes.glow(ctx, cx, fy, w * 0.42, '#fff4dc', 0.35, 2 / (w * 0.42));
    if (key === 'will') G.blobs.drawWingsAt(cx, fy + 12, w * 0.33, t);
    else G.blobs.glyphAt(key, cx, fy, w * 0.26);
  }
  ctx.restore();
  if (!dormant) particles(key, cx, cy, w, col, t, alpha);
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

// Появление (сек от начала), пока подиум обещан (метка, MARK с): сразу — тёмный пунктирный квадрат на месте плиты;
// под ним размытая круглая тень растёт, темнеет, становится резче и постепенно принимает форму квадрата.
// MARK..MARK+FALL — плита падает сверху; удар — сплющивание и пыль в стороны
const MARK = 3, FALL = 0.25, SPAWN = MARK + FALL;
function rrect(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function drawSpawn(pad, key, s) {
  const cx = pad.x + pad.w / 2, cy = pad.y + pad.h / 2;
  const lin = Math.min(1, s / MARK), m = lin * lin * (3 - 2 * lin), fall = s < MARK ? 0 : Math.min(1, (s - MARK) / FALL);
  // тень: круг → скруглённый квадрат → квадрат по размеру плиты; края мягкие (слои), к концу резче и темнее
  const sw = pad.w * (0.4 + 0.5 * m), sh = pad.h * (0.4 + 0.5 * m);
  const rad = sw / 2 + (3 - sw / 2) * Math.pow(m, 1.6);
  const blur = 16 - 13 * m - 2 * fall, a = 0.12 + 0.45 * m + 0.15 * fall, N = 7;
  ctx.fillStyle = 'rgb(20,10,5)';
  for (let i = 0; i < N; i++) {
    const e = blur * (1 - i / (N - 1));
    ctx.globalAlpha = a / N * 1.6;
    rrect(cx - sw / 2 - e, cy - sh / 2 - e, sw + e * 2, sh + e * 2, rad + e); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // тёмный пунктир на месте будущей плиты — сразу квадратный, медленно бежит по кругу
  ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.globalAlpha = Math.min(1, s / 0.15) * 0.9 * (1 - fall);
  ctx.setLineDash([7, 6]); ctx.lineDashOffset = -state.time * 10;
  ctx.strokeRect(pad.x + 1, pad.y + 1, pad.w - 2, pad.h - 2);
  ctx.setLineDash([]); ctx.lineCap = 'butt'; ctx.globalAlpha = 1;
  // падение
  if (s >= MARK && s < SPAWN) drawPad(pad, key, 1, { dy: -140 * (1 - fall * fall), noIcon: true });
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
  if (age < FALL) drawSpawn(pad, pad.ability, MARK + age);
  else if (age < FALL + 0.6) drawLanding(pad, pad.ability, age - FALL);
  else drawPad(pad, pad.ability, alpha);
}
// обещанный подиум (метка): k 0..1 — пунктир и тень, которая из круга становится квадратом
function drawMark(m, k) { drawSpawn(m, m.ability, Math.min(MARK, k * MARK)); }
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

// постоянный подиум (pad.permanent): не исчезает. Взяли — значок улетает вверх и тает, вставка гаснет; пока он
// на перезарядке, вставка снизу набирается цветом усиления, посередине секунды; загорелся — рамка-вспышка,
// значок падает сверху с отскоком. Переходы замечаются по pad.cooldown (кэш рендера)
const perm = new WeakMap();
function drawPermanent(pad) {
  const t = state.time, key = pad.ability, col = key === 'will' ? '#fff4dc' : G.buffs[key].color;
  let s = perm.get(pad);
  if (!s) { s = { cd: pad.cooldown, offAt: -9, onAt: -9 }; perm.set(pad, s); }
  if (pad.cooldown > 0 && !(s.cd > 0)) s.offAt = t;
  if (!(pad.cooldown > 0) && s.cd > 0) s.onAt = t;
  s.cd = pad.cooldown;
  const cx = pad.x + pad.w / 2, cy = pad.y + pad.h / 2;
  if (pad.cooldown > 0) {
    const e = t - s.offAt;
    if (e < 0.5) {
      drawPad(pad, key, 1, { charge: 1 - e / 0.5 });
      ctx.globalAlpha = 1 - e / 0.5; G.blobs.glyphAt(key, cx, cy - 12 - e * 120, pad.w * 0.26); ctx.globalAlpha = 1;
      return;
    }
    drawPad(pad, key, 1, { charge: 1 - pad.cooldown / (pad.cooldownTime || 1) });
    ctx.save();
    ctx.font = 'bold 18px "Trebuchet MS", "Segoe UI", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.globalAlpha = 0.95;
    ctx.strokeText(String(Math.ceil(pad.cooldown)), cx, cy - 6); ctx.fillStyle = col; ctx.fillText(String(Math.ceil(pad.cooldown)), cx, cy - 6);
    ctx.restore();
    return;
  }
  const e = t - s.onAt;
  if (e > 0.85) { drawPad(pad, key, 1); return; }
  const dy = e < 0.35 ? -40 * (1 - e / 0.35) ** 2 : -Math.abs(Math.sin((e - 0.35) * 10)) * 6 * Math.max(0, 1 - (e - 0.35) / 0.5);
  drawPad(pad, key, 1, { iconDy: dy });
  if (e < 0.5) {
    const k = e / 0.5;
    ctx.globalAlpha = 1 - k; ctx.strokeStyle = col; ctx.lineWidth = 4;
    ctx.strokeRect(pad.x - k * 14, pad.y - k * 14, pad.w + k * 28, pad.h + k * 28);
    ctx.fillStyle = hexA('#fff4dc', 0.6 * (1 - k)); ctx.fillRect(pad.x + 2, pad.y + 2, pad.w - 4, pad.h - 15);
    ctx.globalAlpha = 1;
  }
}

G.padArt = { drawPad, drawLive, drawMark, drawGone, drawPermanent, MARK, FALL, SPAWN };
})(window.Game = window.Game || {});
