// Подиумы: появляются по ходу партии в случайное время в случайном месте около Героя, случайного
// типа, живут случайное время и исчезают. Это часть состояния партии (state.pads), а не мира.
(function (G) {
'use strict';

const { CONFIG, state } = G;
const { pickWeighted } = G.math;
const { circleRectOverlap } = G.collision;
const { freeSquareNear } = G.world;
const { leader } = G.session;

const rand = ([a, b]) => a + Math.random() * (b - a);

// параметры появления: общие из CONFIG, уровень может переопределить отдельные поля
function settings() { return { ...CONFIG.PAD_SPAWN, ...state.level.padSpawn }; }

function padColor(key) { return (G.buffs[key] || G.abilities[key]).color; }

// подиум, которого касается тело юнита (или null): берётся при пересечении круга тела и квадрата подиума
function padUnder(u) {
  for (const pad of state.pads) {
    if (circleRectOverlap(u.x, u.y, u.r, pad)) return pad;
  }
  return null;
}

// новый подиум около Героя; false, если места не нашлось
function spawnPad(cfg) {
  const size = CONFIG.PADS.size;
  // тип — по весам, по возможности не тот, что уже лежит на карте
  const all = Object.keys(cfg.weights);
  const fresh = all.filter((k) => !state.pads.some((p) => p.ability === k));
  const ability = pickWeighted(fresh.length ? fresh : all, cfg.weights);

  // не на других подиумах и не под громадинами (порталы, босс)
  const avoid = state.pads.map((p) => ({ x: p.x + p.w / 2, y: p.y + p.h / 2, r: p.w * 0.75 }))
    .concat(state.enemies.filter((e) => e.r >= 40).map((e) => ({ x: e.x, y: e.y, r: e.r })));
  const lead = leader();
  const spot = freeSquareNear(lead.x, lead.y, cfg.ringMin, cfg.ringMax, size, avoid);
  if (!spot) return false;

  const life = rand(cfg.lifetime);
  state.pads.push({ x: spot.x - size / 2, y: spot.y - size / 2, w: size, h: size, ability, life, maxLife: life });
  state.effects.push({ type: 'ring', x: spot.x, y: spot.y, r: size * 0.7, life: 0.4, color: padColor(ability) });
  return true;
}

// таймеры подиумов и появление новых. После сброса партии padSpawnIn === null:
// первый вызов кладёт стартовые подиумы и заводит таймер
function updatePads(dt) {
  const cfg = settings();
  if (state.padSpawnIn === null) {
    for (let i = 0; i < cfg.startCount; i++) spawnPad(cfg);
    state.padSpawnIn = rand(cfg.interval);
    return;
  }

  for (let i = state.pads.length - 1; i >= 0; i--) {
    const p = state.pads[i];
    p.life -= dt;
    if (p.life > 0) continue;
    state.pads.splice(i, 1);
    state.effects.push({ type: 'ring', x: p.x + p.w / 2, y: p.y + p.h / 2, r: p.w * 0.5, life: 0.3, color: padColor(p.ability) });
  }

  state.padSpawnIn -= dt;
  if (state.padSpawnIn > 0) return;
  if (state.pads.length >= cfg.maxActive) { state.padSpawnIn = 1; return; }
  // места не нашлось — пробуем ещё раз через секунду
  state.padSpawnIn = spawnPad(cfg) ? rand(cfg.interval) : 1;
}

G.pads = { padUnder, updatePads };
})(window.Game = window.Game || {});
