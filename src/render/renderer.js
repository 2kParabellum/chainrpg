// Отрисовка сцены: мир и сущности. Порядок вызовов в drawScene() — это порядок слоёв.
// Интерфейс поверх сцены рисует render/hud.js. Состояние здесь только читается.
(function (G) {
'use strict';

const { CONFIG, COLORS, state } = G;
const { clamp, dist } = G.math;
const { world } = G.world;
const { isLit, isSpotted, lightRadius } = G.session;
const { allyTypes, enemyTypes } = G;
const shapes = G.shapes;
const { canvas, ctx, visible, drawRects, drawHpBar, drawUnitBody, drawMark, playerMark, allyColor } = shapes;

// знак на полу: заминированная комната
function drawWarning(w) {
  ctx.strokeStyle = COLORS.warning;
  ctx.lineWidth = 2;
  const s = 15;
  ctx.beginPath();
  ctx.moveTo(w.x, w.y - s);
  ctx.lineTo(w.x + s, w.y + s * 0.8);
  ctx.lineTo(w.x - s, w.y + s * 0.8);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(w.x, w.y - s * 0.35);
  ctx.lineTo(w.x, w.y + s * 0.2);
  ctx.stroke();
  ctx.fillStyle = COLORS.warning;
  ctx.fillRect(w.x - 1.5, w.y + s * 0.42, 3, 3);
}

// тело врага рисует его запись в реестре, полоску HP — сцена
function drawEnemy(e) {
  enemyTypes[e.type].draw(e, shapes);
  drawHpBar(e);
}

// нить гарпуна тянется от Скорпиона к наконечнику, пока тот летит
function drawHook(p) {
  if (!isLit(p)) return;
  if (p.owner && state.enemies.includes(p.owner)) {
    ctx.strokeStyle = COLORS.scorpion;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(p.owner.x, p.owner.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
  const a = Math.atan2(p.vy, p.vx);
  ctx.fillStyle = COLORS.scorpion;
  ctx.beginPath();
  ctx.moveTo(p.x + Math.cos(a) * p.r * 1.6, p.y + Math.sin(a) * p.r * 1.6);
  ctx.lineTo(p.x + Math.cos(a + 2.4) * p.r, p.y + Math.sin(a + 2.4) * p.r);
  ctx.lineTo(p.x + Math.cos(a - 2.4) * p.r, p.y + Math.sin(a - 2.4) * p.r);
  ctx.closePath();
  ctx.fill();
}

// вонючее облако: рваный круг, который тускнеет к концу жизни
function drawCloud(c) {
  if (dist(state.player, c) > lightRadius() + c.cur) return;
  const fade = clamp(c.life / 0.8, 0, 1);
  ctx.fillStyle = COLORS.cloud;
  ctx.globalAlpha = 0.16 * fade;
  ctx.beginPath();
  ctx.arc(c.x, c.y, c.cur, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.5 * fade;
  ctx.strokeStyle = COLORS.cloud;
  ctx.lineWidth = 2;
  ctx.setLineDash([9, 7]);
  ctx.beginPath();
  ctx.arc(c.x, c.y, c.cur, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.28 * fade;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + c.t * 0.6;
    const rr = c.cur * (0.32 + (i % 2) * 0.18);
    ctx.beginPath();
    ctx.arc(c.x + Math.cos(a) * c.cur * 0.45, c.y + Math.sin(a) * c.cur * 0.45, rr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawMortar(p) {
  const k = Math.min(1, p.t / p.flight);

  // круг на земле показывает, куда прилетит: успеть выйти можно только заранее
  if (isLit({ x: p.tx, y: p.ty, r: 0 })) {
    ctx.strokeStyle = COLORS.blast;
    ctx.globalAlpha = 0.25 + k * 0.55;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(p.tx, p.ty, p.blast, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(p.tx, p.ty, p.blast * k, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  if (!isLit(p)) return;
  const height = Math.sin(k * Math.PI) * 55;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, p.r * 1.2, p.r * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.blast;
  ctx.beginPath();
  ctx.arc(p.x, p.y - height, p.r + 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawTerrain() {
  drawRects(world.floors, COLORS.floor);

  ctx.fillStyle = COLORS.pit;
  ctx.strokeStyle = COLORS.pitEdge;
  ctx.lineWidth = 2;
  for (const r of world.pits) {
    if (!visible(r)) continue;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
  }

  for (const r of world.spikes) {
    if (!visible(r)) continue;
    ctx.fillStyle = COLORS.spikeFloor;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = COLORS.spikeTeeth;
    const s = 12;
    for (let y = r.y + 4; y < r.y + r.h - 4; y += s) {
      for (let x = r.x + 4; x < r.x + r.w - 4; x += s) {
        ctx.beginPath();
        ctx.moveTo(x, y + s * 0.6);
        ctx.lineTo(x + s * 0.35, y);
        ctx.lineTo(x + s * 0.7, y + s * 0.6);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  drawRects(world.walls, COLORS.wall);
  drawRects(world.pillars, COLORS.pillar);
}

// точка назначения
function drawTargetMarker() {
  const target = state.player.target;
  if (target && state.status === 'play') {
    ctx.strokeStyle = 'rgba(99,210,255,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(target.x, target.y, 6, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawNeutrals() {
  for (const n of state.neutrals) {
    if (!isLit(n)) continue;
    ctx.setLineDash([4, 4]);
    drawUnitBody(n, COLORS.neutral, false);
    ctx.setLineDash([]);
    drawMark(n, allyTypes[n.type].mark);
    ctx.fillStyle = COLORS.neutral;
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(n.cfg.name, n.x, n.y + n.r + 14);
  }
}

// выбитые из цепочки лежат и ждут, пока их подберут
function drawDowned() {
  for (const d of state.downed) {
    if (!isLit(d)) continue;
    const color = allyColor(d.type);
    ctx.globalAlpha = 0.55;
    drawUnitBody(d, color, true);
    ctx.globalAlpha = 1;
    ctx.setLineDash([3, 3]);
    drawUnitBody(d, color, false);
    ctx.setLineDash([]);
    ctx.strokeStyle = '#0e0e10';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(d.x - d.r * 0.5, d.y - d.r * 0.5); ctx.lineTo(d.x + d.r * 0.5, d.y + d.r * 0.5);
    ctx.moveTo(d.x + d.r * 0.5, d.y - d.r * 0.5); ctx.lineTo(d.x - d.r * 0.5, d.y + d.r * 0.5);
    ctx.stroke();
    drawHpBar(d);
    ctx.fillStyle = color;
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(d.cfg.name, d.x, d.y + d.r + 14);
  }
}

function drawWarnings() {
  for (const w of world.warnings) {
    if (Math.abs(w.x - state.camera.x - CONFIG.VIEW.w / 2) > CONFIG.VIEW.w) continue;
    drawWarning(w);
  }
}

function drawEnemies() {
  for (const e of state.enemies) {
    if (!isLit(e)) continue;
    if (!isSpotted(e)) continue;
    drawEnemy(e);
  }
}

function drawClouds() {
  for (const c of state.clouds) drawCloud(c);
}

// Усилок отмечает ниточками тех соседей, кого ускоряет
function drawBoosterLinks() {
  const allies = state.allies;
  ctx.strokeStyle = COLORS.booster;
  ctx.lineWidth = 2;
  for (let i = 0; i < allies.length; i++) {
    if (!allyTypes[allies[i].type].stats.rateBonus) continue;
    for (const j of [i - 1, i + 1]) {
      if (j < 0 || j >= allies.length) continue;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(allies[i].x, allies[i].y);
      ctx.lineTo(allies[j].x, allies[j].y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

// цепочка: с хвоста, чтобы голова оказалась сверху
function drawChain() {
  for (let i = state.allies.length - 1; i >= 0; i--) {
    const a = state.allies[i];
    drawUnitBody(a, allyColor(a.type), true);
    drawMark(a, allyTypes[a.type].mark);
    drawHpBar(a);
  }

  drawUnitBody(state.player, COLORS.player, true);
  drawMark(state.player, playerMark);
  drawHpBar(state.player);
}

function drawProjectiles() {
  for (const p of state.projectiles) {
    if (p.kind === 'mortar') { drawMortar(p); continue; }
    if (p.kind === 'hook') { drawHook(p); continue; }
    if (!isLit(p)) continue;
    ctx.fillStyle = p.team === 'ally' ? COLORS.allyShot : COLORS.enemyShot;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawEffects() {
  for (const fx of state.effects) {
    if (fx.type === 'beam') {
      ctx.strokeStyle = fx.color;
      ctx.globalAlpha = clamp(fx.life * 4, 0, 1);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(fx.x1, fx.y1);
      ctx.lineTo(fx.x2, fx.y2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (fx.type === 'ring') {
      ctx.globalAlpha = clamp(fx.life * 5, 0, 0.8);
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, fx.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (fx.type === 'blast') {
      const grow = fx.r * (1.15 - fx.life * 0.45);
      ctx.globalAlpha = clamp(fx.life * 1.6, 0, 0.22);
      ctx.fillStyle = COLORS.blast;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, grow, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = clamp(fx.life * 2.6, 0, 0.9);
      ctx.strokeStyle = COLORS.blast;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, grow, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

// сцена целиком, слой за слоем; камера остаётся применённой до конца кадра
function drawScene() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0a0a0c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(-state.camera.x, -state.camera.y);

  drawTerrain();
  drawTargetMarker();
  drawNeutrals();
  drawDowned();
  drawWarnings();
  drawEnemies();
  drawClouds();
  drawBoosterLinks();
  drawChain();
  drawProjectiles();
  drawEffects();
}

G.renderer = { drawScene };
})(window.Game = window.Game || {});
