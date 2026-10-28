// Флаги «Capture the Flags». Площадка — низкая каменная плита на полу (тень, тёмная боковина, светлая кромка слева
// сверху, заклёпки по углам) со вставкой посередине; в дальнем левом углу — древко с золотым навершием. Без часового
// по краю вставки бежит золотой пунктир — сюда положить дружочка; никого нет — древко голое, вставка тёмная. Флаг горит
// (лежит часовой или едет цепочка) — вставка горит бирюзой, вокруг мягкое свечение, по древку поднимается полотнище
// (бирюзовое с короной, как флажок на избушке базы) и полощется; часового ранят — полотнище вздрагивает. Флаг погас —
// полотнище быстро соскальзывает вниз и пропадает.
// Плиты рисуются на полу, под телами (drawPlates), древки с полотнищами — поверх тел (drawPoles).
// Флажки-чекпоинты «Endless Run» — ворота поперёк дороги (world.track.gates, кроме линии старта): по древку с треугольным
// флажком у каждого края дороги и пунктир между ними на полу. Следующие по ходу — золотые: флажки полощутся, пунктир
// бежит, под древками свечение; пройденные за этот круг — бирюзовые; остальные — тусклые, флажки обвисли. Пунктир — на
// полу (drawGateLines), древки — поверх тел (drawGatePoles).
// Состояние только читается (state.flags, state.race).
(function (G) {
'use strict';

const { COLORS, state } = G;
const { ctx, glow, visible } = G.shapes;
const { clamp } = G.math;
const { world } = G.world;

const TAU = Math.PI * 2, INK = '#2a1d0d', GOLD = '#efac28', STONE = '#927e6a', TEAL = COLORS.flag;
const POLE = 72;               // высота древка над основанием
const CLOTH_W = 34, CLOTH_H = 20;

function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

// основание древка — в дальнем левом углу плиты (часовой ложится в середину и его не закрывает)
function poleFoot(b) { return { x: b.x + 12, y: b.y + 13 }; }

function drawPlate(f) {
  const b = f.btn, { x, y, w, h } = b, t = state.time;
  if (!visible({ x: x - 30, y: y - 30, w: w + 60, h: h + 60 })) return;
  ctx.fillStyle = 'rgba(20,10,5,0.35)';
  rr(x - 3, y + 5, w + 6, h + 4, 10); ctx.fill();
  if (f.raise > 0) glow(ctx, x + w / 2, y + h / 2, w * 1.15, TEAL, 0.4 * f.raise);
  // боковина и верх плиты
  ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
  ctx.fillStyle = '#45230d'; rr(x, y + 5, w, h - 5, 9); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#684c3c'; rr(x, y, w, h - 5, 9); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = STONE; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x + 5, y + h - 16); ctx.lineTo(x + 5, y + 9); ctx.quadraticCurveTo(x + 5, y + 5, x + 9, y + 5);
  ctx.lineTo(x + w - 16, y + 5); ctx.stroke();
  // заклёпки по углам (левый верхний занят древком)
  ctx.fillStyle = STONE; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
  for (const [px, py] of [[x + w - 9, y + 9], [x + 9, y + h - 14], [x + w - 9, y + h - 14]]) { circle(px, py, 3); ctx.fill(); ctx.stroke(); }
  // вставка: тёмная, у поднятого флага — бирюзовая
  const ix = x + 15, iy = y + 13, iw = w - 30, ih = h - 31;
  ctx.fillStyle = '#36170c'; rr(ix, iy, iw, ih, 6); ctx.fill();
  if (f.raise > 0) {
    ctx.globalAlpha = f.raise * (0.75 + 0.15 * Math.sin(t * 4));
    ctx.fillStyle = TEAL; rr(ix, iy, iw, ih, 6); ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (!f.guard) {
    // без часового: золотой пунктир бежит по краю вставки — сюда надо положить дружочка
    ctx.strokeStyle = GOLD; ctx.lineWidth = 2;
    ctx.globalAlpha = 0.55 + 0.3 * Math.sin(t * 5);
    ctx.setLineDash([6, 5]); ctx.lineDashOffset = -t * 18;
    rr(ix - 3, iy - 3, iw + 6, ih + 6, 8); ctx.stroke();
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = INK; ctx.lineWidth = 2; rr(ix, iy, iw, ih, 6); ctx.stroke();
  // гнездо древка
  const p = poleFoot(b);
  ctx.fillStyle = INK; circle(p.x, p.y, 5); ctx.fill();
}

// полотнище на древке: верх — на высоте top, k (0..1) — насколько видно (соскальзывает — гаснет), shake — вздрагивает
function drawCloth(px, top, t, k, shake) {
  const dx = shake * Math.sin(t * 60) * 2;
  ctx.globalAlpha = k;
  ctx.fillStyle = TEAL; ctx.strokeStyle = INK; ctx.lineWidth = 2;
  const wave = (q, phase) => Math.sin(t * 6 - q * 4 + phase) * 3.5 * q;
  ctx.beginPath(); ctx.moveTo(px, top);
  for (let i = 0; i <= 6; i++) { const q = i / 6; ctx.lineTo(px + q * CLOTH_W + dx * q, top + wave(q, 0)); }
  for (let i = 6; i >= 0; i--) { const q = i / 6; ctx.lineTo(px + q * CLOTH_W + dx * q, top + CLOTH_H + wave(q, 0.4)); }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // корона на полотнище
  const cx = px + 15 + dx * 0.4, cy = top + CLOTH_H / 2 + wave(0.45, 0.2);
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.moveTo(cx - 6, cy + 4); ctx.lineTo(cx - 6, cy - 3); ctx.lineTo(cx - 3, cy); ctx.lineTo(cx, cy - 5);
  ctx.lineTo(cx + 3, cy); ctx.lineTo(cx + 6, cy - 3); ctx.lineTo(cx + 6, cy + 4); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
}

function drawPole(f) {
  const b = f.btn, p = poleFoot(b), t = state.time;
  if (!visible({ x: p.x - 10, y: p.y - POLE - 10, w: CLOTH_W + 20, h: POLE + 20 })) return;
  const top = p.y - POLE;
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK; ctx.lineWidth = 5.5;
  ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, top); ctx.stroke();
  ctx.strokeStyle = COLORS.flagPole; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = GOLD; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
  circle(p.x, top - 3, 4.5); ctx.fill(); ctx.stroke();
  if (f.raise <= 0) return;
  // поднимается плавно, с замедлением у верха; падает — соскальзывает и гаснет. У флага гнезда («Seal the Gates») — ровно,
  // вместе с заслонкой: высота полотнища — сколько осталось до закрытия
  const k = f.held && !f.nest ? 1 - (1 - f.raise) * (1 - f.raise) : f.raise;
  const low = p.y - CLOTH_H - 8, high = top + 5;
  const shake = f.guard ? clamp(1 - (t - f.hitAt) / 0.35, 0, 1) : 0;
  drawCloth(p.x + 1, low + (high - low) * k, t, f.held ? 1 : clamp(f.raise * 3, 0, 1), shake);
}

function drawPlates() { for (const f of state.flags) drawPlate(f); }
function drawPoles() { for (const f of state.flags) drawPole(f); }

// --- флажки-чекпоинты «Endless Run» ---
const GATE_INSET = 56;          // на сколько древко отступает от края дороги внутрь (у стены снизу её верх закрывает 48)
const GATE_POLE = 58;           // высота древка
const GATE_LOOK = {
  next: { cloth: GOLD, line: GOLD, alpha: 0.85 },
  done: { cloth: TEAL, line: TEAL, alpha: 0.4 },
  ahead: { cloth: STONE, line: STONE, alpha: 0.3 },
};

// ворота i (1..) на этом круге: 'next' — Герой едет к ним, 'done' — уже пройдены, 'ahead' — дальше по кругу
function gateState(i) {
  const next = G.race.nextGate();
  if (i === next) return 'next';
  const started = state.race.startAt !== null;
  return started && (next === 0 || i < next) ? 'done' : 'ahead';
}

// где у ворот g стоят древки: на концах поперёк дороги, отступив от краёв
function gateFeet(g) {
  const d = g.half - 30 - GATE_INSET, nx = -g.ty, ny = g.tx;
  return [{ x: g.x + nx * d, y: g.y + ny * d }, { x: g.x - nx * d, y: g.y - ny * d }];
}

function gateBox(g) {
  const d = g.half;
  return { x: g.x - d, y: g.y - d - GATE_POLE, w: d * 2, h: d * 2 + GATE_POLE };
}

function eachGate(fn) {
  if (!world.track || !world.track.flags || !state.race) return;
  world.track.gates.forEach((g, i) => { if (i > 0 && visible(gateBox(g))) fn(g, gateState(i)); });
}

// пунктир поперёк дороги между древками; у следующих ворот бежит по ходу и ярче
function drawGateLine(g, st) {
  const [a, b] = gateFeet(g), look = GATE_LOOK[st], t = state.time;
  ctx.strokeStyle = look.line; ctx.lineWidth = st === 'next' ? 4 : 3;
  ctx.globalAlpha = look.alpha * (st === 'next' ? 0.75 + 0.25 * Math.sin(t * 5) : 1);
  ctx.setLineDash([12, 10]); ctx.lineDashOffset = st === 'next' ? -t * 30 : 0;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.setLineDash([]); ctx.lineDashOffset = 0;
  ctx.globalAlpha = 1;
}

// древко с треугольным флажком; у следующих ворот флажок полощется, у тусклых — обвис
function drawGatePole(p, st, phase) {
  const look = GATE_LOOK[st], t = state.time, top = p.y - GATE_POLE;
  if (st === 'next') glow(ctx, p.x, p.y, 26, GOLD, 0.35 + 0.15 * Math.sin(t * 5));
  ctx.fillStyle = 'rgba(20,10,5,0.35)';
  ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, 7, 3, 0, 0, TAU); ctx.fill();
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, top); ctx.stroke();
  ctx.strokeStyle = COLORS.flagPole; ctx.lineWidth = 2.2; ctx.stroke();
  ctx.lineCap = 'butt';
  const droop = st === 'ahead', len = droop ? 18 : 26, sway = droop ? 0 : Math.sin(t * 7 + phase) * 3;
  ctx.fillStyle = look.cloth; ctx.strokeStyle = INK; ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(p.x + 1, top + 2);
  if (droop) { ctx.lineTo(p.x + 7, top + 2 + len); ctx.lineTo(p.x + 1, top + 16); }
  else { ctx.quadraticCurveTo(p.x + len / 2, top + 4 + sway, p.x + len, top + 9 + sway); ctx.lineTo(p.x + 1, top + 17); }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = GOLD; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
  circle(p.x, top - 2, 3.5); ctx.fill(); ctx.stroke();
}

function drawGateLines() { eachGate(drawGateLine); }
function drawGatePoles() {
  eachGate((g, st) => gateFeet(g).forEach((p, k) => drawGatePole(p, st, k * 1.7 + g.x * 0.01)));
}

G.flagArt = { drawPlates, drawPoles, drawGateLines, drawGatePoles };
})(window.Game = window.Game || {});
