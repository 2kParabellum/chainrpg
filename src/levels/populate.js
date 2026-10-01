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

// состав врагов одной группы точек: точки те же, а типы бросаются заново каждую игру
function rollEnemySpec(spec, level) {
  const count = spec.spots ? spec.spots.length : spec.count || 0;
  if (!count) return [];
  const pool = spec.pool || level.enemyPool;
  const kinds = clamp(spec.kinds || 1, 1, Math.min(pool.length, count));
  // уровень может задать веса типов (enemyWeights): частые типы попадают в состав зоны чаще
  const weights = level.enemyWeights;
  const chosen = weights ? sampleWeighted(pool, kinds, weights) : shuffled(pool).slice(0, kinds);
  const types = assignTypes(count, chosen, weights);
  // anchored — враги группы стоят на месте и не бродят (например, стрелки на крошечных островках)
  const extra = spec.anchored ? { anchored: true } : null;
  return types.map((type, k) => (spec.spots ? [type, ...spec.spots[k], extra] : [type, undefined, undefined, extra]));
}

// комната обычно задаёт одну группу врагов, но может задать список независимых групп
// (например, свои типы на тропе и свои на островках вокруг) — тогда plan.enemies — массив групп
function rollEnemies(plan, level) {
  if (!plan.enemies) return [];
  const specs = Array.isArray(plan.enemies) ? plan.enemies : [plan.enemies];
  return specs.flatMap((spec) => rollEnemySpec(spec, level));
}

// дружочки уровня: каждая точка allies.spots комнаты (с учётом необязательного chance — вероятности
// появления) даёт одного, scatterAllies.count дают ещё столько же по зонам (зоны по кругу перемешанного списка).
// Возвращает { rooms: [[тип, cx, cy], ... по комнатам], scatter: [[тип, номер зоны], ...] };
// точку разбросанного дружочка внутри зоны подбирает state.js.
function rollLevelAllies(level) {
  const out = { rooms: level.rooms.map(() => []), scatter: [] };

  level.rooms.forEach((plan, room) => {
    const spec = plan.allies;
    if (!spec) return;
    for (const at of spec.spots) {
      if (spec.chance === undefined || Math.random() < spec.chance) out.rooms[room].push(['buddy', at[0], at[1]]);
    }
  });

  const scatter = level.scatterAllies;
  if (scatter) {
    const zones = [];
    while (zones.length < scatter.count) zones.push(...shuffled(scatter.zones));
    for (let k = 0; k < scatter.count; k++) out.scatter.push(['buddy', zones[k]]);
  }
  return out;
}

G.populate = { rollEnemies, rollLevelAllies };
})(window.Game = window.Game || {});
