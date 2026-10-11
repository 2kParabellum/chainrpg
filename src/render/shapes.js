// Примитивы отрисовки: канвас, фигуры юнитов, полоски HP. Состояние только читают.
(function (G) {
'use strict';

const { CONFIG, COLORS, state } = G;
const { clamp } = G.math;
const { allyTypes, abilities } = G;

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

// рисование в единицах вида (CONFIG.VIEW) без камеры: канвас крупнее в pixelScale раз (чёткость на телефоне)
function screenTransform() {
  const s = G.screen.pixelScale();
  ctx.setTransform(s, 0, 0, s, 0, 0);
}

function visible(rect) {
  return rect.x + rect.w > state.camera.x - 40 && rect.x < state.camera.x + CONFIG.VIEW.w + 40
      && rect.y + rect.h > state.camera.y - 40 && rect.y < state.camera.y + CONFIG.VIEW.h + 40;
}

function drawRects(list, color) {
  ctx.fillStyle = color;
  for (const r of list) if (visible(r)) ctx.fillRect(r.x, r.y, r.w, r.h);
}

// полоска HP — только у раненых: тёмная подложка со скруглением, свои — бирюзовая, враги — красная
function drawHpBar(u) {
  if (!(u.hp < u.maxHp)) return;
  const w = Math.min(90, u.r * 2.2), h = u.r > 30 ? 6 : 4;
  const x = u.x - w / 2, y = u.y - u.r - 12;
  ctx.fillStyle = COLORS.hpBack;
  ctx.beginPath(); ctx.roundRect(x - 1.5, y - 1.5, w + 3, h + 3, 3); ctx.fill();
  ctx.fillStyle = u.kind === 'enemy' ? COLORS.hpEnemy : COLORS.hpAlly;
  ctx.beginPath(); ctx.roundRect(x, y, w * clamp(u.hp / u.maxHp, 0.03, 1), h, 2); ctx.fill();
}

function drawUnitBody(u, color, filled) {
  ctx.beginPath();
  ctx.arc(u.x, u.y, u.r, 0, Math.PI * 2);
  if (filled) { ctx.fillStyle = color; ctx.fill(); }
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.stroke();
}

// знак на теле: общая заготовка линии, а сам рисунок задаёт paint(u, f, ctx): f — направление взгляда
function drawMark(u, paint) {
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#0e0e10';
  paint(u, u.facing || 0, ctx);
}

// цвет тела союзника: Герой всегда голубой, остальные — цветом способности, а без неё цветом типа
function allyColor(u) {
  const t = allyTypes[u.type];
  return u.ability && !t.anchor ? abilities[u.ability].color : t.color;
}

// подпись союзника: со способностью — её название и уровень прокачки («Gun Mate 2»), без неё — имя типа («Mate», «Hero»)
function unitName(u) {
  if (!u.ability) return u.cfg.name;
  return abilities[u.ability].name + (u.abilityLevel > 1 ? ' ' + u.abilityLevel : '');
}

G.shapes = { canvas, ctx, screenTransform, visible, drawRects, drawHpBar, drawUnitBody, drawMark, allyColor, unitName };
})(window.Game = window.Game || {});
