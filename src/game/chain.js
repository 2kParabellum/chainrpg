// Цепочка как механика: след ведущего, следование звеньев, вербовка, бросок,
// выбивание и протяжка лежачих, бонус соседей, модель меню порядка.
(function (G) {
'use strict';

const { CONFIG, COLORS, state } = G;
const { clamp, dist, removeFrom } = G.math;
const { moveAndCollide } = G.collision;
const { world } = G.world;
const { leader, maxParty } = G.session;
const { allyTypes } = G;

// --- след ---

function pushTrail() {
  const lead = leader();
  const head = state.trail[0];
  if (!head || Math.hypot(head.x - lead.x, head.y - lead.y) > CONFIG.CHAIN.trailStep) {
    state.trail.unshift({ x: lead.x, y: lead.y });
    const maxLen = Math.ceil((maxParty() * CONFIG.CHAIN.spacing + 200) / CONFIG.CHAIN.trailStep);
    if (state.trail.length > maxLen) state.trail.pop();
  }
}

// после гибели ведущего след старого ведущего уходит вперёд от нового: строим его заново
// по положению звеньев (новый ведущий — первое звено, за ним остальные)
function rebuildTrail() {
  state.trail = state.party.slice(1).map((u) => ({ x: u.x, y: u.y }));
}

function trailPointAt(distBack) {
  const lead = leader();
  let prev = { x: lead.x, y: lead.y };
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

// звено i (i ≥ 1) бежит к своей точке на следе ведущего; отставшее подтягивается быстрее
function followChain(a, dt, i) {
  const target = trailPointAt(i * CONFIG.CHAIN.spacing);
  const dx = target.x - a.x, dy = target.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d > 0.5) {
    const speed = Math.max(CONFIG.CHAIN.followSpeed, d * CONFIG.CHAIN.catchUpGain);
    const step = Math.min(d, speed * dt);
    moveAndCollide(a, (dx / d) * step, (dy / d) * step, world.moveBlockers);
  }
}

// --- вербовка, бросок, выбивание ---

// ближайший, кого можно подобрать: нейтрал или выбитый из цепочки союзник
function nearestPickup() {
  let best = null, bestD = CONFIG.LEADER.recruitRadius;
  for (const u of state.neutrals.concat(state.downed)) {
    const d = dist(leader(), u);
    if (d < bestD) { bestD = d; best = u; }
  }
  return best;
}

function tryRecruit() {
  if (state.status !== 'play') return;
  if (state.party.length >= maxParty()) return;
  const u = nearestPickup();
  if (!u) return;
  removeFrom(u.kind === 'downed' ? state.downed : state.neutrals, u);
  u.kind = 'ally';
  u.cd = 0;
  u.vx = 0; u.vy = 0;
  u.drag = null;
  state.party.push(u);
}

// выбить из цепочки или утащить можно только рядового союзника: ведущего и Героя — нельзя
function canBeDisplaced(u) {
  return u.kind === 'ally' && u !== leader() && !allyTypes[u.type].anchor;
}

// бычок выбивает союзника из цепочки: тот отлетает и лежит, пока его не подберут
function knockOutAlly(a, angle, speed) {
  if (!canBeDisplaced(a)) return;
  removeFrom(state.party, a);
  a.kind = 'downed';
  a.vx = Math.cos(angle) * speed;
  a.vy = Math.sin(angle) * speed;
  a.cd = 0;
  state.downed.push(a);
}

// сбросить последнего союзника: он остаётся лежать на месте, поднять его можно ПРОБЕЛОМ
function dropLastAlly() {
  if (state.status !== 'play' || state.menu.open) return;
  for (let i = state.party.length - 1; i > 0; i--) {
    if (canBeDisplaced(state.party[i])) { knockOutAlly(state.party[i], 0, 0); return; }
  }
}

// попав в союзника, гарпун вырывает его из цепочки и тянет к Скорпиону
function hookAlly(a, scorpion) {
  if (!canBeDisplaced(a)) return;
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

// --- порядок цепочки ---

// поставить цепочку в новый порядок newOrder (те же юниты). Если сменился ведущий, звенья
// меняются местами на полу: каждое встаёт на место своей новой позиции, а скорость и взгляд
// ведущего переходят новому — цепочка не рвётся и след остаётся верным
function applyOrder(newOrder) {
  const old = state.party;
  const lead = old[0], next = newOrder[0];
  if (next !== lead) {
    const slots = old.map((u) => ({ x: u.x, y: u.y }));
    const { vx, vy, facing, heading } = lead;
    newOrder.forEach((u, i) => {
      if (old[i] !== u) { u.x = slots[i].x; u.y = slots[i].y; }
    });
    lead.vx = 0; lead.vy = 0;
    next.vx = vx; next.vy = vy; next.facing = facing; next.heading = heading;
    state.effects.push({ type: 'beam', x1: slots[0].x, y1: slots[0].y, x2: lead.x, y2: lead.y,
                         life: 0.25, color: COLORS.hero });
    state.swapCd = CONFIG.CHAIN.swapCooldown;
  }
  state.party = newOrder;
}

// клавиши 2..9: звено k меняется местами с ведущим
function swapWithLeader(k) {
  if (state.status !== 'play' || state.menu.open || state.swapCd > 0) return;
  if (k < 1 || k >= state.party.length) return;
  const order = state.party.slice();
  [order[0], order[k]] = [order[k], order[0]];
  applyOrder(order);
}

// --- меню порядка цепочки (модель и раскладка; рисует его render/hud.js) ---

const MENU = { w: 360, rowH: 38, head: 46, foot: 30 };

function menuRect() {
  const h = MENU.head + state.party.length * MENU.rowH + MENU.foot;
  return { x: (CONFIG.VIEW.w - MENU.w) / 2, y: (CONFIG.VIEW.h - h) / 2, w: MENU.w, h };
}

// y-координата верха строки: строки идут по порядку цепочки, 0 — ведущий
function menuRowY(row) { return menuRect().y + MENU.head + row * MENU.rowH; }

// в какую позицию цепочки (0..party.length-1) попадает курсор на высоте y
function menuSlotAt(y) {
  const slot = Math.floor((y - menuRowY(0)) / MENU.rowH);
  return clamp(slot, 0, state.party.length - 1);
}

// порядок цепочки с учётом перетаскиваемого прямо сейчас
function menuPreviewOrder() {
  const order = state.party.slice();
  if (!state.menu.drag) return order;
  const [moved] = order.splice(state.menu.drag.from, 1);
  order.splice(menuSlotAt(state.menu.drag.y), 0, moved);
  return order;
}

G.chain = {
  applyOrder, swapWithLeader,
  pushTrail, rebuildTrail, trailPointAt, followChain,
  nearestPickup, tryRecruit, canBeDisplaced, knockOutAlly, dropLastAlly, hookAlly, updateDowned,
  MENU, menuRect, menuRowY, menuSlotAt, menuPreviewOrder,
};
})(window.Game = window.Game || {});
