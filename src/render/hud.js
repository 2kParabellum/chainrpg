// Интерфейс поверх сцены: HUD, шторка ухода в портал. Экраны победы и поражения — HTML-панели (main.js).
// Состояние только читается.
(function (G) {
'use strict';

const { CONFIG, COLORS, state } = G;
const { abilities } = G;
const { currentRoom, isSpotted, leaderSpeedMul, leader } = G.session;
const { world, roomCount, roomIndexAt, buttonUnder } = G.world;
const { clamp } = G.math;
const { nearestPickup } = G.chain;
const { ctx, screenTransform, allyColor } = G.shapes;

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
  if (state.exit && !state.leaving) drawEdgeMarker(state.exit.x, state.exit.y, COLORS.exitGlow, 'ВЫХОД');
  // обучение: выход из текущей комнаты открылся, а он за экраном
  for (const d of world.doors) {
    if (d.open && d.room === currentRoom()) drawEdgeMarker(d.x + d.w / 2, d.y + d.h / 2, COLORS.doorEdge, 'ДАЛЬШЕ');
  }
  const cfg = state.level.waves;
  if (!cfg) return;
  for (const n of state.nests) {
    if (n.nextIn < cfg.telegraph) drawEdgeMarker(n.x, n.y, COLORS.nest, `×${G.waves.waveSize(cfg, n.wave)}`);
    else if (state.time - n.releasedAt < 3) drawEdgeMarker(n.x, n.y, COLORS.nest, '');
  }
  if (state.base && state.base.regenTimer < 1) drawEdgeMarker(state.base.x, state.base.y, COLORS.baseEdge, 'БАЗА');
}

// яркость надписи, которая видна duration секунд с момента age = 0: быстро проявляется, в конце гаснет
function bannerAlpha(age, duration) {
  return clamp(age / 0.25, 0, 1) * clamp((duration - age) / 0.6, 0, 1);
}

// плашка поперёк экрана: мелкий заголовок и крупный текст; age — сколько секунд она уже видна, y — где по высоте
function drawBanner(title, text, age, duration, color = '#f0f0f5', y = 130) {
  const a = bannerAlpha(age, duration);
  if (a <= 0 || state.status !== 'play') return;
  const V = CONFIG.VIEW;
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(10,10,12,0.75)';
  ctx.fillRect(0, y - 42, V.w, 74);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#8a8a95';
  ctx.font = '14px monospace';
  ctx.fillText(title, V.w / 2, y - 18);
  ctx.fillStyle = color;
  ctx.font = 'bold 22px monospace';
  ctx.fillText(text, V.w / 2, y + 14);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

// в начале партии — название уровня и его цель; после победы — что база выстояла и что открылся портал выхода
function drawBanners() {
  const { goal, name } = state.level;
  if (goal) drawBanner(name.toUpperCase(), `ЦЕЛЬ: ${goal}`, state.time, 4.5);
  // подсказка комнаты (обучение): всплывает ниже середины экрана, когда Герой входит в комнату
  const plan = state.level.rooms[state.room];
  if (plan && plan.hint) {
    drawBanner(`КОМНАТА ${state.room + 1}`, plan.hint, state.time - state.roomAt, 5, '#e8d48a', CONFIG.VIEW.h - 150);
  }
  // «Оборона»: начался натиск — последние минуты волны больше
  const w = state.level.waves;
  if (w && w.surge && !state.cleared) {
    const at = state.level.victory.time - w.surge.lastSeconds;
    drawBanner('НАТИСК', `Последние ${Math.round(w.surge.lastSeconds / 60)} минуты — волны больше`, state.time - at, 4, COLORS.nest);
  }
  if (state.cleared && state.base) drawBanner('БАЗА ВЫСТОЯЛА', 'Волна от базы сносит всех врагов и гнёзда', state.time - state.clearedAt, 3.2, COLORS.baseEdge);
  if (state.exit && !state.leaving) drawBanner('ПОРТАЛ ОТКРЫТ', 'Заедь в светлый портал — уровень пройден', state.time - state.exit.at, 4, COLORS.exitGlow);
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
  const rest = `${def.desc}, ${def.duration} с`;
  ctx.font = '14px monospace';
  const nw = ctx.measureText(name).width, x = V.w / 2 - (nw + ctx.measureText(rest).width) / 2;
  ctx.globalAlpha = 0.85 * a;
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 4;
  ctx.textAlign = 'left';
  ctx.fillStyle = def.color;
  ctx.fillText(name, x, y);
  ctx.fillStyle = '#b4b4be';
  ctx.fillText(rest, x + nw, y);
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  ctx.globalAlpha = 1;
}

function drawHud() {
  ctx.save();
  screenTransform();
  ctx.font = '13px monospace';
  ctx.textAlign = 'left';

  const level = state.level;
  const here = currentRoom();
  // необнаруженные мины в счётчик не попадают, о них предупреждает только знак на полу
  const inRoom = state.enemies.filter((e) => roomIndexAt(e.x, e.y) === here && isSpotted(e)).length;
  const where = level.zoneNames ? `ЗОНА: ${level.zoneNames[here]}` : `КОМНАТА ${here + 1}/${roomCount()}`;
  // цель уровня «разрушить всё заданного типа» показываем счётчиком
  const rule = level.victory;
  let goal = '';
  // showHp — цель одна (босс): вместо счётчика её HP
  if (rule.kind === 'destroyType') {
    const left = state.enemies.filter((e) => e.type === rule.type);
    goal = rule.showHp && left.length === 1
      ? `   ${rule.label}: ${Math.ceil(left[0].hp)}/${left[0].maxHp}` : `   ${rule.label}: ${left.length}`;
  }
  // продержаться: сколько осталось и сколько HP у базы
  if (rule.kind === 'survive') {
    const left = Math.max(0, Math.ceil(rule.time - state.time));
    goal = `   ${rule.label}: ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    if (state.base) goal += `   БАЗА: ${Math.max(0, Math.ceil(state.base.hp))}/${state.base.maxHp}`;
  }
  ctx.fillStyle = '#c8c8d2';
  ctx.fillText(`${where}   ВРАГОВ ЗДЕСЬ: ${inRoom}${goal}   ЦЕПОЧКА: ${state.party.length}   СКОРОСТЬ: ${Math.round(leaderSpeedMul() * 100)}%`, 12, 22);

  // задача комнаты (обучение: что сделать, чтобы пройти её), иначе — общее напоминание
  const task = level.rooms[here] && level.rooms[here].task;
  ctx.fillStyle = task ? '#e8d48a' : '#8a8a95';
  ctx.fillText(task || 'Подиумы подбираются сами: проедь по нему цепочкой', 12, 38);
  let y = 58;
  for (const a of state.party) {
    ctx.fillStyle = allyColor(a);
    const bf = Object.entries(a.buffs || {}).filter(([, t]) => t > 0).map(([k, t]) => ` ${G.buffs[k].name} ${Math.ceil(t)}с`).join('');
    const label = a.cfg.name + (a.ability ? ` (${abilities[a.ability].name}${a.abilityLevel > 1 ? ' ' + a.abilityLevel : ''})` : '') + bf;
    ctx.fillText(`${label.padEnd(34, ' ')} ${Math.max(0, Math.ceil(a.hp))}/${a.maxHp}`, 12, y);
    y += 16;
  }
  // улучшения прохождения: названия цветом того, чьё улучшение
  if (state.upgrades.length) {
    y += 4;
    ctx.fillStyle = '#8a8a95';
    ctx.fillText('УЛУЧШЕНИЯ:', 12, y);
    let x = 12 + ctx.measureText('УЛУЧШЕНИЯ: ').width;
    for (const key of state.upgrades) {
      const def = G.upgrades[key], who = def.who === 'hero' ? COLORS.hero : abilities[def.who].color;
      ctx.fillStyle = who;
      ctx.fillText(def.name, x, y);
      x += ctx.measureText(def.name + '  ').width;
    }
  }

  drawEdgeMarkers();
  drawBanners();
  drawNotice();
  ctx.font = '13px monospace';

  const pickup = nearestPickup();
  const btn = buttonUnder(leader());
  if (state.leaving) {
    // цепочка уходит в портал — подсказки внизу не нужны
  } else if (btn && !btn.pressed && state.party.length > 1 && state.status === 'play') {
    ctx.fillStyle = '#8ce27a';
    ctx.textAlign = 'center';
    ctx.fillText('X — ОСТАВИТЬ ДРУЖОЧКА НА КНОПКЕ', CONFIG.VIEW.w / 2, CONFIG.VIEW.h - 30);
  } else if (pickup && state.status === 'play') {
    ctx.fillStyle = '#f0f0f5';
    ctx.textAlign = 'center';
    const msg = pickup.kind === 'downed' ? 'ПРОБЕЛ — ПОДНЯТЬ' : 'ПРОБЕЛ — ПРИСОЕДИНИТЬ';
    ctx.fillText(msg, CONFIG.VIEW.w / 2, CONFIG.VIEW.h - 30);
  }

  // шторка поверх всего, включая интерфейс; экран «уровень пройден» — в HTML поверх канваса (см. main.js)
  drawIris();

  ctx.restore();
}

G.hud = { drawHud };
})(window.Game = window.Game || {});
