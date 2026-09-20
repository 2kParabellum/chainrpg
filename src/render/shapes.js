// Примитивы отрисовки: канвас, фигуры юнитов, полоски HP. Состояние только читают.
(function (G) {
'use strict';

const { CONFIG, COLORS, state } = G;
const { clamp } = G.math;

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

function visible(rect) {
  return rect.x + rect.w > state.camera.x - 40 && rect.x < state.camera.x + CONFIG.ROOM_W + 40;
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

function drawMark(u, type) {
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#0e0e10';
  const f = u.facing || 0;
  if (type === 'crossbow') {
    ctx.beginPath();
    ctx.moveTo(u.x, u.y);
    ctx.lineTo(u.x + Math.cos(f) * u.r, u.y + Math.sin(f) * u.r);
    ctx.moveTo(u.x + Math.cos(f + 1.5) * u.r * 0.7, u.y + Math.sin(f + 1.5) * u.r * 0.7);
    ctx.lineTo(u.x + Math.cos(f - 1.5) * u.r * 0.7, u.y + Math.sin(f - 1.5) * u.r * 0.7);
    ctx.stroke();
  } else if (type === 'medic') {
    ctx.beginPath();
    ctx.moveTo(u.x - u.r * 0.55, u.y); ctx.lineTo(u.x + u.r * 0.55, u.y);
    ctx.moveTo(u.x, u.y - u.r * 0.55); ctx.lineTo(u.x, u.y + u.r * 0.55);
    ctx.stroke();
  } else if (type === 'shotgun') {
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(u.x - Math.cos(f) * u.r * 0.3, u.y - Math.sin(f) * u.r * 0.3);
    ctx.lineTo(u.x + Math.cos(f) * u.r * 0.8, u.y + Math.sin(f) * u.r * 0.8);
    ctx.stroke();
  } else if (type === 'cutter') {
    // лезвия-«копья» по кругу: видно, на какой дистанции он рубит
    ctx.strokeStyle = '#0e0e10';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + f * 0.5;
      ctx.moveTo(u.x + Math.cos(a) * u.r * 0.45, u.y + Math.sin(a) * u.r * 0.45);
      ctx.lineTo(u.x + Math.cos(a) * u.r * 1.05, u.y + Math.sin(a) * u.r * 1.05);
    }
    ctx.stroke();
  } else if (type === 'booster') {
    ctx.beginPath();
    for (const off of [-0.45, 0.25]) {
      ctx.moveTo(u.x - u.r * 0.5, u.y + u.r * (off + 0.45));
      ctx.lineTo(u.x, u.y + u.r * off);
      ctx.lineTo(u.x + u.r * 0.5, u.y + u.r * (off + 0.45));
    }
    ctx.stroke();
  } else if (type === 'player') {
    ctx.beginPath();
    ctx.moveTo(u.x + Math.cos(f) * u.r * 0.9, u.y + Math.sin(f) * u.r * 0.9);
    ctx.lineTo(u.x + Math.cos(f + 2.5) * u.r * 0.7, u.y + Math.sin(f + 2.5) * u.r * 0.7);
    ctx.lineTo(u.x + Math.cos(f - 2.5) * u.r * 0.7, u.y + Math.sin(f - 2.5) * u.r * 0.7);
    ctx.closePath();
    ctx.stroke();
  }
}

function allyColor(type) {
  return COLORS[type] || COLORS.shotgun;
}

G.shapes = { canvas, ctx, visible, drawRects, drawHpBar, drawUnitBody, drawMark, allyColor };
})(window.Game = window.Game || {});
