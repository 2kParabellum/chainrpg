// Цепочка как механика: след игрока, следование звеньев, вербовка, бросок,
// выбивание и протяжка лежачих, бонус соседей, модель меню порядка.
(function (G) {
'use strict';

const { CONFIG, state } = G;
const { clamp, dist, removeFrom } = G.math;
const { moveAndCollide } = G.collision;
const { world } = G.world;
const { allyTypes } = G;

// --- след ---

function pushTrail() {
  const head = state.trail[0];
  if (!head || Math.hypot(head.x - state.player.x, head.y - state.player.y) > CONFIG.CHAIN.trailStep) {
    state.trail.unshift({ x: state.player.x, y: state.player.y });
    const maxLen = Math.ceil((CONFIG.CHAIN.maxAllies * CONFIG.CHAIN.spacing + 200) / CONFIG.CHAIN.trailStep);
    if (state.trail.length > maxLen) state.trail.pop();
  }
}

function trailPointAt(distBack) {
  let prev = { x: state.player.x, y: state.player.y };
  let acc = 0;
  for (const p of state.trail) {
    const seg = Math.hypot(p.x - prev.x, p.y - prev.y);
    if (acc + seg >= distBack) {
      const t = seg > 0 ? (distBack - acc) / seg : 0;
      return { x: prev.x + (p.x - prev.x) * t, y: prev.y + (p.y - prev.y) * t };
    }
    acc += seg;
    prev = p;
  }
  return prev;
}

// звено i бежит к своей точке на следе игрока; отставшее подтягивается быстрее
function followChain(a, dt, i) {
  const target = trailPointAt((i + 1) * CONFIG.CHAIN.spacing);
  const dx = target.x - a.x, dy = target.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d > 0.5) {
    const speed = Math.max(CONFIG.CHAIN.followSpeed, d * CONFIG.CHAIN.catchUpGain);
    const step = Math.min(d, speed * dt);
    moveAndCollide(a, (dx / d) * step, (dy / d) * step, world.moveBlockers);
  }
}

// соседи по цепочке с rateBonus (Усилок) ускоряют звено: каждый примыкающий даёт свой бонус к темпу
function attackRateMul(index) {
  let bonus = 0;
  for (const j of [index - 1, index + 1]) {
    if (j < 0 || j >= state.allies.length) continue;
    bonus += allyTypes[state.allies[j].type].stats.rateBonus || 0;
  }
  return 1 + bonus;
}

// --- вербовка, бросок, выбивание ---

// ближайший, кого можно подобрать: нейтрал или выбитый из цепочки союзник
function nearestPickup() {
  let best = null, bestD = state.player.cfg.recruitRadius;
  for (const u of state.neutrals.concat(state.downed)) {
    const d = dist(state.player, u);
    if (d < bestD) { bestD = d; best = u; }
  }
  return best;
}

function tryRecruit() {
  if (state.status !== 'play') return;
  if (state.allies.length >= CONFIG.CHAIN.maxAllies) return;
  const u = nearestPickup();
  if (!u) return;
  removeFrom(u.kind === 'downed' ? state.downed : state.neutrals, u);
  u.kind = 'ally';
  u.cd = 0;
  u.vx = 0; u.vy = 0;
  u.drag = null;
  state.allies.push(u);
}

// бычок выбивает союзника из цепочки: тот отлетает и лежит, пока его не подберут
function knockOutAlly(a, angle, speed) {
  removeFrom(state.allies, a);
  a.kind = 'downed';
  a.vx = Math.cos(angle) * speed;
  a.vy = Math.sin(angle) * speed;
  a.cd = 0;
  state.downed.push(a);
}

// сбросить последнего союзника: он остаётся лежать на месте, поднять его можно ПРОБЕЛОМ
function dropLastAlly() {
  if (state.status !== 'play' || state.menu.open) return;
  const a = state.allies[state.allies.length - 1];
  if (a) knockOutAlly(a, 0, 0);
}

// попав в союзника, гарпун вырывает его из цепочки и тянет к Скорпиону
function hookAlly(a, scorpion) {
  knockOutAlly(a, Math.atan2(scorpion.y - a.y, scorpion.x - a.x), 0);
  a.drag = scorpion;
}

function updateDowned(d, dt) {
  if (d.drag) {
    const s = d.drag;
    const dx = s.x - d.x, dy = s.y - d.y;
    const dd = Math.hypot(dx, dy);
    if (!state.enemies.includes(s) || dd < s.r + d.r + 2) { d.drag = null; return; }
    const step = Math.min(dd, s.cfg.pullSpeed * dt);
    const from = { x: d.x, y: d.y };
    moveAndCollide(d, (dx / dd) * step, (dy / dd) * step, world.moveBlockers);
    if (dist(d, from) < step * 0.3) d.drag = null; // нить упёрлась в препятствие и оборвалась
    return;
  }

  const sp = Math.hypot(d.vx, d.vy);
  if (sp < 1) { d.vx = 0; d.vy = 0; return; }
  const drop = CONFIG.DOWNED.friction * dt;
  const left = Math.max(0, sp - drop);
  d.vx = (d.vx / sp) * left;
  d.vy = (d.vy / sp) * left;
  moveAndCollide(d, d.vx * dt, d.vy * dt, world.moveBlockers);
}

// --- меню порядка цепочки (модель и раскладка; рисует его render/hud.js) ---

const MENU = { w: 360, rowH: 38, head: 46, foot: 30 };

function menuRect() {
  const h = MENU.head + (state.allies.length + 1) * MENU.rowH + MENU.foot;
  return { x: (CONFIG.VIEW.w - MENU.w) / 2, y: (CONFIG.VIEW.h - h) / 2, w: MENU.w, h };
}

// y-координата верха строки: 0 — игрок, 1.. — союзники по порядку цепочки
function menuRowY(row) { return menuRect().y + MENU.head + row * MENU.rowH; }

// в какую позицию цепочки (0..allies.length-1) попадает курсор на высоте y
function menuSlotAt(y) {
  const slot = Math.floor((y - menuRowY(1)) / MENU.rowH);
  return clamp(slot, 0, state.allies.length - 1);
}

// порядок союзников с учётом перетаскиваемого прямо сейчас
function menuPreviewOrder() {
  const order = state.allies.slice();
  if (!state.menu.drag) return order;
  const [moved] = order.splice(state.menu.drag.from, 1);
  order.splice(menuSlotAt(state.menu.drag.y), 0, moved);
  return order;
}

G.chain = {
  pushTrail, trailPointAt, followChain, attackRateMul,
  nearestPickup, tryRecruit, knockOutAlly, dropLastAlly, hookAlly, updateDowned,
  MENU, menuRect, menuRowY, menuSlotAt, menuPreviewOrder,
};
})(window.Game = window.Game || {});
