// Волны из гнёзд («Оборона», «Логово»): гнёзда по очереди выпускают отряды врагов, следующий отряд из того же гнезда
// больше прошлого, а пауза между отрядами может сокращаться по ходу партии (waves.ramp). Враги волны (e.fromNest)
// идут к Герою, а если на уровне есть база — к базе (e.siege), с waves.hunt — к ближайшему союзнику (e.hunt, «Capture the
// Flags»: часовые на флагах), см. chaseStep в game/roaming.js.
// Закрытое гнездо («Seal the Gates», заслонку двигает game/flags.js) молчит, его таймер стоит. С waves.share поток общий:
// доля закрытых гнёзд делится между открытыми — из каждого открытого выходит в «всего гнёзд / открытых» раз больше.
// С waves.script («Ambush») волн ровно столько, сколько задано: все гнёзда выходят разом раз в interval, у каждой волны
// свой бюджет мест, число типов и пул (populate.rollSlots); состав следующей волны бросается заранее (его видно на
// плашках над норами) и делится между гнёздами по очереди. Последняя вышла — гнёзда молчат.
// С waves.endless («Endless») — так же, но волнам нет конца: состав волны номер k считается по формуле (waveSpec), каждая
// следующая больше, с какой-то — пестрее (stages), пауза сокращается (waves.ramp); живых не
// больше waves.maxAlive. Состав делится так, чтобы каждому гнезду досталось по каждому типу, которого хватает на всех.
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

// волны по сценарию: общий таймер и состав заранее (waves.script — заданный список, waves.endless — без конца)
function scripted(cfg) { return !!(cfg.script || cfg.endless); }

// то же целым числом — его показывают плашка над норой и метка у края экрана; у волн по сценарию — сколько уже назначено
function nextCount(cfg, nest) {
  if (scripted(cfg)) return nest.queue ? nest.queue.length : 0;
  return Math.floor(dueCount(cfg, nest) + 1e-9);
}

// враг type выходит из гнезда nest: место рядом с норой, вспышка. Возвращает врага, null — места не нашлось
function spawnAt(nest, type, cfg) {
  const spot = freeSpotNear(nest.x, nest.y, 20, cfg.spawnRadius, 20);
  if (!spot) return null;
  const e = spawnEnemy(type, spot.x, spot.y, 0, { chasing: true, fromNest: true, siege: !!state.base, hunt: !!cfg.hunt });
  state.effects.push({ type: 'ring', x: spot.x, y: spot.y, r: 24, life: 0.4, color: COLORS.nest });
  nest.lastCount += 1;
  return e;
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

// состав волны номер k (с нуля) у волн по сценарию: { size, kinds, pool, copies }; null — волн больше нет.
// waves.script — k-я из списка; waves.endless — по формуле: мест size.first + size.grow·k, типов и пул — из последней
// ступени stages с from ≤ k (или, у «Endless Run», с level ≤ уровня гонки state.race.level), каждого типа хотя бы copies раз
function waveSpec(cfg, k) {
  if (cfg.script) return cfg.script[k] || null;
  const e = cfg.endless, stage = e.stages.filter((s) => (s.level ? s.level <= state.race.level : s.from <= k)).pop();
  return {
    size: Math.floor(e.size.first + e.size.grow * k),
    kinds: stage.kinds,
    pool: stage.pool,
    copies: e.copies,
  };
}

// очередь так, чтобы типы чередовались (A B A B A …): если мест не хватит на всех, не пропадёт целый тип
function alternate(list) {
  const groups = [...new Set(list)].map((t) => list.filter((x) => x === t));
  const out = [];
  while (out.length < list.length) for (const g of groups) if (g.length) out.push(g.pop());
  return out;
}

// волны по сценарию: состав следующей волны (номер state.waveNo) — по гнёздам в nest.queue; волн больше нет — гнёзда
// помечены done, их таймер стоит
function planScripted(cfg) {
  const spec = waveSpec(cfg, state.waveNo);
  for (const n of state.nests) { n.queue = []; n.done = !spec; if (!spec) n.nextIn = Infinity; }
  if (!spec) return;
  // раздаём по типам подряд и гнёздам по очереди: тип, которого хватает на все гнёзда, достаётся каждому
  rollSlots(spec, state.level).sort().forEach((type, i) => state.nests[i % state.nests.length].queue.push(type));
  for (const n of state.nests) n.queue = alternate(n.queue);
}

// волны по сценарию: таймер у всех гнёзд один; вышел — все выпускают назначенных разом, гнёзда по очереди по одному
// (с maxAlive — пока живых врагов волн меньше него, лишние пропадают), бросается состав следующей волны; пауза —
// interval (с ramp — сокращается)
function updateScripted(cfg, dt) {
  if (!state.nests.length) return;
  if (!state.nests[0].queue) planScripted(cfg);
  if (state.nests[0].done) return;
  for (const n of state.nests) n.nextIn -= dt;
  if (state.nests[0].nextIn > 0) return;
  const types = [];
  let room = cfg.maxAlive ? cfg.maxAlive - state.enemies.filter((e) => e.fromNest).length : Infinity;
  for (const n of state.nests) { n.wave += 1; n.releasedAt = state.time; n.lastCount = 0; }
  const most = Math.max(...state.nests.map((n) => n.queue.length));
  for (let i = 0; i < most; i++) {
    for (const n of state.nests) {
      const type = n.queue[i], e = type && room > 0 && spawnAt(n, type, cfg);
      if (e) { e.wave = state.waveNo + 1; types.push(type); room -= 1; } // с какой волны — для perkDue
    }
  }
  state.waveNo += 1;
  state.waveNews = { n: state.waveNo, types, at: state.time };
  planScripted(cfg);
  for (const n of state.nests) if (!n.done) n.nextIn = intervalNow(cfg);
}

// «Endless»: пора выбрать улучшение — вышла волна номер perkEvery·(state.perks + 1) и перебиты все её враги (e.wave)
function perkDue() {
  const cfg = state.level.waves, every = cfg && cfg.endless && cfg.endless.perkEvery;
  if (!every) return false;
  const n = every * (state.perks + 1);
  return state.waveNo >= n && !state.enemies.some((e) => e.wave === n);
}

// waves.script: все волны уже вышли (у бесконечных — никогда)
function allWavesOut() {
  const cfg = state.level.waves;
  return !!(cfg && cfg.script) && state.waveNo >= cfg.script.length;
}

function updateWaves(dt) {
  const cfg = state.level.waves;
  if (!cfg || state.cleared) return; // база выстояла: новых волн нет
  if (state.base) state.base.regenTimer += dt; // сколько секунд базу не задевали
  if (scripted(cfg)) { updateScripted(cfg, dt); return; }
  for (const nest of state.nests) {
    // закрытое гнездо молчит, таймер стоит; откроют снова — до волны не меньше telegraph секунд (успеть увидеть)
    if (nest.sealed) { nest.nextIn = Math.max(nest.nextIn, cfg.telegraph); continue; }
    nest.nextIn -= dt;
    if (nest.nextIn > 0) continue;
    releaseWave(nest, cfg);
    nest.nextIn += intervalNow(cfg);
  }
}

G.waves = { updateWaves, waveSize, nextCount, surgeActive, allWavesOut, perkDue };
})(window.Game = window.Game || {});
