// ============================================================================
//  ИГРОВЫЕ ПАРАМЕТРЫ — всё, что нужно крутить, лежит здесь
// ============================================================================

const CONFIG = {
  // --- геометрия мира ---
  ROOM_W: 960,          // ширина комнаты (= ширина экрана)
  ROOM_H: 640,          // высота комнаты (= высота экрана)
  WALL: 40,             // толщина стен
  CORRIDOR_LEN: 260,    // длина прохода между комнатами
  CORRIDOR_H: 130,      // ширина (узость) прохода
  ROOM_COUNT: 12,

  ACTIVATION_DIST: 1000, // на каком расстоянии от игрока враги оживают
  CAMERA_LERP: 6,        // плавность камеры

  // --- игрок ---
  PLAYER: {
    hp: 75,
    speed: 190,          // максимальная скорость
    accel: 620,          // разгон (чем меньше, тем дольше набирает скорость)
    brake: 520,          // торможение (чем меньше, тем дольше катится по инерции)
    arriveRadius: 10,    // с какого расстояния до точки считаем, что дошли, и отпускаем газ
    wallFriction: 0.94,  // сколько скорости остаётся при скольжении вдоль стены
    radius: 14,
    recruitRadius: 70,   // на каком расстоянии можно подобрать союзника
  },

  // --- фонарь игрока (круг обзора) ---
  VISION: {
    radius: 300,         // радиус света: дальше игрок ничего не видит
    flicker: 10,         // амплитуда дрожания пламени
    flickerSpeed: 3.2,   // скорость дрожания
    innerRatio: 0.72,    // до какой доли радиуса свет ровный, дальше затухает
    darkness: 0.985,     // насколько черно за границей света (0..1)
  },

  // --- регенерация врагов ---
  ENEMY_REGEN: {
    delay: 10,           // сколько секунд враг не получает урона, прежде чем начать лечиться
    fullTime: 2.5,       // за сколько секунд восстанавливается полное HP
  },

  // --- шипы на полу ---
  SPIKES: {
    damage: 4,           // урон за одно срабатывание
    interval: 0.6,       // как часто колет, пока стоишь на шипах
  },

  // --- случайные блуждания врагов по своей комнате ---
  WANDER: {
    shooterSpeed: 45,
    bullSpeed: 42,
    pauseMin: 0.5,       // пауза между перебежками
    pauseMax: 2.2,
    arrive: 14,          // с какого расстояния считаем, что дошёл до своей точки
  },

  // --- цепочка ---
  CHAIN: {
    maxAllies: 5,        // сколько союзников можно тащить за собой
    spacing: 36,         // дистанция между звеньями цепочки
    trailStep: 5,        // шаг записи следа игрока
    followSpeed: 200,    // базовая скорость догоняющего звена
    catchUpGain: 8,      // множитель "подтягивания" отставшего звена
  },

  // --- союзники ---
  ALLIES: {
    crossbow: { name: 'Арбалет',  hp: 55, radius: 13, range: 330, cooldown: 1.0, dmg: 7, projSpeed: 430, projRadius: 4 },
    shotgun:  { name: 'Дробовик', hp: 61, radius: 14, range: 165, cooldown: 1.3, dmg: 4, projSpeed: 380, projRadius: 4, pellets: 4, spread: 0.45 },
    medic:    { name: 'Медик',    hp: 49, radius: 13, range: 220, cooldown: 2.2, heal: 9 },
  },

  // --- враги ---
  ENEMIES: {
    shooter: { name: 'Стрелок', hp: 22, radius: 14, range: 340, cooldown: 1.7, dmg: 5, projSpeed: 300, projRadius: 4 },
    bull:    { name: 'Бычок',   hp: 44, radius: 18, dmg: 12, aggro: 430, walkSpeed: 55,
               telegraph: 0.7, chargeSpeed: 540, chargeMaxDist: 720, chargeCooldown: 1.6,
               chargeStartSpeed: 150,   // с какой скорости начинается рывок
               chargeAccel: 780,        // разгон во время рывка
               chargeBrake: 620,        // торможение после того, как кого-то переехал
               chargeStopSpeed: 110,    // на какой скорости рывок заканчивается
               repeatDamage: 0.5,       // множитель урона для всех целей после первой
               knockoutChance: 0.3,     // шанс выбить из цепочки того, кого переехал
               knockbackSpeed: 380,     // с какой силой отбрасывает выбитого
               knockbackFriction: 620 },
    tower:   { name: 'Катапульта', hp: 55, radius: 20, range: 430, cooldown: 3.2,
               dmg: 9,                  // урон в эпицентре
               blastRadius: 95,         // радиус поражения
               flightTime: 1.5 },       // сколько снаряд летит до земли
    mine:    { name: 'Мина', hp: 6, radius: 13,
               detectRadius: 110,       // с какого расстояния цепочка её замечает
               triggerRadius: 18,       // с какого расстояния срабатывает под ногами
               dmg: 20,                 // урон в эпицентре взрыва
               blastRadius: 80 },
  },
};

// ============================================================================
//  ПЛАН КОМНАТ
//  Координаты — доли от внутреннего размера комнаты (0..1).
//  pillars / pits / spikes: [cx, cy, w, h] — w,h тоже в долях.
//  enemies / allies: [тип, cx, cy]
//  Стены и колонны блокируют движение и выстрелы, пропасти — только движение,
//  шипы не блокируют ничего, но колют всех, кто на них стоит.
// ============================================================================

