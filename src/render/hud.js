// Интерфейс поверх сцены: затемнение за границей фонаря, HUD, меню порядка цепочки,
// экраны победы и поражения. Состояние только читается.
(function (G) {
'use strict';

const { CONFIG, COLORS, state } = G;
const { clamp } = G.math;
const { currentRoom, lightRadius, isSpotted } = G.session;
const { roomCount, roomIndexAt } = G.world;
const { nearestPickup, MENU, menuRect, menuRowY, menuPreviewOrder } = G.chain;
const { ctx, allyColor } = G.shapes;

function drawMenuRow(u, y, label, alpha) {
  const r = menuRect();
  const x = r.x + 10, w = r.w - 20, h = MENU.rowH - 6;
  const color = u.type === 'player' ? COLORS.player : allyColor(u.type);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#23232a';
  ctx.fillRect(x, y + 3, w, h);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 3.5, w - 1, h - 1);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + 20, y + 3 + h / 2, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.textAlign = 'left';
  ctx.font = '13px monospace';
  ctx.fillText(label, x + 40, y + 3 + h / 2 + 4);
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.max(0, Math.ceil(u.hp))}/${u.maxHp}`, x + w - 10, y + 3 + h / 2 + 4);
  ctx.globalAlpha = 1;
}

// меню порядка цепочки: игрок сверху, союзники ниже в том порядке, в каком они бегут за ним
function drawMenu() {
  const r = menuRect();
  ctx.fillStyle = 'rgba(10,10,12,0.6)';
  ctx.fillRect(0, 0, CONFIG.VIEW.w, CONFIG.VIEW.h);
  ctx.fillStyle = '#16161b';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = '#45454f';
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

  ctx.fillStyle = '#c8c8d2';
  ctx.font = '14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ПОРЯДОК ЦЕПОЧКИ', r.x + r.w / 2, r.y + 22);
  ctx.font = '11px monospace';
  ctx.fillStyle = '#8a8a95';
  ctx.fillText(state.allies.length > 1 ? 'перетащи мышью, чтобы поменять местами' : 'пока переставлять некого',
    r.x + r.w / 2, r.y + 38);

  drawMenuRow(state.player, menuRowY(0), 'ИГРОК (голова)', 1);

  const order = menuPreviewOrder();
  const dragged = state.menu.drag ? state.allies[state.menu.drag.from] : null;
  order.forEach((a, i) => {
    const y = menuRowY(i + 1);
    drawMenuRow(a, y, `${i + 1}. ${a.cfg.name}`, a === dragged ? 0.25 : 1);
  });
  if (dragged) {
    const y = clamp(state.menu.drag.y - MENU.rowH / 2, menuRowY(1), menuRowY(state.allies.length));
    drawMenuRow(dragged, y, dragged.cfg.name, 1);
  }

  ctx.fillStyle = '#8a8a95';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('C / ESC — закрыть, игра на паузе', r.x + r.w / 2, r.y + r.h - 10);
}

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
  ctx.fillText(`${where}   ВРАГОВ ЗДЕСЬ: ${inRoom}${goal}   ЦЕПОЧКА: ${state.allies.length + 1}/${CONFIG.CHAIN.maxAllies + 1}`, 12, 22);

  let y = 44;
  ctx.fillStyle = COLORS.player;
  ctx.fillText(`ИГРОК  ${Math.max(0, Math.ceil(state.player.hp))}/${state.player.maxHp}`, 12, y);
  for (const a of state.allies) {
    y += 16;
    ctx.fillStyle = allyColor(a.type);
    ctx.fillText(`${a.cfg.name.padEnd(9, ' ')} ${Math.max(0, Math.ceil(a.hp))}/${a.maxHp}`, 12, y);
  }

  const pickup = nearestPickup();
  if (pickup && state.status === 'play') {
    ctx.fillStyle = '#f0f0f5';
    ctx.textAlign = 'center';
    const msg = state.allies.length >= CONFIG.CHAIN.maxAllies ? 'ЦЕПОЧКА ПОЛНАЯ'
      : pickup.kind === 'downed' ? 'ПРОБЕЛ — ПОДНЯТЬ' : 'ПРОБЕЛ — ПРИСОЕДИНИТЬ';
    ctx.fillText(msg, CONFIG.VIEW.w / 2, CONFIG.VIEW.h - 30);
  }

  if (state.menu.open) drawMenu();

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

// темнота за пределами фонаря
function drawLight() {
  const r = lightRadius();
  const g = ctx.createRadialGradient(state.player.x, state.player.y, r * CONFIG.VISION.innerRatio,
    state.player.x, state.player.y, r);
  g.addColorStop(0, 'rgba(6,6,8,0)');
  g.addColorStop(1, `rgba(6,6,8,${CONFIG.VISION.darkness})`);
  ctx.fillStyle = g;
  ctx.fillRect(state.camera.x, state.camera.y, CONFIG.VIEW.w, CONFIG.VIEW.h);
}

G.hud = { drawLight, drawHud };
})(window.Game = window.Game || {});
