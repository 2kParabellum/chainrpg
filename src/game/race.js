// Гонка «Dead Race»: круги по дороге-кольцу. Ворота поперёк дороги — world.track.gates: [0] — линия старта-финиша,
// дальше невидимые чекпоинты по ходу. Герой проходит ворота строго по порядку: вперёд через следующие — счёт ворот +1,
// назад через последние пройденные — −1 (туда-обратно через линию круг не накрутить). Первое пересечение линии —
// старт, дальше круг засчитан, когда Герой впервые дошёл до линии, пройдя все чекпоинты. Время круга — от прошлого
// пересечения линии. Дружочки цепочки, пересёкшие линию вперёд после Героя, идут в счёт этого круга, каждый — раз.
// Числа — у уровня (world.track, level.victory.laps), счёт и время — в state.race.
// «Endless Run» (level.run): та же гонка без конца. Каждый проезд линии (старт и каждый круг) раскладывает по дороге
// впереди дружочков и подиумы и заряжает гнёзда (волна выйдет через waves.telegraph секунд; дальше — game/waves.js).
// На каждом уровне гонки run.flags врагов несут знамя (по одному в первых волнах уровня); знаменосец пропал из врагов
// (убит) — флаг собран. Проехано run.levelEvery кругов уровня и собраны все его флаги — на линии новый уровень (выбор
// улучшения, см. levelUpDue); флагов не хватает — круги того же уровня идут дальше.
(function (G) {
'use strict';

const { COLORS, state } = G;
const { shuffled, pickOne, removeFrom } = G.math;
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

// «Endless Run»: Герой проехал линию — на дороге впереди (от drop.from до drop.to длины круга) вразброс, примерно поровну
// по пути, ложатся drop.mates дружочков, drop.jobs подиумов профессий и drop.buffs подиумов усилений (с «Talent Scout» и
// «Lucky Foot» — во столько раз больше, во сколько они чаще на других уровнях), каждый — в свободном месте поперёк дороги;
// гнёзда заряжаются — до волны telegraph секунд
function supplyRun(run) {
  const d = run.drop, scout = upgrade('talentScout'), lucky = upgrade('luckyFoot');
  const jobs = Math.round(d.jobs * (scout ? scout.mul : 1)), buffs = Math.round(d.buffs * (lucky ? lucky.mul : 1));
  const items = shuffled([...Array(d.mates).fill('mate'), ...Array(jobs).fill('jobs'), ...Array(buffs).fill('buffs')]);
  items.forEach((kind, i) => {
    const k = d.from + ((d.to - d.from) * (i + 0.2 + Math.random() * 0.6)) / items.length;
    const p = trackAt(k * world.track.length), half = p.hw - 20;
    const area = { x: p.x - half, y: p.y - half, w: half * 2, h: half * 2 };
    if (kind === 'mate') spawnMates(area, 1);
    else if (kind === 'jobs') spawnJobPad(area);
    else spawnBuffPad(area);
  });
  const telegraph = state.level.waves.telegraph;
  for (const n of state.nests) n.nextIn = Math.min(n.nextIn, telegraph);
}

// «Endless Run»: круг засчитан — ещё один круг уровня. Проехано levelEvery и собраны все флаги — новый уровень (lap.up):
// счёт кругов и флагов уровня с нуля, состав следующей волны бросается заново — уже по новому уровню. Кругов хватает, а
// флагов нет — lap.need (плашка напомнит)
function runLap(r, run, lap) {
  r.levelLaps += 1;
  if (r.levelLaps < run.levelEvery) return;
  if (r.flags < run.flags) { lap.need = true; return; }
  r.level += 1;
  r.levelLaps = 0; r.flags = 0; r.tagged = 0;
  lap.up = true;
  for (const n of state.nests) n.queue = null;
}

// Герой дошёл до линии с новым счётом ворот: первый раз — старт гонки, дальше — круг пройден.
// «Endless Run» — и в том и в другом случае раскладка по дороге и заряд гнёзд (после смены уровня — уже для нового)
function passLine(r) {
  const run = state.level.run;
  if (r.startAt === null) {
    r.startAt = r.lapAt = state.time;
  } else {
    const lap = { time: state.time - r.lapAt, mates: 0, at: state.time };
    r.laps.push(lap);
    r.lapAt = state.time;
    r.counted = [];
    if (run) runLap(r, run, lap);
  }
  if (run) supplyRun(run);
}

// «Endless Run»: знаменосцы. Пропавший из state.enemies (убит) — флаг собран (state.flagNews — плашка). Вышла новая волна,
// а знаменосцев уровня вышло меньше run.flags — знамя получает случайный враг этой волны (не вышло никого — любой живой
// враг из гнёзд без знамени; нет и таких — знамя ждёт следующей волны)
function updateBearers(r, run) {
  for (const e of r.bearers.slice()) {
    if (state.enemies.includes(e)) continue;
    removeFrom(r.bearers, e);
    r.flags += 1;
    state.flagNews = { kind: 'collected', count: r.flags, at: state.time };
    state.effects.push({ type: 'ring', x: e.x, y: e.y, r: e.r + 18, life: 0.6, color: COLORS.flag });
  }
  if (state.waveNo === r.seenWave) return;
  r.seenWave = state.waveNo;
  if (r.tagged >= run.flags) return;
  const fresh = state.enemies.filter((e) => e.wave === state.waveNo && !e.flag);
  const pool = fresh.length ? fresh : state.enemies.filter((e) => e.fromNest && !e.flag);
  if (!pool.length) return;
  const e = pickOne(pool);
  e.flag = true;
  r.bearers.push(e);
  r.tagged += 1;
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

// «Endless Run»: пора выбрать улучшение — уровень гонки сменился, а улучшение за него ещё не выбрано
function levelUpDue() {
  return !!state.level.run && !!state.race && state.race.level > state.perks + 1;
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