const ROOM_PLANS = [
  { // 1 — тихая комната: первый союзник и безопасное знакомство с шипами
    pillars: [[0.30, 0.30, 0.10, 0.10], [0.70, 0.70, 0.10, 0.10]],
    pits: [],
    spikes: [[0.50, 0.78, 0.14, 0.10]],
    enemies: [],
    allies: [['crossbow', 0.62, 0.35]],
  },
  { // 2 — знакомство со стрелками
    pillars: [[0.45, 0.50, 0.08, 0.40]],
    pits: [],
    spikes: [],
    enemies: [['shooter', 0.78, 0.30], ['shooter', 0.70, 0.78]],
    allies: [],
  },
  { // 3 — пропасть и трое стрелков, и сразу двое союзников
    pillars: [[0.35, 0.18, 0.10, 0.10]],
    pits: [[0.55, 0.50, 0.26, 0.22]],
    spikes: [],
    enemies: [['shooter', 0.80, 0.25], ['shooter', 0.80, 0.75], ['shooter', 0.62, 0.12]],
    allies: [['medic', 0.20, 0.55], ['shotgun', 0.22, 0.25]],
  },
  { // 4 — первый бычок и первые опасные шипы по центру
    pillars: [[0.50, 0.22, 0.30, 0.07], [0.50, 0.78, 0.30, 0.07]],
    pits: [],
    spikes: [[0.50, 0.50, 0.18, 0.16]],
    enemies: [['bull', 0.75, 0.50], ['shooter', 0.88, 0.18], ['shooter', 0.88, 0.82]],
    allies: [],
  },
  { // 5 — минное поле: врагов мало, зато пройти насквозь нечем, кроме аккуратности
    pillars: [[0.30, 0.28, 0.08, 0.08], [0.30, 0.72, 0.08, 0.08], [0.72, 0.50, 0.07, 0.26]],
    pits: [],
    spikes: [],
    mines: [[0.34, 0.20], [0.34, 0.50], [0.34, 0.80],
            [0.46, 0.12], [0.46, 0.32], [0.46, 0.68], [0.46, 0.88],
            [0.58, 0.22], [0.58, 0.50], [0.58, 0.78],
            [0.68, 0.14], [0.68, 0.86],
            [0.82, 0.32], [0.82, 0.68]],
    enemies: [['shooter', 0.92, 0.22], ['shooter', 0.92, 0.78], ['bull', 0.88, 0.50]],
    allies: [],
  },
  { // 6 — башня под прикрытием стрелков
    pillars: [[0.40, 0.50, 0.07, 0.34]],
    pits: [[0.72, 0.20, 0.20, 0.16]],
    spikes: [],
    enemies: [['tower', 0.85, 0.50], ['shooter', 0.60, 0.20], ['shooter', 0.60, 0.80],
              ['shooter', 0.25, 0.50]],
    allies: [],
  },
  { // 7 — бычки на открытом месте и шипы посередине
    pillars: [[0.30, 0.65, 0.10, 0.10], [0.66, 0.30, 0.10, 0.10]],
    pits: [],
    spikes: [[0.50, 0.50, 0.20, 0.12]],
    enemies: [['bull', 0.60, 0.72], ['bull', 0.82, 0.35], ['shooter', 0.90, 0.75],
              ['shooter', 0.45, 0.18]],
    allies: [],
  },
  { // 8 — смешанная комната и подкрепление
    pillars: [[0.52, 0.50, 0.07, 0.30]],
    pits: [[0.30, 0.20, 0.18, 0.14]],
    spikes: [[0.70, 0.85, 0.20, 0.08]],
    enemies: [['tower', 0.88, 0.30], ['bull', 0.72, 0.65], ['bull', 0.40, 0.75],
              ['shooter', 0.86, 0.80], ['shooter', 0.70, 0.20]],
    allies: [['crossbow', 0.18, 0.70], ['medic', 0.18, 0.35]],
  },
  { // 9 — перекрёстный огонь двух катапульт, пропасть и шипы на обходе
    pillars: [[0.50, 0.25, 0.22, 0.07], [0.50, 0.75, 0.22, 0.07]],
    pits: [[0.50, 0.50, 0.22, 0.18]],
    spikes: [[0.25, 0.50, 0.14, 0.30]],
    enemies: [['tower', 0.85, 0.20], ['tower', 0.85, 0.80], ['shooter', 0.70, 0.50],
              ['shooter', 0.35, 0.82], ['shooter', 0.35, 0.18], ['bull', 0.65, 0.35]],
    allies: [],
  },
  { // 10 — плотный замес
    pillars: [[0.35, 0.35, 0.09, 0.09], [0.35, 0.65, 0.09, 0.09]],
    pits: [[0.66, 0.50, 0.16, 0.30]],
    spikes: [[0.50, 0.12, 0.22, 0.10]],
    enemies: [['tower', 0.88, 0.50], ['bull', 0.55, 0.25], ['bull', 0.55, 0.75],
              ['bull', 0.22, 0.50], ['shooter', 0.82, 0.18], ['shooter', 0.82, 0.82],
              ['shooter', 0.48, 0.45]],
    allies: [],
  },
  { // 11 — предпоследняя: всё сразу
    pillars: [[0.42, 0.20, 0.08, 0.22], [0.42, 0.80, 0.08, 0.22]],
    pits: [[0.62, 0.50, 0.18, 0.26]],
    spikes: [[0.28, 0.50, 0.14, 0.24]],
    enemies: [['tower', 0.90, 0.25], ['tower', 0.90, 0.75], ['bull', 0.62, 0.20],
              ['bull', 0.62, 0.80], ['bull', 0.50, 0.38], ['shooter', 0.78, 0.50],
              ['shooter', 0.45, 0.50], ['shooter', 0.30, 0.85], ['shooter', 0.30, 0.15]],
    allies: [],
  },
  { // 12 — голый загон с десятью бычками: никаких колонн, только полосы шипов
    pillars: [],
    pits: [],
    spikes: [[0.38, 0.50, 0.10, 0.70], [0.78, 0.50, 0.10, 0.70]],
    enemies: [['bull', 0.50, 0.20], ['bull', 0.50, 0.50], ['bull', 0.50, 0.80],
              ['bull', 0.62, 0.32], ['bull', 0.62, 0.68], ['bull', 0.68, 0.50],
              ['bull', 0.88, 0.18], ['bull', 0.88, 0.50], ['bull', 0.88, 0.82],
              ['bull', 0.94, 0.35]],
    allies: [],
  },
];

const COLORS = {
  floor: '#1b1b20', wall: '#4a4a55', pillar: '#5d5d6b', pit: '#101018', pitEdge: '#4a4a5e',
  spikeFloor: '#33202a', spikeTeeth: '#9c4a5c', warning: '#b8863c', mine: '#e0d44a',
  player: '#63d2ff', crossbow: '#8ce27a', shotgun: '#e2c05a', medic: '#e07ac0',
  neutral: '#6b6b78', enemy: '#e06060', bull: '#e08040', tower: '#c05ce0',
  allyShot: '#d8f8b0', enemyShot: '#ff9a7a', blast: '#ff8a3c',
  hpBack: '#2a2a32', hpAlly: '#7ae07a', hpEnemy: '#e07a7a',
};

