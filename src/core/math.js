// Вспомогательные чистые функции: математика, случайность, работа со списками.
(function (G) {
'use strict';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const pickOne = (list) => list[Math.floor(Math.random() * list.length)];

function shuffled(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function spreadAngle(index, count, spread) {
  return count > 1 ? (index / (count - 1) - 0.5) * spread : 0;
}

function removeFrom(list, u) {
  const i = list.indexOf(u);
  if (i >= 0) list.splice(i, 1);
}

G.math = { clamp, dist, pickOne, shuffled, spreadAngle, removeFrom };
})(window.Game = window.Game || {});
