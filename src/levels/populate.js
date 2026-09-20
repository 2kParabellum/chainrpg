// Заселение уровня: по правилам плана комнаты бросает, какие типы бойцов встанут на точки.
// Возвращает только списки [тип, cx, cy]; сами сущности создаёт game/state.js.
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
  if (!spec || !spec.spots.length) return [];
  const pool = spec.pool || level.enemyPool;
  const kinds = clamp(spec.kinds || 1, 1, Math.min(pool.length, spec.spots.length));
  const types = assignTypes(spec.spots.length, shuffled(pool).slice(0, kinds));
  return spec.spots.map(([cx, cy], k) => [types[k], cx, cy]);
}

// состав союзников комнаты: часть типов задана правилом, остальные случайные и без повторов
function rollAllies(plan, level) {
  const spec = plan.allies;
  if (!spec || !spec.spots.length) return [];
  const pool = spec.pool || level.allyPool;
  const types = (spec.require || []).slice(0, spec.spots.length);
  while (types.length < spec.spots.length) {
    const rest = pool.filter((t) => !types.includes(t));
    types.push(pickOne(rest.length ? rest : pool));
  }
  const order = shuffled(types);
  return spec.spots.map(([cx, cy], k) => [order[k], cx, cy]);
}

G.populate = { rollEnemies, rollAllies };
})(window.Game = window.Game || {});