// ============================================================================
//  УТИЛИТЫ
// ============================================================================

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function circleRectOverlap(x, y, r, rect) {
  const cx = clamp(x, rect.x, rect.x + rect.w);
  const cy = clamp(y, rect.y, rect.y + rect.h);
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

// выталкивает круг из прямоугольника и возвращает нормаль выталкивания
function resolveCircleRect(e, rect) {
  const cx = clamp(e.x, rect.x, rect.x + rect.w);
  const cy = clamp(e.y, rect.y, rect.y + rect.h);
  const dx = e.x - cx, dy = e.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 > e.r * e.r) return null;

  if (d2 > 1e-6) {
    const d = Math.sqrt(d2);
    const nx = dx / d, ny = dy / d;
    e.x = cx + nx * e.r;
    e.y = cy + ny * e.r;
    return { x: nx, y: ny };
  }

  const left = e.x - rect.x, right = rect.x + rect.w - e.x;
  const top = e.y - rect.y, bottom = rect.y + rect.h - e.y;
  const m = Math.min(left, right, top, bottom);
  if (m === left) { e.x = rect.x - e.r; return { x: -1, y: 0 }; }
  if (m === right) { e.x = rect.x + rect.w + e.r; return { x: 1, y: 0 }; }
  if (m === top) { e.y = rect.y - e.r; return { x: 0, y: -1 }; }
  e.y = rect.y + rect.h + e.r;
  return { x: 0, y: 1 };
}

// двигает круг и возвращает суммарную нормаль столкновений (или null)
function moveAndCollide(e, dx, dy, blockers) {
  e.x += dx; e.y += dy;
  let nx = 0, ny = 0, hit = false;
  for (let pass = 0; pass < 2; pass++) {
    for (const rect of blockers) {
      const n = resolveCircleRect(e, rect);
      if (!n) continue;
      hit = true;
      nx += n.x; ny += n.y;
    }
  }
  if (!hit) return null;
  const len = Math.hypot(nx, ny);
  return len > 1e-6 ? { x: nx / len, y: ny / len } : { x: 0, y: 0 };
}

// убирает из скорости составляющую, направленную в стену, оставляя движение вдоль неё
function slideAlongWall(unit, normal, friction) {
  const into = unit.vx * normal.x + unit.vy * normal.y;
  if (into < 0) {
    unit.vx -= normal.x * into;
    unit.vy -= normal.y * into;
  }
  unit.vx *= friction;
  unit.vy *= friction;
}

// пересечение отрезка с прямоугольником (slab method)
function segmentHitsRect(x1, y1, x2, y2, rect) {
  const dx = x2 - x1, dy = y2 - y1;
  let t0 = 0, t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - rect.x, rect.x + rect.w - x1, y1 - rect.y, rect.y + rect.h - y1];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-9) { if (q[i] < 0) return false; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}

function hasLineOfSight(a, b) {
  for (const rect of world.sightBlockers) {
    if (segmentHitsRect(a.x, a.y, b.x, b.y, rect)) return false;
  }
  return true;
}

// ============================================================================
//  МИР
// ============================================================================

const world = {
  walls: [], pillars: [], pits: [], spikes: [], floors: [], warnings: [],
  moveBlockers: [], sightBlockers: [],
  width: 0, height: CONFIG.ROOM_H,
};

function roomOriginX(i) { return i * (CONFIG.ROOM_W + CONFIG.CORRIDOR_LEN); }

function roomInterior(i) {
  const ox = roomOriginX(i), W = CONFIG.WALL;
  return { x: ox + W, y: W, w: CONFIG.ROOM_W - 2 * W, h: CONFIG.ROOM_H - 2 * W };
}

function localToWorld(i, cx, cy) {
  const r = roomInterior(i);
  return { x: r.x + cx * r.w, y: r.y + cy * r.h };
}

function buildWorld() {
  world.walls = []; world.pillars = []; world.pits = []; world.spikes = [];
  world.floors = []; world.warnings = [];
  const { ROOM_W, ROOM_H, WALL, CORRIDOR_LEN, CORRIDOR_H, ROOM_COUNT } = CONFIG;
  const gapTop = (ROOM_H - CORRIDOR_H) / 2;
  const gapBottom = (ROOM_H + CORRIDOR_H) / 2;

  for (let i = 0; i < ROOM_COUNT; i++) {
    const ox = roomOriginX(i);
    const last = i === ROOM_COUNT - 1;

    world.floors.push({ x: ox + WALL, y: WALL, w: ROOM_W - 2 * WALL, h: ROOM_H - 2 * WALL });
    world.walls.push({ x: ox, y: 0, w: ROOM_W, h: WALL });
    world.walls.push({ x: ox, y: ROOM_H - WALL, w: ROOM_W, h: WALL });

    // левая стена
    if (i === 0) world.walls.push({ x: ox, y: 0, w: WALL, h: ROOM_H });
    else {
      world.walls.push({ x: ox, y: 0, w: WALL, h: gapTop });
      world.walls.push({ x: ox, y: gapBottom, w: WALL, h: ROOM_H - gapBottom });
    }
    // правая стена
    const rx = ox + ROOM_W - WALL;
    if (last) world.walls.push({ x: rx, y: 0, w: WALL, h: ROOM_H });
    else {
      world.walls.push({ x: rx, y: 0, w: WALL, h: gapTop });
      world.walls.push({ x: rx, y: gapBottom, w: WALL, h: ROOM_H - gapBottom });
    }

    // проход направо
    if (!last) {
      const cx0 = ox + ROOM_W;
      world.floors.push({ x: cx0, y: gapTop, w: CORRIDOR_LEN, h: CORRIDOR_H });
      world.walls.push({ x: cx0, y: gapTop - WALL, w: CORRIDOR_LEN, h: WALL });
      world.walls.push({ x: cx0, y: gapBottom, w: CORRIDOR_LEN, h: WALL });
    }

    // препятствия комнаты
    const plan = ROOM_PLANS[i];
    const inner = roomInterior(i);
    for (const [cx, cy, w, h] of plan.pillars) {
      world.pillars.push({
        x: inner.x + (cx - w / 2) * inner.w, y: inner.y + (cy - h / 2) * inner.h,
        w: w * inner.w, h: h * inner.h,
      });
    }
    for (const [cx, cy, w, h] of plan.pits) {
      world.pits.push({
        x: inner.x + (cx - w / 2) * inner.w, y: inner.y + (cy - h / 2) * inner.h,
        w: w * inner.w, h: h * inner.h,
      });
    }
    for (const [cx, cy, w, h] of plan.spikes) {
      world.spikes.push({
        x: inner.x + (cx - w / 2) * inner.w, y: inner.y + (cy - h / 2) * inner.h,
        w: w * inner.w, h: h * inner.h,
      });
    }
    // в заминированных комнатах на полу у входа нарисованы предупреждающие знаки
    if ((plan.mines || []).length) {
      for (const [cx, cy] of [[0.09, 0.30], [0.09, 0.70]]) {
        world.warnings.push(localToWorld(i, cx, cy));
      }
    }
  }

  world.width = ROOM_COUNT * (ROOM_W + CORRIDOR_LEN) - CORRIDOR_LEN;
  world.sightBlockers = world.walls.concat(world.pillars);
  world.moveBlockers = world.sightBlockers.concat(world.pits);
}

