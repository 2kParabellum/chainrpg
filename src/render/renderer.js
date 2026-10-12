// Отрисовка сцены: мир и сущности. Порядок вызовов в drawScene() — это порядок слоёв.
// Интерфейс поверх сцены рисует render/hud.js. Состояние здесь только читается.
(function (G) {
'use strict';

const { CONFIG, COLORS, state } = G;
const { clamp, dist } = G.math;
const { world } = G.world;
const { padUnder } = G.pads;
const { isSpotted } = G.session;
const { allyTypes, enemyTypes, weapons, abilities } = G;
const shapes = G.shapes;
const { canvas, ctx, screenTransform, visible, drawRects, drawHpBar, drawUnitBody, drawMark, allyColor } = shapes;

// точка (с запасом pad) попадает в кадр: рисовать то, что за экраном, незачем
function onScreen(p, pad = 0) {
  const r = (p.r || 0) + pad;
  return visible({ x: p.x - r, y: p.y - r, w: r * 2, h: r * 2 });
}

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

// обычных врагов рисует render/foes.js (тёмная раса, graphics.md), остальных — их запись в реестре, полоску HP — сцена
// записи реестра получают примитивы рисования и тела тёмной расы (g.foe)
const enemyDraw = { ...shapes, foe: G.foes };
function drawEnemy(e) {
  if (G.foes.has(e.type)) { G.foes.draw(e); return; }
  enemyTypes[e.type].draw(e, enemyDraw);
  drawHpBar(e);
}

// нить гарпуна тянется от Скорпиона к наконечнику, пока тот летит
function drawHook(p) {
  if (!onScreen(p)) return;
  if (G.foes.drawsHook(p.owner)) return; // лапу на пружине рисует сам Скорпион (render/foes.js)
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
  if (!onScreen(c, c.cur)) return;
  const fade = clamp(c.life / 0.8, 0, 1);
  const color = c.color || COLORS.cloud;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.16 * fade;
  ctx.beginPath();
  ctx.arc(c.x, c.y, c.cur, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.5 * fade;
  ctx.strokeStyle = color;
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
  const color = p.color || COLORS.blast;
  if (onScreen({ x: p.tx, y: p.ty, r: 0 }, p.blast)) {
    ctx.strokeStyle = color;
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

  if (!onScreen(p)) return;
  const height = Math.sin(k * Math.PI) * 55;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, p.r * 1.2, p.r * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  const r = p.r + 3;
  ctx.fillStyle = COLORS.boss;
  ctx.strokeStyle = COLORS.floorLine;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(p.x, p.y - height, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(p.x - r * 0.25, p.y - height - r * 0.25, r * 0.45, 0, Math.PI * 2); ctx.fill();
}

// стенка огня: толстая тускнеющая полоса вдоль отрезка, горит, пока не истечёт срок
function drawFirewall(f) {
  const mx = (f.x1 + f.x2) / 2, my = (f.y1 + f.y2) / 2;
  if (!onScreen({ x: mx, y: my, r: 0 }, f.r + Math.hypot(f.x2 - f.x1, f.y2 - f.y1) / 2)) return;
  const fade = clamp(f.life / f.maxLife, 0.15, 1);
  ctx.lineCap = 'round';
  ctx.strokeStyle = COLORS.fire;
  ctx.globalAlpha = 0.22 * fade;
  ctx.lineWidth = f.r * 2;
  ctx.beginPath();
  ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2);
  ctx.stroke();
  ctx.globalAlpha = 0.8 * fade;
  ctx.lineWidth = f.r * 0.7;
  ctx.beginPath();
  ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2);
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.globalAlpha = 1;
}

// двери: закрытая — сплошная плашка (как колонна), открытая — только тонкий контур на полу,
// чтобы было видно, где она стояла
function drawDoors() {
  for (const d of world.doors) {
    if (!visible(d)) continue;
    if (!d.open) {
      ctx.fillStyle = COLORS.door;
      ctx.fillRect(d.x, d.y, d.w, d.h);
      ctx.strokeStyle = COLORS.doorEdge;
      ctx.lineWidth = 2;
      ctx.strokeRect(d.x + 1, d.y + 1, d.w - 2, d.h - 2);
    } else {
      ctx.strokeStyle = COLORS.doorEdge;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(d.x + 1, d.y + 1, d.w - 2, d.h - 2);
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }
}

// кнопки: квадрат на полу, светится зелёным, пока на ней лежит брошенный союзник; от кнопки к её дверям —
// бегущий пунктир (пока дверь закрыта), чтобы было видно, что она открывает
function drawButtons() {
  for (const b of world.buttons) {
    const bx = b.x + b.w / 2, by = b.y + b.h / 2;
    for (const d of world.doors) {
      if (d.open || !b.doorIds.includes(d.id)) continue;
      ctx.strokeStyle = COLORS.buttonEdge;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 8]);
      ctx.lineDashOffset = -state.time * 30;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(d.x + d.w / 2, d.y + d.h / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
      ctx.globalAlpha = 1;
    }
    if (!visible(b)) continue;
    const color = b.pressed ? COLORS.buttonPressed : COLORS.button;
    ctx.fillStyle = color;
    ctx.globalAlpha = b.pressed ? 0.5 : 0.3;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = b.pressed ? COLORS.buttonPressed : COLORS.buttonEdge;
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
  }
}

// неуязвимая пушка-ловушка: тёмный квадрат с коротким стволом по направлению стрельбы
function drawCannons() {
  for (const c of world.cannons) {
    if (!visible({ x: c.x - 16, y: c.y - 16, w: 32, h: 32 })) continue;
    ctx.fillStyle = COLORS.cannon;
    ctx.fillRect(c.x - 13, c.y - 13, 26, 26);
    ctx.strokeStyle = '#2a1d0d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(c.x + Math.cos(c.angle) * 22, c.y + Math.sin(c.angle) * 22);
    ctx.stroke();
  }
}

// финишная зона: пунктирный контур и мягкое свечение
function drawFinish() {
  const f = world.finish;
  if (!f || !visible(f)) return;
  const wave = 0.2 + 0.08 * Math.sin(state.time * 2);
  ctx.fillStyle = COLORS.finish;
  ctx.globalAlpha = wave;
  ctx.fillRect(f.x, f.y, f.w, f.h);
  ctx.globalAlpha = 0.8;
  ctx.strokeStyle = COLORS.finish;
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 6]);
  ctx.strokeRect(f.x + 1, f.y + 1, f.w - 2, f.h - 2);
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

// пол из каменных плит: тёмные швы и редкие плиты потемнее (рисунок привязан к миру, не к экрану)
function drawFloor(f) {
  const v = clipToView(f);
  if (!v) return;
  ctx.fillStyle = COLORS.floor;
  ctx.fillRect(v.x, v.y, v.w, v.h);
  const s = 64;
  ctx.save();
  ctx.beginPath(); ctx.rect(v.x, v.y, v.w, v.h); ctx.clip();
  ctx.fillStyle = COLORS.floorStone;
  ctx.strokeStyle = COLORS.floorLine;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.55;
  for (let ty = Math.floor(v.y / s); ty * s < v.y + v.h; ty++) {
    const off = (ty & 1) * s / 2;
    for (let tx = Math.floor((v.x - off) / s); tx * s + off < v.x + v.w; tx++) {
      const x = tx * s + off, y = ty * s;
      const n = Math.sin(tx * 12.9898 + ty * 78.233) * 43758.5453;
      if (n - Math.floor(n) > 0.82) ctx.fillRect(x + 6, y + 6, s - 12, s - 12);
      ctx.strokeRect(x, y, s, s);
    }
  }
  ctx.restore();
}

// часть прямоугольника, которая видна на экране (или null)
function clipToView(r) {
  const x0 = Math.max(r.x, state.camera.x - 40), y0 = Math.max(r.y, state.camera.y - 40);
  const x1 = Math.min(r.x + r.w, state.camera.x + CONFIG.VIEW.w + 40), y1 = Math.min(r.y + r.h, state.camera.y + CONFIG.VIEW.h + 40);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

// шипы: тёмно-красная плита с рамкой, на ней ряды металлических конусов — светлый бок, тёмный бок, блик на острие
function drawSpikes(r) {
  ctx.fillStyle = COLORS.spikeFloor;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = COLORS.floorLine;
  ctx.lineWidth = 2;
  ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  const s = 16, hw = 5, h = 11;
  ctx.lineWidth = 1.2;
  ctx.lineJoin = 'round';
  for (let y = r.y + s * 0.85; y < r.y + r.h - 2; y += s) {
    const row = Math.round((y - r.y) / s);
    for (let x = r.x + s / 2 + (row % 2) * s / 2; x < r.x + r.w - 4; x += s) {
      ctx.fillStyle = 'rgba(20,10,5,0.5)';
      ctx.beginPath(); ctx.ellipse(x, y, hw + 1, 2.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = COLORS.spikeTeeth;
      ctx.beginPath(); ctx.moveTo(x - hw, y); ctx.lineTo(x, y - h); ctx.lineTo(x, y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = COLORS.pillarSide;
      ctx.beginPath(); ctx.moveTo(x + hw, y); ctx.lineTo(x, y - h); ctx.lineTo(x, y); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = COLORS.floorLine;
      ctx.beginPath(); ctx.moveTo(x - hw, y); ctx.lineTo(x, y - h); ctx.lineTo(x + hw, y); ctx.stroke();
      ctx.fillStyle = COLORS.allyShot;
      ctx.fillRect(x - 1, y - h + 1, 1.5, 2.5);
    }
  }
}

// стена и колонна объёмные: светлый верх и тёмная передняя грань внизу, тёмная обводка
function drawBlocks(list, top, side) {
  ctx.strokeStyle = COLORS.floorLine;
  ctx.lineWidth = 2;
  for (const r of list) {
    if (!visible(r)) continue;
    const face = Math.min(12, r.h * 0.4);
    ctx.fillStyle = side;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = top;
    ctx.fillRect(r.x, r.y, r.w, r.h - face);
    ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    ctx.beginPath(); ctx.moveTo(r.x, r.y + r.h - face); ctx.lineTo(r.x + r.w, r.y + r.h - face); ctx.stroke();
  }
}

function drawTerrain() {
  for (const f of world.floors) drawFloor(f);
  // зоны поля подсвечены по степени опасности
  for (const f of world.floors) {
    if (!f.tint || !visible(f)) continue;
    ctx.fillStyle = COLORS.zoneTint[f.tint];
    ctx.fillRect(f.x, f.y, f.w, f.h);
  }

  ctx.fillStyle = COLORS.pit;
  ctx.strokeStyle = COLORS.pitEdge;
  ctx.lineWidth = 2;
  for (const r of world.pits) {
    if (!visible(r)) continue;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    // пропасть комнаты-пропасти собрана из многих прямоугольников: швы между ними не рисуем
    if (!r.seamless) ctx.strokeRect(r.x, r.y, r.w, r.h);
  }
  // тропы и островки над пропастью — чуть светлее пола, чтобы мостки читались
  drawRects(world.bridges, COLORS.bridge);

  for (const r of world.spikes) if (visible(r)) drawSpikes(r);

  drawBlocks(world.walls, COLORS.wall, COLORS.wallSide);
  drawBlocks(world.pillars, COLORS.pillar, COLORS.pillarSide);
}

// база уровня «Оборона»: здание с толстой рамкой и знаком-короной, над ним длинная полоска HP;
// при попадании здание вспыхивает красным
function drawBase() {
  const b = world.base, s = state.base;
  if (!b || !s || !visible(b)) return;
  const hit = s.regenTimer < 0.15;
  ctx.fillStyle = hit ? COLORS.baseHit : COLORS.base;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.strokeStyle = COLORS.baseEdge;
  ctx.lineWidth = 4;
  ctx.strokeRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4);
  ctx.lineWidth = 2;
  ctx.strokeRect(b.x + 16, b.y + 16, b.w - 32, b.h - 32);
  // корона в центре
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, k = Math.min(b.w, b.h) * 0.22;
  ctx.fillStyle = COLORS.baseEdge;
  ctx.beginPath();
  ctx.moveTo(cx - k, cy + k * 0.6);
  ctx.lineTo(cx - k, cy - k * 0.5);
  ctx.lineTo(cx - k * 0.5, cy);
  ctx.lineTo(cx, cy - k * 0.8);
  ctx.lineTo(cx + k * 0.5, cy);
  ctx.lineTo(cx + k, cy - k * 0.5);
  ctx.lineTo(cx + k, cy + k * 0.6);
  ctx.closePath();
  ctx.fill();
  // полоска HP во всю ширину здания
  const w = b.w, h = 8, x = b.x, y = b.y - 16;
  ctx.fillStyle = COLORS.hpBack;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = COLORS.hpAlly;
  ctx.fillRect(x, y, w * clamp(s.hp / s.maxHp, 0, 1), h);
}

// гнёзда врагов: на полу — красноватая зона, где появляются враги волны (с пунктирной кромкой), посреди —
// тёмная пасть с зубцами по кругу и пульсирующим ядром. Перед волной всё разгорается, при выходе — вспышка.
// Над гнездом подпись, под ним — сколько врагов в следующей волне и через сколько секунд
function drawNests() {
  const cfg = state.level.waves;
  if (!cfg) return;
  for (const n of state.nests) {
    const zone = cfg.spawnRadius + 24;
    if (!onScreen({ x: n.x, y: n.y, r: zone }, 30)) continue;
    const soon = clamp(1 - n.nextIn / cfg.telegraph, 0, 1);
    const just = clamp(1 - (state.time - n.releasedAt) / 1.2, 0, 1);
    const pulse = 0.5 + 0.5 * Math.sin(state.time * (3 + 9 * soon));

    // зона выхода
    ctx.fillStyle = COLORS.nest;
    ctx.globalAlpha = 0.07 + 0.1 * soon + 0.2 * just;
    ctx.beginPath();
    ctx.arc(n.x, n.y, zone, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.nest;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.35 + 0.45 * soon + 0.2 * just;
    ctx.setLineDash([12, 9]);
    ctx.lineDashOffset = -state.time * (15 + 60 * soon);
    ctx.beginPath();
    ctx.arc(n.x, n.y, zone, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;

    // пасть с зубцами
    const r = 50;
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#300f0a';
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.nest;
    ctx.globalAlpha = 0.75 + 0.25 * soon;
    const teeth = 12, turn = state.time * 0.3;
    for (let i = 0; i < teeth; i++) {
      const t = turn + (i / teeth) * Math.PI * 2, w = Math.PI / teeth;
      ctx.beginPath();
      ctx.moveTo(n.x + Math.cos(t - w) * r, n.y + Math.sin(t - w) * r);
      ctx.lineTo(n.x + Math.cos(t + w) * r, n.y + Math.sin(t + w) * r);
      ctx.lineTo(n.x + Math.cos(t) * r * (0.62 - 0.12 * soon), n.y + Math.sin(t) * r * (0.62 - 0.12 * soon));
      ctx.closePath();
      ctx.fill();
    }
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.nest;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.stroke();
    // ядро
    ctx.globalAlpha = 0.3 + 0.5 * soon + 0.2 * pulse;
    ctx.beginPath();
    ctx.arc(n.x, n.y, r * (0.18 + 0.22 * soon + 0.05 * pulse), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.font = 'bold 13px "Trebuchet MS", "Segoe UI", system-ui, sans-serif';
    ctx.fillText('NEST', n.x, n.y - r - 12);
    ctx.font = '12px "Trebuchet MS", "Segoe UI", system-ui, sans-serif';
    ctx.fillText(`wave ×${G.waves.waveSize(cfg, n.wave)} in ${Math.max(0, Math.ceil(n.nextIn))}s`, n.x, n.y + r + 18);
  }
}

// яркость временного объекта с остатком жизни life (из maxLife): вырастает при появлении,
// перед исчезновением мигает всё чаще и гаснет
function fadeAlpha(life, maxLife, warnTime) {
  let a = clamp((maxLife - life) / 0.3, 0, 1) * clamp(life / 0.3, 0, 1);
  if (life <= warnTime) {
    const t = warnTime - life;
    if (Math.sin(t * (6 + t * 5)) < 0) a *= 0.3;
  }
  return a;
}

// ждущие вербовки дружочки появляются и уходят так же, как подиумы: перед уходом — часы и мигание
function drawNeutrals() {
  const warnTime = G.pads.allySettings().warnTime;
  for (const n of state.neutrals) {
    if (!onScreen(n)) continue;
    const timed = n.life !== undefined;
    G.blobs.drawAlly(n, 'neutral', timed ? fadeAlpha(n.life, n.maxLife, warnTime) : 1);
    if (timed && n.life <= warnTime) drawHourglass(n.x + n.r + 6, n.y - n.r - 6, 6);
  }
}

// выбитые из цепочки лежат и ждут, пока их подберут (и дерутся лёжа)
function drawDowned() {
  for (const d of state.downed) if (onScreen(d)) G.blobs.drawAlly(d, 'downed');
}

function drawWarnings() {
  for (const w of world.warnings) {
    if (!visible({ x: w.x - 20, y: w.y - 20, w: 40, h: 40 })) continue;
    drawWarning(w);
  }
}

// горящий враг (огненные стрелы): над телом пляшут язычки огня
function drawBurn(e) {
  if (!e.burn || e.burn.left <= 0) return;
  ctx.globalAlpha = 0.85 * clamp(e.burn.left / 0.5, 0, 1);
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i - 1) * 0.7, s = e.r * (0.45 + 0.12 * Math.sin(state.time * 14 + i * 2));
    const x = e.x + Math.cos(a) * e.r * 0.7, y = e.y + Math.sin(a) * e.r * 0.7;
    for (const [k, c] of [[1, COLORS.fire], [0.55, COLORS.speed]]) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(x, y - s * 1.3 * k);
      ctx.quadraticCurveTo(x + s * k, y, x, y + s * 0.6 * k);
      ctx.quadraticCurveTo(x - s * k, y, x, y - s * 1.3 * k);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawEnemies() {
  for (const e of state.enemies) {
    if (!onScreen(e, enemyTypes[e.type].drawReach || 0)) continue;
    if (!isSpotted(e)) continue;
    drawEnemy(e);
    drawBurn(e);
  }
  G.foes.sweep();
}

function drawClouds() {
  for (const c of state.clouds) drawCloud(c);
}

function drawFirewalls() {
  for (const f of state.firewalls) drawFirewall(f);
}

// песочные часы над подиумом: он скоро исчезнет
function drawHourglass(x, y, s) {
  ctx.strokeStyle = COLORS.warning;
  ctx.fillStyle = COLORS.warning;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y - s); ctx.lineTo(x - s, y + s); ctx.lineTo(x + s, y + s);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - s * 0.5, y + s * 0.5); ctx.lineTo(x + s * 0.5, y + s * 0.5); ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();
}

// яркость подиума: вырастает при появлении, перед исчезновением мигает всё чаще и гаснет
function padAlpha(pad, warnTime) {
  // постоянный подиум не появляется и не исчезает — горит всегда (погасший рисуется отдельно, см. G.padArt.drawPermanent)
  if (pad.permanent) return 1;
  // взятый подиум тускнеет и гаснет, как только по нему проехал хвост
  if (pad.usedLeft !== undefined) {
    return clamp((pad.maxLife - pad.life) / 0.3, 0, 1) * (0.25 + 0.75 * clamp(pad.usedLeft / 0.5, 0, 1));
  }
  return fadeAlpha(pad.life, pad.maxLife, warnTime);
}

// метка будущего подиума: пунктир на его месте и размытая тень, которая к появлению принимает его форму
// (усиление — render/padart.js, профессия — render/jobart.js)
function drawPadMarks() {
  for (const m of state.padMarks) {
    if (!visible(m)) continue;
    const k = 1 - clamp(m.left / m.total, 0, 1);     // 0 — только появилась, 1 — сейчас будет подиум
    if (G.pads.padKind(m.ability) === 'jobs') G.jobArt.drawMark(m, k); else G.padArt.drawMark(m, k);
  }
}

// постоянный подиум (никогда не исчезает): вокруг него небольшая рамка его цвета с уголками — сразу видно, что он особенный
function drawPermanentFrame(pad, def) {
  const o = CONFIG.PADS.permanentFrame, x = pad.x - o, y = pad.y - o, w = pad.w + 2 * o, h = pad.h + 2 * o, c = 12;
  ctx.strokeStyle = def.color;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, w, h);
  ctx.globalAlpha = 0.95;
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (const [px, py, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
    ctx.moveTo(px + sx * c, py); ctx.lineTo(px, py); ctx.lineTo(px, py + sy * c);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// погасший на перезарядку постоянный подиум профессии (у усиления — G.padArt.drawPermanent): тёмный квадрат в тусклой рамке, по кругу — сколько осталось (сектор
// цвета усиления убывает), посередине горят секунды до того, как он загорится снова
function drawPadCooldown(pad, def) {
  const cx = pad.x + pad.w / 2, cy = pad.y + pad.h / 2, k = clamp(pad.cooldown / pad.cooldownTime, 0, 1);
  ctx.fillStyle = '#2a1d0d';
  ctx.globalAlpha = 0.6;
  ctx.fillRect(pad.x, pad.y, pad.w, pad.h);
  ctx.strokeStyle = COLORS.neutral;
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(pad.x + 1, pad.y + 1, pad.w - 2, pad.h - 2);
  ctx.setLineDash([]);
  ctx.strokeStyle = def.color;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, pad.w * 0.38, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.85 + 0.15 * Math.sin(state.time * 4);
  ctx.fillStyle = def.color;
  ctx.font = 'bold 18px "Trebuchet MS", "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(Math.ceil(pad.cooldown)), cx, cy + 1);
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = 1;
}

// подиумы: профессии — постаменты с шапкой (render/jobart.js), усиления — каменные плиты (render/padart.js);
// у постоянного — ещё и рамка вокруг
function drawPads() {
  const warnTime = G.pads.settings().warnTime;
  for (const pad of state.pads) {
    if (!visible(pad)) continue;
    const alpha = padAlpha(pad, warnTime);
    const buff = G.buffs[pad.ability];
    const def = buff || abilities[pad.ability];
    if (pad.permanent) drawPermanentFrame(pad, def);
    if (pad.permanent && buff) { G.padArt.drawPermanent(pad); continue; }
    if (pad.cooldown > 0) { drawPadCooldown(pad, def); continue; }
    if (!buff) {
      G.jobArt.drawLive(pad, alpha, !G.chain.jobTarget(pad.ability));
      if (pad.life <= warnTime) drawHourglass(pad.x + pad.w, pad.y - 4, 7);
      continue;
    }
    G.padArt.drawLive(pad, alpha);
    if (pad.life <= warnTime && pad.usedLeft === undefined) drawHourglass(pad.x + pad.w, pad.y - 4, 7);
  }
  G.padArt.drawGone(state.pads); // взятые и истёкшие подиумы рассыпаются
  G.jobArt.drawGone(state.pads);
}

// ядра пушек-ловушек рисуются последним слоем сцены, поверх всего
function drawCannonShots() {
  for (const p of state.projectiles) {
    if (p.kind !== 'cannon' || !visible({ x: p.x - 40, y: p.y - 40, w: 80, h: 80 })) continue;
    const a = Math.atan2(p.vy, p.vx);
    ctx.strokeStyle = COLORS.cannonShot;
    ctx.globalAlpha = 0.3;
    ctx.lineCap = 'round';
    ctx.lineWidth = p.r * 1.4;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - Math.cos(a) * p.r * 3, p.y - Math.sin(a) * p.r * 3);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.globalAlpha = 1;
    ctx.fillStyle = COLORS.cannonShot;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#efd8a1';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
}

// подсказка «кто подберёт»: пока звено касается подиума, от подиума к нему тянется яркий луч
// его цвета — толстая мягкая подложка снизу и бегущий пунктир поверх, чтобы луч не терялся на полу
function drawPadLinks() {
  for (const u of state.party) {
    if (u.absorbed) continue;
    const pad = padUnder(u);
    if (!pad) continue;
    // серый подиум профессии отдать некому — и подсказка «кто подберёт» не нужна
    if (!G.buffs[pad.ability] && !G.chain.jobTarget(pad.ability)) continue;
    // подиум усиления берёт только Герой
    if (G.buffs[pad.ability] && u !== state.party[0]) continue;
    const def = G.buffs[pad.ability] || abilities[pad.ability];
    const cx = pad.x + pad.w / 2, cy = pad.y + pad.h / 2;
    const pulse = 0.75 + 0.25 * Math.sin(state.time * 6);

    ctx.strokeStyle = def.color;
    ctx.lineCap = 'round';
    ctx.lineWidth = 7;
    ctx.globalAlpha = 0.35 * pulse;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(u.x, u.y);
    ctx.stroke();

    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.95 * pulse;
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -state.time * 90;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(u.x, u.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineCap = 'butt';
    ctx.globalAlpha = 1;
  }
}

// светлый портал выхода: мягкое тёплое свечение, светлый диск, два пунктирных кольца крутятся навстречу,
// в середине пульсирует ядро; появляется, разрастаясь, над ним подпись. Пока в него уходит цепочка — крутится быстрее
function drawExit() {
  const ex = state.exit;
  if (!ex || !onScreen(ex, ex.r * 3)) return;
  const age = state.time - ex.at, grow = clamp(age / 0.6, 0, 1), r = ex.r * grow;
  if (r < 1) return;
  const spin = state.time * (state.leaving ? 4 : 1.2);
  const pulse = 0.5 + 0.5 * Math.sin(state.time * 3);
  const ry = r * 0.5, face = r * 0.22;
  // тёплое свечение вокруг
  const g = ctx.createRadialGradient(ex.x, ex.y, r * 0.5, ex.x, ex.y, r * 2.2);
  g.addColorStop(0, 'rgba(239,172,40,0.35)');
  g.addColorStop(1, 'rgba(239,172,40,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(ex.x, ex.y, r * 2.2, 0, Math.PI * 2); ctx.fill();
  // каменный круглый постамент: боковина и верх
  ctx.strokeStyle = COLORS.floorLine; ctx.lineWidth = 3;
  ctx.fillStyle = COLORS.wallSide;
  ctx.beginPath();
  ctx.ellipse(ex.x, ex.y + face, r * 1.15, ry * 1.15, 0, 0, Math.PI);
  ctx.lineTo(ex.x - r * 1.15, ex.y);
  ctx.ellipse(ex.x, ex.y, r * 1.15, ry * 1.15, 0, Math.PI, 0, true);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = COLORS.pillar;
  ctx.beginPath(); ctx.ellipse(ex.x, ex.y, r * 1.15, ry * 1.15, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // светящаяся воронка внутри
  ctx.fillStyle = COLORS.exit;
  ctx.globalAlpha = 0.85 + 0.1 * pulse;
  ctx.beginPath(); ctx.ellipse(ex.x, ex.y, r * 0.9, ry * 0.9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = COLORS.exitGlow;
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 9]);
  for (const [k, dir] of [[0.72, 1], [0.45, -1.6]]) {
    ctx.lineDashOffset = -spin * 30 * dir;
    ctx.beginPath(); ctx.ellipse(ex.x, ex.y, r * k, ry * k, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
  ctx.strokeStyle = COLORS.floorLine; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(ex.x, ex.y, r * 0.9, ry * 0.9, 0, 0, Math.PI * 2); ctx.stroke();
  // столб света вверх и искры
  const col = ctx.createLinearGradient(0, ex.y - r * 2.4, 0, ex.y);
  col.addColorStop(0, 'rgba(255,244,220,0)');
  col.addColorStop(1, `rgba(255,244,220,${0.4 + 0.15 * pulse})`);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(ex.x - r * 0.75, ex.y); ctx.lineTo(ex.x - r * 0.55, ex.y - r * 2.4);
  ctx.lineTo(ex.x + r * 0.55, ex.y - r * 2.4); ctx.lineTo(ex.x + r * 0.75, ex.y);
  ctx.ellipse(ex.x, ex.y, r * 0.75, ry * 0.75, 0, 0, Math.PI);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = COLORS.exit;
  for (let i = 0; i < 6; i++) {
    const k = (state.time * 0.6 + i / 6) % 1, sx = ex.x + Math.sin(i * 2.3 + state.time) * r * 0.55;
    ctx.globalAlpha = 1 - k;
    ctx.fillRect(sx - 1.5, ex.y - k * r * 2.2 - 1.5, 3, 3);
  }
  ctx.globalAlpha = 1;
  if (state.leaving) return;
  ctx.globalAlpha = grow;
  ctx.font = 'bold 15px "Trebuchet MS", "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 4; ctx.strokeStyle = COLORS.floorLine; ctx.lineJoin = 'round';
  ctx.strokeText('EXIT', ex.x, ex.y - r * 2.5);
  ctx.fillStyle = COLORS.exitGlow;
  ctx.fillText('EXIT', ex.x, ex.y - r * 2.5);
  ctx.globalAlpha = 1;
}

// «Оборона»: волна от базы — толстое светлое кольцо, расходящееся до краёв поля
function drawShockwave() {
  const w = state.shockwave;
  if (!w) return;
  ctx.strokeStyle = COLORS.baseEdge;
  for (const [width, alpha] of [[60, 0.12], [22, 0.35], [6, 0.9]]) {
    ctx.lineWidth = width;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// цепочка: с хвоста, чтобы Герой оказался сверху. Ушедшие в портал выхода не рисуются.
// Под «крепкостью» звенья связаны стальной цепью (усиления держит Герой, см. graphics.md)
function drawChain() {
  const lead = state.party[0];
  const shown = state.party.filter((a) => !a.absorbed);
  if (lead.buffs && lead.buffs.sturdy > 0) G.blobs.drawLinks(shown.map((a) => ({ x: a.x, y: a.y + 3 })));
  for (let i = shown.length - 1; i >= 0; i--) G.blobs.drawAlly(shown[i], 'chain');
  G.blobs.sweep(state.party.concat(state.downed));
  G.blobs.drawBits();
  // шеврон перед Героем: куда он поедет по W
  const h = lead.heading || 0;
  if (lead.absorbed) return;
  const tip = lead.r + 15, back = lead.r + 8;
  ctx.strokeStyle = G.blobs.BUFF_COL.speed;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(lead.x + Math.cos(h - 0.45) * back, lead.y + Math.sin(h - 0.45) * back);
  ctx.lineTo(lead.x + Math.cos(h) * tip, lead.y + Math.sin(h) * tip);
  ctx.lineTo(lead.x + Math.cos(h + 0.45) * back, lead.y + Math.sin(h + 0.45) * back);
  ctx.stroke();
  // дуга тарана впереди Героя: чем сильнее сейчас был бы удар (скорость × прямая цепочка), тем ярче и толще
  const ram = lead.ramPower;
  if (ram !== undefined && G.session.upgrade('ram')) {
    const rr = lead.r + 21, span = 0.75 + 0.25 * ram;
    ctx.strokeStyle = COLORS.power;
    ctx.lineCap = 'round';
    if (ram > 0.5) { // у потолка — мягкое свечение вокруг дуги
      ctx.globalAlpha = (ram - 0.5) * 0.6;
      ctx.lineWidth = 9;
      ctx.beginPath(); ctx.arc(lead.x, lead.y, rr, h - span, h + span); ctx.stroke();
    }
    ctx.globalAlpha = 0.15 + 0.85 * ram;
    ctx.lineWidth = 2 + 2.5 * ram;
    ctx.beginPath(); ctx.arc(lead.x, lead.y, rr, h - span, h + span); ctx.stroke();
  }
  ctx.lineCap = 'butt';
  ctx.globalAlpha = 1;
}

// оружие поверх тел, если у него есть своё рисование (и у цепочки, и у выбитых — они дерутся лёжа)
function drawWeapons() {
  for (const u of state.party.concat(state.downed)) {
    if (u.absorbed) continue;
    for (const w of u.gear) {
      const def = weapons[w.type];
      if (def.draw) def.draw(u, w, shapes);
    }
  }
}

function drawProjectiles() {
  for (const p of state.projectiles) {
    if (p.kind === 'mortar' || p.kind === 'bigMortar') { drawMortar(p); continue; }
    if (p.kind === 'hook') { drawHook(p); continue; }
    if (p.kind === 'cannon') continue; // ядра рисуются отдельным слоем, см. drawCannonShots
    if (!onScreen(p)) continue;
    if (p.team === 'ally') drawBullet(p); else drawSpit(p);
  }
}

// пуля своих: кремовая капсула вдоль полёта с тёмной обводкой и золотым следом; огненная — оранжевая
function drawBullet(p) {
  const a = Math.atan2(p.vy, p.vx), r = p.r;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(a);
  ctx.strokeStyle = p.burn ? COLORS.fire : COLORS.speed;
  ctx.globalAlpha = 0.45;
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 1.2;
  ctx.beginPath(); ctx.moveTo(-r * 1.5, 0); ctx.lineTo(-r * 5, 0); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = p.burn ? COLORS.fire : COLORS.allyShot;
  ctx.strokeStyle = COLORS.floorLine;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(-r * 1.8, -r * 0.8, r * 3.2, r * 1.6, r * 0.8); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.lineCap = 'butt';
}

// плевок врага: ком тёмно-красной слизи, вытянутый по полёту, со светящейся серединкой и каплями позади
function drawSpit(p) {
  const a = Math.atan2(p.vy, p.vx), r = p.r * 1.3;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(a);
  ctx.fillStyle = COLORS.portal;
  for (const [d, k] of [[-r * 1.9, 0.45], [-r * 3.1, 0.3]]) { ctx.beginPath(); ctx.arc(d, 0, r * k, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = COLORS.boss;
  ctx.strokeStyle = COLORS.floorLine;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(0, 0, r * 1.35, r, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = COLORS.enemyShot;
  ctx.beginPath(); ctx.ellipse(r * 0.2, -r * 0.15, r * 0.55, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// удар копейщика: яркая вспышка зоны удара и расходящееся толстое кольцо; на ходу — ещё и выпад копья
// из тела в зону с острым наконечником, стоя — восемь лучей-уколов во все стороны
function drawSpearHit(fx) {
  const t = 1 - clamp(fx.life / fx.maxLife, 0, 1); // 0 — только ударил, 1 — эффект догорел
  const fade = 1 - t;
  ctx.fillStyle = fx.color;
  ctx.globalAlpha = 0.35 * fade;
  ctx.beginPath();
  ctx.arc(fx.x, fx.y, fx.r * (0.8 + 0.3 * t), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = fx.color;
  ctx.lineWidth = 4 * fade + 1;
  ctx.globalAlpha = 0.95 * fade;
  ctx.beginPath();
  ctx.arc(fx.x, fx.y, fx.r * (0.9 + 0.5 * t), 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineCap = 'round';
  const thrust = (x0, y0, a, len) => {
    const x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len;
    const col = ctx.strokeStyle, lw = ctx.lineWidth;
    ctx.strokeStyle = COLORS.floorLine; ctx.lineWidth = lw + 3;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1 + Math.cos(a) * 9, y1 + Math.sin(a) * 9);
    ctx.lineTo(x1 + Math.cos(a + 2.6) * 7, y1 + Math.sin(a + 2.6) * 7);
    ctx.lineTo(x1 + Math.cos(a - 2.6) * 7, y1 + Math.sin(a - 2.6) * 7);
    ctx.closePath();
    ctx.fill();
  };
  ctx.fillStyle = fx.color;
  ctx.lineWidth = 3;
  // копьё выбрасывается за первую четверть эффекта и дальше держится, пока гаснет
  const reach = Math.min(1, t * 4);
  if (fx.from) {
    const a = Math.atan2(fx.y - fx.from.y, fx.x - fx.from.x);
    thrust(fx.from.x, fx.from.y, a, (dist(fx.from, fx) + fx.r * 0.6) * reach);
  } else {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      thrust(fx.x + Math.cos(a) * fx.r * 0.35, fx.y + Math.sin(a) * fx.r * 0.35, a, fx.r * 0.55 * reach);
    }
  }
  ctx.lineCap = 'butt';
  ctx.globalAlpha = 1;
}

// вспышка удара: короткие лучи-звёздочка цвета удара с тёмной обводкой, быстро гаснет
function drawImpact(x, y, color, k, size) {
  ctx.lineCap = 'round';
  for (const [w, c] of [[5, COLORS.floorLine], [2.5, color]]) {
    ctx.strokeStyle = c; ctx.lineWidth = w;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 + 0.3, r0 = size * (0.3 + 0.4 * (1 - k)), r1 = size * (0.7 + 0.5 * (1 - k));
      ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
    }
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

// плюсик лечения
function plusMark(x, y, s, color) {
  const w = s * 0.38;
  ctx.fillStyle = color; ctx.strokeStyle = COLORS.floorLine; ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x - w, y - s); ctx.lineTo(x + w, y - s); ctx.lineTo(x + w, y - w); ctx.lineTo(x + s, y - w); ctx.lineTo(x + s, y + w);
  ctx.lineTo(x + w, y + w); ctx.lineTo(x + w, y + s); ctx.lineTo(x - w, y + s); ctx.lineTo(x - w, y + w); ctx.lineTo(x - s, y + w);
  ctx.lineTo(x - s, y - w); ctx.lineTo(x - w, y - w); ctx.closePath(); ctx.fill(); ctx.stroke();
}

function drawEffects() {
  for (const fx of state.effects) {
    if (fx.type === 'beam') {
      const k = clamp(fx.life * 4, 0, 1);
      if (fx.color === COLORS.medic) {
        // лечение: мягкий светлый луч, по нему к цели бегут плюсики, у цели — плюсик крупнее
        ctx.strokeStyle = COLORS.medic;
        ctx.globalAlpha = 0.5 * k;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(fx.x1, fx.y1); ctx.lineTo(fx.x2, fx.y2); ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.globalAlpha = k;
        for (let i = 0; i < 3; i++) {
          const q = ((1 - k) + i / 3) % 1;
          plusMark(fx.x1 + (fx.x2 - fx.x1) * q, fx.y1 + (fx.y2 - fx.y1) * q, 4, COLORS.regen);
        }
        plusMark(fx.x2, fx.y2 - 14 - (1 - k) * 8, 6, COLORS.regen);
      } else {
        // укус, удар, щипок: вспышка на том, кого ударили
        ctx.globalAlpha = k;
        drawImpact(fx.x2, fx.y2, fx.color, k, 14);
      }
      ctx.globalAlpha = 1;
    } else if (fx.type === 'jobGet') {
      G.jobArt.drawGet(fx);
    } else if (fx.type === 'ring') {
      ctx.globalAlpha = clamp(fx.life * 5, 0, 0.8);
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, fx.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (fx.type === 'dmgText') {
      // цифра урона (мишень тестового уровня): всплывает и гаснет; таран — крупнее и цветом силы
      const t = 1 - fx.life / fx.maxLife;
      ctx.globalAlpha = clamp(fx.life * 3, 0, 1);
      ctx.font = `bold ${fx.big ? 26 : 15}px "Trebuchet MS", "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#2a1d0d';
      const text = fx.value >= 10 ? fx.value.toFixed(0) : fx.value.toFixed(1), y = fx.y - t * 36;
      ctx.strokeText(text, fx.x, y);
      ctx.fillStyle = fx.big ? COLORS.power : COLORS.allyShot;
      ctx.fillText(text, fx.x, y);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    } else if (fx.type === 'spearHit') {
      drawSpearHit(fx);
    } else if (fx.type === 'blast') {
      drawBlast(fx);
    }
  }
}

// взрыв: светлая вспышка в центре, оранжевые клубы и тёмный дым, расходятся и гаснут (life 0.35 → 0)
function drawBlast(fx) {
  const t = 1 - clamp(fx.life / 0.35, 0, 1), r = fx.r;
  ctx.globalAlpha = 0.25 * (1 - t);
  ctx.fillStyle = COLORS.blast;
  ctx.beginPath(); ctx.arc(fx.x, fx.y, r * (0.8 + 0.35 * t), 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2 + fx.x * 0.01, d = r * (0.25 + 0.55 * t);
    const pr = r * (0.28 - 0.12 * t);
    const x = fx.x + Math.cos(a) * d, y = fx.y + Math.sin(a) * d - t * 10;
    ctx.globalAlpha = 0.7 * (1 - t);
    ctx.fillStyle = i % 2 ? COLORS.floorStone : COLORS.blast;
    ctx.beginPath(); ctx.arc(x, y, Math.max(1, pr), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = Math.max(0, 1 - t * 2.5);
  ctx.fillStyle = COLORS.allyShot;
  ctx.beginPath(); ctx.arc(fx.x, fx.y, r * 0.35 * (1 - t * 0.5), 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.9 * (1 - t);
  ctx.strokeStyle = COLORS.blast;
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(fx.x, fx.y, r * (0.85 + 0.3 * t), 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
}

// сцена целиком, слой за слоем; камера остаётся применённой до конца кадра
function drawScene() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#1d140a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  screenTransform();
  ctx.translate(-state.camera.x, -state.camera.y);

  drawTerrain();
  drawNests();
  drawBase();
  drawFinish();
  drawDoors();
  drawButtons();
  drawCannons();
  drawPadMarks();
  drawPads();
  drawPadLinks();
  drawExit();
  // облака и стенки огня лежат на земле: под всеми телами, иначе огонь закрывает стоящих в нём врагов
  drawClouds();
  drawFirewalls();
  drawNeutrals();
  drawDowned();
  drawWarnings();
  drawEnemies();
  drawChain();
  drawWeapons();
  drawProjectiles();
  drawEffects();
  drawShockwave();
}

G.renderer = { drawScene, drawCannonShots };
})(window.Game = window.Game || {});
