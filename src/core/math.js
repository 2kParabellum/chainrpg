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

// выбор с весами: weights[тип] — относительная частота, для типа без веса она равна 1
function pickWeighted(list, weights) {
  const w = (t) => (weights[t] === undefined ? 1 : weights[t]);
  let r = Math.random() * list.reduce((sum, t) => sum + w(t), 0);
  for (const t of list) {
    r -= w(t);
    if (r < 0) return t;
  }
  return list[list.length - 1];
}

// count разных элементов с весами, без повторов
function sampleWeighted(list, count, weights) {
  const rest = list.slice();
  const out = [];
  while (out.length < count && rest.length) {
    const t = pickWeighted(rest, weights);
    out.push(t);
    removeFrom(rest, t);
  }
  return out;
}

function spreadAngle(index, count, spread) {
  return count > 1 ? (index / (count - 1) - 0.5) * spread : 0;
}

function removeFrom(list, u) {
  const i = list.indexOf(u);
  if (i >= 0) list.splice(i, 1);
}

G.math = { clamp, dist, pickOne, pickWeighted, sampleWeighted, shuffled, spreadAngle, removeFrom };
})(window.Game = window.Game || {});
