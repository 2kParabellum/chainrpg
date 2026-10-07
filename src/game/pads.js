// Случайные появления по ходу партии: подиумы и нейтральные дружочки. И те и другие возникают в случайное
// время в случайном месте около Героя, живут случайное время и исчезают. Это часть состояния партии
// (state.pads, state.neutrals), а не мира.
(function (G) {
'use strict';

const { CONFIG, COLORS, state } = G;
const { pickWeighted } = G.math;
const { circleRectOverlap } = G.collision;
const { freeSquareNear, freeSquareIn, inHome, roomInterior, world } = G.world;
const { leader, makeAlly, currentRoom } = G.session;

const rand = ([a, b]) => a + Math.random() * (b - a);

// параметры появления: общие из CONFIG, уровень может переопределить отдельные поля
// (у групп jobs/buffs — тоже поштучно)
function settings() {
  const base = CONFIG.PAD_SPAWN, lvl = state.level.padSpawn || {};
  return { ...base, ...lvl, jobs: { ...base.jobs, ...lvl.jobs }, buffs: { ...base.buffs, ...lvl.buffs } };
}
function allySettings() { return { ...CONFIG.ALLY_SPAWN, ...state.level.allySpawn }; }

// подиум профессии или усиления
const padKind = (ability) => (G.buffs[ability] ? 'buffs' : 'jobs');

// что занимает место: подиумы (и метки будущих; у постоянного — вместе с рамкой), ждущие дружочки,
// громадины (порталы, боссы; у кого задан keepClear — круг такого радиуса) и зоны выхода врагов у гнёзд — новое
// сюда не встаёт
function occupied() {
  const nestR = state.level.waves ? state.level.waves.spawnRadius + 30 : 0;
  return state.pads.concat(state.padMarks)
    .map((p) => ({ x: p.x + p.w / 2, y: p.y + p.h / 2, r: p.w * 0.75 + (p.permanent ? CONFIG.PADS.permanentFrame : 0) }))
    .concat(state.neutrals.map((n) => ({ x: n.x, y: n.y, r: n.r + 10 })))
    .concat(state.enemies.filter((e) => e.r >= 40).map((e) => ({ x: e.x, y: e.y, r: e.cfg.keepClear || e.r })))
    .concat(state.nests.map((n) => ({ x: n.x, y: n.y, r: nestR })));
}

// уровень «Оборона»: стартовые подиумы и дружочки — во дворе базы, все следующие — только за его стенами.
// Уровень со spawnRooms (обучение): только внутри комнаты, где сейчас Герой
function placeRule(atStart) {
  if (state.level.spawnRooms) {
    const r = roomInterior(currentRoom()), m = 30;
    return (x, y) => x > r.x + m && x < r.x + r.w - m && y > r.y + m && y < r.y + r.h - m;
  }
  if (!world.home) return undefined;
  return atStart ? (x, y) => inHome(x, y, 50) : (x, y) => !inHome(x, y, -50);
}

// случайные появления идут, только пока Герой в одной из комнат level.spawnRooms (если уровень их задал);
// иначе таймеры стоят, а стартовая порция выкладывается, когда Герой впервые туда войдёт
function spawningHere() {
  const rooms = state.level.spawnRooms;
  return !rooms || rooms.includes(currentRoom());
}

// постоянный подиум уровня (fixed) не исчезает насовсем: на его месте сразу появляется тень,
// и через fixedRespawn секунд — такой же подиум
function respawnFixed(pad) {
  if (!pad.fixed) return;
  const cfg = settings();
  state.padMarks.push({ x: pad.x, y: pad.y, w: pad.w, h: pad.h, ability: pad.ability, fixed: true,
                        life: pad.maxLife, left: cfg.fixedRespawn, total: cfg.telegraph });
}

// общий таймер появлений: после сброса партии (timer === null) сразу выкладывает startCount штук,
// дальше — по одному раз в interval, пока на карте меньше maxActive; не нашлось места — ещё раз через секунду
// spawn(cfg, atStart): на старте партии — сразу, без предупреждения
function runSpawner(timerKey, cfg, count, spawn, dt) {
  if (state[timerKey] === null) {
    for (let i = 0; i < cfg.startCount; i++) spawn(cfg, true);
    state[timerKey] = rand(cfg.interval);
    return;
  }
  state[timerKey] -= dt;
  if (state[timerKey] > 0) return;
  if (count >= cfg.maxActive) { state[timerKey] = 1; return; }
  state[timerKey] = spawn(cfg) ? rand(cfg.interval) : 1;
}

function padColor(key) { return (G.buffs[key] || G.abilities[key]).color; }

// касается ли тело юнита подиума: подиум профессии круглый (вписан в свой квадрат), усиления — квадратный
function touchesPad(u, pad) {
  if (padKind(pad.ability) === 'buffs') return circleRectOverlap(u.x, u.y, u.r, pad);
  const r = pad.w / 2;
  return Math.hypot(u.x - (pad.x + r), u.y - (pad.y + r)) < u.r + r;
}

// подиум, которого касается тело юнита (или null); погасший на перезарядку постоянный подиум не в счёт
function padUnder(u) {
  for (const pad of state.pads) {
    if (pad.cooldown > 0) continue;
    if (touchesPad(u, pad)) return pad;
  }
  return null;
}

// подиума коснулось звено: запустить или продлить таймер исчезновения (подиум одноразовый)
function markPadUsed(pad) {
  pad.usedLeft = settings().usedGrace;
  pad.life = Math.max(pad.life, pad.usedLeft); // пока по нему едут, по времени жизни он не пропадёт
}

// подиум профессии взят: исчезает сразу (его получает одно звено)
function consumePad(pad) {
  const i = state.pads.indexOf(pad);
  if (i >= 0) state.pads.splice(i, 1);
  state.effects.push({ type: 'ring', x: pad.x + pad.w / 2, y: pad.y + pad.h / 2, r: pad.w * 0.6, life: 0.35, color: padColor(pad.ability) });
  respawnFixed(pad);
}

function placePad(m) {
  state.pads.push({ x: m.x, y: m.y, w: m.w, h: m.h, ability: m.ability, life: m.life, maxLife: m.life, takenBy: [],
                    fixed: m.fixed });
  state.effects.push({ type: 'ring', x: m.x + m.w / 2, y: m.y + m.h / 2, r: m.w * 0.7, life: 0.4, color: padColor(m.ability) });
}

// свободное место под новый подиум или дружочка: обычно — в кольце ringMin..ringMax около Героя, а с anywhere
// (уровень так решил) — в любом месте комнаты, где сейчас Герой
function spawnSpot(cfg, size, atStart) {
  if (cfg.anywhere) return freeSquareIn(roomInterior(currentRoom()), size, occupied(), placeRule(atStart));
  const lead = leader();
  return freeSquareNear(lead.x, lead.y, cfg.ringMin, cfg.ringMax, size, occupied(), placeRule(atStart));
}

// новый подиум группы kind ('jobs' | 'buffs') около Героя: сперва на его месте появляется метка-тень,
// через telegraph секунд — сам подиум (на старте партии — сразу). false, если места не нашлось
function spawnPad(cfg, kind, atStart) {
  const size = CONFIG.PADS.size;
  const group = cfg[kind];
  // тип — по весам группы, по возможности не тот, что уже лежит на карте или вот-вот появится
  const all = Object.keys(group.weights);
  const fresh = all.filter((k) => !state.pads.concat(state.padMarks).some((p) => p.ability === k));
  const ability = pickWeighted(fresh.length ? fresh : all, group.weights);

  const spot = spawnSpot(cfg, size, atStart);
  if (!spot) return false;

  const mark = { x: spot.x - size / 2, y: spot.y - size / 2, w: size, h: size, ability,
                 life: rand(cfg.lifetime), left: cfg.telegraph, total: cfg.telegraph };
  if (atStart) placePad(mark); else state.padMarks.push(mark);
  return true;
}

// сколько подиумов группы на карте вместе с метками будущих; постоянные не в счёт — они не мешают появляться случайным
function padCount(kind) {
  return state.pads.concat(state.padMarks).filter((p) => !p.permanent && padKind(p.ability) === kind).length;
}

// таймеры подиумов и меток; появление новых — у профессий и усилений свои таймеры и пределы
function updatePads(dt) {
  const cfg = settings();
  for (let i = state.pads.length - 1; i >= 0; i--) {
    const p = state.pads[i];
    // постоянный подиум не исчезает: по нему проехала цепочка (кончилось usedLeft) — гаснет на cooldownTime секунд
    if (p.permanent) {
      if (p.cooldown > 0) {
        p.cooldown -= dt;
        if (p.cooldown <= 0) state.effects.push({ type: 'ring', x: p.x + p.w / 2, y: p.y + p.h / 2, r: p.w * 0.8, life: 0.5, color: padColor(p.ability) });
      }
      if (p.usedLeft === undefined) continue;
      p.usedLeft -= dt;
      if (p.usedLeft > 0) continue;
      p.usedLeft = undefined;
      p.takenBy = [];
      p.cooldown = p.cooldownTime;
      continue;
    }
    p.life -= dt;
    if (p.usedLeft !== undefined) p.usedLeft -= dt;
    if (p.life > 0 && !(p.usedLeft <= 0)) continue;
    state.pads.splice(i, 1);
    state.effects.push({ type: 'ring', x: p.x + p.w / 2, y: p.y + p.h / 2, r: p.w * 0.5, life: 0.3, color: padColor(p.ability) });
    respawnFixed(p);
  }
  for (let i = state.padMarks.length - 1; i >= 0; i--) {
    const m = state.padMarks[i];
    m.left -= dt;
    if (m.left > 0) continue;
    state.padMarks.splice(i, 1);
    placePad(m);
  }
  if (!spawningHere()) return;
  for (const kind of ['jobs', 'buffs']) {
    runSpawner(kind === 'jobs' ? 'jobSpawnIn' : 'buffSpawnIn', cfg[kind], padCount(kind),
      (c, atStart) => spawnPad(cfg, kind, atStart), dt);
  }
}

// новый нейтральный дружочек около Героя; false, если места не нашлось
function spawnAlly(cfg, atStart) {
  const spot = spawnSpot(cfg, 40, atStart);
  if (!spot) return false;
  const u = makeAlly('neutral', 'buddy', spot.x, spot.y);
  u.life = u.maxLife = rand(cfg.lifetime);
  state.neutrals.push(u);
  state.effects.push({ type: 'ring', x: spot.x, y: spot.y, r: 24, life: 0.4, color: COLORS.buddy });
  return true;
}

// ждущие вербовки дружочки уходят по таймеру; новые появляются, как подиумы.
// Завербованного это больше не касается: он уже не в state.neutrals
function updateAllySpawns(dt) {
  const cfg = allySettings();
  for (let i = state.neutrals.length - 1; i >= 0; i--) {
    const n = state.neutrals[i];
    if (n.life === undefined) continue;
    n.life -= dt;
    if (n.life > 0) continue;
    state.neutrals.splice(i, 1);
    state.effects.push({ type: 'ring', x: n.x, y: n.y, r: 20, life: 0.3, color: COLORS.neutral });
  }
  if (!spawningHere()) return;
  runSpawner('allySpawnIn', cfg, state.neutrals.length, spawnAlly, dt);
}

G.pads = { padKind, padUnder, markPadUsed, consumePad, updatePads, settings, updateAllySpawns, allySettings };
})(window.Game = window.Game || {});
