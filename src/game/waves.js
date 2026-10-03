// Волны уровня «Оборона»: гнёзда по краям поля по очереди выпускают отряды врагов, каждый следующий
// отряд из того же гнезда больше прошлого. Враги волны (e.siege) идут к базе — см. chaseStep в game/roaming.js.
// Таймеры гнёзд — часть состояния партии (state.nests), параметры — у уровня (level.waves).
(function (G) {
'use strict';

const { COLORS, state } = G;
const { freeSpotNear } = G.world;
const { spawnEnemy } = G.session;
const { rollWave } = G.populate;

// сколько врагов в волне номер n (с нуля) одного гнезда
function waveSize(cfg, n) { return cfg.size.first + cfg.size.grow * n; }

// отряд из гнезда: не больше kinds типов; пока живых врагов волн maxAlive, лишние не выходят
function releaseWave(nest, cfg) {
  const alive = state.enemies.filter((e) => e.siege).length;
  const count = Math.min(waveSize(cfg, nest.wave), Math.max(0, cfg.maxAlive - alive));
  nest.wave += 1;
  nest.releasedAt = state.time;
  nest.lastCount = 0;
  for (const type of rollWave(count, state.level)) {
    const spot = freeSpotNear(nest.x, nest.y, 20, cfg.spawnRadius, 20);
    if (!spot) continue;
    spawnEnemy(type, spot.x, spot.y, 0, { chasing: true, siege: true });
    state.effects.push({ type: 'ring', x: spot.x, y: spot.y, r: 24, life: 0.4, color: COLORS.nest });
    nest.lastCount += 1;
  }
}

function updateWaves(dt) {
  const cfg = state.level.waves;
  if (!cfg) return;
  if (state.base) state.base.regenTimer += dt; // сколько секунд базу не задевали
  for (const nest of state.nests) {
    nest.nextIn -= dt;
    if (nest.nextIn > 0) continue;
    releaseWave(nest, cfg);
    nest.nextIn += cfg.interval;
  }
}

G.waves = { updateWaves, waveSize };
})(window.Game = window.Game || {});
