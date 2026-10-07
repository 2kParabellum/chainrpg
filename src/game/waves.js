// Волны из гнёзд («Оборона», «Логово»): гнёзда по очереди выпускают отряды врагов, следующий отряд из того же гнезда
// больше прошлого, а пауза между отрядами может сокращаться по ходу партии (waves.ramp). Враги волны (e.fromNest)
// идут к Герою, а если на уровне есть база — к базе (e.siege, см. chaseStep в game/roaming.js).
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

// отряд из гнезда: не больше kinds типов; пока живых врагов волн maxAlive, лишние не выходят.
// Враг с spawnCost занимает в отряде столько мест (колесница — два); не влез — выходит следующий по списку
function releaseWave(nest, cfg) {
  const alive = state.enemies.filter((e) => e.fromNest).length;
  const count = Math.min(waveSize(cfg, nest.wave), Math.max(0, cfg.maxAlive - alive));
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
    spawnEnemy(type, spot.x, spot.y, 0, { chasing: true, fromNest: true, siege: !!state.base });
    state.effects.push({ type: 'ring', x: spot.x, y: spot.y, r: 24, life: 0.4, color: COLORS.nest });
    nest.lastCount += 1;
  }
}

function updateWaves(dt) {
  const cfg = state.level.waves;
  if (!cfg || state.cleared) return; // база выстояла: новых волн нет
  if (state.base) state.base.regenTimer += dt; // сколько секунд базу не задевали
  for (const nest of state.nests) {
    nest.nextIn -= dt;
    if (nest.nextIn > 0) continue;
    releaseWave(nest, cfg);
    nest.nextIn += intervalNow(cfg);
  }
}

G.waves = { updateWaves, waveSize, surgeActive };
})(window.Game = window.Game || {});
