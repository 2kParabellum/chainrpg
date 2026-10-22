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
const { ctx, screenTransform, visible, drawHpBar, drawUnitBody, drawMark, allyColor, glow } = shapes;

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
  if (p.owner && p.owner.type === 'boss') { drawBossShot(p, k, height); return; }
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

// снаряды Демона: обстрел — шип со спины, летит остриём по ходу; большой — огненный ком из пасти
function drawBossShot(p, k, height) {
  ctx.fillStyle = 'rgba(20,10,5,0.35)';
  ctx.beginPath(); ctx.ellipse(p.x, p.y + 4, p.r * 1.4, p.r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
  const y = p.y - height;
  if (p.kind === 'mortar') {
    // направление по дуге: сдвиг по земле плюс производная высоты
    const dx = (p.tx - p.sx) / p.flight, dy = (p.ty - p.sy) / p.flight - Math.cos(k * Math.PI) * Math.PI * 55 / p.flight;
    G.foes.mawSpikeShot(p.x, y, Math.atan2(dy, dx), 9);
    return;
  }
  const s = p.r + 7;
  glow(ctx, p.x, y, s * 2.4, '#efac28', 0.55);
  ctx.fillStyle = '#9b1a0a'; ctx.strokeStyle = COLORS.floorLine; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(p.x, y, s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#efac28'; ctx.beginPath(); ctx.arc(p.x, y, s * 0.55, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#efd8a1'; ctx.beginPath(); ctx.arc(p.x - s * 0.15, y - s * 0.15, s * 0.25, 0, Math.PI * 2); ctx.fill();
}

// двери: закрытая — сплошная плашка (как колонна), открытая — только тонкий контур на полу,
// чтобы было видно, где она стояла
function drawDoors() {
  for (const d of world.doors) {
    if (!visible(d)) continue;
    // закрытая дверь — высокая, как стена (render/terrain.js); здесь — только контур открытой
    if (d.open) {
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
// бегущий пунктир (пока дверь закрыта), чтобы было видно, что она открывает. Площадки флагов рисует render/flagart.js
function drawButtons() {
  for (const b of world.buttons) {
    if (b.flag) continue;
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

// база уровня «Оборона»: здание с толстой рамкой и знаком-короной, над ним длинная полоска HP;
// при попадании здание вспыхивает красным
function drawBase() {
  const b = world.base, s = state.base;
  if (!b || !s || !visible(b)) return;
  // сама избушка рисуется в слое стен (render/terrain.js → render/baseart.js); здесь — полоска HP над крышей
  const w = b.w * 0.7, h = 8, x = b.x + (b.w - w) / 2, y = b.y - 58;
  ctx.fillStyle = COLORS.hpBack;
  ctx.beginPath(); ctx.roundRect(x - 2, y - 2, w + 4, h + 4, 4); ctx.fill();
  ctx.fillStyle = COLORS.hpAlly;
  ctx.beginPath(); ctx.roundRect(x, y, w * clamp(s.hp / s.maxHp, 0, 1), h, 3); ctx.fill();
}

// гнёзда врагов — норы в полу с зоной выхода волны и плашкой «сколько и когда» (render/nestart.js)
function drawNests() {
  const cfg = state.level.waves;
  if (!cfg) return;
  for (const n of state.nests) if (onScreen({ x: n.x, y: n.y, r: cfg.spawnRadius + 24 }, 30)) G.nestArt.draw(n, cfg);
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

// враг в кадре: тело (с запасом drawReach) или то, что он тянет далеко от себя (лапа Скорпиона, линия разгона Бычка)
function enemyInView(e) {
  if (onScreen(e, enemyTypes[e.type].drawReach || 0)) return true;
  const p = G.foes.has(e.type) && G.foes.farPoint(e), pad = e.r * 3;
  return !!p && visible({ x: Math.min(e.x, p.x) - pad, y: Math.min(e.y, p.y) - pad, w: Math.abs(p.x - e.x) + pad * 2, h: Math.abs(p.y - e.y) + pad * 2 });
}

function drawEnemies() {
  for (const e of state.enemies) {
    if (!enemyInView(e)) continue;
    if (!isSpotted(e)) continue;
    drawEnemy(e);
    drawBurn(e);
  }
  G.foes.sweep();
}

function drawClouds() {
  for (const c of state.clouds) drawCloud(c);
}

// стенки огня и их тлеющие следы — render/fireart.js
function drawFirewalls() {
  G.fireArt.draw(state.firewalls);
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
  glow(ctx, ex.x, ex.y, r * 2.2, '#efac28', 0.35, 0.5 / 2.2);
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

// пули, плевки и плюсики лечения — готовые картинки (render/shapes.js: spriteCache), пуля и плевок повёрнуты по полёту
const fxSprites = shapes.spriteCache((g, paint) => paint(g));
function fxPart(key, r, box, paint) { return fxSprites.get(key) || fxSprites.bake(key, r, box, paint); }
function stampTurned(sp, x, y, a) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a); shapes.stamp(sp, 0, 0, 1, 1); ctx.restore();
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
  const r = p.r, burn = p.burn ? 1 : 0;
  stampTurned(fxPart(`bullet|${r}|${burn}`, r, [-5.6, -0.8, 1.4, 0.8], (c) => {
    c.strokeStyle = burn ? COLORS.fire : COLORS.speed;
    c.globalAlpha = 0.45;
    c.lineCap = 'round';
    c.lineWidth = r * 1.2;
    c.beginPath(); c.moveTo(-r * 1.5, 0); c.lineTo(-r * 5, 0); c.stroke();
    c.globalAlpha = 1;
    c.fillStyle = burn ? COLORS.fire : COLORS.allyShot;
    c.strokeStyle = COLORS.floorLine;
    c.lineWidth = 1.5;
    c.beginPath(); c.roundRect(-r * 1.8, -r * 0.8, r * 3.2, r * 1.6, r * 0.8); c.fill(); c.stroke();
  }), p.x, p.y, Math.atan2(p.vy, p.vx));
}

// плевок врага: ком тёмно-красной слизи, вытянутый по полёту, со светящейся серединкой и каплями позади
function drawSpit(p) {
  const r = p.r * 1.3;
  stampTurned(fxPart(`spit|${r}`, r, [-3.4, -1, 1.35, 1], (c) => {
    c.fillStyle = COLORS.portal;
    for (const [d, k] of [[-r * 1.9, 0.45], [-r * 3.1, 0.3]]) { c.beginPath(); c.arc(d, 0, r * k, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = COLORS.boss;
    c.strokeStyle = COLORS.floorLine;
    c.lineWidth = 1.5;
    c.beginPath(); c.ellipse(0, 0, r * 1.35, r, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = COLORS.enemyShot;
    c.beginPath(); c.ellipse(r * 0.2, -r * 0.15, r * 0.55, r * 0.4, 0, 0, Math.PI * 2); c.fill();
  }), p.x, p.y, Math.atan2(p.vy, p.vx));
}

// удар копейщика: яркая вспышка зоны удара и расходящееся толстое кольцо; на ходу — ещё и выпад копья
// из тела в зону с острым наконечником, стоя — восемь лучей-уколов во все стороны
function drawSpearHit(fx) {
  const t = 1 - clamp(fx.life / fx.maxLife, 0, 1); // 0 — только ударил, 1 — эффект догорел
  const fade = 1 - t;
  // взмах стоя в одну сторону (fx.half — угол середины) — полукруг, иначе круг
  const half = fx.half !== undefined;
  const a0 = half ? fx.half - Math.PI / 2 : 0, a1 = half ? fx.half + Math.PI / 2 : Math.PI * 2;
  ctx.fillStyle = fx.color;
  ctx.globalAlpha = 0.35 * fade;
  ctx.beginPath();
  if (half) ctx.moveTo(fx.x, fx.y);
  ctx.arc(fx.x, fx.y, fx.r * (0.8 + 0.3 * t), a0, a1);
  ctx.fill();
  ctx.strokeStyle = fx.color;
  ctx.lineWidth = 4 * fade + 1;
  ctx.globalAlpha = 0.95 * fade;
  ctx.beginPath();
  ctx.arc(fx.x, fx.y, fx.r * (0.9 + 0.5 * t), a0, a1);
  ctx.stroke();
  // уколы: древко с тёмной обводкой и наконечник; все уколы — одним рисованием на слой (обводка, древко, наконечники)
  const thrusts = [];
  const thrust = (x0, y0, a, len) => thrusts.push([x0, y0, a, x0 + Math.cos(a) * len, y0 + Math.sin(a) * len]);
  // копьё выбрасывается за первую четверть эффекта и дальше держится, пока гаснет
  const reach = Math.min(1, t * 4);
  if (fx.from) {
    const a = Math.atan2(fx.y - fx.from.y, fx.x - fx.from.x);
    thrust(fx.from.x, fx.from.y, a, (dist(fx.from, fx) + fx.r * 0.6) * reach);
  } else {
    for (let i = 0; i < 8; i++) {
      const a = half ? a0 + ((i + 0.5) / 8) * Math.PI : (i / 8) * Math.PI * 2;
      thrust(fx.x + Math.cos(a) * fx.r * 0.35, fx.y + Math.sin(a) * fx.r * 0.35, a, fx.r * 0.55 * reach);
    }
  }
  ctx.lineCap = 'round';
  for (const [lw, col] of [[6, COLORS.floorLine], [3, fx.color]]) {
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    ctx.beginPath();
    for (const [x0, y0, , x1, y1] of thrusts) { ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); }
    ctx.stroke();
  }
  ctx.fillStyle = fx.color;
  ctx.beginPath();
  for (const [, , a, x1, y1] of thrusts) {
    ctx.moveTo(x1 + Math.cos(a) * 9, y1 + Math.sin(a) * 9);
    ctx.lineTo(x1 + Math.cos(a + 2.6) * 7, y1 + Math.sin(a + 2.6) * 7);
    ctx.lineTo(x1 + Math.cos(a - 2.6) * 7, y1 + Math.sin(a - 2.6) * 7);
    ctx.closePath();
  }
  ctx.fill();
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

// плюсик лечения — готовой картинкой
function plusMark(x, y, s, color) {
  shapes.stamp(fxPart(`plus|${s}|${color}`, s, [-1, -1, 1, 1], (c) => {
    const w = s * 0.38;
    c.fillStyle = color; c.strokeStyle = COLORS.floorLine; c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(-w, -s); c.lineTo(w, -s); c.lineTo(w, -w); c.lineTo(s, -w); c.lineTo(s, w);
    c.lineTo(w, w); c.lineTo(w, s); c.lineTo(-w, s); c.lineTo(-w, w); c.lineTo(-s, w);
    c.lineTo(-s, -w); c.lineTo(-w, -w); c.closePath(); c.fill(); c.stroke();
  }), x, y);
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
  if (fx.look === 'slime') { drawSlimeBlast(fx); return; }
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

// взрыв слизи спрута (life 0.6 → 0): бирюзовая вспышка, столб брызг вверх, капли разлетаются по дуге и шлёпаются,
// на полу остаётся клякса с потёками и лопающимися пузырями
function drawSlimeBlast(fx) {
  const t = 1 - clamp(fx.life / 0.6, 0, 1), r = fx.r, TAU = Math.PI * 2;
  const rnd = (i, k) => { const v = Math.sin(i * 12.9898 + k * 78.233 + fx.x * 0.37) * 43758.5453; return v - Math.floor(v); };
  // клякса на полу: разбегается и подсыхает
  const sp = Math.min(1, t * 4), fade = 1 - Math.max(0, (t - 0.55) / 0.45);
  ctx.globalAlpha = 0.85 * fade;
  ctx.fillStyle = COLORS.kraken;
  ctx.beginPath();
  for (let i = 0; i <= 20; i++) {
    const a = i / 20 * TAU, k = 0.55 + 0.25 * rnd(i % 20, 1) + (i % 4 === 0 ? 0.25 * rnd(i, 2) : 0);
    ctx.lineTo(fx.x + Math.cos(a) * r * k * sp, fx.y + Math.sin(a) * r * k * sp * 0.6);
  }
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = COLORS.krakenEdge; ctx.lineWidth = 3; ctx.stroke();
  // вспышка в центре
  ctx.globalAlpha = Math.max(0, 1 - t * 3);
  ctx.fillStyle = COLORS.krakenSuck;
  ctx.beginPath(); ctx.ellipse(fx.x, fx.y - 6, r * 0.45 * (1 + t), r * 0.32 * (1 + t), 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = 0.8 * Math.max(0, 1 - t * 2);
  ctx.strokeStyle = COLORS.krakenEdge; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.ellipse(fx.x, fx.y, r * (0.5 + 0.7 * t), r * (0.3 + 0.42 * t), 0, 0, TAU); ctx.stroke();
  // капли: вылетают по дуге и шлёпаются кляксами
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * TAU + rnd(i, 3), d = r * (0.7 + 0.6 * rnd(i, 4)), up = r * (0.6 + 0.8 * rnd(i, 5));
    const fl = Math.min(1, t / 0.5), x = fx.x + Math.cos(a) * d * fl, y = fx.y + Math.sin(a) * d * fl * 0.6 - Math.sin(fl * Math.PI) * up;
    const s = 3 + 4 * rnd(i, 6);
    if (fl < 1) {
      ctx.globalAlpha = 1; ctx.fillStyle = i % 3 ? COLORS.krakenEdge : COLORS.tentacle; ctx.strokeStyle = '#2a1d0d'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(x, y, s, s * 1.2, a, 0, TAU); ctx.fill(); ctx.stroke();
    } else {
      ctx.globalAlpha = 0.8 * fade; ctx.fillStyle = COLORS.kraken;
      ctx.beginPath(); ctx.ellipse(x, y, s * 1.6, s, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = COLORS.krakenEdge; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }
  // пузыри в кляксе лопаются
  ctx.fillStyle = COLORS.krakenEdge;
  for (let k = 0; k < 5; k++) {
    const ph = (t * 2 + k * 0.23) % 1, a = k * 2.4 + fx.x, d = r * 0.12 * (k + 1);
    ctx.globalAlpha = 0.6 * fade * Math.sin(ph * Math.PI);
    ctx.beginPath(); ctx.arc(fx.x + Math.cos(a) * d, fx.y + Math.sin(a) * d * 0.6, 2 + 4 * ph, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// метка на земле, куда Герой едет мышью: кольцо сжимается к точке и снова, под ним крестик
function drawMoveTarget() {
  const t = state.moveTarget;
  if (!t) return;
  const ph = (state.time * 2.5) % 1;
  ctx.strokeStyle = COLORS.hero;
  ctx.lineWidth = 2.5;
  ctx.globalAlpha = 0.9 * (1 - ph * 0.6);
  ctx.beginPath(); ctx.arc(t.x, t.y, 18 - 9 * ph, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.moveTo(t.x - 5, t.y - 5); ctx.lineTo(t.x + 5, t.y + 5);
  ctx.moveTo(t.x + 5, t.y - 5); ctx.lineTo(t.x - 5, t.y + 5);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// сцена целиком, слой за слоем; камера остаётся применённой до конца кадра. Фон не заливается: куски земли
// закрывают весь холст (за краем уровня — скала)
function drawScene() {
  screenTransform();
  // камера сдвигается на целые пиксели холста: готовые куски земли (render/ground.js) ложатся пиксель в пиксель
  const s = G.screen.pixelScale();
  ctx.translate(-Math.round(state.camera.x * s) / s, -Math.round(state.camera.y * s) / s);

  G.ground.draw();             // неподвижное окружение — готовыми кусками, живые туман пропастей и избушка базы
  drawNests();
  drawBase();
  drawFinish();
  drawDoors();
  drawButtons();
  G.flagArt.drawPlates();      // площадки флагов «Capture the Flags» — на полу, под телами
  drawCannons();
  if (world.pod && onScreen({ x: world.pod.x, y: world.pod.y, r: world.pod.r + 170 })) G.podArt.draw(); // Под «Hit the Count»
  drawPadMarks();
  drawPads();
  drawPadLinks();
  drawExit();
  drawMoveTarget();
  // облака и стенки огня лежат на земле: под всеми телами, иначе огонь закрывает стоящих в нём врагов
  drawClouds();
  drawFirewalls();
  drawNeutrals();
  drawDowned();
  drawWarnings();
  drawEnemies();
  drawChain();
  G.flagArt.drawPoles();       // древки и полотнища флагов — выше тел
  G.ground.drawOccluders();    // стена поверх спрятанных за ней: полупрозрачная, с окошком вокруг каждого
  drawWeapons();
  drawProjectiles();
  drawEffects();
  drawShockwave();
}

G.renderer = { drawScene, drawCannonShots };
})(window.Game = window.Game || {});
