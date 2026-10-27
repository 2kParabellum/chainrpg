// Цепочка как механика: след Героя, следование звеньев «плёткой», вербовка, бросок,
// выбивание и протяжка лежачих, выдача способностей подиумами.
(function (G) {
'use strict';

const { CONFIG, COLORS, state } = G;
const { clamp, dist, removeFrom } = G.math;
const { moveAndCollide, slideAlongWall } = G.collision;
const { world, buttonUnder } = G.world;
const { padUnder, markPadUsed, consumePad } = G.pads;
const { leader, setAbility, recalcStats, upgrade } = G.session;
const { allyTypes } = G;

// --- след ---

function pushTrail() {
  const lead = leader();
  const head = state.trail[0];
  if (!head || Math.hypot(head.x - lead.x, head.y - lead.y) > CONFIG.CHAIN.trailStep) {
    state.trail.unshift({ x: lead.x, y: lead.y });
    const maxLen = Math.ceil((state.party.length * CONFIG.CHAIN.spacing + 200) / CONFIG.CHAIN.trailStep);
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
// хвост заносит, при остановке звенья проскакивают вперёд и возвращаются («плётка»).
// pull — на сколько точка звена подтянута по следу к Герою (цепочка втягивается в портал выхода)
function followChain(a, dt, i, pull = 0) {
  const cfg = CONFIG.CHAIN, whip = cfg.whip;
  const target = trailPointAt(Math.max(0, i * cfg.spacing - pull));
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
  const t = (i - 1) / Math.max(1, state.party.length - 2);
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

// снять усиление key. sturdy, contactDmg и revive работают, только пока таймер u.buffs[key] > 0
function endBuff(u, key) {
  u.buffs[key] = 0;
  removeFrom(u.buffOrder, key);
  recalcStats(u);
}

// временное усиление Герою; разом их сколько угодно. Повторное взятие того же обновляет таймер
// и делает его самым свежим. «Buff Stacking» — остальные действующие продлеваются на add с (не дальше полного времени)
function giveBuff(u, key) {
  const def = G.buffs[key];
  const fresh = !(u.buffs[key] > 0);
  const stack = upgrade('buffStacking');
  if (stack) for (const k of u.buffOrder) if (k !== key && u.buffs[k] > 0) u.buffs[k] = Math.min(G.buffs[k].duration, u.buffs[k] + stack.add);
  u.buffs[key] = def.duration;
  removeFrom(u.buffOrder, key);
  u.buffOrder.push(key);
  recalcStats(u);
  syncChainBuffs();
  if (fresh) for (const a of state.party) state.effects.push({ type: 'ring', x: a.x, y: a.y, r: a.r + 8, life: 0.4, color: def.color });
}

// звено получает ровно эти усиления (копию таймеров); характеристики пересчитываются, только если набор сменился
function copyBuffs(u, buffs, order) {
  const same = u.buffOrder.length === order.length && order.every((k, i) => u.buffOrder[i] === k);
  u.buffs = { ...buffs };
  u.buffOrder = order.slice();
  if (!same) recalcStats(u);
}

// усиления держит Герой, а действуют они на всю цепочку: звенья получают копию его таймеров;
// выбитое из цепи звено их теряет, подобранное обратно — снова получает
function syncChainBuffs() {
  const lead = leader();
  for (const u of state.party) if (u !== lead) copyBuffs(u, lead.buffs, lead.buffOrder);
  for (const d of state.downed) if (d.buffOrder.length) copyBuffs(d, {}, []);
}

// таймеры усилений Героя; регенерация тикает каждый кадр каждому звену цепочки, пока активна
function updateBuffs(dt) {
  const lead = leader();
  for (const key of Object.keys(lead.buffs)) {
    if (!(lead.buffs[key] > 0)) continue;
    const def = G.buffs[key];
    if (def.regenRate) for (const u of state.party) u.hp = Math.min(u.maxHp, u.hp + def.regenRate * dt);
    lead.buffs[key] -= dt;
    if (lead.buffs[key] <= 0) endBuff(lead, key);
  }
  syncChainBuffs();
}

// звено защищено усилением «крепкость» (или другим с флагом sturdy), пока таймер не истёк
function isSturdy(u) {
  return !!(u.buffs && Object.keys(u.buffs).some((k) => u.buffs[k] > 0 && G.buffs[k].sturdy));
}

// кому достаётся подиум профессии key: первому от головы дружочку без профессии (Герой профессий не берёт —
// он сам не атакует); если пустых нет — звену этой профессии с самым низким уровнем, ещё не максимальным.
// null — отдать некому, подиум остаётся лежать
function jobTarget(key) {
  const crew = state.party.filter((u) => !allyTypes[u.type].anchor);
  const blank = crew.find((u) => !u.ability);
  if (blank) return blank;
  const max = (G.abilities[key].levels || [{}]).length;
  let best = null;
  for (const u of crew) {
    if (u.ability !== key || u.abilityLevel >= max) continue;
    if (!best || u.abilityLevel < best.abilityLevel) best = u;
  }
  return best;
}

// автоподбор подиумов при касании, пробел не нужен.
// Подиум усиления берёт только Герой (касание других звеньев не в счёт), а действует усиление на всю цепочку
// (см. syncChainBuffs); подиум одноразовый: касание Героя запускает таймер исчезновения, и он гаснет.
// Профессию получает одно звено (см. jobTarget), не обязательно коснувшееся: подиум сразу исчезает.
// Постоянный подиум усиления (pad.permanent) берётся так же, но не исчезает, а гаснет на перезарядку (см. game/pads.js)
function touchPads() {
  for (const u of state.party) {
    const pad = padUnder(u);
    if (!pad) continue;
    if (G.buffs[pad.ability]) {
      if (u !== leader()) continue;
      markPadUsed(pad);
      // Герой берёт с одного подиума один раз, хотя касается его много кадров подряд
      if (pad.takenBy.includes(u)) continue;
      pad.takenBy.push(u);
      // открытый пустой рюкзак забирает усиление себе: оно включится потом, по команде (см. usePack)
      const bag = state.backpack;
      if (bag.open && !bag.stored && upgrade('backpack')) {
        bag.open = false;
        bag.stored = pad.ability;
        state.notice = { key: pad.ability, at: state.time, packed: true };
        state.effects.push({ type: 'ring', x: u.x, y: u.y, r: u.r + 10, life: 0.4, color: G.buffs[pad.ability].color });
        continue;
      }
      // о взятом усилении — надпись на экране
      state.notice = { key: pad.ability, at: state.time };
      giveBuff(u, pad.ability);
      continue;
    }
    const target = jobTarget(pad.ability);
    if (!target) continue;
    const def = G.abilities[pad.ability];
    // «Quick Learning»: с шансом chance — ещё levels уровней сверх обычного, не выше последнего
    const quick = upgrade('quickLearning');
    const bonus = quick && Math.random() < quick.chance ? quick.levels : 0;
    const level = (target.ability === pad.ability ? target.abilityLevel + 1 : 1) + bonus;
    setAbility(target, pad.ability, Math.min(level, (def.levels || [{}]).length));
    if (bonus) state.effects.push({ type: 'ring', x: target.x, y: target.y, r: target.r + 14, life: 0.6, color: COLORS.exitGlow });
    consumePad(pad);
    // шапка слетает с подиума на голову получившего, над ним — ромбики уровня (render/jobart.js)
    state.effects.push({ type: 'jobGet', unit: target, pad, key: pad.ability, lvl: target.abilityLevel,
                         max: (def.levels || [{}]).length, life: 2.5, total: 2.5 });
  }
}

// рюкзак Героя (улучшение «Backpack»): усиление внутри — включить его на полное время; пусто — открыть или закрыть
function usePack() {
  if (state.status !== 'play' || state.leaving || !upgrade('backpack')) return;
  const bag = state.backpack, lead = leader();
  if (bag.stored) {
    state.notice = { key: bag.stored, at: state.time };
    giveBuff(lead, bag.stored);
    bag.stored = null;
    bag.open = false;
    return;
  }
  bag.open = !bag.open;
  state.effects.push({ type: 'ring', x: lead.x, y: lead.y, r: lead.r + 8, life: 0.3, color: COLORS.hero });
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
  const u = nearestPickup();
  if (!u) return;
  removeFrom(u.kind === 'downed' ? state.downed : state.neutrals, u);
  u.kind = 'ally';
  u.cd = 0;
  u.vx = 0; u.vy = 0;
  u.prevTarget = null;
  u.drag = null;
  state.party.push(u);
  syncChainBuffs();
}

// выбить из цепочки или утащить можно только рядового союзника: Героя — нельзя,
// и нельзя того, кого сейчас защищает усиление «крепкость»
function canBeDisplaced(u) {
  return u.kind === 'ally' && !allyTypes[u.type].anchor && !isSturdy(u);
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
  copyBuffs(a, {}, []); // усиления цепочки выбитому больше не достаются
  state.downed.push(a);
}

// толчок атаки (таран, взрыв большого снаряда): звено цепочки вылетает из неё (если его можно выбить), лежачего
// отбрасывает по полу. true — союзника сдвинули
function displaceAlly(u, angle, speed) {
  if (u.kind === 'downed') {
    u.vx = Math.cos(angle) * speed;
    u.vy = Math.sin(angle) * speed;
    u.drag = null;
    return true;
  }
  if (!canBeDisplaced(u)) return false;
  knockOutAlly(u, angle, speed);
  return true;
}

// сбросить последнего союзника: он остаётся лежать на месте, поднять его можно ПРОБЕЛОМ.
// Если Герой стоит на кнопке, брошенный дружочек ложится прямо на неё и держит её нажатой
function dropLastAlly() {
  if (state.status !== 'play') return;
  for (let i = state.party.length - 1; i > 0; i--) {
    const a = state.party[i];
    if (!canBeDisplaced(a)) continue;
    knockOutAlly(a, 0, 0);
    const btn = buttonUnder(leader());
    if (btn) {
      a.x = btn.x + btn.w / 2; a.y = btn.y + btn.h / 2;
      state.effects.push({ type: 'ring', x: a.x, y: a.y, r: btn.w * 0.6, life: 0.4, color: COLORS.buttonPressed });
    }
    return;
  }
}

// цепочку перерубили перед звеном from (удар тентакли): оно и все за ним вылетают из цепи и остаются лежать там,
// где были, — без отброса. Кого выбить нельзя (Герой, «крепкость»), тот остаётся в цепочке
function cutChain(from) {
  for (let k = state.party.length - 1; k >= Math.max(1, from); k--) {
    const a = state.party[k];
    if (canBeDisplaced(a)) knockOutAlly(a, 0, 0);
  }
}

// попав в союзника, гарпун вырывает его из цепочки и тянет к Скорпиону; лежачего — просто тянет
function hookAlly(a, scorpion) {
  if (a.kind === 'downed') { a.vx = 0; a.vy = 0; a.drag = scorpion; return; }
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
  pushTrail, trailPointAt, followChain, touchPads, updateBuffs, jobTarget,
  usePack, nearestPickup, tryRecruit, canBeDisplaced, knockOutAlly, displaceAlly, cutChain, dropLastAlly, hookAlly, updateDowned,
};
})(window.Game = window.Game || {});
