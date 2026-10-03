// Интерфейс поверх сцены: HUD, экраны победы и поражения. Состояние только читается.
(function (G) {
'use strict';

const { CONFIG, COLORS, state } = G;
const { abilities } = G;
const { currentRoom, isSpotted, chainSpeedMul, leader } = G.session;
const { roomCount, roomIndexAt, buttonUnder, world } = G.world;
const { clamp } = G.math;
const { nearestPickup } = G.chain;
const { ctx, allyColor } = G.shapes;

// метка у края экрана, указывающая на точку (x, y) за его пределами: треугольник цвета color и подпись
function drawEdgeMarker(x, y, color, text) {
  const V = CONFIG.VIEW, cam = state.camera;
  const sx = x - cam.x, sy = y - cam.y;
  if (sx > 0 && sx < V.w && sy > 0 && sy < V.h) return; // и так видно
  const cx = V.w / 2, cy = V.h / 2, dx = sx - cx, dy = sy - cy;
  const k = Math.min((V.w / 2 - 24) / Math.abs(dx || 1e-6), (V.h / 2 - 24) / Math.abs(dy || 1e-6));
  const px = cx + dx * k, py = cy + dy * k, a = Math.atan2(dy, dx);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.6 + 0.4 * Math.sin(state.time * 10);
  ctx.beginPath();
  ctx.moveTo(px + Math.cos(a) * 14, py + Math.sin(a) * 14);
  ctx.lineTo(px + Math.cos(a + 2.5) * 11, py + Math.sin(a + 2.5) * 11);
  ctx.lineTo(px + Math.cos(a - 2.5) * 11, py + Math.sin(a - 2.5) * 11);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  if (text) {
    ctx.textAlign = 'center';
    ctx.fillText(text, clamp(px - Math.cos(a) * 26, 30, V.w - 30), clamp(py - Math.sin(a) * 22 + 4, 14, V.h - 8));
    ctx.textAlign = 'left';
  }
}

// «Оборона»: откуда сейчас идёт волна (гнездо за краем экрана разгорается или только что выпустило отряд)
// и где база, если её бьют, пока она за экраном
function drawEdgeMarkers() {
  const cfg = state.level.waves;
  if (!cfg || state.status !== 'play') return;
  for (const n of state.nests) {
    if (n.nextIn < cfg.telegraph) drawEdgeMarker(n.x, n.y, COLORS.nest, `×${G.waves.waveSize(cfg, n.wave)}`);
    else if (state.time - n.releasedAt < 3) drawEdgeMarker(n.x, n.y, COLORS.nest, '');
  }
  if (state.base && state.base.regenTimer < 1) drawEdgeMarker(state.base.x, state.base.y, COLORS.baseEdge, 'БАЗА');
}

// мини-карта в правом нижнем углу (уровень задаёт minimap): стены и пропасти, двор, база, гнёзда (разгораются
// перед волной), враги, подиумы, ждущие дружочки, цепочка и рамка того, что сейчас на экране
const MINIMAP_W = 210;
function drawMinimap() {
  if (!state.level.minimap) return;
  const k = MINIMAP_W / world.width, w = MINIMAP_W, h = world.height * k;
  const x0 = CONFIG.VIEW.w - w - 10, y0 = CONFIG.VIEW.h - h - 10;
  const rect = (r, color) => { ctx.fillStyle = color; ctx.fillRect(x0 + r.x * k, y0 + r.y * k, Math.max(1, r.w * k), Math.max(1, r.h * k)); };
  const dot = (u, rad, color) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x0 + u.x * k, y0 + u.y * k, rad, 0, Math.PI * 2); ctx.fill(); };

  ctx.globalAlpha = 0.85;
  ctx.fillStyle = '#0c0c10';
  ctx.fillRect(x0, y0, w, h);
  ctx.globalAlpha = 1;
  if (world.home) rect(world.home, 'rgba(90,150,210,0.18)');
  for (const r of world.pits) rect(r, '#2a2a44');
  for (const r of world.walls.concat(world.pillars)) rect(r, '#6a6a78');
  if (world.base) rect(world.base, COLORS.baseEdge);

  const cfg = state.level.waves;
  for (const n of state.nests) {
    const soon = cfg ? Math.max(0, 1 - n.nextIn / cfg.telegraph) : 0;
    ctx.globalAlpha = 0.6 + 0.4 * soon * (0.5 + 0.5 * Math.sin(state.time * 12));
    dot(n, 4 + 2 * soon, COLORS.nest);
    ctx.globalAlpha = 1;
  }
  for (const p of state.pads) dot({ x: p.x + p.w / 2, y: p.y + p.h / 2 }, 2, (G.buffs[p.ability] || abilities[p.ability]).color);
  for (const n of state.neutrals) dot(n, 1.6, COLORS.buddy);
  for (const e of state.enemies) if (isSpotted(e)) dot(e, 1.4, COLORS.enemy);
  for (const a of state.party.slice(1)) dot(a, 1.6, allyColor(a));
  dot(leader(), 3, COLORS.hero);

  ctx.strokeStyle = '#c8c8d2';
  ctx.lineWidth = 1;
  ctx.strokeRect(x0 + state.camera.x * k, y0 + state.camera.y * k, CONFIG.VIEW.w * k, CONFIG.VIEW.h * k);
  ctx.strokeStyle = '#45454f';
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
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
  let goal = '';
  if (rule.kind === 'destroyType') goal = `   ${rule.label}: ${state.enemies.filter((e) => e.type === rule.type).length}`;
  // продержаться: сколько осталось и сколько HP у базы
  if (rule.kind === 'survive') {
    const left = Math.max(0, Math.ceil(rule.time - state.time));
    goal = `   ${rule.label}: ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    if (state.base) goal += `   БАЗА: ${Math.max(0, Math.ceil(state.base.hp))}/${state.base.maxHp}`;
  }
  ctx.fillStyle = '#c8c8d2';
  ctx.fillText(`${where}   ВРАГОВ ЗДЕСЬ: ${inRoom}${goal}   ЦЕПОЧКА: ${state.party.length}   СКОРОСТЬ: ${Math.round(chainSpeedMul() * 100)}%`, 12, 22);

  ctx.fillStyle = '#8a8a95';
  ctx.fillText('Подиумы подбираются сами: проедь по нему цепочкой', 12, 38);
  let y = 58;
  for (const a of state.party) {
    ctx.fillStyle = allyColor(a);
    const bf = Object.entries(a.buffs || {}).filter(([, t]) => t > 0).map(([k, t]) => ` ${G.buffs[k].name} ${Math.ceil(t)}с`).join('');
    const label = a.cfg.name + (a.ability ? ` (${abilities[a.ability].name}${a.abilityLevel > 1 ? ' ' + a.abilityLevel : ''})` : '') + bf;
    ctx.fillText(`${label.padEnd(34, ' ')} ${Math.max(0, Math.ceil(a.hp))}/${a.maxHp}`, 12, y);
    y += 16;
  }

  drawEdgeMarkers();
  drawMinimap();

  const pickup = nearestPickup();
  const btn = buttonUnder(leader());
  if (btn && !btn.pressed && state.party.length > 1 && state.status === 'play') {
    ctx.fillStyle = '#8ce27a';
    ctx.textAlign = 'center';
    ctx.fillText('X — ОСТАВИТЬ ДРУЖОЧКА НА КНОПКЕ', CONFIG.VIEW.w / 2, CONFIG.VIEW.h - 30);
  } else if (pickup && state.status === 'play') {
    ctx.fillStyle = '#f0f0f5';
    ctx.textAlign = 'center';
    const msg = pickup.kind === 'downed' ? 'ПРОБЕЛ — ПОДНЯТЬ' : 'ПРОБЕЛ — ПРИСОЕДИНИТЬ';
    ctx.fillText(msg, CONFIG.VIEW.w / 2, CONFIG.VIEW.h - 30);
  }

  if (state.status === 'dead' || state.status === 'win') {
    ctx.fillStyle = 'rgba(10,10,12,0.75)';
    ctx.fillRect(0, CONFIG.VIEW.h / 2 - 50, CONFIG.VIEW.w, 100);
    ctx.textAlign = 'center';
    ctx.fillStyle = state.status === 'win' ? '#8ce27a' : '#e06060';
    ctx.font = '28px monospace';
    const lostBase = state.base && state.base.hp <= 0;
    ctx.fillText(state.status === 'win' ? 'ПОБЕДА' : lostBase ? 'БАЗА РАЗРУШЕНА' : 'ПОРАЖЕНИЕ', CONFIG.VIEW.w / 2, CONFIG.VIEW.h / 2);
    ctx.font = '14px monospace';
    ctx.fillStyle = '#c8c8d2';
    ctx.fillText('R — начать заново', CONFIG.VIEW.w / 2, CONFIG.VIEW.h / 2 + 28);
  }
  ctx.restore();
}

G.hud = { drawHud };
})(window.Game = window.Game || {});
