// Волны из гнёзд («Оборона», «Логово»): гнёзда по очереди выпускают отряды врагов, следующий отряд из того же гнезда
// больше прошлого, а пауза между отрядами может сокращаться по ходу партии (waves.ramp). Враги волны (e.fromNest)
// идут к Герою, а если на уровне есть база — к базе (e.siege), с waves.hunt — к ближайшему союзнику (e.hunt, «Capture the
// Flags»: часовые на флагах), см. chaseStep в game/roaming.js.
// Закрытое гнездо («Seal the Gates», заслонку двигает game/flags.js) молчит, его таймер стоит. С waves.share поток общий:
// доля закрытых гнёзд делится между открытыми — из каждого открытого выходит в «всего гнёзд / открытых» раз больше.
// Таймеры гнёзд — часть состояния партии (state.nests), параметры — у уровня (level.waves).
(function (G) {
'use strict';

const { COLORS, state } = G;
const { freeSpotNear } = G.world;
const { spawnEnemy } = G.session;
const { rollWave } = G.populate;
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

// то же целым числом — его показывают плашка над норой и метка у края экрана
function nextCount(cfg, nest) { return Math.floor(dueCount(cfg, nest) + 1e-9); }

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
    const spot = freeSpotNear(nest.x, nest.y, 20, cfg.spawnRadius, 20);
    if (!spot) continue;
    spawnEnemy(type, spot.x, spot.y, 0, { chasing: true, fromNest: true, siege: !!state.base, hunt: !!cfg.hunt });
    state.effects.push({ type: 'ring', x: spot.x, y: spot.y, r: 24, life: 0.4, color: COLORS.nest });
    nest.lastCount += 1;
  }
}

function updateWaves(dt) {
  const cfg = state.level.waves;
  if (!cfg || state.cleared) return; // база выстояла: новых волн нет
  if (state.base) state.base.regenTimer += dt; // сколько секунд базу не задевали
  for (const nest of state.nests) {
    // закрытое гнездо молчит, таймер стоит; откроют снова — до волны не меньше telegraph секунд (успеть увидеть)
    if (nest.sealed) { nest.nextIn = Math.max(nest.nextIn, cfg.telegraph); continue; }
    nest.nextIn -= dt;
    if (nest.nextIn > 0) continue;
    releaseWave(nest, cfg);
    nest.nextIn += intervalNow(cfg);
  }
}

G.waves = { updateWaves, waveSize, nextCount, surgeActive };
})(window.Game = window.Game || {});