// ============================================================================
//  СОСТОЯНИЕ ИГРЫ
// ============================================================================

let player, allies, neutrals, downed, enemies, projectiles, effects, trail;
let camera = { x: 0, y: 0 };
let status = 'play'; // play | dead | win
let lightTime = 0;
let visibleEnemies = [];

function makeUnit(kind, type, x, y, cfg) {
  return {
    kind, type, x, y, vx: 0, vy: 0, r: cfg.radius, hp: cfg.hp, maxHp: cfg.hp,
    cd: Math.random() * (cfg.cooldown || 1), facing: 0, regenTimer: 0, cfg,
  };
}

function resetGame() {
  buildWorld();
  allies = []; neutrals = []; downed = []; enemies = []; projectiles = []; effects = []; trail = [];
  status = 'play';
  lightTime = 0;
  visibleEnemies = [];

  const spawn = localToWorld(0, 0.12, 0.5);
  player = {
    kind: 'player', type: 'player', x: spawn.x, y: spawn.y, vx: 0, vy: 0,
    r: CONFIG.PLAYER.radius, hp: CONFIG.PLAYER.hp, maxHp: CONFIG.PLAYER.hp, facing: 0,
    target: null, cfg: CONFIG.PLAYER,
  };

  ROOM_PLANS.forEach((plan, i) => {
    for (const [type, cx, cy] of plan.allies) {
      const p = localToWorld(i, cx, cy);
      neutrals.push(makeUnit('neutral', type, p.x, p.y, CONFIG.ALLIES[type]));
    }
    for (const [type, cx, cy] of plan.enemies) {
      const p = localToWorld(i, cx, cy);
      const e = makeUnit('enemy', type, p.x, p.y, CONFIG.ENEMIES[type]);
      e.room = i;
      if (type === 'bull') { e.state = 'idle'; e.timer = 0; e.travelled = 0; e.dir = { x: 0, y: 0 }; }
      enemies.push(e);
    }
    for (const [cx, cy] of plan.mines || []) {
      const p = localToWorld(i, cx, cy);
      const m = makeUnit('enemy', 'mine', p.x, p.y, CONFIG.ENEMIES.mine);
      m.room = i;
      m.revealed = false;
      enemies.push(m);
    }
  });

  camera.x = clamp(player.x - CONFIG.ROOM_W / 2, 0, world.width - CONFIG.ROOM_W);
  camera.y = 0;
}

function chainUnits() { return [player].concat(allies); }

// радиус фонаря с лёгким дрожанием пламени
function lightRadius() {
  const v = CONFIG.VISION;
  return v.radius + Math.sin(lightTime * v.flickerSpeed) * v.flicker
                  + Math.sin(lightTime * v.flickerSpeed * 2.7) * v.flicker * 0.5;
}

function isLit(u) { return dist(player, u) <= lightRadius(); }

function currentRoom() {
  const step = CONFIG.ROOM_W + CONFIG.CORRIDOR_LEN;
  return clamp(Math.floor((player.x + CONFIG.CORRIDOR_LEN / 2) / step), 0, CONFIG.ROOM_COUNT - 1);
}

// ============================================================================
//  ВВОД
// ============================================================================

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let mouseDown = false;

function screenToWorld(ev) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (ev.clientX - rect.left) * (canvas.width / rect.width) + camera.x,
    y: (ev.clientY - rect.top) * (canvas.height / rect.height) + camera.y,
  };
}

canvas.addEventListener('mousedown', (ev) => {
  if (ev.button !== 0) return;
  mouseDown = true;
  player.target = screenToWorld(ev);
});
canvas.addEventListener('mousemove', (ev) => { if (mouseDown) player.target = screenToWorld(ev); });
window.addEventListener('mouseup', () => { mouseDown = false; });
canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

window.addEventListener('keydown', (ev) => {
  if (ev.code === 'Space') { ev.preventDefault(); tryRecruit(); }
  if (ev.code === 'KeyR') resetGame();
});
document.getElementById('restart').addEventListener('click', (ev) => { resetGame(); ev.currentTarget.blur(); });

// ближайший, кого можно подобрать: нейтрал или выбитый из цепочки союзник
function nearestPickup() {
  let best = null, bestD = CONFIG.PLAYER.recruitRadius;
  for (const u of neutrals.concat(downed)) {
    const d = dist(player, u);
    if (d < bestD) { bestD = d; best = u; }
  }
  return best;
}

function tryRecruit() {
  if (status !== 'play') return;
  if (allies.length >= CONFIG.CHAIN.maxAllies) return;
  const u = nearestPickup();
  if (!u) return;
  removeFrom(u.kind === 'downed' ? downed : neutrals, u);
  u.kind = 'ally';
  u.cd = 0;
  u.vx = 0; u.vy = 0;
  allies.push(u);
}

// ============================================================================
//  СЛЕД ЦЕПОЧКИ
// ============================================================================

function pushTrail() {
  const head = trail[0];
  if (!head || Math.hypot(head.x - player.x, head.y - player.y) > CONFIG.CHAIN.trailStep) {
    trail.unshift({ x: player.x, y: player.y });
    const maxLen = Math.ceil((CONFIG.CHAIN.maxAllies * CONFIG.CHAIN.spacing + 200) / CONFIG.CHAIN.trailStep);
    if (trail.length > maxLen) trail.pop();
  }
}

function trailPointAt(distBack) {
  let prev = { x: player.x, y: player.y };
  let acc = 0;
  for (const p of trail) {
    const seg = Math.hypot(p.x - prev.x, p.y - prev.y);
    if (acc + seg >= distBack) {
      const t = seg > 0 ? (distBack - acc) / seg : 0;
      return { x: prev.x + (p.x - prev.x) * t, y: prev.y + (p.y - prev.y) * t };
    }
    acc += seg;
    prev = p;
  }
  return prev;
}

// ============================================================================
//  БОЙ
// ============================================================================

function spawnProjectile(from, tx, ty, speed, dmg, team, radius) {
  const a = Math.atan2(ty - from.y, tx - from.x);
  projectiles.push({
    x: from.x, y: from.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
    dmg, team, r: radius, life: 3,
  });
}

