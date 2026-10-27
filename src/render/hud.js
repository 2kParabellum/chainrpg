// Интерфейс поверх сцены: HUD, шторка ухода в портал. Экраны победы и поражения — HTML-панели (main.js).
// Состояние только читается.
(function (G) {
'use strict';

const { CONFIG, COLORS, state } = G;
const { abilities } = G;
const { currentRoom, isSpotted, leaderSpeedMul, leader, upgrade } = G.session;
const { world, roomCount, roomIndexAt, buttonUnder } = G.world;
const { clamp } = G.math;
const { nearestPickup } = G.chain;
const { ctx, screenTransform } = G.shapes;
const { withKeys, keyLabel } = G.input;
const { isTouch, isPortrait } = G.screen;
const { raceClock, lapTime } = G.race;

// шрифт интерфейса: округлый, жирный (graphics.md); цвета — из палитры fantasy-24
const UI_FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';
const UI = { panel: 'rgba(42,29,13,0.85)', edge: '#45230d', text: '#efd8a1', muted: '#927e6a', gold: '#efac28',
  red: '#ef3a0c', teal: '#3c9f9c', orange: '#ef692f', ink: '#2a1d0d' };

// где по высоте подсказки у низа экрана: на телефоне выше — внизу лежат пальцы, кнопки и джойстик
// (вертикально кнопки занимают больше высоты вида — ещё выше)
function bottomHintY() { return CONFIG.VIEW.h - (isTouch() ? (isPortrait() ? 210 : 100) : 30); }

// разбить текст на строки не шире maxW текущим шрифтом: по словам, а если parts — список кусков, по кускам
function wrapLines(parts, maxW, sep = ' ') {
  const lines = [];
  let line = '';
  for (const p of parts) {
    const next = line ? line + sep + p : p;
    if (line && ctx.measureText(next).width > maxW) { lines.push(line); line = p; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

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
  if (state.status !== 'play') return;
  // портал выхода с уровня открыт, а он за экраном
  if (state.exit && !state.leaving) drawEdgeMarker(state.exit.x, state.exit.y, COLORS.exitGlow, 'EXIT');
  // обучение: выход из текущей комнаты открылся, а он за экраном
  for (const d of world.doors) {
    if (d.open && d.room === currentRoom()) drawEdgeMarker(d.x + d.w / 2, d.y + d.h / 2, COLORS.doorEdge, 'NEXT');
  }
  const cfg = state.level.waves;
  if (!cfg) return;
  for (const n of state.nests) {
    if (n.nextIn < cfg.telegraph) drawEdgeMarker(n.x, n.y, COLORS.nest, `×${G.waves.waveSize(cfg, n.wave)}`);
    else if (state.time - n.releasedAt < 3) drawEdgeMarker(n.x, n.y, COLORS.nest, '');
  }
  if (state.base && state.base.regenTimer < 1) drawEdgeMarker(state.base.x, state.base.y, COLORS.baseEdge, 'BASE');
}

// «Hit the Count»: метки к выданным Подом дружочкам, которые ждут за экраном («×N» — сколько их там),
// и к самому Поду, когда дружочков в цепочке хватает и он готов
function drawPodMarker() {
  const pod = world.pod, p = state.pod;
  if (!pod || !p || state.cleared || state.status !== 'play') return;
  for (const d of p.drops) {
    drawEdgeMarker(d.x, d.y, COLORS.buddy, `×${d.mates.filter((m) => state.neutrals.includes(m)).length}`);
  }
  if (p.cooldown > 0 || G.pod.podMates() < pod.goal) return;
  drawEdgeMarker(pod.x, pod.y, COLORS.exitGlow, 'POD');
}

// «Capture the Flags»: метки к флагам за краем экрана — к погасшим (золотом, «FLAG») и к тем, чьего часового сейчас бьют
// (красным, с его HP в процентах)
function drawFlagMarkers() {
  if (state.status !== 'play' || state.cleared) return;
  for (const f of state.flags) {
    const x = f.btn.x + f.btn.w / 2, y = f.btn.y + f.btn.h / 2;
    if (!f.held) drawEdgeMarker(x, y, UI.gold, 'FLAG');
    else if (f.guard && state.time - f.hitAt < CONFIG.FLAGS.alertTime) {
      drawEdgeMarker(x, y, UI.red, `${Math.max(1, Math.round((f.guard.hp / f.guard.maxHp) * 100))}%`);
    }
  }
}

// яркость надписи, которая видна duration секунд с момента age = 0: быстро проявляется, в конце гаснет
function bannerAlpha(age, duration) {
  return clamp(age / 0.25, 0, 1) * clamp((duration - age) / 0.6, 0, 1);
}

// плашка поперёк экрана: мелкий заголовок и крупный текст; age — сколько секунд она уже видна, y — где по высоте
function drawBanner(title, text, age, duration, color = '#fff4dc', y = 130) {
  const a = bannerAlpha(age, duration);
  if (a <= 0 || state.status !== 'play') return;
  const V = CONFIG.VIEW;
  // длинный текст на узком экране (телефон вертикально) — в несколько строк, плашка растёт вниз
  ctx.font = `bold 22px ${UI_FONT}`;
  const lines = wrapLines(text.split(' '), V.w - 24);
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(29,20,10,0.75)';
  ctx.fillRect(0, y - 42, V.w, 74 + (lines.length - 1) * 26);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#927e6a';
  ctx.font = `bold 14px ${UI_FONT}`;
  ctx.fillText(title, V.w / 2, y - 18);
  ctx.fillStyle = color;
  ctx.font = `bold 22px ${UI_FONT}`;
  lines.forEach((line, i) => ctx.fillText(line, V.w / 2, y + 14 + i * 26));
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

// в начале партии — название уровня и его цель; после победы — что база выстояла и что открылся портал выхода
function drawBanners() {
  const { goal, name } = state.level;
  if (goal) drawBanner(name.toUpperCase(), `GOAL: ${goal}`, state.time, 4.5);
  // подсказка комнаты (обучение): всплывает ниже середины экрана, когда Герой входит в комнату
  const plan = state.level.rooms[state.room];
  if (plan && plan.hint) {
    const hintY = CONFIG.VIEW.h - (isTouch() ? (isPortrait() ? 330 : 220) : 150);
    drawBanner(`ROOM ${state.room + 1}`, withKeys(plan.hint), state.time - state.roomAt, 5, '#efac28', hintY);
  }
  // «Оборона»: начался натиск — последние минуты волны больше
  const w = state.level.waves;
  if (w && w.surge && !state.cleared) {
    const at = state.level.victory.time - w.surge.lastSeconds;
    drawBanner('ONSLAUGHT', `Last ${Math.round(w.surge.lastSeconds / 60)} minutes — bigger waves`, state.time - at, 4, COLORS.nest);
  }
  // «Dead Race»: круг пройден — его время и сколько дружочков уже пересекли линию (число растёт, пока проезжает хвост)
  const laps = state.race ? state.race.laps : [];
  if (laps.length) {
    const l = laps[laps.length - 1], k = laps.length, total = state.level.victory.laps;
    drawBanner(k >= total ? 'FINISH' : `LAP ${k}/${total}`, `${raceClock(l.time)} · mates across the line: ${l.mates}`,
      state.time - l.at, 3.5, '#efac28', 220);
  }
  // «Capture the Flags»: часовой поднял флаг или флаг потерян (часового убили, утащили, сбили с площадки) — сколько горит
  const fn = state.flagNews;
  if (fn) {
    const total = state.flags.length;
    if (fn.up) drawBanner('FLAG RAISED', `${fn.count} of ${total} flags held`, state.time - fn.at, 2.6, COLORS.flag, 220);
    else drawBanner('FLAG LOST', `${fn.count} of ${total} flags held — the guard is gone`, state.time - fn.at, 3, UI.red, 220);
  }
  if (state.cleared && state.base) drawBanner('THE BASE HELD', 'A blast from the base wipes out every enemy and nest', state.time - state.clearedAt, 3.2, COLORS.baseEdge);
  if (state.exit && !state.leaving) drawBanner('PORTAL OPEN', 'Drive into the bright portal to finish the level', state.time - state.exit.at, 4, COLORS.exitGlow);
}

// цепочка уходит в портал выхода: тьма затягивает экран с краёв, оставляя сужающийся круг вокруг портала;
// когда партия уже выиграна — экран тёмный целиком (поверх него экран «уровень пройден»)
function drawIris() {
  const V = CONFIG.VIEW;
  if (state.status === 'win') { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, V.w, V.h); return; }
  if (!state.leaving || state.status !== 'play') return;
  const k = clamp(state.leaving.t / CONFIG.EXIT.irisTime, 0, 1);
  const ease = k * k * (3 - 2 * k);
  const cx = state.exit.x - state.camera.x, cy = state.exit.y - state.camera.y;
  const far = Math.max(...[[0, 0], [V.w, 0], [0, V.h], [V.w, V.h]].map(([x, y]) => Math.hypot(x - cx, y - cy)));
  const r = far * (1 - ease);
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.rect(0, 0, V.w, V.h);
  if (r > 0.5) ctx.arc(cx, cy, r, 0, Math.PI * 2, true);
  ctx.fill('evenodd');
  // светлая кромка круга
  if (r > 0.5) {
    ctx.strokeStyle = COLORS.exitGlow;
    ctx.globalAlpha = 0.5 * (1 - ease);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

// надпись о только что взятом усилении: что оно даёт и на сколько секунд — спокойным серым текстом,
// только название цветом усиления; чуть всплывает и гаснет
function drawNotice() {
  const n = state.notice;
  if (!n || state.status !== 'play') return;
  const age = state.time - n.at, a = bannerAlpha(age, 2.8);
  if (a <= 0) return;
  const def = G.buffs[n.key], V = CONFIG.VIEW;
  const y = V.h / 2 - 80 - Math.min(age, 1) * 8;
  const name = def.name[0].toUpperCase() + def.name.slice(1) + ': ';
  const rest = n.packed ? withKeys('in the backpack — {pack} to use') : `${def.desc}, ${def.duration} s`;
  ctx.font = `bold 14px ${UI_FONT}`;
  const nw = ctx.measureText(name).width, x = V.w / 2 - (nw + ctx.measureText(rest).width) / 2;
  ctx.globalAlpha = 0.85 * a;
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 4;
  ctx.textAlign = 'left';
  ctx.fillStyle = def.color;
  ctx.fillText(name, x, y);
  ctx.fillStyle = '#efd8a1';
  ctx.fillText(rest, x + nw, y);
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  ctx.globalAlpha = 1;
}

// --- плашки и таймеры ---

function shadowText(fn) {
  ctx.shadowColor = 'rgba(20,10,5,0.9)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;
  fn();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.shadowColor = 'transparent';
}

function chipWidth(c) {
  ctx.font = `bold 14px ${UI_FONT}`;
  return ctx.measureText(c.text).width + 20 + (c.icon ? 18 : 0) + (c.bar !== undefined ? 66 : 0);
}

function panel(x, y, w, h) {
  ctx.fillStyle = UI.panel;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill();
  ctx.strokeStyle = UI.edge; ctx.lineWidth = 2; ctx.stroke();
}

// плашка: значок (враг / дружочек / часы), текст, по желанию полоска
function drawChip(c, x, y, w, h) {
  panel(x, y, w, h);
  let tx = x + 10;
  const cy = y + h / 2;
  if (c.icon === 'foe') {
    ctx.fillStyle = '#9b1a0a'; ctx.strokeStyle = UI.ink; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(tx + 6, cy, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = UI.gold; ctx.beginPath(); ctx.arc(tx + 7, cy - 1, 2.6, 0, Math.PI * 2); ctx.fill();
    tx += 18;
  } else if (c.icon === 'mate') {
    ctx.fillStyle = '#efb775'; ctx.strokeStyle = UI.ink; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(tx + 6, cy, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff4dc';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(tx + 6 + s * 2.6, cy - 1, 2, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = UI.ink;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(tx + 6.6 + s * 2.6, cy - 1, 1, 0, Math.PI * 2); ctx.fill(); }
    tx += 18;
  } else if (c.icon === 'flag') {
    ctx.strokeStyle = UI.ink; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(tx + 2, cy + 8); ctx.lineTo(tx + 2, cy - 8); ctx.stroke();
    ctx.strokeStyle = '#ab5c1c'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = COLORS.flag; ctx.strokeStyle = UI.ink; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(tx + 3, cy - 8); ctx.lineTo(tx + 13, cy - 6); ctx.lineTo(tx + 13, cy); ctx.lineTo(tx + 3, cy - 1);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    tx += 18;
  } else if (c.icon === 'clock') {
    ctx.strokeStyle = UI.gold; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(tx + 6, cy, 6.5, 0, Math.PI * 2); ctx.moveTo(tx + 6, cy); ctx.lineTo(tx + 6, cy - 4); ctx.moveTo(tx + 6, cy); ctx.lineTo(tx + 9, cy + 1); ctx.stroke();
    tx += 18;
  }
  ctx.font = `bold 14px ${UI_FONT}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = c.color || UI.text;
  ctx.fillText(c.text, tx, cy + 5);
  if (c.bar !== undefined) {
    const bx = tx + ctx.measureText(c.text).width + 8, bw = 56;
    ctx.fillStyle = UI.ink; ctx.beginPath(); ctx.roundRect(bx, cy - 4, bw, 8, 3); ctx.fill();
    ctx.fillStyle = c.bar < 0.35 ? UI.red : c.color;
    ctx.beginPath(); ctx.roundRect(bx, cy - 4, bw * clamp(c.bar, 0.03, 1), 8, 3); ctx.fill();
  }
}

// полоска HP босса: имя над ней, сама — широкая, красная, с числом
function drawBossBar(e, label, x, y, w) {
  panel(x - 8, y, w + 16, 30);
  const k = clamp(e.hp / e.maxHp, 0, 1);
  ctx.fillStyle = UI.ink; ctx.beginPath(); ctx.roundRect(x, y + 14, w, 10, 4); ctx.fill();
  ctx.fillStyle = UI.red; ctx.beginPath(); ctx.roundRect(x, y + 14, w * Math.max(0.01, k), 10, 4); ctx.fill();
  ctx.font = `bold 12px ${UI_FONT}`;
  ctx.textAlign = 'left'; ctx.fillStyle = UI.text; ctx.fillText(label, x, y + 11);
  ctx.textAlign = 'right'; ctx.fillStyle = UI.muted; ctx.fillText(`${Math.ceil(e.hp)}/${e.maxHp}`, x + w, y + 11);
  ctx.textAlign = 'left';
}

// ячейка рюкзака (улучшение «Backpack»): усиление внутри — его значок и кнопка; открыт — «OPEN» мигает;
// пусто — тусклая подпись с кнопкой
function drawBackpack(x, y, w) {
  const bag = state.backpack;
  panel(x, y, w, 30);
  ctx.font = `bold 12px ${UI_FONT}`;
  ctx.textAlign = 'center';
  if (bag.stored) {
    G.blobs.glyphAt(bag.stored, x + 15, y + 13, 7);
    ctx.fillStyle = G.buffs[bag.stored].color;
    ctx.fillText(keyLabel('pack'), x + 15 + (w - 15) / 2, y + 19);
  } else if (bag.open) {
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(state.time * 8);
    ctx.fillStyle = UI.gold;
    ctx.fillText('OPEN', x + w / 2, y + 19);
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = UI.muted;
    ctx.fillText(`BAG ${keyLabel('pack')}`, x + w / 2, y + 19);
  }
}

// таймеры усилений Героя наверху посередине: значок, секунды, полоска остатка; перед концом мигают.
// С улучшением «Backpack» первой в ряду — ячейка рюкзака. Если посередине тесно (узкий экран) — под плашками слева
function drawBuffTimers(cx, y, leftRight, leftBottom) {
  const lead = state.party[0];
  if (!lead || !lead.buffOrder) return;
  const keys = lead.buffOrder.filter((k) => lead.buffs[k] > 0);
  const bag = !!upgrade('backpack');
  const n = keys.length + (bag ? 1 : 0);
  if (!n) return;
  const itemW = 64, gap = 6, total = n * itemW + (n - 1) * gap;
  let x = cx - total / 2;
  if (x < leftRight + 4) { x = 10; y = leftBottom + 10; }
  if (bag) { drawBackpack(x, y, itemW); x += itemW + gap; }
  keys.forEach((k, i) => {
    const left = lead.buffs[k], def = G.buffs[k], ix = x + i * (itemW + gap);
    if (left < 4 && Math.floor(state.time * 6) % 2) ctx.globalAlpha = 0.45;
    panel(ix, y, itemW, 30);
    G.blobs.glyphAt(k, ix + 15, y + 13, 7);
    ctx.font = `bold 15px ${UI_FONT}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = UI.text;
    ctx.fillText(`${Math.ceil(left)}`, ix + 29, y + 19);
    ctx.fillStyle = UI.ink; ctx.fillRect(ix + 6, y + 24, itemW - 12, 3);
    ctx.fillStyle = def.color; ctx.fillRect(ix + 6, y + 24, (itemW - 12) * clamp(left / def.duration, 0, 1), 3);
    ctx.globalAlpha = 1;
  });
}

function drawHud() {
  ctx.save();
  screenTransform();
  ctx.font = `bold 14px ${UI_FONT}`;
  ctx.textAlign = 'left';

  const level = state.level;
  const here = currentRoom();
  const V = CONFIG.VIEW;
  // необнаруженные мины в счётчик не попадают, о них предупреждает только знак на полу
  const inRoom = state.enemies.filter((e) => roomIndexAt(e.x, e.y) === here && isSpotted(e)).length;
  const rule = level.victory;

  // плашки слева вверху: где мы, сколько врагов, цель уровня, длина цепочки и её скорость;
  // на узком экране переносятся, справа не заходят под значки паузы и «заново»
  const maxX = V.w - 140;
  const chips = [];
  chips.push({ text: level.zoneNames ? level.zoneNames[here] : `ROOM ${here + 1}/${roomCount()}` });
  chips.push({ text: `${inRoom}`, icon: 'foe' });
  // showHp — цель одна (босс): её HP показывает полоска наверху посередине
  let boss = null;
  if (rule.kind === 'destroyType') {
    const left = state.enemies.filter((e) => e.type === rule.type);
    if (rule.showHp && left.length === 1) boss = left[0];
    else chips.push({ text: `${rule.label}: ${left.length}`, color: UI.gold });
  }
  if (rule.kind === 'survive') {
    const left = Math.max(0, Math.ceil(rule.time - state.time));
    chips.push({ text: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, color: UI.gold, icon: 'clock' });
    if (state.base) chips.push({ text: 'BASE', bar: state.base.hp / state.base.maxHp, color: UI.teal });
  }
  // «Hit the Count»: дружочков в цепочке из нужных Поду (хватает — золотом) и готов ли Под; общий счётчик цепочки
  // (вместе с Героем) здесь не нужен — сбивал бы с толку
  const podRule = rule.kind === 'podCount' && state.pod;
  if (podRule) {
    const goal = world.pod.goal, mates = G.pod.podMates(), cd = state.pod.cooldown;
    chips.push({ text: `${mates}/${goal}`, icon: 'mate', color: mates >= goal ? UI.gold : UI.text });
    if (!state.cleared) {
      chips.push(cd > 0 ? { text: `${rule.label} ${Math.ceil(cd)}s`, icon: 'clock', color: UI.muted }
        : { text: `${rule.label} READY`, color: UI.teal });
    }
  }
  // «Capture the Flags»: сколько флагов горит из всех (все — бирюзой)
  if (rule.kind === 'flags') {
    const held = G.flags.flagsHeld(), total = state.flags.length;
    chips.push({ text: `${rule.label} ${held}/${total}`, icon: 'flag', color: held >= total ? UI.teal : UI.gold });
  }
  // «Dead Race»: какой круг из скольких и время текущего круга (до старта — «GO!»)
  const race = rule.kind === 'laps' && state.race;
  if (race) {
    const done = race.laps.length, t = lapTime();
    chips.push({ text: `${rule.label} ${Math.min(done + 1, rule.laps)}/${rule.laps}`, color: UI.gold });
    if (!state.cleared) chips.push(t === null ? { text: 'GO!', color: UI.teal } : { text: raceClock(t), icon: 'clock' });
  }
  const speed = Math.round(leaderSpeedMul() * 100);
  if (!podRule) chips.push({ text: `${state.party.length}`, icon: 'mate' });
  if (speed < 100) chips.push({ text: `SPEED ${speed}%`, color: UI.orange }); // медленнее обычного — длинная цепочка

  let x = 10, y = 10, right = 10;
  const h = 26;
  for (const c of chips) {
    const w = chipWidth(c);
    if (x > 10 && x + w > maxX) { x = 10; y += h + 6; }
    drawChip(c, x, y, w, h);
    x += w + 6;
    right = Math.max(right, x);
  }
  let bottom = y + h;

  // задача комнаты (обучение: что сделать, чтобы пройти её)
  const task = level.rooms[here] && level.rooms[here].task;
  if (task) {
    ctx.font = `bold 15px ${UI_FONT}`;
    shadowText(() => {
      ctx.fillStyle = UI.gold;
      for (const line of wrapLines(task.split(' '), maxX - 12)) { bottom += 20; ctx.fillText(line, 12, bottom); }
    });
  }
  // «Dead Race»: пройденные круги — время и сколько дружочков пересекли линию; лучший круг — золотом
  if (race && race.laps.length) {
    const best = Math.min(...race.laps.map((l) => l.time));
    ctx.font = `bold 13px ${UI_FONT}`;
    shadowText(() => {
      race.laps.forEach((l, i) => {
        bottom += 17;
        ctx.fillStyle = l.time === best && race.laps.length > 1 ? UI.gold : UI.text;
        ctx.fillText(`Lap ${i + 1}   ${raceClock(l.time)}   ×${l.mates}`, 12, bottom);
      });
    });
  }
  // улучшения прохождения: мелко, названия цветом того, чьё улучшение
  if (state.upgrades.length) {
    ctx.font = `bold 12px ${UI_FONT}`;
    bottom += 18;
    let ux = 12;
    shadowText(() => {
      for (const key of state.upgrades) {
        const def = G.upgrades[key], who = abilities[def.who] ? abilities[def.who].color : COLORS[def.who]; // Герой, General и PODS — свои цвета
        const wd = ctx.measureText(def.name + '   ').width;
        if (ux > 12 && ux + wd > maxX) { ux = 12; bottom += 16; }
        ctx.fillStyle = who;
        ctx.fillText(def.name, ux, bottom);
        ux += wd;
      }
    });
  }

  // наверху посередине: полоска HP босса, под ней — таймеры усилений Героя
  let topY = 10;
  if (boss) {
    const bw = Math.min(360, V.w - 2 * 150), bx = (V.w - bw) / 2;
    const by = bx < right + 4 ? bottom + 10 : topY;
    drawBossBar(boss, rule.label, bx, by, bw);
    topY = by + 34;
  }
  drawBuffTimers(V.w / 2, topY, boss ? -1 : right, bottom);

  drawEdgeMarkers();
  drawPodMarker();
  drawFlagMarkers();
  drawBanners();
  drawNotice();
  ctx.font = `bold 14px ${UI_FONT}`;

  const pickup = nearestPickup();
  const btn = buttonUnder(leader());
  if (state.leaving) {
    // цепочка уходит в портал — подсказки внизу не нужны
  } else if (btn && !btn.pressed && state.party.length > 1 && state.status === 'play') {
    ctx.fillStyle = '#3c9f9c';
    ctx.textAlign = 'center';
    ctx.fillText(withKeys(btn.flag ? '{drop} — LEAVE A MATE TO HOLD THE FLAG' : '{drop} — LEAVE A MATE ON THE BUTTON'),
      CONFIG.VIEW.w / 2, bottomHintY());
  } else if (pickup && state.status === 'play') {
    ctx.fillStyle = '#fff4dc';
    ctx.textAlign = 'center';
    const msg = pickup.kind === 'downed' ? '{recruit} — PICK UP' : '{recruit} — RECRUIT';
    ctx.fillText(withKeys(msg), CONFIG.VIEW.w / 2, bottomHintY());
  }

  // шторка поверх всего, включая интерфейс; экран «уровень пройден» — в HTML поверх канваса (см. main.js)
  drawIris();

  ctx.restore();
}

G.hud = { drawHud };
})(window.Game = window.Game || {});
