// Примитивы отрисовки: канвас, фигуры юнитов, полоски HP. Состояние только читают.
(function (G) {
'use strict';

const { CONFIG, COLORS, state } = G;
const { clamp } = G.math;
const { allyTypes } = G;

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

function visible(rect) {
  return rect.x + rect.w > state.camera.x - 40 && rect.x < state.camera.x + CONFIG.VIEW.w + 40
      && rect.y + rect.h > state.camera.y - 40 && rect.y < state.camera.y + CONFIG.VIEW.h + 40;
}

function drawRects(list, color) {
  ctx.fillStyle = color;
  for (const r of list) if (visible(r)) ctx.fillRect(r.x, r.y, r.w, r.h);
}

function drawHpBar(u) {
  const w = u.r * 2.2, h = 4;
  const x = u.x - w / 2, y = u.y - u.r - 9;
  ctx.fillStyle = COLORS.hpBack;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = u.kind === 'enemy' ? COLORS.hpEnemy : COLORS.hpAlly;
  ctx.fillRect(x, y, w * clamp(u.hp / u.maxHp, 0, 1), h);
}

function drawUnitBody(u, color, filled) {
  ctx.beginPath();
  ctx.arc(u.x, u.y, u.r, 0, Math.PI * 2);
  if (filled) { ctx.fillStyle = color; ctx.fill(); }
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.stroke();
}

// знак на теле: общая заготовка линии, а сам рисунок задаёт paint(u, f, ctx, mode):
// f — направление взгляда, mode — 'lead' (с факелом) или 'chain' (в цепи)
function drawMark(u, paint, mode) {
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#0e0e10';
  paint(u, u.facing || 0, ctx, mode);
}

function allyColor(type) {
  return allyTypes[type].color;
}

G.shapes = { canvas, ctx, visible, drawRects, drawHpBar, drawUnitBody, drawMark, allyColor };
})(window.Game = window.Game || {});