// навесной снаряд катапульты: летит по дуге в точку, где цель была в момент выстрела
function spawnMortar(from, tx, ty) {
  projectiles.push({
    kind: 'mortar', team: 'enemy', r: 5,
    sx: from.x, sy: from.y, x: from.x, y: from.y,
    tx, ty, t: 0, flight: from.cfg.flightTime,
    dmg: from.cfg.dmg, blast: from.cfg.blastRadius,
  });
}

function explodeMortar(p) {
  for (const u of chainUnits().concat(downed)) {
    if (dist(p, u) < p.blast + u.r) damageUnit(u, p.dmg);
  }
  effects.push({ type: 'blast', x: p.tx, y: p.ty, r: p.blast, life: 0.35 });
}

function spreadAngle(index, count, spread) {
  return count > 1 ? (index / (count - 1) - 0.5) * spread : 0;
}

function nearestTarget(from, list, range) {
  let best = null, bestD = range;
  for (const t of list) {
    const d = dist(from, t);
    if (d < bestD && hasLineOfSight(from, t)) { bestD = d; best = t; }
  }
  return best;
}

function removeFrom(list, u) {
  const i = list.indexOf(u);
  if (i >= 0) list.splice(i, 1);
}

function damageUnit(u, dmg) {
  if (u.hp <= 0) return;
  u.hp -= dmg;
  u.regenTimer = 0;
  if (u.hp <= 0) {
    if (u.kind === 'player') status = 'dead';
    else if (u.kind === 'ally') removeFrom(allies, u);
    else if (u.kind === 'enemy') removeFrom(enemies, u);
    else if (u.kind === 'neutral') removeFrom(neutrals, u);
  }
}

// мины: обнаруживаются вблизи, взрываются под ногами цепочки, простреливаются союзниками
function updateMines() {
  const chain = chainUnits();
  for (const m of enemies.slice()) {
    if (m.type !== 'mine') continue;
    for (const u of chain) {
      const d = dist(m, u);
      if (d < m.cfg.detectRadius) m.revealed = true;
      if (d < m.cfg.triggerRadius + u.r) { explodeMine(m); break; }
    }
  }
}

function explodeMine(m) {
  removeFrom(enemies, m);
  effects.push({ type: 'blast', x: m.x, y: m.y, r: m.cfg.blastRadius, life: 0.35 });
  for (const u of chainUnits().concat(downed, enemies)) {
    if (dist(m, u) < m.cfg.blastRadius + u.r) damageUnit(u, m.cfg.dmg);
  }
}

// шипы колют всех подряд, пока с них не сойдут
function applySpikes(dt) {
  const victims = chainUnits().concat(downed, enemies);
  for (const u of victims) {
    let onSpikes = false;
    for (const rect of world.spikes) {
      if (circleRectOverlap(u.x, u.y, u.r * 0.6, rect)) { onSpikes = true; break; }
    }
    if (!onSpikes) { u.spikeCd = 0; continue; }
    u.spikeCd = (u.spikeCd || 0) - dt;
    if (u.spikeCd <= 0) {
      u.spikeCd = CONFIG.SPIKES.interval;
      damageUnit(u, CONFIG.SPIKES.damage);
    }
  }
}

function standsOnSpikes(u) {
  for (const rect of world.spikes) {
    if (circleRectOverlap(u.x, u.y, u.r * 0.6, rect)) return true;
  }
  return false;
}

function freeSpotInRoom(e) {
  const room = roomInterior(e.room);
  const pad = e.r + 12;
  let fallback = null;
  // враги не выбирают точки на шипах и в препятствиях, чтобы не убиваться о них сами
  for (let tries = 0; tries < 10; tries++) {
    const p = {
      x: room.x + pad + Math.random() * (room.w - pad * 2),
      y: room.y + pad + Math.random() * (room.h - pad * 2),
      r: e.r,
    };
    if (!fallback) fallback = p;
    if (standsOnSpikes(p)) continue;
    if (world.moveBlockers.some((rect) => circleRectOverlap(p.x, p.y, p.r, rect))) continue;
    return p;
  }
  return fallback;
}

// враг, оказавшийся на шипах не в рывке, сходит с них кратчайшим путём
function stepOffSpikes(e, dt, speed) {
  let rect = null;
  for (const r of world.spikes) {
    if (circleRectOverlap(e.x, e.y, e.r * 0.6, r)) { rect = r; break; }
  }
  if (!rect) return false;

  const left = e.x - rect.x, right = rect.x + rect.w - e.x;
  const top = e.y - rect.y, bottom = rect.y + rect.h - e.y;
  const m = Math.min(left, right, top, bottom);
  const dx = m === left ? -1 : m === right ? 1 : 0;
  const dy = m === top ? -1 : m === bottom ? 1 : 0;
  moveAndCollide(e, dx * speed * dt, dy * speed * dt, world.moveBlockers);
  e.wanderTarget = null;
  return true;
}

// случайные перебежки врага в пределах своей комнаты
function wanderStep(e, dt, speed) {
  if (e.pauseTimer > 0 && !standsOnSpikes(e)) { e.pauseTimer -= dt; return; }

  if (!e.wanderTarget || dist(e, e.wanderTarget) < CONFIG.WANDER.arrive) {
    e.wanderTarget = freeSpotInRoom(e);
    e.pauseTimer = standsOnSpikes(e) ? 0
      : CONFIG.WANDER.pauseMin + Math.random() * (CONFIG.WANDER.pauseMax - CONFIG.WANDER.pauseMin);
    return;
  }

  const dx = e.wanderTarget.x - e.x, dy = e.wanderTarget.y - e.y;
  const d = Math.hypot(dx, dy);
  const step = Math.min(d, speed * dt);
  const from = { x: e.x, y: e.y };
  moveAndCollide(e, (dx / d) * step, (dy / d) * step, world.moveBlockers);

  // вдоль стены враг скользит, и только застряв окончательно выбирает новую точку
  e.stuckTimer = dist(e, from) < step * 0.35 ? (e.stuckTimer || 0) + dt : 0;
  if (e.stuckTimer > 0.5) {
    e.wanderTarget = null;
    e.stuckTimer = 0;
  }
}

// бычок выбивает союзника из цепочки: тот отлетает и лежит, пока его не подберут
function knockOutAlly(a, angle, speed) {
  removeFrom(allies, a);
  a.kind = 'downed';
  a.vx = Math.cos(angle) * speed;
  a.vy = Math.sin(angle) * speed;
  a.cd = 0;
  downed.push(a);
}

