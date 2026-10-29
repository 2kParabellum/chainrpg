// Гонка «Dead Race»: круги по дороге-кольцу. Ворота поперёк дороги — world.track.gates: [0] — линия старта-финиша,
// дальше невидимые чекпоинты по ходу. Герой проходит ворота строго по порядку: вперёд через следующие — счёт ворот +1,
// назад через последние пройденные — −1 (туда-обратно через линию круг не накрутить). Первое пересечение линии —
// старт, дальше круг засчитан, когда Герой впервые дошёл до линии, пройдя все чекпоинты. Время круга — от прошлого
// пересечения линии. Дружочки цепочки, пересёкшие линию вперёд после Героя, идут в счёт этого круга, каждый — раз.
// Числа — у уровня (world.track, level.victory.laps), счёт и время — в state.race.
// «Endless Run» (level.run): та же гонка без конца, только кругов не считает — уровень гонки и есть круг. Засчитанный
// проезд линии (самый первый — старт, дальше — только когда собраны все флаги уровня) — новый уровень: раскладка по дороге
// впереди дружочков и подиумов и заряд гнёзд (волна выйдет через waves.telegraph секунд; дальше — game/waves.js). В волне
// уровня run.flags врагов несут знамя; знаменосец пропал из врагов (убит) — флаг собран. Флаги не собраны — проезд
// ничего не даёт. Каждый засчитанный проезд прибавляет к счёту (score) столько, сколько дружочков сейчас в цепочке.
// Каждые run.perkEvery уровней — выбор улучшения (см. levelUpDue).
(function (G) {
'use strict';

const { COLORS, state } = G;
const { shuffled, removeFrom } = G.math;
const { world, trackAt } = G.world;
const { leader, upgrade } = G.session;
const { spawnMates, spawnJobPad, spawnBuffPad } = G.pads;

// как отрезок движения p → q прошёл ворота g: 1 — вперёд по ходу гонки, −1 — назад, 0 — не пересёк (или мимо них)
function crossing(p, q, g) {
  const sp = (p.x - g.x) * g.tx + (p.y - g.y) * g.ty, sq = (q.x - g.x) * g.tx + (q.y - g.y) * g.ty;
  const dir = sp < 0 && sq >= 0 ? 1 : sp >= 0 && sq < 0 ? -1 : 0;
  if (!dir) return 0;
  const t = sp / (sp - sq), x = p.x + (q.x - p.x) * t, y = p.y + (q.y - p.y) * t;
  return Math.abs((x - g.x) * -g.ty + (y - g.y) * g.tx) <= g.half ? dir : 0;
}

// «Endless Run»: засчитанный проезд линии — на дороге впереди вразброс, примерно поровну по пути, ложатся n.mates
// дружочков и n.buffs подиумов усилений (от drop.from до drop.to длины круга) и n.jobs подиумов профессий (от drop.jobsFrom
// — не у самого старта: сперва набрать дружочков); «Talent Scout» и «Lucky Foot» добавляют по runPads подиумов. Каждый —
// в свободном месте поперёк дороги. Гнёзда заряжаются — до волны telegraph секунд
function supplyRun(run, n) {
  const d = run.drop, scout = upgrade('talentScout'), lucky = upgrade('luckyFoot');
  const spread = (count, from, place) => {
    for (let i = 0; i < count; i++) {
      const p = trackAt((from + ((d.to - from) * (i + 0.2 + Math.random() * 0.6)) / count) * world.track.length);
      const half = p.hw - 20;
      place({ x: p.x - half, y: p.y - half, w: half * 2, h: half * 2 });
    }
  };
  spread(n.mates, d.from, (area) => spawnMates(area, 1));
  spread(n.jobs + (scout ? scout.runPads : 0), d.jobsFrom, spawnJobPad);
  spread(n.buffs + (lucky ? lucky.runPads : 0), d.from, spawnBuffPad);
  const telegraph = state.level.waves.telegraph;
  for (const nest of state.nests) nest.nextIn = Math.min(nest.nextIn, telegraph);
}

// «Endless Run»: Герой проехал линию. Первый раз — старт, 1-й уровень; дальше — только если флаги уровня собраны: новый
// уровень (счёт флагов и знаменосцев с нуля, состав следующей волны бросается заново — уже по новому уровню), иначе
// проезд ничего не даёт. r.line — для плашки. Засчитанный — к счёту дружочки в цепочке (без Героя), раскладка (на старте
// drop.first, дальше drop.then) и заряд гнёзд; знаменосцы ждут волны уровня (armed)
function runLine(r, run) {
  const first = r.startAt === null;
  if (first) r.startAt = state.time;
  else if (r.flags < run.flags) { r.line = { ok: false, at: state.time }; return; }
  else {
    r.level += 1;
    r.flags = 0; r.tagged = 0;
    for (const n of state.nests) n.queue = null;
  }
  const mates = state.party.length - 1;
  r.score += mates;
  if (!first) r.line = { ok: true, at: state.time, mates };
  r.armed = true;
  supplyRun(run, first ? run.drop.first : run.drop.then);
}

// Герой дошёл до линии с новым счётом ворот: первый раз — старт гонки, дальше — круг пройден («Endless Run» — см. runLine)
function passLine(r) {
  if (state.level.run) { runLine(r, state.level.run); return; }
  if (r.startAt === null) { r.startAt = r.lapAt = state.time; return; }
  r.laps.push({ time: state.time - r.lapAt, mates: 0, at: state.time });
  r.lapAt = state.time;
  r.counted = [];
}

// знамя — count случайным врагам без знамени из списка pool
function tagBearers(r, pool, count) {
  for (const e of shuffled(pool).slice(0, count)) {
    e.flag = true;
    r.bearers.push(e);
    r.tagged += 1;
  }
}

// «Endless Run»: знаменосцы. Пропавший из state.enemies (убит) — флаг собран (state.flagNews — плашка). Вышла волна уровня
// (armed) — знамя получают run.flags случайных врагов этой волны; не хватило (из гнёзд вышло меньше) — любые живые враги
// из гнёзд без знамени, хоть кадром позже; нет и таких — недостающие флаги считаются собранными, иначе уровень не сменить
function updateBearers(r, run) {
  for (const e of r.bearers.slice()) {
    if (state.enemies.includes(e)) continue;
    removeFrom(r.bearers, e);
    r.flags += 1;
    state.flagNews = { kind: 'collected', count: r.flags, at: state.time };
    state.effects.push({ type: 'ring', x: e.x, y: e.y, r: e.r + 18, life: 0.6, color: COLORS.flag });
  }
  if (r.armed) {
    if (state.waveNo === r.seenWave) return;
    r.seenWave = state.waveNo;
    r.armed = false;
    tagBearers(r, state.enemies.filter((e) => e.wave === state.waveNo && !e.flag), run.flags - r.tagged);
  }
  if (r.startAt === null || r.tagged >= run.flags) return;
  tagBearers(r, state.enemies.filter((e) => e.fromNest && !e.flag), run.flags - r.tagged);
  if (r.tagged < run.flags) { r.flags += run.flags - r.tagged; r.tagged = run.flags; }
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
  if (state.level.run) updateBearers(r, state.level.run);
}

// «Endless Run»: какой сейчас уровень гонки (с 1-го)
function runLevel() { return state.race.level; }

// «Endless Run»: пора выбрать улучшение — пройдено ещё run.perkEvery уровней (на 4-м, 7-м, 10-м …)
function levelUpDue() {
  const run = state.level.run;
  return !!run && !!state.race && state.race.level - 1 >= run.perkEvery * (state.perks + 1);
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

G.race = { updateRace, raceClock, lapTime, raceSummary, runLevel, levelUpDue };
})(window.Game = window.Game || {});
