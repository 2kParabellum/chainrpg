// Под «Hit the Count» — взводной механизм на полу: низкий каменный круг, по краю — гнёзда-огоньки по числу goal
// (последнее — крупное, круглое, с порталом внутри: это предел), внутри — желобок, по которому бежит золотая дуга взвода,
// посередине — счёт «N/15». Готовый Под обведён бегущим пунктиром, мерцает бирюзой, над ним всплывают плюсики (лечит).
// В проезде огоньки загораются по одному, новый подпрыгивает. После проезда дуга и огоньки отматываются назад, Под
// тёмный, над ним плашка с секундами. Взведён до конца — всё горит золотом (портал выхода renderer рисует поверх).
// Над Подом плашка: сколько дружочков нужно или сколько секунд до готовности. Снаружи — стрелки к стенам, где ждут
// выданные Подом дружочки (загораются со вспышкой, по ним бегут шевроны, у острия — «×N»). Состояние только читается
// (state.pod, world.pod).
(function (G) {
'use strict';

const { state } = G;
const { ctx, glow } = G.shapes;
const { world } = G.world;
const { clamp } = G.math;

const TAU = Math.PI * 2, INK = '#2a1d0d', GOLD = '#efac28', CREAM = '#efd8a1', TEAL = '#3c9f9c', MATE = '#efb775';
const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, r), 0, TAU); }

// угол середины гнезда i (с нуля) из n: первое — сразу справа от верха, дальше по часовой
function slotAngle(i, n) { return -Math.PI / 2 + (i + 0.5) / n * TAU; }

// сколько делений сейчас показано: в проезде — счёт, на перезарядке — счёт плавно отматывается к нулю,
// взведён до конца — все
function shownCount(p, pod) {
  if (state.cleared) return pod.goal;
  if (p.cooldown > 0) return p.count * (p.cooldown / pod.cooldown);
  return p.count;
}

// гнездо-огонёк в каменной оправе, вытянуто вдоль радиуса (a — его угол); горящее — золотое с бликом.
// pop (0..1) — только что загорелось: крупнее
function slot(x, y, a, lit, pop) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a + Math.PI / 2);
  const k = 1 + 0.5 * pop;
  ctx.scale(k, k);
  ctx.fillStyle = '#684c3c'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.roundRect(-9, -13, 18, 26, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = lit ? GOLD : '#36170c';
  ctx.beginPath(); ctx.roundRect(-5.5, -9.5, 11, 19, 4); ctx.fill();
  if (lit) { ctx.fillStyle = CREAM; ctx.beginPath(); ctx.roundRect(-3.5, -7.5, 3.5, 8, 2); ctx.fill(); }
  ctx.restore();
}

// последнее гнездо — предел: крупное, круглое, в кремовой оправе, внутри — маленький портал (крутится пунктир)
function lastSlot(x, y, lit, pop) {
  const k = 1 + 0.5 * pop;
  ctx.fillStyle = lit ? CREAM : '#927e6a'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
  circle(x, y, 18 * k); ctx.fill(); ctx.stroke();
  ctx.fillStyle = lit ? GOLD : '#36170c'; circle(x, y, 12.5 * k); ctx.fill();
  ctx.strokeStyle = lit ? CREAM : '#684c3c'; ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]); ctx.lineDashOffset = -state.time * (lit ? 30 : 8);
  circle(x, y, 8 * k); ctx.stroke();
  ctx.setLineDash([]); ctx.lineDashOffset = 0;
  ctx.fillStyle = lit ? CREAM : '#684c3c'; circle(x, y, 3 * k); ctx.fill();
}

// плюсик лечения над готовым Подом
function plus(x, y, s) {
  const w = s * 0.38;
  ctx.beginPath();
  ctx.moveTo(-w + x, -s + y); ctx.lineTo(w + x, -s + y); ctx.lineTo(w + x, -w + y); ctx.lineTo(s + x, -w + y);
  ctx.lineTo(s + x, w + y); ctx.lineTo(w + x, w + y); ctx.lineTo(w + x, s + y); ctx.lineTo(-w + x, s + y);
  ctx.lineTo(-w + x, w + y); ctx.lineTo(-s + x, w + y); ctx.lineTo(-s + x, -w + y); ctx.lineTo(-w + x, -w + y);
  ctx.closePath(); ctx.fill(); ctx.stroke();
}