function updateDowned(d, dt) {
  const sp = Math.hypot(d.vx, d.vy);
  if (sp < 1) { d.vx = 0; d.vy = 0; return; }
  const drop = CONFIG.ENEMIES.bull.knockbackFriction * dt;
  const left = Math.max(0, sp - drop);
  d.vx = (d.vx / sp) * left;
  d.vy = (d.vy / sp) * left;
  moveAndCollide(d, d.vx * dt, d.vy * dt, world.moveBlockers);
}

function updateAlly(a, dt, i) {
  const target = trailPointAt((i + 1) * CONFIG.CHAIN.spacing);
  const dx = target.x - a.x, dy = target.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d > 0.5) {
    const speed = Math.max(CONFIG.CHAIN.followSpeed, d * CONFIG.CHAIN.catchUpGain);
    const step = Math.min(d, speed * dt);
    moveAndCollide(a, (dx / d) * step, (dy / d) * step, world.moveBlockers);
  }

  a.cd -= dt;
  if (a.cd > 0) return;

  if (a.type === 'medic') {
    let worst = null;
    for (const u of chainUnits()) {
      if (u.hp >= u.maxHp) continue;
      if (dist(a, u) > a.cfg.range) continue;
      if (!worst || u.hp / u.maxHp < worst.hp / worst.maxHp) worst = u;
    }
    if (worst) {
      worst.hp = Math.min(worst.maxHp, worst.hp + a.cfg.heal);
      a.cd = a.cfg.cooldown;
      a.facing = Math.atan2(worst.y - a.y, worst.x - a.x);
      effects.push({ type: 'beam', x1: a.x, y1: a.y, x2: worst.x, y2: worst.y, life: 0.25, color: COLORS.medic });
    }
    return;
  }

  // стрелять можно только по тому, что освещает фонарь игрока
  const foe = nearestTarget(a, visibleEnemies, a.cfg.range);
  if (!foe) return;
  a.facing = Math.atan2(foe.y - a.y, foe.x - a.x);
  if (a.type === 'shotgun') {
    for (let p = 0; p < a.cfg.pellets; p++) {
      const ang = a.facing + spreadAngle(p, a.cfg.pellets, a.cfg.spread);
      spawnProjectile(a, a.x + Math.cos(ang) * 100, a.y + Math.sin(ang) * 100,
        a.cfg.projSpeed, a.cfg.dmg, 'ally', a.cfg.projRadius);
    }
  } else {
    spawnProjectile(a, foe.x, foe.y, a.cfg.projSpeed, a.cfg.dmg, 'ally', a.cfg.projRadius);
  }
  a.cd = a.cfg.cooldown;
}

function updateEnemy(e, dt) {
  if (e.type === 'mine') return; // мина ничего не делает сама, ей занимается updateMines

  // регенерация: если врага давно не задевали, он отлечивается до полного
  e.regenTimer += dt;
  if (e.regenTimer > CONFIG.ENEMY_REGEN.delay && e.hp < e.maxHp) {
    e.hp = Math.min(e.maxHp, e.hp + (e.maxHp / CONFIG.ENEMY_REGEN.fullTime) * dt);
  }

  if (Math.abs(e.x - player.x) > CONFIG.ACTIVATION_DIST) return;
  const chain = chainUnits();

  if (e.type === 'bull') {
    updateBull(e, dt, chain);
    return;
  }

  if (e.type === 'shooter' && !stepOffSpikes(e, dt, CONFIG.WANDER.shooterSpeed * 1.6)) {
    wanderStep(e, dt, CONFIG.WANDER.shooterSpeed);
  }

  e.cd -= dt;
  const foe = nearestTarget(e, chain, e.cfg.range);
  if (!foe) return;
  e.facing = Math.atan2(foe.y - e.y, foe.x - e.x);
  if (e.cd > 0) return;

  if (e.type === 'tower') {
    spawnMortar(e, foe.x, foe.y);
  } else {
    spawnProjectile(e, foe.x, foe.y, e.cfg.projSpeed, e.cfg.dmg, 'enemy', e.cfg.projRadius);
  }
  e.cd = e.cfg.cooldown;
}

function updateBull(e, dt, chain) {
  const foe = nearestTarget(e, chain, e.cfg.aggro);

  if (e.state === 'idle') {
    if (stepOffSpikes(e, dt, CONFIG.WANDER.bullSpeed * 1.6)) return;
    if (!foe) { wanderStep(e, dt, CONFIG.WANDER.bullSpeed); return; }
    e.facing = Math.atan2(foe.y - e.y, foe.x - e.x);
    moveAndCollide(e, Math.cos(e.facing) * e.cfg.walkSpeed * dt,
      Math.sin(e.facing) * e.cfg.walkSpeed * dt, world.moveBlockers);
    e.timer -= dt;
    if (e.timer <= 0) { e.state = 'telegraph'; e.timer = e.cfg.telegraph; }
    return;
  }

  if (e.state === 'telegraph') {
    if (foe) e.facing = Math.atan2(foe.y - e.y, foe.x - e.x);
    e.timer -= dt;
    if (e.timer <= 0) {
      e.state = 'charge';
      e.dir = { x: Math.cos(e.facing), y: Math.sin(e.facing) };
      e.travelled = 0;
      e.hitThisCharge = [];
      e.chargeSpeed = e.cfg.chargeStartSpeed;
    }
    return;
  }

  // рывок: сначала разгон, после первого столкновения бычок начинает тормозить
  const cfg = e.cfg;
  e.chargeSpeed += (e.hitThisCharge.length ? -cfg.chargeBrake : cfg.chargeAccel) * dt;
  e.chargeSpeed = Math.min(e.chargeSpeed, cfg.chargeSpeed);

  const step = e.chargeSpeed * dt;
  const normal = moveAndCollide(e, e.dir.x * step, e.dir.y * step, world.moveBlockers);
  e.travelled += step;

  // лобовой удар в стену обрывает рывок, косой — только сворачивает бычка вдоль неё
  let crashed = false;
  if (normal) {
    const into = e.dir.x * normal.x + e.dir.y * normal.y;
    if (into < -0.5) crashed = true;
    else {
      e.dir.x -= normal.x * into;
      e.dir.y -= normal.y * into;
      const len = Math.hypot(e.dir.x, e.dir.y) || 1;
      e.dir.x /= len; e.dir.y /= len;
      e.facing = Math.atan2(e.dir.y, e.dir.x);
    }
  }

  // проезжает насквозь: первому достаётся полный урон, остальным — половинный
  for (const u of chain.concat(downed)) {
    if (e.hitThisCharge.includes(u)) continue;
    if (dist(e, u) >= e.r + u.r) continue;
    const dmg = e.hitThisCharge.length ? cfg.dmg * cfg.repeatDamage : cfg.dmg;
    e.hitThisCharge.push(u);
    damageUnit(u, dmg);
    if (u.kind === 'ally' && u.hp > 0 && Math.random() < cfg.knockoutChance) {
      knockOutAlly(u, Math.atan2(u.y - e.y, u.x - e.x), cfg.knockbackSpeed);
    }
  }

  if (crashed || e.travelled > cfg.chargeMaxDist || e.chargeSpeed < cfg.chargeStopSpeed) {
    e.state = 'idle';
    e.timer = cfg.chargeCooldown;
  }
}

