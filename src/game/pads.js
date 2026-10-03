// Случайные появления по ходу партии: подиумы и нейтральные дружочки. И те и другие возникают в случайное
// время в случайном месте около Героя, живут случайное время и исчезают. Это часть состояния партии
// (state.pads, state.neutrals), а не мира.
(function (G) {
'use strict';

const { CONFIG, COLORS, state } = G;
const { pickWeighted } = G.math;
const { circleRectOverlap } = G.collision;
const { freeSquareNear, inHome, world } = G.world;
const { leader, makeAlly } = G.session;

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

// что занимает место: подиумы (и метки будущих), ждущие дружочки и громадины (порталы, босс) — новое сюда не встаёт
function occupied() {
  return state.pads.concat(state.padMarks).map((p) => ({ x: p.x + p.w / 2, y: p.y + p.h / 2, r: p.w * 0.75 }))
    .concat(state.neutrals.map((n) => ({ x: n.x, y: n.y, r: n.r + 10 })))
    .concat(state.enemies.filter((e) => e.r >= 40).map((e) => ({ x: e.x, y: e.y, r: e.r })));
}

// уровень «Оборона»: стартовые подиумы и дружочки — во дворе базы, все следующие — только за его стенами
function placeRule(atStart) {
  if (!world.home) return undefined;
  return atStart ? (x, y) => inHome(x, y, 50) : (x, y) => !inHome(x, y, -50);
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

// подиум, которого касается тело юнита (или null): берётся при пересечении круга тела и квадрата подиума
function padUnder(u) {
  for (const pad of state.pads) {
    if (circleRectOverlap(u.x, u.y, u.r, pad)) return pad;
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
}

function placePad(m) {
  state.pads.push({ x: m.x, y: m.y, w: m.w, h: m.h, ability: m.ability, life: m.life, maxLife: m.life, takenBy: [] });
  state.effects.push({ type: 'ring', x: m.x + m.w / 2, y: m.y + m.h / 2, r: m.w * 0.7, life: 0.4, color: padColor(m.ability) });
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

  const lead = leader();
  const spot = freeSquareNear(lead.x, lead.y, cfg.ringMin, cfg.ringMax, size, occupied(), placeRule(atStart));
  if (!spot) return false;

  const mark = { x: spot.x - size / 2, y: spot.y - size / 2, w: size, h: size, ability,
                 life: rand(cfg.lifetime), left: cfg.telegraph, total: cfg.telegraph };
  if (atStart) placePad(mark); else state.padMarks.push(mark);
  return true;
}

// сколько подиумов группы на карте вместе с метками будущих
function padCount(kind) {
  return state.pads.concat(state.padMarks).filter((p) => padKind(p.ability) === kind).length;
}

// таймеры подиумов и меток; появление новых — у профессий и усилений свои таймеры и пределы
function updatePads(dt) {
  const cfg = settings();
  for (let i = state.pads.length - 1; i >= 0; i--) {
    const p = state.pads[i];
    p.life -= dt;
    if (p.usedLeft !== undefined) p.usedLeft -= dt;
    if (p.life > 0 && !(p.usedLeft <= 0)) continue;
    state.pads.splice(i, 1);
    state.effects.push({ type: 'ring', x: p.x + p.w / 2, y: p.y + p.h / 2, r: p.w * 0.5, life: 0.3, color: padColor(p.ability) });
  }
  for (let i = state.padMarks.length - 1; i >= 0; i--) {
    const m = state.padMarks[i];
    m.left -= dt;
    if (m.left > 0) continue;
    state.padMarks.splice(i, 1);
    placePad(m);
  }
  for (const kind of ['jobs', 'buffs']) {
    runSpawner(kind === 'jobs' ? 'jobSpawnIn' : 'buffSpawnIn', cfg[kind], padCount(kind),
      (c, atStart) => spawnPad(cfg, kind, atStart), dt);
  }
}

// новый нейтральный дружочек около Героя; false, если места не нашлось
function spawnAlly(cfg, atStart) {
  const lead = leader();
  const spot = freeSquareNear(lead.x, lead.y, cfg.ringMin, cfg.ringMax, 40, occupied(), placeRule(atStart));
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
  runSpawner('allySpawnIn', cfg, state.neutrals.length, spawnAlly, dt);
}

G.pads = { padUnder, markPadUsed, consumePad, updatePads, settings, updateAllySpawns, allySettings };
})(window.Game = window.Game || {});
