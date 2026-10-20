// Под уровня «Hit the Count»: взводной механизм на полу. Цепочка проезжает по нему — каждый дружочек взводит его на
// одно деление; goal дружочков за один проезд — условие победы (game/update.js). Проезд начинается, когда Пода
// коснулось любое звено цепочки (и Герой), и кончается, когда gap секунд его никто из цепочки не касается; после этого
// Под cooldown секунд отматывается назад и не взводится. По готовому Поду каждое звено лечится на heal своего HP —
// раз за проезд. Начало проезда выдаёт dropCount дружочков у одной из стен зала (полосы drops): у Пода загорается
// стрелка к ней и горит, пока их не забрали. Числа — у уровня (world.pod), счёт, таймер и выданные группы — в state.pod.
(function (G) {
'use strict';

const { COLORS, state } = G;
const { dist, shuffled } = G.math;
const { world } = G.world;
const { leader } = G.session;
const { spawnMateGroup } = G.pads;

// звено на Поде: середина тела над кругом
function onPod(u, pod) { return !u.absorbed && dist(u, pod) < pod.r; }

// звено проехало по Поду в этом проезде впервые: лечится, а дружочек ещё и взводит Под на деление
function passOver(u, p, pod) {
  p.touched.push(u);
  if (u.hp < u.maxHp) {
    u.hp = Math.min(u.maxHp, u.hp + u.maxHp * pod.heal);
    state.effects.push({ type: 'beam', x1: pod.x, y1: pod.y, x2: u.x, y2: u.y, life: 0.25, color: COLORS.medic });
  }
  if (u === leader() || p.count >= pod.goal) return;
  p.count += 1;
  p.countAt = state.time;
  state.effects.push({ type: 'ring', x: u.x, y: u.y, r: u.r + 8, life: 0.35, color: COLORS.exitGlow });
}

// проезд начался: dropCount дружочков у одной из стен — сторона случайная из тех, где ещё никто не ждёт (если ждут
// везде — любая), не ближе nestGap к гнёздам; не нашлось места у этой стены — у следующей
function dropMates(p, pod) {
  const sides = pod.drops.map((_, i) => i);
  const free = sides.filter((i) => !p.drops.some((d) => d.side === i));
  const avoid = world.nests.map((n) => ({ x: n.x, y: n.y, r: pod.nestGap }));
  for (const side of shuffled(free.length ? free : sides)) {
    const g = spawnMateGroup(pod.drops[side], pod.dropCount, avoid);
    if (!g) continue;
    p.drops.push({ side, x: g.x, y: g.y, mates: g.mates, at: state.time });
    return;
  }
}

function updatePod(dt) {
  const p = state.pod, pod = world.pod;
  if (!p) return;
  // группа, которую забрали целиком (никого из неё не осталось среди ждущих), гасит свою стрелку
  p.drops = p.drops.filter((d) => d.mates.some((m) => state.neutrals.includes(m)));
  if (state.cleared) return; // взведён до конца: портал открыт, Под больше не нужен
  if (p.cooldown > 0) {
    p.cooldown -= dt;
    if (p.cooldown > 0) return;
    p.cooldown = 0;
    p.count = 0;
    state.effects.push({ type: 'ring', x: pod.x, y: pod.y, r: pod.r + 12, life: 0.6, color: COLORS.exitGlow });
  }
  let touching = false;
  for (const u of state.party) {
    if (!onPod(u, pod)) continue;
    touching = true;
    if (!p.passing) { p.passing = true; p.count = 0; p.touched = []; dropMates(p, pod); }
    if (!p.touched.includes(u)) passOver(u, p, pod);
  }
  if (touching) { p.lastTouch = state.time; return; }
  if (!p.passing || state.time - p.lastTouch < pod.gap) return;
  // цепочка съехала: проезд кончился, Под отматывается
  p.passing = false;
  p.touched = [];
  p.cooldown = pod.cooldown;
}

// сколько дружочков в цепочке (Герой не в счёт) — столько Под взвёл бы за один проезд
function podMates() { return state.party.length - 1; }

G.pod = { updatePod, podMates };
})(window.Game = window.Game || {});
