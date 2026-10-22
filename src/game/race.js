// Гонка «Dead Race»: круги по дороге-кольцу. Ворота поперёк дороги — world.track.gates: [0] — линия старта-финиша,
// дальше невидимые чекпоинты по ходу. Герой проходит ворота строго по порядку: вперёд через следующие — счёт ворот +1,
// назад через последние пройденные — −1 (туда-обратно через линию круг не накрутить). Первое пересечение линии —
// старт, дальше круг засчитан, когда Герой впервые дошёл до линии, пройдя все чекпоинты. Время круга — от прошлого
// пересечения линии. Дружочки цепочки, пересёкшие линию вперёд после Героя, идут в счёт этого круга, каждый — раз.
// Числа — у уровня (world.track, level.victory.laps), счёт и время — в state.race.
(function (G) {
'use strict';

const { COLORS, state } = G;
const { world } = G.world;
const { leader } = G.session;

// как отрезок движения p → q прошёл ворота g: 1 — вперёд по ходу гонки, −1 — назад, 0 — не пересёк (или мимо них)
function crossing(p, q, g) {
  const sp = (p.x - g.x) * g.tx + (p.y - g.y) * g.ty, sq = (q.x - g.x) * g.tx + (q.y - g.y) * g.ty;
  const dir = sp < 0 && sq >= 0 ? 1 : sp >= 0 && sq < 0 ? -1 : 0;
  if (!dir) return 0;
  const t = sp / (sp - sq), x = p.x + (q.x - p.x) * t, y = p.y + (q.y - p.y) * t;
  return Math.abs((x - g.x) * -g.ty + (y - g.y) * g.tx) <= g.half ? dir : 0;
}

// Герой дошёл до линии с новым счётом ворот: первый раз — старт гонки, дальше — круг пройден
function passLine(r) {
  if (r.startAt === null) { r.startAt = r.lapAt = state.time; return; }
  r.laps.push({ time: state.time - r.lapAt, mates: 0, at: state.time });
  r.lapAt = state.time;
  r.counted = [];
}

// Герой и ворота: вперёд — только через следующие по порядку, назад — только через последние пройденные.
// Новый наибольший счёт на линии (каждые gates.length ворот) — старт или круг
function heroGates(r, p, u) {
  const gates = world.track.gates, n = gates.length, mod = (k) => ((k % n) + n) % n;
  if (crossing(p, u, gates[mod(r.gates)]) > 0) {
    r.gates += 1;
    if (r.gates > r.best) {
      r.best = r.gates;
      if (mod(r.gates - 1) === 0) passLine(r);
    }
  } else if (crossing(p, u, gates[mod(r.gates - 1)]) < 0) r.gates -= 1;
}

function updateRace() {
  const r = state.race;
  if (!r) return;
  const lead = leader(), line = world.track.gates[0], seen = new Map();
  for (const u of state.party) {
    const p = r.prev.get(u);
    seen.set(u, { x: u.x, y: u.y });
    if (!p || u.absorbed) continue;
    // после последнего круга Герой уже не считает ворота, а дружочки ещё досчитываются в последний круг
    if (u === lead) { if (!state.cleared) heroGates(r, p, u); continue; }
    if (!r.laps.length || r.counted.includes(u) || crossing(p, u, line) <= 0) continue;
    r.counted.push(u);
    r.laps[r.laps.length - 1].mates += 1;
    state.effects.push({ type: 'ring', x: u.x, y: u.y, r: u.r + 8, life: 0.35, color: COLORS.exitGlow });
  }
  r.prev = seen;
}

// время гонки текстом: «1:05.3»
function raceClock(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}

// время текущего круга; null — гонка ещё не началась
function lapTime() {
  const r = state.race;
  return r && r.startAt !== null ? state.time - r.lapAt : null;
}

// итоги гонки строками: общее время и дружочки, потом по кругу на строку (лучший круг отмечен)
function raceSummary() {
  const laps = (state.race && state.race.laps) || [];
  if (!laps.length) return [];
  const total = laps.reduce((sum, l) => sum + l.time, 0), mates = laps.reduce((sum, l) => sum + l.mates, 0);
  const best = Math.min(...laps.map((l) => l.time));
  return [`Total ${raceClock(total)} · ${mates} mates across the line`,
    ...laps.map((l, i) => `Lap ${i + 1}: ${raceClock(l.time)} · ${l.mates} mates${l.time === best ? ' · best' : ''}`)];
}

G.race = { updateRace, raceClock, lapTime, raceSummary };
})(window.Game = window.Game || {});
