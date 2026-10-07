// Рисунки карточек улучшений: каждую рисует запись реестра (content/upgrades.js, поле art) на своём маленьком
// канвасе карточки, а здесь — заготовки рисования в стиле игры: тела союзников и врагов, снаряды, молнии, огонь.
// Состояние партии не читается и не меняется.
(function (G) {
'use strict';

const { COLORS, allyTypes, abilities, upgrades } = G;

const W = 200, H = 120;  // размер рисунка карточки

// цвет и подпись того, чьё улучшение
function whoOf(key) {
  const who = upgrades[key].who;
  if (who === 'hero') return { color: COLORS.hero, label: 'ГЕРОЙ' };
  return { color: abilities[who].color, label: abilities[who].name.toUpperCase() };
}

function kit(ctx) {
  const body = (x, y, r, color) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  };
  const mark = (u, paint) => { ctx.lineWidth = 2; ctx.strokeStyle = '#0e0e10'; paint(u, u.facing, ctx); };
  // заранее заданный разброс изломов: рисунок одинаковый при каждом показе
  const JAG = [0.6, -0.9, 0.4, -0.3, 0.8, -0.7, 0.2];
  return {
    // дружочек: без профессии (ability null) — цвета дружочка, иначе — цвета профессии с её знаком
    ally(x, y, ability, facing) {
      const u = { x, y, r: 14, facing };
      body(x, y, u.r, ability ? abilities[ability].color : COLORS.buddy);
      mark(u, allyTypes.buddy.mark);
      if (ability) mark(u, abilities[ability].mark);
    },
    hero(x, y, facing) {
      const u = { x, y, r: 15, facing, heading: facing };
      body(x, y, u.r, COLORS.hero);
      mark(u, allyTypes.hero.mark);
    },
    enemy(x, y, color = COLORS.enemy, r = 14) {
      body(x, y, r, color);
      ctx.fillStyle = '#0e0e10';
      for (const s of [-0.4, 0.4]) {
        ctx.beginPath();
        ctx.arc(x - r * 0.35, y + s * r, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    trail(x1, y1, x2, y2, color) {
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    },
    shot(x, y, color) { body(x, y, 4.5, color); },
    beam(x1, y1, x2, y2, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.globalAlpha = 1;
    },
    bolt(x1, y1, x2, y2, color) {
      const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
      const n = JAG.length + 1;
      const pts = [[x1, y1]];
      for (let i = 1; i < n; i++) pts.push([x1 + (dx * i) / n + nx * JAG[i - 1] * 8, y1 + (dy * i) / n + ny * JAG[i - 1] * 8]);
      pts.push([x2, y2]);
      for (const [width, c, a] of [[6, color, 0.4], [2, '#eef4ff', 1]]) {
        ctx.strokeStyle = c; ctx.lineWidth = width; ctx.globalAlpha = a;
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    flame(x, y, s) {
      for (const [k, c] of [[1, COLORS.fire], [0.55, COLORS.speed]]) {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(x, y - s * 1.3 * k);
        ctx.quadraticCurveTo(x + s * k, y, x, y + s * 0.6 * k);
        ctx.quadraticCurveTo(x - s * k, y, x, y - s * 1.3 * k);
        ctx.fill();
      }
    },
    ring(x, y, r, color, dashed) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = dashed ? 0.4 : 0.8;
      if (dashed) ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    },
    plus(x, y, s, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x - s, y); ctx.lineTo(x + s, y);
      ctx.moveTo(x, y - s); ctx.lineTo(x, y + s);
      ctx.stroke();
    },
    hpBar(x, y, frac) {
      ctx.fillStyle = COLORS.hpBack;
      ctx.fillRect(x - 18, y, 36, 5);
      ctx.fillStyle = COLORS.hpEnemy;
      ctx.fillRect(x - 18, y, 36 * frac, 5);
    },
    spikes(x, y, r) {
      ctx.fillStyle = COLORS.spiky;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2, w = 0.22;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a - w) * (r - 7), y + Math.sin(a - w) * (r - 7));
        ctx.lineTo(x + Math.cos(a) * (r + 5), y + Math.sin(a) * (r + 5));
        ctx.lineTo(x + Math.cos(a + w) * (r - 7), y + Math.sin(a + w) * (r - 7));
        ctx.fill();
      }
    },
    // щит — толстая дуга с той стороны тела, откуда идёт враг (справа; left — слева)
    shield(x, y, r, left) {
      ctx.strokeStyle = COLORS.sturdy;
      ctx.lineWidth = 5;
      const a = left ? Math.PI : 0;
      ctx.beginPath(); ctx.arc(x, y, r, a - 1.0, a + 1.0); ctx.stroke();
    },
    // маленький подиум усиления: светящийся квадрат
    pad(x, y, color) {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.3;
      ctx.fillRect(x - 12, y - 12, 24, 24);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 11, y - 11, 22, 22);
    },
    speedLines(x, y) {
      ctx.strokeStyle = '#8a8a95';
      ctx.lineWidth = 2;
      for (const [dy, len] of [[-12, 26], [0, 36], [12, 26]]) {
        ctx.beginPath(); ctx.moveTo(x, y + dy); ctx.lineTo(x + len, y + dy); ctx.stroke();
      }
    },
    impact(x, y) {
      ctx.strokeStyle = COLORS.speed;
      ctx.lineWidth = 3;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5);
        ctx.lineTo(x + Math.cos(a) * 13, y + Math.sin(a) * 13);
        ctx.stroke();
      }
    },
  };
}

// рисунок карточки улучшения key на канвасе canvas (его размер — W × H)
function drawCard(canvas, key) {
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#16161b';
  ctx.fillRect(0, 0, W, H);
  // мягкое свечение цветом того, чьё улучшение
  const g = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W * 0.6);
  g.addColorStop(0, whoOf(key).color + '30');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  upgrades[key].art(ctx, kit(ctx));
}

G.cards = { drawCard, whoOf };
})(window.Game = window.Game || {});