// маленький дружочек для плашки: персиковый кружок с глазами
function mateIcon(x, y) {
  ctx.fillStyle = '#efb775'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
  circle(x, y, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = CREAM;
  for (const s of [-1, 1]) { circle(x + s * 2.6, y - 1, 2); ctx.fill(); }
  ctx.fillStyle = INK;
  for (const s of [-1, 1]) { circle(x + 0.6 + s * 2.6, y - 1, 1); ctx.fill(); }
}

// плашка над Подом: на перезарядке — часы и секунды, иначе — дружочек и сколько их надо за проезд
// (золотом, если в цепочке их уже хватает)
function chip(x, y, p, pod) {
  const cooling = p.cooldown > 0, enough = G.pod.podMates() >= pod.goal;
  const txt = cooling ? `${Math.ceil(p.cooldown)}s` : `×${pod.goal}`;
  ctx.font = `bold 15px ${FONT}`;
  const w = ctx.measureText(txt).width + 36;
  ctx.fillStyle = INK; ctx.strokeStyle = cooling ? '#684c3c' : GOLD; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - 13, w, 26, 13); ctx.fill(); ctx.stroke();
  const ix = x - w / 2 + 15;
  if (cooling) {
    ctx.strokeStyle = '#927e6a'; ctx.lineWidth = 2;
    circle(ix, y, 6.5); ctx.moveTo(ix, y); ctx.lineTo(ix, y - 4); ctx.moveTo(ix, y); ctx.lineTo(ix + 3, y + 1); ctx.stroke();
  } else mateIcon(ix, y);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillStyle = cooling ? '#927e6a' : enough ? GOLD : CREAM;
  ctx.fillText(txt, ix + 11, y + 1);
  ctx.textBaseline = 'alphabetic';
}

// стрелка от края Пода (центр — x, y, радиус r) под углом a к стене, где ждут n выданных дружочков; age — секунд,
// как загорелась
function arrow(x, y, r, a, n, age) {
  const t = state.time, k = 1 + 0.4 * clamp(1 - age / 0.4, 0, 1), d0 = r + 56, len = 64;
  ctx.save();
  ctx.translate(x + Math.cos(a) * d0, y + Math.sin(a) * d0);
  ctx.rotate(a);
  ctx.scale(k, k);
  glow(ctx, len * 0.45, 0, 58, MATE, 0.3 + 0.15 * Math.sin(t * 5));
  ctx.fillStyle = MATE; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -9); ctx.lineTo(len - 26, -9); ctx.lineTo(len - 26, -22); ctx.lineTo(len, 0);
  ctx.lineTo(len - 26, 22); ctx.lineTo(len - 26, 9); ctx.lineTo(0, 9); ctx.closePath();
  ctx.fill(); ctx.stroke();
  // бегущий к острию шеврон
  const q = (t * 1.4) % 1, cx = 8 + q * (len - 20);
  ctx.strokeStyle = CREAM; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.globalAlpha = Math.sin(q * Math.PI);
  ctx.beginPath(); ctx.moveTo(cx - 6, -6); ctx.lineTo(cx, 0); ctx.lineTo(cx - 6, 6); ctx.stroke();
  ctx.globalAlpha = 1; ctx.lineCap = 'butt';
  ctx.restore();
  // у острия — сколько их там ждёт
  const lx = x + Math.cos(a) * (d0 + len + 26), ly = y + Math.sin(a) * (d0 + len + 22);
  mateIcon(lx - 11, ly);
  ctx.font = `bold 15px ${FONT}`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
  ctx.strokeText(`×${n}`, lx - 1, ly + 1);
  ctx.fillStyle = MATE; ctx.fillText(`×${n}`, lx - 1, ly + 1);
  ctx.textBaseline = 'alphabetic';
}

