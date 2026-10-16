// Земля — всё неподвижное окружение (рисунок — render/terrain.js): скала, пол, подсветка зон, декор, пропасти, мостки,
// шипы, стены, колонны, закрытые двери. Она рисуется один раз кусками TILE×TILE пикселей холста и каждый кадр только
// копируется. Куски привязаны к миру, а камера сдвигается на целые пиксели холста (renderer.drawScene) — кусок ложится
// пиксель в пиксель, без швов и размытия.
// Кусок, который задевает пропасть, хранится двумя слоями: низ (до пропасти включительно) и верх (мостки, шипы,
// стены); между ними каждый кадр рисуются туман и камешки пропасти. Избушка базы живая: рисуется поверх земли,
// а ближние к камере блоки, которые на неё заходят, после неё копируются ещё раз.
// Куски у края экрана готовятся заранее, по одному раз в несколько кадров; давно не нужные выбрасываются.
// Открылась или закрылась дверь — куски около неё рисуются заново; мир перестроен или сменился масштаб — все.
// Здесь же окошко в стене за спрятанными: стена копируется из готовых кусков поверх тел.
// Состояние игры только читается.
(function (G) {
'use strict';

const { state } = G;
const { ctx, visible } = G.shapes;
const { world } = G.world;
const T = G.terrain;

const TILE = 384;            // сторона куска, пикселей холста
const PREFETCH_EVERY = 3;    // кусок про запас — не чаще, чем раз в столько кадров
const SPARE_MAX = 8;

let tiles = new Map();       // 'tx,ty' → { tx, ty, lower, upper, split }; порядок — от давно нужного к свежему
const spare = [];            // холсты выброшенных кусков — под новые
let scale = 0, src = null, doorKey = '', frame = 0, lastBuilt = -99;

const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
function tileArea(tx, ty) { return { x: tx * TILE / scale, y: ty * TILE / scale, w: TILE / scale, h: TILE / scale }; }

function recycle(t) {
  for (const c of [t.lower, t.upper]) if (c && spare.length < SPARE_MAX) spare.push(c);
}
function dropAll() { for (const t of tiles.values()) recycle(t); tiles.clear(); }

// нарисовать слой куска
function paint(tx, ty, area, part) {
  const c = spare.pop() || document.createElement('canvas');
  if (c.width !== TILE || c.height !== TILE) { c.width = TILE; c.height = TILE; }
  const x = c.getContext('2d');
  x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, TILE, TILE);
  x.setTransform(scale, 0, 0, scale, -tx * TILE, -ty * TILE);
  T.paintGround(x, area, part);
  return c;
}
function tileFor(tx, ty) {
  const id = tx + ',' + ty;
  let t = tiles.get(id);
  if (t) { tiles.delete(id); tiles.set(id, t); return t; }
  const area = tileArea(tx, ty), split = T.splitAt(area);
  t = { tx, ty, split, lower: paint(tx, ty, area, split ? 'lower' : 'all'), upper: null };
  if (split && T.hasUpperAt(area)) t.upper = paint(tx, ty, area, 'upper');
  tiles.set(id, t);
  lastBuilt = frame;
  return t;
}
// лишние куски — самые давно нужные — выбрасываются
function trim(max) {
  for (const [id, t] of tiles) {
    if (tiles.size <= max) break;
    tiles.delete(id); recycle(t);
  }
}

// мир перестроен, сменился масштаб, открылась или закрылась дверь
function sync(s) {
  const doors = world.doors || [];
  let key = '';
  for (const d of doors) key += d.open ? '1' : '0';
  if (Math.abs(s - scale) > 1e-9 || src !== world.floors || key.length !== doorKey.length) {
    dropAll(); scale = s; src = world.floors; doorKey = key;
    return;
  }
  if (key === doorKey) return;
  // дверь и стены вокруг неё (их кромки и грани зависят от того, закрыта ли она) — заново
  doors.forEach((d, i) => {
    if (key[i] === doorKey[i]) return;
    const pad = 80, r = { x: d.x - pad, y: d.y - T.WALL_H - pad, w: d.w + 2 * pad, h: d.h + T.WALL_H + 2 * pad };
    for (const [id, t] of tiles) if (hit(tileArea(t.tx, t.ty), r)) { tiles.delete(id); recycle(t); }
  });
  doorKey = key;
}

// куски, которые видны на холсте c при его текущем сдвиге (в пикселях: от x0 до x1, от y0 до y1)
function range(m, x0, y0, x1, y1) {
  return {
    tx0: Math.floor((x0 - m.e) / TILE), tx1: Math.floor((x1 - 1 - m.e) / TILE),
    ty0: Math.floor((y0 - m.f) / TILE), ty1: Math.floor((y1 - 1 - m.f) / TILE),
  };
}

// верхний слой земли (у кусков без пропасти — весь кусок) в прямоугольник мира r на холст c
function blitTop(c, r) {
  const m = c.getTransform();
  const x0 = Math.max(0, m.a * r.x + m.e), y0 = Math.max(0, m.d * r.y + m.f);
  const x1 = Math.min(c.canvas.width, m.a * (r.x + r.w) + m.e), y1 = Math.min(c.canvas.height, m.d * (r.y + r.h) + m.f);
  if (x1 <= x0 || y1 <= y0) return;
  const g = range(m, x0, y0, x1, y1);
  c.save();
  c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip();
  c.setTransform(1, 0, 0, 1, 0, 0);
  for (let ty = g.ty0; ty <= g.ty1; ty++) for (let tx = g.tx0; tx <= g.tx1; tx++) {
    const t = tileFor(tx, ty), img = t.split ? t.upper : t.lower;
    if (img) c.drawImage(img, Math.round(tx * TILE + m.e), Math.round(ty * TILE + m.f));
  }
  c.restore();
}

// земля на экране: низ всех кусков → туман и камешки пропастей → верх кусков с пропастью → живая избушка базы
function draw() {
  const m = ctx.getTransform();
  sync(m.a);
  frame++;
  const cw = ctx.canvas.width, ch = ctx.canvas.height, g = range(m, 0, 0, cw, ch);
  const split = [];
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let ty = g.ty0; ty <= g.ty1; ty++) for (let tx = g.tx0; tx <= g.tx1; tx++) {
    const t = tileFor(tx, ty);
    ctx.drawImage(t.lower, Math.round(tx * TILE + m.e), Math.round(ty * TILE + m.f));
    if (t.upper) split.push(t);
  }
  ctx.restore();
  T.drawPitLife(ctx, { x: -m.e / m.a, y: -m.f / m.d, w: cw / m.a, h: ch / m.d });
  if (split.length) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const t of split) ctx.drawImage(t.upper, Math.round(t.tx * TILE + m.e), Math.round(t.ty * TILE + m.f));
    ctx.restore();
  }
  drawHouse();
  // про запас — кусок из кольца вокруг экрана
  if (frame - lastBuilt >= PREFETCH_EVERY) {
    search: for (let ty = g.ty0 - 1; ty <= g.ty1 + 1; ty++) for (let tx = g.tx0 - 1; tx <= g.tx1 + 1; tx++) {
      if (tiles.has(tx + ',' + ty)) continue;
      tileFor(tx, ty);
      break search;
    }
  }
  trim((g.tx1 - g.tx0 + 3) * (g.ty1 - g.ty0 + 3) + 6);
}

