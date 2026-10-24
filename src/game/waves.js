// Волны из гнёзд («Оборона», «Логово»): гнёзда по очереди выпускают отряды врагов, следующий отряд из того же гнезда
// больше прошлого, а пауза между отрядами может сокращаться по ходу партии (waves.ramp). Враги волны (e.fromNest)
// идут к Герою, а если на уровне есть база — к базе (e.siege), с waves.hunt — к ближайшему союзнику (e.hunt, «Capture the
// Flags»: часовые на флагах), см. chaseStep в game/roaming.js.
// Закрытое гнездо («Seal the Gates», заслонку двигает game/flags.js) молчит, его таймер стоит. С waves.share поток общий:
// доля закрытых гнёзд делится между открытыми — из каждого открытого выходит в «всего гнёзд / открытых» раз больше.
// С waves.script («Ambush») волн ровно столько, сколько задано: все гнёзда выходят разом раз в interval, у каждой волны
// свой бюджет мест, число типов и пул (populate.rollSlots); состав следующей волны бросается заранее (его видно на
// плашках над норами) и делится между гнёздами по очереди. Последняя вышла — гнёзда молчат.
// Таймеры гнёзд — часть состояния партии (state.nests), параметры — у уровня (level.waves).
(function (G) {
'use strict';

const { COLORS, state } = G;
const { freeSpotNear } = G.world;
const { spawnEnemy } = G.session;
const { rollWave, rollSlots } = G.populate;
const { enemyTypes } = G;

// начался ли натиск: последние surge.lastSeconds до победы, волны больше (см. level.waves.surge)
function surgeActive(cfg) {
  const v = state.level.victory;
  return !!cfg.surge && v.kind === 'survive' && state.time >= v.time - cfg.surge.lastSeconds;
}

// сколько врагов в волне номер n (с нуля) одного гнезда (с округлением вниз); в натиск — больше в surge.sizeMul раз
function waveSize(cfg, n) {
  const base = Math.floor(cfg.size.first + cfg.size.grow * n);
  return surgeActive(cfg) ? Math.round(base * cfg.surge.sizeMul) : base;
}

// пауза до следующей волны гнезда: interval, а с ramp — плавно сокращается до ramp.to за ramp.time секунд партии
function intervalNow(cfg) {
  if (!cfg.ramp) return cfg.interval;
  const k = Math.min(1, state.time / cfg.ramp.time);
  return cfg.interval + (cfg.ramp.to - cfg.interval) * k;
}

// сколько врагов гнездо выпустит следующей волной, дробным числом: с waves.share — в «всего гнёзд / открытых» раз больше
// своей волны, плюс дробный остаток, накопленный прошлыми волнами
function dueCount(cfg, nest) {
  const base = waveSize(cfg, nest.wave);
  if (!cfg.share) return base;
  const open = state.nests.filter((n) => !n.sealed).length;
  return base * state.nests.length / Math.max(1, open) + nest.carry;
}

// то же целым числом — его показывают плашка над норой и метка у края экрана; с waves.script — сколько уже назначено
function nextCount(cfg, nest) {
  if (cfg.script) return nest.queue ? nest.queue.length : 0;
  return Math.floor(dueCount(cfg, nest) + 1e-9);
}

// враг type выходит из гнезда nest: место рядом с норой, вспышка; false — места не нашлось
function spawnAt(nest, type, cfg) {
  const spot = freeSpotNear(nest.x, nest.y, 20, cfg.spawnRadius, 20);
  if (!spot) return false;
  spawnEnemy(type, spot.x, spot.y, 0, { chasing: true, fromNest: true, siege: !!state.base, hunt: !!cfg.hunt });
  state.effects.push({ type: 'ring', x: spot.x, y: spot.y, r: 24, life: 0.4, color: COLORS.nest });
  nest.lastCount += 1;
  return true;
}

// отряд из гнезда: не больше kinds типов; пока живых врагов волн maxAlive, лишние не выходят.
// Враг с spawnCost занимает в отряде столько мест (колесница — два); не влез — выходит следующий по списку
function releaseWave(nest, cfg) {
  const alive = state.enemies.filter((e) => e.fromNest).length;
  const due = nextCount(cfg, nest);
  if (cfg.share) nest.carry = Math.max(0, dueCount(cfg, nest) - due);
  const count = Math.min(due, Math.max(0, cfg.maxAlive - alive));
  nest.wave += 1;
  nest.releasedAt = state.time;
  nest.lastCount = 0;
  let slots = count;
  for (const type of rollWave(count, state.level)) {
    const cost = enemyTypes[type].spawnCost || 1;
    if (cost > slots) continue;
    slots -= cost;
    spawnAt(nest, type, cfg);
  }
}

// waves.script: состав следующей волны (номер state.waveNo) — по гнёздам в nest.queue; волн больше нет — гнёзда
// помечены done, их таймер стоит
function planScripted(cfg) {
  const spec = cfg.script[state.waveNo];
  for (const n of state.nests) { n.queue = []; n.done = !spec; if (!spec) n.nextIn = Infinity; }
  if (!spec) return;
  rollSlots(spec, state.level).forEach((type, i) => state.nests[i % state.nests.length].queue.push(type));
}

// waves.script: таймер у всех гнёзд один; вышел — все выпускают назначенных разом, бросается состав следующей волны
function updateScripted(cfg, dt) {
  if (!state.nests.length) return;
  if (!state.nests[0].queue) planScripted(cfg);
  if (state.waveNo >= cfg.script.length) return;
  for (const n of state.nests) n.nextIn -= dt;
  if (state.nests[0].nextIn > 0) return;
  const types = [];
  for (const n of state.nests) {
    n.wave += 1;
    n.releasedAt = state.time;
    n.lastCount = 0;
    for (const type of n.queue) if (spawnAt(n, type, cfg)) types.push(type);
  }
  state.waveNo += 1;
  state.waveNews = { n: state.waveNo, types, at: state.time };
  planScripted(cfg);
  for (const n of state.nests) if (!n.done) n.nextIn = cfg.interval;
}

// waves.script: все волны уже вышли
function allWavesOut() {
  const cfg = state.level.waves;
  return !!(cfg && cfg.script) && state.waveNo >= cfg.script.length;
}

function updateWaves(dt) {
  const cfg = state.level.waves;
  if (!cfg || state.cleared) return; // база выстояла: новых волн нет
  if (state.base) state.base.regenTimer += dt; // сколько секунд базу не задевали
  if (cfg.script) { updateScripted(cfg, dt); return; }
  for (const nest of state.nests) {
    // закрытое гнездо молчит, таймер стоит; откроют снова — до волны не меньше telegraph секунд (успеть увидеть)
    if (nest.sealed) { nest.nextIn = Math.max(nest.nextIn, cfg.telegraph); continue; }
    nest.nextIn -= dt;
    if (nest.nextIn > 0) continue;
    releaseWave(nest, cfg);
    nest.nextIn += intervalNow(cfg);
  }
}

G.waves = { updateWaves, waveSize, nextCount, surgeActive, allWavesOut };
})(window.Game = window.Game || {});
