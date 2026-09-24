// Заселение уровня: по правилам плана комнаты бросает, какие типы бойцов встанут на точки.
// Возвращает только списки [тип, cx, cy]; сами сущности создаёт game/state.js.
// Если у врагов комнаты нет фиксированных точек (задано только число, `count`), координаты
// в записи не указаны: точку под такого бойца подбирает state.js по реальной геометрии комнаты.
(function (G) {
'use strict';

const { clamp, pickOne, pickWeighted, sampleWeighted, shuffled } = G.math;

// раскладывает типы по точкам так, чтобы каждый выбранный тип встретился хотя бы раз;
// с весами (weights) остальные точки добираются чаще из тех типов, у которых вес больше
function assignTypes(count, types, weights) {
  const spots = shuffled(Array.from({ length: count }, (_, i) => i));
  const out = new Array(count);
  const extra = () => (weights ? pickWeighted(types, weights) : pickOne(types));
  spots.forEach((spot, k) => { out[spot] = k < types.length ? types[k] : extra(); });
  return out;
}

// состав врагов комнаты: точки те же, а типы бросаются заново каждую игру
function rollEnemies(plan, level) {
  const spec = plan.enemies;
  const count = !spec ? 0 : spec.spots ? spec.spots.length : spec.count || 0;
  if (!count) return [];
  const pool = spec.pool || level.enemyPool;
  const kinds = clamp(spec.kinds || 1, 1, Math.min(pool.length, count));
  // уровень может задать веса типов (enemyWeights): частые типы попадают в состав зоны чаще
  const weights = level.enemyWeights;
  const chosen = weights ? sampleWeighted(pool, kinds, weights) : shuffled(pool).slice(0, kinds);
  const types = assignTypes(count, chosen, weights);
  return types.map((type, k) => (spec.spots ? [type, ...spec.spots[k]] : [type]));
}

// состав союзников уровня одним броском: каждый персонаж существует в одном экземпляре.
// Сначала расставляются обязательные типы комнат (require), затем остальные места берут случайный
// ещё не занятый тип из своего набора (pool комнаты или allyPool уровня); если типов не хватило,
// место остаётся пустым. Комнаты с собственным pool выбирают раньше прочих, чтобы им хватило.
// Возвращает { rooms: [[тип, cx, cy], ... по комнатам], scatter: [[тип, номер зоны], ...] };
// точку разбросанного союзника внутри зоны подбирает state.js.
// С `chance` каждая точка комнаты занята лишь с этой вероятностью.
function rollLevelAllies(level) {
  const slots = [];   // { room, at: [cx, cy] | null, zone, pool, restricted, type }
  const used = new Set();

  level.rooms.forEach((plan, room) => {
    const spec = plan.allies;
    if (!spec || !spec.spots.length) return;
    const spots = spec.chance === undefined
      ? spec.spots : spec.spots.filter(() => Math.random() < spec.chance);
    const mine = shuffled(spots).map((at) => ({
      room, at, pool: spec.pool || level.allyPool, restricted: !!spec.pool, type: null,
    }));
    (spec.require || []).forEach((type, k) => {
      if (k < mine.length && !used.has(type)) { mine[k].type = type; used.add(type); }
    });
    slots.push(...mine);
  });

  const scatter = level.scatterAllies;
  if (scatter) {
    const zones = [];
    while (zones.length < scatter.count) zones.push(...shuffled(scatter.zones));
    for (let k = 0; k < scatter.count; k++) {
      slots.push({ zone: zones[k], pool: level.allyPool, restricted: false, type: null });
    }
  }

  const free = shuffled(slots.filter((s) => !s.type)).sort((a, b) => b.restricted - a.restricted);
  for (const slot of free) {
    const options = slot.pool.filter((t) => !used.has(t));
    if (!options.length) continue;
    slot.type = pickOne(options);
    used.add(slot.type);
  }

  const out = { rooms: level.rooms.map(() => []), scatter: [] };
  for (const s of slots) {
    if (!s.type) continue;
    if (s.at) out.rooms[s.room].push([s.type, s.at[0], s.at[1]]);
    else out.scatter.push([s.type, s.zone]);
  }
  return out;
}

G.populate = { rollEnemies, rollLevelAllies };
})(window.Game = window.Game || {});
