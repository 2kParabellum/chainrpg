// Стена огня (луч Демона): огонь бежит по полу от пасти — впереди яркая вспышка с искрами, позади три слоя
// языков (красный, оранжевый, золотой), свет на полу и выжженная земля. Перед концом горения гаснет кусками
// вразнобой, а погасшая стенка ещё несколько секунд тлеет: угольки, раскалённые трещинки, дым — без урона.
// Когда огонь дошёл до каждого куска, видно по своему кэшу (во сколько полоса доросла до него); погасшие
// стенки досматривают тление в своём списке. Состояние игры только читается.
(function (G) {
'use strict';

const { state } = G;
const { ctx, visible } = G.shapes;
const { clamp } = G.math;

const STEP = 9;        // шаг кусков вдоль полосы, px
const OUT = 0.9;       // за сколько секунд до конца горения начинает гаснуть
const SMOLDER = 3;     // сколько тлеет после
const FADE = 1.2;      // и за сколько исчезает след
const TAU = Math.PI * 2;

const seen = new Map();   // стенка → { reach: [время, когда огонь дошёл до куска i], geo }
let embers = [];          // погасшие: { reach, geo, endAt }

const h2 = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); };
function hexA(h, a) { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
function ell(x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU); }

// геометрия полосы: начало, направление, длина
function geoOf(f) {
  const dx = f.x2 - f.x1, dy = f.y2 - f.y1, len = Math.hypot(dx, dy) || 0.0001;
  return { x: f.x1, y: f.y1, ux: dx / len, uy: dy / len, len, r: f.r, ang: Math.atan2(dy, dx) };
}