// избушка базы «Обороны» (render/baseart.js) — по своему месту среди блоков: дальние уже под ней в земле, ближние,
// которые на неё заходят, копируются поверх ещё раз
function drawHouse() {
  const all = T.blocks(), house = all.find((b) => b.house);
  if (!house || !visible(T.lifted(house.r))) return;
  T.drawOne(ctx, house);
  const box = T.blockBox(house), bottom = house.r.y + house.r.h;
  for (const b of all) {
    if (b.house || b.r.y + b.r.h <= bottom) continue;
    const L = T.lifted(b.r);
    if (hit(L, box)) blitTop(ctx, L);
  }
}

// Спрятанные за стеной. Стены нарисованы до тел, поэтому тела за стеной оказались поверх неё; здесь, после тел,
// такая стена кладётся ещё раз поверх: во временном холсте вокруг каждого спрятанного (Герой, дружочки, враги)
// небольшое мягкое пятно, где стена прозрачна наполовину — его видно сквозь стену; у стоящих перед стеной
// (их головы заходят на её грань) — сквозные дыры. Стена кладётся не вся, а только там, куда заходит рисунок
// спрятанных (блоб крупнее тела, сверху шапка, полоска HP, значки); у кого рисунок раскидан далеко (спрут: тени
// тентаклей) — вся видимая часть. Обычная стена берётся из готовых кусков земли, живая избушка рисуется заново;
// ближние блоки, которые на неё заходят, вырезаются — каждое место закрывает только самый ближний блок
let osc = null, octx = null;
function spriteBounds(list) {
  const out = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const u of list) {
    const reach = u.kind === 'enemy' ? (G.enemyTypes[u.type].drawReach || 0) : 0;
    if (reach > 200) return { x0: -Infinity, y0: -Infinity, x1: Infinity, y1: Infinity };
    const side = u.r * 2.2 + 16;
    out.x0 = Math.min(out.x0, u.x - side); out.x1 = Math.max(out.x1, u.x + side);
    out.y0 = Math.min(out.y0, u.y - u.r * 3.4 - 40); out.y1 = Math.max(out.y1, u.y + u.r * 1.6 + 8);
  }
  return out;
}
function bodies() {
  const out = [];
  for (const u of state.party) out.push(u);
  for (const u of state.downed) out.push(u);
  for (const u of state.neutrals) out.push(u);
  for (const e of state.enemies) if (e.hp > 0) out.push(e);
  return out;
}
function drawOccluders() {
  const list = bodies(), all = T.blocks();
  let m = null;
  for (const b of all) {
    const r = b.r, L = T.lifted(r);
    if (!visible(L)) continue;
    const bottom = r.y + r.h, inX = (u) => u.x + u.r > r.x && u.x - u.r < r.x + r.w;
    const hidden = list.filter((u) => inX(u) && u.y < bottom && u.y + u.r > L.y);
    if (!hidden.length) continue;
    const front = list.filter((u) => inX(u) && u.y >= bottom && u.y - u.r * 3 < bottom);
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    // перекладываемый кусок: блок (у избушки — с запасом на крышу и дым), где заходят рисунки спрятанных, в пикселях холста
    if (!m) m = ctx.getTransform();
    const box = b.house ? T.blockBox(b) : L, sb = spriteBounds(hidden);
    const wx0 = Math.max(box.x, sb.x0), wy0 = Math.max(box.y, sb.y0);
    const wx1 = Math.min(box.x + box.w, sb.x1), wy1 = Math.min(box.y + box.h, sb.y1);
    const x0 = Math.max(0, Math.floor(m.a * wx0 + m.e)), y0 = Math.max(0, Math.floor(m.d * wy0 + m.f));
    const x1 = Math.min(cw, Math.ceil(m.a * wx1 + m.e)), y1 = Math.min(ch, Math.ceil(m.d * wy1 + m.f));
    if (x1 <= x0 || y1 <= y0) continue;
    const w = x1 - x0, h = y1 - y0;
    // временный холст по размеру куска (только растёт): чем он меньше, тем дешевле каждое копирование на экран
    if (!osc) { osc = document.createElement('canvas'); osc.width = 0; osc.height = 0; octx = osc.getContext('2d'); }
    if (osc.width < w || osc.height < h) { osc.width = Math.max(osc.width, Math.ceil(w / 64) * 64); osc.height = Math.max(osc.height, Math.ceil(h / 64) * 64); }
    octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, w, h);
    octx.save(); octx.beginPath(); octx.rect(0, 0, w, h); octx.clip();
    octx.setTransform(m.a, m.b, m.c, m.d, m.e - x0, m.f - y0);
    if (b.house) T.drawOne(octx, b); else blitTop(octx, L);
    octx.globalCompositeOperation = 'destination-out';
    for (const u of hidden) G.shapes.glow(octx, u.x, u.y - u.r * 0.6, Math.min(90, u.r * 2.2 + 6), '#000000', 0.5, 0.45);
    octx.fillStyle = '#000';
    for (const u of front) { octx.beginPath(); octx.ellipse(u.x, u.y - u.r * 0.9, u.r * 1.5, u.r * 2.1, 0, 0, Math.PI * 2); octx.fill(); }
    // ближние блоки, заходящие на этот, уже лежат поверх него и окошко у них своё — не закрывать их
    for (const o of all) {
      if (o.r.y + o.r.h <= bottom) continue;
      const M = T.lifted(o.r);
      if (hit(M, L)) octx.fillRect(M.x, M.y, M.w, M.h);
    }
    octx.globalCompositeOperation = 'source-over';
    octx.restore();
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(osc, 0, 0, w, h, x0, y0, w, h); ctx.restore();
  }
}

G.ground = { draw, drawOccluders };
})(window.Game = window.Game || {});
