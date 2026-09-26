// Цепочка как механика: след Героя, следование звеньев «плёткой», вербовка, бросок,
// выбивание и протяжка лежачих, выдача способностей подиумами.
(function (G) {
'use strict';

const { CONFIG, COLORS, state } = G;
const { clamp, dist, removeFrom } = G.math;
const { moveAndCollide, slideAlongWall } = G.collision;
const { world, padUnder } = G.world;
const { leader, maxParty, setAbility } = G.session;
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

// звено i (i ≥ 1) тянется к своей точке на следе Героя пружиной с затуханием: на поворотах
// хвост заносит, при остановке звенья проскакивают вперёд и возвращаются («плётка»)
function followChain(a, dt, i) {
  const cfg = CONFIG.CHAIN, whip = cfg.whip;
  const target = trailPointAt(i * cfg.spacing);
  const prev = a.prevTarget;
  a.prevTarget = target;
  if (dt <= 0) return;
  const d = Math.hypot(target.x - a.x, target.y - a.y);

  // старое жёсткое следование: пружина выключена или звено слишком далеко от своей точки
  if (!whip.enabled || !prev || d > whip.maxLag) {
    if (d > 0.5) {
      const speed = Math.max(cfg.followSpeed, d * cfg.catchUpGain);
      const step = Math.min(d, speed * dt);
      moveAndCollide(a, ((target.x - a.x) / d) * step, ((target.y - a.y) / d) * step, world.moveBlockers);
    }
    a.vx *= 0.5; a.vy *= 0.5;
    return;
  }

  // скорость самой точки следа; затухание считается относительно неё, а не абсолютной скорости
  const cap = whip.maxSpeed * 2;
  const tvx = clamp((target.x - prev.x) / dt, -cap, cap);
  const tvy = clamp((target.y - prev.y) / dt, -cap, cap);
  const t = (i - 1) / Math.max(1, maxParty() - 2);
  const k = whip.stiffness * (1 - whip.tailSoftness * clamp(t, 0, 1));
  // затухание тоже слабеет к хвосту: поворот доходит до дальних звеньев и раскачивает их сильнее
  const c = 2 * (whip.dampingHead + (whip.dampingTail - whip.dampingHead) * clamp(t, 0, 1)) * Math.sqrt(k);
  a.vx += (k * (target.x - a.x) + c * (tvx - a.vx)) * dt;
  a.vy += (k * (target.y - a.y) + c * (tvy - a.vy)) * dt;
  const sp = Math.hypot(a.vx, a.vy);
  if (sp > whip.maxSpeed) { a.vx = (a.vx / sp) * whip.maxSpeed; a.vy = (a.vy / sp) * whip.maxSpeed; }

  const normal = moveAndCollide(a, a.vx * dt, a.vy * dt, world.moveBlockers);
  if (normal) slideAlongWall(a, normal, 1);
}

// проехав по подиуму, звено (и Герой) получает его способность вместо текущей
function touchPads() {
  for (const u of state.party) {
    const pad = padUnder(u);
    if (state.padLock && allyTypes[u.type].anchor !== true) continue;
    if (!pad || u.ability === pad.ability) continue;
    setAbility(u, pad.ability);
    state.effects.push({ type: 'ring', x: u.x, y: u.y, r: u.r + 8, life: 0.4, color: G.abilities[pad.ability].color });
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
  u.prevTarget = null;
  u.drag = null;
  state.party.push(u);
}

// выбить из цепочки или утащить можно только рядового союзника: Героя — нельзя
function canBeDisplaced(u) {
  return u.kind === 'ally' && !allyTypes[u.type].anchor;
}

// бычок выбивает союзника из цепочки: тот отлетает и лежит, пока его не подберут
function knockOutAlly(a, angle, speed) {
  if (!canBeDisplaced(a)) return;
  removeFrom(state.party, a);
  a.kind = 'downed';
  a.vx = Math.cos(angle) * speed;
  a.vy = Math.sin(angle) * speed;
  a.cd = 0;
  a.prevTarget = null;
  state.downed.push(a);
}

// сбросить последнего союзника: он остаётся лежать на месте, поднять его можно ПРОБЕЛОМ
function dropLastAlly() {
  if (state.status !== 'play') return;
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

G.chain = {
  pushTrail, trailPointAt, followChain, touchPads,
  nearestPickup, tryRecruit, canBeDisplaced, knockOutAlly, dropLastAlly, hookAlly, updateDowned,
};
})(window.Game = window.Game || {});
