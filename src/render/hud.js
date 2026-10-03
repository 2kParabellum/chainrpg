// Интерфейс поверх сцены: HUD, экраны победы и поражения. Состояние только читается.
(function (G) {
'use strict';

const { CONFIG, state } = G;
const { abilities } = G;
const { currentRoom, isSpotted, maxParty, leader } = G.session;
const { roomCount, roomIndexAt, buttonUnder } = G.world;
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

  ctx.fillStyle = '#8a8a95';
  ctx.fillText('Подиумы подбираются сами: проедь по нему цепочкой', 12, 38);
  let y = 58;
  for (const a of state.party) {
    ctx.fillStyle = allyColor(a);
    const bf = Object.entries(a.buffs || {}).filter(([, t]) => t > 0).map(([k, t]) => ` ${G.buffs[k].name} ${Math.ceil(t)}с`).join('');
    const label = a.cfg.name + (a.ability ? ` (${abilities[a.ability].name})` : '') + bf;
    ctx.fillText(`${label.padEnd(34, ' ')} ${Math.max(0, Math.ceil(a.hp))}/${a.maxHp}`, 12, y);
    y += 16;
  }

  const pickup = nearestPickup();
  const btn = buttonUnder(leader());
  if (btn && !btn.pressed && state.party.length > 1 && state.status === 'play') {
    ctx.fillStyle = '#8ce27a';
    ctx.textAlign = 'center';
    ctx.fillText('X — ОСТАВИТЬ ДРУЖОЧКА НА КНОПКЕ', CONFIG.VIEW.w / 2, CONFIG.VIEW.h - 30);
  } else if (pickup && state.status === 'play') {
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

G.hud = { drawHud };
})(window.Game = window.Game || {});