// outAt — когда начинает гаснуть, endAt — когда погасла совсем; growing — полоса ещё растёт (виден фронт)
function paint(geo, reach, now, outAt, endAt, growing) {
  const n = reach.length, head = geo.len;
  // 1. выжженная земля
  for (let i = 0; i < n; i++) {
    const x = geo.x + geo.ux * i * STEP, y = geo.y + geo.uy * i * STEP;
    if (!visible({ x: x - 40, y: y - 60, w: 80, h: 90 })) continue;
    const fade = 1 - clamp((now - endAt - SMOLDER) / FADE, 0, 1);
    const ch = clamp((now - reach[i]) / 0.4, 0, 1) * fade;
    if (ch <= 0) continue;
    ctx.fillStyle = `rgba(48,15,10,${0.55 * ch})`; ell(x, y, STEP * 0.95, geo.r * 0.55 + h2(i, 5) * 5, geo.ang); ctx.fill();
    ctx.fillStyle = `rgba(8,5,2,${0.35 * ch})`; ell(x + 2, y + 3, STEP * 0.6, geo.r * 0.3 + h2(i, 6) * 4, geo.ang); ctx.fill();
  }
  // 2. тление, свет, языки, искры
  for (let i = 0; i < n; i++) {
    const x = geo.x + geo.ux * i * STEP, y = geo.y + geo.uy * i * STEP;
    if (!visible({ x: x - 40, y: y - 60, w: 80, h: 90 })) continue;
    const seg = now - reach[i];
    const out = clamp((now - outAt - h2(i, 3) * 0.6) / 0.4, 0, 1);
    const fade = 1 - clamp((now - endAt - SMOLDER) / FADE, 0, 1);
    const sm = out * fade;
    if (sm > 0) {
      const p = 0.5 + 0.5 * Math.sin(now * 3 + i * 1.7);
      if (h2(i, 9) > 0.45) {
        ctx.strokeStyle = hexA('#ef692f', sm * (0.35 + 0.5 * p)); ctx.lineWidth = 1.5; ctx.beginPath();
        ctx.moveTo(x - 4, y - 5 + h2(i, 10) * 10); ctx.lineTo(x + 1, y - 2 + h2(i, 11) * 6); ctx.lineTo(x + 6, y - 4 + h2(i, 12) * 10); ctx.stroke();
      }
      if (h2(i, 13) > 0.5) { ctx.fillStyle = hexA(p > 0.6 ? '#efac28' : '#ef3a0c', sm * (0.4 + 0.6 * p)); ell(x + (h2(i, 14) - 0.5) * 8, y + (h2(i, 15) - 0.5) * geo.r * 0.7, 1.8, 1.4); ctx.fill(); }
      if (i % 5 === 0) {
        const q = (now * 0.5 + h2(i, 16)) % 1;
        ctx.globalAlpha = 0.4 * sm * Math.sin(q * Math.PI); ctx.fillStyle = '#684c3c';
        ell(x + Math.sin(now + i) * 4, y - 6 - q * 34, 4 + q * 8, 3 + q * 5); ctx.fill(); ctx.globalAlpha = 1;
      }
    }
    const f = clamp(seg / 0.12, 0, 1) * (1 - out);
    if (f <= 0) continue;
    ctx.fillStyle = hexA('#ef692f', 0.16 * f); ell(x, y, STEP * 1.3, geo.r * 0.9); ctx.fill();
    const nearHead = growing ? clamp(1 - (head - i * STEP) / 90, 0, 1) : 0;
    const base = (15 + 12 * h2(i, 1)) * (1 + 0.8 * nearHead) * (0.6 + 0.4 * f);
    const side = (h2(i, 2) - 0.5) * geo.r * 0.5;
    for (const [col, hk, dy, wk] of [['#ef3a0c', 1.25, -5, 1.15], ['#ef692f', 0.95, 0, 1], ['#efac28', 0.6, 5, 0.75]]) {
      const fl = 0.75 + 0.25 * Math.sin(now * 13 + i * 2.3 + hk * 4), h = base * hk * fl, sway = Math.sin(now * 7 + i) * 3;
      const bx = x - geo.uy * side, yy = y + geo.ux * side + dy, w = 6 * wk;
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(bx - w, yy + 3);
      ctx.quadraticCurveTo(bx - w * 0.9, yy - h * 0.45, bx + sway, yy - h); ctx.quadraticCurveTo(bx + w * 0.9, yy - h * 0.45, bx + w, yy + 3);
      ctx.closePath(); ctx.fill();
    }
    if (i % 3 === 0) { const q = (now * 1.2 + h2(i, 17)) % 1; ctx.fillStyle = hexA(q < 0.5 ? '#efac28' : '#ef692f', f * (1 - q)); ctx.fillRect(x + Math.sin(now * 3 + i) * 5, y - 10 - q * 46, 2.5, 2.5); }
  }
  // 3. фронт, пока полоса растёт: вспышка, яркое ядро, искры вперёд
  if (growing) {
    const hx = geo.x + geo.ux * head, hy = geo.y + geo.uy * head;
    const g = ctx.createRadialGradient(hx, hy - 6, 0, hx, hy - 6, 60);
    g.addColorStop(0, 'rgba(239,216,161,0.7)'); g.addColorStop(0.4, 'rgba(239,105,47,0.35)'); g.addColorStop(1, 'rgba(239,105,47,0)');
    ctx.fillStyle = g; ell(hx, hy - 6, 60, 46); ctx.fill();
    ctx.fillStyle = '#efd8a1'; ctx.beginPath(); ctx.moveTo(hx - 8, hy + 4); ctx.quadraticCurveTo(hx - 6, hy - 22, hx + 2, hy - 40);
    ctx.quadraticCurveTo(hx + 8, hy - 20, hx + 9, hy + 4); ctx.closePath(); ctx.fill();
    for (let j = 0; j < 8; j++) {
      const q = (now * 2.5 + j / 8) % 1, d = q * 40 * (0.6 + h2(j, 1)), up = q * 30 * h2(j, 2), sd = (h2(j, 3) - 0.5) * 20 * q;
      ctx.fillStyle = hexA(j % 2 ? '#efac28' : '#efd8a1', 1 - q);
      ctx.fillRect(hx + geo.ux * d - geo.uy * sd, hy + geo.uy * d + geo.ux * sd - 8 - up, 3, 3);
    }
  }
}

function draw(list) {
  const now = state.time;
  // новая партия (время пошло заново) — старые следы не нужны
  embers = embers.filter((m) => m.endAt <= now + 60 && now - m.endAt < SMOLDER + FADE);
  for (const [f, d] of seen) {
    if (list.includes(f)) continue;
    seen.delete(f);
    embers.push({ reach: d.reach, geo: d.geo, endAt: now });
  }
  for (const m of embers) paint(m.geo, m.reach, now, m.endAt - OUT, m.endAt, false);
  for (const f of list) {
    let d = seen.get(f);
    if (!d) { d = { reach: [] }; seen.set(f, d); }
    d.geo = geoOf(f);
    const n = Math.floor(d.geo.len / STEP) + 1;
    while (d.reach.length < n) d.reach.push(now);
    // конец горения известен, когда полоса доросла: гаснет за OUT секунд до него
    const endAt = f.growing ? Infinity : now + f.life;
    paint(d.geo, d.reach, now, endAt - OUT, endAt, f.growing);
  }
}

G.fireArt = { draw };
})(window.Game = window.Game || {});
