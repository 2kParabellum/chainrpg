// Рисунки карточек улучшений: каждую рисует запись реестра (content/upgrades.js, поле art) на своём маленьком
// канвасе карточки, а здесь — заготовки рисования в стиле игры. Свои, враги и подиумы — те же картинки, что на поле
// (render/blobs.js, render/foes.js, render/padart.js, через shapes.drawOn); пули, молнии, лечение, огонь, удар —
// как в бою. Фон — кусочек пола с мягким свечением цветом того, чьё улучшение.
// Состояние партии не читается и не меняется.
(function (G) {
'use strict';

const { COLORS, abilities, upgrades } = G;
const { drawOn, glow } = G.shapes;

const W = 200, H = 120;  // размер рисунка карточки (в его единицах рисуют записи реестра)
const INK = COLORS.floorLine, TAU = Math.PI * 2;

// цвет и подпись того, чьё улучшение
function whoOf(key) {
  const who = upgrades[key].who;
  if (who === 'hero') return { color: COLORS.hero, label: 'HERO' };
  return { color: abilities[who].color, label: abilities[who].name.toUpperCase() };
}

// фон: каменные плиты пола, тёмные края, свечение цветом хозяина улучшения
function paintBack(ctx, col) {
  ctx.fillStyle = COLORS.floor; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.globalAlpha = 0.55; ctx.fillStyle = COLORS.floorStone;
  const s = 40;
  for (let ty = 0; ty * s < H + s; ty++) {
    for (let tx = -1; tx * s < W + s; tx++) {
      const x = tx * s + (ty & 1) * s / 2, y = ty * s - 10;
      if ((tx * 7 + ty * 13) % 5 === 0) ctx.fillRect(x + 4, y + 4, s - 8, s - 8);
      ctx.strokeRect(x, y, s, s);
    }
  }
  ctx.globalAlpha = 1;
  glow(ctx, W / 2, H / 2, W * 0.62, col, 0.22, 0.1);
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.62);
  v.addColorStop(0, 'rgba(20,10,5,0)'); v.addColorStop(1, 'rgba(20,10,5,0.55)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
}

function kit(ctx) {
  // свои, враги и подиумы рисуются модулями поля на холсте карточки
  const mate = (type, x, y, ability, facing, hp) => ({ kind: 'ally', type, x, y, r: type === 'hero' ? 14 : 13, hp: hp === undefined ? 80 : hp * 80,
    maxHp: 80, facing, heading: facing, gear: [], buffs: {}, buffOrder: [], ability, abilityLevel: ability ? 1 : 0 });
  const ally = (u) => drawOn(ctx, () => G.blobs.drawAlly(u, 'chain'));
  // заранее заданный разброс изломов: рисунок одинаковый при каждом показе
  const JAG = [0.6, -0.9, 0.4, -0.3, 0.8, -0.7, 0.2];
  const plusMark = (x, y, s, color) => {
    const w = s * 0.38;
    ctx.fillStyle = color; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - w, y - s); ctx.lineTo(x + w, y - s); ctx.lineTo(x + w, y - w); ctx.lineTo(x + s, y - w); ctx.lineTo(x + s, y + w);
    ctx.lineTo(x + w, y + w); ctx.lineTo(x + w, y + s); ctx.lineTo(x - w, y + s); ctx.lineTo(x - w, y + w); ctx.lineTo(x - s, y + w);
    ctx.lineTo(x - s, y - w); ctx.lineTo(x - w, y - w); ctx.closePath(); ctx.fill(); ctx.stroke();
  };
  return {
    // дружочек: без профессии (ability null) — просто дружочек, иначе — в шапке и с оружием профессии;
    // hp — доля здоровья (меньше 0.3 — усталые глаза)
    ally(x, y, ability, facing, hp) { ally(mate('buddy', x, y, ability, facing, hp)); },
    hero(x, y, facing) { ally(mate('hero', x, y, null, facing)); },
    // враг тёмной расы; type — тип врага ('shooter', 'hunter', 'zombie', 'bull'…), смотрит влево (на своих)
    enemy(x, y, type = 'shooter', facing = Math.PI) {
      const r = { hunter: 10, zombie: 17, bull: 18 }[type] || 14;
      drawOn(ctx, () => G.foes.draw({ type, x, y, r, hp: 10, maxHp: 10, facing, cd: 3, cfg: { chargeMaxDist: 300 }, state: 'idle' }));
    },
    trail(x1, y1, x2, y2, color) {
      ctx.strokeStyle = color; ctx.globalAlpha = 0.55; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.lineCap = 'butt';
    },
    // пуля своих, как в бою: кремовая капсула с тёмной обводкой и золотым следом; огненная — оранжевая
    shot(x, y, color, ang = 0) {
      const r = 4, burn = color === COLORS.fire;
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
      ctx.strokeStyle = burn ? COLORS.fire : COLORS.speed; ctx.globalAlpha = 0.45; ctx.lineCap = 'round'; ctx.lineWidth = r * 1.2;
      ctx.beginPath(); ctx.moveTo(-r * 1.5, 0); ctx.lineTo(-r * 5, 0); ctx.stroke();
      ctx.globalAlpha = 1; ctx.lineCap = 'butt';
      ctx.fillStyle = burn ? COLORS.fire : color === COLORS.allyShot ? COLORS.allyShot : color;
      ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(-r * 1.8, -r * 0.8, r * 3.2, r * 1.6, r * 0.8); ctx.fill(); ctx.stroke();
      ctx.restore();
    },
    // луч лечения, как в бою: мягкий светлый луч и бегущие по нему плюсики
    beam(x1, y1, x2, y2, color) {
      ctx.strokeStyle = color; ctx.globalAlpha = 0.55; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.globalAlpha = 1; ctx.lineCap = 'butt';
      for (const q of [0.3, 0.62]) plusMark(x1 + (x2 - x1) * q, y1 + (y2 - y1) * q, 4, COLORS.regen);
    },
    // молния Искры, как в бою: тёмная обводка, цветной ореол, светлая середина, искры на конце
    bolt(x1, y1, x2, y2, color) {
      const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
      const n = JAG.length + 1, pts = [[x1, y1]];
      for (let i = 1; i < n; i++) pts.push([x1 + (dx * i) / n + nx * JAG[i - 1] * 7, y1 + (dy * i) / n + ny * JAG[i - 1] * 7]);
      pts.push([x2, y2]);
      ctx.lineJoin = 'round';
      for (const [width, c, a] of [[6, INK, 0.6], [4, color, 0.75], [1.6, '#fff4dc', 1]]) {
        ctx.strokeStyle = c; ctx.lineWidth = width; ctx.globalAlpha = a;
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff4dc';
      for (const [ax, ay] of [[4, -5], [-5, 3], [6, 4]]) ctx.fillRect(x2 + ax - 1.5, y2 + ay - 1.5, 3, 3);
    },
    // язычок огня, как на горящем враге
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
      ctx.strokeStyle = color; ctx.lineWidth = dashed ? 2 : 3; ctx.globalAlpha = dashed ? 0.55 : 0.85;
      if (dashed) ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    },
    plus(x, y, s, color) { plusMark(x, y, s, color); },
    // погибший враг: тёмные кусочки разлетаются от места, где он был
    pop(x, y) {
      ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * TAU + 0.4, d = 9 + (i % 3) * 4;
        ctx.fillStyle = i % 2 ? '#9b1a0a' : '#550f0a';
        ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, 3.2, 2.6, a, 0, TAU); ctx.fill(); ctx.stroke();
      }
    },
    // полоска HP, как в бою: свои — зелёная, враги — красная
    hpBar(x, y, frac, enemy) {
      ctx.fillStyle = COLORS.hpBack;
      ctx.beginPath(); ctx.roundRect(x - 19.5, y - 1.5, 39, 8, 3); ctx.fill();
      ctx.fillStyle = enemy ? COLORS.hpEnemy : COLORS.hpAlly;
      ctx.beginPath(); ctx.roundRect(x - 18, y, 36 * frac, 5, 2); ctx.fill();
    },
    spikes(x, y, r) {
      ctx.fillStyle = COLORS.spiky; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU, w = 0.22;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a - w) * (r - 6), y + Math.sin(a - w) * (r - 6));
        ctx.lineTo(x + Math.cos(a) * (r + 6), y + Math.sin(a) * (r + 6));
        ctx.lineTo(x + Math.cos(a + w) * (r - 6), y + Math.sin(a + w) * (r - 6));
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    },
    // щит — толстая дуга с той стороны тела, откуда идёт враг (справа; left — слева)
    shield(x, y, r, left) {
      const a = left ? Math.PI : 0;
      ctx.lineCap = 'round';
      for (const [w, c] of [[8, INK], [5, COLORS.sturdy], [1.5, '#fff4dc']]) {
        ctx.strokeStyle = c; ctx.lineWidth = w;
        ctx.beginPath(); ctx.arc(x, y, r, a - 0.9, a + 0.9); ctx.stroke();
      }
      ctx.lineCap = 'butt';
    },
    // подиум усиления, как на поле, только меньше; key — ключ усиления ('speed', 'power', 'regen', 'will'…)
    pad(x, y, key, k = 0.5) {
      const S = 62;
      ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
      drawOn(ctx, () => G.padArt.drawPad({ x: -S / 2, y: -S / 2, w: S, h: S }, key, 1));
      ctx.restore();
    },
    // золотые полосы скорости, как у Героя под «скоростью»
    speedLines(x, y) {
      ctx.strokeStyle = COLORS.speed; ctx.lineCap = 'round'; ctx.lineWidth = 3;
      for (const [dy, len, a] of [[-12, 24, 0.6], [0, 34, 0.9], [12, 24, 0.6]]) {
        ctx.globalAlpha = a;
        ctx.beginPath(); ctx.moveTo(x, y + dy); ctx.lineTo(x + len, y + dy); ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.lineCap = 'butt';
    },
    // вспышка удара, как в бою: лучи с тёмной обводкой
    impact(x, y, color = COLORS.speed) {
      ctx.lineCap = 'round';
      for (const [w, c] of [[5, INK], [2.5, color]]) {
        ctx.strokeStyle = c; ctx.lineWidth = w;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * TAU + 0.3;
          ctx.moveTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5); ctx.lineTo(x + Math.cos(a) * 13, y + Math.sin(a) * 13);
        }
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
    },
  };
}

// рисунок карточки улучшения key на канвасе canvas: W × H единиц, в пикселях — с запасом на чёткость экрана
function drawCard(canvas, key) {
  const k = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
  canvas.width = W * k; canvas.height = H * k;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(k, 0, 0, k, 0, 0);
  paintBack(ctx, whoOf(key).color);
  upgrades[key].art(ctx, kit(ctx));
}

G.cards = { drawCard, whoOf };
})(window.Game = window.Game || {});
