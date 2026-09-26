// Интерфейс поверх сцены: затемнение за границей фонаря, HUD, экраны победы и поражения. Состояние только читается.
(function (G) {
'use strict';

const { CONFIG, state } = G;
const { abilities } = G;
const { currentRoom, lightSources, isSpotted, maxParty } = G.session;
const { roomCount, roomIndexAt } = G.world;
const { nearestPickup } = G.chain;
const { ctx, allyColor } = G.shapes;

function drawHud() {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = '13px monospace';
  ctx.textAlign = 'left';

  const level = state.level;
  const here = currentRoom();
  // необнаруженные мины в счётчик не попадают, о них предупреждает только знак на полу
  const inRoom = state.enemies.filter((e) => roomIndexAt(e.x, e.y) === here && isSpotted(e)).length;
  const where = level.zoneNames ? `ЗОНА: ${level.zoneNames[here]}` : `КОМНАТА ${here + 1}/${roomCount()}`;
  // цель уровня «разрушить всё заданного типа» показываем счётчиком
  const rule = level.victory;
  const goal = rule.kind === 'destroyType'
    ? `   ${rule.label}: ${state.enemies.filter((e) => e.type === rule.type).length}` : '';
  ctx.fillStyle = '#c8c8d2';
  ctx.fillText(`${where}   ВРАГОВ ЗДЕСЬ: ${inRoom}${goal}   ЦЕПОЧКА: ${state.party.length}/${maxParty()}`, 12, 22);

  let y = 44;
  for (const a of state.party) {
    ctx.fillStyle = allyColor(a);
    const label = a.cfg.name + (a.ability ? ` (${abilities[a.ability].name})` : '');
    ctx.fillText(`${label.padEnd(18, ' ')} ${Math.max(0, Math.ceil(a.hp))}/${a.maxHp}`, 12, y);
    y += 16;
  }

  const pickup = nearestPickup();
  if (pickup && state.status === 'play') {
    ctx.fillStyle = '#f0f0f5';
    ctx.textAlign = 'center';
    const msg = state.party.length >= maxParty() ? 'ЦЕПОЧКА ПОЛНАЯ'
      : pickup.kind === 'downed' ? 'ПРОБЕЛ — ПОДНЯТЬ' : 'ПРОБЕЛ — ПРИСОЕДИНИТЬ';
    ctx.fillText(msg, CONFIG.VIEW.w / 2, CONFIG.VIEW.h - 30);
  }

  if (state.status === 'dead' || state.status === 'win') {
    ctx.fillStyle = 'rgba(10,10,12,0.75)';
    ctx.fillRect(0, CONFIG.VIEW.h / 2 - 50, CONFIG.VIEW.w, 100);
    ctx.textAlign = 'center';
    ctx.fillStyle = state.status === 'win' ? '#8ce27a' : '#e06060';
    ctx.font = '28px monospace';
    ctx.fillText(state.status === 'win' ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ', CONFIG.VIEW.w / 2, CONFIG.VIEW.h / 2);
    ctx.font = '14px monospace';
    ctx.fillStyle = '#c8c8d2';
    ctx.fillText('R — начать заново', CONFIG.VIEW.w / 2, CONFIG.VIEW.h / 2 + 28);
  }
  ctx.restore();
}

// темнота вне света: на отдельном слое заливаем всё тьмой и вырезаем круг у каждого источника света
// (факел Героя), затем накладываем слой на сцену
const dark = document.createElement('canvas');
dark.width = CONFIG.VIEW.w;
dark.height = CONFIG.VIEW.h;
const dctx = dark.getContext('2d');

function drawLight() {
  const { w, h } = { w: CONFIG.VIEW.w, h: CONFIG.VIEW.h };
  dctx.globalCompositeOperation = 'source-over';
  dctx.clearRect(0, 0, w, h);
  dctx.fillStyle = `rgba(6,6,8,${CONFIG.VISION.darkness})`;
  dctx.fillRect(0, 0, w, h);
  dctx.globalCompositeOperation = 'destination-out';
  for (const s of lightSources()) {
    const x = s.x - state.camera.x, y = s.y - state.camera.y;
    const g = dctx.createRadialGradient(x, y, s.r * CONFIG.VISION.innerRatio, x, y, s.r);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    dctx.fillStyle = g;
    dctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(dark, state.camera.x, state.camera.y);
}

G.hud = { drawLight, drawHud };
})(window.Game = window.Game || {});
