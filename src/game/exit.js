// Выход с уровня. Когда условие победы выполнено, открывается светлый портал (место задаёт уровень, level.exit).
// Герой заехал в него — цепочка втягивается следом по его следу, экран затягивается тьмой к порталу,
// и партия кончается победой (state.status = 'win'). На «Обороне» сперва база выпускает волну, которая
// сносит всех врагов и гнёзда, и портал открывается, когда волна дошла до краёв поля.
(function (G) {
'use strict';

const { CONFIG, COLORS, state } = G;
const { dist, removeFrom } = G.math;
const { world, localToWorld } = G.world;
const { leader } = G.session;
const { followChain } = G.chain;
const { damageUnit } = G.combat;

function openExit() {
  const spec = state.level.exit;
  const p = localToWorld(spec.room, spec.at[0], spec.at[1]);
  state.exit = { x: p.x, y: p.y, r: CONFIG.EXIT.radius, at: state.time };
  state.effects.push({ type: 'ring', x: p.x, y: p.y, r: 130, life: 0.8, color: COLORS.exit });
}

// условие победы выполнено: новые волны больше не выходят; на уровне с базой — сперва волна от базы
function onVictory() {
  state.cleared = true;
  state.clearedAt = state.time;
  const b = state.base;
  if (!b) { openExit(); return; }
  const corners = [[0, 0], [world.width, 0], [0, world.height], [world.width, world.height]];
  state.shockwave = { x: b.x, y: b.y, r: 0, max: Math.max(...corners.map(([x, y]) => Math.hypot(x - b.x, y - b.y))) };
}

// волна от базы растёт кольцом: всё вражеское, до чего она дошла, гибнет — враги, их снаряды, облака и гнёзда
function updateShockwave(dt) {
  const w = state.shockwave;
  w.r += CONFIG.EXIT.waveSpeed * dt;
  for (const e of state.enemies.slice()) if (dist(w, e) < w.r) damageUnit(e, e.hp + 1);
  for (const p of state.projectiles.slice()) if (p.team === 'enemy' && dist(w, p) < w.r) removeFrom(state.projectiles, p);
  for (const c of state.clouds.slice()) if (dist(w, c) < w.r) removeFrom(state.clouds, c);
  for (const n of state.nests.slice()) {
    if (dist(w, n) >= w.r) continue;
    removeFrom(state.nests, n);
    state.effects.push({ type: 'blast', x: n.x, y: n.y, r: 140, life: 0.5 });
  }
  if (w.r < w.max) return;
  state.shockwave = null;
  openExit();
}

// Герой в портале: он сам исчезает в нём и больше не управляется, звенья тянутся за ним
function startLeaving() {
  const lead = leader(), ex = state.exit;
  state.leaving = { t: 0, pull: 0 };
  lead.x = ex.x; lead.y = ex.y; lead.vx = 0; lead.vy = 0;
  lead.absorbed = true;
  state.effects.push({ type: 'ring', x: ex.x, y: ex.y, r: ex.r + 14, life: 0.4, color: COLORS.exit });
}

// звено уходящей цепочки: точка на следе подтягивается к порталу, дошедшее до середины исчезает в нём
function updateLeavingLink(a, dt, i) {
  if (a.absorbed) return;
  followChain(a, dt, i, state.leaving.pull);
  const ex = state.exit;
  if (dist(a, ex) >= ex.r * 0.5) return;
  a.absorbed = true;
  state.effects.push({ type: 'ring', x: ex.x, y: ex.y, r: ex.r * 0.8, life: 0.3, color: COLORS.exit });
}

function updateExit(dt) {
  if (state.shockwave) updateShockwave(dt);
  const ex = state.exit;
  if (!ex) return;
  if (!state.leaving) {
    if (dist(leader(), ex) < ex.r) startLeaving();
    return;
  }
  const L = state.leaving, cfg = CONFIG.EXIT;
  L.t += dt;
  L.pull += cfg.pull * dt;
  // экран затянулся: кто не успел (застрял за колонной) — уходит вместе со всеми
  if (L.t < cfg.irisTime + cfg.hold) return;
  for (const a of state.party) a.absorbed = true;
  state.status = 'win';
}

G.exit = { onVictory, updateExit, updateLeavingLink };
})(window.Game = window.Game || {});
