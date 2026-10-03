// Тела: юниты не проходят друг сквозь друга. Перекрывшиеся тела расталкиваются с учётом массы: лёгкого
// отодвигает сильнее, тяжёлый почти не сдвигается, неподвижный (масса Infinity) не сдвигается вовсе.
// Толкаются враги между собой и звенья цепочки с врагами. Звенья между собой не толкаются (их держит плётка),
// лежачие и ждущие вербовки дружочки — тоже (лежат на полу, через них переступают).
(function (G) {
'use strict';

const { state } = G;
const { moveAndCollide } = G.collision;
const { world } = G.world;
const { isSpotted } = G.session;

const invMass = (u) => {
  const m = u.cfg.mass === undefined ? 1 : u.cfg.mass;
  return m === Infinity ? 0 : 1 / m;
};

// сдвинуть тело на (dx, dy), не заходя в стены. Упёршись в неподвижное тело (solid), звено цепочки ещё и
// теряет скорость в его сторону — как о стену. Толкая подвижного, звено скорость сохраняет: замедляет его
// только то, что часть толчка достаётся ему самому, — тем больше, чем тяжелее враг
function shove(u, dx, dy, solid) {
  moveAndCollide(u, dx, dy, world.moveBlockers);
  const len = Math.hypot(dx, dy);
  if (!solid || u.kind !== 'ally' || len < 1e-6) return;
  const nx = dx / len, ny = dy / len;
  const into = u.vx * nx + u.vy * ny;
  if (into < 0) { u.vx -= nx * into; u.vy -= ny * into; }
}

function separate(a, b) {
  let dx = b.x - a.x, dy = b.y - a.y;
  const min = a.r + b.r, d2 = dx * dx + dy * dy;
  if (d2 >= min * min) return;
  const ia = invMass(a), ib = invMass(b);
  if (!ia && !ib) return;
  let d = Math.sqrt(d2);
  if (d < 0.01) { const t = Math.random() * Math.PI * 2; dx = Math.cos(t); dy = Math.sin(t); d = 1; }
  const nx = dx / d, ny = dy / d, overlap = min - Math.sqrt(d2);
  const ka = ia / (ia + ib), kb = ib / (ia + ib);
  if (ka) shove(a, -nx * overlap * ka, -ny * overlap * ka, !ib);
  if (kb) shove(b, nx * overlap * kb, ny * overlap * kb, !ia);
}

// один проход расталкивания за кадр (после ходов врагов): за пару кадров толпа расходится
function separateBodies() {
  const foes = state.enemies.filter(isSpotted);
  for (let i = 0; i < foes.length; i++) {
    for (let j = i + 1; j < foes.length; j++) separate(foes[i], foes[j]);
  }
  // Бычок в рывке проезжает сквозь цепочку (его таран бьёт всех на линии), остальные упираются
  for (const a of state.party) {
    for (const e of foes) if (!e.passThrough) separate(a, e);
  }
}

G.bodies = { separateBodies };
})(window.Game = window.Game || {});