function updateProjectiles(dt) {
  const chain = chainUnits();
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];

    // снаряд катапульты летит поверх стен и взрывается в точке прицеливания
    if (p.kind === 'mortar') {
      p.t += dt;
      const k = Math.min(1, p.t / p.flight);
      p.x = p.sx + (p.tx - p.sx) * k;
      p.y = p.sy + (p.ty - p.sy) * k;
      if (k >= 1) { explodeMortar(p); projectiles.splice(i, 1); }
      continue;
    }

    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    let dead = p.life <= 0;

    if (!dead) {
      for (const rect of world.sightBlockers) {
        if (circleRectOverlap(p.x, p.y, p.r, rect)) { dead = true; break; }
      }
    }
    if (!dead) {
      const targets = p.team === 'ally' ? enemies : chain;
      for (const t of targets) {
        if (dist(p, t) < p.r + t.r) { damageUnit(t, p.dmg); dead = true; break; }
      }
    }
    if (dead) projectiles.splice(i, 1);
  }
}

// ============================================================================
//  ОБНОВЛЕНИЕ
// ============================================================================

// движение игрока с инерцией: разгон к точке и накат после отпускания газа
function updatePlayer(dt) {
  const cfg = CONFIG.PLAYER;
  let ax = 0, ay = 0;

  if (player.target) {
    const dx = player.target.x - player.x, dy = player.target.y - player.y;
    const d = Math.hypot(dx, dy);
    if (d <= cfg.arriveRadius) player.target = null;
    else { ax = dx / d; ay = dy / d; }
  }

  if (ax || ay) {
    player.vx += ax * cfg.accel * dt;
    player.vy += ay * cfg.accel * dt;
    const sp = Math.hypot(player.vx, player.vy);
    if (sp > cfg.speed) {
      player.vx = (player.vx / sp) * cfg.speed;
      player.vy = (player.vy / sp) * cfg.speed;
    }
  } else {
    const sp = Math.hypot(player.vx, player.vy);
    const drop = cfg.brake * dt;
    if (sp <= drop) { player.vx = 0; player.vy = 0; }
    else { player.vx -= (player.vx / sp) * drop; player.vy -= (player.vy / sp) * drop; }
  }

  const sp = Math.hypot(player.vx, player.vy);
  if (sp > 0.5) {
    player.facing = Math.atan2(player.vy, player.vx);
    // упёршись в стену, не тормозим в ноль, а скользим вдоль неё
    const normal = moveAndCollide(player, player.vx * dt, player.vy * dt, world.moveBlockers);
    if (normal) slideAlongWall(player, normal, cfg.wallFriction);
  }
}

function update(dt) {
  if (status !== 'play') return;

  lightTime += dt;
  updatePlayer(dt);
  pushTrail();

  const lit = lightRadius();
  // союзники бьют только по освещённому, а мину — ещё и только после обнаружения
  visibleEnemies = enemies.filter((e) => dist(player, e) <= lit && (e.type !== 'mine' || e.revealed));

  for (let i = 0; i < allies.length; i++) updateAlly(allies[i], dt, i);
  for (const d of downed) updateDowned(d, dt);
  for (const e of enemies.slice()) updateEnemy(e, dt);
  updateProjectiles(dt);
  applySpikes(dt);
  updateMines();

  for (let i = effects.length - 1; i >= 0; i--) {
    effects[i].life -= dt;
    if (effects[i].life <= 0) effects.splice(i, 1);
  }

  // мины добивать необязательно: достаточно перебить всё живое
  const livingEnemies = enemies.filter((e) => e.type !== 'mine').length;
  if (status === 'play' && livingEnemies === 0 && currentRoom() === CONFIG.ROOM_COUNT - 1) {
    status = 'win';
  }

  // камера
  const targetX = clamp(player.x - CONFIG.ROOM_W / 2, 0, world.width - CONFIG.ROOM_W);
  camera.x += (targetX - camera.x) * Math.min(1, CONFIG.CAMERA_LERP * dt);
}

// ============================================================================
//  ОТРИСОВКА
// ============================================================================

