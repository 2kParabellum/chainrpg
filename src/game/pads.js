// Случайные появления по ходу партии: подиумы и нейтральные дружочки. И те и другие возникают в случайное
// время в случайном месте около Героя, живут случайное время и исчезают. Это часть состояния партии
// (state.pads, state.neutrals), а не мира.
(function (G) {
'use strict';

const { CONFIG, COLORS, state } = G;
const { pickWeighted } = G.math;
const { circleRectOverlap } = G.collision;
const { freeSquareNear } = G.world;
const { leader, makeAlly } = G.session;

const rand = ([a, b]) => a + Math.random() * (b - a);

// параметры появления: общие из CONFIG, уровень может переопределить отдельные поля
function settings() { return { ...CONFIG.PAD_SPAWN, ...state.level.padSpawn }; }
function allySettings() { return { ...CONFIG.ALLY_SPAWN, ...state.level.allySpawn }; }

// что занимает место: подиумы, ждущие дружочки и громадины (порталы, босс) — новое сюда не встаёт
function occupied() {
  return state.pads.map((p) => ({ x: p.x + p.w / 2, y: p.y + p.h / 2, r: p.w * 0.75 }))
    .concat(state.neutrals.map((n) => ({ x: n.x, y: n.y, r: n.r + 10 })))
    .concat(state.enemies.filter((e) => e.r >= 40).map((e) => ({ x: e.x, y: e.y, r: e.r })));
}

// общий таймер появлений: после сброса партии (timer === null) сразу выкладывает startCount штук,
// дальше — по одному раз в interval, пока на карте меньше maxActive; не нашлось места — ещё раз через секунду
function runSpawner(timerKey, cfg, count, spawn, dt) {
  if (state[timerKey] === null) {
    for (let i = 0; i < cfg.startCount; i++) spawn(cfg);
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

// новый подиум около Героя; false, если места не нашлось
function spawnPad(cfg) {
  const size = CONFIG.PADS.size;
  // тип — по весам, по возможности не тот, что уже лежит на карте
  const all = Object.keys(cfg.weights);
  const fresh = all.filter((k) => !state.pads.some((p) => p.ability === k));
  const ability = pickWeighted(fresh.length ? fresh : all, cfg.weights);

  const lead = leader();
  const spot = freeSquareNear(lead.x, lead.y, cfg.ringMin, cfg.ringMax, size, occupied());
  if (!spot) return false;

  const life = rand(cfg.lifetime);
  state.pads.push({ x: spot.x - size / 2, y: spot.y - size / 2, w: size, h: size, ability, life, maxLife: life, takenBy: [] });
  state.effects.push({ type: 'ring', x: spot.x, y: spot.y, r: size * 0.7, life: 0.4, color: padColor(ability) });
  return true;
}

// таймеры подиумов и появление новых
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
  runSpawner('padSpawnIn', cfg, state.pads.length, spawnPad, dt);
}

// новый нейтральный дружочек около Героя; false, если места не нашлось
function spawnAlly(cfg) {
  const lead = leader();
  const spot = freeSquareNear(lead.x, lead.y, cfg.ringMin, cfg.ringMax, 40, occupied());
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

G.pads = { padUnder, markPadUsed, updatePads, updateAllySpawns, allySettings };
})(window.Game = window.Game || {});