function draw() {
  const pod = world.pod, p = state.pod;
  if (!pod || !p) return;
  const { x, y, r, goal } = pod, t = state.time;
  const done = state.cleared, cooling = !done && p.cooldown > 0, ready = !done && !cooling;
  const shown = shownCount(p, pod), lit = Math.floor(shown + 1e-6);
  const pulse = 0.5 + 0.5 * Math.sin(t * 3);

  // свечение: готовый — бирюзовое (лечит), взведённый — золотое
  if (ready) glow(ctx, x, y, r * 1.6, TEAL, 0.22 + 0.1 * pulse, 0.55);
  if (done) glow(ctx, x, y, r * 1.9, GOLD, 0.45, 0.5);
  // низкий каменный круг: тень, боковина, верх
  ctx.fillStyle = 'rgba(20,10,5,0.45)'; circle(x + 4, y + 12, r + 8); ctx.fill();
  ctx.fillStyle = '#45230d'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
  circle(x, y + 7, r + 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = cooling ? '#45230d' : '#684c3c';
  circle(x, y, r + 6); ctx.fill(); ctx.stroke();
  // светлая кромка сверху слева — объём
  ctx.strokeStyle = cooling ? '#684c3c' : '#927e6a'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y, r + 1, Math.PI * 1.05, Math.PI * 1.6); ctx.stroke();
  // бегущий пунктир по краю: готовый — медленно, в проезде — быстро
  if (!cooling) {
    ctx.strokeStyle = done ? GOLD : p.passing ? GOLD : CREAM;
    ctx.globalAlpha = done ? 0.9 : 0.45 + 0.3 * pulse;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([14, 10]); ctx.lineDashOffset = -t * (p.passing || done ? 70 : 18);
    circle(x, y, r + 14); ctx.stroke();
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
    ctx.globalAlpha = 1;
  }

  // желобок и золотая дуга взвода с ярким концом
  const tr = r * 0.6, end = -Math.PI / 2 + shown / goal * TAU;
  ctx.strokeStyle = INK; ctx.lineWidth = 12;
  circle(x, y, tr); ctx.stroke();
  ctx.strokeStyle = '#36170c'; ctx.lineWidth = 8;
  circle(x, y, tr); ctx.stroke();
  if (shown > 0.01) {
    ctx.strokeStyle = GOLD; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y, tr, -Math.PI / 2, end); ctx.stroke();
    ctx.lineCap = 'butt';
    const hx = x + Math.cos(end) * tr, hy = y + Math.sin(end) * tr;
    glow(ctx, hx, hy, 18, GOLD, 0.8);
    ctx.fillStyle = CREAM; circle(hx, hy, 4); ctx.fill();
  }

  // гнёзда-огоньки: сперва свечение горящих, потом сами
  const sr = r * 0.82, pop = clamp(1 - (t - p.countAt) / 0.3, 0, 1);
  for (let i = 0; i < lit; i++) {
    const a = slotAngle(i, goal);
    glow(ctx, x + Math.cos(a) * sr, y + Math.sin(a) * sr, i === goal - 1 ? 40 : 26, GOLD, 0.55);
  }
  for (let i = 0; i < goal; i++) {
    const a = slotAngle(i, goal), sx = x + Math.cos(a) * sr, sy = y + Math.sin(a) * sr;
    const k = !cooling && !done && i === lit - 1 ? pop : 0;
    if (i === goal - 1) lastSlot(sx, sy, i < lit, k); else slot(sx, sy, a, i < lit, k);
  }

  // середина: тёмная ступица со счётом «N/15»
  const hr = r * 0.42;
  ctx.fillStyle = '#392a1c'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
  circle(x, y, hr); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#45230d'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, hr - 4, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke();
  const n = String(Math.round(shown)), of = `/${goal}`;
  const big = `bold ${Math.round(28 + 6 * (cooling ? 0 : pop))}px ${FONT}`, small = `bold 15px ${FONT}`;
  ctx.font = big; const nw = ctx.measureText(n).width;
  ctx.font = small; const ow = ctx.measureText(of).width;
  const tx = x - (nw + ow) / 2;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = INK;
  ctx.font = big; ctx.strokeText(n, tx, y + 10);
  ctx.fillStyle = cooling ? '#927e6a' : shown > 0 || done ? GOLD : CREAM; ctx.fillText(n, tx, y + 10);
  ctx.font = small; ctx.strokeText(of, tx + nw, y + 10);
  ctx.fillStyle = cooling ? '#684c3c' : '#927e6a'; ctx.fillText(of, tx + nw, y + 10);

  // готовый лечит: над ним всплывают бирюзовые плюсики
  if (ready) {
    ctx.fillStyle = TEAL; ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
    for (let i = 0; i < 5; i++) {
      const q = (t * 0.45 + i / 5) % 1, a = i * 2.4 + 0.7, d = r * (0.25 + 0.5 * ((i * 0.37) % 1));
      ctx.globalAlpha = Math.sin(q * Math.PI) * 0.85;
      plus(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8 - q * 40, 4.5);
    }
    ctx.globalAlpha = 1;
  }
  if (done) return;
  chip(x, y - r - 34, p, pod);
  for (const d of p.drops) {
    const area = pod.drops[d.side], n = d.mates.filter((m) => state.neutrals.includes(m)).length;
    arrow(x, y, r, Math.atan2(area.y + area.h / 2 - y, area.x + area.w / 2 - x), n, t - d.at);
  }
}

G.podArt = { draw };
})(window.Game = window.Game || {});
