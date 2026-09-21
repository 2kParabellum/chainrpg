// Заселение уровня: по правилам плана комнаты бросает, какие типы бойцов встанут на точки.
// Возвращает только списки [тип, cx, cy]; сами сущности создаёт game/state.js.
// Если у врагов комнаты нет фиксированных точек (задано только число, `count`), координаты
// в записи не указаны: точку под такого бойца подбирает state.js по реальной геометрии комнаты.
(function (G) {
'use strict';

const { clamp, pickOne, shuffled } = G.math;

// раскладывает типы по точкам так, чтобы каждый выбранный тип встретился хотя бы раз
function assignTypes(count, types) {
  const spots = shuffled(Array.from({ length: count }, (_, i) => i));
  const out = new Array(count);
  spots.forEach((spot, k) => { out[spot] = k < types.length ? types[k] : pickOne(types); });
  return out;
}

// состав врагов комнаты: точки те же, а типы бросаются заново каждую игру
function rollEnemies(plan, level) {
  const spec = plan.enemies;
  const count = !spec ? 0 : spec.spots ? spec.spots.length : spec.count || 0;
  if (!count) return [];
  const pool = spec.pool || level.enemyPool;
  const kinds = clamp(spec.kinds || 1, 1, Math.min(pool.length, count));
  const types = assignTypes(count, shuffled(pool).slice(0, kinds));
  return types.map((type, k) => (spec.spots ? [type, ...spec.spots[k]] : [type]));
}

// состав союзников комнаты: часть типов задана правилом, остальные случайные и без повторов;
// с `chance` каждая точка занята союзником лишь с этой вероятностью
function rollAllies(plan, level) {
  const spec = plan.allies;
  if (!spec || !spec.spots.length) return [];
  const spots = spec.chance === undefined
    ? spec.spots : spec.spots.filter(() => Math.random() < spec.chance);
  if (!spots.length) return [];
  const pool = spec.pool || level.allyPool;
  const types = (spec.require || []).slice(0, spots.length);
  while (types.length < spots.length) {
    const rest = pool.filter((t) => !types.includes(t));
    types.push(pickOne(rest.length ? rest : pool));
  }
  const order = shuffled(types);
  return spots.map(([cx, cy], k) => [order[k], cx, cy]);
}

// союзники, разбросанные по уровню сверх точек комнат: список [тип, номер зоны];
// точку внутри зоны подбирает state.js. Типы идут по кругу перемешанного пула, зоны — по кругу перемешанного списка
function rollScatterAllies(level) {
  const spec = level.scatterAllies;
  if (!spec) return [];
  const types = [];
  while (types.length < spec.count) types.push(...shuffled(level.allyPool));
  const zones = [];
  while (zones.length < spec.count) zones.push(...shuffled(spec.zones));
  return Array.from({ length: spec.count }, (_, k) => [types[k], zones[k]]);
}

G.populate = { rollEnemies, rollAllies, rollScatterAllies };
})(window.Game = window.Game || {});