function visible(rect) {
  return rect.x + rect.w > camera.x - 40 && rect.x < camera.x + CONFIG.ROOM_W + 40;
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
  return type === 'crossbow' ? COLORS.crossbow : type === 'medic' ? COLORS.medic : COLORS.shotgun;
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

function drawMine(m) {
  ctx.strokeStyle = COLORS.mine;
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(m.x + Math.cos(a) * m.r * 0.7, m.y + Math.sin(a) * m.r * 0.7);
    ctx.lineTo(m.x + Math.cos(a) * m.r * 1.25, m.y + Math.sin(a) * m.r * 1.25);
    ctx.stroke();
  }
  ctx.fillStyle = COLORS.mine;
  ctx.beginPath();
  ctx.arc(m.x, m.y, m.r * 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0e0e10';
  ctx.beginPath();
  ctx.arc(m.x, m.y, m.r * 0.3, 0, Math.PI * 2);
  ctx.stroke();
  drawHpBar(m);
}

function drawEnemy(e) {
  if (e.type === 'mine') { drawMine(e); return; }
  if (e.type === 'tower') {
    ctx.fillStyle = COLORS.tower;
    ctx.fillRect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2);
    // рычаг катапульты, направленный на цель
    ctx.strokeStyle = '#0e0e10';
    ctx.lineWidth = 3;
    const f = e.facing || 0;
    ctx.beginPath();
    ctx.moveTo(e.x - Math.cos(f) * e.r * 0.6, e.y - Math.sin(f) * e.r * 0.6);
    ctx.lineTo(e.x + Math.cos(f) * e.r * 0.8, e.y + Math.sin(f) * e.r * 0.8);
    ctx.stroke();
    ctx.fillStyle = '#0e0e10';
    ctx.beginPath();
    ctx.arc(e.x + Math.cos(f) * e.r * 0.8, e.y + Math.sin(f) * e.r * 0.8, 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (e.type === 'bull') {
    const color = e.state === 'telegraph' ? '#ffe070' : COLORS.bull;
    drawUnitBody(e, color, true);
    ctx.strokeStyle = '#0e0e10';
    ctx.lineWidth = 3;
    const f = e.facing || 0;
    ctx.beginPath();
    ctx.moveTo(e.x + Math.cos(f + 0.6) * e.r * 0.5, e.y + Math.sin(f + 0.6) * e.r * 0.5);
    ctx.lineTo(e.x + Math.cos(f + 0.6) * e.r, e.y + Math.sin(f + 0.6) * e.r);
    ctx.moveTo(e.x + Math.cos(f - 0.6) * e.r * 0.5, e.y + Math.sin(f - 0.6) * e.r * 0.5);
    ctx.lineTo(e.x + Math.cos(f - 0.6) * e.r, e.y + Math.sin(f - 0.6) * e.r);
    ctx.stroke();
    if (e.state === 'telegraph') {
      ctx.strokeStyle = 'rgba(255,224,112,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x + Math.cos(f) * e.cfg.chargeMaxDist * 0.4, e.y + Math.sin(f) * e.cfg.chargeMaxDist * 0.4);
      ctx.stroke();
    }
  } else {
    drawUnitBody(e, COLORS.enemy, true);
    drawMark(e, 'crossbow');
  }
  drawHpBar(e);
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

function drawHud() {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = '13px monospace';
  ctx.textAlign = 'left';

  const room = currentRoom() + 1;
  // необнаруженные мины в счётчик не попадают, о них предупреждает только знак на полу
  const inRoom = enemies.filter((e) => e.room === currentRoom()
    && (e.type !== 'mine' || e.revealed)).length;
  ctx.fillStyle = '#c8c8d2';
  ctx.fillText(`КОМНАТА ${room}/${CONFIG.ROOM_COUNT}   ВРАГОВ ЗДЕСЬ: ${inRoom}   ЦЕПОЧКА: ${allies.length + 1}/${CONFIG.CHAIN.maxAllies + 1}`, 12, 22);

  let y = 44;
  ctx.fillStyle = COLORS.player;
  ctx.fillText(`ИГРОК  ${Math.max(0, Math.ceil(player.hp))}/${player.maxHp}`, 12, y);
  for (const a of allies) {
    y += 16;
    ctx.fillStyle = allyColor(a.type);
    ctx.fillText(`${a.cfg.name.padEnd(9, ' ')} ${Math.max(0, Math.ceil(a.hp))}/${a.maxHp}`, 12, y);
  }

  const pickup = nearestPickup();
  if (pickup && status === 'play') {
    ctx.fillStyle = '#f0f0f5';
    ctx.textAlign = 'center';
    const msg = allies.length >= CONFIG.CHAIN.maxAllies ? 'ЦЕПОЧКА ПОЛНАЯ'
      : pickup.kind === 'downed' ? 'ПРОБЕЛ — ПОДНЯТЬ' : 'ПРОБЕЛ — ПРИСОЕДИНИТЬ';
    ctx.fillText(msg, CONFIG.ROOM_W / 2, CONFIG.ROOM_H - 30);
  }

  if (status !== 'play') {
    ctx.fillStyle = 'rgba(10,10,12,0.75)';
    ctx.fillRect(0, CONFIG.ROOM_H / 2 - 50, CONFIG.ROOM_W, 100);
    ctx.textAlign = 'center';
    ctx.fillStyle = status === 'win' ? '#8ce27a' : '#e06060';
    ctx.font = '28px monospace';
    ctx.fillText(status === 'win' ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ', CONFIG.ROOM_W / 2, CONFIG.ROOM_H / 2);
    ctx.font = '14px monospace';
    ctx.fillStyle = '#c8c8d2';
    ctx.fillText('R — начать заново', CONFIG.ROOM_W / 2, CONFIG.ROOM_H / 2 + 28);
  }
  ctx.restore();
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0a0a0c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(-camera.x, -camera.y);

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

  // точка назначения
  if (player.target && status === 'play') {
    ctx.strokeStyle = 'rgba(99,210,255,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(player.target.x, player.target.y, 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  for (const n of neutrals) {
    if (!isLit(n)) continue;
    ctx.setLineDash([4, 4]);
    drawUnitBody(n, COLORS.neutral, false);
    ctx.setLineDash([]);
    drawMark(n, n.type);
    ctx.fillStyle = COLORS.neutral;
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(n.cfg.name, n.x, n.y + n.r + 14);
  }

  // выбитые из цепочки лежат и ждут, пока их подберут
  for (const d of downed) {
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

  for (const w of world.warnings) {
    if (Math.abs(w.x - camera.x - CONFIG.ROOM_W / 2) > CONFIG.ROOM_W) continue;
    drawWarning(w);
  }

  for (const e of enemies) {
    if (!isLit(e)) continue;
    if (e.type === 'mine' && !e.revealed) continue;
    drawEnemy(e);
  }

  for (let i = allies.length - 1; i >= 0; i--) {
    const a = allies[i];
    drawUnitBody(a, allyColor(a.type), true);
    drawMark(a, a.type);
    drawHpBar(a);
  }

  drawUnitBody(player, COLORS.player, true);
  drawMark(player, 'player');
  drawHpBar(player);

  for (const p of projectiles) {
    if (p.kind === 'mortar') { drawMortar(p); continue; }
    if (!isLit(p)) continue;
    ctx.fillStyle = p.team === 'ally' ? COLORS.allyShot : COLORS.enemyShot;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const fx of effects) {
    if (fx.type === 'beam') {
      ctx.strokeStyle = fx.color;
      ctx.globalAlpha = clamp(fx.life * 4, 0, 1);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(fx.x1, fx.y1);
      ctx.lineTo(fx.x2, fx.y2);
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

  drawLight();
  drawHud();
}

// темнота за пределами фонаря
function drawLight() {
  const r = lightRadius();
  const g = ctx.createRadialGradient(player.x, player.y, r * CONFIG.VISION.innerRatio,
    player.x, player.y, r);
  g.addColorStop(0, 'rgba(6,6,8,0)');
  g.addColorStop(1, `rgba(6,6,8,${CONFIG.VISION.darkness})`);
  ctx.fillStyle = g;
  ctx.fillRect(camera.x, camera.y, CONFIG.ROOM_W, CONFIG.ROOM_H);
}

// ============================================================================
//  ЦИКЛ
// ============================================================================

let lastTime = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

resetGame();
requestAnimationFrame(loop);
