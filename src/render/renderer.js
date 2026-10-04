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
const { canvas, ctx, visible, drawRects, drawHpBar, drawUnitBody, drawMark, allyColor } = shapes;

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

// тело врага рисует его запись в реестре, полоску HP — сцена
function drawEnemy(e) {
  enemyTypes[e.type].draw(e, shapes);
  drawHpBar(e);
}

// нить гарпуна тянется от Скорпиона к наконечнику, пока тот летит
function drawHook(p) {
  if (!onScreen(p)) return;
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
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.x, p.y - height, p.r + 2, 0, Math.PI * 2);
  ctx.fill();
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

// кнопки: квадрат на полу, светится зелёным, пока на ней лежит брошенный союзник
function drawButtons() {
  for (const b of world.buttons) {
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
    ctx.strokeStyle = '#0e0e10';
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

function drawTerrain() {
  drawRects(world.floors, COLORS.floor);
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
    ctx.fillStyle = '#1c0b10';
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
    ctx.font = 'bold 13px monospace';
    ctx.fillText('ГНЕЗДО', n.x, n.y - r - 12);
    ctx.font = '12px monospace';
    ctx.fillText(`волна ×${G.waves.waveSize(cfg, n.wave)} через ${Math.max(0, Math.ceil(n.nextIn))}с`, n.x, n.y + r + 18);
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
    if (timed) ctx.globalAlpha = fadeAlpha(n.life, n.maxLife, warnTime);
    ctx.setLineDash([4, 4]);
    drawUnitBody(n, COLORS.neutral, false);
    ctx.setLineDash([]);
    drawMark(n, allyTypes[n.type].mark);
    ctx.fillStyle = COLORS.neutral;
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(n.cfg.name, n.x, n.y + n.r + 14);
    ctx.globalAlpha = 1;
    if (timed && n.life <= warnTime) drawHourglass(n.x + n.r + 6, n.y - n.r - 6, 6);
  }
}

// подпись способности с уровнем прокачки: «(стрелок 2)»
function abilityLabel(u) {
  if (!u.ability) return '';
  return ` (${abilities[u.ability].name}${u.abilityLevel > 1 ? ' ' + u.abilityLevel : ''})`;
}

// уровень прокачки — точки над полоской HP (со второго уровня)
function drawLevelPips(u) {
  if (!(u.abilityLevel > 1)) return;
  ctx.fillStyle = abilities[u.ability].color;
  for (let k = 0; k < u.abilityLevel; k++) {
    ctx.beginPath();
    ctx.arc(u.x + (k - (u.abilityLevel - 1) / 2) * 6, u.y - u.r - 14, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

// выбитые из цепочки лежат и ждут, пока их подберут
function drawDowned() {
  for (const d of state.downed) {
    if (!onScreen(d)) continue;
    const color = allyColor(d);
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
    ctx.fillText(d.cfg.name + abilityLabel(d), d.x, d.y + d.r + 14);
    drawLevelPips(d);
  }
}

function drawWarnings() {
  for (const w of world.warnings) {
    if (!visible({ x: w.x - 20, y: w.y - 20, w: 40, h: 40 })) continue;
    drawWarning(w);
  }
}

function drawEnemies() {
  for (const e of state.enemies) {
    if (!onScreen(e)) continue;
    if (!isSpotted(e)) continue;
    drawEnemy(e);
  }
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
  // взятый подиум тускнеет и гаснет, как только по нему проехал хвост
  if (pad.usedLeft !== undefined) {
    return clamp((pad.maxLife - pad.life) / 0.3, 0, 1) * (0.25 + 0.75 * clamp(pad.usedLeft / 0.5, 0, 1));
  }
  return fadeAlpha(pad.life, pad.maxLife, warnTime);
}

// метка будущего подиума: тень, которая сужается от широкой до размера подиума и темнеет к его появлению
function drawPadMarks() {
  for (const m of state.padMarks) {
    if (!visible(m)) continue;
    const k = 1 - clamp(m.left / m.total, 0, 1);     // 0 — только появилась, 1 — сейчас будет подиум
    const cx = m.x + m.w / 2, cy = m.y + m.h / 2;
    const half = (m.w / 2) * (2.2 - 1.2 * k);
    // у будущей профессии тень круглая, как сам подиум, у усиления — квадратная
    const round = G.pads.padKind(m.ability) === 'jobs';
    ctx.fillStyle = '#000';
    ctx.globalAlpha = 0.2 + 0.45 * k;
    ctx.beginPath();
    if (round) ctx.arc(cx, cy, half, 0, Math.PI * 2); else ctx.rect(cx - half, cy - half, half * 2, half * 2);
    ctx.fill();
    ctx.globalAlpha = 0.35 + 0.4 * k;
    ctx.strokeStyle = '#8a8a95';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    if (round) ctx.arc(cx, cy, m.w / 2 - 1, 0, Math.PI * 2); else ctx.rect(m.x + 1, m.y + 1, m.w - 2, m.h - 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
}

// подиум профессии — большой круглый дружочек цвета профессии с её знаком на теле: сразу видно,
// каким станет звено, которое его получит. Смотрит на Героя, вокруг пульсирует кольцо, снизу — подпись
function drawJobPad(pad, def, alpha, wave) {
  const r = pad.w / 2, lead = state.party[0];
  const body = { x: pad.x + r, y: pad.y + r, r, facing: Math.atan2(lead.y - pad.y - r, lead.x - pad.x - r) };
  ctx.globalAlpha = (0.35 + 0.25 * wave) * alpha;
  ctx.strokeStyle = def.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(body.x, body.y, r + 7 + 3 * wave, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.9 * alpha;
  drawUnitBody(body, def.color, true);
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = '#0e0e10';
  allyTypes.buddy.mark(body, body.facing, ctx);
  def.mark(body, body.facing, ctx);
  ctx.fillStyle = def.color;
  ctx.font = '12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(def.name, body.x, body.y + r + 16);
  ctx.globalAlpha = 1;
}

// подиумы: профессии — большие дружочки (см. drawJobPad), усиления — светящийся квадрат на полу
// в широком мягком свечении
function drawPads() {
  const { pulse } = CONFIG.PADS;
  const warnTime = G.pads.settings().warnTime;
  const wave = Math.sin((state.time / pulse) * Math.PI * 2);
  const glow = 0.25 + 0.1 * wave;
  for (const pad of state.pads) {
    if (!visible(pad)) continue;
    const alpha = padAlpha(pad, warnTime);
    const buff = G.buffs[pad.ability];
    const def = buff || abilities[pad.ability];
    const cx = pad.x + pad.w / 2, cy = pad.y + pad.h / 2;
    if (!buff) {
      drawJobPad(pad, def, alpha, wave);
      if (pad.life <= warnTime) drawHourglass(pad.x + pad.w, pad.y - 4, 7);
      continue;
    }
    const halo = pad.w * 0.75;
    const g = ctx.createRadialGradient(cx, cy, pad.w * 0.4, cx, cy, halo * (1 + 0.06 * wave));
    g.addColorStop(0, def.color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.globalAlpha = (0.22 + 0.08 * wave) * alpha;
    ctx.beginPath();
    ctx.arc(cx, cy, halo * 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = def.color;
    ctx.globalAlpha = glow * alpha;
    ctx.fillRect(pad.x, pad.y, pad.w, pad.h);
    ctx.strokeStyle = def.color;
    ctx.globalAlpha = 0.9 * alpha;
    ctx.lineWidth = 2;
    ctx.strokeRect(pad.x + 1, pad.y + 1, pad.w - 2, pad.h - 2);
    ctx.lineWidth = 2;
    def.icon(ctx, cx, cy, pad.w * 0.36);
    ctx.globalAlpha = 1;
    if (pad.life <= warnTime && pad.usedLeft === undefined) drawHourglass(pad.x + pad.w, pad.y - 4, 7);
  }
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
    ctx.fillStyle = '#fff3c0';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
}

// подсказка «кто подберёт»: пока звено касается подиума, от подиума к нему тянется яркий луч
// его цвета — толстая мягкая подложка снизу и бегущий пунктир поверх, чтобы луч не терялся на полу
function drawPadLinks() {
  for (const u of state.party) {
    const pad = padUnder(u);
    if (!pad) continue;
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

// кольца временных усилений вокруг тела: по одному на каждое действующее
function drawBuffRings(u) {
  if (!u.buffs) return;
  let k = 0;
  for (const [key, left] of Object.entries(u.buffs)) {
    if (!(left > 0)) continue;
    // за 5 секунд до конца кольцо мигает
    if (left < 5 && Math.floor(left * 4) % 2 === 0) continue;
    ctx.strokeStyle = G.buffs[key].color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(u.x, u.y, u.r + 3 + k * 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    k++;
  }
}

// цепочка: с хвоста, чтобы Герой оказался сверху.
// Знаки на теле: сначала знак типа, затем знак способности
function drawChain() {
  for (let i = state.party.length - 1; i >= 0; i--) {
    const a = state.party[i];
    drawUnitBody(a, allyColor(a), true);
    drawMark(a, allyTypes[a.type].mark);
    if (a.ability) drawMark(a, abilities[a.ability].mark);
    drawBuffRings(a);
    drawHpBar(a);
    drawLevelPips(a);
  }
  // шеврон перед Героем: куда он поедет по W
  const lead = state.party[0], h = lead.heading || 0;
  const tip = lead.r + 13, back = lead.r + 6;
  ctx.strokeStyle = allyColor(lead);
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(lead.x + Math.cos(h - 0.45) * back, lead.y + Math.sin(h - 0.45) * back);
  ctx.lineTo(lead.x + Math.cos(h) * tip, lead.y + Math.sin(h) * tip);
  ctx.lineTo(lead.x + Math.cos(h + 0.45) * back, lead.y + Math.sin(h + 0.45) * back);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// оружие поверх тел, если у него есть своё рисование (и у цепочки, и у выбитых — они дерутся лёжа)
function drawWeapons() {
  for (const u of state.party.concat(state.downed)) {
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
  drawNests();
  drawBase();
  drawFinish();
  drawDoors();
  drawButtons();
  drawCannons();
  drawPadMarks();
  drawPads();
  drawPadLinks();
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
}

G.renderer = { drawScene, drawCannonShots };
})(window.Game = window.Game || {});
